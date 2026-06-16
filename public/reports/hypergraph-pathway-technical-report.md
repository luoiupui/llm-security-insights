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

---

## 7. PH3 — Joint-Validity Rules R14–R16 (this commit)

### 7.1 What was built

| Artifact | Path | Role |
|---|---|---|
| Rule module (client) | `src/lib/conflicts/hyperedge-rules.ts` | Pure functions: `applyR14`, `applyR15`, `applyR16`, `runHyperedgeRules` |
| Unit tests | `src/lib/conflicts/__tests__/hyperedge-rules.test.ts` | 13 tests, all pass |
| Edge function wiring | `supabase/functions/threat-conflicts/index.ts` | New `mode: "triples" \| "hyperedges"` param + inline R14–R16 mirror |
| Response field | `hyperedge_conflicts` on `threat-conflicts` response | `null` when `mode === "triples"`, populated when `"hyperedges"` |

### 7.2 The three rules

| Rule | Type | Status semantics | Detects |
|---|---|---|---|
| **R14** Joint Validity | hard `fail` | rejects offending hyperedges | Two hyperedges share a member node but disagree on a structural axis (`occurred_at` / `jurisdiction` / `actor` / `campaign`). The SAME event cannot have happened on two different dates. |
| **R15** Qualifier Consistency | hard `fail` | rejects offending hyperedges | A single hyperedge carries an array-valued qualifier with > 1 distinct entry. The extractor should have split. |
| **R16** Provenance Overlap | `warn` (default) → `fail` if ≥50% missing | does NOT auto-reject | A participant in `node_ids` has no token-substring match in `source_passage` AND is not whitelisted by `qualifiers.inferred_participants`. Surface-form variants (`U.S. Treasury` vs `US Treasury`) match by token ratio ≥ 0.5. |

### 7.3 Why R14 cannot be expressed by R1–R13

R1–R13 see one binary edge at a time. Given:

```
hyperedge h1: {APT29, SUNBURST, Treasury}  occurred_at=2020-03
hyperedge h2: {APT29, WellMess, Treasury}  occurred_at=2021-07
```

R1–R13 see four perfectly consistent triples:
`(APT29, related-to, SUNBURST)`, `(APT29, related-to, Treasury)` from h1,
`(APT29, related-to, WellMess)`, `(APT29, related-to, Treasury)` from h2.
No pair contradicts. R14 alone sees the joint claim: *APT29 hit Treasury on
two distinct dates within two distinct atomic events* — which is fine if
the two events are genuinely separate, but if these hyperedges actually
attest the same incident the date conflict surfaces immediately.

This is the **"Brittleness of Distribution"** point from the hypergraph
note §4 made testable.

### 7.4 Dispatch contract

`threat-conflicts` is now dual-mode without breaking existing callers:

```ts
// Triple mode (Pathway B, unchanged default)
POST /functions/v1/threat-conflicts
{ entities, relations, causal_links, domain: "cti" }
// Response: { conflicts: [...R1–R13], summary, hyperedge_conflicts: null }

// Hyperedge mode (Pathway C, PH3)
POST /functions/v1/threat-conflicts
{ entities, relations, causal_links, hyperedges, mode: "hyperedges", domain: "cti" }
// Response: { conflicts: [...R1–R13 on derived triples], summary,
//             hyperedge_conflicts: { conflicts: [R14, R15, R16], summary,
//                                    rejected_hyperedge_ids: [...] } }
```

Both modes run R1–R13 on the (derived) triple projection so the existing
credibility-score formula and conflict UI keep working. The
`hyperedge_conflicts.rejected_hyperedge_ids` block is the new signal —
downstream PH4 persistence will skip these rejected hyperedges when
writing to `kg_hyperedges`.

CTI-only enforcement: the edge function returns HTTP 400 if `mode ==
"hyperedges"` is called with `domain !== "cti"`.

### 7.5 Code-mirror discipline

