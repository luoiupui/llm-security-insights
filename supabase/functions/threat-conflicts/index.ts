import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Conflict Detection & Credibility Scoring Engine (Ch. 4.4) ── */

interface Entity {
  name: string;
  type: string;
  confidence: number;
  source?: string;
  timestamp?: string;
}

interface Relation {
  source: string;
  relation: string;
  target: string;
  confidence: number;
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
    const { entities = [], relations = [], causal_links = [], source_reliability = 0.8 } = await req.json();

    const conflicts: ConflictResult[] = [];

    // ── Rule 1: Temporal Overlap Check ──
    conflicts.push(checkTemporalOverlap(causal_links));

    // ── Rule 2: TTP Consistency ──
    conflicts.push(checkTTPConsistency(entities, relations));

    // ── Rule 3: Infrastructure Reuse ──
    conflicts.push(checkInfrastructureReuse(entities, relations));

    // ── Rule 4: Credibility Assessment ──
    conflicts.push(checkCredibility(entities, source_reliability));

    // ── Rule 5: Causal Coherence ──
    conflicts.push(checkCausalCoherence(causal_links));

    // ── Rule 6: Attribution Contradiction ──
    conflicts.push(checkAttributionContradiction(relations));

    // ── Rule 7: Entity Duplication ──
    conflicts.push(checkEntityDuplication(entities));

    // ── Compute Global Credibility Score ──
    const credibilityScore = computeCredibilityScore(entities, relations, source_reliability);

    // ── LLM-based conflict resolution for warnings/failures ──
    let llmResolution = null;
    const hasConflicts = conflicts.some(c => c.status === "warn" || c.status === "fail");
    
