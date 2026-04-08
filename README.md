# Financial RAG Baseline Demo

A clean, explicit financial RAG pipeline with TTFT-first instrumentation.

## Stack

- Next.js App Router + TypeScript
- Supabase (Postgres + pgvector + `match_chunks` RPC)
- Anthropic Claude Haiku for streaming answer generation

## Required Environment Variables (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

## Run

```bash
npm install
npm run dev
```

## Seed Fake Financial Data

```bash
npm run seed
```
inserts 30+ fake documents / 100+ chunks across several companies, with mixed metadata:
`doc_type`, `quarter`, `access_scope`.

## Benchmark Naive vs Optimized
```bash
npm run perf
```
runs all of the performance tests. For both implementations, we run these tests:
1. single prompt response (15 different prompts)
2. multi turn conversation (2 conversations)
   - conversation 1 is written to stay within similar context
   - conversation 2 is written to be more adversarial, jumping around unrelated questions

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
