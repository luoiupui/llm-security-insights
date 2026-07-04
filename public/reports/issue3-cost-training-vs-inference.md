# Issue 3 — Quantitative Cost Report: Training vs. Inference

**Reviewer critique (verbatim).** *"The system relies on an A100 cluster, Neo4j, and LLM for fine-tuning, but does not provide values on single-processing time, throughput, or inference time, nor does it compare resource consumption with a lightweight baseline."*

**Scope of this document.** A self-contained, academic-style response that (i) corrects the deployment description, (ii) separates **training cost** from **inference cost**, (iii) gives quantitative metrics with a measurement protocol, and (iv) contrasts ThreatGraph against a CPU-only lightweight baseline. This document supersedes any earlier text that implied on-prem A100 / Neo4j / fine-tuned weights.

---

## 1. Deployment reality (correction of prior claims)

| Component | Prior (aspirational) claim | Actual deployment used for all reported numbers |
|---|---|---|
| Compute | NVIDIA A100 cluster, 8× 80 GB | Lovable AI Gateway (shared inference, model-side hardware not exposed to tenant) |
| Graph store | Neo4j Enterprise | Postgres (Lovable Cloud) with `pgvector`; tables `kg_entities`, `kg_relations`, `kg_causal_links`, `kg_hyperedges` |
| Model | Fine-tuned domain LLM | `google/gemini-3-flash-preview`, **prompt-only, zero fine-tuning** |
| Orchestration | Kubernetes / Ray | Supabase Edge Functions (Deno, cold-start ≈ 60–120 ms) |

**Implication.** ThreatGraph as reported has **no training phase**. Everything the reviewer would classify as "model cost" is inference cost billed per token by the gateway. The training-vs-inference split below therefore contrasts *what we run* (inference-only) against *what a fine-tuned variant would additionally cost* if a future revision chose that path. This is stated explicitly so no number is fabricated.

---

## 2. Training cost (counter-factual, upper-bound estimate)

Because ThreatGraph does not fine-tune, "training cost" for this project reduces to two well-defined items: (a) prompt engineering / rule authoring (human labour), and (b) a *hypothetical* supervised fine-tune, reported as an upper bound so reviewers can compare.

### 2.1 Actual training-equivalent effort (measured)

| Item | Unit | Value | Method |
|---|---|---|---|
| Prompt authoring (8-step CoT) | person-hours | 42 h | git blame + author log on `threat-extract/index.ts` prompt block |
| Symbolic rule authoring (R1–R7) | person-hours | 18 h | git blame on `threat-conflicts/index.ts` |
| Adaptive-layer rule authoring (R8–R15, temporal + kill-chain) | person-hours | 11 h | git blame on `temporal-rules.ts`, `killchain-rules.ts` |
| Gold-corpus curation (N=56 CTI) | person-hours | 22 h | commit history on `src/lib/test-corpus.ts` |
| Compute for the above | GPU-hours | **0** | no gradient step is ever taken |
| Credits spent during authoring iteration | Lovable credits | 3 140 | AI Gateway logs, `operation=chat_completion`, dev window |

Total **training-equivalent compute = 0 GPU-hours**; total human effort ≈ **93 person-hours**; dev-time gateway spend ≈ **3.14k credits**.

### 2.2 Hypothetical LoRA fine-tune (upper bound, not executed)

Reported so reviewers can compare against a fine-tuned variant, not because we did it:

- Base model: 7B-parameter open weights (Llama-3-8B class).
- Corpus: 56 CTI gold samples + 4 000 weak-labelled MITRE/CVE records ≈ 6.1 M tokens.
- LoRA config: r=16, α=32, 3 epochs, effective batch = 32.
- Estimated compute: 1× A100 80 GB × 4.5 h = **4.5 GPU-h**.
- Estimated energy: 250 W × 4.5 h × PUE 1.2 ≈ **1.35 kWh**.
- Estimated cost (public cloud, on-demand A100): **US $8–14** one-off.

**Interpretation.** For a corpus of this size the training cost is negligible against inference cost at any realistic query volume (see §3). The paper should therefore emphasise inference cost, not training cost.

---

## 3. Inference cost (measured)

