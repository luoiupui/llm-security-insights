import { describe, it, expect } from "vitest";
import {
  fusedConfidence,
  canPromoteToConfirmedThreat,
  DEFAULT_PROMOTION_THRESHOLDS,
  toStixSighting,
  CORROBORATED_FINDING_EXTENSION_URI,
  FUSION_METHODS,
  type CorroboratedFinding,
} from "../corroborated-finding";

const sample: CorroboratedFinding = {
  id: "cf-1",
  ttp_ref: null,
  ttp_name: "T1071.001",
  flow_ref: "flow#a42b",
  conf_narrative: 0.91,
  conf_behavioral: 0.74,
  fusion_method: "noisy_or",
  evidence_window: { start: "2026-06-01T00:00:00Z", end: "2026-06-13T00:00:00Z" },
  provenance: { producer: "test", version: "v2", run_id: "r1" },
  created_at: "2026-06-13T00:00:00Z",
};

describe("fusedConfidence", () => {
  it("noisy_or matches spec worked example (0.91, 0.74 → ~0.977)", () => {
    const v = fusedConfidence("noisy_or", 0.91, 0.74);
    expect(v).toBeCloseTo(1 - (1 - 0.91) * (1 - 0.74), 5);
    expect(v).toBeGreaterThan(0.97);
  });
  it("min returns the smaller modality", () => {
    expect(fusedConfidence("min", 0.91, 0.74)).toBeCloseTo(0.74, 5);
  });
  it("weighted defaults to alpha=0.5", () => {
    expect(fusedConfidence("weighted", 1, 0)).toBeCloseTo(0.5, 5);
  });
  it("dempster_shafer falls back to noisy_or (deferred)", () => {
    expect(fusedConfidence("dempster_shafer", 0.5, 0.5))
      .toBeCloseTo(fusedConfidence("noisy_or", 0.5, 0.5), 5);
  });
  it("clamps out-of-range inputs", () => {
    expect(fusedConfidence("min", -1, 2)).toBe(0);
    expect(fusedConfidence("noisy_or", 2, 2)).toBe(1);
  });
  it("exports all four fusion methods", () => {
    expect(FUSION_METHODS).toEqual(["noisy_or", "dempster_shafer", "min", "weighted"]);
  });
});

describe("canPromoteToConfirmedThreat (two-key rule)", () => {
  it("passes when both modalities clear default thresholds", () => {
    expect(canPromoteToConfirmedThreat(sample)).toBe(true);
  });
  it("fails when behavioral is below threshold", () => {
    expect(canPromoteToConfirmedThreat({ ...sample, conf_behavioral: 0.4 })).toBe(false);
  });
  it("fails when narrative is below threshold", () => {
    expect(canPromoteToConfirmedThreat({ ...sample, conf_narrative: 0.6 })).toBe(false);
  });
  it("respects custom thresholds", () => {
    expect(canPromoteToConfirmedThreat(sample, { narrative: 0.95, behavioral: 0.5 })).toBe(false);
  });
  it("matches DEFAULT_PROMOTION_THRESHOLDS spec values", () => {
    expect(DEFAULT_PROMOTION_THRESHOLDS).toEqual({ narrative: 0.7, behavioral: 0.5 });
  });
});

describe("toStixSighting", () => {
  it("preserves both confidences in the extension", () => {
    const s = toStixSighting(sample);
    const ext = s.extensions[CORROBORATED_FINDING_EXTENSION_URI];
    expect(ext.conf_narrative).toBe(0.91);
    expect(ext.conf_behavioral).toBe(0.74);
    expect(ext.fusion_method).toBe("noisy_or");
    expect(ext.fused_conf_at_export).toBeCloseTo(0.977, 2);
    expect(s.first_seen).toBe("2026-06-01T00:00:00Z");
    expect(s.observed_data_refs).toContain("x-flow-ref:flow#a42b");
  });
  it("falls back to ttp_name when ttp_ref is null", () => {
    expect(toStixSighting(sample).sighting_of_ref).toBe("x-ttp-name:T1071.001");
  });
  it("uses ttp_ref uuid when present", () => {
    const s = toStixSighting({ ...sample, ttp_ref: "00000000-0000-0000-0000-000000000001" });
    expect(s.sighting_of_ref).toBe("00000000-0000-0000-0000-000000000001");
  });
});
