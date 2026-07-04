import { describe, it, expect } from "vitest";
import { bootstrapCI, wilsonInterval, mcnemarTest, stratifiedKFold } from "../stats";

describe("bootstrapCI", () => {
  it("brackets the mean of a known sample", () => {
    const xs = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 0.9 : 0.7));
    const ci = bootstrapCI(xs, { B: 500, seed: 7 });
    expect(ci.mean).toBeCloseTo(0.8, 5);
    expect(ci.lo).toBeGreaterThan(0.7);
    expect(ci.hi).toBeLessThan(0.9);
  });
  it("is deterministic for a given seed", () => {
    const xs = [0.4, 0.5, 0.6, 0.7, 0.8];
    const a = bootstrapCI(xs, { B: 200, seed: 1 });
    const b = bootstrapCI(xs, { B: 200, seed: 1 });
    expect(a.lo).toBe(b.lo);
    expect(a.hi).toBe(b.hi);
  });
});

describe("wilsonInterval", () => {
  it("returns a subset of [0,1]", () => {
    const w = wilsonInterval(9, 10);
    expect(w.lo).toBeGreaterThanOrEqual(0);
    expect(w.hi).toBeLessThanOrEqual(1);
    expect(w.lo).toBeLessThan(w.p);
    expect(w.hi).toBeGreaterThan(w.p);
  });
});

describe("mcnemarTest", () => {
  it("returns p=1 when systems agree", () => {
    const t = mcnemarTest([true, false, true], [true, false, true]);
    expect(t.pValue).toBe(1);
  });
  it("detects a clear disagreement", () => {
    const a = Array(30).fill(true);
    const b = Array(30).fill(false);
    const t = mcnemarTest(a, b);
    expect(t.pValue).toBeLessThan(0.001);
  });
});

describe("stratifiedKFold", () => {
  it("preserves stratum proportions across folds", () => {
    const items = [
      ...Array(20).fill("cti"),
      ...Array(10).fill("clinical"),
    ].map((s, i) => ({ s, i }));
    const folds = stratifiedKFold(items, (x) => x.s, 5, 3);
    expect(folds.length).toBe(5);
    for (const f of folds) {
      const cti = f.filter((x) => x.s === "cti").length;
      const cli = f.filter((x) => x.s === "clinical").length;
      expect(cti).toBeGreaterThanOrEqual(3);
      expect(cli).toBeGreaterThanOrEqual(1);
    }
  });
});
