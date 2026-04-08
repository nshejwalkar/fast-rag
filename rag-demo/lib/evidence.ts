// In-memory evidence pack — fine for a single-server demo.
// Production equivalent: store in Redis keyed by session or tenant.
export type EvidencePack = {
  embedding: number[];
  entities: string[];
  chunkIds: string[];
  createdAt: number;
};

let lastEvidencePack: EvidencePack | null = null;

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

// Returns true if the cached evidence pack covers the new query well enough to skip retrieval.
// Threshold is 0.9 (stricter than speculative reuse) because we're reusing exact chunks.
// Entity check: every entity in the new query must have been present in the prior query.
export function canReuseEvidence(
  pack: EvidencePack,
  queryEmbedding: number[],
  queryEntities: string[]
): boolean {
  if (cosineSimilarity(pack.embedding, queryEmbedding) < 0.9) return false;
  for (const entity of queryEntities) {
    if (!pack.entities.includes(entity)) return false;
  }
  return true;
}

export function storeEvidencePack(pack: EvidencePack): void {
  lastEvidencePack = pack;
}

export function getLastEvidencePack(): EvidencePack | null {
  return lastEvidencePack;
}