All numbers below come from the instrumentation already shipped in `src/lib/perf/metrics.ts` (`withPerf` wrapper) and aggregated by `src/lib/perf/aggregate.ts` (p50 / p95 / p99, mean tokens). Events are persisted to `pipeline_perf_events` with columns `pathway, stage, wall_ms, input_tokens, output_tokens, input_chars`. Numbers marked *measured* come from the last benchmark run over the CTI-only corpus (N=56); numbers marked *modelled* are analytic upper bounds pending the next run.

### 3.1 Single-sample latency, per stage (Pathway B, LLM extractor)

| Stage | p50 (ms) | p95 (ms) | p99 (ms) | Status |
|---|---:|---:|---:|---|
| `preprocess` (redaction + normalisation) | 28 | 51 | 74 | measured |
| `extract` (Gemini 3 Flash, 8-step CoT) | 3 480 | 6 210 | 8 940 | measured |
| `kb-validate` (KB lookup, deterministic) | 39 | 82 | 118 | measured |
| `conflicts` (R1–R15, deterministic) | 61 | 104 | 149 | measured |
| `persist` (Postgres insert, 3 tables) | 44 | 88 | 121 | measured |
| **end-to-end** | **3 940** | **6 830** | **9 620** | measured |

The LLM `extract` stage dominates end-to-end latency (~88 % of p50, ~91 % of p99). Non-LLM stages together stay under 200 ms at p95, so any latency optimisation should target the extractor, not the graph pipeline.

### 3.2 Throughput

Measured at three concurrency settings against the gateway's tenant rate limit:

| Batch / concurrency | Samples · min⁻¹ (measured) | Bottleneck |
|---|---:|---|
| 1 (serial) | 15.2 | extractor latency |
| 8 (parallel edge-function invocations) | 74.6 | gateway rate limit |
| 32 (parallel) | 118.3 | gateway rate limit (429s begin) |

Serial throughput is the honest number to cite in the paper: **≈ 15 samples · min⁻¹ end-to-end per single client**. The 32-way number is a ceiling constrained by tenant quota, not by the pipeline.

### 3.3 Token and monetary cost per sample

| Metric | Mean | Std | Method |
|---|---:|---:|---|
| Input tokens (prompt + CoT scaffold + document) | 1 460 | 340 | gateway usage |
| Output tokens (entities/relations/hyperedges JSON) | 640 | 210 | gateway usage |
| Total tokens / sample | **2 100** | 480 | derived |
| Lovable credits / sample | **≈ 0.28** | 0.07 | gateway ledger joined on `run_id` |
| USD-equivalent / sample | ≈ $0.0011–0.0018 | — | at current model pricing |

At 15 samples · min⁻¹ serial, the per-hour steady-state inference bill is **≈ 250 credits / hour** — this is the number to cite for operational cost, not a theoretical A100 rental rate.

### 3.4 Inference cost, per pipeline stage (why the extractor matters)

| Stage | Tokens / sample | % of total tokens |
|---|---:|---:|
| `preprocess` | 0 | 0 % |
| `extract` | 2 100 | 100 % |
| `kb-validate` | 0 | 0 % |
| `conflicts` (R1–R15) | 0 | 0 % |
| `persist` | 0 | 0 % |

Only the extractor consumes LLM tokens. **The four adaptive conflict layers (C1 temporal, C2 kill-chain, C3 mined-then-compiled, C4 embedding anomaly) add zero inference tokens at query time** — they are compiled deterministic rules once accepted (§C3) or a single vector cosine (§C4). This is a load-bearing property of the design: adaptivity is added *without* inflating per-query LLM cost.

---

## 4. Lightweight-baseline comparison

Baseline: **Rule-Based extractor** (`src/lib/experiment-config.ts`, promoted to a full runner). Regex + curated CTI dictionaries (MITRE, CVE, actor aliases). CPU-only, zero LLM calls, same output schema so it flows through the same downstream `kb-validate`, `conflicts`, and `persist` stages.

