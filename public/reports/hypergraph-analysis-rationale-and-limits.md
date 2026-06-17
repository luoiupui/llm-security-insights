# Hypergraph in ThreatGraph — Rationale, Necessity, Weaknesses, and the HG ↔ LLM ↔ KG Loop

**Status:** Analysis document (companion to `hypergraph-pathway-technical-report.md`)
**Scope:** Why we introduce a hypergraph layer on top of the STIX-2.1 triple store, where it actually helps, where it hurts, and how the hypergraph–LLM–KG loop is meant to iterate.
**Audience:** Reviewers of Chapters 3–5; engineers wiring Pathway C.

---

## 1. Background — what we already have

The deterministic Pathway B produces a **binary-relation knowledge graph** (`kg_entities` + `kg_relations` + `kg_causal_links`) aligned to STIX 2.1. Every fact is a triple `(s, p, o)` with a confidence and an evidence string.

Hypergraphs (`kg_hyperedges`, Phase H1–H7) sit **above** that triple store as an *atomic event/grouping index*. One hyperedge groups ≥2 entities under a single event, campaign, fusion-finding, or kill-chain, with one verbatim `source_passage` authorising the whole thing.

This document does not re-explain the pipeline — see `hypergraph-pathway-technical-report.md`. It analyses **why the hypergraph is worth the cost and where it stops being worth it.**

---

## 2. Strength and Rationale — why hypergraph at all

### 2.1 Information-theoretic argument
A real CTI event is rarely binary. "On 2024-03-12, APT29 used CVE-2024-1709 against ConnectWise ScreenConnect to deploy CloudKeeper, exfiltrating to IP X via TLS on port 443." That single sentence has **≥6 participants and 1 timestamp**. Encoding it as triples requires:

- ~7–10 binary edges (`actor→malware`, `actor→cve`, `malware→target`, `actor→target`, `target→port`, …)
- a synthetic *event node* if you want to keep them joined, OR
- *reification* (each edge becomes a node with its own metadata edges)

Both fragmentations leak the **joint claim**: downstream you can no longer ask *"what did the source actually say in one breath?"* without re-joining N rows by an artificial event id. A hyperedge stores the n-ary claim **as one row**, with **one provenance quote**.

### 2.2 Provenance fidelity (§3d "Faithful Provenance")
Triples force per-edge evidence; a 7-edge event then duplicates the same source sentence 7 times, or stores `evidence=null` and loses traceability. Hyperedges enforce **exactly one** `source_passage` per atomic claim. This is the single largest reason we accepted the added complexity: it makes Chapter 5's explainability claims **demonstrable in one SQL row**.

### 2.3 Joint confidence vs averaged triple confidence
Triple confidence is per-edge. Averaging them to score an "event" is statistically wrong (independence is false — they came from the same sentence). The hyperedge carries a **joint** confidence, scored once by the LLM against the whole quote. This matches how analysts actually rate reports.

### 2.4 Native carriers for things triples model poorly
- **Kill chains** — ordered sequences. As triples this needs `next_step` self-referential edges + ordering metadata. As a `kill-chain` hyperedge with `node_ids: [t1, t2, …, tn]` it is one row.
- **Campaigns** — long-running groupings. Triples need a campaign node and N `part_of` edges. A `campaign` hyperedge is one row whose `qualifiers` carry the date range.
- **Fusion findings** — narrative ∩ behavioural corroboration. The point of the finding *is* the n-ary intersection; triples cannot express it without a synthetic finding node.

### 2.5 Necessity (where it is not optional)
The hypergraph is **load-bearing** for three deliverables; without it those features are either impossible or visibly fake:

1. **Chapter 5 explainability** — "show me the sentence that justifies this entire event" is a one-row lookup on `kg_hyperedges`. With triples-only, the UI has to re-stitch evidence from N rows.
2. **Pathway C n-ary extraction benchmark** — the whole comparison vs Pathway B in `PathwayComparisonPanel` rests on having a substrate that *can* hold n-ary output. Otherwise C degrades to "B with re-encoding loss".
3. **KG-Bench Category 8 (selective-redaction simulation, `§9`)** — masks operate on event boundaries, not on individual triples. The event boundary *is* the hyperedge.

For everything else (single-actor attribution, simple IOC matching, RAG retrieval), hypergraphs are a **convenience**, not a requirement.

---

## 3. Weaknesses and Potential Inaccuracies

This is the section reviewers should weight most heavily. Hypergraphs are not free.

