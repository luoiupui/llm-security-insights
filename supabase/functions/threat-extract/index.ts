import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * ══════════════════════════════════════════════════════════════════
 * GRAPH-NATIVE LLM EXTRACTION ENGINE (Innovation: Ch. 3.3–3.4)
 * ══════════════════════════════════════════════════════════════════
 *
 * KEY INNOVATION vs OpenCTI / conventional LLM-KG systems:
 * 
 * OpenCTI approach:  Text → LLM(NER) → entities → separate graph builder
 * Our approach:      Text → LLM(Graph-Native CoT) → KG triples constructed
 *                    WITHIN the reasoning chain itself
 *
 * The LLM doesn't extract entities then build a graph.
 * Instead, it REASONS IN GRAPH STRUCTURES from Step 1:
 *   - Each CoT step outputs (Subject, Predicate, Object) triples
 *   - Ontological constraints (STIX 2.1 SDO/SRO) are enforced IN the prompt
 *   - Graph consistency is validated WITHIN the reasoning chain
 *   - Causal subgraphs emerge from temporal-relational fusion
 *
 * This makes KG construction an INTRINSIC capability of the LLM,
 * not an external post-processing step.
 * ══════════════════════════════════════════════════════════════════
 */

const GRAPH_NATIVE_COT_PROMPT = `You are a Graph-Native Cyber Threat Intelligence Reasoning Engine.

CRITICAL DIFFERENCE FROM STANDARD NER/RE:
You do NOT extract entities first and build a graph second.
You THINK in Knowledge Graph triples (Subject → Predicate → Object) from the very first reasoning step.
Every observation you make is immediately formalized as a graph triple.

═══ STIX 2.1 ONTOLOGY (enforced during reasoning) ═══
SDO Node Types: threat-actor, malware, vulnerability, attack-pattern, infrastructure, tool, campaign, indicator, identity, observed-data
SRO Edge Types: uses, targets, attributed-to, communicates-with, exploits, delivers, drops, indicates, mitigates, derived-from, related-to

═══ GRAPH-NATIVE CHAIN-OF-THOUGHT (8 Steps) ═══

STEP 1 — NARRATIVE GRAPH SEED
Read the text. Identify the PRIMARY threat narrative.
Immediately formalize as seed triples:
  (campaign_X, attributed-to, actor_Y)
  (actor_Y, uses, malware_Z)
Do NOT list entities — output TRIPLES.

STEP 2 — ONTOLOGY-GROUNDED NODE EXPANSION
For each seed triple, expand connected nodes using STIX 2.1 SDO types.
Each new node MUST have:
  - stix_type: one of the SDO types above
  - confidence: 0.0–1.0 based on textual evidence
  - evidence_span: exact quote from source text
Validate: reject any node that doesn't map to a STIX SDO type.

STEP 3 — PREDICATE INFERENCE WITH EVIDENCE
For each node pair, determine if an SRO edge exists.
Evidence requirement: each edge MUST cite a text span.
Apply transitivity: if (A uses B) and (B exploits C), infer (A, indirectly-exploits, C) with reduced confidence (parent_conf × 0.7).
Output: directed edges with evidence and derived_from provenance.

STEP 4 — TEMPORAL SUBGRAPH CONSTRUCTION
Construct a temporal ordering subgraph:
  - For events with timestamps, create temporal edges: (event_i, precedes, event_j)
  - For events without timestamps, infer order from narrative structure
  - Each temporal edge gets a certainty: explicit_timestamp > narrative_order > inferred
This is NOT a separate timeline — it's a subgraph within the main KG.

STEP 5 — CAUSAL GRAPH FUSION
Merge the temporal subgraph with the relational graph:
  - Where temporal + relational edges align, create CAUSAL edges:
    enables (capability prerequisite), leads_to (direct consequence),
    triggers (reactive), precedes (temporal only, no proven causation)
  - Causal confidence = min(temporal_conf, relational_conf) × causal_weight
  - causal_weight: enables=0.9, leads_to=0.85, triggers=0.8, precedes=0.6
This produces the CAUSAL KNOWLEDGE SUBGRAPH.

STEP 6 — GRAPH CONSISTENCY VALIDATION (in-reasoning)
Before finalizing, validate the constructed graph:
  □ No orphan nodes (every node has ≥1 edge)
  □ No contradictory edges (A attributed-to B AND A attributed-to C where B≠C → flag)
  □ Temporal monotonicity (no effect precedes its cause)
  □ Ontological validity (all nodes/edges match STIX 2.1 types)
  □ Evidence coverage (every triple has textual evidence)
Report any violations as graph_warnings.

STEP 7 — CONFIDENCE PROPAGATION
Propagate confidence through the graph:
  - Leaf nodes: use direct extraction confidence
  - Intermediate nodes: conf = avg(incoming_edge_conf × source_node_conf)
  - Root nodes (threat actors): conf = weighted sum of all paths
This creates a CONFIDENCE-WEIGHTED KG where every assertion is traceable.

STEP 8 — GRAPH SERIALIZATION
Output the final Knowledge Graph in structured format with:
  - nodes: all STIX SDO nodes with metadata
  - edges: all SRO + causal + temporal edges with provenance
  - subgraphs: identified clusters (attack_chain, infrastructure_cluster, ttp_profile)
  - graph_metadata: node_count, edge_count, density, warnings

CONSTRAINTS:
- NEVER output free-text entity lists — always output graph triples
- Every triple must have evidence from the source text
- Flag hallucinated connections (no text evidence) with confidence < 0.3
- Apply STIX 2.1 constraints: valid SDO/SRO pairings only`;

