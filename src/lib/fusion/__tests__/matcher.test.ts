import { describe, it, expect } from "vitest";
import { matchCorroborations } from "../matcher";
import { EXTERNAL_TTP_CLAIMS } from "../external-ttp-fixtures";
import { SAMPLE_FLOWS } from "@/lib/test-corpus/flow-samples";

const ASOF = new Date("2026-04-13T00:00:00Z");

describe("Phase 4 — CorroboratedFinding matcher", () => {
  it("produces at least one finding per matching MITRE id across CICIDS samples", () => {
    const out = matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, { asOf: ASOF });
    const techniques = new Set(out.map((f) => f.technique_id));
    expect(techniques.has("T1071.001")).toBe(true); // APT29 beaconing flow
    expect(techniques.has("T1048.003")).toBe(true); // DNS exfil flow
    expect(techniques.has("T1046")).toBe(true);     // Port scan flow
  });

  it("never persists fused_conf into conf_narrative or conf_behavioral", () => {
    const out = matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, { asOf: ASOF });
    for (const f of out) {
      expect(f.conf_narrative).toBeLessThanOrEqual(f.conf_narrative_raw + 1e-9);
      expect(f.conf_behavioral).toBeGreaterThan(0);
      expect(f.fused_conf).not.toBe(f.conf_narrative);
      expect(f.fused_conf).not.toBe(f.conf_behavioral);
    }
  });

  it("R11 clamp fires when reliability < 0.4", () => {
    const lowRel = [{
      ...EXTERNAL_TTP_CLAIMS[0],
      id: "ext-low-rel",
      reliability: 0.2,
      conf_narrative: 0.95,
      published_at: ASOF.toISOString(),
    }];
    const out = matchCorroborations(lowRel, SAMPLE_FLOWS, { asOf: ASOF, min_fused: 0 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].unverified_external).toBe(true);
    // After clamp (0.6) and no decay (age=0), narrative cannot exceed 0.6.
    expect(out[0].conf_narrative).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it("R12 decay shrinks narrative confidence for stale claims", () => {
    const stale = EXTERNAL_TTP_CLAIMS.find((c) => c.id === "ext-stale-t1090")!;
    // Stale claim has no matching flow → 0 findings; assert via direct freshness math.
    const ageDays = (ASOF.getTime() - new Date(stale.published_at).getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThan(180);
    // Fabricate a matching flow to observe decay.
    const fakeFlow = {
      ...SAMPLE_FLOWS[2],
      findings: [{ code_system: "MITRE", code: "T1090", display: "Proxy", confidence: 0.8 }],
    };
    const out = matchCorroborations([stale], [fakeFlow], { asOf: ASOF, min_fused: 0 });
    expect(out[0].freshness_factor).toBeLessThan(0.4); // ~255d, halflife 90d
    expect(out[0].conf_narrative).toBeLessThan(stale.conf_narrative * 0.5);
  });

  it("filters by min_fused threshold", () => {
    const high = matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, { asOf: ASOF, min_fused: 0.9 });
    const low  = matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, { asOf: ASOF, min_fused: 0 });
    expect(high.length).toBeLessThanOrEqual(low.length);
  });

  it("is deterministic: identical input → identical output", () => {
    const a = matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, { asOf: ASOF, run_id: "r" });
    const b = matchCorroborations(EXTERNAL_TTP_CLAIMS, SAMPLE_FLOWS, { asOf: ASOF, run_id: "r" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
