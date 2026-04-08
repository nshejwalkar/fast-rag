"use client";

import { FormEvent, useRef, useState } from "react";

type Mode = "naive" | "optimized";

type DebugChunk = {
  rank: number;
  title: string;
  ticker: string;
  quarter: string;
  docType: string;
  accessScope: string;
  snippet: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type Metrics = {
  ttftMs: number | null;
  totalMs: number | null;
  chunkCount: number;
  retrievalMs: number | null;
  retrievalPath: string | null;
};

const INITIAL_METRICS: Metrics = {
  ttftMs: null,
  totalMs: null,
  chunkCount: 0,
  retrievalMs: null,
  retrievalPath: null,
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [ticker, setTicker] = useState("");
  const [mode, setMode] = useState<Mode>("naive");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [debugChunks, setDebugChunks] = useState<DebugChunk[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Debounce timer for speculative retrieval (optimized mode only).
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onQueryChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = event.target.value;
    setQuery(val);

    if (mode !== "optimized") return;

    // Fire a speculative retrieval request 300ms after the user stops typing.
    // The server stores the result in latestJob so /api/chat can reuse it on submit.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = val.trim();
      if (!trimmed) return;
      fetch("/api/speculative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, ticker: ticker || undefined }),
      }).catch(() => {
        // Fire and forget — failures are non-fatal; chat will fall back to full retrieval.
      });
    }, 300);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;

    // Cancel any pending speculative call.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    setError(null);
    setIsLoading(true);
    setMetrics(INITIAL_METRICS);
    setDebugChunks([]);

    const userMessage: ChatMessage = { role: "user", text: trimmed };
    const assistantMessage: ChatMessage = { role: "assistant", text: "" };
    const requestStart = performance.now();
    let firstTokenSeen = false;

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, ticker: ticker || undefined, mode }),
      });

      if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(errorText || "Request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nextBreak = buffer.indexOf("\n");
        while (nextBreak !== -1) {
          const line = buffer.slice(0, nextBreak).trim();
          buffer = buffer.slice(nextBreak + 1);

          if (line) {
            const eventPayload = JSON.parse(line) as
              | { type: "meta"; chunkCount: number; retrievalMs: number; retrievalPath: string; chunks: DebugChunk[] }
              | { type: "token"; token: string }
              | { type: "done" }
              | { type: "error"; message: string };

            if (eventPayload.type === "meta") {
              setMetrics((prev) => ({
                ...prev,
                retrievalMs: eventPayload.retrievalMs,
                chunkCount: eventPayload.chunkCount,
                retrievalPath: eventPayload.retrievalPath,
              }));
              setDebugChunks(eventPayload.chunks);
            }

            if (eventPayload.type === "token") {
              if (!firstTokenSeen) {
                firstTokenSeen = true;
                setMetrics((prev) => ({
                  ...prev,
                  ttftMs: performance.now() - requestStart,
                }));
              }
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, text: `${last.text}${eventPayload.token}` };
                }
                return copy;
              });
            }

            if (eventPayload.type === "done") {
              setMetrics((prev) => ({ ...prev, totalMs: performance.now() - requestStart }));
            }

            if (eventPayload.type === "error") {
              setError(eventPayload.message);
            }
          }

          nextBreak = buffer.indexOf("\n");
        }
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown error");
      setMessages((prev) => prev.filter((_, idx) => idx !== prev.length - 1));
    } finally {
      setIsLoading(false);
      setQuery("");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Financial RAG — Speculative Retrieval Demo</h1>
        <p className="text-sm text-zinc-600">
          Compare naive vs. optimized retrieval. Optimized mode fires speculative retrieval as you
          type and reuses evidence across turns.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <form onSubmit={onSubmit} className="grid gap-3">
          <textarea
            value={query}
            onChange={onQueryChange}
            rows={3}
            placeholder="Ask a financial question..."
            className="w-full rounded border border-zinc-300 p-3"
            disabled={isLoading}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              value={ticker}
              onChange={(event) => setTicker(event.target.value.toUpperCase())}
              placeholder="Ticker filter (optional)"
              className="rounded border border-zinc-300 p-2"
              disabled={isLoading}
            />
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as Mode)}
              className="rounded border border-zinc-300 p-2"
              disabled={isLoading}
            >
              <option value="naive">naive</option>
              <option value="optimized">optimized</option>
            </select>
            <button
              type="submit"
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? "Streaming..." : "Send"}
            </button>
          </div>
        </form>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">TTFT</h2>
          <p className="text-2xl font-bold">
            {metrics.ttftMs === null ? "--" : `${metrics.ttftMs.toFixed(1)} ms`}
          </p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Total Response</h2>
          <p className="text-2xl font-bold">
            {metrics.totalMs === null ? "--" : `${metrics.totalMs.toFixed(1)} ms`}
          </p>
        </article>
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Retrieved Chunks</h2>
          <p className="text-2xl font-bold">{metrics.chunkCount}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Retrieval: {metrics.retrievalMs === null ? "--" : `${metrics.retrievalMs} ms`}
          </p>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">Chat</h2>
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-zinc-500">No messages yet.</p>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className="rounded border border-zinc-200 p-3 text-sm"
              >
                <p className="mb-1 font-semibold">{message.role}</p>
                <p className="whitespace-pre-wrap">{message.text}</p>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </article>

        <article className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold">Debug: Retrieved Chunks</h2>
          {metrics.retrievalPath && (
            <p className="mb-3 rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-700">
              {metrics.retrievalPath}
            </p>
          )}
          <div className="space-y-2 text-sm">
            {debugChunks.length === 0 && (
              <p className="text-zinc-500">No retrieved chunks yet.</p>
            )}
            {debugChunks.map((chunk) => (
              <div key={`${chunk.rank}-${chunk.title}`} className="rounded border border-zinc-200 p-3">
                <p className="font-semibold">
                  {chunk.rank}. {chunk.title}
                </p>
                <p className="text-xs text-zinc-500">
                  {chunk.ticker} · {chunk.quarter} · {chunk.docType} · {chunk.accessScope}
                </p>
                <p className="mt-1">{chunk.snippet}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