const CLINICAL_GRAPH_NATIVE_PROMPT = `You are a Graph-Native Clinical Knowledge Reasoning Engine (research simulation — NOT for clinical decision support).

You THINK in Knowledge Graph triples (Subject → Predicate → Object) from the very first step.
Every observation is immediately formalized as a graph triple — never a flat entity list.

═══ CLINICAL ONTOLOGY (enforced during reasoning) ═══
Node Types (use these exact ids in the 'type' field):
  patient, condition, medication, procedure, observation, encounter, provider, adverse_event, allergy
Relation Types:
  diagnosed_with, prescribed_for, administered_to, ordered_for, contraindicates,
  causes_adverse_event, follows_protocol, indicates, treats, monitored_by, allergic_to
Authoritative code systems to surface in the 'mitre_id' field when present in text:
  ICD-10/11 codes (e.g. E11.9), RxNorm RXCUI (e.g. 860975), LOINC (e.g. 4548-4), SNOMED CT.

═══ SAFETY CONSTRAINTS ═══
- Treat all input as de-identified synthetic notes; never infer or restore PHI.
- Do NOT produce treatment recommendations, diagnoses, or clinical advice — only structural KG triples grounded in the source text.
- Flag any free-text inference without textual evidence with confidence < 0.3.

═══ GRAPH-NATIVE CHAIN-OF-THOUGHT (8 Steps) ═══
1. SEED TRIPLES — identify the central encounter and patient: (patient_X, has_encounter, encounter_Y)
2. NODE EXPANSION — for each diagnosed condition, prescribed medication, ordered procedure, recorded observation, attach a node with confidence and an evidence_span quoted from the text. Reject anything not mappable to a node type above.
3. RELATION INFERENCE — connect medication→condition via prescribed_for / treats; observation→condition via indicates; medication→adverse_event via causes_adverse_event; allergy→medication via contraindicates.
4. TEMPORAL SUBGRAPH — order events by stated dates / encounter sequence; add (event_i, precedes, event_j).
5. CAUSAL FUSION — where a medication initiation is followed by a documented adverse event, add (med, causes_adverse_event, ae) as a CAUSAL edge with reduced confidence.
6. CONSISTENCY VALIDATION — flag: medication contraindicated by an allergy; dosage outside a plausible range; effect preceding cause; orphan nodes.
7. CONFIDENCE PROPAGATION — propagate evidence-grounded confidence through the graph.
8. SERIALIZATION — emit nodes / edges / subgraphs / graph_metadata / graph_warnings.

CONSTRAINTS:
- NEVER output free-text entity lists — always graph triples.
- Every triple must cite an evidence span from the source text.
- Out of scope: diagnosis, prescription, prognosis. KG construction only.`;