### 3.1 Extraction-time failure modes (LLM → HG)
| Failure | Cause | Observable symptom |
|---|---|---|
| **Over-grouping** | LLM lumps two adjacent sentences into one hyperedge to look "richer" | Hyperedge `source_passage` spans an unrelated clause; `node_ids` contains an entity that was actually in a sibling sentence |
| **Under-grouping** | LLM emits a 2-node hyperedge that is really just a triple | `kg_hyperedges` row that degenerates to `(a, rel, b)`; we guard this with `validateHyperedge` rejecting `<2` nodes but a degenerate **=2** with no qualifier is hard to distinguish from a triple |
| **Phantom participants** | Coreference resolution invents a participant ("the attacker", "they") and binds it to a wrong canonical entity | Inflated `node_ids` length; `kb-validate` passes because the entity exists, but the binding is wrong |
| **Quote drift** | `source_passage` is paraphrased, not verbatim | Provenance claim is false; impossible to detect without character-level re-anchoring against the source doc |
| **Joint-confidence inflation** | LLMs systematically over-rate joint confidence on long quotes | Scores cluster near 0.85–0.95; calibration curve is flatter than per-triple confidence |

These are **inaccuracies the triple pipeline does not have** (or has in milder form), because the triple pipeline asks the LLM smaller questions.

### 3.2 Schema-level weaknesses
- **Identity of an event is ill-defined.** Two reports describing the same intrusion produce two hyperedges. Deduplication needs an event-resolution step we have **not** implemented (only entity resolution exists). Conservative reading: every hyperedge today is "as-reported", not "as-occurred".
- **Qualifiers are a free-form bag.** `HyperedgeQualifiers` is `[k: string]: unknown`. This is necessary for n-ary expressivity but means **two extractions of the same event may carry incompatible qualifier keys** (`cve` vs `vulnerability_id` vs `cve_id`). Downstream queries silently miss rows.
- **No SHACL/shape constraints per hyperedge type.** A `kill-chain` hyperedge should have ordered `node_ids` and tactic-tagged qualifiers; we enforce neither. A malformed kill-chain looks identical to a well-formed campaign at the storage layer.
- **Mixing abstractions.** `event`, `campaign`, `fusion-finding`, `kill-chain` are at different granularities (instantaneous vs spanning vs derived vs structural). Querying "all hyperedges touching entity X" returns a mixed bag analysts then have to re-segment.

### 3.3 Reasoning-time weaknesses
- **Conflict rules are triple-shaped.** `hyperedge-rules.ts` exists but the bulk of conflict logic (`multimodal-rules`, causal contradiction) still fires on triples. A contradiction that lives only at the n-ary level (e.g. two campaigns claiming the same intrusion with different actors) is currently **not detected**.
- **Causality across hyperedges is not first-class.** `kg_causal_links` connects entity nodes, not hyperedges. "Event A enabled Event B" must be down-projected to an entity-to-entity link, losing the n-ary context.
- **Credibility score** is computed over triples + violations. Hyperedge confidence is **read** but not yet **fed back** into the credibility formula. So a low-confidence hyperedge with high-confidence constituent triples scores too high.

### 3.4 Where hypergraphs are *the wrong tool*
Be honest about cases where adding a hyperedge **degrades** quality:

1. **Single binary fact extraction.** "CVE-2024-1709 affects ScreenConnect." Forcing this through the hyperedge path adds latency and an unnecessary degenerate row.
2. **Coarse IOC pivoting.** SOC analysts asking "what reports mention 1.2.3.4" want triples / inverted index hits, not n-ary events.
3. **Streaming high-volume telemetry.** Hyperedge extraction is an LLM call per event; flow telemetry is millions of rows. Use `cti-flow-features` schema directly.
4. **Domains where the source language is already n-ary structured** (e.g. STIX bundles in JSON). Re-extracting hyperedges via LLM throws away the structure that was already there. Map directly instead.
5. **Cross-lingual extraction without a per-language quote anchor** (KG-Bench Cat 7 JA/ZH). Quote-drift risk (§3.1) compounds because verbatim provenance is harder to verify across scripts.

### 3.5 Domain-transfer caveats (Clinical)
The Clinical track inherits all the above plus:
- Clinical events are dense in **negation and uncertainty** ("ruled out", "consistent with", "possible"). A hyperedge's joint confidence collapses these modalities into one scalar.
- Clinical ontology codes (ICD-10, RxCUI) are stricter than STIX; a hyperedge that mis-binds one participant invalidates the whole event for any code-based downstream check. The blast radius per error is bigger than in CTI.

---

## 4. The Approach — how the project actually uses the hypergraph

Three rules govern every hyperedge in the codebase. They are designed to **contain** the weaknesses in §3.

**R1 — Triples remain the storage and scoring substrate.** Hyperedges are an *index* over triples, not a replacement. Every hyperedge's claim must also be derivable from the triple store (possibly with information loss). KG-Bench scoring still runs on triples.

