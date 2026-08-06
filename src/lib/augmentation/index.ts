/**
 * GoldAug-CTI v1 — the augmented, *derived* corpus.
 *
 * ⚠ This is NOT a second gold corpus. Every variant here descends from one of
 * the 56 hand-labelled Gold-56 seeds, so the number of *independent* labelled
 * observations is still 56. Use it for robustness / invariance measurement and
 * for stress-loading KG construction, never to inflate the headline `n`.
 *
 * Statistics on this corpus MUST be cluster-aware: resample seeds (`seedId`),
 * not variants. `clusterBootstrapIndices` and `seedFolds` below enforce that.
 */

import { sampleTestCases, type TestSample } from "@/lib/test-corpus";
import { TRANSFORMS, type AugmentedSample, type AugFamily, type AugTransformId } from "./transforms";

export type { AugmentedSample, AugFamily, AugTransformId } from "./transforms";
export { TRANSFORM_LABEL } from "./transforms";

/** Public dataset identity — kept distinct from Gold-56 everywhere in the UI. */
export const AUG_DATASET = {
  id: "goldaug-cti-v1",
  name: "GoldAug-CTI v1",
  title: "GoldAug-CTI v1 — derived robustness corpus (Gold-56 seeds)",
  version: "v1",
  seedCorpus: "Gold-56 (src/lib/test-corpus.ts)",
  independentLabels: sampleTestCases.length,
  role: "robustness / invariance evaluation + KG-construction stress load",
  forbidden: "Not admissible as additional independent samples for F1 / CI / McNemar.",
} as const;

function build(): AugmentedSample[] {
  const out: AugmentedSample[] = [];
  for (const seed of sampleTestCases) {
    for (const t of TRANSFORMS) {
      const v = t(seed);
      if (v && v.text.trim() !== seed.text.trim()) out.push(v);
    }
  }
  return out;
}

/** Derived variants only (does not include the 56 originals). */
export const augmentedVariants: AugmentedSample[] = build();

/** Seeds + variants, the set actually run in a robustness sweep. */
export const goldAugCorpus: (TestSample | AugmentedSample)[] = [
  ...sampleTestCases,
  ...augmentedVariants,
];

export function isAugmented(s: TestSample | AugmentedSample): s is AugmentedSample {
  return (s as AugmentedSample).seedId !== undefined;
}

/** Variants grouped by their Gold-56 seed — the cluster unit for statistics. */
export function groupBySeed(variants: AugmentedSample[] = augmentedVariants): Map<string, AugmentedSample[]> {
  const m = new Map<string, AugmentedSample[]>();
  for (const v of variants) {
    const arr = m.get(v.seedId) ?? [];
    arr.push(v);
    m.set(v.seedId, arr);
  }
  return m;
}

export function byTransform(id: AugTransformId): AugmentedSample[] {
  return augmentedVariants.filter((v) => v.transform === id);
}

export function byFamily(f: AugFamily): AugmentedSample[] {
  return augmentedVariants.filter((v) => v.family === f);
}

/* ── cluster-aware statistics helpers ── */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cluster bootstrap: resamples *seed ids* with replacement and returns the
 * variant ids belonging to the drawn seeds. Using a plain item bootstrap over
 * variants would understate the CI by treating correlated copies as
 * independent draws.
 */
export function clusterBootstrapIndices(
  variants: AugmentedSample[] = augmentedVariants,
  seed = 42,
): string[] {
  const groups = groupBySeed(variants);
  const seedIds = [...groups.keys()];
  const rnd = mulberry32(seed);
  const picked: string[] = [];
  for (let i = 0; i < seedIds.length; i++) {
    const s = seedIds[Math.floor(rnd() * seedIds.length)];
    picked.push(...(groups.get(s) ?? []).map((v) => v.id));
  }
  return picked;
}

/**
 * k folds over *seeds*, so every variant of a seed lands in the same fold.
 * Prevents the leakage of a paraphrase of a test case into the same sweep.
 */
export function seedFolds(k = 5, seed = 42): string[][] {
  const seedIds = sampleTestCases.map((s) => s.id);
  const rnd = mulberry32(seed);
  const shuffled = [...seedIds].sort(() => rnd() - 0.5);
  const folds: string[][] = Array.from({ length: k }, () => []);
  shuffled.forEach((id, i) => folds[i % k].push(id));
  return folds;
}

/* ── stats for the UI ── */

const familyCount = (f: AugFamily) => augmentedVariants.filter((v) => v.family === f).length;

export const augStats = {
  seeds: sampleTestCases.length,
  variants: augmentedVariants.length,
  total: sampleTestCases.length + augmentedVariants.length,
  labelPreserving: augmentedVariants.filter((v) => v.labelPreserving).length,
  defectInjected: augmentedVariants.filter((v) => !v.labelPreserving).length,
  families: {
    A1: familyCount("A1"),
    A2: familyCount("A2"),
    A3: familyCount("A3"),
  },
  perTransform: TRANSFORMS.reduce<Record<string, number>>((acc, _t, i) => {
    const id = augmentedVariants.find((v) => v.transform)?.transform;
    void id;
    void i;
    return acc;
  }, {}),
  maxVariantsPerSeed: Math.max(...[...groupBySeed().values()].map((v) => v.length), 0),
  minVariantsPerSeed: Math.min(...[...groupBySeed().values()].map((v) => v.length), 0),
  /** The number that may appear in a CI — unchanged by augmentation. */
  independentLabels: sampleTestCases.length,
};

export const transformCounts: Record<string, number> = augmentedVariants.reduce<Record<string, number>>(
  (acc, v) => {
    acc[v.transform] = (acc[v.transform] ?? 0) + 1;
    return acc;
  },
  {},
);
