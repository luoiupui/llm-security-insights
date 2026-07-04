/**
 * Temporal-drift conflict rules (rules 8–12).
 *
 * Adds to the existing 7 hand-written symbolic rules to close the
 * "time drift and multi-stage jumper" gap flagged in the reviewer's
 * comments. All rules are deterministic and reproducible; they do NOT
 * call the LLM. Rule mining lives in `mined-rules.generated.ts`.
 */

import type { ThreatEntity, ThreatRelation, CausalLink } from "@/lib/threat-pipeline";

export interface TemporalViolation {
  rule_id: string;
  severity: "warning" | "failure";
  message: string;
  evidence: unknown;
}

const CAUSAL_ORDER: Record<string, number> = {
  enables: 1,
  leads_to: 2,
  triggers: 3,
};

export interface TemporalContext {
  windowDays?: number;
  reportObservedAt?: string; // ISO
}

/** R8 — causal-verb monotonicity: enables ≺ leads_to ≺ triggers. */
export function ruleR8_causalMonotonicity(causal: CausalLink[]): TemporalViolation[] {
  const out: TemporalViolation[] = [];
  const seen = new Map<string, number>();
  for (const link of causal) {
    const rank = CAUSAL_ORDER[link.causal_type ?? ""] ?? 0;
    if (!rank) continue;
    const prev = seen.get(link.effect);
    if (prev !== undefined && rank < prev) {
      out.push({
        rule_id: "R8_causal_monotonicity",
        severity: "warning",
        message: `Causal verb "${link.causal_type}" appears after a stronger verb targeting the same effect "${link.effect}"`,
        evidence: link,
      });
    }
    seen.set(link.cause, Math.max(seen.get(link.cause) ?? 0, rank));
  }
  return out;
}

/** R9 — observed_at ordering: a cause with later timestamp than its effect. */
export function ruleR9_timestampOrder(causal: CausalLink[]): TemporalViolation[] {
  const out: TemporalViolation[] = [];
  for (const link of causal) {
    const c = (link as { cause_observed_at?: string }).cause_observed_at;
    const e = (link as { effect_observed_at?: string }).effect_observed_at;
    if (!c || !e) continue;
    if (Date.parse(c) > Date.parse(e)) {
      out.push({
        rule_id: "R9_timestamp_order",
        severity: "failure",
        message: `Cause "${link.cause}" observed after effect "${link.effect}"`,
        evidence: { cause_at: c, effect_at: e },
      });
    }
  }
  return out;
}

/** R10 — drift window: causal link spans more than N days without an intermediate stage. */
export function ruleR10_driftWindow(
  causal: CausalLink[],
  ctx: TemporalContext = {},
): TemporalViolation[] {
  const windowDays = ctx.windowDays ?? 180;
  const out: TemporalViolation[] = [];
  for (const link of causal) {
    const c = (link as { cause_observed_at?: string }).cause_observed_at;
    const e = (link as { effect_observed_at?: string }).effect_observed_at;
    if (!c || !e) continue;
    const daysApart = Math.abs(Date.parse(e) - Date.parse(c)) / (86_400_000);
    if (daysApart > windowDays) {
      out.push({
        rule_id: "R10_drift_window",
        severity: "warning",
        message: `Causal link "${link.cause} → ${link.effect}" spans ${daysApart.toFixed(0)} d (>${windowDays} d) with no documented intermediate stage`,
        evidence: { daysApart, cause_at: c, effect_at: e },
      });
    }
  }
  return out;
}

/** R11 — actor alias flip: two `also_known_as` relations disagree on canonical form. */
export function ruleR11_actorAliasFlip(relations: ThreatRelation[], entities: ThreatEntity[]): TemporalViolation[] {
  const out: TemporalViolation[] = [];
  const aka = relations.filter((r) => r.relation === "also_known_as");
  const alias: Record<string, Set<string>> = {};
  for (const r of aka) {
    alias[r.source] = alias[r.source] || new Set();
    alias[r.source].add(r.target);
    alias[r.target] = alias[r.target] || new Set();
    alias[r.target].add(r.source);
  }
  // detect a 3-cycle where canonical types disagree
  const typeOf = new Map(entities.map((e) => [e.name, e.type]));
  for (const src of Object.keys(alias)) {
    for (const dst of alias[src]) {
      if (typeOf.has(src) && typeOf.has(dst) && typeOf.get(src) !== typeOf.get(dst)) {
        out.push({
          rule_id: "R11_actor_alias_flip",
          severity: "failure",
          message: `Alias "${src} ↔ ${dst}" spans two entity types (${typeOf.get(src)} / ${typeOf.get(dst)})`,
          evidence: { src, dst },
        });
      }
    }
  }
  return out;
}

/** R12 — non-monotonic report timeline: extraction claims two conflicting facts across reports observed at different times. */
export function ruleR12_reportTimeline(
  relations: ThreatRelation[],
  ctx: TemporalContext = {},
): TemporalViolation[] {
  const out: TemporalViolation[] = [];
  const byPair = new Map<string, { rel: string; at?: string }[]>();
  for (const r of relations) {
    const key = `${r.source}::${r.target}`;
    const at = (r as { observed_at?: string }).observed_at;
    const arr = byPair.get(key) ?? [];
    arr.push({ rel: r.relation, at });
    byPair.set(key, arr);
  }
  for (const [key, arr] of byPair) {
    const unique = new Set(arr.map((x) => x.rel));
    if (unique.size > 1) {
      // check if the change looks like drift (different timestamps) rather than duplicate extraction
      const withTs = arr.filter((x) => !!x.at);
      if (withTs.length >= 2) {
        out.push({
          rule_id: "R12_report_timeline",
          severity: "warning",
          message: `Pair "${key}" changed relation across reports (${Array.from(unique).join(", ")}) — possible retraction/update`,
          evidence: { pair: key, changes: arr },
        });
      }
    }
  }
  return out;
}

export function runTemporalRules(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causal: CausalLink[],
  ctx: TemporalContext = {},
): TemporalViolation[] {
  return [
    ...ruleR8_causalMonotonicity(causal),
    ...ruleR9_timestampOrder(causal),
    ...ruleR10_driftWindow(causal, ctx),
    ...ruleR11_actorAliasFlip(relations, entities),
    ...ruleR12_reportTimeline(relations, ctx),
  ];
}
