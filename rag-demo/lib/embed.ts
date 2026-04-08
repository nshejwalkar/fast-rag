const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const FALLBACK_VECTOR_SIZE = 1536;

function deterministicEmbedding(text: string, dimensions: number): number[] {
  const output = new Array<number>(dimensions).fill(0);
  const normalized = text.trim().toLowerCase();

  for (let i = 0; i < normalized.length; i += 1) {
    const charCode = normalized.charCodeAt(i);
    const index = (charCode * 31 + i * 17) % dimensions;
    output[index] += ((charCode % 23) - 11) / 11;
  }

  let norm = 0;
  for (const value of output) {
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;

  return output.map((value) => value / norm);
}

export async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Fallback keeps local demos runnable without extra credentials.
    return deterministicEmbedding(text, FALLBACK_VECTOR_SIZE);
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  const embedding = payload.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Embedding response did not include a vector.");
  }

  return embedding;
}
