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

## Final Benchmark Results

All numbers below are from the final full-suite run (`naive` vs `optimized`).

### Single-turn (15 queries)

| Mode | TTFT avg | TTFT p50 | TTFT p95 | TTFT min | TTFT max | Total avg | Total p50 | Total p95 | Total min | Total max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Naive | 2230ms | 1585ms | 4350ms | 1337ms | 5306ms | 3443ms | 2795ms | 5715ms | 2132ms | 6854ms |
| Optimized | 1689ms | 1266ms | 3323ms | 1044ms | 3368ms | 2830ms | 2742ms | 4134ms | 1524ms | 4723ms |

Optimized reuse paths (single-turn): `speculative reuse hit 15/15`.

### Conversation 1 (Apple Q1 2025 follow-up chain)

| Mode | TTFT avg | TTFT p50 | TTFT p95 | TTFT min | TTFT max | Total avg | Total p50 | Total p95 | Total min | Total max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Naive | 1899ms | 1381ms | 1778ms | 1138ms | 6830ms | 2905ms | 2462ms | 3026ms | 1764ms | 8158ms |
| Optimized | 1458ms | 1466ms | 1624ms | 1054ms | 1864ms | 2393ms | 2305ms | 3013ms | 1695ms | 3391ms |

Optimized reuse paths (conversation 1): `speculative reuse hit x6`, `evidence reuse hit x3`, `retrieval fallback triggered x3`.

### Conversation 2 (AI infrastructure cross-company)

| Mode | TTFT avg | TTFT p50 | TTFT p95 | TTFT min | TTFT max | Total avg | Total p50 | Total p95 | Total min | Total max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Naive | 1946ms | 1362ms | 2464ms | 1281ms | 6590ms | 2915ms | 2484ms | 3717ms | 1514ms | 7525ms |
| Optimized | 1422ms | 1405ms | 1700ms | 1026ms | 1794ms | 2469ms | 2490ms | 2842ms | 1432ms | 3638ms |

Optimized reuse paths (conversation 2): `speculative reuse hit x12`, `evidence reuse hit x1`, `retrieval fallback triggered x2`.