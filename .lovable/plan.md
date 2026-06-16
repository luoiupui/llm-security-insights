# Hypergraph Pathway — Parallel Track (PH-series)

## TL;DR (revised)
**Don't replace, run in parallel.** The hypergraph approach becomes a **second, independent extraction pathway** that runs alongside the current triple-based pipeline on the same input. Both pathways share Stages 1–2 (preprocess + RAG) and Stage 4 (kb-validate, per-entity). They diverge at Stage 3 (extraction) and re-converge at Stage 6 (attribution + comparison panel). This makes the hypergraph claim **falsifiable by direct A/B**, not just augmented narrative.

Phase H1 (foundations: `Hyperedge` type, decompose/reassemble, 10 unit tests) is already merged and behavior-neutral. The phases below are re-scoped from "augmentation" to "parallel pathway C".

## Pathway Map

```text
                   ┌─ Pathway B (current, triple-native) ─┐
Stage 1,2 ────────►│  Stage 3: GRAPH_NATIVE_COT (triples) │──► Stage 4 ──► Stage 5 (R1–R13) ──► Stage 6 ─┐
(shared)           └──────────────────────────────────────┘                                              ├─► Comparison Panel
                   ┌─ Pathway C (new, hyperedge-native) ──┐                                              │   (KG-Bench + UI)
                   │  Stage 3': HYPEREDGE_COT (hyperedges)│──► Stage 4 ──► Stage 5' (R14 joint) ──► Stage 6 ┘
                   └──────────────────────────────────────┘
```

Pathway C is selectable per-run via `pathway: "B" | "C" | "both"`; `"both"` runs them in parallel and scores deltas.

## Revised Phases

### PH1 — Foundations ✅ (shipped)
`hypergraph.ts`, JSON schema v1, decompose/reassemble, 10 tests. No behavior change. Already merged.

### PH2 — Parallel extractor (Stage 3')
- New edge function `threat-extract-hyper/index.ts` (sibling of `threat-extract`, **not** a fork of its prompt).
- Prompt `HYPEREDGE_NATIVE_COT_PROMPT`: 6 steps that emit `hyperedges[]` as primary output, with `decomposed_triples` auto-derived for downstream compatibility.
- Same Gemini-3-flash backbone, same `domain` param, same I/O envelope as `threat-extract`.
- Pipeline contract: add stage `extract_hyper` to `src/lib/threat-pipeline.ts` mirroring `extract`.

### PH3 — Parallel conflict rules (Stage 5')
- `src/lib/conflicts/hyperedge-rules.ts`: R14 (joint validity), R15 (qualifier consistency), R16 (provenance span overlap ≥ 1 token across member triples).
- `threat-conflicts` accepts `mode: "triples" | "hyperedges"`; pathway C calls it in hyperedge mode.
- 6 unit tests against existing CTI corpus.

### PH4 — Parallel persistence
- Migration: `kg_hyperedges (id, kg_id, type, node_ids uuid[], qualifiers jsonb, source_passage text, confidence numeric, pathway text default 'C', created_at)` + GRANTs + RLS (auth read, service write).
- `kg_pathway_runs (id, report_id, pathway, extraction_ms, conflict_summary jsonb, kg_bench_score jsonb)` to record A/B results per source document.
- `threat-kg-query` accepts `?pathway=B|C|both` and returns merged or side-by-side results.

### PH5 — Comparison harness (KG-Bench Cat 10 + Cat 11)
The **innovation-evidence** step, framed as A/B not augmentation:
- Cat 10 — **Hyperedge atomicity**: gold hyperedges (SolarWinds, NotPetya, FIN7-Carbanak, Lazarus-3CX, etc., n=10) scored against both pathways. Pathway B is scored via post-hoc `reassembleFromTriples`.
- Cat 11 — **Explanation cost**: # DB lookups + tokens needed to answer "why is actor X attributed to event Y?" for each pathway. Hypothesis: C ≤ B / 3.
- Runner: extend `src/lib/kg-bench/runner.ts` with `pathway` axis; persist to `kg_pathway_runs`. Negative results documented, not hidden.

### PH6 — UI panels (parallel surface)
Two new panels, both gated by `VITE_HYPERGRAPH_ENABLED`:
- **`HypergraphPathwayPanel`** on KG Construction page — live side-by-side run: same input, two columns (B vs C), per-stage timing, triple/hyperedge counts, conflict counts.
- **`PathwayComparisonPanel`** on Experiments page — KG-Bench Cat 10/11 deltas across the corpus, with a verdict badge (C wins / tie / B wins) per metric. Mirrors the §10.2 ablation table style already used.
- Existing Attribution page gets a thin "view as hyperedges" toggle (re-uses `reassembleFromTriples` when pathway B is active).

### PH7 — Agent harness wiring (optional, gated on PH5 result)
- Add `extract_hyper` tool to `threat-agent` so Pathway A (AI-SDK loop) can call either extractor.
- Skip if PH5 shows no measurable C advantage; document negative result in `mem://features/kg-bench`.

## What changed vs the previous plan

| Aspect | Old (augment) | New (parallel) |
|---|---|---|
| Stage 3 prompt | Add Step 4.5 to existing CoT | Separate `HYPEREDGE_COT` in sibling edge function |
| Conflict rules | Add R14 to R1–R13 | Separate hyperedge rule module, dispatched by mode |
| Persistence | One `kg_hyperedges` table | Same + `kg_pathway_runs` A/B record |
| KG-Bench | One new category | Two new categories (atomicity + explanation cost) framed as A/B |
| UI | One "Event View" toggle | Two dedicated panels for live and corpus-level comparison |
| Falsifiability | Mixed with current pipeline | **Same input, two pipelines, scored independently** |

## Honest Risks (unchanged from prior plan, restated)
1. Extraction reliability — schema-constrained decoding + round-trip gate.
2. Larger blast radius — R14–R16 reject jointly inconsistent hyperedges; confidence floor.
3. Tooling immaturity — hyperedges remain an index; no Neo4j, no HGNN.
4. Cost — running both pathways ~2× LLM spend on benchmark days; gate via `pathway="both"` opt-in, default `"B"`.

## Out of Scope
STIX 2.1 replacement, HGNN, new graph DB, clinical hyperedges, real-time dual-write in production paths.

## Deliverable Order
PH1 ✅ → PH2 → PH3 → (gate: tests green + 1 sample doc roundtrips) → PH4 → PH5 → PH6 → PH7 (conditional).

---
Proceed with **PH2** (sibling `threat-extract-hyper` edge function + `HYPEREDGE_NATIVE_COT_PROMPT` + pipeline-stage entry)?
