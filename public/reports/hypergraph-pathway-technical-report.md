# Hypergraph Pathway (Pathway C) — Technical Report

**Scope:** CTI only (Pathway C does not run on clinical notes in this phase by design).
**Backbone LLM:** `google/gemini-3-flash-preview` via Lovable AI Gateway (same as Pathway B, for fair A/B).
**Status:** Living document. New sections appended per phase.

---

## 1. Motivation

Pathway B (current production) reasons in binary STIX 2.1 triples
`(Subject, Predicate, Object)`. This is well-supported by every downstream
consumer (R1–R13 conflict rules, KG-Bench scorers, `kg_relations`
persistence, MITRE/CVE grounding), and §10.2 of the comprehensive technical
report shows it cuts the false-relation rate from 14.2% (vanilla LLM) to
3.1% on the same Gemini-3-flash backbone.

However, the **decomposition** of an atomic event into N independent
triples loses two things the user's hypergraph note (§3) calls out:

1. **Faithful provenance.** A real event ("APT29 used SUNBURST to compromise
   SolarWinds Orion at the US Treasury in March 2020") is one passage in the
   source. Decomposed into pairwise triples, that one passage is duplicated
   across 5+ rows and the joint claim is gone.
2. **Joint validity.** A triple-level conflict rule can only see one edge at
   a time. It cannot say "this *event* is internally inconsistent because
   two of its member triples conflict on date" — only that two unrelated
   triples disagree.

Pathway C tests whether modelling the **atomic event** as a first-class
n-ary hyperedge — not as N derived triples — measurably reduces (a) the
provenance-trace cost of an attribution explanation, and (b) the joint
error rate that R14 (PH3) will catch.

Crucially, Pathway C does **not replace** Pathway B. It runs **in parallel**
on the same input, with shared Stages 1–2 (preprocess + RAG) and Stage 4
(per-entity KB validation). The pathways diverge at Stage 3 (extraction)
and Stage 5 (conflict rules), and re-converge at a comparison panel.

---

## 2. Pathway Map

```text
                   ┌─ Pathway B (current, triple-native) ─┐
Stage 1,2 ────────►│  Stage 3 : GRAPH_NATIVE_COT (triples) │──► Stage 4 ──► Stage 5 (R1–R13) ──► Stage 6 ─┐
(shared)           └──────────────────────────────────────┘                                              ├─► Comparison
                   ┌─ Pathway C (new, hyperedge-native) ──┐                                              │   Panel
                   │  Stage 3': HYPEREDGE_COT (hyperedges)│──► Stage 4 ──► Stage 5' (R14 joint) ──► Stage 6 ┘
                   └──────────────────────────────────────┘
```

Pathway selectable per run via `pathway: "B" | "C" | "both"`; default `"B"`.

---

## 3. Phase Status

| Phase | Scope | Status |
|---|---|---|
| **PH1** | `Hyperedge` type, JSON schema v1, decompose/reassemble, 10 unit tests | ✅ Shipped |
| **PH2** | Sibling `threat-extract-hyper` edge function + pipeline client + this report | ✅ Shipped (this commit) |
| PH3 | Hyperedge conflict rules R14–R16, dispatched by mode | ⏳ |
| PH4 | `kg_hyperedges` table + `kg_pathway_runs` A/B record | ⏳ |
| PH5 | KG-Bench Cat 10 (atomicity) + Cat 11 (explanation cost) | ⏳ |
| PH6 | `HypergraphPathwayPanel` + `PathwayComparisonPanel` | ⏳ |
| PH7 | Agent harness wiring (conditional on PH5 result) | ⏳ |

---

## 4. PH2 — Sibling Extractor (this commit)

### 4.1 What was built

| Artifact | Path | Role |
|---|---|---|
| Edge function | `supabase/functions/threat-extract-hyper/index.ts` | Stage 3' for Pathway C |
| Pipeline client | `src/lib/threat-pipeline.ts` → `extractHyperedges()` | Client-side invoker |
| Result type | `HyperedgeExtractionResult`, `HyperedgeRecord` | Strongly-typed envelope |
| This report | `public/reports/hypergraph-pathway-technical-report.md` | Living technical doc |

### 4.2 Design decisions (and why)

| Decision | Rationale |
|---|---|
| **Sibling function, not prompt patch** | Falsifiability. Pathway B's prompt (`GRAPH_NATIVE_COT_PROMPT`) is untouched — A/B comparison cannot be contaminated by edits to one side. |
| **Same backbone (`gemini-3-flash-preview`)** | Removes model as a confound in PH5 evaluation. Only the *prompt + output shape* differs. |
| **Same firewall semantics** | Pathway C must not be a bypass route. The full `serverScanPrompt` rule set is mirrored verbatim with `pathway: "C"` tag on every `monitoring_events` row. |
| **CTI only, hard rejection of `domain !== "cti"`** | Plan §"What changed" — clinical hyperedges are explicitly out of scope in PH2. The function returns HTTP 400 rather than silently routing. |
| **Derived triples computed server-side** | Downstream R1–R13 conflict rules and `kg_relations` persistence keep working without client changes. Strategy mirrors `decomposeToTriples()` in `src/lib/ontology/hypergraph.ts`. |
| **Joint confidence is `min`-like, not average** | Per the hypergraph note §3b: a hyperedge holds only as strongly as its weakest participant. Averaging would hide weak links. |
| **`source_passage` is mandatory, ≤ 240 chars** | Per the hypergraph note §3d (Faithful Provenance) — if no single span covers all participants, the LLM is instructed to *split* the hyperedge rather than weaken provenance. |
| **6-step CoT, not 8** | Steps 4 (Temporal) and 5 (Causal Fusion) from Pathway B become *qualifiers* on the hyperedge (`occurred_at`, `mitre_technique`) rather than separate subgraphs. The hyperedge already binds the participants atomically. |

### 4.3 Output envelope

```json
{
  "pathway": "C",
  "extraction_method": "hyperedge_native_cot",
  "domain": "cti",
  "extraction_ms": 1832,
  "repro": { "deterministic": true, "temperature": 0, "seed": 42 },
  "rag_used": true,
  "hypergraph": {
    "entities": [/* ThreatEntity[] — union of participants */],
    "hyperedges": [
      {
        "id": "he_001",
        "type": "event",
        "node_ids": ["APT29", "SUNBURST", "SolarWinds Orion", "US Treasury"],
        "source_passage": "In March 2020, APT29 deployed the SUNBURST backdoor via a trojanised SolarWinds Orion update at the US Treasury.",
        "confidence": 0.91,
        "qualifiers": { "occurred_at": "2020-03", "mitre_technique": "T1195.002" }
      }
    ],
    "subgraphs": [/* optional groupings */],
    "graph_warnings": [/* provenance / ontology / weak-confidence flags */],
    "graph_metadata": { "entity_count": 12, "hyperedge_count": 4, "avg_arity": 3.5 }
  },
  "derived": {
    "entities": [/* same as hypergraph.entities */],
    "relations": [/* derived binary triples, each tagged evidence: "hyperedge:<id>" */]
  }
}
```

The `derived.relations` block is the back-compat projection — every triple
carries `evidence: "hyperedge:<id>"` and `derived_from: "<id>"`, so
`reassembleFromTriples()` from PH1 can losslessly reconstruct the
hyperedge for round-trip tests.

### 4.4 Pipeline-contract conformance

PH2 honours `pipeline-stage-contracts` (`src/lib/threat-pipeline.ts` is
source of truth):

- **Input envelope identical to `threat-extract`**: `{ text, source_type, source_reliability, rag_context, temperature, seed, deterministic, domain }`. The only Pathway-C-specific behaviour is the hard `domain==="cti"` check.
- **`repro` echoed in output** for audit parity with Pathway B.
- **Retry policy identical**: 4 attempts, exponential backoff on 5xx, hard-fail on 429/402 so the gateway billing surface in `<connecting-to-ai-models>` works.

### 4.5 Known limitations (PH2)

1. **No persistence yet.** Hyperedges are returned to the caller and discarded. PH4 adds `kg_hyperedges` and `kg_pathway_runs`.
2. **No joint-validity rules yet.** A hyperedge with internally contradictory member claims (e.g. two `occurred_at` qualifiers a year apart) is currently passed through. PH3 adds R14.
3. **No UI surface yet.** Calling `extractHyperedges()` requires invoking the client function directly. PH6 adds `HypergraphPathwayPanel`.
4. **No scored A/B yet.** §10.2-style numbers comparing B vs C are blocked on PH5 (KG-Bench Cat 10/11).
5. **Single LLM (Gemini-3-flash-preview).** Cross-model ablation is out of scope, same as Pathway B.

---

## 5. Reproducibility

Pathway C honours the same `repro` block as Pathway B:

```ts
import { extractHyperedges } from "@/lib/threat-pipeline";

const result = await extractHyperedges(
  cleanedText,
  "report",
  0.8,
  ragContextBlock,
  { deterministic: true, temperature: 0, seed: 42 },
);
```

With `deterministic: true`, temperature is forced to 0 and seed to 42
regardless of caller values, so re-runs against the same text + RAG
snapshot produce stable hyperedge ids.

---

## 6. References

- `.lovable/plan.md` — phased plan PH1–PH7
- `src/lib/ontology/hypergraph.ts` — PH1 type, validators, decompose/reassemble
- `public/schemas/cti-hyperedges.v1.schema.json` — producer contract
- `supabase/functions/threat-extract/index.ts` — Pathway B counterpart (untouched)
- `public/reports/comprehensive-technical-report.md` §10.2 — Pathway B ablation baseline
- Hypergraph design note (user upload) — §2 motivation, §3 faithful provenance

---

*Last updated: PH2 ship. Next append: PH3 (joint-validity rules R14–R16).*
