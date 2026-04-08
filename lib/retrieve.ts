import { getSupabaseClient } from "./supabase.ts";
import { embed } from "./embed.ts";
import { RETRIEVAL_TOP_K } from "./constants.ts";

export type RetrievedChunk = {
  id: string;
  doc_id?: string;
  text: string;
  title?: string;
  doc_type?: string;
  company?: string;
  ticker?: string;
  quarter?: string;
  access_scope?: string;
  similarity?: number;
};

export async function retrieve(
  query: string,
  ticker?: string
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embed(query);
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: RETRIEVAL_TOP_K,
    filter_ticker: ticker ?? null,
  });

  if (error) {
    throw new Error(`Supabase RPC match_chunks failed: ${error.message}`);
  }

  const rpcRows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ""),
    text: String(row.text ?? ""),
    similarity:
      typeof row.similarity === "number" ? row.similarity : Number(row.similarity ?? 0),
  })).filter((row) => row.id.length > 0);

  if (rpcRows.length === 0) {
    return [];
  }

  const chunkIds = rpcRows.map((row) => row.id);
  const { data: chunkRows, error: chunksError } = await supabase
    .from("chunks")
    .select("id, doc_id, text, company, ticker, quarter, access_scope")
    .in("id", chunkIds);

  if (chunksError) {
    throw new Error(`Failed to fetch chunk metadata: ${chunksError.message}`);
  }

  const chunkById = new Map<string, (typeof chunkRows)[number]>();
  for (const row of chunkRows ?? []) {
    chunkById.set(row.id, row);
  }

  const docIds = Array.from(
    new Set((chunkRows ?? []).map((row) => row.doc_id).filter((value) => value != null))
  ) as string[];

  let docById = new Map<string, { id: string; title: string | null; doc_type: string | null }>();
  if (docIds.length > 0) {
    const { data: docRows, error: docsError } = await supabase
      .from("documents")
      .select("id, title, doc_type")
      .in("id", docIds);

    if (docsError) {
      throw new Error(`Failed to fetch document metadata: ${docsError.message}`);
    }

    docById = new Map((docRows ?? []).map((row) => [row.id, row]));
  }

  return rpcRows.map((row) => {
    const chunk = chunkById.get(row.id);
    const doc = chunk?.doc_id ? docById.get(chunk.doc_id) : undefined;

    return {
      id: row.id,
      doc_id: chunk?.doc_id ?? undefined,
      text: chunk?.text ?? row.text,
      title: doc?.title ?? undefined,
      doc_type: doc?.doc_type ?? undefined,
      company: chunk?.company ?? undefined,
      ticker: chunk?.ticker ?? undefined,
      quarter: chunk?.quarter ?? undefined,
      access_scope: chunk?.access_scope ?? undefined,
      similarity: row.similarity,
    };
  });
}

// Fetch full chunk data for a known list of IDs.
// Used by the optimized path to hydrate chunks from the speculative job or evidence pack
// without running a new similarity search.
export async function fetchChunksByIds(ids: string[]): Promise<RetrievedChunk[]> {
  if (ids.length === 0) return [];

  const supabase = getSupabaseClient();
  const { data: chunkRows, error: chunksError } = await supabase
    .from("chunks")
    .select("id, doc_id, text, company, ticker, quarter, access_scope")
    .in("id", ids);

  if (chunksError) {
    throw new Error(`Failed to fetch chunks by ID: ${chunksError.message}`);
  }

  if (!chunkRows || chunkRows.length === 0) return [];

  const docIds = Array.from(
    new Set(chunkRows.map((row) => row.doc_id).filter((v) => v != null))
  ) as string[];

  let docById = new Map<string, { id: string; title: string | null; doc_type: string | null }>();
  if (docIds.length > 0) {
    const { data: docRows, error: docsError } = await supabase
      .from("documents")
      .select("id, title, doc_type")
      .in("id", docIds);

    if (docsError) {
      throw new Error(`Failed to fetch document metadata: ${docsError.message}`);
    }

    docById = new Map((docRows ?? []).map((row) => [row.id, row]));
  }

  // Preserve the caller-supplied order (important for stable context assembly).
  const chunkById = new Map(chunkRows.map((row) => [row.id, row]));
  return ids
    .filter((id) => chunkById.has(id))
    .map((id) => {
      const chunk = chunkById.get(id)!;
      const doc = chunk.doc_id ? docById.get(chunk.doc_id) : undefined;
      return {
        id,
        doc_id: chunk.doc_id ?? undefined,
        text: chunk.text,
        title: doc?.title ?? undefined,
        doc_type: doc?.doc_type ?? undefined,
        company: chunk.company ?? undefined,
        ticker: chunk.ticker ?? undefined,
        quarter: chunk.quarter ?? undefined,
        access_scope: chunk.access_scope ?? undefined,
      };
    });
}