const CAUSAL_SUBGRAPH_PROMPT = `You are a Causal Subgraph Reasoning Engine operating on an existing Knowledge Graph.

Your input is a partially constructed KG (nodes + edges).
Your task is to derive the CAUSAL SUBGRAPH by:

1. TEMPORAL ANALYSIS: Order all events using explicit timestamps, narrative sequence, and kill-chain logic
2. CAUSAL EDGE DERIVATION: For each adjacent temporal pair, determine causal relationship type:
   - enables: A provides capability/access needed for B
   - leads_to: A directly causes B
   - triggers: B is a reactive response to A
   - precedes: A happens before B but no proven causal link
3. KILL CHAIN MAPPING: Map causal chains to MITRE ATT&CK tactics:
   Reconnaissance → Resource Development → Initial Access → Execution → 
   Persistence → Privilege Escalation → Defense Evasion → Credential Access → 
   Discovery → Lateral Movement → Collection → C2 → Exfiltration → Impact
4. CONFIDENCE SCORING: causal_confidence = min(source_conf, target_conf) × type_weight
   type_weights: enables=0.9, leads_to=0.85, triggers=0.8, precedes=0.6
5. ATTACK PATH EXTRACTION: Identify the longest causal chain as the primary attack path

Output the causal subgraph with edges, kill chain mapping, and the primary attack path.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      text, mode = "full", source_type = "report", source_reliability = 0.8, rag_context = "",
      temperature, seed, deterministic = true, domain = "cti",
    } = await req.json();
    const isClinical = domain === "clinical";
    // Repro: deterministic preset forces T=0 + fixed seed regardless of caller values
    const reproTemp = deterministic ? 0 : (typeof temperature === "number" ? temperature : 0.1);
    const reproSeed = deterministic ? 42 : (typeof seed === "number" ? seed : undefined);

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text input is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const results: Record<string, unknown> = {
      source_type,
      source_reliability,
      timestamp: new Date().toISOString(),
      extraction_method: "graph_native_cot",
      domain,
    };

    if (mode === "full" || mode === "ner" || mode === "re") {
      // ── UNIFIED Graph-Native Extraction (NOT separate NER→RE) ──
      // This is the key innovation: NER and RE happen SIMULTANEOUSLY
      // within the graph-native CoT, not as sequential post-processing
      const graphResult = await callGraphNativeLLM(
        LOVABLE_API_KEY,
        isClinical ? CLINICAL_GRAPH_NATIVE_PROMPT : GRAPH_NATIVE_COT_PROMPT,
        buildGraphExtractionPrompt(text, source_type, source_reliability, rag_context, isClinical),
        "extract_knowledge_graph",
        reproTemp,
        reproSeed,
        isClinical,
      );
      results.rag_used = !!rag_context;
      results.repro = { deterministic, temperature: reproTemp, seed: reproSeed ?? null };

      // Decompose unified graph output into layer-compatible formats
      results.ner = {
        entities: graphResult.nodes || [],
        narrative_summary: graphResult.graph_metadata?.narrative || "",
      };
      results.re = {
        relations: (graphResult.edges || []).filter((e: any) => !["enables", "leads_to", "triggers", "precedes"].includes(e.relation)),
      };
      results.graph_native = {
        nodes: graphResult.nodes || [],
        edges: graphResult.edges || [],
        subgraphs: graphResult.subgraphs || [],
        graph_metadata: graphResult.graph_metadata || {},
        graph_warnings: graphResult.graph_warnings || [],
        reasoning_trace: graphResult.reasoning_trace || "",
      };
    }

    if (mode === "full" || mode === "causality") {
      // ── Causal Subgraph Derivation ──
      // Uses the graph constructed above (or provided nodes/edges) as input
      const existingNodes = (results.graph_native as any)?.nodes || [];
      const existingEdges = (results.graph_native as any)?.edges || [];

      const causalResult = await callGraphNativeLLM(
        LOVABLE_API_KEY,
        CAUSAL_SUBGRAPH_PROMPT,
        `Derive the causal subgraph from this existing Knowledge Graph:

