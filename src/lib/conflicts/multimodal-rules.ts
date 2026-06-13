/**
 * Multi-Modal Fusion Conflict Rules (R11–R13)
 * ════════════════════════════════════════════
 * Pure, side-effect-free implementations of the rules specified in
 * `public/reports/conflict-rules-multimodal-extension.md` §1–§3.
 *
 * These extend the existing 10-rule symbolic engine in
 * `supabase/functions/threat-conflicts/index.ts`. The edge function inlines
 * Deno-compatible copies of these rules (it cannot import from `src/`); this
 * module is the in-app reference implementation used by tests and by future
 * client-side previews.
 *
 * Backward-compatibility contract:
 *   - When inputs carry no modality / freshness metadata, every rule returns
 *     `pass` with an explanatory detail. This keeps existing pipeline runs
 *     (which do not yet emit modality tags) green and makes Phase 3 a purely
 *     additive change.
 *
 * @see public/reports/conflict-rules-multimodal-extension.md
 * @see src/lib/fusion/index.ts  – `freshness()` math used by R12
 */

import { freshness, clamp01 } from "@/lib/fusion";

export type SourceModality = "external_cti" | "internal_flow" | "fused" | "unknown";

export interface MmEntity {
  name: string;
  type: string;
  confidence: number;
  source_modality?: SourceModality;
  conf_narrative?: number;
  conf_behavioral?: number;
  observed_at?: string; // ISO timestamp
}

export interface MmRelation {
  source: string;
  relation: string;
  target: string;
  confidence: number;
  source_modality?: SourceModality;
  observed_at?: string;
  indicator_type?: "ip" | "domain" | "hash" | "ttp" | string;
}

export interface MmConflictResult {
  rule: string;
  rule_id: "R11" | "R12" | "R13";
  status: "pass" | "warn" | "fail";
  detail: string;
  type: string;
  affected_items?: string[];
  flag?: "requires_internal_corroboration" | "stale_match" | "modality_conflict";
  /** Optional dual-confidence payload surfaced in the Conflict Detection UI. */
  dual_confidence?: Array<{
    item: string;
    external: number;
    internal: number;
    fused_before?: number;
    fused_after?: number;
    freshness?: number;
  }>;
}

const HALF_LIFE_DAYS: Record<string, number> = {
  ip: 30,
  domain: 30,
  hash: 180,
  ttp: 365,
};

const HARD_CUTOFF_DAYS: Record<string, number> = {
  ip: 180,
  domain: 180,
  hash: 730,
};

