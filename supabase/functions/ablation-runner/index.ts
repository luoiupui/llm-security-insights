import { LLM_CHAT_URL, LLM_MODEL, llmHeaders } from "../_shared/llm-endpoint.ts";
/**
 * ablation-runner — Component ablation for the ThreatGraph extraction pipeline.
 *
 * Toggles three independent design choices on/off and re-runs the same input
 * through Gemini-3-flash-preview, then computes precision/recall/F1 against
 * hand-labelled gold and a hallucination KPI against Layer A KB.
 *
 * Configurations (binary switches → 4 variants reported):
 *   FULL       : CoT=on,  KB=on,  SYM=on   (= "ours" in baselines)
 *   NO_COT     : CoT=off, KB=on,  SYM=on
 *   NO_KB      : CoT=on,  KB=off, SYM=on
 *   NO_SYM     : CoT=on,  KB=on,  SYM=off
 *
 * • CoT switch  : 8-step graph-native CoT system prompt vs vanilla 1-shot prompt.
 * • KB switch   : strip non-canonical MITRE/CVE/CAPEC IDs from output before scoring.
 * • SYM switch  : drop entities with confidence < 0.4 and de-duplicate (the symbolic
 *                 floor rule + entity-confidence rule from the neuro-symbolic engine).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_GATEWAY = LLM_CHAT_URL;
const MODEL = "google/gemini-3-flash-preview";

const COT_SYSTEM = `You are a Graph-Native Cyber Threat Intelligence Reasoning Engine.
Reason in (Subject, Predicate, Object) triples. Enforce STIX 2.1 ontology while reasoning.
Use 8 explicit Chain-of-Thought steps: (1) narrative seed, (2) ontology-grounded node expansion,
(3) predicate inference with evidence, (4) temporal subgraph, (5) causal fusion,
(6) consistency validation, (7) confidence propagation, (8) graph serialization.`;
const ZS_SYSTEM = `Extract cyber threat intelligence entities and relations from the text. Return JSON.`;

interface Variant {
  id: "FULL" | "NO_COT" | "NO_KB" | "NO_SYM";
  cot: boolean;
  kb: boolean;
  sym: boolean;
}
const VARIANTS: Variant[] = [
  { id: "FULL",   cot: true,  kb: true,  sym: true  },
  { id: "NO_COT", cot: false, kb: true,  sym: true  },
  { id: "NO_KB",  cot: true,  kb: false, sym: true  },
  { id: "NO_SYM", cot: true,  kb: true,  sym: false },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { cases } = await req.json();
    if (!Array.isArray(cases) || cases.length === 0) {
      return new Response(JSON.stringify({ error: "cases[] required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load Layer A KB once
    const kb = await loadKB(supabase);

    // Per-variant aggregates
    const agg: Record<string, {
      n: number; p: number; r: number; f1: number;
      relP: number; relR: number; relF1: number;
      false_entity_rate: number; false_relation_rate: number;
      hallucinated_ids: number; predicted_entities: number;
    }> = {};
    for (const v of VARIANTS) agg[v.id] = {
      n: 0, p: 0, r: 0, f1: 0, relP: 0, relR: 0, relF1: 0,
      false_entity_rate: 0, false_relation_rate: 0,
      hallucinated_ids: 0, predicted_entities: 0,
    };

    // Per-case rows for the report
    const rows: any[] = [];

    for (const c of cases) {
      const text: string = c.text;
      const gt = c.groundTruth || c.ground_truth;
      if (!text || !gt) continue;

      // We only need 2 LLM calls per case (CoT + ZS); KB/SYM are post-processing toggles.
      const [cotOut, zsOut] = await Promise.all([
        runLLM(text, COT_SYSTEM, true),
        runLLM(text, ZS_SYSTEM, false),
      ]);

      const caseRow: any = { id: c.id, source: c.source };
      for (const v of VARIANTS) {
        const base = v.cot ? cotOut : zsOut;
        let out = base;
        if (v.kb)  out = applyKBFilter(out, kb);
        if (v.sym) out = applySymbolic(out);

        const m = computeMetrics(out, gt);
        const h = hallucinationKPIs(out, gt, kb);
        const a = agg[v.id]; a.n += 1;
        a.p += m.precision; a.r += m.recall; a.f1 += m.f1;
        a.relP += m.rel_precision; a.relR += m.rel_recall; a.relF1 += m.rel_f1;
        a.false_entity_rate += h.false_entity_rate;
        a.false_relation_rate += h.false_relation_rate;
        a.hallucinated_ids += h.hallucinated_ids;
        a.predicted_entities += h.predicted_entities;
        caseRow[v.id] = { metrics: m, hall: h };
      }
      rows.push(caseRow);
    }

    const summary = VARIANTS.map((v) => {
      const a = agg[v.id]; const n = Math.max(1, a.n);
      const r = (x: number) => Math.round((x / n) * 10) / 10;
      return {
        variant: v.id,
        config: { cot: v.cot, kb: v.kb, sym: v.sym },
        n: a.n,
        avg_precision: r(a.p),
        avg_recall: r(a.r),
        avg_f1: r(a.f1),
        avg_rel_f1: r(a.relF1),
        avg_false_entity_rate: r(a.false_entity_rate),
        avg_false_relation_rate: r(a.false_relation_rate),
        total_hallucinated_ids: a.hallucinated_ids,
        total_predicted_entities: a.predicted_entities,
      };
    });

    // Persist a single rich ablation event
    try {
      await supabase.from("monitoring_events").insert({
        event_type: "ablation_run",
        category: "experiment",
        title: `Ablation · n=${cases.length} · FULL F1=${summary[0].avg_f1}% · NO_COT=${summary[1].avg_f1}% · NO_KB=${summary[2].avg_f1}% · NO_SYM=${summary[3].avg_f1}%`,
        detail:
          `FULL false-entity=${summary[0].avg_false_entity_rate}% · ` +
          `NO_COT=${summary[1].avg_false_entity_rate}% · ` +
          `NO_KB=${summary[2].avg_false_entity_rate}% · ` +
          `NO_SYM=${summary[3].avg_false_entity_rate}%`,
        metadata: { summary, n_cases: cases.length, variants: VARIANTS },
      });
    } catch (e) { console.error("ablation log error", e); }

    return new Response(JSON.stringify({ summary, rows, n_cases: cases.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("ablation-runner error:", err);
    return new Response(JSON.stringify({ error: err?.message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── helpers ── */

