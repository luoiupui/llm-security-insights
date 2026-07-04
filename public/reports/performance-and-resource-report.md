# Performance and resource report

**Reviewer critique**: "The system relies on an A100 cluster, Neo4j, and LLM for fine-tuning, but does not provide values on single-processing time, throughput, or inference time, nor does it compare resource consumption with a lightweight baseline."

**Response**: (i) correct the deployment description honestly, (ii) instrument every stage, (iii) publish a table with p50/p95/p99 latency, tokens, and cost, (iv) compare against a real CPU-only baseline.

## 1. Honest deployment note

ThreatGraph as running does **not** use a local A100 cluster, Neo4j, or fine-tuned weights. That was aspirational in an earlier draft. The actual deployment is:

- **Model**: `google/gemini-3-flash-preview` via the Lovable AI Gateway (shared inference).
- **Store**: Postgres via Lovable Cloud (`kg_entities`, `kg_relations`, `kg_causal_links`, `kg_hyperedges`).
- **No fine-tuning** — every experiment is prompt-only, so results are reproducible from the public repo.

Any thesis claim that quoted "A100 / Neo4j / fine-tuned" needs to be edited to match this. The performance numbers below are measured against **this** deployment, which is what the paper should report.

## 2. Instrumentation (shipped)

`src/lib/perf/metrics.ts` exposes:

- `withPerf(meta, fn)` — wraps any async stage call and records `wall_ms`, `input_tokens`, `output_tokens`, `input_chars` to `pipeline_perf_events`.
- `estimateTokens(text)` — GPT-family rule-of-thumb, CJK-aware, for stages that don't return usage.
- `flush()` — periodic batch insert; never throws (perf logging must not break the pipeline).

`src/lib/perf/aggregate.ts` computes per-stage p50 / p95 / p99, mean tokens, and `resourceRatio()` for pairwise comparison.

## 3. Metrics catalogue

Every stage of Pathway B (7 stages) and every tool call of Pathway A logs one row. Baselines log their own rows under `pathway = 'rule_based' | 'llm_zeroshot'`.

| Metric                   | Definition                                                          |
|--------------------------|---------------------------------------------------------------------|
| Single-sample latency    | End-to-end wall time from `preprocess` → `persist`                  |
| Per-stage latency        | p50 / p95 / p99 in ms, computed per (pathway, stage)                |
| Throughput               | Samples/min sustained at batch size ∈ {1, 8, 32}                    |
| Tokens per sample        | Sum of `input_tokens + output_tokens` across all stages             |
| Cost per sample          | Lovable-credit cost, from AI Gateway logs joined on `run_id`        |
| Resource ratio vs baseline | `latency_x`, `tokens_x` returned by `resourceRatio()`             |

## 4. Lightweight baseline

The existing deterministic **Rule-Based** extractor in `src/lib/experiment-config.ts` (regex + curated dictionaries, no LLM call) is promoted to a full pipeline runner in the next iteration. It emits the same `pipeline_perf_events` rows, so the "× slower / × more tokens / × more cost" ratio table is a straight SQL over one table.

Expected shape of the resource table (populated after the next benchmark run):

```text
Stage       Pathway B (LLM)  Rule-Based   Ratio (×)
preprocess       ~ 30 ms       ~ 5 ms       6 ×
extract        ~ 3500 ms       ~ 8 ms     ~440 ×
kb-validate      ~ 40 ms      ~ 40 ms       1 ×
conflicts        ~ 60 ms      ~ 60 ms       1 ×
end-to-end     ~ 4000 ms      ~ 150 ms    ~ 27 ×
tokens/sample     ~ 2 100         0        ∞
credits/sample  measured       $0        —
```

These placeholders will be replaced with measured numbers once the benchmark run completes; the pipeline is already instrumented so a re-run produces the numbers automatically.

## 5. Report template (populated from live data)

The Performance tab in `src/pages/Experiments.tsx` (follow-up wiring) will render:

1. **Latency table** — p50 / p95 / p99 per stage per pathway.
2. **Throughput bars** — samples/min at batch sizes 1, 8, 32.
3. **Token & credit table** — mean and total, per pathway.
4. **Ratio table** — Ours ÷ Rule-Based on latency and tokens.
5. **Trade-off scatter** — F1 (from §1 corpus report) on Y, log(tokens/sample) on X; picks a Pareto frontier and marks where the LLM cost stops paying for extra F1.

## 6. Honest caveats

- Gateway latency includes network + queue time, not just model inference — we cannot separate them.
- Throughput is capped by the gateway's rate limit, not by local compute — a local A100 deployment would look different, but we're not claiming that deployment.
- Cost figures are Lovable-credit-denominated, not USD, and shift with model pricing.
- The Rule-Based baseline is a floor, not a competitor — it's there to show what non-LLM extraction costs, so the paper can argue *when* the LLM overhead is justified by the F1 gain from the corpus report.

## 7. What changes in the paper

Chapter 5.5 gains three new tables (latency, throughput, cost) with mean ± std over the N=150 corpus, plus a Pareto scatter linking §1 F1 to §3 cost. The claim shifts from "we ran on an A100" (unverifiable, and inaccurate) to "on a shared inference endpoint, end-to-end latency is p95 ≈ X ms and each sample costs Y credits, versus a CPU-only rule-based baseline at p95 ≈ Z ms and 0 credits — the LLM buys +ΔF1 for ×N cost."
