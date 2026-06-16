# Hypergraph Augmentation — Feasibility & Plan

## TL;DR
**Don't replace, augment.** A full swap from STIX 2.1 triples → hypergraph breaks the entire downstream stack (KG-Bench scorers, conflict rules R1–R13, MITRE/CVE grounding, persistence schema, UI graph view, edge functions). Instead, introduce a **hyperedge layer that sits *above* the existing triple store** as the atomic "event" unit, while triples remain the lookup / scoring substrate. This preserves all current validation evidence (the 2.1% false-entity result from §10.2) and adds native event-centric explainability on top.

## Feasibility Verdict per Subsystem

| Subsystem | Replace? | Augment? | Why |
|---|---|---|---|
| `threat-extract` 8-step CoT | No | **Yes** — add Step 4.5 "hyperedge grouping" | Schema is already nested JSON; add `hyperedges[]` field alongside `entities/relations/causal_links` |
| STIX 2.1 ontology (`cti.ts`) | No | Keep | External interop (MISP, OpenCTI consumers) assumes triples |
| `kb-validate` (MITRE/CVE grounding) | No | Unchanged | Per-entity check, hyperedge-agnostic |
| `threat-conflicts` R1–R13 | No | **Add R14** (hyperedge-level conflict) | Existing rules stay; add joint-validity rule on hyperedges |
| `kg_corroborated_findings` table | No | **Add `kg_hyperedges` table** | New table referencing existing entity IDs via array |
| KG-Bench scorers | No | **Add Cat 10: Hyperedge Atomicity** | Score whether decomposed triples reassemble into the gold hyperedge |
| `MultiModalFusionMock` / Attribution UI | Partial | Add "Event View" toggle | Render hyperedges as bordered cards grouping their triples |
| `threat-agent` tools | No | Add `hyperedge_lookup` tool | Single-call provenance retrieval |

## Phased Plan

### Phase H1 — Foundations (no behavior change)
- Add `src/lib/ontology/hypergraph.ts`: `Hyperedge { id, type: 'event'|'campaign'|'fusion-finding'|'kill-chain', node_ids: string[], qualifiers: Record<string,unknown>, evidence_span, confidence, source_passage }`
- JSON schema at `public/schemas/cti-hyperedges.v1.schema.json`
- Pure functions: `decomposeToTriples(h)`, `reassembleFromTriples(triples)` for backward compat
- Unit tests covering the SolarWinds sample (1 hyperedge → 7 triples → round-trip)

### Phase H2 — Extractor opt-in
- Extend `GRAPH_NATIVE_COT_PROMPT` with **Step 4.5: Hyperedge Grouping** — "before emitting causal links, group co-evidenced triples that describe one atomic event into a hyperedge; attach the verbatim source quote"
- Output schema gains optional `hyperedges[]`; absence = backward compatible
- Feature flag `VITE_HYPERGRAPH_ENABLED` defaults off; on → UI shows event cards

### Phase H3 — Conflict rule R14 (joint validity)
- `src/lib/conflicts/hyperedge-rules.ts`: a hyperedge is rejected if ≥2 of its member triples individually conflict (date/actor/jurisdiction). Stronger than current per-triple R-rules — exactly the "Brittleness of Distribution" point in the note (§4).
- 6 unit tests on existing CTI corpus

### Phase H4 — Persistence
- Migration: `kg_hyperedges (id, kg_id, type, node_ids uuid[], qualifiers jsonb, source_passage text, confidence numeric, created_at)` + GRANTs + RLS
- No FK to entities (array of IDs) to keep migration cheap; integrity enforced in app layer
- `kg-query` edge function gains `?include=hyperedges` param

### Phase H5 — KG-Bench Category 10 (the validation)
This is the **innovation evidence step** mirroring §10.2:
- Gold set: 10 CTI hyperedges (SolarWinds, NotPetya, FIN7-Carbanak, etc.)
- Score 3 variants on same Gemini-3-flash backbone:
  - **Triples-only** (current pipeline)
  - **Triples + post-hoc grouping** (LLM-as-judge re-clusters)
  - **Native hyperedge extraction** (Step 4.5 enabled)
- Metrics: hyperedge precision/recall, provenance-trace cost (# DB lookups), human explanation time
- Hypothesis under test: native hyperedge mode reduces multi-hop explanation traversal from N triples to 1, and lowers joint-error rate vs. post-hoc grouping

### Phase H6 — UI surfacing (minimal)
- Attribution page: "Event View" toggle (default off). When on, group conflicts/findings into hyperedge cards with source quote at top.
- No new page, no graph re-layout (HGNN visualization is explicitly out of scope — note §5.2)

## Honest Risks (mirroring note §5)
1. **Extraction reliability** — Gemini may produce malformed hyperedges; mitigated by JSON-schema-constrained decoding + decompose/reassemble round-trip test as a gate.
2. **Larger-blast-radius errors** — one bad hyperedge = N bad triples. Mitigated by R14 (reject jointly-inconsistent hyperedges) and confidence floor.
3. **Tooling immaturity** — we deliberately keep triples as the storage primitive; hypergraph is an *index* over them. No Neo4j swap, no HGNN.
4. **Scope creep** — phases gated by KG-Bench Cat 10 results; if Phase H5 doesn't show measurable explanation-cost reduction, we ship H1–H3 only and document the negative result.

## Out of Scope
- Replacing STIX 2.1
- Hypergraph neural networks (HGNN)
- New graph database (Hyper-DB, RDF-star)
- Clinical-domain hyperedges (deferred to a follow-up)

## Deliverable Order
H1 → H2 → H3 → (gate: tests green) → H4 → H5 → H6. Each phase is independently shippable and reversible by the feature flag.

---
Proceed with **Phase H1** (foundations + tests, zero behavior change)?
