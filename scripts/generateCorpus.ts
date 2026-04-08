import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const companies = [
    { name: "Apple", ticker: "AAPL" },
    { name: "Tesla", ticker: "TSLA" },
    { name: "Amazon", ticker: "AMZN" }
];

async function embed(text: string) {
    const res = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
    });
    return res.data[0].embedding;
}

async function main() {
    for (const company of companies) {
        const { data: doc } = await supabase
            .from("documents")
            .insert({
                title: `${company.name} Q3 Earnings`,
                doc_type: "earnings",
                company: company.name,
                ticker: company.ticker,
                quarter: "Q3_2023",
                access_scope: "public"
            })
            .select()
            .single();

        const chunks = [
            `${company.name} reported revenue growth driven by services and hardware.`,
            `The ${company.name} ${company.ticker} earnings showed strong YoY performance.`,
            `Segment breakdown includes cloud, devices, and subscriptions.`,
            `Operating margin improved compared to last quarter.`,
            `Risks include macroeconomic slowdown and supply chain issues.`
        ];

        for (const text of chunks) {
            const embedding = await embed(text);

            await supabase.from("chunks").insert({
                doc_id: doc.id,
                text,
                embedding,
                company: company.name,
                ticker: company.ticker,
                quarter: "Q3_2023",
                access_scope: "public"
            });
        }
    }
}

main();
