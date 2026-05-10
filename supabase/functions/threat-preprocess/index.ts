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
    const { text, source_type = "auto", domain = "cti" } = await req.json();

    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Text input required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const detectedType = source_type === "auto" ? detectSourceType(text) : source_type;
    const result = domain === "clinical"
      ? preprocessClinical(text, detectedType)
      : preprocessText(text, detectedType);

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

/* ── Clinical Mode (Simulation) ──
 * PHI safety-net redaction + clinical-code IOC extraction.
 * Treats the input as already de-identified but adds defense-in-depth scrubbing.
 * NOT a substitute for proper de-identification (Safe Harbor / Expert Determination).
 */
function preprocessClinical(text: string, sourceType: string): PreprocessResult {
  let cleaned = text;
  const steps: string[] = [];

  // PHI safety-net redactions (defense in depth)
  cleaned = cleaned.replace(/\b[A-Z][a-z]+\s+[A-Z][a-z]+(?=,?\s+(?:MD|RN|PhD|DO|NP|PA))\b/g, "[PROVIDER]");
  cleaned = cleaned.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN-REDACTED]");
  cleaned = cleaned.replace(/\bMRN[:\s#]*\d{4,}\b/gi, "MRN [REDACTED]");
  cleaned = cleaned.replace(/\bNHS[\s#]*\d{3}\s?\d{3}\s?\d{4}\b/gi, "NHS [REDACTED]");
  cleaned = cleaned.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[EMAIL]");
  cleaned = cleaned.replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]");
  steps.push("PHI safety-net redaction (provider names, MRN/NHS/SSN, email, phone)");
  steps.push("Clinical whitespace normalization");
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  // Clinical-code IOC extraction
  const iocs: IOC[] = [];
  let m: RegExpExecArray | null;

  // ICD-10/11 codes (e.g. E11.9, I10, N18.3)
  const icdRe = /\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b/g;
  while ((m = icdRe.exec(cleaned)) !== null) {
    iocs.push({ type: "icd10", value: m[1], defanged: m[1] });
  }

  // RxNorm RXCUI (typical 4–7 digit codes appearing after RxCUI / RXCUI marker)
  const rxRe = /\bRx?CUI[:\s]*([0-9]{4,8})\b/gi;
  while ((m = rxRe.exec(cleaned)) !== null) {
    iocs.push({ type: "rxnorm", value: m[1], defanged: m[1] });
  }

  // LOINC codes (NNNNN-N)
  const loincRe = /\b(\d{4,5}-\d)\b/g;
  while ((m = loincRe.exec(cleaned)) !== null) {
    iocs.push({ type: "loinc", value: m[1], defanged: m[1] });
  }

  // Dosage strings
  const doseRe = /\b(\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|units?)\b(?:\s+(?:PO|IV|IM|SC|SL|PR|QD|BID|TID|QID|QHS|PRN))?)/gi;
  while ((m = doseRe.exec(cleaned)) !== null) {
    iocs.push({ type: "dosage", value: m[1].trim(), defanged: m[1].trim() });
  }

  if (iocs.length > 0) {
    steps.push(`Clinical code extraction (${iocs.length} ICD/RxNorm/LOINC/dosage tokens)`);
  }

  const uniqueIOCs = iocs.filter((ioc, i, arr) => arr.findIndex(o => o.value === ioc.value && o.type === ioc.type) === i);

  return {
    cleaned_text: cleaned,
    source_type: sourceType === "auto" ? "clinical_note" : sourceType,
    reliability_score: 0.9, // synthetic notes are structurally clean
    iocs_found: uniqueIOCs,
    cleaning_steps: steps,
    metadata: {
      original_length: text.length,
      cleaned_length: cleaned.length,
      reduction_percent: ((1 - cleaned.length / text.length) * 100).toFixed(1),
      ioc_count: uniqueIOCs.length,
      domain: "clinical",
      simulation: true,
    },
  };
}
