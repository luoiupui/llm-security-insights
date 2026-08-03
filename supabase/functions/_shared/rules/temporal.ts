// C1 — Temporal-drift rules R8–R12 (deterministic, no LLM).
// Edge-function copy of src/lib/conflicts/temporal-rules.ts.

import type { RuleCausalLink, RuleEntity, RuleRelation, RuleViolation } from "./types.ts";

const CAUSAL_ORDER: Record<string, number> = { enables: 1, leads_to: 2, triggers: 3 };

export interface TemporalContext {
  windowDays?: number;
  reportObservedAt?: string;
}

const tag = (v: Omit<RuleViolation, "layer" | "provenance">): RuleViolation => ({
  ...v,
  layer: "C1",
  provenance: "adaptive",
});

/** R8 — causal-verb monotonicity: enables ≺ leads_to ≺ triggers. */
export function ruleR8_causalMonotonicity(causal: RuleCausalLink[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  const seen = new Map<string, number>();
  for (const link of causal) {
    const rank = CAUSAL_ORDER[link.causal_type ?? ""] ?? 0;
    if (!rank) continue;
    const prev = seen.get(link.effect);
    if (prev !== undefined && rank < prev) {
      out.push(tag({
        rule_id: "R8_causal_monotonicity",
        severity: "warning",
        message: `Causal verb "${link.causal_type}" appears after a stronger verb targeting the same effect "${link.effect}"`,
        evidence: link,
      }));
    }
    seen.set(link.cause, Math.max(seen.get(link.cause) ?? 0, rank));
  }
  return out;
}

/** R9 — observed_at ordering: a cause with a later timestamp than its effect. */
export function ruleR9_timestampOrder(causal: RuleCausalLink[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const link of causal) {
    const c = link.cause_observed_at;
    const e = link.effect_observed_at;
    if (!c || !e) continue;
    if (Date.parse(c) > Date.parse(e)) {
      out.push(tag({
        rule_id: "R9_timestamp_order",
        severity: "failure",
        message: `Cause "${link.cause}" observed after effect "${link.effect}"`,
        evidence: { cause_at: c, effect_at: e },
      }));
    }
  }
  return out;
}

/** R10 — drift window: causal link spans more than N days with no intermediate stage. */
export function ruleR10_driftWindow(
  causal: RuleCausalLink[],
  ctx: TemporalContext = {},
): RuleViolation[] {
  const windowDays = ctx.windowDays ?? 180;
  const out: RuleViolation[] = [];
  for (const link of causal) {
    const c = link.cause_observed_at;
    const e = link.effect_observed_at;
    if (!c || !e) continue;
    const daysApart = Math.abs(Date.parse(e) - Date.parse(c)) / 86_400_000;
    if (daysApart > windowDays) {
      out.push(tag({
        rule_id: "R10_drift_window",
        severity: "warning",
        message: `Causal link "${link.cause} → ${link.effect}" spans ${daysApart.toFixed(0)} d (>${windowDays} d) with no documented intermediate stage`,
        evidence: { daysApart, cause_at: c, effect_at: e },
      }));
    }
  }
  return out;
}

/** R11 — actor alias flip: an alias pair spanning two entity types. */
export function ruleR11_actorAliasFlip(
  relations: RuleRelation[],
  entities: RuleEntity[],
): RuleViolation[] {
  const out: RuleViolation[] = [];
  const aka = relations.filter((r) => r.relation === "also_known_as");
  const alias: Record<string, Set<string>> = {};
  for (const r of aka) {
    (alias[r.source] ??= new Set()).add(r.target);
    (alias[r.target] ??= new Set()).add(r.source);
  }
  const typeOf = new Map(entities.map((e) => [e.name, e.type]));
  for (const src of Object.keys(alias)) {
    for (const dst of alias[src]) {
      if (typeOf.has(src) && typeOf.has(dst) && typeOf.get(src) !== typeOf.get(dst)) {
        out.push(tag({
          rule_id: "R11_actor_alias_flip",
          severity: "failure",
          message: `Alias "${src} ↔ ${dst}" spans two entity types (${typeOf.get(src)} / ${typeOf.get(dst)})`,
          evidence: { src, dst },
        }));
      }
    }
  }
  return out;
}

/** R12 — non-monotonic report timeline: a pair changes relation across reports. */
export function ruleR12_reportTimeline(relations: RuleRelation[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  const byPair = new Map<string, { rel: string; at?: string }[]>();
  for (const r of relations) {
    const key = `${r.source}::${r.target}`;
    const arr = byPair.get(key) ?? [];
    arr.push({ rel: r.relation, at: r.observed_at });
    byPair.set(key, arr);
  }
  for (const [key, arr] of byPair) {
    const unique = new Set(arr.map((x) => x.rel));
    if (unique.size > 1 && arr.filter((x) => !!x.at).length >= 2) {
      out.push(tag({
        rule_id: "R12_report_timeline",
        severity: "warning",
        message: `Pair "${key}" changed relation across reports (${Array.from(unique).join(", ")}) — possible retraction/update`,
        evidence: { pair: key, changes: arr },
      }));
    }
  }
  return out;
}

export function runTemporalRules(
  entities: RuleEntity[],
  relations: RuleRelation[],
  causal: RuleCausalLink[],
  ctx: TemporalContext = {},
): RuleViolation[] {
  return [
    ...ruleR8_causalMonotonicity(causal),
    ...ruleR9_timestampOrder(causal),
    ...ruleR10_driftWindow(causal, ctx),
    ...ruleR11_actorAliasFlip(relations, entities),
    ...ruleR12_reportTimeline(relations),
  ];
}
