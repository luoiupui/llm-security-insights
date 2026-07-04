## Deliverable

One new research memo: `public/reports/issue3-n1000-impact-analysis.md`, plus a one-line entry in `public/reports/manifest.json`. No code, schema, edge-function, or UI changes.

Answers three questions the reviewer will ask:
1. What is *currently* implemented (ground truth, N=56)?
2. If we scale to N=1,000, what is the compute-cost impact?
3. Does N=1,000 force any change to algorithms or pipeline architecture?

## Structure of the memo

### 1. Current status snapshot (N=56, shipped)
- Corpus: **N=56 CTI samples**, 7 strata, entity density ~19 ent/doc, ~1,060 entities total — source `src/lib/kg-bench/corpus.ts` / `src/lib/test-corpus.ts`, `corpusStats` computed at import.
- Pipelines actually running against N=56:
  - Pathway B (deterministic 7-stage) — `threat-preprocess → threat-rag → threat-extract → kb-validate → threat-conflicts → threat-kg-query → persist`
  - Pathway A (agent loop) — `threat-agent` with `stopWhen(stepCountIs(50))`
  - Pathway C (hypergraph) — `threat-extract-hyper`
- Statistics layer: `bootstrapCI`, `wilsonInterval`, `mcnemarTest`, `stratifiedKFold` in `src/lib/kg-bench/stats.ts` — deployed but reporting ±0.09 CI at n=56.
- N=200 / N=500 / N=1,000 are **planned only** in `issue3-corpus-scaleup-feasibility.md`; not ingested, not annotated, not scored.

### 2. Compute-cost impact of N=1,000 (18× scale-up)

Per-doc cost budget (measured on Pathway B, gemini-3-flash-preview):

| Stage | LLM calls/doc | ~Tokens in/out | ~Latency/doc |
|---|---|---|---|
| threat-preprocess | 0 (deterministic) | — | ~50 ms |
| threat-rag | 1 embedding + retrieval | 2k in | ~400 ms |
| threat-extract (8-step CoT) | 1 | ~4k in / ~2k out | ~4–7 s |
| kb-validate | 0 | — | ~30 ms |
| threat-conflicts | 0 (symbolic) + C1–C4 (spec) | — | ~80 ms |
| threat-kg-query | 0 | — | persist only |
| **Total per doc (B)** | **~1 LLM + 1 embedding** | **~6k tokens** | **~5–8 s** |

Scaled linearly:

| N | Pathway-B LLM calls | Tokens | Wall time (serial) | Wall time (10× parallel) | Rough gateway credit cost |
|---:|---:|---:|---:|---:|---:|
| 56 (now) | 56 | ~340k | ~7 min | ~45 s | baseline |
| 500 (Tier-2) | 500 | ~3.0M | ~65 min | ~7 min | ~9× |
| **1,000 (Tier-3)** | **1,000** | **~6.0M** | **~2.2 h** | **~13 min** | **~18×** |

Multi-run overhead:
- Pathway A (agent loop, avg ~6 steps/case observed) ⇒ ×6 LLM calls per doc when scored ⇒ N=1,000 on A alone ≈ 6,000 calls / ~30M tokens.
- 5-fold stratified CV ×3 systems (Ours / LLM-zeroshot / Rule-based baseline) ⇒ another ×15 multiplier over the headline number.
- Full paper-grade run at N=1,000 (all three pathways × 5-fold × 3 comparators) ≈ **0.5–1.0 B tokens gateway spend** — the dominant cost line, not annotation.

Storage/DB impact:
- `threat_reports` + KG tables grow ~18×: from ~1k entities → ~35k entities / ~50k relations / ~10k hyperedges. Well within Postgres single-instance limits; no schema change required.
- Bench artefacts (per-run JSON) at ~50 KB/doc ⇒ ~50 MB per full run. Trivial.

Annotation cost (from feasibility memo, kept for completeness): ~6 person-weeks single-annotator, ~2.5 weeks with weak-supervision bootstrap using `threat-extract` silver labels.

