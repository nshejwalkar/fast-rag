import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/embed.ts";

type Ticker = "AAPL" | "MSFT" | "TSLA" | "AMZN" | "NVDA" | "GOOGL" | "META" | "JPM";
type DocType = "10-K" | "10-Q" | "earnings_call" | "analyst_report" | "8-K" | "proxy_statement";
type AccessScope = "public" | "internal" | "restricted";
type Quarter =
  | "Q1_2024" | "Q2_2024" | "Q3_2024" | "Q4_2024"
  | "Q1_2025" | "Q2_2025" | "Q3_2025" | "Q4_2025";

type SeedChunk = {
  text: string;
  quarter: Quarter;
  access_scope: AccessScope;
};

type SeedDocument = {
  title: string;
  doc_type: DocType;
  company: string;
  ticker: Ticker;
  quarter: Quarter;
  access_scope: AccessScope;
  chunks: SeedChunk[];
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    value = value.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.resolve(cwd, ".env.local"));
  loadEnvFile(path.resolve(cwd, ".env"));
}

// ─── Corpus ────────────────────────────────────────────────────────────────
// 38 documents across 8 tickers, 6 doc types, 8 quarters, 3 access scopes.
// Chunks are paragraph-length to give the retrieval model more signal to work
// with and to make the difference between naive and speculative retrieval
// more pronounced during the demo.