function ageDays(observedAt?: string, now: Date = new Date()): number | null {
  if (!observedAt) return null;
  const t = Date.parse(observedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

/** Heuristic fallback when `source_modality` is missing. */
function modalityOf(e: MmEntity | MmRelation): SourceModality {
  if (e.source_modality) return e.source_modality;
  const t = (e as MmEntity).type;
  if (t === "indicator" || t === "ioc") return "external_cti";
  if (t === "flow_pattern" || t === "internal_asset") return "internal_flow";
  return "unknown";
}

/**
 * R11 — `unverified_external`
 * Entities supported only by external CTI (no internal corroboration) above
 * the attribution threshold are clamped to `fused_conf ≤ 0.6`.
 */
export function applyR11(
  entities: MmEntity[],
  relations: MmRelation[],
  opts: { attributionThreshold?: number; clamp?: number } = {},
): MmConflictResult {
  const threshold = opts.attributionThreshold ?? 0.7;
  const clamp = opts.clamp ?? 0.6;

  const corroboratedNames = new Set<string>();
  for (const r of relations) {
    if (r.relation === "corroborates" || modalityOf(r) === "internal_flow") {
      corroboratedNames.add(r.source);
      corroboratedNames.add(r.target);
    }
  }

  const flagged: MmEntity[] = [];
  const dual: NonNullable<MmConflictResult["dual_confidence"]> = [];
  for (const e of entities) {
    if (modalityOf(e) !== "external_cti") continue;
    if (e.confidence < threshold) continue;
    if (corroboratedNames.has(e.name)) continue;
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
      rule: "Unverified External (R11)",
      rule_id: "R11",
      status: "pass",
      type: "multimodal_fusion",
      detail:
        entities.some((e) => modalityOf(e) === "external_cti")
          ? "All external CTI entities have internal corroboration"
          : "No external CTI entities present (rule no-op)",
    };
  }

  return {
    rule: "Unverified External (R11)",
    rule_id: "R11",
    status: "warn",
    type: "multimodal_fusion",
    flag: "requires_internal_corroboration",
    detail: `${flagged.length} external-only entit${flagged.length === 1 ? "y" : "ies"} above threshold; clamping fused_conf ≤ ${clamp}`,
    affected_items: flagged.map((e) => e.name),
    dual_confidence: dual,
  };
}

/**
 * R12 — `weak_match_stale_ioc`
 * Internal flow → external IoC matches whose age exceeds the half-life are
 * down-weighted by `freshness(age, halfLife)`.
 */
export function applyR12(
  relations: MmRelation[],
  opts: { now?: Date; minDecay?: number } = {},
): MmConflictResult {
  const now = opts.now ?? new Date();
  const minDecay = opts.minDecay ?? 0.5; // flag when freshness drops below this

  const items: string[] = [];
  const dual: NonNullable<MmConflictResult["dual_confidence"]> = [];
  let stalest = 1;

  for (const r of relations) {
    if (r.relation !== "matches_ioc") continue;
    const age = ageDays(r.observed_at, now);
    if (age == null) continue;
    const indType = (r.indicator_type ?? "ip").toLowerCase();
    const halfLife = HALF_LIFE_DAYS[indType] ?? 30;
    const cutoff = HARD_CUTOFF_DAYS[indType];
    const fr = clamp01(freshness(age, halfLife));
    if (cutoff != null && age > cutoff) {
      items.push(`${r.source}→${r.target} (age ${age.toFixed(0)}d > cutoff ${cutoff}d)`);
      dual.push({
        item: `${r.source}→${r.target}`,
        external: r.confidence,
        internal: 0,
        fused_before: r.confidence,
        fused_after: 0,
        freshness: 0,
      });
      stalest = 0;
      continue;
    }
    if (fr < minDecay) {
      items.push(`${r.source}→${r.target} (freshness ${fr.toFixed(3)})`);
      dual.push({
        item: `${r.source}→${r.target}`,
        external: r.confidence,
        internal: 0,
        fused_before: r.confidence,
        fused_after: clamp01(r.confidence * fr),
        freshness: fr,
      });
      stalest = Math.min(stalest, fr);
    }
  }

  if (items.length === 0) {
    return {
      rule: "Stale IoC Match (R12)",
      rule_id: "R12",
      status: "pass",
      type: "multimodal_fusion",
      detail: relations.some((r) => r.relation === "matches_ioc")
        ? "All IoC matches within freshness window"
        : "No IoC matches present (rule no-op)",
    };
  }

  return {
    rule: "Stale IoC Match (R12)",
    rule_id: "R12",
    status: "warn",
    type: "multimodal_fusion",
    flag: "stale_match",
    detail: `${items.length} stale IoC match(es); minimum freshness ${stalest.toFixed(3)}`,
    affected_items: items,
    dual_confidence: dual,
  };
}

/**
 * R13 — `cross_modal_disagreement`
 * Same entity with `conf_narrative ≥ hi` AND `conf_behavioral ≤ lo` (or
 * inverse) is flagged as a modality conflict and slated for the LLM resolver.
 */
export function applyR13(
  entities: MmEntity[],
  opts: { hi?: number; lo?: number } = {},
): MmConflictResult {
  const hi = opts.hi ?? 0.8;
  const lo = opts.lo ?? 0.3;

  const conflicts: MmEntity[] = [];
  const dual: NonNullable<MmConflictResult["dual_confidence"]> = [];
  for (const e of entities) {
    const n = e.conf_narrative;
    const b = e.conf_behavioral;
    if (n == null || b == null) continue;
    const disagree = (n >= hi && b <= lo) || (b >= hi && n <= lo);
    if (!disagree) continue;
    conflicts.push(e);
    dual.push({
      item: e.name,
      external: n,
      internal: b,
      fused_before: e.confidence,
      fused_after: 0, // weight zeroed pending resolver
    });
  }

  if (conflicts.length === 0) {
    return {
      rule: "Cross-Modal Disagreement (R13)",
      rule_id: "R13",
      status: "pass",
      type: "multimodal_fusion",
      detail: entities.some((e) => e.conf_narrative != null && e.conf_behavioral != null)
        ? "Narrative and behavioral confidences agree"
        : "No dual-modality evidence present (rule no-op)",
    };
  }

  return {
    rule: "Cross-Modal Disagreement (R13)",
    rule_id: "R13",
    status: "fail",
    type: "multimodal_fusion",
    flag: "modality_conflict",
    detail: `${conflicts.length} entit${conflicts.length === 1 ? "y" : "ies"} with conflicting modality evidence; queued for LLM resolver`,
    affected_items: conflicts.map((e) => e.name),
    dual_confidence: dual,
  };
}

export const MULTIMODAL_RULES = { applyR11, applyR12, applyR13 } as const;
