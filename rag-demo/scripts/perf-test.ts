/**
 * perf-test.ts — latency benchmark for the naive and optimized RAG paths.
 *
 * Requires a running dev server. Start it with `npm run dev`, then:
 *   node --experimental-strip-types scripts/perf-test.ts
 *
 * Optional env vars:
 *   BASE_URL=http://localhost:3000   (default)
 *   SUITE=naive-single|naive-multi|optimized-single|optimized-multi|all  (default: all)
 *   CONVO=1|2   (optional; limits multi-turn runs to one conversation)
 *
 * Optimized-path simulation:
 *   For each query we call /api/speculative with the first 55% of the query string
 *   (mimicking the user pausing mid-sentence), wait SPECULATIVE_SETTLE_MS for the
 *   server to finish populating latestJob, then call /api/chat in optimized mode.
 *   This replicates what the browser's debounced input handler does without any
 *   rendering overhead, giving clean API-level latency numbers.
 */

import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SUITE = process.env.SUITE ?? "all";
const CONVO = process.env.CONVO;

// How long to wait after the speculative call before submitting the full query.
// Mirrors the debounce window — the speculative route is synchronous so this
// just ensures latestJob is fully written before /api/chat reads it.
const SPECULATIVE_SETTLE_MS = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "naive" | "optimized";

type Query = {
  text: string;
  ticker?: string;
};

type Turn = Query & { label: string };

type Conversation = {
  name: string;
  turns: Turn[];
};

type RunResult = {
  label: string;
  ttftMs: number;
  totalMs: number;
  retrievalMs: number;
  chunkCount: number;
  retrievalPath: string;
  reuseDebug: {
    evidence: {
      similarity: number;
      threshold: number;
      missingEntities: string[];
      pass: boolean;
    } | null;
    speculative: {
      similarity: number;
      threshold: number;
      missingEntities: string[];
      pass: boolean;
    } | null;
  } | null;
};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

type ChatEvent =
  | {
      type: "meta";
      retrievalMs: number;
      chunkCount: number;
      retrievalPath: string;
      reuseDebug?: RunResult["reuseDebug"];
    }
  | { type: "token"; token: string }
  | { type: "done"; serverTotalMs: number }
  | { type: "error"; message: string };