const documents: SeedDocument[] = [
  // ── Apple ──────────────────────────────────────────────────────────────
  {
    title: "Apple Q1 2024 Earnings Call",
    doc_type: "earnings_call",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q1_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Apple reported first-quarter fiscal 2024 revenue of $119.6 billion, down 1 percent year over year, with iPhone revenue reaching $69.7 billion. Services revenue set a new all-time record at $23.1 billion, driven by the App Store, Apple Music, Apple TV+, and iCloud subscriptions. Tim Cook highlighted record customer satisfaction scores for iPhone 15 and strong demand in emerging markets including India and Brazil.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Gross margin came in at 45.9 percent for the quarter, slightly above guidance, benefiting from a favorable services mix and easing memory component costs. Operating expenses were $14.5 billion, reflecting continued investment in R&D particularly in silicon and machine learning infrastructure. Management noted that currency headwinds reduced revenue by approximately 200 basis points versus the prior year.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "The company returned over $27 billion to shareholders in the December quarter through share repurchases and dividends. The board declared a cash dividend of $0.24 per share. Apple ended the quarter with $162 billion in cash and marketable securities net of debt, maintaining its target of reaching net cash neutral over time through buybacks.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Installed base of active devices surpassed 2.2 billion globally, an all-time high, providing a growing foundation for Services cross-sell. Wearables, Home, and Accessories revenue was $11.95 billion. Mac revenue declined 1 percent to $7.78 billion amid a soft PC market, while iPad revenue fell 25 percent to $7 billion due to product cycle timing ahead of anticipated refreshes.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Apple Q2 2024 10-Q — Revenue and Segment Analysis",
    doc_type: "10-Q",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q2_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Net sales for the three months ended March 30, 2024 were $90.8 billion, a decrease of 4 percent compared to $94.8 billion in the same period a year ago. Products revenue was $66.9 billion and Services revenue was $23.9 billion. The Americas segment contributed $37.3 billion, Europe $24.1 billion, Greater China $16.4 billion, Japan $6.2 billion, and Rest of Asia Pacific $6.8 billion.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "Research and development expense increased to $7.9 billion from $7.5 billion in the prior year period, reflecting ongoing investment in next-generation silicon, augmented reality, and on-device machine learning capabilities. Selling, general, and administrative expense was $6.5 billion. The effective tax rate for the quarter was 24.1 percent, impacted by the recognition of excess tax benefits related to share-based compensation.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "The company repurchased $23.5 billion of common stock and paid dividends of $3.8 billion during the quarter. Long-term debt stood at $96.3 billion with a weighted-average interest rate of 2.85 percent. The company's commercial paper program balance was $5 billion. Capital expenditures totaled $2.3 billion, primarily for retail store buildouts and data center expansion supporting Apple Intelligence infrastructure.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "iPhone revenue declined to $45.9 billion from $51.3 billion, reflecting product cycle maturation and intense competition in Greater China from domestic Android manufacturers. Macintosh revenue improved to $7.5 billion, aided by the M3 refresh cycle across Pro and Max configurations. iPad revenue was $5.6 billion. Services gross margin expanded to 74.6 percent from 70.9 percent in the year-ago period.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Apple Q3 2024 Earnings Call — Apple Intelligence Preview",
    doc_type: "earnings_call",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q3_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Apple reported Q3 fiscal 2024 revenue of $85.8 billion, up 5 percent year over year, beating analyst consensus. Tim Cook highlighted the preview of Apple Intelligence at WWDC as a landmark moment, describing it as deeply personal AI that is private by design and uses Private Cloud Compute for larger model requests. The integration across iOS 18, iPadOS 18, and macOS Sequoia was described as the biggest software leap in the company's history.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "Services revenue reached $24.2 billion, a new all-time record, with double-digit growth across the App Store, advertising, and financial services verticals. Luca Maestri noted that the paid subscriptions ecosystem crossed 1.05 billion accounts globally. Gross margin for the quarter was 46.3 percent, reflecting continued mix improvement toward high-margin software and licensing revenue.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "iPhone revenue was $39.3 billion, modestly above expectations given the seasonal trough and the anticipated product refresh cycle. The upgrade pipeline for iPhone 16 was described as building, particularly among enterprise customers interested in on-device AI capabilities. Mac revenue was $7 billion and iPad revenue was $7.2 billion, the latter boosted by the new iPad Pro with M4 chip.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "Greater China revenue rebounded to $14.7 billion from $15.8 billion a year prior, with Cook noting stabilization in competitive dynamics and a return to growth in urban tier-one markets. Management declined to provide unit sell-through data but cited strong trade-in momentum. The Vision Pro, available only in the United States, was not a material revenue contributor but was characterized as strategically important for the spatial computing platform roadmap.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Apple FY2024 10-K — Risk Factors and Competitive Landscape",
    doc_type: "10-K",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Apple's business is subject to risks related to global macroeconomic conditions, including inflation, interest rates, currency fluctuations, and slowing consumer spending, which can adversely affect demand for Apple products and services. The company's concentration of revenue from iPhone represents a significant risk; a sustained decline in smartphone upgrade rates or a shift in consumer preferences toward competing platforms could materially impact results. Apple's reliance on a limited number of outsourcing partners, primarily in Asia, exposes it to geopolitical risk, labor disruptions, and pandemic-related supply chain fragility.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "The regulatory environment has intensified significantly across Apple's core markets. The European Union's Digital Markets Act designates Apple as a gatekeeper, requiring it to allow alternative browser engines and third-party app distribution in the EU. The United States Department of Justice filed an antitrust lawsuit alleging monopolization of the smartphone market. These proceedings create uncertainty regarding the future structure of Apple's App Store business model, developer revenue share policies, and interoperability requirements.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Apple's total net sales for fiscal year 2024 were $391.0 billion, up 2 percent from $383.3 billion in fiscal 2023. Products revenue was $295.5 billion and Services revenue was $96.2 billion, representing Services' largest-ever contribution to total revenue at 24.6 percent. The company generated operating cash flow of $118.3 billion and returned $110.2 billion to shareholders. Research and development expense was $31.4 billion, or approximately 8 percent of net sales.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Capital expenditures for fiscal 2024 were $9.1 billion, primarily related to data center construction in Europe, Asia, and the United States, in support of Apple Intelligence private cloud infrastructure. The company maintained its investment-grade credit rating and issued $7 billion of term debt in November 2024 at blended rates near 4.6 percent. Net cash position (cash and marketable securities net of total debt) was approximately $59 billion at fiscal year end.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Apple FY2024 10-K — Internal Supply Chain Risk Review",
    doc_type: "10-K",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q4_2024",
    access_scope: "internal",
    chunks: [
      {
        text: "Internal analysis of the supply chain for fiscal 2024 identifies TSMC as the sole provider of Apple's leading-edge chips including the A-series and M-series processors. Any disruption to TSMC's fabs in Taiwan, whether from natural disaster, geopolitical escalation, or production yield issues, would have an outsized impact on Apple's ability to ship iPhone, Mac, and iPad on planned timelines. Contingency sourcing discussions with Samsung Foundry for legacy node production have not progressed to binding agreements.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
      {
        text: "Foxconn's Zhengzhou campus, which accounts for approximately 50 percent of global iPhone final assembly capacity, remains a concentration risk. The site experienced workforce disruptions in Q4 2022 that reduced iPhone Pro shipments by an estimated $6 billion in that quarter. While a second major Foxconn campus in Chengdu provides partial redundancy, capacity there is predominantly allocated to iPad and Mac assembly rather than high-volume iPhone Pro production.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
      {
        text: "India manufacturing expansion through Tata Electronics in Tamil Nadu and Pegatron in Hosur is progressing ahead of schedule, with capacity expected to reach 20-25 percent of total iPhone production by end of fiscal 2025. However, quality yield rates at Indian facilities for Pro-tier components remain below Taiwan and China benchmarks, creating a risk of margin compression if India ramp accelerates faster than quality infrastructure can support.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
    ],
  },
  {
    title: "Apple Q1 2025 Earnings Call",
    doc_type: "earnings_call",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q1_2025",
    access_scope: "public",
    chunks: [
      {
        text: "Apple reported record first-quarter revenue of $124.3 billion, up 4 percent year over year, driven by iPhone 16 demand and record Services revenue of $26.3 billion. Tim Cook emphasized that Apple Intelligence drove a significant acceleration in iPhone 16 upgrade rates in markets where the feature launched. The install base of active devices reached a new all-time high across all major product categories.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
      {
        text: "Gross margin reached 46.9 percent, the highest in over a decade, reflecting a favorable revenue mix shift toward Services and software. Operating income was $44.0 billion, representing a 35.4 percent operating margin. Luca Maestri noted that the combination of operating leverage and share repurchases drove earnings per share of $2.40, up 10 percent year over year, ahead of consensus estimates of $2.35.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
      {
        text: "Greater China revenue grew 11 percent to $21.0 billion, ending a streak of several quarters of declining China revenue. Cook attributed the improvement to Apple Intelligence features localized for Mandarin users and strong trade-in program uptake in Tier 1 cities. Japan grew 9 percent despite currency headwinds, reflecting pricing adjustments and corporate refresh cycles.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Apple Q2 2025 Analyst Report — Margin Trajectory",
    doc_type: "analyst_report",
    company: "Apple",
    ticker: "AAPL",
    quarter: "Q2_2025",
    access_scope: "internal",
    chunks: [
      {
        text: "Our analysis of Apple's gross margin trajectory suggests the company is in a structurally higher margin regime than 2021-2023, driven by three factors: Services mix approaching 27 percent of total revenue; on-device AI monetization through premium Apple Intelligence tier expected in fiscal 2026; and NAND and DRAM input cost normalization following the memory glut. We model fiscal 2025 gross margin at 47.2 percent versus the Street at 46.5 percent.",
        quarter: "Q2_2025",
        access_scope: "internal",
      },
      {
        text: "The key risk to our margin thesis is the potential for Apple to lower iPhone ASPs to defend market share in Greater China against Huawei's re-emergence with advanced domestic chips. A 5 percent reduction in China iPhone ASP would reduce blended gross margin by approximately 40 basis points. We estimate China represents 18-20 percent of iPhone unit volumes, with Pro mix lower than in developed markets, limiting the downside from this scenario.",
        quarter: "Q2_2025",
        access_scope: "internal",
      },
      {
        text: "Services margin has expanded from 70.5 percent in fiscal 2022 to an estimated 75.8 percent in fiscal 2025, reflecting operating leverage on fixed infrastructure costs as subscription revenue scales. The App Store, which we estimate contributes approximately 40 percent of Services revenue, benefits from minimal incremental cost of revenue as developer transactions grow. Advertising within the App Store and Apple News represents the highest-margin incremental revenue stream, estimated at 85-90 percent gross margin.",
        quarter: "Q2_2025",
        access_scope: "internal",
      },
    ],
  },

  // ── Microsoft ───────────────────────────────────────────────────────────
  {
    title: "Microsoft Q1 2024 Earnings Call — Azure and Copilot",
    doc_type: "earnings_call",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q1_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Microsoft reported first-quarter fiscal 2024 revenue of $56.5 billion, up 13 percent year over year. The Intelligent Cloud segment, anchored by Azure and server products, grew 19 percent to $24.3 billion. Satya Nadella emphasized that Azure's AI services revenue was growing faster than the total Azure rate, driven by enterprise adoption of Azure OpenAI Service and Microsoft Copilot integrations across the productivity suite.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "The Productivity and Business Processes segment, which includes Office 365 Commercial, LinkedIn, and Dynamics 365, grew 13 percent to $18.6 billion. Microsoft 365 Commercial cloud revenue grew 18 percent. Copilot for Microsoft 365 reached general availability and was adopted by more than 40 percent of Fortune 100 companies within the first quarter following launch. LinkedIn revenue grew 8 percent, with Talent Solutions showing resilience despite a softer global hiring environment.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Operating income grew 25 percent to $26.9 billion, reflecting strong operating leverage as cloud infrastructure utilization rates improved. Operating margin expanded to 47.6 percent. Capital expenditures were $11.2 billion, primarily for data center construction and AI accelerator procurement to meet Azure demand. Amy Hood guided for Q2 revenue between $60.4 billion and $61.4 billion, implying continued double-digit growth.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "More Personal Computing revenue, which includes Windows, Xbox, and Surface, was $13.7 billion, up 3 percent. Search and news advertising revenue excluding traffic acquisition costs grew 10 percent, reflecting Bing's integration of AI-powered answers. Xbox content and services grew 2 percent. The pending Activision Blizzard integration contributed approximately $900 million to gaming revenue in the first full quarter of ownership.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Microsoft Q3 2024 Earnings Call",
    doc_type: "earnings_call",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q3_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Microsoft reported Q3 fiscal 2024 revenue of $61.9 billion, up 17 percent year over year, exceeding consensus by approximately $800 million. Azure and other cloud services grew 31 percent in constant currency, accelerating from 28 percent in the prior quarter. Satya Nadella stated that AI contributed 7 percentage points to Azure growth, marking the first time management quantified AI's direct contribution to the hyperscaler segment.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "Copilot for Microsoft 365 seat count doubled sequentially in the March quarter. Amy Hood noted strong pipeline conversion as enterprise customers moved from pilot to production deployments. The average deal size for enterprise AI agreements exceeded $10 million annually for large-cap accounts. GitHub Copilot reached 1.8 million paid subscribers, a 35 percent sequential increase, with strong adoption among enterprise software teams.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "Capital expenditures reached $14.0 billion, the highest quarterly level in company history, driven by GPU cluster build-out and data center land acquisition across North America, Europe, and Asia. Management indicated that capex would remain elevated through fiscal 2025 as demand for AI compute continues to outpace current supply. The company has commitments with NVIDIA, AMD, and custom silicon vendors (Maia) to diversify AI accelerator supply.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Microsoft FY2024 10-K — Cloud Infrastructure and AI Strategy",
    doc_type: "10-K",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Microsoft's fiscal year 2024 revenue was $245.1 billion, up 16 percent from $211.9 billion in fiscal 2023. Operating income grew 24 percent to $109.4 billion, with an operating margin of 44.6 percent. The Intelligent Cloud segment was the largest revenue contributor at $107.0 billion, followed by Productivity and Business Processes at $77.7 billion and More Personal Computing at $60.3 billion.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Azure's installed infrastructure footprint expanded to 60 regions globally during fiscal 2024, with new regions opening in Mexico City, New Zealand, and Taiwan. The company invested $55.7 billion in capital expenditures during the fiscal year, of which approximately 60 percent was allocated to AI-related infrastructure including GPU servers, liquid cooling systems, and high-bandwidth network interconnects. Depreciation on these assets is recognized over useful lives of 4 to 6 years for servers and 20 to 40 years for buildings.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Research and development expense was $29.5 billion for fiscal 2024, up 12 percent. Key investment areas include foundational model research in partnership with OpenAI, quantum computing through Azure Quantum, and security through Microsoft Sentinel and Defender for Cloud. The company employed approximately 228,000 full-time employees at fiscal year end, a slight reduction from 221,000 following workforce restructuring actions taken in January 2024.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Microsoft faces antitrust scrutiny in multiple jurisdictions. The European Commission launched a preliminary investigation into Microsoft's bundling of Teams with Office 365 following a complaint from Slack. The UK Competition and Markets Authority is reviewing Microsoft's 49 percent economic interest in OpenAI. In the United States, the FTC is monitoring AI partnerships for potential anticompetitive effects. These proceedings could require product unbundling, licensing changes, or structural remedies.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Microsoft FY2024 10-K — Internal Compliance and Security Review",
    doc_type: "10-K",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q4_2024",
    access_scope: "internal",
    chunks: [
      {
        text: "The Microsoft Security Response Center tracked 2,847 vulnerability disclosures across Microsoft products in fiscal 2024, of which 34 were classified as Critical and exploited in the wild before patch availability. The Midnight Blizzard nation-state actor accessed senior executive email accounts in Q2 fiscal 2024 via a password spray attack on a legacy non-production OAuth application. This breach triggered a comprehensive Secure Future Initiative with projected annual incremental spend of $4 billion in security hardening.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
      {
        text: "Azure's FISMA High and FedRAMP authorization footprint covers 147 services as of fiscal year end. The Government and Public Sector business unit accounts for approximately $18 billion in annualized run-rate revenue, with the Department of Defense JEDI replacement contract (JWCC) now in production deployment phase across all four cloud providers. Internal security reviews identified gaps in privileged identity management across hybrid Azure-on-premises environments at several large government accounts.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
      {
        text: "Data residency commitments for EU customers under the EU Data Boundary program require that all processing of customer data within Microsoft 365 and Azure occur within EU infrastructure nodes. Compliance validation as of June 2024 shows 98.7 percent of EU customer workloads meet this requirement. The remaining 1.3 percent involves legacy diagnostic telemetry pipelines that are scheduled for remediation by Q2 fiscal 2025.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
    ],
  },
  {
    title: "Microsoft Q1 2025 Earnings Call",
    doc_type: "earnings_call",
    company: "Microsoft",
    ticker: "MSFT",
    quarter: "Q1_2025",
    access_scope: "public",
    chunks: [
      {
        text: "Microsoft reported first-quarter fiscal 2025 revenue of $65.6 billion, up 16 percent year over year, with Azure growing 33 percent in constant currency. Satya Nadella highlighted that AI revenue run rate across Microsoft's portfolio has exceeded $10 billion annualized, representing the fastest product in company history to reach that milestone. The company raised its full-year revenue guidance to $272-275 billion, implying approximately 12 percent growth.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
      {
        text: "Microsoft 365 Copilot enterprise seat count grew 60 percent quarter over quarter, reaching over 600,000 paid seats at large enterprises. Amy Hood noted that average Copilot contract values continue to increase as customers expand from initial departmental pilots to organization-wide deployments. The Dynamics 365 Copilot suite, which automates supply chain, sales forecasting, and customer service workflows, saw 45 percent revenue growth.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
    ],
  },

  // ── Tesla ───────────────────────────────────────────────────────────────
  {
    title: "Tesla Q1 2024 Earnings Call — Margin Pressure and Model 2",
    doc_type: "earnings_call",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q1_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Tesla reported Q1 2024 revenue of $21.3 billion, down 9 percent year over year, with automotive revenue of $17.4 billion. Vehicle deliveries totaled 386,810 units, below analyst expectations of approximately 450,000 units. Elon Musk attributed the volume shortfall to factory downtime at Giga Texas due to supply disruptions from the Red Sea shipping crisis and the arson attack at Giga Berlin, which halted production for approximately three weeks.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Automotive gross margin declined to 17.4 percent from 21.1 percent in Q1 2023, reflecting price reductions across the Model 3 and Model Y lineup in North America, Europe, and China, as well as higher warranty provisions. Elon Musk stated that Tesla is deliberately sacrificing near-term margins to prioritize volume and market share, with the expectation that Full Self-Driving subscription attach rates and software margins will more than offset hardware margin compression over a multi-year horizon.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Tesla confirmed development of a next-generation vehicle platform targeting a starting price below $30,000, internally referred to as Model 2 or the Redwood platform. Musk indicated a target production start of mid-to-late 2025 at Giga Texas, with eventual rollout to Giga Mexico pending permitting approvals. The lower-cost vehicle is expected to utilize a significantly simpler wiring harness, eliminating approximately 1 kilometer of copper wiring compared to Model 3.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Energy Generation and Storage revenue grew 7 percent to $1.6 billion, with Megapack deployments of 4.1 GWh setting a quarterly record. The Megapack backlog extended beyond 18 months, with Giga Nevada energy storage manufacturing capacity doubling to support utility-scale storage demand. Services and Other revenue, including collision repair, used vehicles, and non-warranty after-sales, grew 25 percent to $2.3 billion.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Tesla Q2 2024 10-Q — Automotive Economics",
    doc_type: "10-Q",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q2_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Revenue for the three months ended June 30, 2024 was $25.2 billion, up 2 percent year over year, with automotive revenue of $19.9 billion. Vehicle deliveries increased to 443,956 units, a sequential improvement from Q1 2024, aided by price incentives in North America and China. Average selling price per vehicle declined to approximately $44,800 from $47,200 a year prior, reflecting the continued shift toward the lower-priced standard-range Model 3 and Model Y relative to premium trims.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "Automotive gross margin recovered to 18.5 percent from 17.4 percent in the prior quarter, driven by manufacturing cost reductions at Giga Texas and lower raw material costs for lithium carbonate, which declined approximately 35 percent year over year. The company achieved its lowest-ever manufactured cost per vehicle in the second quarter, benefiting from ongoing unboxed manufacturing process improvements and overhead absorption on higher volumes.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "Capital expenditures were $2.3 billion for the quarter, including continued investment in Giga Mexico site preparation, Giga Texas Model 2 production line installation, and Shanghai Giga capacity expansion. Cash and cash equivalents at quarter end were $30.7 billion. The company generated free cash flow of $1.3 billion despite elevated capex, supported by a $2.6 billion improvement in working capital from Megapack prepayments from utility customers.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Tesla Q3 2024 Earnings Call — FSD and Robotaxi",
    doc_type: "earnings_call",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q3_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Tesla reported Q3 2024 revenue of $25.2 billion, up 8 percent year over year, with deliveries of 462,890 vehicles, the highest quarterly total in company history. Automotive gross margin expanded to 20.1 percent, recovering above the 20 percent threshold for the first time since Q2 2023. The margin improvement reflected a combination of cost reductions, improved factory utilization at all four gigafactories, and easing lithium and cobalt input costs.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "Elon Musk unveiled the Cybercab robotaxi at the We, Robot event in Hollywood, with a target production date of 2026 and a retail price below $30,000. The vehicle lacks a steering wheel and pedals and will operate exclusively via the FSD supervised autonomy stack. Musk also unveiled the Robovan, a 20-person autonomous shuttle concept. Wall Street analysts expressed skepticism about the 2026 timeline given Tesla's history of production delays.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "Full Self-Driving supervised version 12 was expanded to Canada and Europe in the quarter, with cumulative customer miles on FSD exceeding 1.5 billion. The FSD take rate on new vehicles increased to approximately 18 percent in North America. Musk reiterated his view that each car equipped with FSD Hardware 4.0 represents a $300,000+ economic asset when autonomous ride-hailing is approved by regulators. FSD monthly subscription revenue contributed approximately $400 million annualized.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Tesla FY2024 10-K — Regulatory and Competition Risk",
    doc_type: "10-K",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Tesla's vehicle deliveries for fiscal year 2024 were 1.79 million units, a 1 percent decline from 1.81 million in fiscal 2023, the company's first annual delivery decline since becoming a public company. Revenue was $97.7 billion, essentially flat year over year, while operating income declined to $7.1 billion from $8.9 billion as automotive gross margin compression outpaced cost reduction efforts. Net income attributable to common stockholders was $7.1 billion, or $2.04 per diluted share.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Tesla faces intensifying competition in the battery electric vehicle market from BYD, which surpassed Tesla on a quarterly basis in global BEV deliveries in Q1 2024. Traditional OEMs including Volkswagen, General Motors, and Hyundai-Kia have accelerated EV product introductions, particularly in the mid-size SUV segment that constitutes Tesla's highest-volume products. The company's Supercharger network, while historically a competitive advantage, is now accessible to Ford, GM, Rivian, and Mercedes vehicles under the North American Charging Standard.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Autonomous driving regulation remains a critical risk and opportunity. NHTSA has opened a formal investigation into 2.6 million Tesla vehicles regarding the adequacy of controls for FSD supervised mode, specifically incidents where the system was used on roads for which it was not designed. Chinese regulators have established new requirements for data localization and over-the-air update approvals that could affect Tesla's ability to deploy FSD software updates in China, its largest single-country market.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "The Energy Generation and Storage segment generated $10.1 billion in revenue for fiscal 2024, growing 67 percent year over year, with gross margin of 24.6 percent. Megapack production capacity at Giga Nevada expanded to 40 GWh annualized following the completion of Phase 2 construction. Utility-scale energy storage demand is expected to remain robust, driven by grid stabilization needs as renewable penetration increases and data center load growth from AI infrastructure buildout.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Tesla FY2024 — Internal Operations and Dojo Strategy",
    doc_type: "10-K",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q4_2024",
    access_scope: "internal",
    chunks: [
      {
        text: "Internal engineering reviews from Q3-Q4 2024 indicate that the Dojo D1 chip cluster at Palo Alto reached 1.1 exaflops of training compute by fiscal year end, approximately 30 percent below the 1.5 exaflop target published in the 2023 AI Day presentation. The underperformance is attributed to thermal management challenges in the ExaPOD rack design and higher-than-expected chip yields on the custom 7nm node. The Dojo team has been reorganized under a new VP of AI Infrastructure, with a revised 2025 roadmap targeting 2 exaflops by Q3 2025.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
      {
        text: "Giga Mexico permitting approvals from the federal government of Mexico were received in September 2024. Site preparation and foundation work began in October 2024 on a 10,000-acre site in Monterrey. Internal project plans call for a phased ramp: Phase 1 producing 250,000 vehicles annually starting Q3 2026, and Phase 2 doubling capacity to 500,000 annually by 2028. The investment is estimated at $5 billion for Phase 1 and an additional $3 billion for Phase 2.",
        quarter: "Q4_2024",
        access_scope: "internal",
      },
    ],
  },
  {
    title: "Tesla Q1 2025 Earnings Call",
    doc_type: "earnings_call",
    company: "Tesla",
    ticker: "TSLA",
    quarter: "Q1_2025",
    access_scope: "public",
    chunks: [
      {
        text: "Tesla reported Q1 2025 revenue of $19.3 billion, down 9 percent year over year, with deliveries of 336,681 vehicles, a 13 percent year-over-year decline that was the worst quarterly result since Q2 2022. Management attributed the delivery shortfall to the transition of Model Y production to the new Juniper refresh at all four gigafactories simultaneously, which caused production downtime of several weeks at each facility. Elon Musk acknowledged that the company's political visibility and social media controversies may have affected brand perception among some consumer segments.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
      {
        text: "Automotive gross margin fell to 16.3 percent, the lowest in over three years, reflecting lower volumes and higher per-unit overhead during the production transition. The company expects margin recovery beginning in Q2 2025 as all four factories return to full Juniper production. Energy Generation and Storage revenue was $2.7 billion with a gross margin of 26.8 percent, providing a partial offset to automotive weakness. Management maintained its full-year 2025 delivery growth target relative to 2024.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
    ],
  },

  // ── Amazon ──────────────────────────────────────────────────────────────
  {
    title: "Amazon Q1 2024 Earnings Call — AWS Reacceleration",
    doc_type: "earnings_call",
    company: "Amazon",
    ticker: "AMZN",
    quarter: "Q1_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Amazon reported Q1 2024 revenue of $143.3 billion, up 13 percent year over year. AWS revenue grew 17 percent to $25.0 billion, reaccelerating from 13 percent growth in Q1 2023, driven by customer optimization efforts concluding and new generative AI workloads going into production. Operating income for the quarter was $15.3 billion, with an operating margin of 10.7 percent, the highest in company history, reflecting North America retail profitability improvements and AWS margin expansion.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Andy Jassy highlighted Amazon Bedrock, the managed service for accessing foundation models including Anthropic Claude, Meta Llama, Mistral, and Amazon Titan, as the fastest-growing service in AWS history. Enterprise customers are using Bedrock to build internal AI assistants, customer service automation, and document summarization workflows. Amazon's $4 billion investment in Anthropic gives AWS preferred customer status for capacity on Anthropic's most capable models.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "North America retail segment operating income was $5.0 billion, representing a 5.8 percent margin, as the company continued to reduce same-day and next-day delivery costs through the regionalization of its fulfillment network. International segment operating income turned positive at $900 million, the first profitable quarter for the international retail business in several years, led by profitability improvements in the UK, Germany, and Japan.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Amazon FY2024 10-K — AWS and Advertising",
    doc_type: "10-K",
    company: "Amazon",
    ticker: "AMZN",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Amazon's total net sales for fiscal year 2024 were $637.9 billion, up 11 percent from $574.8 billion in 2023. AWS contributed $107.6 billion to total revenue, representing 17 percent growth and an operating income of $39.8 billion at a 37 percent operating margin. Advertising Services revenue reached $56.2 billion, growing 19 percent, making it the third-largest advertising platform globally by revenue behind Alphabet and Meta.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Capital expenditures and principal repayments of finance leases totaled $77.0 billion in fiscal 2024, primarily for AWS data center construction, Trainium and Inferentia AI chip procurement, and robotics automation in fulfillment centers. The company's proprietary Trainium 2 AI training chip, manufactured by TSMC on a 3nm process, achieved general availability in Q4 2024 and is being used internally for Amazon Titan model training and made available to AWS customers as EC2 Trn2 instances.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Amazon Prime membership reached 230 million globally, with a retention rate above 93 percent in the United States. Prime Video's advertising tier, launched in early 2024, reached 200 million viewers monthly with advertising turned on. The company projected advertising revenue from Prime Video to grow to approximately $3 billion annually by fiscal 2026. Project Kuiper, Amazon's low-Earth orbit satellite broadband initiative, launched its first production satellites and is targeted for commercial service in mid-2025.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Amazon Q1 2025 Analyst Report — AWS AI Monetization",
    doc_type: "analyst_report",
    company: "Amazon",
    ticker: "AMZN",
    quarter: "Q1_2025",
    access_scope: "restricted",
    chunks: [
      {
        text: "Our channel checks with AWS enterprise accounts suggest AI-related workloads now represent approximately 12-14 percent of AWS revenue run rate, up from an estimated 6-8 percent one year ago. The growth is being driven by inference workloads — specifically retrieval-augmented generation pipelines for internal knowledge bases, code generation via Amazon Q, and customer-facing chatbot deployments on Bedrock. Training workloads are smaller in revenue terms but growing faster, with Trainium 2 reservation waitlists extending 6-9 months.",
        quarter: "Q1_2025",
        access_scope: "restricted",
      },
      {
        text: "We model AWS revenue at $125 billion for fiscal 2025, implying 16 percent growth, with AI incrementally contributing 4-5 percentage points above the structural baseline. Key upside risks include faster enterprise migration of on-premises inference workloads and Anthropic's model improvements driving higher Claude API consumption through Bedrock. The primary downside risk is an AWS price reduction for commodity compute services as competition with Azure and GCP intensifies.",
        quarter: "Q1_2025",
        access_scope: "restricted",
      },
    ],
  },

  // ── NVIDIA ──────────────────────────────────────────────────────────────
  {
    title: "NVIDIA Q1 FY2024 Earnings Call — Data Center Surge",
    doc_type: "earnings_call",
    company: "NVIDIA",
    ticker: "NVDA",
    quarter: "Q1_2024",
    access_scope: "public",
    chunks: [
      {
        text: "NVIDIA reported first-quarter fiscal 2024 revenue of $7.2 billion, up 19 percent year over year, with Data Center revenue of $4.3 billion growing 14 percent. However, management issued guidance for Q2 fiscal 2024 revenue of approximately $11 billion, representing a 64 percent sequential jump, driven by explosive demand for H100 GPU clusters from hyperscalers and large AI research labs. Jensen Huang described the guidance as reflecting a fundamental shift in computing architecture away from CPUs toward accelerated computing.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Demand for H100 GPU clusters was described as significantly exceeding supply. NVIDIA's supply chain partners TSMC, SK Hynix (for HBM3 memory), and CoWoS advanced packaging are all running at maximum capacity. The company has secured priority allocation from TSMC on CoWoS capacity through calendar year 2025. Lead times for H100 DGX systems extended beyond 52 weeks at many distributors, creating a secondary market where H100 GPU rental prices exceeded $40,000 per hour for 8-GPU nodes.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "NVIDIA Q3 FY2024 Earnings Call — H100 and Blackwell Preview",
    doc_type: "earnings_call",
    company: "NVIDIA",
    ticker: "NVDA",
    quarter: "Q3_2024",
    access_scope: "public",
    chunks: [
      {
        text: "NVIDIA reported Q3 fiscal 2024 revenue of $18.1 billion, up 206 percent year over year, with Data Center revenue of $14.5 billion growing 279 percent. Gaming revenue was $2.9 billion, up 81 percent. Non-GAAP gross margin reached 75.0 percent, reflecting H100's premium pricing and near-zero marginal cost of software tools including CUDA, cuDNN, and NIM microservices. Jensen Huang confirmed the Blackwell GPU architecture is on track for production shipments beginning in early calendar 2024.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "H100 average selling prices are estimated by analysts at approximately $30,000 to $35,000 for the SXM5 variant used in DGX and HGX server configurations. Hyperscaler customers including Microsoft, Google, Amazon, and Meta collectively represent approximately 40-45 percent of Data Center revenue. Sovereign AI — government-funded national AI infrastructure projects — is an emerging demand driver, with contracts announced in Japan, France, Singapore, India, and UAE.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
      {
        text: "NVIDIA networking revenue from the Mellanox InfiniBand and Ethernet product lines contributed approximately $3 billion in the quarter, as customers building large GPU clusters require ultra-low latency interconnects to enable tensor parallelism across thousands of GPUs. The NVIDIA NVLink fabric within DGX H100 SuperPOD systems provides 900 GB/s bidirectional bandwidth, compared to approximately 200 GB/s for PCIe Gen 5, making NVLink-connected clusters significantly faster for distributed training.",
        quarter: "Q3_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "NVIDIA FY2024 10-K — Competitive Position and Export Controls",
    doc_type: "10-K",
    company: "NVIDIA",
    ticker: "NVDA",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "NVIDIA's fiscal year 2024 revenue was $60.9 billion, up 122 percent from $26.9 billion in fiscal 2023. Gross margin was 72.7 percent on a GAAP basis and 76.6 percent on a non-GAAP basis. Data Center represented 78 percent of total revenue at $47.5 billion. Net income was $29.8 billion, up 581 percent, resulting in earnings per diluted share of $11.93. Return on equity exceeded 100 percent, reflecting NVIDIA's asset-light model with outsourced manufacturing.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "U.S. Department of Commerce export control regulations restrict the export of advanced AI chips, including the A100, H100, and H200 GPUs, to China and certain other countries without a license. NVIDIA developed the A800 and H800 variants for the Chinese market to comply with export control bandwidth thresholds; however, revised regulations effective November 2023 imposed export restrictions on these variants as well, effectively limiting NVIDIA's China Data Center revenue to only legacy products. China represented approximately 17 percent of NVIDIA's total revenue in fiscal 2023 prior to these regulations.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "The Blackwell architecture, successor to Hopper, includes the GB200 GPU with 208 billion transistors fabricated on TSMC's N4P process. A single GB200 NVL72 rack system provides 30 times the inference throughput and 25 times the energy efficiency for large language model inference compared to an equivalent H100 configuration. Early shipments to Microsoft, Google, Amazon, and Meta began in late fiscal 2024, with volume ramp expected through fiscal 2025.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "NVIDIA Q1 FY2025 Analyst Report — Blackwell Ramp",
    doc_type: "analyst_report",
    company: "NVIDIA",
    ticker: "NVDA",
    quarter: "Q1_2025",
    access_scope: "internal",
    chunks: [
      {
        text: "Blackwell production ramp is the dominant near-term catalyst for NVIDIA. Our analysis of CoWoS capacity allocation at TSMC suggests NVIDIA has secured approximately 70 percent of total industry CoWoS output for calendar 2025, a significant advantage over AMD's MI300X and Intel's Gaudi 3. Channel checks indicate GB200 NVL72 rack pricing is in the range of $2.5-3.0 million per rack, compared to approximately $700,000 for an H100 DGX system, with customers willing to pay the premium for inference cost efficiency gains.",
        quarter: "Q1_2025",
        access_scope: "internal",
      },
      {
        text: "We model NVIDIA Data Center revenue at $120 billion for fiscal 2025, implying approximately 153 percent growth on a full-year basis, driven by Blackwell shipments that we estimate will ramp to $15-18 billion per quarter by Q3 fiscal 2025. The primary risk to our thesis is a yield or packaging issue with the Blackwell NVL72 rack that causes production delays beyond what NVIDIA has already communicated. We note that the initial Blackwell tape-out required mask revisions to address a functional defect, which is normal for complex chips but delayed volume production by approximately one quarter.",
        quarter: "Q1_2025",
        access_scope: "internal",
      },
    ],
  },

  // ── Alphabet / Google ───────────────────────────────────────────────────
  {
    title: "Alphabet Q2 2024 Earnings Call — Search AI and Cloud",
    doc_type: "earnings_call",
    company: "Alphabet",
    ticker: "GOOGL",
    quarter: "Q2_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Alphabet reported Q2 2024 revenue of $84.7 billion, up 14 percent year over year, with Google Search revenue of $48.5 billion growing 14 percent. Sundar Pichai highlighted that AI Overviews, the generative AI summary feature in Google Search, reached 1.5 billion users globally since its rollout in May 2024. Despite initial concerns that AI Overviews would reduce click-through rates, management reported no material adverse impact on search monetization.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "Google Cloud revenue grew 29 percent to $10.4 billion, with an operating margin of 11.3 percent, representing continued margin expansion as the business scales. The cloud backlog grew to $90 billion, with a weighted average remaining contract term of approximately 3.7 years. Google Cloud's AI differentiation includes Vertex AI, the managed ML platform with access to Gemini models, and TPU v5 instances that offer competitive price-performance for training large language models.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "YouTube advertising revenue grew 13 percent to $8.7 billion. YouTube TV reached 8 million paid subscribers, making it the largest virtual multichannel video programming distributor in the United States. Google's total capital expenditure in Q2 was $13.2 billion, of which the majority was directed toward AI compute infrastructure. The company guided for capex in the second half of 2024 to be at least as high as the first half, signaling sustained investment of $50+ billion annually.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Alphabet FY2024 10-K — Search Moat and AI Transition",
    doc_type: "10-K",
    company: "Alphabet",
    ticker: "GOOGL",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Alphabet's fiscal year 2024 revenue was $350.0 billion, up 14 percent from $307.4 billion in 2023. Google Services (Search, YouTube, Play, Maps, Gmail, and other advertising products) generated $314.1 billion in revenue. Google Cloud contributed $43.2 billion, growing 28 percent, and Other Bets generated $1.7 billion. Total operating income was $112.4 billion, with an operating margin of 32.1 percent, a significant expansion from 25.9 percent in 2023.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Google faces existential risk from the Department of Justice antitrust ruling in August 2024, which found Google liable for maintaining an illegal monopoly in the general search and general text advertising markets. The remedies phase is ongoing, with the DOJ's proposed structural remedies including forced divestiture of Chrome, mandatory sharing of search index data with competitors, and the elimination of default search agreements with Apple, Samsung, and Mozilla. Google has indicated it will appeal the liability ruling.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Waymo, Alphabet's autonomous vehicle subsidiary, completed over 150,000 paid robotaxi rides per week as of December 2024 across San Francisco, Phoenix, and Los Angeles. Waymo's valuation in a secondary transaction was estimated at approximately $45 billion. The DeepMind division generated two Nobel Prize awards in 2024 for the AlphaFold protein structure prediction system, reinforcing Alphabet's position in foundational AI research.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Alphabet Q1 2025 Earnings Call",
    doc_type: "earnings_call",
    company: "Alphabet",
    ticker: "GOOGL",
    quarter: "Q1_2025",
    access_scope: "public",
    chunks: [
      {
        text: "Alphabet reported Q1 2025 revenue of $90.2 billion, up 12 percent year over year. Google Search and other revenue grew 10 percent to $50.7 billion, with monetization per search query improving due to higher-value commercial queries captured by AI-enhanced result formats. Google Cloud grew 28 percent to $12.3 billion, driven by Vertex AI workloads and Gemini API consumption growing triple digits year over year.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
      {
        text: "Sundar Pichai introduced Project Astra, Google's real-time multimodal AI agent that can see, hear, and respond via smartphone camera and microphone, as a preview of the next phase of Google Assistant. The Gemini 2.0 Ultra model achieved state-of-the-art benchmark results on MMLU, HumanEval, and MATH datasets. Pichai stated that Google's AI spending will remain elevated through at least 2026, with $75 billion in capital expenditure planned for calendar 2025.",
        quarter: "Q1_2025",
        access_scope: "public",
      },
    ],
  },

  // ── Meta ────────────────────────────────────────────────────────────────
  {
    title: "Meta Q2 2024 Earnings Call — Llama and Ad Revenue",
    doc_type: "earnings_call",
    company: "Meta",
    ticker: "META",
    quarter: "Q2_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Meta reported Q2 2024 revenue of $39.1 billion, up 22 percent year over year, with advertising revenue of $38.3 billion. Daily active people across the family of apps reached 3.27 billion, a new high. Mark Zuckerberg highlighted that Llama 3.1 405B, the largest open-weights model Meta has released, matches GPT-4 on many benchmarks while being freely available for commercial use, a deliberate strategy to commoditize foundation model capabilities and reduce developer dependence on proprietary APIs.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "Advertising revenue growth was driven by Reels monetization reaching parity with Feed and Stories on a per-impression basis, AI-powered ad ranking delivering a 7 percent improvement in conversions, and click-to-WhatsApp and click-to-Messenger ads scaling in emerging markets. Meta AI, the assistant embedded across WhatsApp, Messenger, Instagram, and Facebook, reached 400 million monthly active users in the quarter. The Reality Labs segment generated $353 million in revenue with an operating loss of $4.5 billion.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "Meta FY2024 10-K — AI Infrastructure and Efficiency",
    doc_type: "10-K",
    company: "Meta",
    ticker: "META",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "Meta's fiscal year 2024 total revenue was $164.5 billion, up 22 percent from $134.9 billion in 2023. Net income was $62.4 billion, representing a net margin of 37.9 percent and a 59 percent increase from the prior year. Advertising revenue was $160.6 billion. The year of efficiency, initiated in 2023, contributed approximately $15 billion in annualized cost savings through headcount reduction from 87,000 to 72,000 employees and consolidation of facilities.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Meta's capital expenditure was $38.4 billion in fiscal 2024, focused on data center buildout and GPU procurement for AI training and inference. The company has deployed over 600,000 NVIDIA H100 GPUs across its global data center footprint and plans to reach approximately 1 million H100-equivalent GPUs in operation by end of 2025. Meta's custom silicon MTIA chip, designed for recommendation model inference, is in production at all major data centers, reducing inference costs for ranking and recommendation by approximately 25 percent versus GPU alternatives.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "WhatsApp Business Platform revenues, which monetize messaging API usage by brands and developers, grew approximately 40 percent in fiscal 2024, approaching $3 billion in revenue. Click-to-WhatsApp advertising from Facebook and Instagram, where users click an ad to initiate a WhatsApp conversation with a business, is Meta's fastest-growing ad format in Latin America, India, and Southeast Asia. The company estimates over 1 billion business messages are sent per day across the Meta platform.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },

  // ── JPMorgan Chase ──────────────────────────────────────────────────────
  {
    title: "JPMorgan Chase Q1 2024 Earnings Call — NII and Credit",
    doc_type: "earnings_call",
    company: "JPMorgan Chase",
    ticker: "JPM",
    quarter: "Q1_2024",
    access_scope: "public",
    chunks: [
      {
        text: "JPMorgan Chase reported Q1 2024 net income of $13.4 billion, or $4.44 per diluted share, on revenue of $41.9 billion, up 8 percent year over year. Net interest income was $23.2 billion, supported by elevated interest rates and strong loan growth in Consumer and Community Banking. Jamie Dimon reiterated that the bank is prepared for a wide range of economic scenarios including stagflation, a mild recession, and a soft landing, and that capital levels remain above regulatory requirements.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Consumer and Community Banking revenue was $17.6 billion with a net income of $5.1 billion. Card Services net charge-off rate was 3.60 percent, up from 2.07 percent in Q1 2023, reflecting normalization from pandemic-era low credit losses. The bank increased credit card marketing expense as competition for prime revolvers intensified from Capital One, Amex, and Citi. Deposit balances were $1.14 trillion, with mix continuing to shift from low-rate checking accounts to higher-rate savings and CDs.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
      {
        text: "Commercial Banking and Corporate and Investment Banking together contributed $16.8 billion in revenue. Investment banking fees grew 21 percent to $2.0 billion, driven by a rebound in debt capital markets issuance as borrowers rushed to lock in financing ahead of anticipated rate cuts. Fixed income markets revenue was $5.0 billion, declining 4 percent. Equity markets revenue grew 16 percent to $3.0 billion on strong prime brokerage and derivatives activity.",
        quarter: "Q1_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "JPMorgan Chase Q2 2024 10-Q — Capital Adequacy",
    doc_type: "10-Q",
    company: "JPMorgan Chase",
    ticker: "JPM",
    quarter: "Q2_2024",
    access_scope: "public",
    chunks: [
      {
        text: "As of June 30, 2024, JPMorgan Chase's Common Equity Tier 1 capital ratio was 15.3 percent, well above the regulatory minimum requirement of 4.5 percent and the firm's internal target of 13.0 percent. The Standardized Total Capital ratio was 17.8 percent. Risk-weighted assets were $2.19 trillion. The firm's Supplementary Leverage Ratio was 6.0 percent, above the 5.0 percent minimum for global systemically important banks.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
      {
        text: "The allowance for credit losses was $23.8 billion as of quarter end, representing 2.1 percent of total loans. The provision for credit losses in the second quarter was $3.1 billion, reflecting continued normalization of consumer credit quality as excess savings from pandemic stimulus are depleted. Commercial real estate provisions increased due to deteriorating office sector fundamentals, with criticized commercial real estate loans rising to $19.1 billion from $9.5 billion in the prior year.",
        quarter: "Q2_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "JPMorgan Chase FY2024 10-K — Strategic Priorities",
    doc_type: "10-K",
    company: "JPMorgan Chase",
    ticker: "JPM",
    quarter: "Q4_2024",
    access_scope: "public",
    chunks: [
      {
        text: "JPMorgan Chase's fiscal year 2024 net income was $58.5 billion, a record, on revenue of $177.6 billion, up 12 percent year over year. Return on tangible common equity was 21 percent. The Consumer and Community Banking segment earned $22.9 billion. The firm repurchased $9.5 billion of common stock and paid $12.4 billion in dividends. Total assets were $3.9 trillion, making JPMorgan the largest bank by assets in the United States.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "JPMorgan's technology investment exceeded $17 billion in fiscal 2024, of which approximately $4 billion was directed to AI and machine learning applications. The firm has deployed large language models internally for code generation (reducing developer time on boilerplate code by an estimated 20 percent), document review in Legal and Compliance, and credit memo generation in Commercial Banking. The proprietary LLM Court Interpreter handles contract analysis for the Legal team and processes approximately 500,000 documents annually.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "Basel III Endgame capital rules, proposed by U.S. regulators in 2023 and subsequently revised in 2024, are expected to increase JPMorgan's risk-weighted assets by approximately 4-6 percent under the revised proposal, a significant reduction from the original 25 percent increase proposed. Jamie Dimon testified before the Senate Banking Committee arguing that the original rules would reduce bank lending capacity and increase the cost of mortgages, auto loans, and small business credit. The firm is currently modeling the impact of the final rules, expected in 2025.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
      {
        text: "The Global Corporate and Investment Bank completed advisory roles on 12 of the 20 largest M&A transactions globally in fiscal 2024, maintaining the top-ranked position in global investment banking fees for the 14th consecutive year. Debt underwriting volume was $1.3 trillion, the highest in firm history, driven by leveraged buyout financing, investment-grade corporate issuance, and collateralized loan obligation structuring. The firm managed its net interest income exposure by extending fixed-rate asset duration in anticipation of rate cuts.",
        quarter: "Q4_2024",
        access_scope: "public",
      },
    ],
  },
  {
    title: "JPMorgan Chase FY2024 — Internal Credit Risk Review",
    doc_type: "10-K",
    company: "JPMorgan Chase",
    ticker: "JPM",
    quarter: "Q4_2024",
    access_scope: "restricted",
    chunks: [
      {
        text: "Internal stress test results for the Severely Adverse scenario, which assumes a 10 percent peak-to-trough GDP decline and unemployment reaching 13 percent, show JPMorgan's CET1 ratio declining to 11.2 percent at the trough, 180 basis points above the firm's 9.5 percent minimum management target. Cumulative projected net charge-offs in the Severely Adverse scenario over 9 quarters total $63 billion, predominantly from Card Services ($29 billion) and Commercial Real Estate ($15 billion).",
        quarter: "Q4_2024",
        access_scope: "restricted",
      },
      {
        text: "Office sector commercial real estate exposure stands at $18.6 billion in outstanding loans, with an additional $12.4 billion in unfunded commitments. Geographic concentration is highest in Manhattan ($4.8 billion), San Francisco ($2.2 billion), and Chicago ($1.7 billion), all markets experiencing elevated vacancy rates above 20 percent. Internal risk grades for office CRE loans deteriorated in fiscal 2024, with 31 percent of the portfolio now rated Substandard or Doubtful, up from 14 percent a year prior.",
        quarter: "Q4_2024",
        access_scope: "restricted",
      },
      {
        text: "Consumer auto loan delinquencies (30+ days past due) reached 1.82 percent in Q4 2024, the highest level since 2010, reflecting the impact of elevated vehicle prices on debt-to-income ratios for lower-income borrowers. The bank has tightened credit standards for indirect auto originations, reducing the maximum LTV on used vehicle loans from 115 percent to 100 percent and increasing minimum FICO score requirements by 20 points. These adjustments are expected to reduce auto origination volume by approximately 15 percent in fiscal 2025.",
        quarter: "Q4_2024",
        access_scope: "restricted",
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
    console.log(`Cleared ${existingDocIds.length} existing documents.`);
  }

  let totalChunks = 0;
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
      throw new Error(`Failed to insert document "${document.title}": ${insertDocError?.message}`);
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
          `Failed to insert chunk for "${document.title}": ${insertChunkError.message}`
        );
      }
      totalChunks++;
    }

    console.log(`  ✓ ${document.title} (${document.chunks.length} chunks)`);
  }

  console.log(
    `\nSeed complete. ${documents.length} documents, ${totalChunks} chunks across tickers: ${tickers.join(", ")}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
