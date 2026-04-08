import { getLatestJob, speculativeRetrieve } from "@/lib/speculative";

type SpeculativeRequest = {
  query?: string;
  ticker?: string;
};

// Receives a partial query typed by the user, runs lightweight retrieval,
// and stores the result in latestJob for potential reuse by /api/chat.
// Returns chunk IDs only — never fetches chunk text or calls the LLM.
export async function POST(req: Request) {
  const body = (await req.json()) as SpeculativeRequest;
  const query = body.query?.trim();

  if (!query) {
    return new Response(JSON.stringify({ error: "Query is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ticker = body.ticker?.trim() || undefined;
  const chunkIds = await speculativeRetrieve(query, ticker);
  const job = getLatestJob();

  return new Response(
    JSON.stringify({ ok: true, chunkIds, generation: job?.generation ?? null }),
    { headers: { "Content-Type": "application/json" } }
  );
}