async function runChat(query: Query, mode: Mode): Promise<RunResult> {
  const start = performance.now();
  let ttftMs = 0;
  let retrievalMs = 0;
  let chunkCount = 0;
  let retrievalPath = "unknown";
  let reuseDebug: RunResult["reuseDebug"] = null;
  let firstToken = true;

  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: query.text, ticker: query.ticker, mode }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`/api/chat returned HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);

      if (line) {
        const event = JSON.parse(line) as ChatEvent;
        if (event.type === "meta") {
          retrievalMs = event.retrievalMs;
          chunkCount = event.chunkCount;
          retrievalPath = event.retrievalPath ?? "unknown";
          reuseDebug = event.reuseDebug ?? null;
        }
        if (event.type === "token" && firstToken) {
          ttftMs = performance.now() - start;
          firstToken = false;
        }
        if (event.type === "error") throw new Error(event.message);
      }

      nl = buffer.indexOf("\n");
    }
  }

  return {
    label: query.text,
    ttftMs: Math.round(ttftMs),
    totalMs: Math.round(performance.now() - start),
    retrievalMs: Math.round(retrievalMs),
    chunkCount,
    retrievalPath,
    reuseDebug,
  };
}

// Fires /api/speculative with a partial query, waits for the job to settle,
// then calls /api/chat in optimized mode. Mirrors the browser debounce flow.
async function runOptimized(query: Query): Promise<RunResult> {
  const partial = query.text.slice(0, Math.floor(query.text.length * 0.55));

  const speculativeResponse = await fetch(`${BASE_URL}/api/speculative`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: partial, ticker: query.ticker }),
  });

  if (!speculativeResponse.ok) {
    throw new Error(`/api/speculative returned HTTP ${speculativeResponse.status}`);
  }

  await sleep(SPECULATIVE_SETTLE_MS);

  return runChat(query, "optimized");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Statistics ───────────────────────────────────────────────────────────────

type Stats = { avg: number; p50: number; p95: number; min: number; max: number };

function computeStats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.max(0, Math.floor(sorted.length * pct) - 1)];
  return {
    avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    p50: p(0.5),
    p95: p(0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

function fmtStats(label: string, s: Stats): string {
  return `${label.padEnd(7)} avg=${String(s.avg).padStart(5)}ms  p50=${String(s.p50).padStart(5)}ms  p95=${String(s.p95).padStart(5)}ms  min=${String(s.min).padStart(5)}ms  max=${String(s.max).padStart(5)}ms`;
}

// ─── Printing ─────────────────────────────────────────────────────────────────

const W = 90;
const LINE = "─".repeat(W);
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

function header(title: string) {
  console.log(`\n${BOLD}${CYAN}${"━".repeat(W)}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${title}${RESET}`);
  console.log(`${BOLD}${CYAN}${"━".repeat(W)}${RESET}\n`);
}

function pathColor(path: string): string {
  if (path.includes("evidence")) return GREEN;
  if (path.includes("speculative")) return YELLOW;
  return DIM;
}

function printResult(index: number, r: RunResult, showPath = false) {
  const q = r.label.length > 60 ? r.label.slice(0, 57) + "..." : r.label;
  const pathPart = showPath
    ? `  ${pathColor(r.retrievalPath)}[${r.retrievalPath}]${RESET}`
    : "";
  console.log(
    `  ${String(index).padStart(2)}.  TTFT=${String(r.ttftMs).padStart(5)}ms  Total=${String(r.totalMs).padStart(6)}ms  chunks=${r.chunkCount}${pathPart}`
  );
  console.log(`      ${DIM}"${q}"${RESET}`);
}

function printSummary(results: RunResult[]) {
  const ttfts = results.map((r) => r.ttftMs);
  const totals = results.map((r) => r.totalMs);
  console.log(`\n  ${LINE.slice(0, 70)}`);
  console.log(`  ${fmtStats("TTFT", computeStats(ttfts))}`);
  console.log(`  ${fmtStats("Total", computeStats(totals))}`);
}

function printTurn(index: number, turn: Turn, r: RunResult, showPath = false) {
  const pathPart = showPath
    ? `  ${pathColor(r.retrievalPath)}${r.retrievalPath}${RESET}`
    : "";
  console.log(
    `  Turn ${String(index).padStart(2)}  TTFT=${String(r.ttftMs).padStart(5)}ms  Total=${String(r.totalMs).padStart(6)}ms  chunks=${r.chunkCount}${pathPart}`
  );
  console.log(`          ${DIM}${turn.label}: "${turn.text.slice(0, 65)}${turn.text.length > 65 ? "..." : ""}"${RESET}`);
  if (showPath && r.reuseDebug) {
    const evidence = r.reuseDebug.evidence
      ? `ev(sim=${r.reuseDebug.evidence.similarity.toFixed(3)}/${r.reuseDebug.evidence.threshold.toFixed(2)}, miss=[${r.reuseDebug.evidence.missingEntities.join(",")}])`
      : "ev(n/a)";
    const speculative = r.reuseDebug.speculative
      ? `sp(sim=${r.reuseDebug.speculative.similarity.toFixed(3)}/${r.reuseDebug.speculative.threshold.toFixed(2)}, miss=[${r.reuseDebug.speculative.missingEntities.join(",")}])`
      : "sp(n/a)";
    console.log(`          ${DIM}${evidence}  ${speculative}${RESET}`);
  }
}

// ─── Test data ────────────────────────────────────────────────────────────────

// 15 independent single-turn queries across all 8 tickers and multiple doc types.
// Each is semantically distinct to avoid evidence-pack reuse between runs.
const SINGLE_TURN_QUERIES: Query[] = [
  { text: "What was Apple's gross margin in Q1 2025 and what drove the improvement?", ticker: "AAPL" },
  { text: "How did Microsoft's Azure growth rate change from Q1 2024 to Q3 2024?", ticker: "MSFT" },
  { text: "What is Tesla's automotive gross margin trend from 2024 to early 2025?", ticker: "TSLA" },
  { text: "How is NVIDIA affected by US export controls on advanced AI chips?", ticker: "NVDA" },
  { text: "How is Amazon monetizing AWS with generative AI workloads?", ticker: "AMZN" },
  { text: "What are JPMorgan's key risks in commercial real estate lending?", ticker: "JPM" },
  { text: "What is Apple's Services segment revenue and gross margin?", ticker: "AAPL" },
  { text: "How many Microsoft 365 Copilot enterprise seats have been deployed?", ticker: "MSFT" },
  { text: "What is Tesla's Megapack energy storage business performance?", ticker: "TSLA" },
  { text: "What risks does Alphabet face from the DOJ antitrust ruling on search?", ticker: "GOOGL" },
  { text: "How much has Meta invested in AI infrastructure and GPU procurement?", ticker: "META" },
  { text: "What is the NVIDIA Blackwell architecture and how does it compare to H100?", ticker: "NVDA" },
  { text: "What does JPMorgan's internal stress test show for a severe recession scenario?", ticker: "JPM" },
  { text: "How has Apple's Greater China revenue trended over recent quarters?", ticker: "AAPL" },
  { text: "What is Microsoft's capital expenditure plan for AI data center build-out?", ticker: "MSFT" },
];

// Two multi-turn conversations. Turns within each conversation are semantically
// related so the optimized path can demonstrate evidence reuse across turns.

const CONVERSATIONS: Conversation[] = [
  {
    // Designed to trigger evidence reuse: each turn is a direct follow-up on
    // the same earnings context and reuses prior-answer terminology. This
    // mirrors analyst workflow (iterative drill-down on one note) instead of
    // jumping between unrelated Apple subtopics.
    name: "Apple Q1 2025 Earnings — Follow-Up Chain (12 turns)",
    turns: [
      { label: "Headline",        text: "Summarize Apple's Q1 2025 headline results: revenue, EPS, and gross margin.", ticker: "AAPL" },
      { label: "Revenue delta",   text: "Using that same Q1 2025 summary, how much did revenue beat or miss analyst expectations?", ticker: "AAPL" },
      { label: "Revenue bridge",  text: "From the same Q1 2025 context, what were the top drivers of year-over-year revenue growth?", ticker: "AAPL" },
      { label: "Segment split",   text: "Still on Q1 2025, break that growth into iPhone versus Services contribution.", ticker: "AAPL" },
      { label: "Services follow", text: "On Services specifically in that same quarter, what growth rate and margin commentary were highlighted?", ticker: "AAPL" },
      { label: "Margin bridge",   text: "In the same Q1 2025 discussion, what explains the gross margin expansion versus last year?", ticker: "AAPL" },
      { label: "Cost inputs",     text: "For that margin bridge, call out mix, pricing, and cost-input factors management mentioned.", ticker: "AAPL" },
      { label: "Geo impact",      text: "Within the same quarter, how did Greater China affect the revenue and margin picture?", ticker: "AAPL" },
      { label: "Opex context",    text: "Keeping the same Q1 2025 evidence, how did opex trend relative to revenue growth?", ticker: "AAPL" },
      { label: "Operating margin",text: "From that same setup, what was the operating margin result and the key reason it moved?", ticker: "AAPL" },
      { label: "Capital return",  text: "Still in Q1 2025, what capital return actions (buybacks/dividends) were disclosed?", ticker: "AAPL" },
      { label: "Analyst wrap",    text: "Based only on those same Q1 2025 points, give a 3-bullet analyst takeaway on quality of earnings.", ticker: "AAPL" },
    ],
  },
  {
    name: "AI Infrastructure Cross-Company (15 turns)",
    turns: [
      { label: "MSFT capex",     text: "How much did Microsoft spend on AI infrastructure capex in fiscal 2024?", ticker: "MSFT" },
      { label: "MSFT Azure AI",  text: "What percentage of Azure growth is attributable to AI workloads?", ticker: "MSFT" },
      { label: "NVDA data ctr",  text: "What was NVIDIA's data center revenue in fiscal year 2024?", ticker: "NVDA" },
      { label: "NVDA Blackwell", text: "When will NVIDIA's Blackwell GPUs be available in volume and at what price?", ticker: "NVDA" },
      { label: "NVDA exports",   text: "How do US export controls affect NVIDIA's China revenue?", ticker: "NVDA" },
      { label: "AMZN Bedrock",   text: "How is Amazon using Bedrock and Anthropic to compete in AI cloud services?", ticker: "AMZN" },
      { label: "AMZN Trainium",  text: "What is Amazon's Trainium 2 chip and how does it support AWS?", ticker: "AMZN" },
      { label: "META GPU",       text: "How many NVIDIA H100 GPUs has Meta deployed and what are its AI infrastructure plans?", ticker: "META" },
      { label: "META Llama",     text: "Why did Meta release Llama 3 as open weights and what is the strategic rationale?", ticker: "META" },
      { label: "GOOGL TPU",      text: "How does Google Cloud compete on AI infrastructure with Azure and AWS?", ticker: "GOOGL" },
      { label: "GOOGL capex",    text: "What is Alphabet's capital expenditure plan for AI infrastructure in 2025?", ticker: "GOOGL" },
      { label: "MSFT security",  text: "What security incidents affected Microsoft in fiscal 2024 and what is the response?", ticker: "MSFT" },
      { label: "MSFT Copilot",   text: "How is Microsoft 365 Copilot adoption trending among enterprise customers?", ticker: "MSFT" },
      { label: "NVDA sovereign", text: "What is the sovereign AI demand driver for NVIDIA and which countries are investing?", ticker: "NVDA" },
      { label: "AMZN analyst",   text: "What does the internal analyst report say about AWS AI monetization potential?", ticker: "AMZN" },
    ],
  },
];

function getConversationsForRun(): Conversation[] {
  if (!CONVO) {
    return CONVERSATIONS;
  }

  const index = Number.parseInt(CONVO, 10);
  if (!Number.isInteger(index) || index < 1 || index > CONVERSATIONS.length) {
    throw new Error(
      `Invalid CONVO="${CONVO}". Use CONVO=1 or CONVO=2 (or unset CONVO for all).`
    );
  }

  return [CONVERSATIONS[index - 1]];
}

// ─── Suite runners ────────────────────────────────────────────────────────────

type SingleResults = { results: RunResult[] };
type MultiResults = { convoResults: Array<{ name: string; results: RunResult[] }> };

async function runNaiveSingle(): Promise<SingleResults> {
  header(`NAIVE — Single-Turn Queries (${SINGLE_TURN_QUERIES.length} queries)`);
  const results: RunResult[] = [];

  for (let i = 0; i < SINGLE_TURN_QUERIES.length; i++) {
    process.stdout.write(`  Running ${i + 1}/${SINGLE_TURN_QUERIES.length}...`);
    const r = await runChat(SINGLE_TURN_QUERIES[i], "naive");
    results.push(r);
    process.stdout.write("\r");
    printResult(i + 1, r, false);
  }

  printSummary(results);
  return { results };
}

async function runNaiveMulti(): Promise<MultiResults> {
  header("NAIVE — Multi-Turn Conversations");
  const convoResults: MultiResults["convoResults"] = [];
  const conversations = getConversationsForRun();

  for (const convo of conversations) {
    console.log(`  ${BOLD}${convo.name}${RESET}\n`);
    const results: RunResult[] = [];

    for (let i = 0; i < convo.turns.length; i++) {
      const turn = convo.turns[i];
      process.stdout.write(`    Turn ${i + 1}/${convo.turns.length}...`);
      const r = await runChat(turn, "naive");
      results.push(r);
      process.stdout.write("\r");
      printTurn(i + 1, turn, r, false);
    }

    const ttfts = results.map((r) => r.ttftMs);
    const totals = results.map((r) => r.totalMs);
    console.log(`\n  ${fmtStats("TTFT", computeStats(ttfts))}`);
    console.log(`  ${fmtStats("Total", computeStats(totals))}\n`);
    convoResults.push({ name: convo.name, results });
  }

  return { convoResults };
}

async function runOptimizedSingle(): Promise<SingleResults> {
  header(`OPTIMIZED — Single-Turn Queries (${SINGLE_TURN_QUERIES.length} queries)`);
  console.log(
    `  ${DIM}Each query is preceded by a speculative prefetch on the first 55% of the text,${RESET}`
  );
  console.log(`  ${DIM}then a ${SPECULATIVE_SETTLE_MS}ms settle window before the full query submits.${RESET}\n`);

  const results: RunResult[] = [];

  for (let i = 0; i < SINGLE_TURN_QUERIES.length; i++) {
    process.stdout.write(`  Running ${i + 1}/${SINGLE_TURN_QUERIES.length}...`);
    const r = await runOptimized(SINGLE_TURN_QUERIES[i]);
    results.push(r);
    process.stdout.write("\r");
    printResult(i + 1, r, true);
  }

  printSummary(results);

  const paths = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.retrievalPath] = (acc[r.retrievalPath] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n  ${DIM}Reuse path breakdown:${RESET}`);
  for (const [path, count] of Object.entries(paths)) {
    console.log(`    ${pathColor(path)}${path}${RESET}: ${count}/${results.length}`);
  }

  return { results };
}

