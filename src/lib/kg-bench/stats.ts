/**
 * Statistical reliability helpers for KG-Bench.
 *
 * Adds confidence intervals and significance tests on top of the existing
 * scorers so per-category F1 is reported as `F1 ± CI` rather than a bare
 * point estimate.
 *
 * References:
 *   Efron & Tibshirani (1993), "An Introduction to the Bootstrap".
 *   McNemar (1947), "Note on the sampling error of the difference between
 *   correlated proportions or percentages."
 *   Wilson (1927), "Probable inference, the law of succession, and
 *   statistical inference."
 */

export interface CIResult {
  mean: number;
  lo: number;
  hi: number;
  alpha: number;
  n: number;
  b: number;
}

/**
 * Non-parametric percentile bootstrap for a scalar statistic
 * (default: mean). Deterministic given `seed`.
 */
export function bootstrapCI(
  values: number[],
  opts: { B?: number; alpha?: number; seed?: number; stat?: (xs: number[]) => number } = {},
): CIResult {
  const { B = 1000, alpha = 0.05, seed = 42, stat = mean } = opts;
  const n = values.length;
  if (n === 0) return { mean: NaN, lo: NaN, hi: NaN, alpha, n: 0, b: B };
  const rng = mulberry32(seed);
  const reps = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    const sample = new Array<number>(n);
    for (let i = 0; i < n; i++) sample[i] = values[Math.floor(rng() * n)];
    reps[b] = stat(sample);
  }
  const sorted = Array.from(reps).sort((a, b) => a - b);
  const lo = sorted[Math.floor((alpha / 2) * B)];
  const hi = sorted[Math.min(B - 1, Math.floor((1 - alpha / 2) * B))];
  return { mean: stat(values), lo, hi, alpha, n, b: B };
}

/**
 * Wilson score interval for a binomial proportion.
 * Better than the normal approximation at small n or extreme p.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): { p: number; lo: number; hi: number } {
  if (n === 0) return { p: NaN, lo: 0, hi: 1 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

/**
 * McNemar's test for two systems on paired binary outcomes
 * (e.g., "correct on sample i / incorrect on sample i"). Returns the
 * chi-square statistic with continuity correction and a two-sided p-value
 * under a chi-square(1) reference.
 */
export function mcnemarTest(sysA: boolean[], sysB: boolean[]): { b: number; c: number; chiSq: number; pValue: number } {
  if (sysA.length !== sysB.length) throw new Error("mcnemarTest: length mismatch");
  let b = 0;
  let c = 0;
  for (let i = 0; i < sysA.length; i++) {
    if (sysA[i] && !sysB[i]) b++;
    else if (!sysA[i] && sysB[i]) c++;
  }
  if (b + c === 0) return { b, c, chiSq: 0, pValue: 1 };
  const chiSq = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);
  return { b, c, chiSq, pValue: chiSqSurvival1df(chiSq) };
}

/** k-fold stratified split by `stratumKey`. Deterministic given `seed`. */
export function stratifiedKFold<T>(
  items: T[],
  stratumKey: (x: T) => string,
  k = 5,
  seed = 42,
): T[][] {
  const rng = mulberry32(seed);
  const byStratum = new Map<string, T[]>();
  for (const it of items) {
    const s = stratumKey(it);
    if (!byStratum.has(s)) byStratum.set(s, []);
    byStratum.get(s)!.push(it);
  }
  const folds: T[][] = Array.from({ length: k }, () => []);
  for (const arr of byStratum.values()) {
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    arr.forEach((v, i) => folds[i % k].push(v));
  }
  return folds;
}

/* ---- internal helpers ---- */

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Survival function of chi-square with 1 df.
 * chi2_1.sf(x) = erfc(sqrt(x/2)) for x >= 0.
 */
function chiSqSurvival1df(x: number): number {
  if (x <= 0) return 1;
  return erfc(Math.sqrt(x / 2));
}

/** Abramowitz & Stegun 7.1.26 rational approximation to erfc. */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2 - ans;
}

export function formatCI(ci: CIResult, digits = 3): string {
  if (!Number.isFinite(ci.mean)) return "n/a";
  return `${ci.mean.toFixed(digits)} [${ci.lo.toFixed(digits)}, ${ci.hi.toFixed(digits)}]`;
}
