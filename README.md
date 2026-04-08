# Financial RAG Baseline Demo

Pacific internship submission demo: a clean, explicit, naive financial RAG pipeline with TTFT-first instrumentation.

## Stack

- Next.js App Router + TypeScript
- Supabase (Postgres + pgvector + `match_chunks` RPC)
- Anthropic Claude Haiku for streaming answer generation
- No LangChain or framework abstractions

## Required Environment Variables (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
```

Optional for real embeddings:

```bash
OPENAI_API_KEY=...
```

`OPENAI_API_KEY` is required. The app and seeding script will fail fast if embeddings are unavailable.

## Run

```bash
npm install
npm run dev
```

## Seed Fake Financial Data

```bash
npm run seed
```

This inserts 5 fake docs / 10 chunks across `AAPL`, `MSFT`, and `TSLA`, with mixed metadata:
`doc_type`, `quarter`, `access_scope`.

## What’s Instrumented

- Client-side TTFT (`request send` -> `first streamed token`)
- Client-side total response time
- Retrieved chunk count
- Retrieval-stage latency (server-side)
- Retrieved chunk debug panel (title + metadata + snippet)

## Modules

- `lib/embed.ts`
- `lib/retrieve.ts`
- `lib/buildContext.ts`
- `lib/llm.ts`
- `app/api/chat/route.ts`

The retrieval call site in `app/api/chat/route.ts` includes a TODO marker for the future speculative retrieval optimization hook.