async function runOptimizedMulti(): Promise<MultiResults> {
  header("OPTIMIZED — Multi-Turn Conversations");
  console.log(
    `  ${DIM}Every turn uses speculative prefetch, then optimized chat (which may reuse evidence).${RESET}\n`
  );

  const convoResults: MultiResults["convoResults"] = [];
  const conversations = getConversationsForRun();

  for (const convo of conversations) {
    console.log(`  ${BOLD}${convo.name}${RESET}\n`);
    const results: RunResult[] = [];

    for (let i = 0; i < convo.turns.length; i++) {
      const turn = convo.turns[i];
      process.stdout.write(`    Turn ${i + 1}/${convo.turns.length}...`);

      // Mirror real optimized UX: each submitted turn has a speculative warmup
      // from in-progress typing, then /api/chat chooses evidence/speculative/fallback.
      const r = await runOptimized(turn);
      results.push(r);
      process.stdout.write("\r");
      printTurn(i + 1, turn, r, true);
    }

    const ttfts = results.map((r) => r.ttftMs);
    const totals = results.map((r) => r.totalMs);
    console.log(`\n  ${fmtStats("TTFT", computeStats(ttfts))}`);
    console.log(`  ${fmtStats("Total", computeStats(totals))}`);

    const paths = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.retrievalPath] = (acc[r.retrievalPath] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`\n  ${DIM}Reuse paths: ${Object.entries(paths).map(([p, n]) => `${p}×${n}`).join("  ")}${RESET}\n`);
    convoResults.push({ name: convo.name, results });
  }

  return { convoResults };
}

