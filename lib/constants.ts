// ─── Embedding ────────────────────────────────────────────────────────────────

// OpenAI model used to embed queries and chunks.
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

// ─── Retrieval ────────────────────────────────────────────────────────────────

// Number of candidate chunks returned by match_chunks in the naive path and
// as the final top-K after speculative rescoring in the optimized path.
export const RETRIEVAL_TOP_K = 5;

// Wider candidate pool fetched during speculative retrieval.
// Larger than RETRIEVAL_TOP_K so the rescoring step has room to reorder results
// when the final query differs slightly from the partial query used to prefetch.
export const SPECULATIVE_CANDIDATE_K = 10;

// ─── Speculative retrieval ────────────────────────────────────────────────────

// Milliseconds of typing pause before a speculative retrieval request fires.
// Shorter → warmer cache, more API calls; longer → fewer calls, colder cache.
export const SPECULATIVE_DEBOUNCE_MS = 300;

// Minimum cosine similarity between the speculative embedding and the final
// query embedding required to reuse the speculative candidate pool.
// Below this threshold the queries are considered too different and full
// retrieval runs instead.
export const SPECULATIVE_SIMILARITY_THRESHOLD = 0.7;

// ─── Evidence pack reuse ──────────────────────────────────────────────────────

// Minimum cosine similarity between the previous turn's embedding and the
// current query embedding required to skip retrieval entirely and reuse the
// same chunks. Stricter than SPECULATIVE_SIMILARITY_THRESHOLD because we are
// reusing exact chunks rather than rescoring a wider candidate pool.
export const EVIDENCE_SIMILARITY_THRESHOLD = 0.62;

// ─── Snippet truncation ───────────────────────────────────────────────────────

// Maximum character length of chunk text snippets sent to the client in the
// meta event. Keeps the debug panel readable without transmitting full chunk text.
export const SNIPPET_MAX_LENGTH = 180;

// ─── LLM ──────────────────────────────────────────────────────────────────────

// Maximum tokens in the model's completion. Kept low for demo latency.
export const LLM_MAX_TOKENS = 500;

// Candidate models tried in order. The first model that responds without a
// 404 is used. Allows graceful fallback if a model ID is unavailable on the
// account's tier.
export const LLM_CANDIDATE_MODELS = [
  "claude-3-5-haiku-latest",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
] as const;

// Anthropic beta flag required to enable the cache_control field on content
// blocks. Without this header the field is silently ignored.
export const ANTHROPIC_PROMPT_CACHING_BETA = "prompt-caching-2024-07-31" as const;

// ─── Entity detection ─────────────────────────────────────────────────────────

// Naive dictionary for mapping company names to tickers.
// Case-insensitive substring match — intentionally simple for the demo.
// Production replacement: an NER model or a financial entity index.
export const ENTITY_MAP: Record<string, string> = {
  apple: "AAPL",
  tesla: "TSLA",
  microsoft: "MSFT",
  amazon: "AMZN",
  nvidia: "NVDA",
  google: "GOOGL",
  alphabet: "GOOGL",
  meta: "META",
  facebook: "META",
  jpmorgan: "JPM",
  "jp morgan": "JPM",
};
