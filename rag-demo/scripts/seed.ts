import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/embed.ts";

type SeedChunk = {
  text: string;
  quarter: string;
  access_scope: "public" | "internal";
};

type SeedDocument = {
  title: string;
  doc_type: "10-K" | "earnings_call";
  company: string;
  ticker: "AAPL" | "MSFT" | "TSLA";
  quarter: string;
  access_scope: "public" | "internal";
  chunks: SeedChunk[];
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function loadEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.resolve(cwd, ".env.local"));
  loadEnvFile(path.resolve(cwd, ".env"));
}

const documents: SeedDocument[] = [
  {
    title: "Apple FY2025 Q4 Earnings Call Highlights",
    doc_type: "earnings_call",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q4_2025",
    access_scope: "public",
    chunks: [
      {
        text: "AAPL reported stronger iPhone upgrade cycles and continued services revenue expansion in FY2025 Q4.",
        quarter: "Q4_2025",
        access_scope: "public",
      },
      {
        text: "Management emphasized margin resilience despite component pricing volatility and foreign exchange pressure.",
        quarter: "Q4_2025",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Apple FY2025 10-K Risk Discussion",
    doc_type: "10-K",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q4_2025",
    access_scope: "internal",
    chunks: [
      {
        text: "Internal risk review flags concentration in premium device demand and potential regulatory exposure in app marketplace policies.",
        quarter: "Q4_2025",
        access_scope: "internal",
      },
      {
        text: "Supply chain dependency analysis highlights single-region manufacturing risks and logistics disruptions.",
        quarter: "Q4_2025",
        access_scope: "internal",
      },
    ],
  },
  {
    title: "Microsoft FY2025 Q3 Earnings Call Summary",
    doc_type: "earnings_call",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q3_2025",
    access_scope: "public",
    chunks: [
      {
        text: "MSFT cloud revenue growth was driven by enterprise AI workloads and continued Azure consumption gains.",
        quarter: "Q3_2025",
        access_scope: "public",
      },
      {
        text: "The company pointed to healthy operating leverage from productivity software renewals and platform bundling.",
        quarter: "Q3_2025",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Microsoft FY2025 10-K Compliance Notes",
    doc_type: "10-K",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q4_2025",
    access_scope: "internal",
    chunks: [
      {
        text: "Internal compliance notes discuss antitrust monitoring in multiple jurisdictions and contractual obligations for regulated customers.",
        quarter: "Q4_2025",
        access_scope: "internal",
      },
      {
        text: "Security posture commentary includes increased capex for data center hardening and zero trust controls.",
        quarter: "Q4_2025",
        access_scope: "internal",
      },
    ],
  },
  {
    title: "Tesla FY2025 Q2 Earnings Call Excerpts",
    doc_type: "earnings_call",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q2_2025",
    access_scope: "public",
    chunks: [
      {
        text: "TSLA discussed automotive gross margin pressure and reiterated plans for lower-cost platform production timing.",
        quarter: "Q2_2025",
        access_scope: "public",
      },
      {
        text: "Energy storage deployments offset part of vehicle margin compression during the quarter.",
        quarter: "Q2_2025",
        access_scope: "public",
      },
    ],
  },
];

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_KEY)."
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const tickers = [...new Set(documents.map((doc) => doc.ticker))];
  const { data: existingDocs, error: fetchDocsError } = await supabase
    .from("documents")
    .select("id")
    .in("ticker", tickers);

  if (fetchDocsError) {
    throw new Error(`Failed to fetch existing documents: ${fetchDocsError.message}`);
  }

  const existingDocIds = (existingDocs ?? []).map((row) => row.id);
  if (existingDocIds.length > 0) {
    const { error: deleteChunksError } = await supabase
      .from("chunks")
      .delete()
      .in("doc_id", existingDocIds);

    if (deleteChunksError) {
      throw new Error(`Failed to clear existing chunks: ${deleteChunksError.message}`);
    }

    const { error: deleteDocsError } = await supabase
      .from("documents")
      .delete()
      .in("id", existingDocIds);

    if (deleteDocsError) {
      throw new Error(`Failed to clear existing documents: ${deleteDocsError.message}`);
    }
  }

  for (const document of documents) {
    const { data: insertedDoc, error: insertDocError } = await supabase
      .from("documents")
      .insert({
        title: document.title,
        doc_type: document.doc_type,
        company: document.company,
        ticker: document.ticker,
        quarter: document.quarter,
        access_scope: document.access_scope,
      })
      .select("id")
      .single();

    if (insertDocError || !insertedDoc) {
      throw new Error(`Failed to insert document ${document.title}: ${insertDocError?.message}`);
    }

    for (const chunk of document.chunks) {
      const embedding = await embed(chunk.text);

      const { error: insertChunkError } = await supabase.from("chunks").insert({
        doc_id: insertedDoc.id,
        text: chunk.text,
        embedding,
        company: document.company,
        ticker: document.ticker,
        quarter: chunk.quarter,
        access_scope: chunk.access_scope,
      });

      if (insertChunkError) {
        throw new Error(
          `Failed to insert chunk for ${document.title}: ${insertChunkError.message}`
        );
      }
    }
  }

  console.log("Seed complete. Inserted 5 documents and 10 chunks.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
