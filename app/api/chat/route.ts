import { buildContext } from "@/lib/buildContext";
import { RETRIEVAL_TOP_K, SNIPPET_MAX_LENGTH } from "@/lib/constants";
import {
  evaluateEvidenceReuse,
  getLastEvidencePack,
  storeEvidencePack,
  type EvidenceReuseDebug,
} from "@/lib/evidence";
import { streamAnswer } from "@/lib/llm";
import { fetchChunksByIds, retrieve, type RetrievedChunk } from "@/lib/retrieve";
import { embed } from "@/lib/embed";
import {
  extractEntities,
  getLatestJob,
  rescore,
  evaluateSpeculativeReuse,
  type SpeculativeReuseDebug,
} from "@/lib/speculative";

type ChatRequest = {
  query?: string;
  ticker?: string;
  mode?: "naive" | "optimized";
};

function toSnippet(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= SNIPPET_MAX_LENGTH ? trimmed : `${trimmed.slice(0, SNIPPET_MAX_LENGTH)}...`;
}

export async function POST(req: Request) {
  const requestStart = Date.now();
  const body = (await req.json()) as ChatRequest;

  const query = body.query?.trim();
  if (!query) {
    return new Response(JSON.stringify({ error: "Query is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const mode = body.mode ?? "naive";
  const ticker = body.ticker?.trim() || undefined;

  const retrievalStart = Date.now();
  let retrievalPath = "retrieval fallback triggered";
  let chunks: RetrievedChunk[];
  let evidenceDebug: EvidenceReuseDebug | null = null;
  let speculativeDebug: SpeculativeReuseDebug | null = null;

  if (mode === "optimized") {
    // Embed once — reused for both evidence and speculative similarity checks.
    const queryEmbedding = await embed(query);
    const queryEntities = extractEntities(query);

    // Decision tree (optimized path):
    //   1. Try evidence pack reuse (same chunks as previous turn, threshold from constants.ts)
    //   2. Try speculative job reuse (warmed while user was typing, threshold from constants.ts)
    //   3. Fall back to full retrieval

    const evidencePack = getLastEvidencePack();
    if (evidencePack) {
      evidenceDebug = evaluateEvidenceReuse(evidencePack, queryEmbedding, queryEntities);
    }

    if (evidencePack && evidenceDebug?.pass) {
      retrievalPath = "evidence reuse hit";
      chunks = await fetchChunksByIds(evidencePack.chunkIds);
    } else {
      const job = getLatestJob();
      if (job) {
        speculativeDebug = evaluateSpeculativeReuse(job, queryEmbedding, queryEntities);
      }

      if (job && speculativeDebug?.pass) {
        retrievalPath = "speculative reuse hit";
        // Rescore the candidate pool against the final embedding and take top 5.
        const rescored = rescore(job, queryEmbedding);
        chunks = await fetchChunksByIds(rescored.slice(0, RETRIEVAL_TOP_K));
        console.log(`[chat] speculative job generation=${job.generation}`);
      } else {
        // TODO: speculative retrieval hook
        // In the fully warmed optimized path this branch is rare — it fires only when the
        // final query diverges enough from the partial query that the speculative job is
        // not reusable. In production, a new speculative call would be triggered here
        // immediately to warm the next turn.
        chunks = await retrieve(query, ticker);
      }
    }

    // Store evidence pack so the next turn can potentially skip retrieval entirely.
    storeEvidencePack({
      embedding: queryEmbedding,
      entities: queryEntities,
      chunkIds: chunks.map((c) => c.id),
      createdAt: Date.now(),
    });
  } else {
    // Naive path: always retrieve from scratch.
    // TODO: speculative retrieval hook
    // Later, this retrieval stage should be fed by a background prefetch kicked off
    // while the user is still typing.
    chunks = await retrieve(query, ticker);
  }

  const retrievalMs = Date.now() - retrievalStart;
  console.log(
    `[chat] mode=${mode} path="${retrievalPath}" chunks=${chunks.length} retrievalMs=${retrievalMs}ms`
  );
  if (mode === "optimized") {
    const evidencePart = evidenceDebug
      ? `evidence(sim=${evidenceDebug.similarity.toFixed(3)} th=${evidenceDebug.threshold.toFixed(2)} missing=[${evidenceDebug.missingEntities.join(",")}])`
      : "evidence(n/a)";
    const speculativePart = speculativeDebug
      ? `spec(sim=${speculativeDebug.similarity.toFixed(3)} th=${speculativeDebug.threshold.toFixed(2)} missing=[${speculativeDebug.missingEntities.join(",")}])`
      : "spec(n/a)";
    console.log(`[chat] reuse-debug ${evidencePart} ${speculativePart}`);
  }

  const context = buildContext(chunks);
  const { tokenStream, modelUsed } = await streamAnswer(context, query);

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const push = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      push({
        type: "meta",
        mode,
        modelUsed,
        retrievalMs,
        retrievalPath,
        reuseDebug:
          mode === "optimized"
            ? {
                evidence: evidenceDebug
                  ? {
                      similarity: Number(evidenceDebug.similarity.toFixed(4)),
                      threshold: evidenceDebug.threshold,
                      missingEntities: evidenceDebug.missingEntities,
                      pass: evidenceDebug.pass,
                    }
                  : null,
                speculative: speculativeDebug
                  ? {
                      similarity: Number(speculativeDebug.similarity.toFixed(4)),
                      threshold: speculativeDebug.threshold,
                      missingEntities: speculativeDebug.missingEntities,
                      pass: speculativeDebug.pass,
                    }
                  : null,
              }
            : null,
        chunkCount: chunks.length,
        chunks: chunks.map((chunk, index) => ({
          rank: index + 1,
          title: chunk.title ?? `${chunk.ticker ?? "UNK"} ${chunk.doc_type ?? "document"}`,
          ticker: chunk.ticker ?? "unknown",
          quarter: chunk.quarter ?? "unknown",
          docType: chunk.doc_type ?? "unknown",
          accessScope: chunk.access_scope ?? "unknown",
          snippet: toSnippet(chunk.text),
        })),
      });

      let ttftMs: number | null = null;
      try {
        for await (const token of tokenStream) {
          if (ttftMs === null) {
            ttftMs = Date.now() - requestStart;
          }
          push({ type: "token", token });
        }

        console.log(
          `[chat] TTFT=${ttftMs ?? "n/a"}ms total=${Date.now() - requestStart}ms`
        );

        push({ type: "done", serverTotalMs: Date.now() - requestStart });
      } catch (error) {
        push({
          type: "error",
          message: error instanceof Error ? error.message : "Streaming failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
