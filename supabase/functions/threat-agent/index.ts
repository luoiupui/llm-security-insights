// ════════════════════════════════════════════════════════════════════════════
// THREAT-AGENT — Pathway A: True AI-SDK agent loop
// ════════════════════════════════════════════════════════════════════════════
//
// Differs from the deterministic pipeline (Pathway B) in one critical way:
// the model decides which tool to call next, in what order, and when to stop.
// Tools are thin wrappers around the existing edge functions, so business
// logic is NOT duplicated. The full step trace is returned for inspection.
//
// EXPERIMENTAL — not scored by KG-Bench (which requires deterministic order).
// ════════════════════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateText, stepCountIs, tool } from "npm:ai@^5";
import { z } from "npm:zod@^3";
import { createLovableAiGatewayProvider } from "../_shared/ai-gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function invokeFn(name: string, body: unknown): Promise<unknown> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

const AGENT_SYSTEM_PROMPT = `You are ThreatGraph-Agent — an autonomous knowledge-graph construction agent.

You have tools that perform each stage of KG construction. Unlike a fixed pipeline,
YOU decide the order, when to repeat a step, and when to stop. Aim for a complete
KG with high credibility.

TYPICAL PRODUCTIVE ORDER (you may deviate when justified):
  1. preprocess(text)           — clean text, find IOCs/clinical codes
  2. retrieve(text)             — fetch prior KG context (RAG)
  3. extract(text, rag_context) — Graph-Native CoT extraction
  4. kb_validate(entities,…)    — ground against MITRE/CISA or clinical KB
  5. detect_conflicts(…)        — neuro-symbolic critic
  6. attribute(query,…)         — graph-path attribution
  7. persist(extraction)        — write to KG (needs approval)

When to deviate:
- Skip retrieve() if text is self-contained and short.
- Re-run extract() with refined prompt if kb_validate shows >40% hallucination.
- Stop early if user only asked for a quick sanity check.

Always finish with a 2-3 sentence natural-language summary of the resulting KG.`;

