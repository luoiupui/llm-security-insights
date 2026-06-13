import { describe, it, expect } from "vitest";
import { applyR11, applyR12, applyR13 } from "../multimodal-rules";

describe("R11 unverified_external", () => {
  it("no-ops when no external CTI entities", () => {
    const r = applyR11([{ name: "flow-1", type: "flow_pattern", confidence: 0.9 }], []);
    expect(r.status).toBe("pass");
  });
  it("passes when external entity is corroborated by internal flow", () => {
    const r = applyR11(
      [
        { name: "SUNBURST", type: "malware", confidence: 0.92, source_modality: "external_cti" },
      ],
      [{ source: "flow-1", relation: "corroborates", target: "SUNBURST", confidence: 0.7 }],
    );
    expect(r.status).toBe("pass");
  });
  it("warns + clamps when external-only above threshold", () => {
    const r = applyR11(
      [
        { name: "SUNBURST", type: "malware", confidence: 0.92, source_modality: "external_cti", conf_narrative: 0.92 },
      ],
      [],
    );
    expect(r.status).toBe("warn");
    expect(r.flag).toBe("requires_internal_corroboration");
    expect(r.dual_confidence?.[0].fused_after).toBe(0.6);
  });
  it("ignores external entities below threshold", () => {
    const r = applyR11(
      [{ name: "weak", type: "indicator", confidence: 0.5, source_modality: "external_cti" }],
      [],
    );
    expect(r.status).toBe("pass");
  });
});

describe("R12 weak_match_stale_ioc", () => {
  const now = new Date("2026-06-13T00:00:00Z");
  it("no-ops when no matches_ioc edges", () => {
    const r = applyR12([{ source: "a", relation: "uses", target: "b", confidence: 0.9 }], { now });
    expect(r.status).toBe("pass");
  });
  it("passes fresh IP match (5 days)", () => {
    const observed = new Date(now.getTime() - 5 * 86400000).toISOString();
    const r = applyR12(
      [{ source: "flow", relation: "matches_ioc", target: "ip", confidence: 0.88, observed_at: observed, indicator_type: "ip" }],
      { now },
    );
    expect(r.status).toBe("pass");
  });
  it("warns on stale IP match (95 days, half-life 30)", () => {
    const observed = new Date(now.getTime() - 95 * 86400000).toISOString();
    const r = applyR12(
      [{ source: "flow", relation: "matches_ioc", target: "ip", confidence: 0.88, observed_at: observed, indicator_type: "ip" }],
      { now },
    );
    expect(r.status).toBe("warn");
    expect(r.flag).toBe("stale_match");
    const fr = r.dual_confidence?.[0].freshness ?? 1;
    expect(fr).toBeGreaterThan(0.05);
    expect(fr).toBeLessThan(0.2);
  });
  it("zeroes confidence past hard cutoff", () => {
    const observed = new Date(now.getTime() - 400 * 86400000).toISOString();
    const r = applyR12(
      [{ source: "flow", relation: "matches_ioc", target: "ip", confidence: 0.9, observed_at: observed, indicator_type: "ip" }],
      { now },
    );
    expect(r.status).toBe("warn");
    expect(r.dual_confidence?.[0].fused_after).toBe(0);
    expect(r.dual_confidence?.[0].freshness).toBe(0);
  });
});

describe("R13 cross_modal_disagreement", () => {
  it("no-ops without dual-modality evidence", () => {
    const r = applyR13([{ name: "x", type: "ttp", confidence: 0.7 }]);
    expect(r.status).toBe("pass");
  });
  it("passes when modalities agree", () => {
    const r = applyR13([{ name: "T1071", type: "ttp", confidence: 0.85, conf_narrative: 0.9, conf_behavioral: 0.8 }]);
    expect(r.status).toBe("pass");
  });
  it("fails when narrative high, behavioral low", () => {
    const r = applyR13([{ name: "T1071.001", type: "ttp", confidence: 0.6, conf_narrative: 0.91, conf_behavioral: 0.18 }]);
    expect(r.status).toBe("fail");
    expect(r.flag).toBe("modality_conflict");
    expect(r.dual_confidence?.[0].external).toBe(0.91);
    expect(r.dual_confidence?.[0].internal).toBe(0.18);
  });
  it("fails when behavioral high, narrative low (inverse)", () => {
    const r = applyR13([{ name: "beacon", type: "flow_pattern", confidence: 0.5, conf_narrative: 0.1, conf_behavioral: 0.9 }]);
    expect(r.status).toBe("fail");
  });
});
