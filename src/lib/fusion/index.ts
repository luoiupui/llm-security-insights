/**
 * Pure fusion math + temporal decay helpers.
 *
 * Implements the storage-rule arithmetic from
 * `public/reports/ontology-corroborated-finding-spec.md` §1.3 and the decay
 * constants from `public/reports/conflict-rules-multimodal-extension.md` §1.
 *
 * No I/O, no Supabase. Safe to import from anywhere (client, edge, tests).
 */

export type FusionMethod = "noisy_or" | "min" | "weighted";

/** Clamp x to [0,1]. NaN/non-finite → 0. */
export function clamp01(x: number): number {
  if (typeof x !== "number" || !Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function noisyOr(a: number, b: number): number {
  const x = clamp01(a);
  const y = clamp01(b);
  return clamp01(1 - (1 - x) * (1 - y));
}

export function minFusion(a: number, b: number): number {
  return clamp01(Math.min(clamp01(a), clamp01(b)));
}

export function weightedFusion(a: number, b: number, alpha = 0.5): number {
  const w = clamp01(alpha);
  return clamp01(w * clamp01(a) + (1 - w) * clamp01(b));
}

export function fuse(method: FusionMethod, a: number, b: number, alpha = 0.5): number {
  switch (method) {
    case "noisy_or":
      return noisyOr(a, b);
    case "min":
      return minFusion(a, b);
    case "weighted":
      return weightedFusion(a, b, alpha);
  }
}

export type IndicatorKind = "ip" | "domain" | "hash" | "ttp";

/** Default half-lives in days, per conflict-rules-multimodal-extension.md §1. */
export function decayHalfLife(kind: IndicatorKind): number {
  switch (kind) {
    case "ip":
    case "domain":
      return 30;
    case "hash":
      return 180;
    case "ttp":
      return 365;
  }
}

/**
 * Freshness factor `0.5 ^ (age/halfLife)` clamped to [0.05, 1.0].
 * Negative ages are treated as 0 (future timestamp ⇒ fully fresh).
 */
export function freshness(ageDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(ageDays) || !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    return 1.0;
  }
  const age = Math.max(0, ageDays);
  const f = Math.pow(0.5, age / halfLifeDays);
  if (f < 0.05) return 0.05;
  if (f > 1.0) return 1.0;
  return f;
}

/** Apply freshness decay to a confidence value for an indicator of the given kind. */
export function applyFreshness(conf: number, ageDays: number, kind: IndicatorKind): number {
  return clamp01(clamp01(conf) * freshness(ageDays, decayHalfLife(kind)));
}