interface AgentRequest { text: string; domain?: "cti" | "clinical"; query?: string }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text, domain = "cti", query } = (await req.json()) as AgentRequest;
    if (!text || text.trim().length < 10) {
      return new Response(JSON.stringify({ error: "text too short" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const gateway = createLovableAiGatewayProvider(LOVABLE_API_KEY);
    const model = gateway("google/gemini-3-flash-preview");

    // Shared scratchpad — tools mutate so later steps can reference earlier outputs.
    const scratch: Record<string, unknown> = { domain };

    const tools = {
      preprocess: tool({
        description: "Clean raw text and extract IOCs (CTI) or clinical codes (Clinical).",
        inputSchema: z.object({ text: z.string() }),
        execute: async ({ text }) => {
          const r = await invokeFn("threat-preprocess", { text, domain }) as Record<string, unknown>;
          scratch.preprocess = r;
          return { ok: true, iocs_found: (r.iocs_found as unknown[])?.length ?? 0, source_type: r.source_type, reliability: r.reliability_score };
        },
      }),
      retrieve: tool({
        description: "Vector-RAG + GraphRAG: fetch similar prior reports and subgraph context.",
        inputSchema: z.object({ text: z.string(), top_k: z.number().int().min(1).max(10).default(3) }),
        execute: async ({ text, top_k }) => {
          const r = await invokeFn("threat-rag", { action: "embed_and_retrieve", text, top_k }) as Record<string, unknown>;
          scratch.rag = r;
          const sims = (r.similar_reports as unknown[])?.length ?? 0;
          const sg = (r.subgraph as { entities?: unknown[] })?.entities?.length ?? 0;
          return { similar_reports: sims, subgraph_entities: sg, has_context_block: !!r.context_block };
        },
      }),
      extract: tool({
        description: "Graph-Native CoT extraction. Returns entities, relations, causal links.",
        inputSchema: z.object({
          text: z.string(),
          mode: z.enum(["full", "ner", "re", "causality"]).default("full"),
          use_rag: z.boolean().default(true),
        }),
        execute: async ({ text, mode, use_rag }) => {
          const pre = scratch.preprocess as Record<string, unknown> | undefined;
          const rag = scratch.rag as { context_block?: string } | undefined;
          const r = await invokeFn("threat-extract", {
            text, mode, domain,
            source_type: pre?.source_type,
            reliability: pre?.reliability_score,
            rag_context: use_rag ? (rag?.context_block ?? "") : "",
          }) as Record<string, unknown>;
          scratch.extract = r;
          const gn = r.graph_native as { nodes?: unknown[]; edges?: unknown[] } | undefined;
          const ner = r.ner as { entities?: unknown[] } | undefined;
          const re = r.re as { relations?: unknown[] } | undefined;
          const causality = r.causality as { causal_links?: unknown[] } | undefined;
          return {
            nodes: gn?.nodes?.length ?? ner?.entities?.length ?? 0,
            edges: gn?.edges?.length ?? re?.relations?.length ?? 0,
            causal_links: causality?.causal_links?.length ?? 0,
          };
        },
      }),
      kb_validate: tool({
        description: "Ground extracted entities against authoritative KB (MITRE/CISA or clinical codes). Detects hallucinations.",
        inputSchema: z.object({}),
        execute: async () => {
          const ext = scratch.extract as Record<string, unknown> | undefined;
          if (!ext) return { error: "call extract first" };
          const pre = scratch.preprocess as { cleaned_text?: string } | undefined;
          const ner = ext.ner as { entities?: unknown[] } | undefined;
          const re = ext.re as { relations?: unknown[] } | undefined;
          const causality = ext.causality as { causal_links?: unknown[] } | undefined;
          const r = await invokeFn("kb-validate", {
            entities: ner?.entities ?? [],
            relations: re?.relations ?? [],
            causal_links: causality?.causal_links ?? [],
            source_text: pre?.cleaned_text ?? "",
            domain,
          }) as Record<string, unknown>;
          scratch.kbValidation = r;
          const s = r.summary as { ok?: number; total_checks?: number; hallucinated?: number } | undefined;
          return { accuracy: r.accuracy, ok: s?.ok, total: s?.total_checks, hallucinated: s?.hallucinated };
        },
      }),
      detect_conflicts: tool({
        description: "Run 10 neuro-symbolic conflict rules + compute credibility score.",
        inputSchema: z.object({}),
        execute: async () => {
          const ext = scratch.extract as Record<string, unknown> | undefined;
          if (!ext) return { error: "call extract first" };
          const pre = scratch.preprocess as { reliability_score?: number } | undefined;
          const ner = ext.ner as { entities?: unknown[] } | undefined;
          const re = ext.re as { relations?: unknown[] } | undefined;
          const causality = ext.causality as { causal_links?: unknown[] } | undefined;
          const r = await invokeFn("threat-conflicts", {
            entities: ner?.entities ?? [],
            relations: re?.relations ?? [],
            causal_links: causality?.causal_links ?? [],
            reliability: pre?.reliability_score,
            graph_native: ext.graph_native,
            domain,
          }) as Record<string, unknown>;
          scratch.conflicts = r;
          const s = r.summary as { passed?: number; warnings?: number; failures?: number } | undefined;
          return { passed: s?.passed, warnings: s?.warnings, failures: s?.failures, credibility: r.credibility_score };
        },
      }),
      attribute: tool({
        description: "Graph-path actor attribution. Provide a natural-language query.",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const ext = scratch.extract as Record<string, unknown> | undefined;
          if (!ext) return { error: "call extract first" };
          const ner = ext.ner as { entities?: unknown[] } | undefined;
          const re = ext.re as { relations?: unknown[] } | undefined;
          const causality = ext.causality as { causal_links?: unknown[] } | undefined;
          const r = await invokeFn("threat-kg-query", {
            query,
            entities: ner?.entities ?? [],
            relations: re?.relations ?? [],
            causal_links: causality?.causal_links ?? [],
            graph_native: ext.graph_native,
            domain,
          }) as Record<string, unknown>;
          scratch.attribution = r;
          return { attributed_actor: r.attributed_actor, confidence: r.confidence };
        },
      }),
      finish: tool({
        description: "Call this when the KG is complete enough. Provide a 2-3 sentence summary.",
        inputSchema: z.object({ summary: z.string() }),
        execute: async ({ summary }) => {
          scratch.summary = summary;
          return { done: true };
        },
      }),
    } as const;

    const startedAt = Date.now();
    const result = await generateText({
      model,
      system: AGENT_SYSTEM_PROMPT,
      prompt: `Domain: ${domain.toUpperCase()}\nUser query: ${query ?? "Construct the most complete KG you can."}\n\nSOURCE TEXT:\n${text}`,
      tools,
      stopWhen: stepCountIs(50),
    });

    // Flatten the AI SDK step trace into a UI-friendly shape.
    const trace = result.steps.map((s, i) => ({
      step: i + 1,
      text: s.text ?? "",
      tool_calls: (s.toolCalls ?? []).map((c) => ({
        name: c.toolName,
        input: c.input,
      })),
      tool_results: (s.toolResults ?? []).map((c) => ({
        name: c.toolName,
        output: c.output,
      })),
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        domain,
        elapsed_ms: Date.now() - startedAt,
        steps_taken: result.steps.length,
        finish_reason: result.finishReason,
        summary: scratch.summary ?? result.text,
        trace,
        scratch: {
          preprocess_iocs: (scratch.preprocess as { iocs_found?: unknown[] } | undefined)?.iocs_found?.length ?? 0,
          extract_nodes: (scratch.extract as { graph_native?: { nodes?: unknown[] } } | undefined)?.graph_native?.nodes?.length ?? 0,
          kb_accuracy: (scratch.kbValidation as { accuracy?: number } | undefined)?.accuracy,
          credibility: (scratch.conflicts as { credibility_score?: number } | undefined)?.credibility_score,
          attribution: (scratch.attribution as { attributed_actor?: string } | undefined)?.attributed_actor,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("threat-agent error:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
