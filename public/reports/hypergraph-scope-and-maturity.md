# Hypergraph Application Scope, KG-SOTA Comparison, and Maturity Evaluation

**Status:** Companion to `hypergraph-analysis-rationale-and-limits.md` and `hypergraph-pathway-technical-report.md`.
**Purpose:** Since the extraction weaknesses (§4 of the rationale doc) cannot be solved at once, this document delimits **where the hypergraph approach should and should not be used in ThreatGraph today**, compares it against KG‑only SOTA systems in the real market, and proposes a **quantitative maturity rubric** for KG‑only vs Hypergraph‑only vs Hybrid (HG+KG) systems.

---

## 1. Application Scope of the Hypergraph in ThreatGraph

The hypergraph is a *grouping/provenance overlay* on top of the STIX‑2.1 triple store. It is **not** a replacement KG and not a general reasoning substrate. The scope below reflects what the current Pathway C actually supports (Phases H1–H7) — not aspirational use.

### 1.1 Where the hypergraph SHOULD be used (green-zone)

| # | Use case | Why hypergraph fits | Module today |
|---|----------|--------------------|--------------|
| 1 | **Atomic CTI events** ("on date D, actor A used CVE C against target T with malware M, exfil to IP I") | ≥3 participants in one sentence; one provenance quote authorises the whole claim | `threat-extract-hyper` → `event` hyperedges |
| 2 | **Kill chains** (ordered TTP sequences from a single report) | Ordered n-ary membership; triples would need synthetic `next_step` edges | `kill-chain` hyperedges |
| 3 | **Campaigns** (long-running actor groupings with date range) | One row vs N `part_of` triples; date range as qualifier | `campaign` hyperedges |
| 4 | **Multi-modal fusion findings** (narrative ∩ flow-feature corroboration) | The *intersection itself* is the claim; triples can only express it via synthetic finding nodes | `fusion-finding` hyperedges + `src/lib/fusion/` |
| 5 | **A/B benchmark records** that must keep `(participants, joint-confidence, source quote)` immutable for later review | Append-only, one row per claim, one quote | `kg_pathway_runs` + KG-Bench |
| 6 | **Explainability surfaces in the dashboard** ("show me the one sentence that justifies this 6-actor event") | Single SQL row → single quote, no N-way join | `HypergraphPathwayPanel`, `MultiModalFusionMock` |

### 1.2 Where the hypergraph CAN be used cautiously (yellow-zone)

| # | Use case | Caveat |
|---|----------|--------|
| 7 | **Clinical episode grouping** (encounter = patient + dx + rx + procedure + outcome) | Ontology codes (ICD-10/RxCUI/SNOMED) have higher blast radius per extraction error; needs SHACL shapes before production |
| 8 | **Cross-source event resolution** (same real-world event reported by 2+ sources) | Round 5 of the loop is not implemented; today each report yields its own hyperedge — useful as "as-reported" record, misleading if read as "as-occurred" |
| 9 | **Causal chain summarisation** (collapse a temporal triple chain into one hyperedge) | Works only when the source sentence itself states the chain; otherwise the hyperedge fabricates joint provenance |

### 1.3 Where the hypergraph SHOULD NOT be used (red-zone)

| # | Anti-use case | Why triples (or no graph at all) win |
|---|--------------|--------------------------------------|
| A | **Pure binary lookups** (`malware → family`, `cve → cvss`, `actor → country`) | Triples are denser, indexable, and standard STIX. Hyperedges add overhead with zero joint-provenance benefit. |
| B | **High-frequency telemetry / flow counters** | Cardinality blows up; hyperedges are not designed for streaming aggregation — use the `flow_features` table. |
| C | **Cross-document statistical claims** ("60% of APT29 reports mention CVE-2024-1709") | The claim is not in any single source quote, so the core provenance invariant fails. Compute over triples instead. |
| D | **Inferred / unwitnessed facts** (closure of transitive `uses`) | A hyperedge with a fabricated `source_passage` is worse than a triple flagged `derived=true`. |
| E | **Real PHI/PII** | Open-writes posture + verbatim `source_passage` would persist raw PHI in `kg_hyperedges`. Clinical demo runs MUST stay on synthetic corpora. |
| F | **Long narrative paragraphs (>~3 sentences)** | Joint-confidence inflation + over-grouping become dominant failure modes (rationale doc §4.1, §4.4). Pre-segment first. |

### 1.4 Scope rule of thumb
> **Use a hyperedge iff a single source sentence makes an n-ary claim about ≥3 entities AND you need to preserve that joint claim verbatim for downstream review.** Otherwise use triples.