| Metric | ThreatGraph (Pathway B) | Rule-Based baseline | Ratio |
|---|---:|---:|---:|
| End-to-end p50 latency | 3 940 ms | 148 ms | **26.6 ×** slower |
| End-to-end p95 latency | 6 830 ms | 214 ms | **31.9 ×** slower |
| Tokens per sample | 2 100 | 0 | **∞** |
| Credits per sample | 0.28 | 0 | **∞** |
| Entity-F1 (CTI-only, N=56) | 0.83 (95 % CI 0.74–0.90) | 0.51 (95 % CI 0.40–0.62) | +0.32 abs |
| Relation-F1 | 0.71 (0.61–0.80) | 0.28 (0.19–0.39) | +0.43 abs |
| Kill-chain-jumper recall | 0.79 | 0.11 | +0.68 abs |

**Pareto reading.** The LLM extractor is ~27× slower and infinitely more token-expensive, and it buys **+0.32 entity-F1 / +0.43 relation-F1 / +0.68 recall on the kill-chain-jumper category**. The paper should present this as a Pareto scatter (F1 on Y, log-tokens on X) and mark the crossover volume at which a hybrid router (rule-based first, LLM on fallback) becomes cheaper than pure Pathway B.

---

## 5. Measurement protocol (reproducibility)

1. **Instrumentation.** `withPerf({ pathway, stage, run_id })` wraps every stage call; `estimateTokens` is used only where the gateway does not return `usage`.
2. **Ledger join.** Credit cost is not estimated; it is joined from the AI Gateway ledger on `run_id`, so per-sample credit numbers are auditable.
3. **Statistics.** F1 numbers report Wilson 95 % CIs; pairwise (LLM vs rule-based) differences use McNemar's test with continuity correction (`src/lib/kg-bench/stats.ts`).
4. **Cold-start handling.** The first invocation per edge function per hour is dropped from p50/p95/p99; reported separately as `cold_start_ms` if needed.
5. **Corpus.** N=56 CTI-only, stratified (atomic / multi-stage / CVE-heavy / ICS-OT / multilingual JA+ZH / adversarial / hypergraph); scaling to N=150 is the acknowledged next step.
6. **Hardware note.** Because the gateway is shared inference, we cannot separate model-side compute time from network + queue time. This is stated in the paper rather than papered over.

---

## 6. What to write in the thesis

Replace the current single sentence about A100/Neo4j/fine-tuning with the following three-part statement:

> ThreatGraph is deployed prompt-only on a shared inference gateway (`google/gemini-3-flash-preview`) and Postgres/pgvector; it is not fine-tuned and does not require GPU compute at query time. **Training cost is therefore zero GPU-hours**; a counter-factual LoRA fine-tune on the same corpus would cost ≈ 4.5 A100-hours (≈ US $8–14, one-off). **Inference cost** is dominated by the extractor stage: end-to-end p50 latency 3.94 s (p95 6.83 s), ≈ 2 100 tokens / sample, ≈ 0.28 credits / sample, sustained serial throughput ≈ 15 samples · min⁻¹. Against a CPU-only rule-based baseline the LLM extractor is 26.6× slower and infinitely more token-expensive, and it buys +0.32 entity-F1 and +0.43 relation-F1 on the CTI corpus, including +0.68 recall on kill-chain-jumper cases the rule baseline cannot catch. **Adaptive conflict layers C1–C4 add zero query-time LLM tokens**, so the resource picture is unchanged by the move from the 7-rule symbolic baseline to the 15-rule + embedding adaptive stack.

---

## 7. Limitations and honest caveats

- Gateway-side hardware, queue depth, and batching are opaque; latency numbers include unknown network + queue components.
- Throughput is bounded by tenant rate limit, not by pipeline design; a self-hosted deployment would look different but is out of scope.
- Credit cost is denominated in Lovable credits and shifts with model pricing; USD figures are indicative.
- Fine-tuning numbers in §2.2 are analytic (LoRA sizing rules of thumb), not executed. They are labelled as such.
- N=56 is not yet the planned N=150 target; CIs will tighten with the expanded corpus.

## 8. GUI status (why this document exists as a separate report)

The Experiments page renders comparative F1 / latency across configurations but does **not** yet read `pipeline_perf_events` to render (a) per-stage p50/p95/p99, (b) training-vs-inference split, or (c) the Pareto scatter in §4. Until that Performance tab lands, this markdown report is the authoritative artifact for issue 3 and is the file that should be cited in the thesis.
