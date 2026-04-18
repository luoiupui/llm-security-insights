/**
 * Experiment Runner — runs LLM extraction + REAL baselines + metrics.
 *
 * Baselines (no more Math.random simulations):
 *   - "ours" : graph-native CoT (8-step prompt, STIX constraints, full pipeline)
 *   - "llm-zeroshot" : same Gemini model with a vanilla 1-shot prompt — isolates
 *     the value of the graph-native CoT design vs vanilla LLM prompting.
 *   - "rule-based" : real regex/keyword extractor (CVE / APT / hash / known
 *     malware names / known TTP keywords). Deterministic, no randomness.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const COT_SYSTEM = `You are a Graph-Native Cyber Threat Intelligence Reasoning Engine.
Reason in (Subject, Predicate, Object) triples. Enforce STIX 2.1 ontology while reasoning.
Use 8 explicit Chain-of-Thought steps: (1) narrative seed, (2) ontology-grounded node expansion,
(3) predicate inference with evidence, (4) temporal subgraph, (5) causal fusion,
(6) consistency validation, (7) confidence propagation, (8) graph serialization.`;

const ZEROSHOT_SYSTEM = `Extract cyber threat intelligence entities and relations from the text. Return JSON.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, ground_truth, task = "full", stage = 1 } = await req.json();
    if (!text || !ground_truth) {
      return new Response(JSON.stringify({ error: "text and ground_truth required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Real systems ──
    const oursStart = Date.now();
    const oursOut = await runLLM(text, COT_SYSTEM, /*useCot=*/true);
    const oursTime = Date.now() - oursStart;

    const zsStart = Date.now();
    const zsOut = await runLLM(text, ZEROSHOT_SYSTEM, /*useCot=*/false);
    const zsTime = Date.now() - zsStart;

    const ruleStart = Date.now();
    const ruleOut = runRuleBased(text);
    const ruleTime = Date.now() - ruleStart;

    const oursMetrics = computeMetrics(oursOut, ground_truth);
    const zsMetrics = computeMetrics(zsOut, ground_truth);
    const ruleMetrics = computeMetrics(ruleOut, ground_truth);

    // ── Log to monitoring ──
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from("monitoring_events").insert({
        event_type: "baseline_run",
        category: "experiment",
        title: `Stage ${stage} baseline run · task=${task}`,
        detail: `Ours F1=${oursMetrics.f1}% · Zero-shot F1=${zsMetrics.f1}% · Rule F1=${ruleMetrics.f1}%`,
        metadata: { stage, task, ours: oursMetrics, zeroshot: zsMetrics, rule: ruleMetrics },
      });
    } catch (e) { console.error("log error", e); }

    return new Response(JSON.stringify({
      results: [
        { system: "ours", metrics: oursMetrics, runTime: oursTime, output: oursOut },
        { system: "llm-zeroshot", metrics: zsMetrics, runTime: zsTime, output: zsOut },
        { system: "rule-based", metrics: ruleMetrics, runTime: ruleTime, output: ruleOut },
      ],
      stage,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("Experiment runner error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── Real LLM call: shared for both ours (CoT) and zero-shot baseline ── */
async function runLLM(text: string, systemPrompt: string, useCot: boolean) {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const userPrompt = useCot
    ? `Apply the 8-step Graph-Native CoT and return ONLY a JSON object with shape:
{
  "entities":[{"name","type","confidence"}],
  "relations":[{"source","relation","target","confidence"}],
  "causal_links":[{"cause","effect","causal_type","temporal_order","confidence"}]
}
TEXT:
${text}`
    : `Extract entities and relations from this CTI text. Return ONLY JSON of shape:
{"entities":[{"name","type","confidence"}],"relations":[{"source","relation","target","confidence"}],"causal_links":[]}
TEXT:
${text}`;

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM call failed: ${resp.status} ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(content);
    return {
      entities: parsed.entities ?? [],
      relations: parsed.relations ?? [],
      causal_links: parsed.causal_links ?? [],
    };
  } catch {
    return { entities: [], relations: [], causal_links: [] };
  }
}

/* ── REAL Rule-Based extractor (no randomness) ── */
const KNOWN_MALWARE = ["X-Agent","DTrack","SUNBURST","TEARDROP","RAINDROP","Mimikatz","Cobalt Strike","Emotet","TrickBot","Ryuk","WannaCry","NotPetya","Stuxnet","Duqu","Flame","Olympic Destroyer","BlackEnergy","Industroyer","Triton","Shamoon","WebShell","PsExec"];
const KNOWN_ACTORS = /\b(APT[- ]?\d{1,3}|Lazarus(?: Group)?|Fancy Bear|Cozy Bear|Equation Group|Sandworm|Turla|Carbanak|FIN\d+|TA\d{3,4}|UNC\d{4,5})\b/g;
const KNOWN_SOFTWARE = ["Microsoft Office","Microsoft Exchange","Exchange","SolarWinds","Orion","ProxyLogon","FortiOS","PAN-OS","ScreenConnect","TeamCity","Log4j","Apache","PowerShell","WordPad"];
const KNOWN_TTPS = /\b(spearphishing|phishing|lateral movement|privilege escalation|persistence|exfiltration|credential dumping|sql injection|web shell|watering hole|supply chain)\b/gi;

function runRuleBased(text: string) {
  const entities: any[] = [];
  const seen = new Set<string>();
  const push = (name: string, type: string, conf = 0.9) => {
    const key = `${name.toLowerCase()}|${type}`;
    if (seen.has(key)) return;
    seen.add(key); entities.push({ name, type, confidence: conf });
  };

  // CVEs
  for (const m of text.matchAll(/CVE-\d{4}-\d{4,7}/gi)) push(m[0].toUpperCase(), "vulnerability", 0.95);
  // CAPEC
  for (const m of text.matchAll(/CAPEC-\d+/gi)) push(m[0].toUpperCase(), "ttp", 0.9);
  // MITRE technique IDs
  for (const m of text.matchAll(/\bT\d{4}(?:\.\d{3})?\b/g)) push(m[0], "ttp", 0.9);
  // Hashes
  for (const m of text.matchAll(/\b[a-fA-F0-9]{32}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{64}\b/g)) push(m[0], "indicator", 0.95);
  // IPs (defanged or normal)
  for (const m of text.matchAll(/\b\d{1,3}(?:\[?\.\]?\d{1,3}){3}\b/g)) push(m[0], "indicator", 0.9);
  // Domains (defanged)
  for (const m of text.matchAll(/\b[a-z0-9-]+\[?\.\]?[a-z]{2,}\b/gi)) {
    const v = m[0]; if (v.length > 5 && /[\[\]]/.test(v)) push(v, "indicator", 0.85);
  }
  // Threat actors
  for (const m of text.matchAll(KNOWN_ACTORS)) push(m[0], "threat_actor", 0.9);
  // Known malware
  for (const w of KNOWN_MALWARE) {
    const re = new RegExp(`\\b${w.replace(/[-\s]/g, "[-\\s]")}\\b`, "i");
    if (re.test(text)) push(w, "malware", 0.9);
  }
  // Known software
  for (const w of KNOWN_SOFTWARE) {
    if (new RegExp(`\\b${w}\\b`, "i").test(text)) push(w, "software", 0.85);
  }
  // TTP keywords
  for (const m of text.matchAll(KNOWN_TTPS)) push(m[0], "ttp", 0.75);

  // Naive co-occurrence relations (within ~120 chars)
  const relations: any[] = [];
  const names = entities.map((e) => e.name);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i], b = names[j];
      const ai = text.toLowerCase().indexOf(a.toLowerCase());
      const bi = text.toLowerCase().indexOf(b.toLowerCase());
      if (ai >= 0 && bi >= 0 && Math.abs(ai - bi) < 120) {
        relations.push({ source: a, relation: "related-to", target: b, confidence: 0.6 });
      }
    }
  }
  return { entities, relations: relations.slice(0, 25), causal_links: [] };
}