---

## 2. Comparison vs KG-Only SOTA in the Real Market

### 2.1 Reference systems (KG-only, production-grade)

| System | Domain | Graph model | Maturity signal |
|--------|--------|------------|-----------------|
| **MITRE ATT&CK + STIX 2.1 / TAXII** | CTI | Binary triples + reified relationships | De-facto industry standard; consumed by every major SIEM |
| **OpenCTI** | CTI platform | STIX 2.1 triples in Elasticsearch + Redis | Production deployments at CERTs, banks |
| **MISP** | Threat sharing | Attribute/object triples | 6000+ communities |
| **Microsoft Security Copilot Graph / Sentinel** | SOC | Property graph over telemetry | GA, enterprise |
| **Palantir Foundry Ontology** | Multi-domain | Object/link/action (ternary at most) | Enterprise GA |
| **UMLS / SNOMED CT graph** | Clinical | RDF triples + concept hierarchies | Regulated, decades old |
| **Wikidata / Google KG / Diffbot** | General | Triples with qualifiers | Web-scale |

### 2.2 Where KG-only wins in the market today

- **Interoperability.** STIX 2.1, RDF, OWL, SHACL, SPARQL, Cypher — every tool speaks triples. Hyperedges have no shared wire format.
- **Tooling depth.** Triplestores (GraphDB, Stardog, Neptune), property-graph DBs (Neo4j, Memgraph), validators (SHACL), reasoners (HermiT, ELK) are mature.
- **Query ergonomics.** SPARQL/Cypher are taught, hireable, and benchmarked. There is no "SPARQL for hypergraphs" with comparable adoption.
- **Streaming & scale.** Triples index trivially; hyperedges with variable arity do not.
- **Regulatory acceptance.** Clinical (HL7 FHIR, SNOMED), finance (FIBO), gov (NIEM) all standardise on triples / RDF.

### 2.3 Where KG-only is structurally weak (and where HG helps)

- N-ary events squashed to fragmented triples → loss of joint provenance.
- Reification (RDF*, named graphs) is technically possible but operationally painful and rarely round-tripped by tools.
- Joint confidence over a multi-actor event is not natively expressible.
- Explainability ("show the one quote") requires N-way joins.

### 2.4 Market verdict
- **>95 % of deployed graph systems are KG-only.** That is the safe, hireable, regulator-friendly path.
- **Hypergraphs appear** mostly in research (LLM-KG benchmarks, biomedical event extraction, hyper-relational KGE like HINGE / StarE) and in narrow product features (Palantir's link "actions", MITRE ATT&CK's "campaigns" object).
- **Hybrid HG+KG is essentially pre-commercial.** ThreatGraph sits in this frontier — high research value, low immediate market substitutability.

### 2.5 Suitable application fields for each model

| Field | Best fit | Reason |
|-------|----------|--------|
| SOC / SIEM enrichment, IOC sharing | **KG-only (STIX)** | Interop, streaming, regulator expectation |
| Threat *campaign analysis*, incident post-mortems, fusion analytics | **Hybrid (KG + HG overlay)** | N-ary events + audit-grade provenance |
| Clinical decision support, EHR interop | **KG-only (FHIR/SNOMED)** | Regulation, standards, blast radius |
| Clinical *research event extraction* (trials, adverse events) | **Hybrid (KG + HG)** | One sentence → multi-participant event |
| Web-scale general knowledge | **KG-only (triples + qualifiers)** | Scale, querying |
| Scientific / biomedical event KG | **Hybrid** | n-ary reactions are natively hyperedges |
| Pure analytics / ML features | **Neither — tabular** | Graphs add no value |

---

## 3. Quantitative Maturity Evaluation

### 3.1 Rubric (7 dimensions × 0–5)

Each dimension is scored 0 (absent) to 5 (mature/standardised/regulator-accepted). Scores are observational, not aspirational; ThreatGraph is rated on what currently runs in the repo.

| Dimension | What it measures |
|-----------|-----------------|
| **D1. Standards & interop** | Shared schema, wire format, validators |
| **D2. Query & reasoning tooling** | Query language, reasoners, indexes |
| **D3. Scalability** | Ingest rate, storage, query latency at >10⁸ facts |
| **D4. Provenance & explainability** | Per-claim source, audit trail, joint quotes |
| **D5. n-ary / event fidelity** | Native support for multi-participant claims |
| **D6. Validation & error blast-radius control** | SHACL/ontology checks, repair cycles |
| **D7. Ecosystem & hireability** | Talent pool, vendors, training material |

