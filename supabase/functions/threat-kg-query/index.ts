import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * ══════════════════════════════════════════════════════════════════
 * GRAPH-AWARE INFERENCE ENGINE (Innovation: Ch. 4.2–4.3)
 * ══════════════════════════════════════════════════════════════════
 *
 * Unlike OpenCTI which queries a static graph database,
 * our engine performs GRAPH-AWARE REASONING:
 *
 * 1. The LLM receives the full KG structure (nodes + edges + subgraphs)
 * 2. It performs GRAPH TRAVERSAL within its reasoning chain
 * 3. Attribution is derived from GRAPH PATH ANALYSIS, not text matching
 * 4. The LLM outputs evidence chains as GRAPH PATHS, not text excerpts
 *
 * This means the KG isn't just stored and queried — it's the
 * REASONING SUBSTRATE for the LLM's inference process.
 * ══════════════════════════════════════════════════════════════════
 */

const GRAPH_AWARE_ATTRIBUTION_PROMPT = `You are a Graph-Aware Neuro-Symbolic Attribution Engine.

You do NOT reason about text. You reason about GRAPH STRUCTURES.

Your input is a Knowledge Graph (nodes, edges, subgraphs). Your reasoning must follow graph paths.

═══ GRAPH-AWARE REASONING PROTOCOL ═══

STEP 1 — GRAPH TOPOLOGY ANALYSIS
Compute: in-degree, out-degree for each node.
Identify: hub nodes (high degree), authority nodes (high in-degree), bridge nodes (connecting subgraphs).
The highest-authority threat_actor node is the primary attribution candidate.

STEP 2 — PATH-BASED EVIDENCE COLLECTION
For the candidate actor, trace ALL paths from actor → malware/ttp/infrastructure.
Each path constitutes one piece of evidence.
Evidence weight = product of edge confidences along the path.
Path: actor -[uses]→ malware -[exploits]→ vuln = weight(0.9 × 0.85) = 0.765

STEP 3 — SUBGRAPH PATTERN MATCHING
Compare the actor's TTP subgraph against known APT behavioral patterns:
- Supply chain focus: T1195.x techniques
- Spear-phishing: T1566.x techniques
- Living-off-the-land: T1218.x, T1059.x techniques
The matching pattern strengthens attribution confidence.

STEP 4 — CAUSAL CHAIN VALIDATION
Traverse the causal subgraph:
- Verify the causal chain from initial access → objective is connected
- Check that the attributed actor is the root of the primary causal chain
- Validate temporal consistency (no effect before cause)

STEP 5 — CREDIBILITY SCORING
S = Σ(path_weight_i × source_reliability) / N_paths
Adjust for: graph density (sparse graphs → lower confidence),
             evidence coverage (what % of edges have textual evidence),
             causal completeness (is the full kill chain present?)

STEP 6 — ALTERNATIVE HYPOTHESIS GENERATION
Identify other threat_actor nodes in the graph.
For each: compute their path-based evidence weight.
If alternative_weight > 0.5 × primary_weight → report as credible alternative.

Output attribution with full graph-path evidence chains.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      query,
      entities = [],
      relations = [],
      causal_links = [],
      graph_native,  // our enhanced graph structure if available
      mode = "attribute"
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Use graph_native data if available (from our enhanced extraction), 
    // otherwise fall back to flat entities/relations
    const graphData = graph_native || {
      nodes: entities,
      edges: [...relations, ...causal_links.map((cl: any) => ({
        source: cl.cause,
        relation: cl.causal_type,
        target: cl.effect,
        confidence: cl.confidence,
        edge_type: "causal",
      }))],
      subgraphs: [],
    };

    let result: unknown;

    switch (mode) {
      case "attribute":
        result = await performGraphAttribution(LOVABLE_API_KEY, query, graphData);
        break;
      case "attack_path":
        result = await reconstructGraphAttackPath(LOVABLE_API_KEY, graphData);
        break;
      case "predict":
        result = await predictFromGraph(LOVABLE_API_KEY, graphData);
        break;
      default:
        return new Response(JSON.stringify({ error: "Invalid mode" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-kg-query error:", e);
    const status = (e as any)?.status || 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function performGraphAttribution(apiKey: string, query: string, graphData: any) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: GRAPH_AWARE_ATTRIBUTION_PROMPT },
        {
          role: "user",
          content: `Query: ${query}

