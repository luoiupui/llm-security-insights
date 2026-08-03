// C4 — Embedding / distribution anomaly detection (warn only, never blocks).
//
// Pure function: the caller supplies the historical relation-pattern counts
// (from kg_relations) so the rule itself stays deterministic and testable.

import type { RuleRelation, RuleViolation } from "./types.ts";

export interface AnomalyContext {
  /** relation label -> number of times seen historically in the KG */
  historicalCounts: Record<string, number>;
  /** z-score threshold; default 3 sigma */
  sigma?: number;
}

const tag = (v: Omit<RuleViolation, "layer" | "provenance">): RuleViolation => ({
  ...v,
  layer: "C4",
  provenance: "adaptive",
});

/**
 * R16 — novel edge pattern. Flags relation labels whose historical frequency
 * sits below mu - sigma*stddev of the observed distribution (including
 * never-seen-before labels, count = 0). Always `warning`.
 */
export function ruleR16_novelEdgePattern(
  relations: RuleRelation[],
  ctx: AnomalyContext,
): RuleViolation[] {
  const counts = Object.values(ctx.historicalCounts);
  if (counts.length < 3) return []; // not enough history to model a distribution
  const sigma = ctx.sigma ?? 3;
  const mu = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - mu) ** 2, 0) / counts.length;
  const sd = Math.sqrt(variance) || 1;

  const seen = new Set<string>();
  const out: RuleViolation[] = [];
  for (const r of relations) {
    const label = r.relation;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const observed = ctx.historicalCounts[label] ?? 0;
    const z = (observed - mu) / sd;
    if (z < -sigma || observed === 0) {
      out.push(tag({
        rule_id: "R16_novel_edge_pattern",
        severity: "warning",
        message: observed === 0
          ? `Relation "${label}" has never been seen in the historical KG — novel pattern, review for novelty vs hallucination`
          : `Relation "${label}" is rare in the historical KG (z = ${z.toFixed(2)})`,
        evidence: { relation: label, observed, mu: Number(mu.toFixed(2)), sd: Number(sd.toFixed(2)), z: Number(z.toFixed(2)) },
      }));
    }
  }
  return out;
}

export function runAnomalyRules(
  relations: RuleRelation[],
  ctx: AnomalyContext | null,
): RuleViolation[] {
  if (!ctx) return [];
  return ruleR16_novelEdgePattern(relations, ctx);
}