// ─── Final summary ────────────────────────────────────────────────────────────

function fmtStatLine(label: string, s: Stats): string {
  return `  ${label.padEnd(7)} avg=${String(s.avg).padStart(5)}ms  p50=${String(s.p50).padStart(5)}ms  p95=${String(s.p95).padStart(5)}ms  min=${String(s.min).padStart(5)}ms  max=${String(s.max).padStart(5)}ms`;
}

function printFinal(
  naiveSingle: SingleResults | null,
  naiveMulti: MultiResults | null,
  optSingle: SingleResults | null,
  optMulti: MultiResults | null,
) {
  console.log(`\n${BOLD}FINAL${RESET}`);

  if (naiveSingle) {
    const ttfts = naiveSingle.results.map((r) => r.ttftMs);
    const totals = naiveSingle.results.map((r) => r.totalMs);
    console.log(`naive single turn`);
    console.log(fmtStatLine("TTFT", computeStats(ttfts)));
    console.log(fmtStatLine("Total", computeStats(totals)));
  }

  if (optSingle) {
    const ttfts = optSingle.results.map((r) => r.ttftMs);
    const totals = optSingle.results.map((r) => r.totalMs);
    const paths = optSingle.results.reduce<Record<string, number>>((acc, r) => {
      acc[r.retrievalPath] = (acc[r.retrievalPath] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`optimized single turn`);
    console.log(fmtStatLine("TTFT", computeStats(ttfts)));
    console.log(fmtStatLine("Total", computeStats(totals)));
    console.log();
    console.log(`  Reuse path breakdown:`);
    for (const [path, count] of Object.entries(paths)) {
      console.log(`    ${path}: ${count}/${optSingle.results.length}`);
    }
  }

  const naiveConvos = naiveMulti?.convoResults ?? [];
  const optConvos = optMulti?.convoResults ?? [];
  const convoCount = Math.max(naiveConvos.length, optConvos.length);

  for (let i = 0; i < convoCount; i++) {
    console.log();
    console.log(`conversation ${i + 1}:`);

    const naive = naiveConvos[i];
    if (naive) {
      const ttfts = naive.results.map((r) => r.ttftMs);
      const totals = naive.results.map((r) => r.totalMs);
      console.log(`naive multi turn:`);
      console.log(fmtStatLine("TTFT", computeStats(ttfts)));
      console.log(fmtStatLine("Total", computeStats(totals)));
    }

    const opt = optConvos[i];
    if (opt) {
      const ttfts = opt.results.map((r) => r.ttftMs);
      const totals = opt.results.map((r) => r.totalMs);
      const paths = opt.results.reduce<Record<string, number>>((acc, r) => {
        acc[r.retrievalPath] = (acc[r.retrievalPath] ?? 0) + 1;
        return acc;
      }, {});
      console.log(`optimized multi turn:`);
      console.log(fmtStatLine("TTFT", computeStats(ttfts)));
      console.log(fmtStatLine("Total", computeStats(totals)));
      console.log();
      console.log(`  Reuse paths: ${Object.entries(paths).map(([p, n]) => `${p}×${n}`).join("  ")}`);
    }
  }

  console.log();
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${BOLD}Financial RAG — Latency Benchmark${RESET}`);
  console.log(`${DIM}Server: ${BASE_URL}  |  Suite: ${SUITE}${RESET}`);

  // Verify the server is reachable before starting
  try {
    const probe = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "ping" }),
    });
    // 400 (missing query validation) is fine — it means the server is up
    if (probe.status !== 200 && probe.status !== 400) {
      throw new Error(`Unexpected status ${probe.status}`);
    }
  } catch {
    console.error(`\n  ✗ Cannot reach ${BASE_URL}. Is \`npm run dev\` running?\n`);
    process.exit(1);
  }

  const should = (name: string) => SUITE === "all" || SUITE === name;

  const naiveSingle  = should("naive-single")     ? await runNaiveSingle()     : null;
  const naiveMulti   = should("naive-multi")       ? await runNaiveMulti()      : null;
  const optSingle    = should("optimized-single")  ? await runOptimizedSingle() : null;
  const optMulti     = should("optimized-multi")   ? await runOptimizedMulti()  : null;

  printFinal(naiveSingle, naiveMulti, optSingle, optMulti);

  console.log(`${DIM}Done.${RESET}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
