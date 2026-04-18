/**
 * Layer A — Authoritative Knowledge-Base Grounding
 *
 * Validates every mitre_id, cve_id, and stix_type emitted by the LLM against
 * the canonical lists stored in the `kb_entries` table. Returns a validation
 * report flagging hallucinated IDs with corrections when possible.
 *
 * Deterministic, no LLM call — fast post-extraction guardrail.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VALID_STIX_SDO = new Set([
  "threat-actor", "malware", "vulnerability", "attack-pattern",
  "infrastructure", "tool", "campaign", "indicator", "identity",
  "observed-data", "intrusion-set", "course-of-action", "report",
]);

const VALID_STIX_SRO = new Set([
  "uses", "targets", "attributed-to", "communicates-with", "exploits",
  "delivers", "drops", "indicates", "mitigates", "derived-from", "related-to",
  "located-at", "based-on", "owns", "hosts",
]);

interface ValidationFinding {
  kind: "ok" | "hallucinated" | "malformed" | "non_canonical";
  id_type: "mitre_technique" | "mitre_tactic" | "cve" | "stix_sdo" | "stix_sro" | "capec";
  raw_value: string;
  matched_name?: string | null;
  suggestion?: string | null;
  entity_name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { entities = [], relations = [], causal_links = [] } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pre-load all KB entries (small table)
    const { data: kb } = await supabase.from("kb_entries").select("*");
    const techniqueSet = new Set<string>(), tacticSet = new Set<string>(), cveSet = new Set<string>(), capecSet = new Set<string>();
    const nameById = new Map<string, string>();
    (kb || []).forEach((row: any) => {
      if (row.kb_type === "mitre_technique") techniqueSet.add(row.external_id);
      else if (row.kb_type === "mitre_tactic") tacticSet.add(row.external_id);
      else if (row.kb_type === "cve") cveSet.add(row.external_id);
      else if (row.kb_type === "capec") capecSet.add(row.external_id);
      nameById.set(row.external_id, row.name);
    });

    const findings: ValidationFinding[] = [];

    const techRe = /^T\d{4}(\.\d{3})?$/;
    const tacticRe = /^TA\d{4}$/;
    const cveRe = /^CVE-\d{4}-\d{4,7}$/i;
    const capecRe = /^CAPEC-\d+$/i;

    const checkId = (raw: string, ctx: { entity_name?: string }) => {
      if (!raw) return;
      const value = String(raw).trim();
      if (techRe.test(value)) {
        if (techniqueSet.has(value)) {
          findings.push({ kind: "ok", id_type: "mitre_technique", raw_value: value, matched_name: nameById.get(value), ...ctx });
        } else {
          // Try parent technique fallback
          const parent = value.split(".")[0];
          findings.push({
            kind: "hallucinated", id_type: "mitre_technique", raw_value: value,
            suggestion: techniqueSet.has(parent) ? parent : null,
            ...ctx,
          });
        }
      } else if (tacticRe.test(value)) {
        findings.push({
          kind: tacticSet.has(value) ? "ok" : "hallucinated",
          id_type: "mitre_tactic", raw_value: value,
          matched_name: nameById.get(value) ?? null, ...ctx,
        });
      } else if (cveRe.test(value)) {
        findings.push({
          kind: cveSet.has(value.toUpperCase()) ? "ok" : "non_canonical",
          id_type: "cve", raw_value: value,
          matched_name: nameById.get(value.toUpperCase()) ?? null,
          suggestion: cveSet.has(value.toUpperCase()) ? null : "Not in local KB snapshot — verify against NVD",
          ...ctx,
        });
      } else if (capecRe.test(value)) {
        findings.push({
          kind: capecSet.has(value.toUpperCase()) ? "ok" : "non_canonical",
          id_type: "capec", raw_value: value, ...ctx,
        });
      }
    };

    // Validate entities: mitre_id + stix_type + scan name for embedded IDs
    for (const e of entities) {
      if (e?.mitre_id) checkId(e.mitre_id, { entity_name: e.name });
      // also scan the name itself
      if (typeof e?.name === "string") {
        const m = e.name.match(/(T\d{4}(?:\.\d{3})?|TA\d{4}|CVE-\d{4}-\d{4,7}|CAPEC-\d+)/i);
        if (m) checkId(m[0], { entity_name: e.name });
      }
      if (e?.stix_type) {
        findings.push({
          kind: VALID_STIX_SDO.has(String(e.stix_type)) ? "ok" : "malformed",
          id_type: "stix_sdo", raw_value: String(e.stix_type),
          entity_name: e.name,
        });
      }
    }

    // Validate relation predicates
    for (const r of relations) {
      if (r?.relation && !["enables", "leads_to", "triggers", "precedes", "indirectly-exploits", "indirectly_exploits"].includes(String(r.relation))) {
        findings.push({
          kind: VALID_STIX_SRO.has(String(r.relation)) ? "ok" : "malformed",
          id_type: "stix_sro", raw_value: String(r.relation),
          entity_name: `${r.source}→${r.target}`,
        });
      }
    }

    // Validate causal-link mitre tactics
    for (const c of causal_links) {
      if (c?.mitre_tactic) checkId(c.mitre_tactic, { entity_name: `${c.cause}→${c.effect}` });
    }

    const summary = {
      total_checks: findings.length,
      ok: findings.filter((f) => f.kind === "ok").length,
      hallucinated: findings.filter((f) => f.kind === "hallucinated").length,
      malformed: findings.filter((f) => f.kind === "malformed").length,
      non_canonical: findings.filter((f) => f.kind === "non_canonical").length,
    };
    const accuracy = summary.total_checks > 0 ? summary.ok / summary.total_checks : 1;

    // Log monitoring event
    await supabase.from("monitoring_events").insert({
      event_type: "kb_validation",
      category: "grounding",
      title: `Layer A validation: ${summary.ok}/${summary.total_checks} IDs verified`,
      detail: `${summary.hallucinated} hallucinated, ${summary.malformed} malformed, ${summary.non_canonical} non-canonical`,
      metadata: { summary, accuracy },
    });

    return new Response(JSON.stringify({ findings, summary, accuracy, kb_size: kb?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("kb-validate error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