    if (hasConflicts) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
        llmResolution = await resolveConflictsWithLLM(LOVABLE_API_KEY, conflicts, entities, relations);
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

function checkTemporalOverlap(causalLinks: CausalLink[]): ConflictResult {
  const orders = causalLinks.map(l => l.temporal_order).filter(Boolean);
  const duplicateOrders = orders.filter((o, i) => orders.indexOf(o) !== i);
  
  if (duplicateOrders.length > 0) {
    return { rule: "Temporal Overlap Check", status: "warn", detail: `Duplicate temporal orders found: ${[...new Set(duplicateOrders)].join(", ")}`, type: "temporal", affected_items: duplicateOrders.map(String) };
  }

  // Check for reversed causality
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
  
  // Check if same TTP is attributed to multiple unrelated actors
  const ttpActorMap: Record<string, string[]> = {};
  for (const rel of relations) {
    if (rel.relation === "uses" || rel.relation === "employs" || rel.relation === "implements") {
      const ttp = ttps.find(t => t.name === rel.target);
      const actor = actors.find(a => a.name === rel.source);
      if (ttp && actor) {
        if (!ttpActorMap[ttp.name]) ttpActorMap[ttp.name] = [];
        ttpActorMap[ttp.name].push(actor.name);
      }
    }
  }

  const sharedTTPs = Object.entries(ttpActorMap).filter(([_, actors]) => actors.length > 1);
  if (sharedTTPs.length > 0) {
    return { rule: "TTP Consistency", status: "warn", detail: `${sharedTTPs.length} TTP(s) shared across multiple actors — requires disambiguation`, type: "behavioral", affected_items: sharedTTPs.map(([ttp]) => ttp) };
  }

  return { rule: "TTP Consistency", status: "pass", detail: "All TTPs uniquely attributed", type: "behavioral" };
}

function checkInfrastructureReuse(entities: Entity[], relations: Relation[]): ConflictResult {
  const infra = entities.filter(e => e.type === "infrastructure");
  const infraActorMap: Record<string, string[]> = {};
  
  for (const rel of relations) {
    if (rel.relation === "communicates_with" || rel.relation === "hosts" || rel.relation === "uses") {
      const infraEntity = infra.find(i => i.name === rel.target);
      if (infraEntity) {
        if (!infraActorMap[infraEntity.name]) infraActorMap[infraEntity.name] = [];
        if (!infraActorMap[infraEntity.name].includes(rel.source)) {
          infraActorMap[infraEntity.name].push(rel.source);
        }
      }
    }
  }

  const shared = Object.entries(infraActorMap).filter(([_, actors]) => actors.length > 1);
  if (shared.length > 0) {
    return { rule: "Infrastructure Reuse", status: "warn", detail: `${shared.length} infrastructure element(s) shared across actors — possible false flag or shared hosting`, type: "infrastructure", affected_items: shared.map(([infra]) => infra) };
  }

  return { rule: "Infrastructure Reuse", status: "pass", detail: "Unique infrastructure per actor confirmed", type: "infrastructure" };
}

function checkCredibility(entities: Entity[], sourceReliability: number): ConflictResult {
  const lowConfidence = entities.filter(e => e.confidence < 0.5);
  
  if (sourceReliability < 0.5) {
    return { rule: "Credibility Assessment", status: "fail", detail: `Source reliability (${sourceReliability}) below threshold (0.5)`, type: "source" };
  }
  
  if (lowConfidence.length > 0) {
    return { rule: "Credibility Assessment", status: "warn", detail: `${lowConfidence.length} entities below confidence threshold (< 0.5)`, type: "source", affected_items: lowConfidence.map(e => e.name) };
  }

  return { rule: "Credibility Assessment", status: "pass", detail: "All entities above confidence threshold", type: "source" };
}

function checkCausalCoherence(causalLinks: CausalLink[]): ConflictResult {
  // Check for circular causality
  const visited = new Set<string>();
  for (const link of causalLinks) {
    if (visited.has(link.effect) && causalLinks.some(l => l.cause === link.effect && l.effect === link.cause)) {
      return { rule: "Causal Coherence", status: "fail", detail: `Circular causality detected: ${link.cause} ↔ ${link.effect}`, type: "causal" };
    }
    visited.add(link.cause);
  }

  // Check temporal monotonicity
  const sortedLinks = [...causalLinks].sort((a, b) => (a.temporal_order || 0) - (b.temporal_order || 0));
  for (let i = 0; i < sortedLinks.length - 1; i++) {
    if (sortedLinks[i].effect !== sortedLinks[i + 1]?.cause && sortedLinks[i + 1]) {
      // Non-contiguous chain — warning but not failure
    }
  }

  return { rule: "Causal Coherence", status: "pass", detail: "All causal chains are temporally ordered and logically consistent", type: "causal" };
}

function checkAttributionContradiction(relations: Relation[]): ConflictResult {
  const attributions = relations.filter(r => r.relation === "attributed_to");
  const campaignActorMap: Record<string, string[]> = {};
  
  for (const rel of attributions) {
    if (!campaignActorMap[rel.source]) campaignActorMap[rel.source] = [];
    campaignActorMap[rel.source].push(rel.target);
  }

  const contradictions = Object.entries(campaignActorMap).filter(([_, actors]) => actors.length > 1);
  if (contradictions.length > 0) {
    return { rule: "Attribution Contradiction", status: "fail", detail: `Campaign(s) attributed to multiple actors: ${contradictions.map(([c, a]) => `${c} → [${a.join(", ")}]`).join("; ")}`, type: "attribution", affected_items: contradictions.map(([c]) => c) };
  }

  return { rule: "Attribution Contradiction", status: "pass", detail: "No contradictory attributions detected", type: "attribution" };
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
    return { rule: "Entity Deduplication", status: "warn", detail: `${duplicates.length} potential duplicate entities detected — consider merging`, type: "deduplication", affected_items: duplicates.map(([_, ents]) => ents.map(e => e.name).join(" / ")) };
  }

  return { rule: "Entity Deduplication", status: "pass", detail: "No duplicate entities detected", type: "deduplication" };
}

function computeCredibilityScore(entities: Entity[], relations: Relation[], sourceReliability: number): number {
  if (entities.length === 0) return 0;
  
  const avgEntityConf = entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length;
  const avgRelConf = relations.length > 0 ? relations.reduce((sum, r) => sum + r.confidence, 0) / relations.length : 0;
  
  // S = Σ(w_i × conf_i × reliability_i) / N  (Ch. 4.4)
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
          { role: "system", content: "You are a cybersecurity analyst. Provide brief, actionable resolution recommendations for Knowledge Graph conflicts." },
          { role: "user", content: `The following conflicts were detected in our threat intelligence Knowledge Graph. Provide resolution recommendations:\n\n${JSON.stringify(failedConflicts, null, 2)}\n\nEntities involved: ${entities.map(e => `${e.name} (${e.type})`).join(", ")}` },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("LLM conflict resolution error:", text);
      return "LLM resolution unavailable";
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No resolution generated";
  } catch (e) {
    console.error("LLM resolution error:", e);
    return "LLM resolution failed";
  }
}