KNOWLEDGE GRAPH STRUCTURE:
Nodes (${graphData.nodes?.length || 0}): ${JSON.stringify(graphData.nodes)}
Edges (${graphData.edges?.length || 0}): ${JSON.stringify(graphData.edges)}
Subgraphs: ${JSON.stringify(graphData.subgraphs || [])}
Graph Metadata: ${JSON.stringify(graphData.graph_metadata || {})}

Perform graph-aware attribution following all 6 steps of the protocol.
Cite evidence as GRAPH PATHS (node→edge→node→edge→node), not text quotes.`,
        },
      ],
      temperature: 0.15,
      tools: [{
        type: "function",
        function: {
          name: "graph_attribution_result",
          description: "Return graph-aware attribution with path-based evidence",
          parameters: {
            type: "object",
            properties: {
              attributed_actor: { type: "string" },
              confidence: { type: "number" },
              credibility_score: { type: "number" },
              graph_topology: {
                type: "object",
                description: "Graph structure analysis",
                properties: {
                  hub_nodes: { type: "array", items: { type: "string" } },
                  authority_nodes: { type: "array", items: { type: "string" } },
                  bridge_nodes: { type: "array", items: { type: "string" } },
                  graph_density: { type: "number" },
                },
              },
              evidence_chain: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    evidence: { type: "string" },
                    weight: { type: "number" },
                    source_type: { type: "string" },
                    graph_path: { type: "string", description: "The graph path: A →[uses]→ B →[exploits]→ C" },
                  },
                  required: ["evidence", "weight"],
                },
              },
              attack_stages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    stage: { type: "string" },
                    technique: { type: "string" },
                    detail: { type: "string" },
                    mitre_tactic: { type: "string" },
                  },
                  required: ["stage", "detail"],
                },
              },
              causal_chain: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    cause: { type: "string" },
                    effect: { type: "string" },
                    causal_type: { type: "string" },
                    temporal_order: { type: "number" },
                    confidence: { type: "number" },
                  },
                  required: ["cause", "effect", "causal_type"],
                },
              },
              alternative_actors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    actor: { type: "string" },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                    path_weight: { type: "number" },
                  },
                  required: ["actor", "confidence"],
                },
              },
              reasoning_trace: { type: "string" },
            },
            required: ["attributed_actor", "confidence", "evidence_chain", "attack_stages"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "graph_attribution_result" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error("Credits exhausted"), { status: 402 });
    throw new Error(`LLM error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { return JSON.parse(toolCall.function.arguments); } catch { return { raw: toolCall.function.arguments }; }
  }
  return { raw: data.choices?.[0]?.message?.content || "" };
}

async function reconstructGraphAttackPath(apiKey: string, graphData: any) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a Graph-Native Attack Path Reconstruction Engine.
Given a KG, traverse the causal edges to reconstruct the complete attack path.
Output as an ordered sequence of graph nodes with connecting edges.
Map each step to MITRE ATT&CK tactics. The path should follow graph edges, not text narrative.`,
        },
        {
          role: "user",
          content: `Reconstruct attack path from this KG:\nNodes: ${JSON.stringify(graphData.nodes)}\nEdges: ${JSON.stringify(graphData.edges)}\nSubgraphs: ${JSON.stringify(graphData.subgraphs || [])}`,
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return { attack_path: data.choices?.[0]?.message?.content || "" };
}

async function predictFromGraph(apiKey: string, graphData: any) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a Graph-Native Predictive Engine. Analyze the KG topology to predict next attack steps.
Use graph patterns: incomplete kill chains suggest next tactics, dangling infrastructure nodes suggest unused C2,
missing exfiltration edges after collection suggest pending data theft.
Base predictions on GRAPH STRUCTURE, not text.`,
        },
        {
          role: "user",
          content: `Predict next steps from KG state:\nNodes: ${JSON.stringify(graphData.nodes)}\nEdges: ${JSON.stringify(graphData.edges)}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return { predictions: data.choices?.[0]?.message?.content || "" };
}
