/**
 * Hypergraph layer (Phase H1 — Foundations).
 *
 * Sits ABOVE the existing STIX-2.1 triple store as an atomic event/grouping
 * index. Triples remain the storage + scoring substrate; hyperedges add
 * native event-centric explainability (one event = one hyperedge = one
 * provenance quote), per `note-na-ni-hypergraph.md` §2 and §3(d).
 *
 * This module is pure data + pure functions only. No DB, no LLM, no UI.
 * Behavior wiring lands in Phases H2–H6.
 *
 * Spec: .lovable/plan.md → "Phase H1 — Foundations"
 */

export type HyperedgeType =
  | "event"          // discrete occurrence: intrusion, exploit firing, acquisition
  | "campaign"       // long-running grouping of events under a single actor/objective
  | "fusion-finding" // narrative ∩ behavioral corroboration (links to kg_corroborated_findings)
  | "kill-chain";    // ordered ATT&CK tactic chain across multiple events

export interface HyperedgeQualifiers {
  /** ISO-8601 timestamp the hyperedge claims as primary event time. */
  occurred_at?: string;
  /** Free-form key/value attrs (jurisdiction, stake %, CVE id, MITRE technique…). */
  [k: string]: unknown;
}

export interface Hyperedge {
  id: string;
  type: HyperedgeType;
  /** Canonical names of member entities (matches kg_entities.canonical_name). */
  node_ids: string[];
  /** Verbatim source quote that authorises the entire hyperedge (§3d Faithful Provenance). */
  source_passage: string;
  /** Optional richer span coordinates `{doc_id, start, end}`. */
  evidence_span?: { doc_id?: string; start: number; end: number };
  /** Joint confidence in the atomic claim, [0,1]. NOT the avg of triple confidences. */
  confidence: number;
  /** Structured qualifiers (date, jurisdiction, etc.) that would otherwise be triples. */
  qualifiers: HyperedgeQualifiers;
}

/** Minimal triple shape compatible with kg_relations rows. */
export interface Triple {
  source: string;
  relation: string;
  target: string;
  confidence: number;
  evidence?: string;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

export class HyperedgeValidationError extends Error {}

export function validateHyperedge(h: Hyperedge): void {
  if (!h.id) throw new HyperedgeValidationError("hyperedge.id required");
  if (!h.type) throw new HyperedgeValidationError("hyperedge.type required");
  if (!Array.isArray(h.node_ids) || h.node_ids.length < 2) {
    // A hyperedge with <2 nodes degenerates to a label on a single entity —
    // use kg_entities for that. The whole point of the substrate is n-ary.
    throw new HyperedgeValidationError(
      `hyperedge ${h.id} must reference >=2 nodes, got ${h.node_ids?.length ?? 0}`,
    );
  }
  if (new Set(h.node_ids).size !== h.node_ids.length) {
    throw new HyperedgeValidationError(`hyperedge ${h.id} has duplicate node_ids`);
  }
  if (h.confidence < 0 || h.confidence > 1) {
    throw new HyperedgeValidationError(
      `hyperedge ${h.id} confidence out of [0,1]: ${h.confidence}`,
    );
  }
  if (!h.source_passage || !h.source_passage.trim()) {
    throw new HyperedgeValidationError(
      `hyperedge ${h.id} requires non-empty source_passage (provenance is mandatory)`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Decompose: Hyperedge → Triples                                              */
/* -------------------------------------------------------------------------- */

/**
 * Decompose a hyperedge into the equivalent set of binary triples so
 * existing R1–R13 conflict rules, KG-Bench scorers, and the kg_relations
 * table continue to work unchanged.
 *
 * Strategy:
 *   - First node is treated as the "subject" anchor.
 *   - Every other node gets a `related-to:<hyperedge.type>` edge from the anchor.
 *   - Every scalar qualifier becomes `(anchor, has_<key>, <value>)`.
 *
 * This is deliberately a lossy projection — the hyperedge id is preserved on
 * each emitted triple's `evidence` field so reassembleFromTriples() can
 * round-trip. Lossiness is the cost of staying compatible with the existing
 * triple-only consumers; the hyperedge itself remains the source of truth.
 */
export function decomposeToTriples(h: Hyperedge): Triple[] {
  validateHyperedge(h);
  const [anchor, ...rest] = h.node_ids;
  const triples: Triple[] = [];
  const evidenceTag = `hyperedge:${h.id}`;

  for (const node of rest) {
    triples.push({
      source: anchor,
      relation: `related-to:${h.type}`,
      target: node,
      confidence: h.confidence,
      evidence: evidenceTag,
    });
  }

  for (const [key, value] of Object.entries(h.qualifiers ?? {})) {
    if (value === undefined || value === null) continue;
    triples.push({
      source: anchor,
      relation: `has_${key}`,
      target: String(value),
      confidence: h.confidence,
      evidence: evidenceTag,
    });
  }

  return triples;
}

/* -------------------------------------------------------------------------- */
/* Reassemble: Triples → Hyperedge                                             */
/* -------------------------------------------------------------------------- */

/**
 * Group triples carrying the same `evidence: "hyperedge:<id>"` tag back
 * into a Hyperedge. The inverse of decomposeToTriples() — used in the
 * round-trip test gate (Phase H5) and the `hyperedge_lookup` agent tool.
 *
 * Triples without the tag are ignored.
 */
export function reassembleFromTriples(
  triples: Triple[],
  meta: { id: string; type: HyperedgeType; source_passage: string },
): Hyperedge {
  const tag = `hyperedge:${meta.id}`;
  const members = triples.filter((t) => t.evidence === tag);
  if (members.length === 0) {
    throw new HyperedgeValidationError(`no triples tagged ${tag}`);
  }

  const nodeSet = new Set<string>();
  const qualifiers: HyperedgeQualifiers = {};
  let confidence = members[0].confidence;

  for (const t of members) {
    if (t.relation.startsWith("related-to:")) {
      nodeSet.add(t.source);
      nodeSet.add(t.target);
    } else if (t.relation.startsWith("has_")) {
      nodeSet.add(t.source);
      qualifiers[t.relation.slice(4)] = t.target;
    }
    // joint confidence = min across members (conservative)
    confidence = Math.min(confidence, t.confidence);
  }

  const h: Hyperedge = {
    id: meta.id,
    type: meta.type,
    node_ids: Array.from(nodeSet),
    source_passage: meta.source_passage,
    confidence,
    qualifiers,
  };
  validateHyperedge(h);
  return h;
}

/* -------------------------------------------------------------------------- */
/* Set equality helper for round-trip assertions                               */
/* -------------------------------------------------------------------------- */

export function nodeSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}