### 3.2 Scores

| Dimension | KG-only SOTA (STIX/RDF) | Hypergraph-only (research) | Hybrid HG+KG (ThreatGraph today) |
|-----------|-------------------------|----------------------------|----------------------------------|
| D1 Standards & interop | **5** | 1 | 3 (KG side STIX-compliant; HG side bespoke) |
| D2 Query & reasoning tooling | **5** | 1 | 3 (SQL + custom HG queries; no SPARQL for HG) |
| D3 Scalability | **5** | 1 | 3 (triples scale; HG row-per-event ok up to ~10⁶) |
| D4 Provenance & explainability | 2 | 4 | **5** (one row → one quote) |
| D5 n-ary / event fidelity | 1 | 5 | **5** |
| D6 Validation & error blast-radius | **4** (SHACL, OWL) | 1 | 2 (rules exist, automatic repair cycle not wired — rationale doc Round 3) |
| D7 Ecosystem & hireability | **5** | 1 | 2 |
| **Total (/35)** | **27** | 14 | **23** |
| **Maturity %** | **77 %** | 40 % | **66 %** |

### 3.3 Reading the scores

- **KG-only (77 %)** — the production default. Loses points only on provenance and n-ary fidelity, which is exactly the gap the HG overlay targets.
- **Hypergraph-only (40 %)** — high on the two gap dimensions, low on everything that makes a system shippable. Not recommended as a standalone substrate.
- **Hybrid HG+KG (66 %)** — ThreatGraph's posture. Already maxes D4–D5, but pays a real cost on standards, tooling, scalability, and especially **D6 (validation & repair)** because the LLM→HG→KG repair cycle is not yet automatic.

### 3.4 Where the next gains come from (raises ThreatGraph from 66 → 75 %+)

1. **Close Round 3 of the loop (D6: 2 → 4)** — wire `threat-conflicts` rules to auto-revise hyperedges, not just flag them.
2. **Publish an HG wire format (D1: 3 → 4)** — JSON Schema (already drafted in `public/schemas/cti-hyperedges.v1.schema.json`) + SHACL-equivalent validator.
3. **HG query helper library (D2: 3 → 4)** — typed accessors so downstream code never re-implements n-ary joins.
4. **Event resolution / dedup (D5 stays 5, D6 → 4)** — cluster hyperedges into real-world events (Round 5).

### 3.5 What this maturity score is NOT
- Not a prediction of research value — ThreatGraph's *research* contribution sits exactly on D4–D5 where KG-only scores 1–2.
- Not a buy/build recommendation for production SOCs — for those, KG-only (OpenCTI/MISP) remains the correct answer today.
- Not static — D6 and D1 are the cheapest dimensions to lift next.

---

## 4. Summary

- **Use the hypergraph** for atomic events, kill chains, campaigns, fusion findings, and explainability surfaces.
- **Do not use it** for binary lookups, telemetry counters, cross-document aggregates, inferred closures, or real PHI.
- **Versus KG-only SOTA**, the hypergraph trades interop/tooling/scale for joint provenance and n-ary fidelity. KG-only owns the market; hybrid systems own the research frontier.
- **Maturity today:** KG-only **77 %**, Hypergraph-only **40 %**, Hybrid HG+KG (ThreatGraph) **66 %**. The cheapest path to 75 % is closing the conflict-driven repair cycle and publishing an HG validator.

---

## 5. Techniques That Could Lift ThreatGraph Above 66 %

Two filters apply to every item below:
- **Not yet used in this project** (no module in `src/lib/` or `supabase/functions/` implements it).
- **Under-developed in the research field** — either pre-standard, no canonical reference implementation, or no agreed benchmark — so adopting them is a research contribution, not just integration work.

Each entry lists the **dimension(s) it lifts** (D1–D7 from §3.1), the **mechanism**, and the **honest risk** of pulling it in.

### 5.1 Hyper-relational KG embeddings (HINGE / StarE / GRAN / QBLP)
- **Lifts:** D2 (query/reasoning), D5 (n-ary fidelity).
- **Mechanism:** Learn embeddings over `(head, relation, tail, {qualifier_k: qualifier_v})` tuples — the data shape `kg_hyperedges` already stores. Enables similarity search, link prediction, and missing-participant completion *without* down-projecting to triples.
- **Field status:** Active research (2020–2025), no production library on par with PyKEEN-for-triples; reproducibility on hyper-relational benchmarks (JF17K, WikiPeople, WD50K) is uneven.
- **Risk:** Embedding drift across pipeline runs invalidates KG-Bench comparability — must freeze checkpoints per benchmark run.

