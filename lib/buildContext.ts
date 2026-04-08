import type { RetrievedChunk } from "./retrieve.ts";

// Fixed system prompt — defined as a module-level constant, never constructed dynamically.
// This is the stable prefix that Anthropic's API-level cache can reliably hit.
const SYSTEM_PROMPT = [
  "You are a financial research assistant.",
  "Use only the provided snippets when answering.",
  "",
  "Knowledge snippets:",
].join("\n");

// Assembles context for the LLM prompt.
//
// Ordering rule: chunks are sorted by ID ascending, NOT by retrieval score.
// This makes the context string byte-for-byte identical across requests that
// retrieve the same set of chunks, which is required for prefix cache hits.
// No metadata is interpolated beyond chunk text — keeps the context stable.
export function buildContext(chunks: RetrievedChunk[]): string {
  const sorted = [...chunks].sort((a, b) => a.id.localeCompare(b.id));

  const snippets = sorted
    .map((chunk, index) => {
      const label = chunk.title ?? `Snippet ${index + 1}`;
      return `[${index + 1}] ${label}\n${chunk.text.trim()}`;
    })
    .join("\n\n");

  return `${SYSTEM_PROMPT}\n\n${snippets}`;
}
