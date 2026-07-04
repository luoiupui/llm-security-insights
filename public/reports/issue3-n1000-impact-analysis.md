# Issue 3 — N=1,000 impact analysis (compute cost + architecture)

**Status**: research memo, 2026-07-04. Answers the reviewer question: *the pipeline is still running on N=56; if we scale to N=1,000, what is the impact on compute cost and on the current algorithms / pipeline architecture?*

Related artefacts:
[`corpus-expansion-and-statistics.md`](corpus-expansion-and-statistics.md) ·
[`issue3-corpus-scaleup-feasibility.md`](issue3-corpus-scaleup-feasibility.md) ·
[`issue3-sota-benchmark-gap.md`](issue3-sota-benchmark-gap.md) ·
[`implementation-roadmap.md`](implementation-roadmap.md) ·
[`performance-and-resource-report.md`](performance-and-resource-report.md).

---

## 1. What is actually implemented today (ground truth)

| Item | Status | Source of truth |
|---|---|---|
| CTI corpus | **N=56** across 7 strata (~1,060 entities, ~19 ent/doc) | `src/lib/kg-bench/corpus.ts`, `src/lib/test-corpus.ts`, `corpusStats` at import |
| Pathway B (deterministic 7-stage) | GA, scored | `threat-preprocess → threat-rag → threat-extract → kb-validate → threat-conflicts → threat-kg-query → persist` |
| Pathway A (agent loop) | Beta, not benchmarked | `supabase/functions/threat-agent/index.ts`, `stopWhen(stepCountIs(50))` |
| Pathway C (hypergraph n-ary) | Beta | `supabase/functions/threat-extract-hyper/index.ts` |
| Statistics layer | GA, N-agnostic | `src/lib/kg-bench/stats.ts` — `bootstrapCI`, `wilsonInterval`, `mcnemarTest`, `stratifiedKFold` |
| Reported CI at n=56 | ±0.09 on headline F1 | Wilson 95 %, `stats.ts` |
| N=200 / 500 / 1,000 | **Planned only** | `issue3-corpus-scaleup-feasibility.md` — not ingested, not annotated, not scored |
| Adaptive C1–C4 | Spec (not live-wired) | `implementation-roadmap.md` |

Everything below is a projection *from* this baseline.

---

## 2. Compute-cost impact of scaling to N=1,000 (≈18×)

### 2.1 Per-doc budget (measured on Pathway B, `google/gemini-3-flash-preview`)

| Stage | LLM calls / doc | ~Tokens (in/out) | ~Latency / doc |
|---|---:|---:|---:|
| `threat-preprocess` | 0 (deterministic) | — | ~50 ms |
| `threat-rag` | 1 embedding + retrieval | ~2k in | ~400 ms |
| `threat-extract` (8-step CoT) | 1 | ~4k in / ~2k out | ~4–7 s |
| `kb-validate` | 0 | — | ~30 ms |
| `threat-conflicts` | 0 (symbolic) + C1–C4 (spec) | — | ~80 ms |
| `threat-kg-query` + persist | 0 | — | ~100 ms |
| **Total (Pathway B)** | **~1 LLM + 1 embedding** | **~6k tokens** | **~5–8 s** |

### 2.2 Linear scale-up (Pathway B headline run)

| N | LLM calls | Tokens | Wall time (serial) | Wall time (10× parallel) | Gateway cost (rel.) |
|---:|---:|---:|---:|---:|---:|
| 56 (now) | 56 | ~0.34 M | ~7 min | ~45 s | 1× |
| 500 (Tier-2) | 500 | ~3.0 M | ~65 min | ~7 min | ~9× |
| **1,000 (Tier-3)** | **1,000** | **~6.0 M** | **~2.2 h** | **~13 min** | **~18×** |

### 2.3 Full paper-grade matrix (this is the real cost driver)

Multipliers stack:

- Pathway A agent loop averages ~6 steps/case → **×6 LLM calls/doc**.
- 5-fold stratified CV → **×5 total runs**.
- 3 systems for head-to-head (Ours / LLM-zeroshot / Rule-based) → **×3**.
- 3 pathways scored (A / B / C) → **×3**.

Ballpark for a full N=1,000 evaluation matrix:

- Pathway B alone × 5-fold × 3 systems: ~15,000 LLM calls · ~90 M tokens.
- Pathway A alone × 5-fold: ~30,000 LLM calls · ~180 M tokens.
- Combined all-pathways matrix at N=1,000: **≈ 0.5–1.0 B tokens** in gateway spend.

Gateway spend, not annotator time, becomes the dominant cost line at Tier-3.

### 2.4 Storage / DB impact

- `threat_reports` + KG tables grow ~18×: ~1 k → ~35 k entities, ~50 k relations, ~10 k hyperedges. Well inside Postgres single-instance limits; no schema change required.
- Bench artefacts at ~50 KB/doc ⇒ ~50 MB per full run. Trivial.

### 2.5 Annotation cost (recap from feasibility memo)

- Single-annotator: ~6 person-weeks at N=1,000.
- With weak-supervision bootstrap (use `threat-extract` as silver labels, then human adjudicate): ~2.5 person-weeks.

---

## 3. Algorithm & architecture impact — what breaks, what doesn't

Colour-coded by required action.

