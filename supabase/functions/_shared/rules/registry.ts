// Hybrid rule-governance registry.
//
// Single source of truth for WHICH rules exist, WHICH layer they belong to,
// and WHERE they came from (expert / adaptive / mined). The registry is
// snapshotted into `kg_rule_sets` on every run so any KG output can be
// replayed against the exact rule set that produced it.

import { runTemporalRules, type TemporalContext } from "./temporal.ts";
import { runKillChainRules } from "./killchain.ts";
import { runMinedRules, MINED_RULES } from "./mined.generated.ts";
import { runAnomalyRules, type AnomalyContext } from "./anomaly.ts";
import type {
  RuleCausalLink,
  RuleDescriptor,
  RuleEntity,
  RuleProvenance,
  RuleRelation,
  RuleViolation,
} from "./types.ts";

/** Bump when the registry content changes in a way that affects outputs. */
export const RULE_KERNEL_VERSION = "v3.0.0";

/** Expert baseline R1–R13 live inline in threat-conflicts/index.ts. */
export const EXPERT_BASELINE: RuleDescriptor[] = [
  { rule_id: "R1_temporal_overlap", layer: "baseline", taxonomy: "temporal", provenance: "expert", severity: "failure", description: "Conflicting or duplicated temporal orders in the causal chain" },
  { rule_id: "R2_ttp_consistency", layer: "baseline", taxonomy: "ontological", provenance: "expert", severity: "warning", description: "Shared TTPs across distinct threat actors" },
  { rule_id: "R3_infrastructure_reuse", layer: "baseline", taxonomy: "provenance", provenance: "expert", severity: "warning", description: "Infrastructure reused across campaigns" },
  { rule_id: "R4_credibility", layer: "baseline", taxonomy: "provenance", provenance: "expert", severity: "warning", description: "Low source reliability or low mean node confidence" },
  { rule_id: "R5_causal_coherence", layer: "baseline", taxonomy: "causal", provenance: "expert", severity: "warning", description: "Causal links lacking coherent cause/effect grounding" },
  { rule_id: "R6_attribution_contradiction", layer: "baseline", taxonomy: "ontological", provenance: "expert", severity: "failure", description: "Contradictory attribution edges for the same campaign" },
  { rule_id: "R7_entity_duplication", layer: "baseline", taxonomy: "ontological", provenance: "expert", severity: "warning", description: "Near-duplicate entities not canonicalised" },
  { rule_id: "R8_graph_connectivity", layer: "baseline", taxonomy: "ontological", provenance: "expert", severity: "warning", description: "Orphan nodes in the extracted graph" },
  { rule_id: "R9_ontological_compliance", layer: "baseline", taxonomy: "ontological", provenance: "expert", severity: "warning", description: "STIX 2.1 SDO/SRO pairing validity" },
  { rule_id: "R10_confidence_propagation", layer: "baseline", taxonomy: "provenance", provenance: "expert", severity: "warning", description: "Edge confidence exceeding its endpoint node confidence" },
  { rule_id: "R11_modality_agreement", layer: "baseline", taxonomy: "cross_modal", provenance: "expert", severity: "warning", description: "Narrative vs behavioural modality disagreement" },
  { rule_id: "R12_freshness", layer: "baseline", taxonomy: "cross_modal", provenance: "expert", severity: "warning", description: "Stale evidence window" },
  { rule_id: "R13_modality_provenance", layer: "baseline", taxonomy: "cross_modal", provenance: "expert", severity: "warning", description: "Missing modality provenance on fused nodes" },
];

/** C1 temporal drift. */
export const C1_RULES: RuleDescriptor[] = [
  { rule_id: "R8_causal_monotonicity", layer: "C1", taxonomy: "temporal", provenance: "adaptive", severity: "warning", description: "enables ≺ leads_to ≺ triggers ordering violated" },
  { rule_id: "R9_timestamp_order", layer: "C1", taxonomy: "temporal", provenance: "adaptive", severity: "failure", description: "Cause observed after its effect" },
  { rule_id: "R10_drift_window", layer: "C1", taxonomy: "temporal", provenance: "adaptive", severity: "warning", description: "Causal span beyond the drift window with no intermediate stage" },
  { rule_id: "R11_actor_alias_flip", layer: "C1", taxonomy: "temporal", provenance: "adaptive", severity: "failure", description: "Alias pair spanning two entity types" },
  { rule_id: "R12_report_timeline", layer: "C1", taxonomy: "temporal", provenance: "adaptive", severity: "warning", description: "Relation for the same pair changed across reports" },
];