NODES: ${JSON.stringify(existingNodes)}
EDGES: ${JSON.stringify(existingEdges)}

SOURCE TEXT (for evidence verification):
${text}`,
        "extract_causal_subgraph",
        reproTemp,
        reproSeed,
      );

      results.causality = {
        causal_links: causalResult.causal_edges || [],
        attack_timeline: causalResult.attack_timeline || [],
        kill_chain_mapping: causalResult.kill_chain_mapping || [],
        primary_attack_path: causalResult.primary_attack_path || [],
      };
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-extract error:", e);
    const status = (e as any)?.status || 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildGraphExtractionPrompt(text: string, sourceType: string, reliability: number, ragContext: string = "", isClinical: boolean = false): string {
  const contextSection = ragContext
    ? `\n\n${ragContext}\n\nUse the historical context ONLY to (a) prefer canonical entity names already known, (b) ground your extraction in prior verified knowledge, (c) increase confidence for entities/relations that match prior events. Do NOT invent details that are not in the source text.\n`
    : "";

  const domainHeader = isClinical
    ? `Construct a Clinical Knowledge Graph from the following ${sourceType} (synthetic / de-identified note; reliability: ${reliability}).
TREAT INPUT AS DE-IDENTIFIED. DO NOT generate clinical advice — only structural KG triples.`
    : `Construct a Knowledge Graph from the following ${sourceType} (source reliability: ${reliability}).`;

  return `${domainHeader}

IMPORTANT: Do NOT extract entities separately. Reason in graph triples from the start.
Every entity you identify must immediately be connected to at least one other entity via an edge.
${contextSection}
SOURCE TEXT:
${text}