### 3. Algorithm & architecture impact — what breaks, what doesn't

**Does NOT change** (green):
- Ontology (`src/lib/ontology/{cti,hypergraph,corroborated-finding}.ts`) — schemas are N-independent.
- Deterministic pipeline stages — pure per-doc functions, embarrassingly parallel.
- Statistics layer — designed for arbitrary N; only the CI narrows.
- Prompt design (8-step CoT) — token cost per doc unchanged.
- Domain switch, redaction, privacy/FL simulation surfaces.

**Needs tuning** (yellow):
- **Runner concurrency** (`src/lib/kg-bench/runner.ts`) — currently serial-friendly. At N=1,000 add a bounded concurrency (p-limit ≈ 8–16) to keep gateway rate-limit headroom.
- **Edge-function timeouts** — Supabase edge functions cap ~150 s/invocation. Already per-doc, so N doesn't matter, but a "run whole benchmark" wrapper must chunk (batches of 50–100) and checkpoint to `bench_runs` rather than one long call.
- **RAG index size** — MITRE/CVE KB retrieval currently linear-scan on ~1.5k procedure examples. At corpus N=1,000 the KB itself doesn't grow, but recall/precision at k=8 may saturate → consider switching from cosine over in-memory to pgvector HNSW (already available in Lovable Cloud) if p95 retrieval > 500 ms.
- **Conflict-rule cost** — `hyperedge-rules.ts` and `mined-rules.generated.ts` are O(edges²) in worst case. At ~50k relations the pairwise sweep is ~2.5 B comparisons — needs the existing bucketed index on `(subject, predicate)` to be enforced; already present but currently opt-in.
- **Adaptive layers C1–C4** — currently `Spec` maturity in `implementation-roadmap.md`. Live wiring becomes *more* valuable at N=1,000 (more conflict signal to learn from) but is not a blocker.

**Genuine architectural changes required** (red — only if we go to N=1,000 with full comparator matrix):
- **Bench orchestration** must move from "one HTTP call runs the whole thing" to a job/queue pattern: `bench-schedule` (fan-out) → `bench-worker` (per-shard) → `bench-aggregate` (reduce). Same edge-function set, new coordinator. This is the *only* item that touches architecture, and it's a small addition, not a refactor of the pipeline.
- **Result storage** should move from `localStorage`-cached per-run JSON to a `bench_runs` / `bench_items` table with RLS, so long runs survive tab close. Schema is 2 tables + GRANTs.
- **Cost governance** — a per-run token budget cap and a dry-run mode (sample 10 % first), added in the runner, not in the pipeline.

**Not required at N=1,000**:
- No new model. Gemini-3-Flash still fits the token/doc budget.
- No fine-tuning. LoRA upper-bound stays a *post-thesis* P2 item.
- No change to the two-pathways-one-backbone core thesis.

### 4. Recommendation
- Stay on **N=500 as the paper target** (already the recommendation in `issue3-corpus-scaleup-feasibility.md`) — clears entity-count parity with DNRTI, doc-count parity with CASIE, at ~½ the compute and annotation cost of N=1,000, with no architectural changes needed.
- If reviewers explicitly require N=1,000, the *only* architectural work is the bench orchestration (schedule/worker/aggregate) + a `bench_runs` table. Pipeline stages, ontology, prompts, and stats layer are untouched.

### 5. Cross-refs
Link back to `issue3-corpus-scaleup-feasibility.md`, `issue3-sota-benchmark-gap.md`, `implementation-roadmap.md`, `performance-and-resource-report.md`, `corpus-expansion-and-statistics.md`.

### 6. Manifest entry
Append one row to `public/reports/manifest.json` pointing at the new memo, category `issue3`.

## Out of scope
No code, no schema, no UI, no ingestion. Pure research memo answering the compute/architecture question so it can be cited from the thesis defence.
