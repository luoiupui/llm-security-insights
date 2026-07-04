import { describe, it, expect } from "vitest";
import { runTemporalRules } from "../temporal-rules";
import { runKillChainRules, inferPhase } from "../killchain-rules";

describe("temporal rules", () => {
  it("R9 flags cause after effect", () => {
    const v = runTemporalRules([], [], [
      {
        cause: "phish",
        effect: "wiper",
        type: "leads_to",
        cause_observed_at: "2025-02-01",
        effect_observed_at: "2025-01-01",
      } as never,
    ]);
    expect(v.some((x) => x.rule_id === "R9_timestamp_order")).toBe(true);
  });
  it("R10 flags a drift window of >180d", () => {
    const v = runTemporalRules([], [], [
      {
        cause: "recon",
        effect: "impact",
        type: "leads_to",
        cause_observed_at: "2024-01-01",
        effect_observed_at: "2025-06-01",
      } as never,
    ]);
    expect(v.some((x) => x.rule_id === "R10_drift_window")).toBe(true);
  });
});

describe("kill-chain rules", () => {
  it("infers common phases", () => {
    expect(inferPhase("phishing email")).toBe("initial_access");
    expect(inferPhase("ransomware encryption")).toBe("impact");
  });
  it("R13 detects a multi-stage jumper", () => {
    const v = runKillChainRules([], [
      { cause: "phishing email", effect: "ransomware encryption", type: "leads_to" } as never,
    ]);
    expect(v.some((x) => x.rule_id === "R13_stage_jumper")).toBe(true);
  });
  it("R14 detects a causal cycle", () => {
    const v = runKillChainRules([], [
      { cause: "a", effect: "b", type: "enables" } as never,
      { cause: "b", effect: "c", type: "leads_to" } as never,
      { cause: "c", effect: "a", type: "triggers" } as never,
    ]);
    expect(v.some((x) => x.rule_id === "R14_cyclic_causality")).toBe(true);
  });
});
