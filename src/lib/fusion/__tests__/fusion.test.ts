import { describe, it, expect } from "vitest";
import {
  clamp01, noisyOr, minFusion, weightedFusion, fuse,
  freshness, decayHalfLife, applyFreshness,
} from "../index";

describe("fusion math", () => {
  it("clamp01 handles edges, NaN, and out-of-range", () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.7)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(0);
  });

  it("noisyOr matches 1-(1-a)(1-b)", () => {
    expect(noisyOr(0.91, 0.74)).toBeCloseTo(1 - 0.09 * 0.26, 6);
    expect(noisyOr(0, 0)).toBe(0);
    expect(noisyOr(1, 0.5)).toBe(1);
    // clamping
    expect(noisyOr(-1, 0.5)).toBeCloseTo(0.5, 6);
  });

  it("minFusion picks the smaller clamped input", () => {
    expect(minFusion(0.3, 0.8)).toBeCloseTo(0.3, 6);
    expect(minFusion(0.9, 0.9)).toBeCloseTo(0.9, 6);
    expect(minFusion(-0.5, 0.4)).toBe(0);
  });

  it("weightedFusion defaults to alpha=0.5", () => {
    expect(weightedFusion(0.8, 0.4)).toBeCloseTo(0.6, 6);
    expect(weightedFusion(0.8, 0.4, 1)).toBeCloseTo(0.8, 6);
    expect(weightedFusion(0.8, 0.4, 0)).toBeCloseTo(0.4, 6);
  });

  it("fuse dispatcher routes to the right method", () => {
    expect(fuse("noisy_or", 0.5, 0.5)).toBeCloseTo(0.75, 6);
    expect(fuse("min", 0.5, 0.5)).toBeCloseTo(0.5, 6);
    expect(fuse("weighted", 0.5, 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe("temporal decay", () => {
  it("freshness(0, h) = 1", () => {
    expect(freshness(0, 30)).toBe(1);
  });

  it("freshness(h, h) = 0.5", () => {
    expect(freshness(30, 30)).toBeCloseTo(0.5, 6);
  });

  it("freshness clamps to 0.05 floor for very old", () => {
    expect(freshness(10 * 30, 30)).toBe(0.05);
    expect(freshness(1000, 30)).toBe(0.05);
  });

  it("freshness treats negative age as 0", () => {
    expect(freshness(-10, 30)).toBe(1);
  });

  it("decayHalfLife returns documented defaults", () => {
    expect(decayHalfLife("ip")).toBe(30);
    expect(decayHalfLife("domain")).toBe(30);
    expect(decayHalfLife("hash")).toBe(180);
    expect(decayHalfLife("ttp")).toBe(365);
  });

  it("applyFreshness multiplies clamped confidence by freshness factor", () => {
    expect(applyFreshness(0.88, 95, "ip")).toBeCloseTo(0.88 * Math.pow(0.5, 95 / 30), 6);
    expect(applyFreshness(1.5, 0, "ttp")).toBe(1);
    expect(applyFreshness(0.5, 0, "ip")).toBeCloseTo(0.5, 6);
  });
});