### 3.1 GREEN — no change

- **Ontology** (`src/lib/ontology/{cti,hypergraph,corroborated-finding}.ts`) — schemas are N-independent.
- **Pipeline stages** — each stage is a pure per-doc function; N=1,000 is just 1,000 independent invocations. Embarrassingly parallel.
- **Statistics layer** (`stats.ts`) — designed for arbitrary N; only the CI half-width narrows (±0.09 → ±0.022).
- **8-step CoT prompt** — tokens/doc unchanged.
- **Domain switch, redaction lab, privacy/FL simulation surfaces** — untouched.

### 3.2 YELLOW — parameter / configuration tuning

- **Runner concurrency** (`src/lib/kg-bench/runner.ts`) — currently serial-friendly. At N≥500, add a bounded concurrency limiter (p-limit ≈ 8–16) to keep gateway rate-limit headroom without hammering.
- **Edge-function invocation limits** — Lovable Cloud edge functions cap ~150 s/invocation. Per-doc calls already fit; only a "run whole benchmark in one HTTP call" wrapper would blow the limit, so the runner must chunk (batches of 50–100) and checkpoint.
- **RAG index size** — MITRE/CVE KB is ~1.5 k procedure examples and does *not* grow with corpus N. But at N=1,000 the aggregate retrieval workload rises 18× and cosine-over-in-memory may hit p95 > 500 ms → switch to pgvector HNSW (already available in Lovable Cloud).
- **Conflict-rule cost** — `hyperedge-rules.ts` and `mined-rules.generated.ts` are worst-case O(edges²). At ~50 k relations that is ~2.5 B pairwise comparisons if run naively → enforce the existing bucketed `(subject, predicate)` index (present but opt-in today).
- **Adaptive C1–C4** — becomes *more* useful at N=1,000 (more conflict signal to learn from), but not a blocker; still tracked as its own roadmap item.

### 3.3 RED — genuine architectural additions (only if the full N=1,000 matrix is required)

None of these change the pipeline itself — they wrap it.

1. **Bench orchestration → fan-out / worker / reduce.**
   Replace the single "run the whole benchmark" HTTP call with:
   `bench-schedule` (fan-out shards) → `bench-worker` (per-shard, calls existing stages) → `bench-aggregate` (reduce metrics).
   Same edge functions, new coordinator layer. Small addition, not a refactor.
2. **Persistent run store.**
   Move from `localStorage`-cached per-run JSON to `bench_runs` / `bench_items` tables with RLS + GRANTs, so a 2-hour run survives tab close.
3. **Cost governance.**
   Per-run token-budget cap + a dry-run mode (10 % sample first). Lives in the runner, not in the pipeline.

### 3.4 NOT required at N=1,000

- No new backbone model. Gemini-3-Flash still fits per-doc token budget.
- No fine-tuning. LoRA upper-bound stays a *post-thesis* P2 item (`issue3-sota-benchmark-gap.md`).
- No change to the two-pathways-one-backbone thesis or to any user-facing surface.

---

## 4. Recommendation

- **Keep N=500 (Tier-2) as the paper-defensible target** — the recommendation already in `issue3-corpus-scaleup-feasibility.md`. It clears entity-count parity with DNRTI, doc-count parity with CASIE, at ~½ the compute and annotation cost of N=1,000, **with zero architectural changes**.
- **N=1,000 remains a post-thesis extension.** If reviewers explicitly demand it, the only architectural work is the bench orchestration layer (schedule/worker/aggregate) plus a `bench_runs` table. Pipeline stages, ontology, prompts, and statistics layer are all untouched.
- **Independent of corpus size**, the yellow items (runner concurrency, pgvector HNSW, bucketed conflict index) are cheap wins to schedule now — they make Tier-1/2 runs faster too.

---

## 5. Answers to the reviewer questions, in one paragraph each

**Q: Is the pipeline still on N=56?**
Yes. The corpus in `src/lib/kg-bench/corpus.ts` is N=56 across 7 strata, and every reported number in Chapter 5 tables inherits from that. N=200 / 500 / 1,000 are documented plans, not shipped data.

**Q: What is the compute-cost impact of N=1,000?**
Linear in N: ~18× the current gateway spend for a Pathway-B headline run (≈6 M tokens, ~13 min at 10× parallelism). A *full* evaluation matrix (3 pathways × 5-fold × 3 comparators) is where the cost concentrates — ballpark 0.5–1.0 B tokens. Storage grows ~18× but stays well within Lovable Cloud limits.

**Q: Does N=1,000 force algorithm or architecture changes?**
The pipeline algorithms and ontologies do not change. Three tuning items (runner concurrency, pgvector HNSW, bucketed conflict index) are cheap parameter changes. The only genuine architectural addition is a bench orchestrator (schedule/worker/aggregate) + persistent `bench_runs` storage — a wrapper around the existing pipeline, not a rewrite of it.

## References

- Efron & Tibshirani (1993). *An Introduction to the Bootstrap.*
- Wilson (1927). *Probable inference, the law of succession, and statistical inference.*
- McNemar (1947). *Note on the sampling error of the difference between correlated proportions or percentages.*
- pgvector — https://github.com/pgvector/pgvector
- Vercel AI SDK · `generateText` / `stopWhen` — https://sdk.vercel.ai/
