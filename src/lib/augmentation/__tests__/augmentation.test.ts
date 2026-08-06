import { describe, it, expect } from "vitest";
import { sampleTestCases } from "@/lib/test-corpus";
import {
  augStats,
  augmentedVariants,
  transformCounts,
  groupBySeed,
  seedFolds,
  clusterBootstrapIndices,
  isAugmented,
  AUG_DATASET,
} from "@/lib/augmentation";

describe("GoldAug-CTI v1", () => {
  it("reaches the >300-item target while keeping 56 independent labels", () => {
    expect(augStats.total).toBeGreaterThan(300);
    expect(augStats.independentLabels).toBe(sampleTestCases.length);
    expect(AUG_DATASET.independentLabels).toBe(sampleTestCases.length);
  });

  it("produces unique ids, all traceable to a Gold-56 seed", () => {
    const ids = augmentedVariants.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    const seedIds = new Set(sampleTestCases.map((s) => s.id));
    expect(augmentedVariants.every((v) => seedIds.has(v.seedId))).toBe(true);
  });

  it("never emits a variant identical to its seed", () => {
    const byId = new Map(sampleTestCases.map((s) => [s.id, s.text]));
    expect(augmentedVariants.every((v) => v.text.trim() !== byId.get(v.seedId)?.trim())).toBe(true);
  });

  it("carries the seed gold labels on label-preserving variants", () => {
    const byId = new Map(sampleTestCases.map((s) => [s.id, s]));
    for (const v of augmentedVariants.filter((x) => x.labelPreserving)) {
      expect(v.groundTruth).toEqual(byId.get(v.seedId)!.groundTruth);
    }
  });

  it("marks defect-injected variants explicitly", () => {
    const defects = augmentedVariants.filter((v) => !v.labelPreserving);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.every((v) => v.expects === "temporal_conflict")).toBe(true);
  });

  it("is deterministic across rebuilds", () => {
    expect(transformCounts["a2-boilerplate-prefix"]).toBe(sampleTestCases.length);
    expect(transformCounts["a3-prompt-injection"]).toBe(sampleTestCases.length);
  });

  it("keeps every variant of a seed inside one fold (no leakage)", () => {
    const folds = seedFolds(5);
    const flat = folds.flat();
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(sampleTestCases.length);
  });

  it("bootstraps clusters, not variants", () => {
    const a = clusterBootstrapIndices(augmentedVariants, 7);
    const b = clusterBootstrapIndices(augmentedVariants, 7);
    expect(a).toEqual(b);
    expect(clusterBootstrapIndices(augmentedVariants, 8)).not.toEqual(a);
    expect(groupBySeed().size).toBeLessThanOrEqual(sampleTestCases.length);
  });

  it("type-guards augmented vs original samples", () => {
    expect(isAugmented(augmentedVariants[0])).toBe(true);
    expect(isAugmented(sampleTestCases[0])).toBe(false);
  });
});