/** C2 kill-chain. */
export const C2_RULES: RuleDescriptor[] = [
  { rule_id: "R13_stage_jumper", layer: "C2", taxonomy: "kill_chain", provenance: "adaptive", severity: "warning", description: "Causal link skips ≥2 kill-chain phases" },
  { rule_id: "R13_stage_inversion", layer: "C2", taxonomy: "kill_chain", provenance: "adaptive", severity: "failure", description: "Later phase claimed to enable an earlier one" },
  { rule_id: "R14_cyclic_causality", layer: "C2", taxonomy: "kill_chain", provenance: "adaptive", severity: "failure", description: "Cycle in the causal graph" },
  { rule_id: "R15_orphan_impact", layer: "C2", taxonomy: "kill_chain", provenance: "adaptive", severity: "warning", description: "Impact without upstream execution/lateral/privesc" },
];

/** C4 anomaly. */
export const C4_RULES: RuleDescriptor[] = [
  { rule_id: "R16_novel_edge_pattern", layer: "C4", taxonomy: "anomaly", provenance: "adaptive", severity: "warning", description: "Relation label rare or unseen in the historical KG (warn only)" },
];

/** C3 mined rules, resolved at call time from the compiled sink. */
export function minedDescriptors(): RuleDescriptor[] {
  return MINED_RULES.map((r) => ({
    rule_id: r.rule_id,
    layer: "C3" as const,
    taxonomy: r.taxonomy,
    provenance: "mined" as const,
    severity: r.severity,
    description: r.description,
  }));
}

export function buildRegistry(): RuleDescriptor[] {
  return [...EXPERT_BASELINE, ...C1_RULES, ...C2_RULES, ...minedDescriptors(), ...C4_RULES];
}

/** Deterministic content hash of the registry — the replay key. */
export async function registryFingerprint(registry: RuleDescriptor[]): Promise<string> {
  const canonical = registry
    .map((r) => `${r.rule_id}|${r.layer}|${r.provenance}|${r.severity}`)
    .sort()
    .join("\n");
  const bytes = new TextEncoder().encode(`${RULE_KERNEL_VERSION}\n${canonical}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface AdaptiveInput {
  entities: RuleEntity[];
  relations: RuleRelation[];
  causal: RuleCausalLink[];
  temporalCtx?: TemporalContext;
  anomalyCtx?: AnomalyContext | null;
  /** layers to execute; omitted layers are skipped (used by ablations/replay) */
  layers?: Array<"C1" | "C2" | "C3" | "C4">;
}

export interface AdaptiveOutput {
  violations: RuleViolation[];
  layers_run: string[];
}

export function runAdaptiveLayers(input: AdaptiveInput): AdaptiveOutput {
  const layers = input.layers ?? ["C1", "C2", "C3", "C4"];
  const violations: RuleViolation[] = [];
  if (layers.includes("C1")) {
    violations.push(...runTemporalRules(input.entities, input.relations, input.causal, input.temporalCtx));
  }
  if (layers.includes("C2")) {
    violations.push(...runKillChainRules(input.causal));
  }
  if (layers.includes("C3")) {
    violations.push(...runMinedRules({ entities: input.entities, relations: input.relations, causal: input.causal }));
  }
  if (layers.includes("C4")) {
    violations.push(...runAnomalyRules(input.relations, input.anomalyCtx ?? null));
  }
  return { violations, layers_run: layers };
}

/** Provenance weights used by the credibility penalty (expert > adaptive > mined). */
export const PROVENANCE_WEIGHT: Record<RuleProvenance, number> = {
  expert: 1.0,
  adaptive: 0.7,
  mined: 0.4,
};

/**
 * Provenance-weighted credibility penalty in [0,1].
 * A failure costs twice a warning, scaled by the rule's provenance weight.
 */
export function provenancePenalty(violations: RuleViolation[]): number {
  let penalty = 0;
  for (const v of violations) {
    const w = PROVENANCE_WEIGHT[v.provenance ?? "adaptive"];
    penalty += (v.severity === "failure" ? 0.12 : 0.05) * w;
  }
  return Math.min(0.6, penalty);
}

export type { RuleViolation, RuleDescriptor } from "./types.ts";