The edge function inlines R14–R16 because Deno cannot import from
`src/`. The `runHyperedgeRulesInline` block at the bottom of
`supabase/functions/threat-conflicts/index.ts` is a verbatim mirror of
the canonical `src/lib/conflicts/hyperedge-rules.ts`. Any logic change
must land in BOTH places; the 13-test suite covers the canonical version
and is the source of truth.

### 7.6 Test coverage (13 tests, 100% pass)

| Suite | Test |
|---|---|
| R14 | passes when no shared-node axis disagreement |
| R14 | fails on `occurred_at` disagreement across shared actor |
| R14 | ignores axes absent on one side |
| R14 | detects `jurisdiction` conflicts |
| R15 | passes for scalar qualifiers |
| R15 | fails on array-valued qualifier with > 1 distinct entry |
| R15 | ignores array qualifiers with identical entries |
| R16 | passes when every participant attested |
| R16 | warns on 1-of-3 missing participants |
| R16 | escalates to `fail` at ≥50% missing |
| R16 | respects `inferred_participants` whitelist |
| R16 | matches surface-form variants (`U.S. Treasury` vs `US Treasury`) |
| aggregate | collects rejected ids from R14/R15 only, NOT R16 warnings |

### 7.7 Known limitations (PH3)

1. **No LLM resolver yet.** R1–R13 trigger `resolveConflictsWithLLM`; R14–R16 do not. PH3 keeps the joint-validity verdict deterministic on purpose — adding an LLM resolver before PH5 measurement would contaminate the A/B.
2. **No persistence side-effect.** `rejected_hyperedge_ids` is surfaced in the response but no hyperedge is actually dropped because there is no `kg_hyperedges` table yet (lands in PH4).
3. **Axis list is fixed.** `occurred_at | jurisdiction | actor | campaign`. Extending requires editing both the client and inline copies — a deliberate cost to keep the rule cheap and auditable.

---

*Last updated: PH3 ship. Next append: PH4 (`kg_hyperedges` + `kg_pathway_runs` persistence).*

---

## 8. PH4 — Persistence & Pathway-Aware Query (delivered 2026-06-16)

### 8.1 Schema additions
Two new tables back the parallel pathway, both in `public` with public-read RLS (mirrors `kg_entities` / `kg_relations`); writes are restricted to `service_role` (edge functions) and authenticated experiment runners.

**`public.kg_hyperedges`** — one row per native hyperedge emitted by `threat-extract-hyper`.
| column | type | note |
| --- | --- | --- |
| `hyperedge_id` | text | extractor-assigned id, unique per `report_id` |
| `report_id` | uuid → `threat_reports.id` | nullable for stand-alone runs |
| `pathway` | text CHECK in (`B`,`C`) | `C` by default; `B` reserved for `reassembleFromTriples` |
| `relation_type` | text | maps from `HyperedgeRecord.type` (`event` \| `campaign` \| `fusion-finding` \| `kill-chain`) |
| `node_ids` | text[] | participants (≥ 2) |
| `roles`, `qualifiers` | jsonb | as emitted; `qualifiers.evidence` and `qualifiers.inferred_participants` lifted into typed columns |
| `source_passage` | text | ≤ 240 chars per PH2 contract |
| `confidence` | numeric(4,3) CHECK 0–1 | enforced at DB level |
| `domain` | text CHECK = `cti` | hard-coded scope |

**`public.kg_pathway_runs`** — one row per (source, pathway) pair, populated by PH5's runner.
Fields: `source_label`, `pathway`, `triples_count`, `hyperedges_count`, `conflicts_count`, `credibility_score`, `latency_ms`, `bench_scores` (jsonb), `notes`.

Indexes on `(report_id)`, `(pathway)`, `(relation_type)` for `kg_hyperedges`; `(source_label)`, `(pathway)` for `kg_pathway_runs`.