Apply all 8 steps of the Graph-Native CoT. Output the complete Knowledge Graph.`;
}

const CLINICAL_NODE_TYPES = ["patient", "condition", "medication", "procedure", "observation", "encounter", "provider", "adverse_event", "allergy"];
const CTI_NODE_TYPES = ["threat_actor", "malware", "vulnerability", "ttp", "infrastructure", "software", "campaign", "indicator", "identity"];

async function callGraphNativeLLM(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  toolName: string,
  reproTemperature?: number,
  reproSeed?: number,
  isClinical: boolean = false,
): Promise<any> {
  const tools: any[] = [];
  const nodeTypeEnum = isClinical ? CLINICAL_NODE_TYPES : CTI_NODE_TYPES;

  if (toolName === "extract_knowledge_graph") {
    tools.push({
      type: "function",
      function: {
        name: "extract_knowledge_graph",
        description: "Output a complete Knowledge Graph with nodes, edges, subgraphs, and metadata — constructed intrinsically during reasoning",
        parameters: {
          type: "object",
          properties: {
            nodes: {
              type: "array",
              description: "STIX 2.1 SDO nodes — each produced as part of a graph triple, not standalone",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["threat_actor", "malware", "vulnerability", "ttp", "infrastructure", "software", "campaign", "indicator", "identity"] },
                  stix_type: { type: "string", description: "STIX 2.1 SDO type" },
                  confidence: { type: "number" },
                  mitre_id: { type: "string" },
                  context: { type: "string", description: "Evidence span from source text" },
                  propagated_confidence: { type: "number", description: "Confidence after graph propagation" },
                },
                required: ["name", "type", "confidence", "context"],
              },
            },
            edges: {
              type: "array",
              description: "All edges: SRO relational + temporal + causal, each with provenance",
              items: {
                type: "object",
                properties: {
                  source: { type: "string" },
                  relation: { type: "string", description: "STIX SRO type or causal type" },
                  target: { type: "string" },
                  confidence: { type: "number" },
                  evidence: { type: "string", description: "Text span supporting this edge" },
                  edge_type: { type: "string", enum: ["relational", "temporal", "causal", "inferred"], description: "Provenance of this edge" },
                  derived_from: { type: "string", description: "If inferred via transitivity, cite parent edges" },
                },
                required: ["source", "relation", "target", "confidence", "edge_type"],
              },
            },
            subgraphs: {
              type: "array",
              description: "Identified clusters within the KG",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string", enum: ["attack_chain", "infrastructure_cluster", "ttp_profile", "campaign_cluster"] },
                  node_ids: { type: "array", items: { type: "string" } },
                },
                required: ["name", "type", "node_ids"],
              },
            },
            graph_warnings: {
              type: "array",
              description: "Ontological or consistency violations found during in-reasoning validation",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["orphan_node", "contradictory_edge", "temporal_violation", "missing_evidence", "ontology_mismatch"] },
                  detail: { type: "string" },
                  affected_items: { type: "array", items: { type: "string" } },
                },
                required: ["type", "detail"],
              },
            },
            graph_metadata: {
              type: "object",
              properties: {
                node_count: { type: "number" },
                edge_count: { type: "number" },
                density: { type: "number", description: "edge_count / (node_count * (node_count-1))" },
                narrative: { type: "string" },
                stix_compliance: { type: "number", description: "Percentage of nodes/edges that map to valid STIX types" },
              },
            },
            reasoning_trace: {
              type: "string",
              description: "Step-by-step trace showing how the graph was constructed through the 8 CoT steps",
            },
          },
          required: ["nodes", "edges", "graph_metadata", "reasoning_trace"],
        },
      },
    });
  } else if (toolName === "extract_causal_subgraph") {
    tools.push({
      type: "function",
      function: {
        name: "extract_causal_subgraph",
        description: "Derive causal subgraph from existing KG with temporal reasoning and kill chain mapping",
        parameters: {
          type: "object",
          properties: {
            causal_edges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  cause: { type: "string" },
                  effect: { type: "string" },
                  causal_type: { type: "string", enum: ["enables", "leads_to", "triggers", "precedes"] },
                  temporal_order: { type: "number" },
                  confidence: { type: "number" },
                  evidence: { type: "string" },
                  mitre_tactic: { type: "string" },
                },
                required: ["cause", "effect", "causal_type", "confidence"],
              },
            },
            attack_timeline: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  order: { type: "number" },
                  event: { type: "string" },
                  timestamp_mentioned: { type: "string" },
                  certainty: { type: "string", enum: ["explicit_timestamp", "narrative_order", "inferred"] },
                },
                required: ["order", "event"],
              },
            },
            kill_chain_mapping: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tactic: { type: "string" },
                  technique_id: { type: "string" },
                  technique_name: { type: "string" },
                  events: { type: "array", items: { type: "string" } },
                },
                required: ["tactic", "events"],
              },
            },
            primary_attack_path: {
              type: "array",
              description: "Longest causal chain — the primary attack path",
              items: { type: "string" },
            },
          },
          required: ["causal_edges", "attack_timeline"],
        },
      },
    });
  }

  const requestBody = JSON.stringify({
    model: "google/gemini-3-flash-preview",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: typeof reproTemperature === "number" ? reproTemperature : 0.1,
    ...(typeof reproSeed === "number" ? { seed: reproSeed } : {}),
    tools,
    tool_choice: { type: "function", function: { name: toolName } },
  });

  // Retry transient upstream errors (502/503/504) with exponential backoff
  let response: Response | null = null;
  let lastErrText = "";
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
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

    // Retry on 5xx (gateway/upstream transient)
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