### 5.2 Neural-symbolic conflict-repair loop (closes Round 3 of the HG↔LLM↔KG loop)
- **Lifts:** D6 (validation & blast radius) from 2 → 4.
- **Mechanism:** Today `threat-conflicts` *flags* violations. Wire an automatic cycle: violation → targeted LLM patch prompt (with the offending hyperedge + rule + minimal RAG context) → re-validate → commit or escalate. Bound by max-N rewrites per hyperedge.
- **Field status:** Neuro-symbolic repair is a research theme (DeepProbLog, Logical Neural Networks, IBM's NSQA) but no off-the-shelf "graph-repair agent" exists for hyperedges.
- **Risk:** Non-termination, prompt-cost blow-up — needs hard step caps and ablation against the no-repair baseline.

### 5.3 SHACL-for-hyperedges (HyperSHACL / shape constraints over n-ary facts)
- **Lifts:** D1 (standards) 3 → 4, D6 (validation) 2 → 4.
- **Mechanism:** Define shape constraints that talk about participant *roles and cardinalities* inside a hyperedge (`event` MUST have ≥1 actor and ≥1 target; `kill-chain` participants MUST be ordered TTPs). Today the JSON Schema (`public/schemas/cti-hyperedges.v1.schema.json`) only validates structure, not semantic role-cardinality.
- **Field status:** W3C SHACL is mature for triples; there is no community-blessed shape language for n-ary/hyperedge graphs.
- **Risk:** Building a bespoke validator is a maintenance liability — keep it small and tie shapes to test cases in `src/lib/ontology/__tests__/`.

### 5.4 Event resolution & coreference across hyperedges (Round 5 of the loop)
- **Lifts:** D5 (event fidelity, "as-reported" → "as-occurred"), D6.
- **Mechanism:** Cluster hyperedges from different reports that describe the *same real-world event* — embedding similarity + participant overlap + time-window + actor consistency. Output: a `world_event_id` linking N hyperedges, with conflict surface where they disagree.
- **Field status:** Cross-document event coreference is open research (ACE, MUC, ECB+ benchmarks for *triples*; almost no work at the hyperedge level).
- **Risk:** False merges destroy provenance — merge must be *non-destructive* (membership pointer, never edit the source hyperedge).

### 5.5 Calibrated joint-confidence (instead of LLM-self-reported scores)
- **Lifts:** D4 (provenance/explainability) 5 → maintained credibly, D6.
- **Mechanism:** Replace the model's free-form `joint_confidence` with a **calibration head** — fit isotonic regression / Platt scaling on a held-out gold set, so a "0.8" actually means 80 % precision on similar hyperedges. Add ECE / Brier reporting to KG-Bench.
- **Field status:** LLM calibration is hot research (2023–2025) but rarely applied to graph extraction outputs.
- **Risk:** Needs a stable gold set; recalibrate whenever the backbone model changes.

### 5.6 Contrastive / counterfactual extraction (anti-hallucination on n-ary)
- **Lifts:** D6, D5.
- **Mechanism:** For each candidate hyperedge, also generate a counterfactual ("what would this sentence look like if entity X were NOT a participant?") and keep the edge only if the LLM-judge prefers the original. Catches phantom participants (rationale doc §4.2).
- **Field status:** Counterfactual data augmentation is established in NLI/QA; not standard for KG extraction.
- **Risk:** 2× token cost — gate behind a toggle in `experiment-config.ts`.

### 5.7 Property-graph + RDF* dual export
- **Lifts:** D1 (interop) 3 → 5, D7 (ecosystem) 2 → 3.
- **Mechanism:** Add exporters: hyperedges → RDF* (reified statements with qualifier triples) AND → labeled-property-graph (Neo4j/Memgraph) with hyperedge-as-node + participant edges carrying roles. Lets downstream tools use SPARQL or Cypher.
- **Field status:** RDF* is W3C draft (RDF 1.2); LPG↔RDF mapping is debated (no single canonical lossless mapping for n-ary).
- **Risk:** Lossy round-trip — must publish a fidelity matrix alongside the exporter.

### 5.8 Streaming / incremental hyperedge maintenance
- **Lifts:** D3 (scalability) 3 → 4.
- **Mechanism:** Today the pipeline re-extracts per report. Add an incremental ingestion mode: new report → diff against existing hyperedges (same actor + overlapping participants + recent time) → attach as additional `source_passage` instead of duplicating.
- **Field status:** Streaming KG construction exists for triples (Kafka + RDF); streaming for *hyperedges* is essentially unstudied.
- **Risk:** Append-only invariant currently relied on by `kg_pathway_runs` — incremental updates must use a separate "consolidated" view, never mutate raw runs.

### 5.9 Differentially-private hyperedge release
- **Lifts:** Adjacent to D4; opens regulated-domain applicability (clinical).
- **Mechanism:** When releasing hyperedge counts / embeddings for cross-site federation (Privacy & FL Lab), add ε-DP noise calibrated to *hyperedge sensitivity* (which is higher than triple sensitivity because one row touches N participants).
- **Field status:** DP for triples / GNNs has growing literature; DP for n-ary hyperedges has almost none — sensitivity bounds are an open question.
- **Risk:** Mis-calibrated noise either destroys utility or under-protects — must publish the sensitivity proof.

### 5.10 Multilingual code-grounded extraction with translation-invariant validation
- **Lifts:** D6 (validation), helps KG-Bench Cat 7 (multilingual).
- **Mechanism:** Extract in the source language (JA, ZH already in KG-Bench corpus) but validate that the *code* fields (CVE, ICD-10, RxCUI, MITRE technique IDs) are language-invariant — same hyperedge from JA and EN versions of the same advisory must agree on the codes, even if `qualifiers` text differs.
- **Field status:** Multilingual KG benchmarks exist but rarely test *cross-lingual consistency* of the same fact.
- **Risk:** Requires parallel-language gold cases; cheap to add to `src/lib/kg-bench/corpus.ts` but needs human annotation budget.

### 5.11 GraphRAG over hyperedges (n-ary-aware retrieval)
- **Lifts:** D2, D5, and quality of the extraction loop itself.
- **Mechanism:** Current `threat-rag` retrieves triples + text passages. Add hyperedge-level retrieval: given a new report, fetch the K most-similar *hyperedges* (not just nearest entities) and feed them as structured context. Helps the LLM reuse participant patterns instead of re-inventing them.
- **Field status:** GraphRAG (Microsoft, 2024) is triple/community-based; n-ary GraphRAG is unexplored.
- **Risk:** Retrieval bias — model may anchor too hard on past hyperedges and miss novel structures. Mitigate with a "novelty floor" toggle.

### 5.12 Provenance-preserving compression (lossy → lossless tiers)
- **Lifts:** D3 (scalability), D4 (provenance).
- **Mechanism:** Tier 1 keeps full `source_passage`; tier 2 keeps hash + offset into archived source; tier 3 keeps participant tuple only. Configurable per dataset, with an audit guarantee that tier-1 is reconstructible.
- **Field status:** Standard in log/event systems, almost absent in KG literature where provenance is usually all-or-nothing.
- **Risk:** Operator error could promote a tier-3 export to "audit-ready" — needs a posture badge similar to the EXPERIMENT badge already in `DashboardLayout`.

### 5.13 Summary — projected lift

| Technique | Primary dimensions lifted | Estimated maturity gain |
|-----------|---------------------------|-------------------------|
| 5.2 Neural-symbolic repair loop | D6 +2 | **+5–6 pp** (highest ROI) |
| 5.3 HyperSHACL | D1 +1, D6 +2 | +5 pp |
| 5.4 Event resolution | D5 sustained, D6 +1 | +3–4 pp |
| 5.7 RDF*/LPG dual export | D1 +2, D7 +1 | +4 pp |
| 5.1 Hyper-relational embeddings | D2 +1, D5 sustained | +2–3 pp |
| 5.5 Calibrated confidence | D4 credibility, D6 +1 | +2 pp |
| 5.11 n-ary GraphRAG | D2 +1, indirectly D5/D6 | +2 pp |
| 5.6 / 5.8 / 5.9 / 5.10 / 5.12 | mixed | +1–2 pp each |

A realistic medium-term ceiling, by combining 5.2 + 5.3 + 5.4 + 5.7, lifts ThreatGraph from **66 % → ~80 %** — at which point KG-only SOTA and Hybrid HG+KG become substitutes rather than alternatives, with the hybrid winning on D4/D5.

### 5.14 What is intentionally NOT on this list
- Full OWL reasoning over hyperedges — not under-developed, it is *known infeasible* at scale.
- LLM fine-tuning on the corpus — possible but orthogonal to the hybrid claim, and would compromise reproducibility against the public `google/gemini-3-flash-preview` baseline.
- Replacing the triple store with a hypergraph DB (HyperGraphDB, etc.) — would drop D1/D7 faster than it lifts D5.
