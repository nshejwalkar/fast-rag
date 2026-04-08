import { buildContext } from "@/lib/buildContext";
import { canReuseEvidence, getLastEvidencePack, storeEvidencePack } from "@/lib/evidence";
import { streamAnswer } from "@/lib/llm";
import { fetchChunksByIds, retrieve, type RetrievedChunk } from "@/lib/retrieve";
import { embed } from "@/lib/embed";
import { extractEntities, getLatestJob, isReusable, rescore } from "@/lib/speculative";

type ChatRequest = {
  query?: string;
  ticker?: string;
  mode?: "naive" | "optimized";
};

function toSnippet(text: string, maxLength = 180): string {
  const trimmed = text.trim();
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, maxLength)}...`;
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

  if (mode === "optimized") {
    // Embed once — reused for both evidence and speculative similarity checks.
    const queryEmbedding = await embed(query);
    const queryEntities = extractEntities(query);

    // Decision tree (optimized path):
    //   1. Try evidence pack reuse (same chunks as previous turn, threshold 0.9)
    //   2. Try speculative job reuse (warmed while user was typing, threshold 0.85)
    //   3. Fall back to full retrieval

    const evidencePack = getLastEvidencePack();
    if (evidencePack && canReuseEvidence(evidencePack, queryEmbedding, queryEntities)) {
      retrievalPath = "evidence reuse hit";
      chunks = await fetchChunksByIds(evidencePack.chunkIds);
    } else {
      const job = getLatestJob();
      if (job && isReusable(job, queryEmbedding, queryEntities)) {
        retrievalPath = "speculative reuse hit";
        // Rescore the candidate pool against the final embedding and take top 5.
        const rescored = rescore(job, queryEmbedding);
        chunks = await fetchChunksByIds(rescored.slice(0, 5));
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
