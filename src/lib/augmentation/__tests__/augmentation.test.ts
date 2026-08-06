import { describe, it, expect } from "vitest";
import { augStats, transformCounts, augmentedVariants, groupBySeed, seedFolds, clusterBootstrapIndices } from "@/lib/augmentation";
describe("goldaug", () => {
  it("counts", () => {
    console.log(JSON.stringify({ ...augStats, transformCounts }, null, 2));
    expect(augStats.total).toBeGreaterThan(300);
  });
  it("ids unique + seeds traceable", () => {
    expect(new Set(augmentedVariants.map(v=>v.id)).size).toBe(augmentedVariants.length);
    expect(groupBySeed().size).toBeLessThanOrEqual(augStats.seeds);
  });
  it("folds disjoint", () => {
    const f = seedFolds(5); const all = f.flat();
    expect(new Set(all).size).toBe(all.length);
    expect(clusterBootstrapIndices().length).toBeGreaterThan(0);
  });
});
