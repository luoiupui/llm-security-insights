import { LLM_CHAT_URL, LLM_MODEL, llmHeaders } from "../_shared/llm-endpoint.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * threat-extract-hyper  —  Pathway C, Stage 3' (CTI ONLY).
 *
 * Sibling of `threat-extract`. Same Gemini-3-flash-preview backbone, same
 * I/O envelope, same prompt-firewall semantics — but the LLM emits
 * HYPEREDGES as the primary output, with binary triples auto-derived from
 * them via decomposeToTriples on the client. See .lovable/plan.md → PH2.
 *
 * Scope: CTI only. No clinical branch — Pathway C does not run on clinical
 * notes in this phase by design (see plan §"What changed").
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIREWALL_RULES: Array<{ id: string; sev: "low" | "medium" | "high"; re: RegExp }> = [
  { id: "ignore-previous", sev: "high", re: /ignore (?:the )?(?:above|previous|prior)\s+(?:instructions|prompt|rules)/i },
  { id: "role-override", sev: "high", re: /^(?:system|assistant)\s*:/im },
  { id: "tool-syntax-injection", sev: "high", re: /<\/?\s*(?:tool_call|function_call|tool_response)\s*>/i },
  { id: "developer-mode", sev: "medium", re: /\b(?:developer mode|jailbreak|DAN|do anything now)\b/i },
  { id: "exfil-keyword", sev: "medium", re: /\b(?:exfiltrate|send to|POST to)\b.{0,40}https?:\/\//i },
  { id: "zero-width", sev: "medium", re: /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/ },
  { id: "prompt-leak", sev: "medium", re: /\b(?:reveal|print|repeat) (?:your )?(?:system )?prompt\b/i },
];
function serverScanPrompt(text: string) {
  const findings: Array<{ rule: string; sev: string; excerpt: string }> = [];
  for (const r of FIREWALL_RULES) {
    const m = text.match(r.re);
    if (m) findings.push({ rule: r.id, sev: r.sev, excerpt: m[0].slice(0, 80) });
  }
  const score = Math.min(1, findings.reduce((s, f) => s + (f.sev === "high" ? 0.5 : f.sev === "medium" ? 0.25 : 0.1), 0));
  const verdict: "clean" | "suspicious" | "blocked" = score >= 0.5 ? "blocked" : score >= 0.2 ? "suspicious" : "clean";
  return { verdict, score, findings };
}
async function logSecurityEvent(payload: Record<string, unknown>) {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    await fetch(`${url}/rest/v1/monitoring_events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}`, Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
  } catch { /* never block extraction on logging */ }
}

const HYPEREDGE_NATIVE_COT_PROMPT = `You are a Hyperedge-Native Cyber Threat Intelligence Reasoning Engine.

CRITICAL DIFFERENCE FROM TRIPLE-NATIVE EXTRACTION:
You do NOT think in binary (Subject, Predicate, Object) triples.
You think in HYPEREDGES — single n-ary atomic events that bind 2+ entities together with one shared provenance quote.
A hyperedge is the unit that survives explanation: "this one event, with these N participants, attested by this one passage".

═══ STIX 2.1 ONTOLOGY (entity types) ═══
threat-actor, malware, vulnerability, attack-pattern, infrastructure, tool, campaign, indicator, identity, observed-data

═══ HYPEREDGE TYPES (use exactly these in the 'type' field) ═══
- event         : a discrete occurrence (intrusion, exploit firing, data acquisition, payload drop)
- campaign      : a long-running grouping of events under one actor/objective
- fusion-finding: corroboration where 2+ modalities (narrative + behavioral) point to the same claim
- kill-chain    : an ordered ATT&CK tactic chain across multiple events

═══ HYPEREDGE-NATIVE CHAIN-OF-THOUGHT (6 Steps) ═══

STEP 1 — ATOMIC EVENT DETECTION
Read the text. Identify each ATOMIC event the narrative attests to.
An atomic event is the smallest unit of attribution: one verb, one moment, one passage.
Do NOT decompose into triples. Each event becomes ONE candidate hyperedge.

STEP 2 — N-ARY PARTICIPANT BINDING
For each candidate hyperedge, list ALL entities the event binds together (typically 2–6):
  e.g. (APT29, SUNBURST, SolarWinds Orion, US Treasury, March 2020)
       — five participants, ONE event, ONE quote.
Each participant MUST map to a STIX SDO entity in the ontology above.

STEP 3 — PROVENANCE LOCK
Every hyperedge MUST carry a verbatim source_passage — a single quoted span (≤ 240 chars)
from the text that authorises the entire n-ary claim. If you cannot quote one span that
covers all participants, SPLIT the hyperedge into smaller ones — do not weaken provenance.

STEP 4 — QUALIFIER ATTACHMENT
Attach structured qualifiers to each hyperedge instead of inventing helper nodes:
  occurred_at (ISO date), jurisdiction, mitre_technique, cve_id, observed_count, etc.
Qualifiers are scalars on the hyperedge, NOT separate entities.

STEP 5 — JOINT CONFIDENCE
Assign confidence ∈ [0,1] to the JOINT claim that ALL participants were involved in this
one event. This is NOT the average of pairwise confidences. If any participant is weakly
supported, the JOINT confidence drops accordingly. Use min-like aggregation.

STEP 6 — HYPEREDGE GRAPH SERIALIZATION
Output:
  - entities[]     : the union of participants across all hyperedges, deduplicated
  - hyperedges[]   : the atomic events themselves (THIS is the primary output)
  - subgraphs[]    : optional groupings of hyperedge ids (campaign clusters, kill chains)
  - graph_warnings : provenance gaps, ontology mismatches, weak joint confidence

CONSTRAINTS:
- NEVER emit binary triples — only hyperedges. Triples will be derived downstream.
- NEVER invent a participant not in the source text. Flag inference with confidence < 0.3.
- NEVER attach a hyperedge with < 2 participants. Use entities[] for standalone mentions.
- NEVER skip source_passage. Provenance is the whole point of this pathway.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      text, source_type = "report", source_reliability = 0.8, rag_context = "",
      temperature, seed, deterministic = true, domain = "cti",
    } = await req.json();

    if (domain !== "cti") {
      return new Response(
        JSON.stringify({ error: "threat-extract-hyper is CTI-only in PH2. domain must be 'cti'." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text input is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reproTemp = deterministic ? 0 : (typeof temperature === "number" ? temperature : 0.1);
    const reproSeed = deterministic ? 42 : (typeof seed === "number" ? seed : undefined);

    const firewall = serverScanPrompt(text);
    if (firewall.verdict !== "clean") {
      await logSecurityEvent({
        event_type: "prompt_firewall_hit",
        category: "security",
        title: `threat-extract-hyper · firewall ${firewall.verdict} (score ${firewall.score.toFixed(2)})`,
        detail: firewall.findings.map((f) => `${f.sev}:${f.rule}`).join(", "),
        metadata: { pathway: "C", domain, findings: firewall.findings, score: firewall.score, verdict: firewall.verdict },
      });
    }
    if (firewall.verdict === "blocked") {
      return new Response(JSON.stringify({ error: "Prompt blocked by server-side firewall", firewall }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const userPrompt = buildHyperedgePrompt(text, source_type, source_reliability, rag_context);
    const t0 = Date.now();
    const hyperResult = await callHyperedgeLLM(LOVABLE_API_KEY, HYPEREDGE_NATIVE_COT_PROMPT, userPrompt, reproTemp, reproSeed);
    const extraction_ms = Date.now() - t0;

    const entities = Array.isArray(hyperResult.entities) ? hyperResult.entities : [];
    const hyperedges = Array.isArray(hyperResult.hyperedges) ? hyperResult.hyperedges : [];

    // Derive binary triples from hyperedges so downstream consumers (R1–R13
    // conflict rules, KG-Bench scorers, kg_relations persistence) keep working.
    // Strategy mirrors src/lib/ontology/hypergraph.ts → decomposeToTriples.
    const derived_relations: Array<{
      source: string; relation: string; target: string; confidence: number;
      evidence: string; edge_type: "relational"; derived_from: string;
    }> = [];
    for (const h of hyperedges) {
      if (!Array.isArray(h.node_ids) || h.node_ids.length < 2) continue;
      const [anchor, ...rest] = h.node_ids;
      const tag = `hyperedge:${h.id}`;
      for (const node of rest) {
        derived_relations.push({
          source: anchor, relation: `related-to:${h.type}`, target: node,
          confidence: typeof h.confidence === "number" ? h.confidence : 0.5,
          evidence: tag, edge_type: "relational", derived_from: h.id,
        });
      }
    }

    const results = {
      pathway: "C" as const,
      source_type,
      source_reliability,
      timestamp: new Date().toISOString(),
      extraction_method: "hyperedge_native_cot",
      domain: "cti",
      repro: { deterministic, temperature: reproTemp, seed: reproSeed ?? null },
      rag_used: !!rag_context,
      extraction_ms,
      // Primary output
      hypergraph: {
        entities,
        hyperedges,
        subgraphs: hyperResult.subgraphs || [],
        graph_warnings: hyperResult.graph_warnings || [],
        graph_metadata: {
          entity_count: entities.length,
          hyperedge_count: hyperedges.length,
          avg_arity: hyperedges.length
            ? hyperedges.reduce((s: number, h: any) => s + (h.node_ids?.length || 0), 0) / hyperedges.length
            : 0,
        },
      },
      // Back-compat projection so PH3/PH4 callers can reuse triple-mode tools
      derived: {
        entities,
        relations: derived_relations,
      },
    };

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-extract-hyper error:", e);
    const status = (e as any)?.status || 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildHyperedgePrompt(text: string, sourceType: string, reliability: number, ragContext: string): string {
  const contextSection = ragContext
    ? `\n\n${ragContext}\n\nUse the historical context ONLY to prefer canonical entity names already known and to ground joint confidence. Do NOT invent participants absent from the source text.\n`
    : "";
  return `Construct a Hyperedge Knowledge Graph from the following ${sourceType} (source reliability: ${reliability}).

CRITICAL: Each atomic event = ONE hyperedge with N participants and ONE quoted source_passage.
NEVER emit binary triples — emit hyperedges only.
${contextSection}
SOURCE TEXT:
${text}

Apply all 6 steps of the Hyperedge-Native CoT. Output entities[] and hyperedges[].`;
}

const CTI_NODE_TYPES = ["threat_actor", "malware", "vulnerability", "ttp", "infrastructure", "software", "campaign", "indicator", "identity"];
const HYPEREDGE_TYPES = ["event", "campaign", "fusion-finding", "kill-chain"];

async function callHyperedgeLLM(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  reproTemperature?: number,
  reproSeed?: number,
): Promise<any> {
  const tool = {
    type: "function",
    function: {
      name: "extract_hyperedge_graph",
      description: "Output a hyperedge-native Knowledge Graph: entities[] + hyperedges[]. Hyperedges are the primary unit; do NOT emit binary triples.",
      parameters: {
        type: "object",
        properties: {
          entities: {
            type: "array",
            description: "Union of participants referenced by any hyperedge, deduplicated by canonical name.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: CTI_NODE_TYPES },
                stix_type: { type: "string" },
                mitre_id: { type: "string" },
                confidence: { type: "number" },
                context: { type: "string", description: "Evidence span from source text" },
              },
              required: ["name", "type", "confidence", "context"],
            },
          },
          hyperedges: {
            type: "array",
            description: "Atomic n-ary events. THIS IS THE PRIMARY OUTPUT.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable id, e.g. 'he_001'" },
                type: { type: "string", enum: HYPEREDGE_TYPES },
                node_ids: {
                  type: "array",
                  items: { type: "string" },
                  description: "Canonical names of participants (>=2, no duplicates)",
                },
                source_passage: {
                  type: "string",
                  description: "Verbatim quote (<= 240 chars) that authorises the whole hyperedge",
                },
                confidence: {
                  type: "number",
                  description: "JOINT confidence the n-ary claim holds. Min-like aggregation, NOT average.",
                },
                qualifiers: {
                  type: "object",
                  description: "Scalar attributes: occurred_at, jurisdiction, mitre_technique, cve_id, observed_count, ...",
                },
              },
              required: ["id", "type", "node_ids", "source_passage", "confidence"],
            },
          },
          subgraphs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["attack_chain", "campaign_cluster", "ttp_profile"] },
                hyperedge_ids: { type: "array", items: { type: "string" } },
              },
              required: ["name", "type", "hyperedge_ids"],
            },
          },
          graph_warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["missing_provenance", "ontology_mismatch", "weak_joint_confidence", "duplicate_participant", "low_arity"] },
                detail: { type: "string" },
                affected_items: { type: "array", items: { type: "string" } },
              },
              required: ["type", "detail"],
            },
          },
        },
        required: ["entities", "hyperedges"],
      },
    },
  };

  const requestBody = JSON.stringify({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: typeof reproTemperature === "number" ? reproTemperature : 0.1,
    ...(typeof reproSeed === "number" ? { seed: reproSeed } : {}),
    tools: [tool],
    tool_choice: { type: "function", function: { name: "extract_hyperedge_graph" } },
  });

  let response: Response | null = null;
  let lastErrText = "";
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      response = await fetch(LLM_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: requestBody,
      });
    } catch (e) {
      lastErrText = e instanceof Error ? e.message : String(e);
      console.error(`LLM fetch network error (attempt ${attempt}/${maxAttempts}):`, lastErrText);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        continue;
      }
      throw new Error(`LLM API network error: ${lastErrText}`);
    }

    if (response.ok) break;
    if (response.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error("Credits exhausted"), { status: 402 });

    if (response.status >= 500 && response.status < 600 && attempt < maxAttempts) {
      lastErrText = await response.text().catch(() => "");
      console.warn(`LLM API ${response.status} (attempt ${attempt}/${maxAttempts}), retrying...`);
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      continue;
    }

    const errText = await response.text();
    console.error(`LLM API error [${response.status}]:`, errText);
    throw new Error(`LLM API error: ${response.status}`);
  }

  if (!response || !response.ok) {
    throw new Error(`LLM API error: upstream unavailable after ${maxAttempts} attempts`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      return { raw: toolCall.function.arguments };
    }
  }
  const content = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}
