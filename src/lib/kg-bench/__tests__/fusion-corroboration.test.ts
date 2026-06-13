import { describe, it, expect } from "vitest";
import { scoreCorroborations } from "../scorers";
import { GOLD_VERSION, CATEGORIES, getCorpus, CATEGORY_LABEL } from "../corpus";

describe("scoreCorroborations", () => {
  it("perfect match", () => {
    const r = scoreCorroborations(
      [{ ttp: "T1071.001", flow_ref: "flow#a42b" }],
      [{ ttp: "T1071.001", flow_ref: "flow#a42b" }],
    );
    expect(r.f1).toBe(1);
  });
  it("case + punctuation insensitive matching", () => {
    const r = scoreCorroborations(
      [{ ttp: "t1071.001", flow_ref: "FLOW-A42B" }],
      [{ ttp: "T1071.001", flow_ref: "flow#a42b" }],
    );
    expect(r.tp).toBe(1);
  });
  it("zero predicted → 0 F1 when gold present (baseline before fusion job lands)", () => {
    const r = scoreCorroborations([], [{ ttp: "X", flow_ref: "f" }]);
    expect(r.f1).toBe(0);
  });
  it("zero gold + zero predicted → perfect (vacuous)", () => {
    const r = scoreCorroborations([], []);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.f1).toBe(1);
  });
  it("counts false positives", () => {
    const r = scoreCorroborations(
      [{ ttp: "A", flow_ref: "1" }, { ttp: "B", flow_ref: "2" }],
      [{ ttp: "A", flow_ref: "1" }],
    );
    expect(r.tp).toBe(1);
    expect(r.fp).toBe(1);
  });
});

describe("KG-Bench Phase 3 wiring", () => {
  it("exports GOLD_VERSION v2", () => {
    expect(GOLD_VERSION).toBe("v2");
  });
  it("registers fusion_corroboration category", () => {
    expect(CATEGORIES).toContain("fusion_corroboration");
    expect(CATEGORY_LABEL.fusion_corroboration).toBe("Fusion Corroboration");
  });
  it("CTI corpus has at least 2 fusion cases with gold corroborations", () => {
    const fc = getCorpus("cti").filter(c => c.category === "fusion_corroboration");
    expect(fc.length).toBeGreaterThanOrEqual(2);
    for (const c of fc) {
      expect(c.goldCorroborations?.length ?? 0).toBeGreaterThan(0);
    }
  });
  it("Clinical corpus has at least 1 fusion case", () => {
    const fc = getCorpus("clinical").filter(c => c.category === "fusion_corroboration");
    expect(fc.length).toBeGreaterThanOrEqual(1);
  });
});
