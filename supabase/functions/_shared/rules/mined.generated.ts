// C3 — Compiled mined rules (edge-function side).
//
// This file is regenerated when a human accepts a candidate in
// `kg_conflict_rule_candidates`. It starts empty so the registry can
// reference it before any rule is accepted.

import type { RuleCausalLink, RuleEntity, RuleRelation, RuleViolation } from "./types.ts";

export interface MinedRuleCtx {
  entities: RuleEntity[];
  relations: RuleRelation[];
  causal: RuleCausalLink[];
}

export interface MinedRule {
  rule_id: string;
  taxonomy: "temporal" | "causal" | "ontological" | "provenance" | "cross_modal" | "kill_chain" | "other";
  description: string;
  severity: "warning" | "failure";
  message: string;
  match: (ctx: MinedRuleCtx) => boolean;
}

export const MINED_RULES: MinedRule[] = [];

export function runMinedRules(ctx: MinedRuleCtx): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const rule of MINED_RULES) {
    let hit = false;
    try {
      hit = rule.match(ctx);
    } catch (_e) {
      continue; // a broken mined rule must never break the pipeline
    }
    if (hit) {
      out.push({
        rule_id: rule.rule_id,
        severity: rule.severity,
        message: rule.message,
        evidence: { taxonomy: rule.taxonomy, description: rule.description },
        layer: "C3",
        provenance: "mined",
      });
    }
  }
  return out;
}
