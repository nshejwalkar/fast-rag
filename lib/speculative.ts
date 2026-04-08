import { embed } from "./embed.ts";
import { getSupabaseClient } from "./supabase.ts";
import {
  ENTITY_MAP,
  SPECULATIVE_CANDIDATE_K,
  SPECULATIVE_SIMILARITY_THRESHOLD,
} from "./constants.ts";

// In-memory state — fine for a single-server demo.
// Production equivalent: store in Redis keyed by session or tenant.
export type SpeculativeJob = {
  generation: number;
  partialQuery: string;
  embedding: number[];
  entities: string[];
  candidateChunkIds: string[];
  // Stored for rescoring against the final query embedding when reuse is validated.
  candidateEmbeddings: Map<string, number[]>;
  completedAt: number;
};

let latestJob: SpeculativeJob | null = null;
let currentGeneration = 0;


export function extractEntities(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [name, ticker] of Object.entries(ENTITY_MAP)) {
    if (lower.includes(name) || lower.includes(ticker.toLowerCase())) {
      found.add(ticker);
    }
  }
  return Array.from(found);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

export type SpeculativeReuseDebug = {
  similarity: number;
  threshold: number;
  missingEntities: string[];
  pass: boolean;
};

export function evaluateSpeculativeReuse(
  job: SpeculativeJob,
  finalEmbedding: number[],
  finalEntities: string[]
): SpeculativeReuseDebug {
  const similarity = cosineSimilarity(job.embedding, finalEmbedding);
  const missingEntities = job.entities.filter((entity) => !finalEntities.includes(entity));
  const pass =
    similarity >= SPECULATIVE_SIMILARITY_THRESHOLD && missingEntities.length === 0;

  return {
    similarity,
    threshold: SPECULATIVE_SIMILARITY_THRESHOLD,
    missingEntities,
    pass,
  };
}

// Returns true if the speculative job's candidate pool is safe to reuse for the final query.
// Two checks: embedding similarity >= 0.85, and speculative entities ⊆ final entities.
export function isReusable(
  job: SpeculativeJob,
  finalEmbedding: number[],
  finalEntities: string[]
): boolean {
  return evaluateSpeculativeReuse(job, finalEmbedding, finalEntities).pass;
}

// Re-sort the candidate pool by cosine similarity to the final query embedding,
// using the chunk embeddings stored on the job at speculative-retrieve time.
export function rescore(job: SpeculativeJob, finalEmbedding: number[]): string[] {
  return [...job.candidateChunkIds].sort((a, b) => {
    const simA = job.candidateEmbeddings.has(a)
      ? cosineSimilarity(finalEmbedding, job.candidateEmbeddings.get(a)!)
      : 0;
    const simB = job.candidateEmbeddings.has(b)
      ? cosineSimilarity(finalEmbedding, job.candidateEmbeddings.get(b)!)
      : 0;
    return simB - simA;
  });
}

export function getLatestJob(): SpeculativeJob | null {
  return latestJob;
}

// pgvector columns may arrive from Supabase REST as a JSON string "[0.1,…]" or as number[].
function parseVector(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed as number[];
    } catch {
      return null;
    }
  }
  return null;
}

// Embed the partial query, run match_chunks, and store the result in latestJob.
// Called from /api/speculative while the user is still typing.
export async function speculativeRetrieve(
  partialQuery: string,
  ticker?: string
): Promise<string[]> {
  const gen = ++currentGeneration;
  const embedding = await embed(partialQuery);
  const entities = extractEntities(partialQuery);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_count: SPECULATIVE_CANDIDATE_K,
    filter_ticker: ticker ?? null,
  });

  if (error || !data) return [];

  const rows = data as Array<Record<string, unknown>>;
  const candidateChunkIds = rows.map((r) => String(r.id)).filter(Boolean);
  if (candidateChunkIds.length === 0) return [];

  const job: SpeculativeJob = {
    generation: gen,
    partialQuery,
    embedding,
    entities,
    candidateChunkIds,
    candidateEmbeddings: new Map(),
    completedAt: Date.now(),
  };

  // Fetch stored embeddings so we can rescore against the final query embedding later.
  const { data: embRows } = await supabase
    .from("chunks")
    .select("id, embedding")
    .in("id", candidateChunkIds);

  if (embRows) {
    for (const row of embRows) {
      const vec = parseVector(row.embedding);
      if (vec) job.candidateEmbeddings.set(row.id, vec);
    }
  }

  // Only commit if no newer generation has started.
  if (gen === currentGeneration) {
    latestJob = job;
  }

  return candidateChunkIds;
}
