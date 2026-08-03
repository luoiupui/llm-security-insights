// C3 — LLM conflict-rule mining with human-in-the-loop.
//
// Reads recent pipeline evidence, asks the model to propose candidate
// conflict rules, and writes them to `kg_conflict_rule_candidates` with
// status = 'proposed'. Nothing is ever auto-activated: a human must accept
// a candidate in the Rule Governance panel before it can affect the KG.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";
import { generateText, Output, NoObjectGeneratedError } from "npm:ai@^5";
import { z } from "npm:zod@^3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CandidateSchema = z.object({
  candidates: z.array(
    z.object({
      rule_key: z.string(),
      taxonomy: z.string(),
      when_pattern: z.string(),
      then_violation: z.string(),
      severity: z.string(),
      rationale: z.string(),
      confidence: z.number(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are a CTI knowledge-graph quality engineer.
You are shown recent extraction evidence and conflict-detection outcomes from a threat-intelligence pipeline.
Propose NEW deterministic conflict-detection rules that the existing rulebase does not already cover.

Existing coverage (do not duplicate):
- Expert baseline: temporal overlap, TTP consistency, infrastructure reuse, credibility, causal coherence, attribution contradiction, entity duplication, graph connectivity, STIX ontological compliance, confidence propagation, multi-modal agreement/freshness/provenance.
- C1 temporal: causal-verb monotonicity, cause/effect timestamp order, drift window, actor alias flip, report-timeline change.
- C2 kill-chain: stage jumper, stage inversion, causal cycle, orphan impact.

Rules for your output:
- Each candidate must be checkable deterministically on {entities, relations, causal_links} without calling an LLM.
- when_pattern: a short pseudo-predicate string, e.g. "relation.relation == 'uses' && target.type != 'ttp'".
- then_violation: a one-line description of the violation raised.
- severity: exactly "warning" or "failure".
- confidence: a number between 0 and 1.
- Propose at most 5 candidates. Keep every string under 240 characters.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { limit = 40, domain = "cti" } = await req.json().catch(() => ({}));
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [{ data: events }, { data: relations }] = await Promise.all([
      client
        .from("monitoring_events")
        .select("event_type,title,detail,metadata,created_at")
        .order("created_at", { ascending: false })
        .limit(limit),
      client
        .from("kg_relations")
        .select("source_name,relation,target_name,confidence,edge_type")
        .order("created_at", { ascending: false })
        .limit(limit * 3),
    ]);

    const evidence = JSON.stringify({
      recent_events: (events ?? []).slice(0, limit),
      recent_relations: (relations ?? []).slice(0, limit * 2),
    }).slice(0, 24_000);

    const gateway = createLovableAiGatewayProvider(apiKey);
    let parsed: z.infer<typeof CandidateSchema> = { candidates: [] };

    try {
      const { output } = await generateText({
        model: gateway("openai/gpt-5.6-sol"),
        output: Output.object({ schema: CandidateSchema }),
        system: SYSTEM_PROMPT,
        prompt: `Domain: ${domain}\n\nRecent pipeline evidence (JSON):\n${evidence}`,
        providerOptions: { lovable: { reasoningEffort: "none" } },
      });
      parsed = output as z.infer<typeof CandidateSchema>;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        try {
          parsed = CandidateSchema.parse(JSON.parse(error.text ?? "{}"));
        } catch {
          parsed = { candidates: [] };
        }
      } else {
        const message = error instanceof Error ? error.message : "mining failed";
        const status = /rate limit|429/i.test(message) ? 429 : /credit|402/i.test(message) ? 402 : 500;
        return new Response(JSON.stringify({ error: message }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rows = (parsed.candidates ?? []).slice(0, 5).map((c) => ({
      rule_key: String(c.rule_key).slice(0, 120),
      taxonomy: String(c.taxonomy).slice(0, 60),
      when_pattern: { expr: String(c.when_pattern).slice(0, 240) },
      then_violation: {
        message: String(c.then_violation).slice(0, 240),
        severity: c.severity === "failure" ? "failure" : "warning",
      },
      rationale: String(c.rationale).slice(0, 600),
      llm_confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.5)),
      status: "proposed",
      domain,
    }));

    if (rows.length > 0) {
      const { error } = await client.from("kg_conflict_rule_candidates").insert(rows);
      if (error) throw error;
    }

    await client.from("monitoring_events").insert({
      event_type: "rule_mining",
      category: "pipeline",
      title: `C3 rule mining proposed ${rows.length} candidate(s)`,
      detail: rows.map((r) => r.rule_key).join(", ") || "no candidates",
      metadata: { path: "rule_governance", domain },
    });

    return new Response(JSON.stringify({ proposed: rows.length, candidates: rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-conflicts-mine error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