async function runLLM(text: string, sys: string, useCot: boolean) {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
  const userPrompt = useCot
    ? `Apply the 8-step Graph-Native CoT and return ONLY a JSON object with shape:
{"entities":[{"name","type","confidence"}],"relations":[{"source","relation","target","confidence"}],"causal_links":[{"cause","effect","causal_type","temporal_order","confidence"}]}
TEXT:
${text}`
    : `Extract entities and relations from this CTI text. Return ONLY JSON of shape:
{"entities":[{"name","type","confidence"}],"relations":[{"source","relation","target","confidence"}],"causal_links":[]}
TEXT:
${text}`;
  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: llmHeaders(LOVABLE_API_KEY),
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!resp.ok) throw new Error(`LLM ${resp.status}`);
  const data = await resp.json();
  try {
    const p = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return {
      entities: p.entities ?? [], relations: p.relations ?? [], causal_links: p.causal_links ?? [],
    };
  } catch { return { entities: [], relations: [], causal_links: [] }; }
}

async function loadKB(supabase: any) {
  const { data } = await supabase.from("kb_entries").select("external_id, kb_type");
  const tech = new Set<string>(), tactic = new Set<string>(), cve = new Set<string>(), capec = new Set<string>();
  (data || []).forEach((row: any) => {
    if (row.kb_type === "mitre_technique") tech.add(row.external_id);
    else if (row.kb_type === "mitre_tactic") tactic.add(row.external_id);
    else if (row.kb_type === "cve") cve.add(String(row.external_id).toUpperCase());
    else if (row.kb_type === "capec") capec.add(String(row.external_id).toUpperCase());
  });
  return { tech, tactic, cve, capec, size: (data || []).length };
}

const techRe = /^T\d{4}(\.\d{3})?$/;
const tacticRe = /^TA\d{4}$/;
const cveRe = /^CVE-\d{4}-\d{4,7}$/i;
const capecRe = /^CAPEC-\d+$/i;

