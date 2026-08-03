// Shared rule-kernel types (Deno, edge-function side).
// Mirrored on the browser side by src/lib/conflicts/*.

export interface RuleEntity {
  name: string;
  type: string;
  confidence?: number;
  stix_type?: string;
  observed_at?: string;
  [k: string]: unknown;
}

export interface RuleRelation {
  source: string;
  target: string;
  relation: string;
  confidence?: number;
  edge_type?: string;
  observed_at?: string;
  [k: string]: unknown;
}

export interface RuleCausalLink {
  cause: string;
  effect: string;
  causal_type: string;
  temporal_order?: number;
  confidence?: number;
  cause_observed_at?: string;
  effect_observed_at?: string;
  [k: string]: unknown;
}

export type RuleProvenance = "expert" | "adaptive" | "mined";
export type RuleLayer = "baseline" | "C1" | "C2" | "C3" | "C4";
export type RuleSeverity = "warning" | "failure";

/** A single violation emitted by any rule layer. */
export interface RuleViolation {
  rule_id: string;
  severity: RuleSeverity;
  message: string;
  evidence: unknown;
  layer?: RuleLayer;
  provenance?: RuleProvenance;
}

/** Registry descriptor — snapshotted into kg_rule_sets for replay. */
export interface RuleDescriptor {
  rule_id: string;
  layer: RuleLayer;
  taxonomy:
    | "temporal"
    | "causal"
    | "ontological"
    | "provenance"
    | "cross_modal"
    | "kill_chain"
    | "anomaly"
    | "other";
  provenance: RuleProvenance;
  severity: RuleSeverity;
  description: string;
}
