import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * ══════════════════════════════════════════════════════════════════
 * GRAPH-INTEGRATED CONFLICT DETECTION ENGINE (Ch. 4.4)
 * ══════════════════════════════════════════════════════════════════
 *
 * Innovation: Conflict detection operates ON the graph structure itself,
 * not on extracted entity lists. Rules validate graph properties:
 * - Graph connectivity (no orphan nodes)
 * - Edge consistency (no contradictory edges)
 * - Ontological compliance (STIX 2.1 valid pairings)
 * - Temporal monotonicity in causal subgraph
 * - Confidence propagation consistency
 * ══════════════════════════════════════════════════════════════════
 */

interface Entity {
  name: string;
  type: string;
  confidence: number;
  stix_type?: string;
  edge_type?: string;
  source?: string;
  timestamp?: string;
}

interface Relation {
  source: string;
  relation: string;
  target: string;
  confidence: number;
  edge_type?: string;
}

interface CausalLink {
  cause: string;
  effect: string;
  causal_type: string;
  temporal_order: number;
  confidence: number;
}

interface ConflictResult {
  rule: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  type: string;
  affected_items?: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      entities = [],
      relations = [],
      causal_links = [],
      source_reliability = 0.8,
      graph_native,
    } = await req.json();

    // Use graph_native structure if available (from enhanced extraction)
    const nodes = graph_native?.nodes || entities;
    const edges = graph_native?.edges || relations;
    const causalLinks = causal_links;

    const conflicts: ConflictResult[] = [];

    // ── Rule 1: Temporal Overlap Check ──
    conflicts.push(checkTemporalOverlap(causalLinks));

    // ── Rule 2: TTP Consistency ──
    conflicts.push(checkTTPConsistency(nodes, edges));

    // ── Rule 3: Infrastructure Reuse ──
    conflicts.push(checkInfrastructureReuse(nodes, edges));

    // ── Rule 4: Credibility Assessment ──
    conflicts.push(checkCredibility(nodes, source_reliability));

    // ── Rule 5: Causal Coherence ──
    conflicts.push(checkCausalCoherence(causalLinks));

    // ── Rule 6: Attribution Contradiction ──
    conflicts.push(checkAttributionContradiction(edges));

    // ── Rule 7: Entity Duplication ──
    conflicts.push(checkEntityDuplication(nodes));

    // ── Rule 8: Graph Connectivity (NEW — graph-native rule) ──
    conflicts.push(checkGraphConnectivity(nodes, edges));

    // ── Rule 9: Ontological Compliance (NEW — STIX 2.1 validation) ──
    conflicts.push(checkOntologicalCompliance(nodes, edges));

    // ── Rule 10: Confidence Propagation Consistency (NEW) ──
    conflicts.push(checkConfidencePropagation(nodes, edges));

    // ── Compute Global Credibility Score ──
    const credibilityScore = computeCredibilityScore(nodes, edges, source_reliability);

    // ── LLM-based conflict resolution for warnings/failures ──
    let llmResolution = null;
    const hasConflicts = conflicts.some(c => c.status === "warn" || c.status === "fail");

    if (hasConflicts) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        llmResolution = await resolveConflictsWithLLM(LOVABLE_API_KEY, conflicts, nodes, edges);
      }
    }

    return new Response(JSON.stringify({
      conflicts,
      credibility_score: credibilityScore,
      llm_resolution: llmResolution,
      summary: {
        total_rules: conflicts.length,
        passed: conflicts.filter(c => c.status === "pass").length,
        warnings: conflicts.filter(c => c.status === "warn").length,
        failures: conflicts.filter(c => c.status === "fail").length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-conflicts error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Original 7 Rules (unchanged logic) ──

function checkTemporalOverlap(causalLinks: CausalLink[]): ConflictResult {
  const orders = causalLinks.map(l => l.temporal_order).filter(Boolean);
  const duplicateOrders = orders.filter((o, i) => orders.indexOf(o) !== i);

  if (duplicateOrders.length > 0) {
    return { rule: "Temporal Overlap Check", status: "warn", detail: `Duplicate temporal orders: ${[...new Set(duplicateOrders)].join(", ")}`, type: "temporal", affected_items: duplicateOrders.map(String) };
  }

  for (let i = 0; i < causalLinks.length - 1; i++) {
    if (causalLinks[i].temporal_order > causalLinks[i + 1].temporal_order && causalLinks[i].causal_type !== "precedes") {
      return { rule: "Temporal Overlap Check", status: "fail", detail: `Reversed causality: "${causalLinks[i].cause}" (order ${causalLinks[i].temporal_order}) before "${causalLinks[i + 1].cause}" (order ${causalLinks[i + 1].temporal_order})`, type: "temporal" };
    }
  }

  return { rule: "Temporal Overlap Check", status: "pass", detail: "No conflicting timelines detected", type: "temporal" };
}

function checkTTPConsistency(entities: Entity[], relations: Relation[]): ConflictResult {
  const ttps = entities.filter(e => e.type === "ttp");
  const actors = entities.filter(e => e.type === "threat_actor");
  const ttpActorMap: Record<string, string[]> = {};

  for (const rel of relations) {
    if (["uses", "employs", "implements"].includes(rel.relation)) {
      const ttp = ttps.find(t => t.name === rel.target);
      const actor = actors.find(a => a.name === rel.source);
      if (ttp && actor) {
        if (!ttpActorMap[ttp.name]) ttpActorMap[ttp.name] = [];
        ttpActorMap[ttp.name].push(actor.name);
      }
    }
  }

  const sharedTTPs = Object.entries(ttpActorMap).filter(([_, a]) => a.length > 1);
  if (sharedTTPs.length > 0) {
    return { rule: "TTP Consistency", status: "warn", detail: `${sharedTTPs.length} TTP(s) shared across multiple actors`, type: "behavioral", affected_items: sharedTTPs.map(([t]) => t) };
  }
  return { rule: "TTP Consistency", status: "pass", detail: "All TTPs uniquely attributed", type: "behavioral" };
}

function checkInfrastructureReuse(entities: Entity[], relations: Relation[]): ConflictResult {
  const infra = entities.filter(e => e.type === "infrastructure");
  const infraActorMap: Record<string, string[]> = {};

  for (const rel of relations) {
    if (["communicates_with", "hosts", "uses"].includes(rel.relation)) {
      const infraEntity = infra.find(i => i.name === rel.target);
      if (infraEntity) {
        if (!infraActorMap[infraEntity.name]) infraActorMap[infraEntity.name] = [];
        if (!infraActorMap[infraEntity.name].includes(rel.source)) {
          infraActorMap[infraEntity.name].push(rel.source);
        }
      }
    }
  }

  const shared = Object.entries(infraActorMap).filter(([_, a]) => a.length > 1);
  if (shared.length > 0) {
    return { rule: "Infrastructure Reuse", status: "warn", detail: `${shared.length} shared infrastructure element(s)`, type: "infrastructure", affected_items: shared.map(([i]) => i) };
  }
  return { rule: "Infrastructure Reuse", status: "pass", detail: "Unique infrastructure per actor", type: "infrastructure" };
}

function checkCredibility(entities: Entity[], sourceReliability: number): ConflictResult {
  const lowConf = entities.filter(e => e.confidence < 0.5);
  if (sourceReliability < 0.5) {
    return { rule: "Credibility Assessment", status: "fail", detail: `Source reliability (${sourceReliability}) below threshold`, type: "source" };
  }
  if (lowConf.length > 0) {
    return { rule: "Credibility Assessment", status: "warn", detail: `${lowConf.length} entities below confidence 0.5`, type: "source", affected_items: lowConf.map(e => e.name) };
  }
  return { rule: "Credibility Assessment", status: "pass", detail: "All entities above confidence threshold", type: "source" };
}

function checkCausalCoherence(causalLinks: CausalLink[]): ConflictResult {
  const visited = new Set<string>();
  for (const link of causalLinks) {
    if (visited.has(link.effect) && causalLinks.some(l => l.cause === link.effect && l.effect === link.cause)) {
      return { rule: "Causal Coherence", status: "fail", detail: `Circular causality: ${link.cause} ↔ ${link.effect}`, type: "causal" };
    }
    visited.add(link.cause);
  }
  return { rule: "Causal Coherence", status: "pass", detail: "Causal chains are consistent", type: "causal" };
}

function checkAttributionContradiction(relations: Relation[]): ConflictResult {
  const attributions = relations.filter(r => r.relation === "attributed_to" || r.relation === "attributed-to");
  const map: Record<string, string[]> = {};
  for (const rel of attributions) {
    if (!map[rel.source]) map[rel.source] = [];
    map[rel.source].push(rel.target);
  }
  const contradictions = Object.entries(map).filter(([_, a]) => a.length > 1);
  if (contradictions.length > 0) {
    return { rule: "Attribution Contradiction", status: "fail", detail: `Contradictory attributions: ${contradictions.map(([c, a]) => `${c} → [${a.join(", ")}]`).join("; ")}`, type: "attribution", affected_items: contradictions.map(([c]) => c) };
  }
  return { rule: "Attribution Contradiction", status: "pass", detail: "No contradictory attributions", type: "attribution" };
}

function checkEntityDuplication(entities: Entity[]): ConflictResult {
  const nameMap: Record<string, Entity[]> = {};
  for (const e of entities) {
    const normalized = e.name.toLowerCase().replace(/[\s\-_]/g, "");
    if (!nameMap[normalized]) nameMap[normalized] = [];
    nameMap[normalized].push(e);
  }
  const duplicates = Object.entries(nameMap).filter(([_, ents]) => ents.length > 1);
  if (duplicates.length > 0) {
    return { rule: "Entity Deduplication", status: "warn", detail: `${duplicates.length} potential duplicate(s)`, type: "deduplication", affected_items: duplicates.map(([_, ents]) => ents.map(e => e.name).join(" / ")) };
  }
  return { rule: "Entity Deduplication", status: "pass", detail: "No duplicate entities", type: "deduplication" };
}

// ── NEW Graph-Native Rules (innovation beyond OpenCTI) ──

function checkGraphConnectivity(nodes: Entity[], edges: Relation[]): ConflictResult {
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  const orphans = nodes.filter(n => !connectedNodes.has(n.name));
  if (orphans.length > 0) {
    return { rule: "Graph Connectivity", status: "warn", detail: `${orphans.length} orphan node(s) with no edges`, type: "graph_structure", affected_items: orphans.map(n => n.name) };
  }
  return { rule: "Graph Connectivity", status: "pass", detail: "All nodes are connected", type: "graph_structure" };
}

function checkOntologicalCompliance(nodes: Entity[], edges: Relation[]): ConflictResult {
  const validSTIXSDO = new Set(["threat_actor", "malware", "vulnerability", "ttp", "infrastructure", "software", "campaign", "indicator", "identity", "attack-pattern", "tool", "observed-data"]);
  const validSTIXSRO = new Set(["uses", "targets", "attributed-to", "attributed_to", "communicates-with", "communicates_with", "exploits", "delivers", "drops", "indicates", "mitigates", "derived-from", "related-to", "hosts", "implements", "employs",
    "enables", "leads_to", "triggers", "precedes"]);  // include causal types

  const invalidNodes = nodes.filter(n => !validSTIXSDO.has(n.type) && !validSTIXSDO.has(n.stix_type || ""));
  const invalidEdges = edges.filter(e => !validSTIXSRO.has(e.relation));

  if (invalidNodes.length > 0 || invalidEdges.length > 0) {
    const items = [
      ...invalidNodes.map(n => `node:${n.name}(${n.type})`),
      ...invalidEdges.map(e => `edge:${e.source}-[${e.relation}]->${e.target}`),
    ];
    return { rule: "Ontological Compliance", status: "warn", detail: `${items.length} items don't map to valid STIX 2.1 types`, type: "ontology", affected_items: items };
  }
  return { rule: "Ontological Compliance", status: "pass", detail: "All nodes/edges comply with STIX 2.1 ontology", type: "ontology" };
}

function checkConfidencePropagation(nodes: Entity[], edges: Relation[]): ConflictResult {
  // Check: edges with high confidence between low-confidence nodes are suspicious
  const nodeConfMap: Record<string, number> = {};
  for (const n of nodes) nodeConfMap[n.name] = n.confidence;

  const suspicious: string[] = [];
  for (const e of edges) {
    const srcConf = nodeConfMap[e.source] || 0;
    const tgtConf = nodeConfMap[e.target] || 0;
    if (e.confidence > 0.8 && (srcConf < 0.4 || tgtConf < 0.4)) {
      suspicious.push(`${e.source}-[${e.relation}]->${e.target} (edge:${e.confidence}, nodes:${srcConf}/${tgtConf})`);
    }
  }

  if (suspicious.length > 0) {
    return { rule: "Confidence Propagation", status: "warn", detail: `${suspicious.length} high-confidence edge(s) between low-confidence nodes`, type: "confidence", affected_items: suspicious };
  }
  return { rule: "Confidence Propagation", status: "pass", detail: "Confidence values are consistent across graph", type: "confidence" };
}

function computeCredibilityScore(entities: Entity[], relations: Relation[], sourceReliability: number): number {
  if (entities.length === 0) return 0;
  const avgEntityConf = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
  const avgRelConf = relations.length > 0 ? relations.reduce((sum, r) => sum + r.confidence, 0) / relations.length : 0;
  // S = Σ(w_i × conf_i × reliability_i) / N
  const score = (0.4 * avgEntityConf + 0.3 * avgRelConf + 0.3 * sourceReliability);
  return Math.round(score * 100) / 100;
}

async function resolveConflictsWithLLM(apiKey: string, conflicts: ConflictResult[], entities: Entity[], relations: Relation[]): Promise<string> {
  try {
    const failedConflicts = conflicts.filter(c => c.status !== "pass");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a cybersecurity KG analyst. Provide brief, actionable resolution recommendations for Knowledge Graph structural conflicts. Focus on graph-level fixes: merge nodes, redirect edges, adjust confidence propagation." },
          { role: "user", content: `Graph conflicts detected:\n${JSON.stringify(failedConflicts, null, 2)}\n\nNodes: ${entities.map(e => `${e.name}(${e.type})`).join(", ")}\nEdge count: ${relations.length}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) return "LLM resolution unavailable";
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No resolution generated";
  } catch (e) {
    console.error("LLM resolution error:", e);
    return "LLM resolution failed";
  }
}