**R2 — Provenance is mandatory and verbatim.** `validateHyperedge` rejects empty `source_passage`. The intent is that an evaluator can grep the source doc for that string. Quote-drift is the single failure mode we cannot tolerate, because it would silently undermine Chapter 5.

**R3 — ≥2 node members; n-ary or nothing.** Degenerate 1-node hyperedges are rejected. Degenerate 2-node hyperedges are allowed but discouraged in prompts (we tell the LLM "if it is a binary fact, emit a triple").

The runtime path is:

```
threat-preprocess → threat-rag → threat-extract-hyper ──► kg_hyperedges
                                       │
                                       └──► kg_relations  (down-projected triples,
                                                            same source_passage,
                                                            for triple-based scoring)
```

Down-projection is **lossy by design** — it is the price of keeping triple-based scoring valid. The hyperedge row is the truth; the triple rows are the queryable shadow.

---

## 5. The Hypergraph ↔ LLM ↔ KG Loop — gradual iteration

The loop is intentionally **not** a single forward pass. Each turn tightens one of the weaknesses in §3.

```text
                  ┌────────────────────────────────────────────┐
                  │                                            │
                  ▼                                            │
   ┌─────────┐   prompt + RAG    ┌─────────┐   hyperedges   ┌──┴──────┐
   │   KG    │ ────────────────► │   LLM   │ ─────────────► │   HG    │
   │(triples)│                   │ (Gemini)│                │ store   │
   └─────────┘ ◄──── down-proj ──┴─────────┘ ◄──── conflicts┴─────────┘
        ▲                                                       │
        │                                                       │
        └────────── credibility / conflict feedback ◄───────────┘
```

### Iteration ladder (where we are, what's next)

| Round | What the loop does | Status in repo |
|---|---|---|
| **0. Cold start** | LLM extracts triples only; KG seeded; no hyperedges. | Pathway B baseline (shipped). |
| **1. Naïve lift** | Re-prompt the LLM on the same passage asking for n-ary events; store hyperedges; down-project to triples. | Pathway C MVP — `threat-extract-hyper` (shipped, Phase H2–H4). |
| **2. RAG-grounded lift** | RAG context now includes nearby hyperedges, not only triples. LLM produces hyperedges that are *consistent* with prior events. | Partially shipped — `threat-rag` returns subgraph; hyperedge-aware retrieval is the next increment. |
| **3. Conflict-driven repair** | `threat-conflicts` runs hyperedge-level rules; conflicting hyperedges are sent **back** to the LLM with the contradiction quoted, and the LLM repairs or rejects. | Rules exist (`hyperedge-rules.ts`); the repair loop is not yet wired — currently a single-shot conflict report. |
| **4. Joint-confidence calibration** | Compare LLM-stated joint confidence against KG-Bench Cat 1/6 ground truth; learn a per-type calibration curve; feed back into `credibility_score`. | Not started. The calibration tables would live in `src/lib/kg-bench/scorers.ts`. |
| **5. Event resolution** | Cluster hyperedges across reports into "same real-world event"; LLM adjudicates ambiguous merges. Eliminates the as-reported vs as-occurred gap (§3.2). | Not started. This is the most expensive future work. |
| **6. Cross-modal binding** | Bind hyperedges to flow telemetry / heart-sound features via shared participants. The hyperedge becomes the join key between narrative and signal. | Schemas exist (`cti-flow-features`, `heart-sound-features`); binding is manual. |

Rounds 0–2 are real. Rounds 3–6 are the honest answer to the question *"is the loop actually a loop?"* — **partially.** Today the feedback edge from KG back to LLM exists at the **conflict-report** level (the agent loop in Pathway A reads conflicts and decides what to do); it does **not** yet exist as an automatic repair-rewrite cycle for the deterministic Pathway B+C. Closing rounds 3–4 is the highest-leverage next step.

---

## 6. Bottom line

- **Use the hypergraph** when the unit of analysis is an *event*, *campaign*, *kill-chain*, or *fusion-finding* — i.e., when faithful joint provenance and n-ary membership are what the downstream consumer (analyst, thesis chapter, KG-Bench Cat 8) actually needs.
- **Stay with triples** for binary facts, IOC pivoting, high-volume telemetry, and pre-structured n-ary inputs.
- **Treat current hyperedges as "as-reported", not "as-occurred"** until event resolution (round 5) lands.
- **Audit the five extraction failure modes in §3.1 on every benchmark run.** They are the only inaccuracies introduced by the hypergraph layer that the triple pipeline does not already have.
- **Close round 3 of the loop next.** A one-shot conflict report is a weaker artefact than a repair-rewrite cycle; the latter is what makes the HG↔LLM↔KG diagram honest.

---

*Companion documents:* `hypergraph-pathway-technical-report.md`, `comprehensive-technical-report.md`, `experiments-academic-report.md`.
