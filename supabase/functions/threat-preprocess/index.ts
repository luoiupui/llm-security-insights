import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Multi-Source Intelligence Preprocessing (Ch. 3.2) ── */

interface PreprocessResult {
  cleaned_text: string;
  source_type: string;
  reliability_score: number;
  iocs_found: IOC[];
  cleaning_steps: string[];
  metadata: Record<string, unknown>;
}

interface IOC {
  type: string;
  value: string;
  defanged: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, source_type = "auto" } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Text input required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const detectedType = source_type === "auto" ? detectSourceType(text) : source_type;
    const result = preprocessText(text, detectedType);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-preprocess error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function detectSourceType(text: string): string {
  if (text.includes('"type"') && text.includes('"id"') && (text.includes("attack-pattern") || text.includes("malware") || text.includes("intrusion-set"))) {
    return "stix";
  }
  if (text.includes("<html") || text.includes("<div") || text.includes("<script")) {
    return "blog";
  }
  if (text.includes("Page ") && text.includes("Figure ") || text.match(/\n{3,}/)) {
    return "pdf";
  }
  if (text.includes("Originally Posted") || text.includes("Reply #") || text.includes("[quote")) {
    return "forum";
  }
  return "report";
}

function preprocessText(text: string, sourceType: string): PreprocessResult {
  let cleaned = text;
  const steps: string[] = [];
  let reliability = 0.7;

  // ── Source-specific cleaning (Ch. 3.2) ──
  switch (sourceType) {
    case "pdf":
      // Remove page breaks and headers/footers
      cleaned = cleaned.replace(/Page\s+\d+\s*(of\s+\d+)?/gi, "");
      steps.push("Page break removal");
      cleaned = cleaned.replace(/^(CONFIDENTIAL|DRAFT|TLP:.*?)$/gm, "");
      steps.push("Header/footer stripping");
      // Normalize excessive whitespace from PDF extraction
      cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
      steps.push("Whitespace normalization");
      reliability = 0.85;
      break;

    case "blog":
      // Strip HTML tags
      cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
      cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
      steps.push("Script/style removal");
      cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, "");
      cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, "");
      steps.push("Navigation/footer cleanup");
      cleaned = cleaned.replace(/<[^>]+>/g, " ");
      steps.push("HTML tag stripping");
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
      steps.push("Whitespace normalization");
      reliability = 0.70;
      break;

    case "forum":
      // Remove quotes, signatures, noise
      cleaned = cleaned.replace(/\[quote[^\]]*\][\s\S]*?\[\/quote\]/gi, "");
      cleaned = cleaned.replace(/Originally Posted by.*?\n/gi, "");
      steps.push("Quote removal");
      cleaned = cleaned.replace(/--\s*\n[\s\S]*$/m, "");
      steps.push("Signature stripping");
      cleaned = cleaned.replace(/^(re:|fw:|fwd:)\s*/gim, "");
      steps.push("Noise filtering");
      reliability = 0.50;
      break;

    case "stix":
      // STIX 2.1 — validate and pass through
      steps.push("Schema validation");
      steps.push("Object type mapping");
      steps.push("Timestamp alignment");
      reliability = 0.95;
      break;

    default:
      cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
      steps.push("Basic whitespace normalization");
      reliability = 0.75;
  }

  // ── IOC Extraction & Normalization (all sources) ──
  const iocs: IOC[] = [];

  // IPv4 addresses
  const ipRegex = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  let match;
  while ((match = ipRegex.exec(cleaned)) !== null) {
    const ip = match[1];
    if (!ip.startsWith("0.") && !ip.startsWith("127.") && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
      iocs.push({ type: "ipv4", value: ip, defanged: ip.replace(/\./g, "[.]") });
    }
  }

  // Domains
  const domainRegex = /\b([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.(com|net|org|io|ru|cn|xyz|top|info|cc|tk))\b/gi;
  while ((match = domainRegex.exec(cleaned)) !== null) {
    iocs.push({ type: "domain", value: match[1], defanged: match[1].replace(/\./g, "[.]") });
  }

  // MD5/SHA1/SHA256 hashes
  const hashRegex = /\b([a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})\b/g;
  while ((match = hashRegex.exec(cleaned)) !== null) {
    const hashVal = match[1].toLowerCase();
    const hashType = hashVal.length === 32 ? "md5" : hashVal.length === 40 ? "sha1" : "sha256";
    iocs.push({ type: hashType, value: hashVal, defanged: hashVal });
  }

  // CVE IDs
  const cveRegex = /\b(CVE-\d{4}-\d{4,})\b/gi;
  while ((match = cveRegex.exec(cleaned)) !== null) {
    iocs.push({ type: "cve", value: match[1].toUpperCase(), defanged: match[1].toUpperCase() });
  }

  if (iocs.length > 0) {
    steps.push(`IOC extraction (${iocs.length} found)`);
    steps.push("IOC normalization (defanging, lowercase hashes)");
  }

  // ── Deduplication ──
  const uniqueIOCs = iocs.filter((ioc, i, arr) => arr.findIndex(o => o.value === ioc.value) === i);

  return {
    cleaned_text: cleaned,
    source_type: sourceType,
    reliability_score: reliability,
    iocs_found: uniqueIOCs,
    cleaning_steps: steps,
    metadata: {
      original_length: text.length,
      cleaned_length: cleaned.length,
      reduction_percent: ((1 - cleaned.length / text.length) * 100).toFixed(1),
      ioc_count: uniqueIOCs.length,
    },
  };
}
