# Rebuilding ThreatRAG on the Semantic Web Stack (RDF / RDFS / OWL / SHACL)

**Status:** Feasibility study and implementation plan — *document only, no code changes.*
**Scope:** CTI domain only (Clinical remains a simulation carve-out).
**Reference input:** "Ontology Made Practical: From RDF and OWL to Knowledge Graphs and GraphRAG" (D. Kim, Jul 2026).
**Related project docs:** `hypergraph-pathway-technical-report.md`, `hybrid-rule-governance-clarification.md`, `zero-shot-attestation.md`, `adaptive-layers-clarification.md`.

---

## 1. What the source article proposes

The article separates ontology work into six layers, each answering one question:

| Layer | Question | Article example |
|---|---|---|
| IRI / namespace | How do we name a thing uniquely? | `fin:VOO` |
| RDF | How do we state a fact? | `VOO tracksIndex S&P500Index` |
| RDFS | What are the classes and hierarchies? | `ETF rdfs:subClassOf Fund` |
| OWL 2 | What richer logic holds? | `managedBy owl:inverseOf manages`; disjointness; cardinality |
| SHACL | Does the data satisfy operational rules? | "every ETF has exactly one `managedBy`" |
| Turtle / JSON-LD | How is it serialized? | file formats |

Its central claims relevant to us: (a) the *ontology is the schema, the KG is the data*; (b) ontology constraints act as **guardrails against LLM hallucination** in GraphRAG; (c) build from **competency questions**, model only what the questions require; (d) OWL uses the **Open World Assumption (OWA)** — a missing value is not a false value — whereas SHACL provides **closed-world validation**.

---

## 2. Where ThreatGraph already sits relative to that stack

ThreatRAG today is a *typed property-graph* pipeline: `threat-preprocess → threat-rag → threat-extract (Graph-Native CoT) → kb-validate → threat-conflicts → threat-kg-query → persist`, with a hyperedge sibling pathway and Hybrid Rule Governance (expert R1–R13 + adaptive C1–C4).

| Semantic Web layer | Current ThreatGraph equivalent | Gap |
|---|---|---|
| IRI / namespace | `canonical_name` (lower-cased string) in `kg_entities` | No global IRIs; no cross-source identity merge guarantees |
| RDF triples | `kg_relations` (source, relation, target, confidence, evidence) | Triples exist, but not as RDF; no named graphs / quads |
| RDFS | `src/lib/ontology/cti.ts` entity + relation type lists | Flat lists — **no subclass hierarchy**, no domain/range |
| OWL 2 | none | No inverse, disjointness, cardinality, transitivity, no reasoner |
| SHACL | `kb-validate` + `threat-conflicts` rule kernel (R1–R13, C1–C4) | Equivalent *intent*, implemented as imperative TypeScript rather than declarative shapes |
| Serialization | JSON payloads, JSON-Schema for hyperedges | No Turtle / JSON-LD export |

**Reading:** roughly 55–60 % of the stack's *function* is already present, but almost 0 % of its *standards conformance*. The largest genuine capability gaps are OWL reasoning (materialised inferences) and declarative, portable validation.

---

## 3. Feasibility verdict

**Feasible — with a strong caveat on the substitution framing.**

* **Additive (recommended): FEASIBLE, high value.** Layering RDF/RDFS/OWL/SHACL *over* the existing store — as an ontology of record plus an export/validation surface — is well-scoped. It does not touch the Graph-Native CoT innovation, preserves KG-Bench comparability, and directly strengthens the "guardrail against LLM hallucination" story the article makes.
* **Substitutive (replace the property graph with an RDF triplestore): FEASIBLE BUT NOT RECOMMENDED NOW.** It would require re-implementing confidence/provenance as reification or RDF-star, migrating all rules to SHACL/SPARQL, re-baselining every published metric, and re-running Gold-56. Cost is high; the measurable accuracy gain is unproven.

### Key technical frictions

1. **Confidence + provenance on every edge.** ThreatRAG's core asset is that triples already carry `confidence`, `evidence`, and `observed_at`. Plain RDF has no edge attributes. Requires **RDF-star / named-graph reification**, which multiplies triple count ~3–4× and complicates SPARQL.
2. **Hyperedges vs triples.** Pathway C's n-ary claims must be re-encoded as `rdf:Statement`-style event nodes (neo-Davidsonian reification) — this is exactly the "hindrance" already analysed for STIX in `hypergraph-scope-and-maturity.md`.
3. **OWA vs the conflict kernel.** Several existing rules are closed-world ("no attribution present ⇒ flag"). Under OWL these are *not* contradictions. Closed-world rules must stay in SHACL, not OWL — a clean split, but one that must be made explicitly per rule.
4. **Provenance-weighted credibility.** Neither OWL nor SHACL scores; they return conform/violate. The provenance-weighted credibility formula must remain a post-processing layer over SHACL reports.
5. **Runtime.** No mature reasoner or SHACL engine runs comfortably in a Deno edge function at low latency; realistic options are batch materialisation or an external service, which conflicts with the current 3.94 s single-pass latency budget.

