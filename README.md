# Speculative RAG Chatbot

The biggest bottleneck constraining the time to first token in most RAG systems
for chatbots or agents is definitely the prefill stage, especially for long contexts. 

For large financial firms, however, the bottleneck is more skewed. Retrieval in RAG in this setting is especially expensive compared to most others, for two main reasons. 
1. First, financial companies deal with gigantic volumes of data: financial reports are long and complex, and companies must keep many records for logging and auditing purposes, among other reasons.
2. Second, RAG systems need to deal with especially complex metadata filtering. Metadata for financial documents might include region, sensitivity, compliance info, temporal constraints - all of which might be not at the document level, but more fine-grained because of specific redactions or permissions. This latter point, especially, is what breaks the nice properties of ANN algorithms during regular RAG retrieval.
Because of these two observations on financial RAG pipelines specifically, the filtering and retrieval (before prefill even occurs) take up a nontrivial portion of TTFT.

My solution for this was to make the process more interactive using an idea called speculative retrieval. As the user types the query into the chat interface, the system intermittently triggers background jobs to embed the current partial query and asynchronously start the filtering and retrieval process. The process finishes in the background and stores the candidate chunks for that partial query. Later processes overwrite earlier ones, since only the most recent partial query is relevant. When the user finally submits the full query, it goes through a series of checks to see how much of the process can be bypassed:
1. We first check the last turn’s embedded query vector. If the questions/prompts are similar enough, we can simply keep the chunks from the last turn’s retrieval.
2. Then, we check the embedded query vector of the last speculative job that completed while the user was typing. Again, if the two are similar enough, simply load in the pre-retrieved chunks.
3. If neither, it is likely that the user typed very quickly or the meaning suddenly shifted, in which case the full filtering and retrieval process is performed for correctness.

I created a demo with a chat interface to demonstrate the difference in interactivity between the naive version and the optimized path with speculative retrieval and prefix caching. I created around 40 fake financial documents, chunked and embedded them with OpenAI embeddings, and served the LLM responses through Claude Haiku 4.5 (using Anthropic’s prefix caching API for the optimized path). I then tested the system on different types of conversations: first, on single turn, cold start prompts, and second, on longer (12-15 turns), multi-turn conversations. For the latter, one conversation aimed to have subsequent queries follow closely in context behind each other, similar to how a real analyst might prompt for info and reasoning. The other aimed to be more adversarial and jump around to different contexts.

Looking at the results, the optimized system yields consistently lower TTFTs for the single turn tests, resulting in a faster, more interactive experience. For the multi turn conversations, the optimizations result in much better average and p95 TTFTs, which is a stronger guarantee especially for latency-sensitive workflows. Full results are below and can be rerun with the perf script.


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