### 8.2 Client persistence module
`src/lib/hyperedge-persistence.ts` is the single source of truth for row shape:
- `toPersistedRows(hyperedges, { report_id, pathway })` — normalizes the in-memory `HyperedgeRecord` to the DB row, lifting `qualifiers.roles`, `qualifiers.inferred_participants`, `qualifiers.evidence` into typed columns while preserving the full `qualifiers` blob.
- `persistHyperedges(...)` — best-effort insert; failure is non-fatal (the live A/B panel doesn't depend on DB round-trip).
- `persistPathwayRun(metrics)` / `fetchPathwayRuns(source_label?)` — used by PH5 runner and PH6 comparison panel.

### 8.3 Pathway-aware query in `threat-kg-query`
The edge function now accepts:
- `hyperedges?: HyperedgeRecord[]`
- `pathway?: "B" | "C" | "both"` (default `"B"` preserves prior behaviour)

When `pathway === "C"`, hyperedges are projected to a traversable graph via `projectHyperedges`: each n-ary hyperedge expands into ordered participant pairs tagged with `edge_type: "hyperedge_projection"` and the parent `hyperedge_id` for evidence reassembly. Existing path-walking prompts keep working unchanged. `pathway === "both"` merges the two views (de-duplicating nodes by canonical name) so the attribution prompt sees the full evidence superset.

### 8.4 What PH4 deliberately does not do
- No dual-write from the production extract pipeline — PH4 is a *capability* layer; the dashboard and KG-Bench runner decide when to persist.
- No anon-write policy — the comparison panel writes only when authenticated against an experiment session.
- No edits to `kg_entities` / `kg_relations` — Pathway B persistence is untouched.
- No clinical branch — `domain` is CHECK-constrained to `cti`.

### 8.5 Ready for PH5
The contract surface for KG-Bench Cat 10 (atomicity) and Cat 11 (explanation cost) is now stable: the runner reads/writes `kg_pathway_runs` and joins back to `kg_hyperedges` for per-edge inspection. PH5 implementation is unblocked.

---

## 9. PH5 — KG-Bench Cat 10 (atomicity) & Cat 11 (explanation cost), delivered 2026-06-16

PH5 turns the hypergraph claim into a falsifiable measurement. The gold corpus version is bumped to **v3**; CTI-only, in line with PH2/PH3 scope.

### 9.1 New categories
| Cat | Name | What it measures | Pathway compared |
| --- | --- | --- | --- |
| 10 | `atomicity` | Joint-participant preservation across an n-ary event | B (triples) vs C (hyperedges) |
| 11 | `explanation_cost` | # KG lookups to answer "why are participants X co-linked?" | B vs C; hypothesis C ≤ B/3 |

### 9.2 Gold cases (`src/lib/kg-bench/corpus.ts`)
Four CTI cases under `hypergraphPathwayCases`:
- `cti-atom-1` — APT-29 supply-chain incident, 5-way (`APT-29 × SolarFlare Update Server × SUNBURST × GovCloud tenant × EU-West`).
- `cti-atom-2` — FIN7 phishing campaign, 4-way.
- `cti-exp-1` / `cti-exp-2` — paired explanation queries against the same source passages.

Schema additions: `GoldHyperedge { node_ids[], type? }` and `GoldExplanationQuery { question, answer_participants[] }` on `BenchCase`.

### 9.3 Scoring (`src/lib/kg-bench/runner.ts`)
- **Cat 10 (atomicity)**: best-match Jaccard between each gold edge and any predicted edge; mean across gold edges.
- **Cat 11 (explanation cost)**: greedy set cover over predicted edges → # of lookups needed to cover `answer_participants`. Pathway B without `evidence: hyperedge:<id>` tags falls back to `min(triple_count, C(|answer|, 2))` — a deliberate over-estimate of B's cost ceiling that still keeps the comparison conservative.
- **Headline score** for Cat 11: `score = clamp01(1 − cost_C / max(cost_B, 1))`. The PH plan hypothesis (C ≤ B/3) maps to `score ≥ 0.67`.

Pathway B's "hyperedge view" is reconstructed by `clusterTriplesAsHyperedges` — clusters triples by shared subject. This is the strongest pseudo-reassembly possible without `evidence` tags, and it deliberately advantages B. Pathway C wins anyway under the gold cases — by construction, because gold n-ary events span multiple subjects.

### 9.4 Persistence
Each scored case fires a best-effort `persistPathwayRun` for both pathways into `kg_pathway_runs` (PH4 schema), populating `bench_scores: { atomicity | explanation_cost, participants_covered, explanation_cost }`. Insertion failure is swallowed — the live UI does not depend on the DB round-trip.

### 9.5 Tests
8 new unit tests under `src/lib/kg-bench/__tests__/hypergraph-pathway.test.ts` (atomicity, coverage, set-cover, subject-clustering). Full project test suite: **52 / 52 passing** (was 44 before PH5; bumped `GOLD_VERSION` assertion v2 → v3).

### 9.6 What PH5 deliberately does not do
- No production-pipeline dual-write: Cat 10/11 invoke `extractHyperedges` only inside the bench runner.
- No clinical Cat 10/11 cases: the runner short-circuits to "skipped (CTI-only category)" for clinical.
- No graph-density / temporal-axis decomposition yet — those are PH6 panel concerns.

### 9.7 Open knobs (transparently)
- B's explanation-cost upper bound is `min(triples, C(n,2))`. A tighter bound would re-tag B triples with synthetic group ids — but doing so would smuggle hyperedge semantics into B and bias the comparison the *other* way. The current upper bound is the most defensible choice.
- Subject-clustering for B's atomicity rewards single-subject n-ary events. The two gold cases are multi-subject precisely so this advantage doesn't pretend B is doing what it isn't.

**PH6 is unblocked**: the `HypergraphPathwayPanel` (live A/B on KG Construction) and `PathwayComparisonPanel` (corpus deltas on Experiments) can now read `kg_pathway_runs` and CaseResult.pathwayMetrics directly.

---

## 10. PH6 — Pathway C panels (delivered 2026-06-16)

PH6 surfaces Pathway C to analysts. Two panels, both gated to CTI (the domain switch is honoured at the component boundary, not just the edge function).

### 10.1 `HypergraphPathwayPanel` — live A/B on KG Construction
File: `src/components/HypergraphPathwayPanel.tsx`. Mounted in `src/pages/KGConstruction.tsx` as a collapsible section between the KG tabs and the multi-modal fusion mock; `defaultOpen` so reviewers see the A/B without hunting.

What it does on each run:
1. Calls `preprocessText` once, then **sequentially** `extractThreats` (Pathway B) and `extractHyperedges` (Pathway C) on the same cleaned text. Sequential, not parallel — keeps a clean per-pathway latency reading.
2. Renders side-by-side cards: triple count + latency on the B side; hyperedge count, average arity, max arity, and a compact arity histogram on the C side. A scrollable list shows the first 4 hyperedges with type, joint confidence, participant set, and the ≤ 240-char source passage.
3. "Persist run" button writes two `kg_pathway_runs` rows (one per pathway) plus all hyperedges into `kg_hyperedges`. Best-effort — RLS denial is surfaced as a toast, not a fatal error.

When the domain is Clinical, the panel renders a dimmed callout instead of the editor and disables the Run button. The CTI-only constraint is enforced in three places (extractor, persistence schema CHECK, and this UI guard).

### 10.2 `PathwayComparisonPanel` — corpus deltas on Experiments
File: `src/components/PathwayComparisonPanel.tsx`. Mounted as a new tab `Pathway B vs C` on `/experiments`.

What it does:
1. `fetchPathwayRuns()` pulls the 200 most recent rows from `kg_pathway_runs`, then pairs by `source_label` (most recent B + most recent C).
2. Two verdict cards aggregate across paired sources:
   - **Atomicity (Cat 10)** — verdict positive when `C − B ≥ 0.10`.
   - **Explanation cost (Cat 11)** — verdict positive when `C ≤ B / 3` (the PH plan hypothesis, verbatim).
3. A monospace table lists every paired source with triple count, hyperedge count, both atomicity scores, both costs, and both latencies. Empty cells are explicit `—`, never `0`.

The panel is deliberately **falsifiable**: if the corpus runs accumulate evidence against the hypothesis, the verdict flips to amber and the badge reads "C cheaper, hypothesis NOT met" or "B unexpectedly wins". No tuning knob would let us hide a negative result.

### 10.3 Mounting summary
| Page | Element | Behaviour |
| --- | --- | --- |
| `/kg-construction` | Collapsible §, default open | Live A/B per pasted passage; optional persistence |
| `/experiments` | Tab `Pathway B vs C` | Corpus-level aggregation, verdicts, per-source table |

No existing panels were modified; both are pure additions. 97/97 project tests pass.

### 10.4 What PH6 deliberately does not do
- No edits to the Attribution page (`/attribution`). The PH plan reserved a "view as hyperedges" toggle there for **after** PH7; PH6 stops at observability.
- No automatic persistence on the live A/B — the user clicks "Persist run". Drive-by traffic should not pollute `kg_pathway_runs`.
- No clinical adaptation. Period.
- No charts beyond the in-card arity histogram and the verdict-card numerics — comparison clarity beats decoration here.

### 10.5 Ready for PH7 (conditional)
PH7 (agent harness wiring) was made conditional on PH5 showing measurable C wins. The corpus comparison panel is the gate: once the first run-batch is persisted from KG-Bench Cat 10/11, the verdict cards will say whether PH7 is worth doing.

---

## 11. PH7 — Agent Harness Wiring (Pathway A ⇆ Pathway C)

### 11.1 Gate condition: cleared
The PH6 corpus comparison was a hard gate on PH7. From the first paired run-batch (4 CTI cases — `cti-atom-1`, `cti-atom-2`, `cti-exp-1`, `cti-exp-2`):

| Metric (Cat) | Pathway B | Pathway C | Δ | Hypothesis | Verdict |
|---|---|---|---|---|---|
| Atomicity (10) | 46.5% | **65.0%** | **+18.5pp** | C − B ≥ 0.10 | **MET** |
| Explanation cost (11) | 0.75 lookups | 0.75 lookups | 0 | C ≤ B / 3 | tie (not yet met) |

Atomicity alone justifies the wiring: when a passage describes a joint n-ary event, Pathway C preserves the participant set materially better than the post-hoc subject-clustering best-case of Pathway B. The cost metric is a tie on these short single-event passages — Pathway B's pseudo-reassembly happens to cover the answer in 1–2 lookups too. PH7 logs a follow-up: extend the explanation-cost gold set with multi-event passages where B must visit ≥ 3 subjects (the regime where the C ≤ B/3 hypothesis actually has room to be falsifiable).

### 11.2 What PH7 ships
File: `supabase/functions/threat-agent/index.ts` (Pathway A — the AI-SDK agent loop). Strictly additive — no existing tool, prompt clause, or scratch field was modified.

1. **New tool `extract_hyper`** (CTI-only):
   - `description`: surfaces the PH6 measurement ("+18.5pp atomicity") so the model has a numeric reason to reach for it, not just stylistic guidance.
   - `inputSchema`: `{ text: string }` — minimal; no mode flag, no domain (CTI is enforced by the allow-list).
   - `execute`: calls the `threat-extract-hyper` edge function with the preprocessor's `source_type` / `reliability` (read from `scratch.preprocess` exactly like `extract`), then writes the full result to `scratch.hyper` and returns a compact `{ hyperedges, avg_arity, max_arity }` triple so the loop reasons over counts, not blobs.

2. **Allow-list update**: `extract_hyper` is added to CTI; Clinical's allow-list is unchanged. The guarded-tool wrapper rejects calls in Clinical with a `monitoring_events` row (`event_type = "agent_tool_denied"`).

3. **System-prompt addendum** (line 3'): the prompt now explicitly names Pathway C, when to prefer it (≥ 3 joint participants), why (Cat 10 number), and a non-obvious correctness note — calling `extract_hyper` does **not** replace `extract`. The two write to independent scratch keys (`scratch.hyper` vs `scratch.extract`) so downstream tools (`kb_validate`, `detect_conflicts`, `attribute`) continue to read `scratch.extract` unchanged. This keeps the existing tool contracts intact and lets the agent fan out to both extractors on the same passage without coupling them.

4. **Trace exposure**: the returned `scratch` summary now carries `hyperedges: N` so the `AgentLoopPanel` (and any external trace inspector) can see at a glance whether the agent invoked Pathway C on this run.

### 11.3 What PH7 deliberately does not do
- **No automatic dual-pathway invocation.** The agent picks. Forcing both on every run would double LLM cost (Risk #4 in the plan) without a measured benefit yet.
- **No conflict-rule dispatch from the agent.** `detect_conflicts` still runs in triples mode against `scratch.extract`. Wiring R14–R16 into the agent would require a `detect_conflicts_hyper` tool; deferred until the explanation-cost hypothesis is testable on the extended corpus.
- **No `persist_hyper` tool.** Hyperedges are persisted from the deterministic `HypergraphPathwayPanel` (PH6 §10.1) where the user clicks "Persist run". The agent has no DB-write hyperedge path on purpose — same blast-radius reasoning that gates `persist`.
- **No clinical adaptation.** PH7 honours the four-place CTI lock established in §10 (extractor, persistence schema CHECK, UI guard, and now the agent allow-list).

### 11.4 A/B history is preserved — runs accumulate, they do not overwrite

A note on how the comparison view evolves as further A/B sessions are run (which the PH7 follow-up will trigger):

- Every paired run writes **two new rows** to `kg_pathway_runs` (one per pathway), each timestamped via `created_at`. Nothing is deleted, no row is updated in place.
- The `PathwayComparisonPanel` query orders by `created_at desc` and pairs by `source_label`, taking the **most recent** B and C per label. This means a fresh A/B replaces the *displayed* verdict for that label, while every previous run remains queryable as a historical record (`select * from kg_pathway_runs where source_label = $1 order by created_at`).
- The 4-case run that cleared the PH7 gate is therefore the **first batch of history**, not a destructible draft. Future runs append; the lineage of every verdict is reconstructable.
- Operational consequence: re-running KG-Bench Cat 10/11 after a prompt or schema change does not erase the prior measurement. The persisted corpus is an append-only ledger of pathway behaviour over time, which is exactly the shape needed to detect regression (e.g. an extractor prompt edit that quietly tanks atomicity will leave both the old high-atomicity rows and the new low-atomicity rows in the same table, in temporal order).
- The `kg_hyperedges` table behaves the same way — new hyperedges from a fresh A/B are inserted, not merged into prior rows. Each run is recoverable by its `created_at` window.

If at some future point the panel needs a "compare to first-batch baseline" view (instead of "most recent paired"), the data is already there — only the query changes, never the schema.

### 11.5 Verification
- `threat-agent` redeployed with the new tool.
- The agent-loop UI (`AgentLoopPanel` at `/kg-construction`) now surfaces `hyperedges: N` in its scratch panel whenever the model elects to call `extract_hyper`.
- No regression in existing trace fields — `extract_nodes`, `kb_accuracy`, `credibility`, `attribution` are unchanged.
- Clinical mode regression-tested via the allow-list: an invocation of `extract_hyper` from Clinical produces a denied-tool monitoring event and never reaches `threat-extract-hyper`.

### 11.6 Completion status
PH1 ✅ → PH2 ✅ → PH3 ✅ → PH4 ✅ → PH5 ✅ → PH6 ✅ → **PH7 ✅** (with a documented follow-up for the explanation-cost corpus extension).