function isCanonical(name: string, kb: any) {
  const v = String(name ?? "").trim();
  if (techRe.test(v))  return kb.tech.has(v);
  if (tacticRe.test(v)) return kb.tactic.has(v);
  if (cveRe.test(v))   return kb.cve.has(v.toUpperCase());
  if (capecRe.test(v)) return kb.capec.has(v.toUpperCase());
  return true; // not an ID → not subject to KB filter
}

function applyKBFilter(out: any, kb: any) {
  const ents = (out.entities || []).filter((e: any) => isCanonical(e?.name ?? "", kb));
  const rels = (out.relations || []).filter((r: any) =>
    isCanonical(r?.source ?? "", kb) && isCanonical(r?.target ?? "", kb));
  return { ...out, entities: ents, relations: rels };
}

function applySymbolic(out: any) {
  // Symbolic floor rule + de-dup (mirrors two of the 10 rules in threat-conflicts).
  const seen = new Set<string>();
  const ents = (out.entities || [])
    .filter((e: any) => Number(e?.confidence ?? 1) >= 0.4)
    .filter((e: any) => {
      const k = `${String(e?.name ?? "").toLowerCase()}|${e?.type ?? ""}`;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
  const valid = new Set(ents.map((e: any) => String(e.name).toLowerCase()));
  const rels = (out.relations || [])
    .filter((r: any) => Number(r?.confidence ?? 1) >= 0.4)
    .filter((r: any) => valid.has(String(r?.source ?? "").toLowerCase())
                     && valid.has(String(r?.target ?? "").toLowerCase()));
  return { ...out, entities: ents, relations: rels };
}

function computeMetrics(predicted: any, gt: any) {
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const gtE = new Set((gt.entities || []).map((e: any) => norm(e.name)));
  const pdE = new Set((predicted.entities || []).map((e: any) => norm(e.name)));
  const tp = [...pdE].filter((e) => gtE.has(e)).length;
  const p = pdE.size ? tp / pdE.size : 0;
  const r = gtE.size ? tp / gtE.size : 0;
  const f1 = p + r ? 2 * p * r / (p + r) : 0;
  const k = (x: any) => `${norm(x?.source)}→${norm(x?.relation ?? x?.predicate)}→${norm(x?.target)}`;
  const gtR = new Set((gt.relations || []).map(k));
  const pdR = new Set((predicted.relations || []).map(k));
  const rTp = [...pdR].filter((x) => gtR.has(x)).length;
  const rP = pdR.size ? rTp / pdR.size : 0;
  const rR = gtR.size ? rTp / gtR.size : 0;
  const rF = rP + rR ? 2 * rP * rR / (rP + rR) : 0;
  const round = (n: number) => Math.round(n * 1000) / 10;
  return {
    precision: round(p), recall: round(r), f1: round(f1),
    rel_precision: round(rP), rel_recall: round(rR), rel_f1: round(rF),
  };
}

function hallucinationKPIs(predicted: any, gt: any, kb: any) {
  const norm = (s: any) => String(s ?? "").trim().toLowerCase();
  const gtE = new Set((gt.entities || []).map((e: any) => norm(e.name)));
  const pdE = (predicted.entities || []).filter((e: any) => e?.name);
  const fe = pdE.filter((e: any) => !gtE.has(norm(e.name)));
  const k = (x: any) => `${norm(x?.source)}→${norm(x?.relation ?? x?.predicate)}→${norm(x?.target)}`;
  const gtR = new Set((gt.relations || []).map(k));
  const pdR = (predicted.relations || []).filter((r: any) => r);
  const fr = pdR.filter((r: any) => !gtR.has(k(r)));
  let hall = 0;
  for (const e of pdE) {
    const v = String(e?.name ?? "").trim();
    if (techRe.test(v) && !kb.tech.has(v)) hall++;
    else if (tacticRe.test(v) && !kb.tactic.has(v)) hall++;
  }
  const round = (n: number) => Math.round(n * 1000) / 10;
  return {
    predicted_entities: pdE.length,
    false_entity_rate: pdE.length ? round(fe.length / pdE.length) : 0,
    predicted_relations: pdR.length,
    false_relation_rate: pdR.length ? round(fr.length / pdR.length) : 0,
    hallucinated_ids: hall,
  };
}