### What genuinely improves

* Global IRIs give **deterministic cross-report entity identity** (today's `canonical_name` collision risk drops).
* RDFS/OWL hierarchies let one rule cover a class tree (`malware ⊑ software ⊑ stix:SDO`) instead of enumerated type strings.
* Disjointness axioms catch a whole class of LLM type-confusion errors (`threat_actor` vs `identity`, `indicator` vs `infrastructure`) that R1–R13 currently only partially cover.
* SHACL shapes are **portable and reviewable artefacts** — better for thesis defence than TypeScript predicates.
* Turtle / JSON-LD export makes the KG interoperable with STIX-to-RDF tooling and external triplestores.

---

## 4. Competency questions (the article's starting point, applied to CTI)

The plan is anchored on these; nothing gets modelled that no question needs.

1. Which threat actors used a given malware family within a given time window?
2. Which CVEs are exploited by campaigns attributed to actor X?
3. Which indicators corroborate a narrative claim with behavioural flow evidence?
4. What is the ATT&CK tactic chain of a given intrusion, in temporal order?
5. Which two reports make mutually contradictory attributions for the same event?
6. Which entities inherit a property purely by inference (never directly stated)?
7. Which triples in the KG violate a declared shape, and with what provenance?

Q6 and Q7 are the ones the current system **cannot** answer — they are the justification for this track.

---

## 5. Plan — "Pathway D: Semantic Layer" (documentation-only deliverables)

Proposed as a *fourth* pathway alongside B (deterministic), A (agent), C (hypergraph). Each phase below is a **document to be authored**; no code is written under this plan.

| Phase | Deliverable document | Contents |
|---|---|---|
| **D0** | *This report* | Feasibility verdict, gap table, competency questions |
| **D1** | `cti-ontology-competency-questions.md` | Full CQ catalogue with expected answer shapes and the concept/property set each one forces |
| **D2** | `cti-rdfs-owl-ontology-spec.md` | Namespace + IRI minting policy (`tg:` base), class hierarchy over the 12 CTI types, domain/range for all 14 relation types, OWL axioms (inverses, disjoint pairs, transitive `derived-from`, functional/cardinality constraints), alignment map to STIX 2.1 and MITRE ATT&CK IRIs |
| **D3** | `cti-shacl-shapes-spec.md` | Every expert rule R1–R13 and adaptive layer C1–C2 expressed as a SHACL node/property shape, with a per-rule "OWL vs SHACL vs imperative" classification and the reason each closed-world rule cannot move to OWL |
| **D4** | `rdf-provenance-and-confidence-encoding.md` | Three candidate encodings (RDF-star, named graphs, singleton properties) benchmarked on triple-count blow-up, SPARQL ergonomics, and hyperedge compatibility; a recommendation |
| **D5** | `pathway-d-architecture-and-migration.md` | Target architecture diagram (Mermaid) showing where the semantic layer attaches — after `kb-validate`, in parallel with `threat-conflicts`; an additive export path (`kg_relations → Turtle/JSON-LD`) plus an optional triplestore mirror; batch-vs-online reasoning trade-off; explicit statement that Pathway B remains the KG-Bench-scored backbone |
| **D6** | `pathway-d-evaluation-protocol.md` | How Pathway D would be scored *if implemented*: new KG-Bench Cat 12 (axiom-consistency) and Cat 13 (inference yield), reuse of Gold-56 with McNemar + Wilson CI, regression gate definition, and the statement that Gold-56 labels do not change |
| **D7** | `pathway-d-cost-and-risk-register.md` | Engineering cost estimate per phase, latency budget impact, the five frictions in §3 as tracked risks with mitigations, and a go / no-go decision rubric |

**Sequencing:** D1 → D2 → D3 in order (each depends on the previous); D4 can run in parallel with D3; D5 requires D2–D4; D6 and D7 close the set.

**Explicit non-goals of this plan:** no schema migration, no triplestore provisioning, no changes to `threat-extract`, no change to Gold-56 or GoldAug-CTI, no change to the zero-shot posture (a reasoner is symbolic inference, not model training — this must be stated in D5 so the zero-shot attestation stays valid).

---

## 6. Recommendation

Adopt the **additive** reading: treat RDFS/OWL as the *ontology of record* for CTI types and SHACL as the *declarative face* of the existing rule kernel, with Turtle/JSON-LD export as the interoperability deliverable. Defer any triplestore substitution until D6/D7 show a measurable F1 or consistency gain on Gold-56 that justifies re-baselining every published number.

Maturity impact, if D1–D7 were fully implemented: Hybrid HG+KG moves from ~66 % to an estimated ~72–75 %, driven almost entirely by standards conformance, inference yield, and validation portability rather than by extraction accuracy.
