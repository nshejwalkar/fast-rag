import { OPENAI_EMBEDDING_MODEL } from "./constants.ts";

export async function embed(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local and re-run `npm run seed` to regenerate embeddings."
    );
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
