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
      domain = "cti",
      mode = "triples",        // "triples" | "hyperedges"  (PH3, Pathway C)
      hyperedges = [],          // only used when mode === "hyperedges"
    } = await req.json();

    // ── Pathway C dispatch (PH3): hyperedge-native joint-validity rules ──
    // Runs IN ADDITION to the standard triple-mode rules below, so the
    // caller still gets R1–R13 on the derived triple projection. CTI only.
    let hyperedgeBlock: {
      conflicts: Array<{ rule: string; status: string; type: string; detail: string; affected_items: string[] }>;
      summary: { total_rules: number; passed: number; warnings: number; failures: number };
      rejected_hyperedge_ids: string[];
    } | null = null;
    if (mode === "hyperedges" && Array.isArray(hyperedges) && hyperedges.length > 0) {
      if (domain !== "cti") {
        return new Response(
          JSON.stringify({ error: "hyperedge mode is CTI-only in PH3" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      hyperedgeBlock = runHyperedgeRulesInline(hyperedges);
    }


    // Clinical mode: run only domain-agnostic structural checks; skip MITRE-specific TTP rules.
    if (domain === "clinical") {
      const nodes = graph_native?.nodes || entities;
      const edges = graph_native?.edges || relations;
      const clinicalConflicts: ConflictResult[] = [];

      // Allergy ↔ medication contradiction
      const allergens = new Set(
        edges.filter((e: any) => e.relation === "allergic_to").map((e: any) => String(e.target).toLowerCase())
      );
      const prescribed = edges
        .filter((e: any) => ["prescribed_for", "administered_to"].includes(e.relation))
        .map((e: any) => String(e.source).toLowerCase());
      const collisions = prescribed.filter((m: string) => allergens.has(m));
      clinicalConflicts.push({
        rule: "Allergy vs Medication",
        status: collisions.length > 0 ? "fail" : "pass",
        type: "clinical_safety",
        detail: collisions.length > 0
          ? `Medication(s) prescribed despite documented allergy: ${collisions.join(", ")}`
          : "No allergy/medication contradictions detected",
        affected_items: collisions,
      });

      // Adverse-event causal coherence
      const aeEdges = edges.filter((e: any) => e.relation === "causes_adverse_event");
      clinicalConflicts.push({
        rule: "Adverse Event Causality",
        status: "pass",
        type: "clinical_causality",
        detail: `${aeEdges.length} adverse-event causal link(s) recorded`,
      });

      // Orphan node check
      const connected = new Set<string>();
      edges.forEach((e: any) => { connected.add(e.source); connected.add(e.target); });
      const orphans = nodes.filter((n: any) => !connected.has(n.name)).map((n: any) => n.name);
      clinicalConflicts.push({
        rule: "Graph Connectivity",
        status: orphans.length > 0 ? "warn" : "pass",
        type: "graph_structure",
        detail: orphans.length > 0 ? `Orphan nodes: ${orphans.join(", ")}` : "All nodes connected",
        affected_items: orphans,
      });

      const passed = clinicalConflicts.filter(c => c.status === "pass").length;
      const warnings = clinicalConflicts.filter(c => c.status === "warn").length;
      const failures = clinicalConflicts.filter(c => c.status === "fail").length;

      return new Response(JSON.stringify({
        conflicts: clinicalConflicts,
        credibility_score: source_reliability * (failures === 0 ? 1 : 0.6),
        llm_resolution: null,
        summary: { total_rules: clinicalConflicts.length, passed, warnings, failures },
        domain: "clinical",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    // ── Rules 11–13: Multi-Modal Fusion (NEW — Phase 2) ──
    // Backward-compatible: when inputs carry no modality / freshness metadata,
    // each rule returns `pass` with an explanatory detail. See
    // public/reports/conflict-rules-multimodal-extension.md and
    // src/lib/conflicts/multimodal-rules.ts for the in-app reference impl.
    conflicts.push(applyR11(nodes, edges));
    conflicts.push(applyR12(edges));
    conflicts.push(applyR13(nodes));

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
  const validSTIXSDO = new Set(["threat_actor", "malware", "vulnerability", "ttp", "infrastructure", "software", "campaign", "indicator", "identity", "attack-pattern", "tool", "observed-data",
    // Phase 3 — multi-modal fusion node types
    "flow_pattern", "corroborated_finding"]);
  const validSTIXSRO = new Set(["uses", "targets", "attributed-to", "attributed_to", "communicates-with", "communicates_with", "exploits", "delivers", "drops", "indicates", "mitigates", "derived-from", "related-to", "hosts", "implements", "employs",
    "enables", "leads_to", "triggers", "precedes",
    // Phase 3 — fusion edges (spec §2)
    "corroborates", "contradicts", "matches_ioc"]);  // include causal + fusion types

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

// ════════════════════════════════════════════════════════════════════
// MULTI-MODAL FUSION RULES R11–R13 (Phase 2)
// Inline Deno copy of src/lib/conflicts/multimodal-rules.ts. Keep in sync.
// Spec: public/reports/conflict-rules-multimodal-extension.md
// ════════════════════════════════════════════════════════════════════

const HALF_LIFE_DAYS: Record<string, number> = { ip: 30, domain: 30, hash: 180, ttp: 365 };
const HARD_CUTOFF_DAYS: Record<string, number> = { ip: 180, domain: 180, hash: 730 };

function clamp01(x: number): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function freshness(ageDays: number, halfLife: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0 || halfLife <= 0) return 0;
  return Math.max(0.05, Math.min(1, Math.pow(0.5, ageDays / halfLife)));
}
function ageDaysFrom(iso: string | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, (now.getTime() - t) / 86_400_000);
}
function modalityOf(x: any): string {
  if (x?.source_modality) return x.source_modality;
  const t = x?.type;
  if (t === "indicator" || t === "ioc") return "external_cti";
  if (t === "flow_pattern" || t === "internal_asset") return "internal_flow";
  return "unknown";
}

function applyR11(entities: any[], relations: any[]): ConflictResult {
  const threshold = 0.7, clamp = 0.6;
  const corroborated = new Set<string>();
  for (const r of relations) {
    if (r.relation === "corroborates" || modalityOf(r) === "internal_flow") {
      corroborated.add(r.source); corroborated.add(r.target);
    }
  }
  const flagged: any[] = [], dual: any[] = [];
  for (const e of entities) {
    if (modalityOf(e) !== "external_cti") continue;
    if (e.confidence < threshold) continue;
    if (corroborated.has(e.name)) continue;
    flagged.push(e);
    dual.push({
      item: e.name,
      external: e.conf_narrative ?? e.confidence,
      internal: e.conf_behavioral ?? 0,
      fused_before: e.confidence,
      fused_after: Math.min(e.confidence, clamp),
    });
  }
  if (flagged.length === 0) {
    return {
      rule: "Unverified External (R11)", status: "pass", type: "multimodal_fusion",
      detail: entities.some(e => modalityOf(e) === "external_cti")
        ? "All external CTI entities have internal corroboration"
        : "No external CTI entities present (rule no-op)",
    } as any;
  }
  return {
    rule: "Unverified External (R11)", status: "warn", type: "multimodal_fusion",
    detail: `${flagged.length} external-only entity(ies) above threshold; clamping fused_conf ≤ ${clamp}`,
    affected_items: flagged.map(e => e.name),
    rule_id: "R11", flag: "requires_internal_corroboration", dual_confidence: dual,
  } as any;
}

function applyR12(relations: any[]): ConflictResult {
  const now = new Date(), minDecay = 0.5;
  const items: string[] = [], dual: any[] = [];
  let stalest = 1;
  for (const r of relations) {
    if (r.relation !== "matches_ioc") continue;
    const age = ageDaysFrom(r.observed_at, now);
    if (age == null) continue;
    const indType = String(r.indicator_type ?? "ip").toLowerCase();
    const halfLife = HALF_LIFE_DAYS[indType] ?? 30;
    const cutoff = HARD_CUTOFF_DAYS[indType];
    const fr = clamp01(freshness(age, halfLife));
    if (cutoff != null && age > cutoff) {
      items.push(`${r.source}→${r.target} (age ${age.toFixed(0)}d > cutoff ${cutoff}d)`);
      dual.push({ item: `${r.source}→${r.target}`, external: r.confidence, internal: 0, fused_before: r.confidence, fused_after: 0, freshness: 0 });
      stalest = 0; continue;
    }
    if (fr < minDecay) {
      items.push(`${r.source}→${r.target} (freshness ${fr.toFixed(3)})`);
      dual.push({ item: `${r.source}→${r.target}`, external: r.confidence, internal: 0, fused_before: r.confidence, fused_after: clamp01(r.confidence * fr), freshness: fr });
      stalest = Math.min(stalest, fr);
    }
  }
  if (items.length === 0) {
    return {
      rule: "Stale IoC Match (R12)", status: "pass", type: "multimodal_fusion",
      detail: relations.some(r => r.relation === "matches_ioc")
        ? "All IoC matches within freshness window"
        : "No IoC matches present (rule no-op)",
    } as any;
  }
  return {
    rule: "Stale IoC Match (R12)", status: "warn", type: "multimodal_fusion",
    detail: `${items.length} stale IoC match(es); minimum freshness ${stalest.toFixed(3)}`,
    affected_items: items, rule_id: "R12", flag: "stale_match", dual_confidence: dual,
  } as any;
}

function applyR13(entities: any[]): ConflictResult {
  const hi = 0.8, lo = 0.3;
  const conflicts: any[] = [], dual: any[] = [];
  for (const e of entities) {
    const n = e.conf_narrative, b = e.conf_behavioral;
    if (n == null || b == null) continue;
    const disagree = (n >= hi && b <= lo) || (b >= hi && n <= lo);
    if (!disagree) continue;
    conflicts.push(e);
    dual.push({ item: e.name, external: n, internal: b, fused_before: e.confidence, fused_after: 0 });
  }
  if (conflicts.length === 0) {
    return {
      rule: "Cross-Modal Disagreement (R13)", status: "pass", type: "multimodal_fusion",
      detail: entities.some(e => e.conf_narrative != null && e.conf_behavioral != null)
        ? "Narrative and behavioral confidences agree"
        : "No dual-modality evidence present (rule no-op)",
    } as any;
  }
  return {
    rule: "Cross-Modal Disagreement (R13)", status: "fail", type: "multimodal_fusion",
    detail: `${conflicts.length} entity(ies) with conflicting modality evidence; queued for LLM resolver`,
    affected_items: conflicts.map(e => e.name),
    rule_id: "R13", flag: "modality_conflict", dual_confidence: dual,
  } as any;
}
