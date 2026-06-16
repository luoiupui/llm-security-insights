import { describe, it, expect } from "vitest";
import type { Hyperedge } from "@/lib/ontology/hypergraph";
import { applyR14, applyR15, applyR16, runHyperedgeRules } from "@/lib/conflicts/hyperedge-rules";

const baseHE = (over: Partial<Hyperedge>): Hyperedge => ({
  id: "he_x",
  type: "event",
  node_ids: ["APT29", "SUNBURST"],
  source_passage: "APT29 deployed SUNBURST in March 2020.",
  confidence: 0.9,
  qualifiers: {},
  ...over,
});

describe("R14 — joint validity (cross-hyperedge axis conflict)", () => {
  it("passes when no two hyperedges share a node with disagreeing axes", () => {
    const hs: Hyperedge[] = [
      baseHE({ id: "h1", node_ids: ["APT29", "SUNBURST"], qualifiers: { occurred_at: "2020-03" } }),
      baseHE({ id: "h2", node_ids: ["APT28", "X-Agent"], qualifiers: { occurred_at: "2019-07" } }),
    ];
    expect(applyR14(hs).status).toBe("pass");
  });

  it("fails when same actor appears in two hyperedges with different occurred_at", () => {
    const hs: Hyperedge[] = [
      baseHE({ id: "h1", node_ids: ["APT29", "SUNBURST"], qualifiers: { occurred_at: "2020-03" } }),
      baseHE({ id: "h2", node_ids: ["APT29", "WellMess"], qualifiers: { occurred_at: "2021-07" } }),
    ];
    const r = applyR14(hs);
    expect(r.status).toBe("fail");
    expect(r.affected_items).toContain("h1");
    expect(r.affected_items).toContain("h2");
    expect(r.detail).toMatch(/occurred_at/);
  });

  it("ignores axes that are absent on one side", () => {
    const hs: Hyperedge[] = [
      baseHE({ id: "h1", node_ids: ["APT29", "SUNBURST"], qualifiers: { occurred_at: "2020-03" } }),
      baseHE({ id: "h2", node_ids: ["APT29", "WellMess"], qualifiers: {} }),
    ];
    expect(applyR14(hs).status).toBe("pass");
  });

  it("detects jurisdiction conflicts", () => {
    const hs: Hyperedge[] = [
      baseHE({ id: "h1", node_ids: ["APT29", "Treasury"], qualifiers: { jurisdiction: "US" } }),
      baseHE({ id: "h2", node_ids: ["APT29", "FCO"], qualifiers: { jurisdiction: "UK" } }),
    ];
    expect(applyR14(hs).status).toBe("fail");
  });
});

describe("R15 — intra-hyperedge qualifier consistency", () => {
  it("passes for scalar qualifiers", () => {
    const hs = [baseHE({ qualifiers: { occurred_at: "2020-03", mitre_technique: "T1195.002" } })];
    expect(applyR15(hs).status).toBe("pass");
  });

  it("fails when an array-valued qualifier has >1 distinct entry", () => {
    const hs = [baseHE({ id: "h_bad", qualifiers: { occurred_at: ["2020-03", "2019-07"] as unknown as string } })];
    const r = applyR15(hs);
    expect(r.status).toBe("fail");
    expect(r.affected_items).toContain("h_bad");
  });

  it("ignores array qualifiers whose entries are all equal", () => {
    const hs = [baseHE({ qualifiers: { mitre_technique: ["T1195.002", "T1195.002"] } })];
    expect(applyR15(hs).status).toBe("pass");
  });
});

describe("R16 — provenance overlap", () => {
  it("passes when every participant appears in source_passage", () => {
    const hs = [
      baseHE({
        node_ids: ["APT29", "SUNBURST", "SolarWinds Orion"],
        source_passage: "APT29 deployed the SUNBURST backdoor via SolarWinds Orion in March 2020.",
      }),
    ];
    expect(applyR16(hs).status).toBe("pass");
  });

  it("warns when one participant of three is missing from the passage", () => {
    const hs = [
      baseHE({
        id: "h_warn",
        node_ids: ["APT29", "SUNBURST", "GhostEntity"],
        source_passage: "APT29 deployed SUNBURST in March 2020.",
      }),
    ];
    const r = applyR16(hs);
    expect(r.status).toBe("warn");
    expect(r.affected_items).toContain("h_warn");
  });

  it("escalates to fail when ≥50% of participants are missing", () => {
    const hs = [
      baseHE({
        id: "h_fail",
        node_ids: ["GhostA", "GhostB", "APT29"],
        source_passage: "APT29 was observed.",
      }),
    ];
    expect(applyR16(hs).status).toBe("fail");
  });

  it("respects inferred_participants whitelist", () => {
    const hs = [
      baseHE({
        node_ids: ["APT29", "SUNBURST", "GhostEntity"],
        source_passage: "APT29 deployed SUNBURST in March 2020.",
        qualifiers: { inferred_participants: ["GhostEntity"] },
      }),
    ];
    expect(applyR16(hs).status).toBe("pass");
  });

  it("matches across surface-form variants (US Treasury vs U.S. Treasury)", () => {
    const hs = [
      baseHE({
        node_ids: ["APT29", "US Treasury"],
        source_passage: "APT29 compromised the U.S. Treasury network.",
      }),
    ];
    expect(applyR16(hs).status).toBe("pass");
  });
});

describe("runHyperedgeRules — aggregate", () => {
  it("collects rejected ids from R14/R15 only, not R16 warnings", () => {
    const hs: Hyperedge[] = [
      baseHE({ id: "h1", node_ids: ["APT29", "SUNBURST"], qualifiers: { occurred_at: "2020-03" } }),
      baseHE({ id: "h2", node_ids: ["APT29", "WellMess"], qualifiers: { occurred_at: "2021-07" } }),
      baseHE({
        id: "h3", node_ids: ["APT28", "X-Agent", "GhostX"],
        source_passage: "APT28 used X-Agent against the target.",
      }),
    ];
    const out = runHyperedgeRules(hs);
    expect(out.summary.total_rules).toBe(3);
    expect(out.rejected_hyperedge_ids).toContain("h1");
    expect(out.rejected_hyperedge_ids).toContain("h2");
    expect(out.rejected_hyperedge_ids).not.toContain("h3"); // R16 warn ≠ rejection
  });
});
