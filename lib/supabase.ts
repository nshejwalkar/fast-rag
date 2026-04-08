import { SupabaseClient, createClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env vars are missing (URL and anon/service key required).");
  }

  cachedClient = createClient(supabaseUrl, supabaseKey);
  return cachedClient;
}