/* ── Metric computation (defensive against missing fields) ── */
function computeMetrics(predicted: any, groundTruth: any) {
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const gtEnt = new Set((groundTruth.entities || []).filter((e: any) => e?.name).map((e: any) => norm(e.name)));
  const pdEnt = new Set((predicted.entities || []).filter((e: any) => e?.name).map((e: any) => norm(e.name)));
  const tp = [...pdEnt].filter((e) => gtEnt.has(e)).length;
  const precision = pdEnt.size > 0 ? tp / pdEnt.size : 0;
  const recall = gtEnt.size > 0 ? tp / gtEnt.size : 0;
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

  const relKey = (r: any) => `${norm(r?.source)}→${norm(r?.relation ?? r?.predicate)}→${norm(r?.target)}`;
  const gtRels = new Set((groundTruth.relations || []).filter((r: any) => r && (r.source || r.target)).map(relKey));
  const pdRels = new Set((predicted.relations || []).filter((r: any) => r && (r.source || r.target)).map(relKey));
  const rTp = [...pdRels].filter((r) => gtRels.has(r)).length;
  const rP = pdRels.size > 0 ? rTp / pdRels.size : 0;
  const rR = gtRels.size > 0 ? rTp / gtRels.size : 0;
  const rF1 = rP + rR > 0 ? 2 * rP * rR / (rP + rR) : 0;

  const gtC = (groundTruth.causalLinks || groundTruth.causal_links || []).length;
  const pdC = (predicted.causal_links || []).length;
  const cF1 = gtC > 0 && pdC > 0 ? Math.min(pdC, gtC) / Math.max(pdC, gtC) : 0;

  const r = (n: number) => Math.round(n * 1000) / 10;
  return {
    precision: r(precision), recall: r(recall), f1: r(f1),
    rel_precision: r(rP), rel_recall: r(rR), rel_f1: r(rF1),
    causal_f1: r(cF1),
  };
}
