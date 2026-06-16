import { describe, it, expect } from "vitest";
import {
  decomposeToTriples,
  reassembleFromTriples,
  validateHyperedge,
  nodeSetsEqual,
  HyperedgeValidationError,
  type Hyperedge,
} from "../hypergraph";

// SolarWinds sample mirroring ctiOntology.sampleText. One atomic intrusion
// event that a triple-only KG would shatter into 6+ fragments.
const solarWinds: Hyperedge = {
  id: "he-solarwinds-2020",
  type: "event",
  node_ids: ["APT-29", "SUNBURST", "SolarWinds Orion", "CVE-2020-10148", "avsvmcloud[.]com"],
  source_passage:
    "In December 2020, FireEye discovered that SolarWinds Orion software updates had been trojanized by APT-29 (Cozy Bear). The SUNBURST backdoor exploited CVE-2020-10148 and communicated via avsvmcloud[.]com.",
  confidence: 0.92,
  qualifiers: {
    occurred_at: "2020-12-01",
    mitre_technique: "T1059.001",
    discovered_by: "FireEye",
  },
};

describe("hypergraph foundations (Phase H1)", () => {
  it("validates a well-formed hyperedge", () => {
    expect(() => validateHyperedge(solarWinds)).not.toThrow();
  });

  it("rejects hyperedges with <2 nodes (use kg_entities for unary)", () => {
    expect(() =>
      validateHyperedge({ ...solarWinds, node_ids: ["APT-29"] }),
    ).toThrow(HyperedgeValidationError);
  });

  it("rejects duplicate node_ids", () => {
    expect(() =>
      validateHyperedge({ ...solarWinds, node_ids: ["APT-29", "APT-29"] }),
    ).toThrow(HyperedgeValidationError);
  });

  it("rejects missing provenance (note §3d: provenance is mandatory)", () => {
    expect(() =>
      validateHyperedge({ ...solarWinds, source_passage: "   " }),
    ).toThrow(HyperedgeValidationError);
  });

  it("rejects confidence outside [0,1]", () => {
    expect(() => validateHyperedge({ ...solarWinds, confidence: 1.5 })).toThrow();
    expect(() => validateHyperedge({ ...solarWinds, confidence: -0.1 })).toThrow();
  });

  it("decomposes into N-1 relational triples plus K qualifier triples", () => {
    const triples = decomposeToTriples(solarWinds);
    // 5 nodes → 4 related-to triples, 3 qualifiers → 3 has_* triples
    expect(triples.length).toBe(4 + 3);
    // every triple tagged with hyperedge provenance
    expect(triples.every((t) => t.evidence === `hyperedge:${solarWinds.id}`)).toBe(true);
    // every triple inherits joint confidence
    expect(triples.every((t) => t.confidence === solarWinds.confidence)).toBe(true);
  });

  it("round-trips: hyperedge → triples → hyperedge preserves node set & qualifiers", () => {
    const triples = decomposeToTriples(solarWinds);
    const restored = reassembleFromTriples(triples, {
      id: solarWinds.id,
      type: solarWinds.type,
      source_passage: solarWinds.source_passage,
    });
    expect(nodeSetsEqual(restored.node_ids, solarWinds.node_ids)).toBe(true);
    expect(restored.qualifiers.occurred_at).toBe("2020-12-01");
    expect(restored.qualifiers.mitre_technique).toBe("T1059.001");
    expect(restored.qualifiers.discovered_by).toBe("FireEye");
    expect(restored.confidence).toBe(solarWinds.confidence);
  });

  it("reassemble ignores untagged triples (mixed substrate is safe)", () => {
    const mixed = [
      ...decomposeToTriples(solarWinds),
      { source: "X", relation: "uses", target: "Y", confidence: 0.5 }, // untagged
    ];
    const restored = reassembleFromTriples(mixed, {
      id: solarWinds.id,
      type: "event",
      source_passage: solarWinds.source_passage,
    });
    expect(restored.node_ids.includes("X")).toBe(false);
    expect(restored.node_ids.includes("Y")).toBe(false);
  });

  it("reassemble throws when no triples carry the hyperedge tag", () => {
    expect(() =>
      reassembleFromTriples([], {
        id: "he-missing",
        type: "event",
        source_passage: "irrelevant",
      }),
    ).toThrow(HyperedgeValidationError);
  });

  it("joint confidence is the min across member triples (conservative)", () => {
    const triples = decomposeToTriples(solarWinds);
    triples[2].confidence = 0.4; // weakest member drags joint claim down
    const restored = reassembleFromTriples(triples, {
      id: solarWinds.id,
      type: solarWinds.type,
      source_passage: solarWinds.source_passage,
    });
    expect(restored.confidence).toBe(0.4);
  });
});
