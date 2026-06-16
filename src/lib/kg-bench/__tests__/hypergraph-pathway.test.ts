import { describe, expect, it } from "vitest";
import {
  atomicityF1,
  bestCoverage,
  explanationCost,
  clusterTriplesAsHyperedges,
} from "../runner";

describe("PH5 — hypergraph pathway scoring", () => {
  const gold = [{ node_ids: ["APT-29", "SUNBURST", "SolarFlare", "GovCloud", "EU-West"] }];

  it("atomicityF1: perfect coverage = 1", () => {
    expect(atomicityF1(gold, gold)).toBe(1);
  });

  it("atomicityF1: subset gives Jaccard < 1", () => {
    const pred = [{ node_ids: ["APT-29", "SUNBURST"] }];
    const f = atomicityF1(gold, pred);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(0.5);
  });

  it("atomicityF1: empty prediction = 0", () => {
    expect(atomicityF1(gold, [])).toBe(0);
  });

  it("bestCoverage: counts overlap with normalization", () => {
    const pred = [{ node_ids: ["apt29", "sunburst"] }];
    expect(bestCoverage(gold, pred)).toBe(2);
  });

  it("explanationCost: single covering edge = 1 lookup (Pathway C win)", () => {
    const answer = ["APT-29", "SUNBURST", "SolarFlare"];
    const edges = [{ node_ids: ["APT-29", "SUNBURST", "SolarFlare", "GovCloud"] }];
    expect(explanationCost(answer, edges, 0)).toBe(1);
  });

  it("explanationCost: no edges → pairs fallback bounded by triple count", () => {
    const answer = ["A", "B", "C"]; // C(3,2) = 3 pairs
    expect(explanationCost(answer, [], 10)).toBe(3);
    expect(explanationCost(answer, [], 2)).toBe(2);
  });

  it("explanationCost: requires set-cover ≥ 2 when no single edge covers all", () => {
    const answer = ["A", "B", "C"];
    const edges = [{ node_ids: ["A", "B"] }, { node_ids: ["C", "D"] }];
    expect(explanationCost(answer, edges, 0)).toBe(2);
  });

  it("clusterTriplesAsHyperedges: groups by subject", () => {
    const clusters = clusterTriplesAsHyperedges([
      { s: "FIN7", p: "uses", o: "Carbanak" },
      { s: "FIN7", p: "targets", o: "US retail" },
      { s: "APT-29", p: "deploys", o: "SUNBURST" },
    ]);
    expect(clusters).toHaveLength(2);
    const fin7 = clusters.find(c => c.node_ids.includes("FIN7"))!;
    expect(fin7.node_ids).toContain("Carbanak");
    expect(fin7.node_ids).toContain("US retail");
  });
});
