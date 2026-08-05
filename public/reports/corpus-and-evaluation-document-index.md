# Corpus & Evaluation Document Index

**Purpose:** answer, in one place, *which document records the use of the N≥1,000 bench corpus* and *which records the gold-labelled N=56 corpus*, plus every other document in the project that deals with datasets, evaluation or experiments — with its usage and headline result.

**Date:** 2026-08-05 · **Scope:** CTI (Clinical is a separate simulation track)

---

## 0. The two-corpus model in one line

| Corpus | Labels | Size (shipped) | Legitimate use | Illegitimate use |
|---|---|---|---|---|
| **Gold-56** (`src/lib/test-corpus.ts`, `src/lib/kg-bench/corpus.ts`) | Yes (entities + triples + provenance) | 56 CTI docs, 7 strata, ~1,060 entities | Precision / Recall / **F1**, McNemar, Wilson 95 % CI, regression gate, prompt failure analysis | Not a training set — the model is frozen and zero-shot |
| **N1K bench corpus** (`public.bench_cases`, DB) | **No** | 166 rows ingested → 1,000 target | Throughput, p50/p95 latency, token cost, C3 rule-mining signal, GraphRAG bootstrap | **Cannot produce F1/accuracy** — no ground truth |

---

## 1. Documents that record **N≥1,000** usage (evaluation / experiment stage)

| Document | What it records | Key result |
|---|---|---|
| `n1000-corpus-dataset-card.md` | **Primary dataset card for N1K.** Sources (CISA KEV, MITRE Groups, RSS/PSIRT feeds), types, per-stratum counts, licence notes, the "gold vs N1K" capability matrix, SQL to regenerate the snapshot | 166 / 1,000 rows in `bench_cases` as of 2026-07-28; N1K explicitly barred from accuracy scoring |
| `issue3-n1000-impact-analysis.md` | Compute-cost and architecture impact of scaling 56 → 1,000 | ~18× cost: ~6.0 M tokens, ~2.2 h serial / ~13 min fanned-out; **no algorithm or architecture change required**; N=500 recommended as the paper-defensible target |
| `n1000-ingest-runbook.md` | Operator workflow for the N1K ingest (adapters, schedule → workers → aggregate, dedup, rate limits) | Step-by-step runbook; ingest is idempotent and append-only |
| `issue3-corpus-scaleup-feasibility.md` | Feasibility of Tier-1/2/3 (N=200 / 500 / 1,000) gold expansion | Annotation cost ~6 person-weeks single-annotator at N=1,000; Tier-2 (500) is the recommended stop |
| `gold56-influence-and-few-shot-feasibility.md` | Side-by-side influence analysis of the two corpora | N1K dominates scale/cost/rule-mining; contributes **zero** accuracy evidence |
| `corpus-expansion-and-statistics.md` | Expansion history 30 → 56 and the statistics layer | Statistical layer shipped (`bootstrapCI`, `wilsonInterval`, `mcnemarTest`, `stratifiedKFold`) |
| `experiments-academic-report.md` | Full experiment write-up; references the scale corpus for cost/latency sections | Latency p50 ≈ 3.94 s/doc; headline F1 still reported on gold only |
| `comprehensive-technical-report.md` | System-wide report; corpus chapter summarises both tracks | Narrative summary, no independent numbers |
| `hybrid-rule-governance-clarification.md` | C3 rule mining draws its candidate signal from the N1K volume | Mined rules enter at provenance weight 0.4, HITL-gated |
| `manifest.json` | Registry of downloadable reports incl. all N1K documents | — |

## 2. Documents that record **gold-label N=56** usage

| Document | What it records | Key result |
|---|---|---|
| `corpus-expansion-and-statistics.md` | **Primary record of the gold set.** Per-stratum composition of the 56, why the clinical stratum was dropped, CI reporting convention | Headline moves from `F1 = 0.930 (n=30)` to `F1 = 0.930 [CI] (n=56)`; ICS/OT (2) and multilingual (6) strata still thin |
| `gold56-influence-and-few-shot-feasibility.md` | Whether 56 gold cases can serve as few-shot exemplars / fine-tuning data | Feasible as **few-shot in-context** examples with stratified or retrieval-based selection; **not** feasible for fine-tuning or stable train/val/test splits |
| `issue3-comparative-scorecard.md` | Scorecard of ThreatGraph vs baselines on the gold set | ThreatGraph-adaptive 3.4 / 5 composite |
| `issue3-cost-training-vs-inference.md` | Separates training cost (zero) from inference cost, measured on the gold set | Training cost = 0 (frozen model); all spend is inference |
| `issue3-sota-benchmark-gap.md` | Gold-56 vs DNRTI/CASIE scale | 1–2 orders of magnitude scale gap; 43 capabilities mapped to maturity levels |
| `issue3-n1000-impact-analysis.md` | States the current shipped baseline explicitly | Every Chapter-5 number inherits from N=56; Wilson CI ±0.09 |
| `n1000-corpus-dataset-card.md` | Gold row of the capability matrix | Gold-56 is the sole source of F1 / McNemar / Wilson |
| `external-benchmarks-loader.md` | DNRTI / CASIE loader reported *alongside* gold-56 | Gold-56 stays the authoritative anchor and the only regression gate |
| `implementation-roadmap.md` | Roadmap items tied to gold-set growth | N=150 → 500 expansion tracked as follow-up |
| `adaptive-layers-clarification.md` | C1–C4 layers validated against gold cases | Rule false-positives traced to labelled examples |
| `zero-shot-attestation.md` | Attests Gold-56 and N1K are **evaluation-only**, never injected into prompts | Corpus-usage table with the exact modules that read each corpus |
| `experiments-academic-report.md` | Headline accuracy tables | F1 reported on n=56 with 95 % CI and McNemar annotations |

## 3. Other dataset / experiment / processing documents

| Document | Domain of concern |
|---|---|
| `hypergraph-pathway-technical-report.md` | Pathway C hyperedge extraction; 4 gold hypergraph cases; Cat 10 atomicity + Cat 11 explanation-cost metrics |
| `hypergraph-analysis-rationale-and-limits.md` | Failure modes of hyperedge extraction (over-grouping, quote drift) |
| `hypergraph-scope-and-maturity.md` | Quantitative maturity: KG 77 %, Hybrid HG+KG 66 % |
| `performance-and-resource-report.md` | Latency / memory / token instrumentation |
| `conflict-detection-adaptive.md` | Adaptive conflict-rule behaviour and validation cases |
| `conflict-rules-multimodal-extension.md` | R11–R13 multimodal rule set |
| `cti-multimodal-fusion.md`, `cti-multimodal-fusion-technical-report.md` | Flow/telemetry fusion inputs and corroboration scoring |
| `cti-flow-feature-ingest-spec.md` | CTI flow-feature ingest schema |
| `clinical-feature-ingest-spec.md` | Clinical simulation ingest (out of CTI scope) |
| `ontology-corroborated-finding-spec.md` | Corroborated-finding ontology used by fusion scoring |
| `technical-report.md`, `white-paper.md`, `general_whitepaper.md` | Narrative overviews incl. evaluation summaries |
| `repo-inventory.{json,csv}`, `llm-call-sites.{json,csv}`, `implementation-log.{json,csv}` | Machine-readable audit inventories (files, LLM call sites, change log) |
| `health-report.md` | Build / pipeline health snapshot |

## 4. Code locations (for auditors)

| Path | Role |
|---|---|
| `src/lib/test-corpus.ts`, `src/lib/kg-bench/corpus.ts` | The 56 gold cases |
| `src/lib/kg-bench/scorers.ts`, `stats.ts`, `runner.ts` | F1 / Wilson / McNemar / bench driver — gold-only |
| `src/lib/kg-bench/external-adapters.ts` | DNRTI / CASIE adapters (in-memory, informational) |
| `supabase/functions/corpus-ingest-*`, `bench-schedule|worker|aggregate` | N1K ingest and scale runs |
| `public.bench_cases`, `public.bench_runs` | N1K storage and run ledger |

## 5. Bottom line

- **N≥1,000 is recorded in:** `n1000-corpus-dataset-card.md` (authoritative), `issue3-n1000-impact-analysis.md`, `n1000-ingest-runbook.md`, `issue3-corpus-scaleup-feasibility.md`, plus supporting mentions in `gold56-influence-and-few-shot-feasibility.md`, `experiments-academic-report.md`, `comprehensive-technical-report.md`, `hybrid-rule-governance-clarification.md`.
- **Gold N=56 is recorded in:** `corpus-expansion-and-statistics.md` (authoritative), `gold56-influence-and-few-shot-feasibility.md`, `issue3-comparative-scorecard.md`, `issue3-cost-training-vs-inference.md`, `issue3-sota-benchmark-gap.md`, `zero-shot-attestation.md`, `external-benchmarks-loader.md`, `experiments-academic-report.md`.
- Only **Gold-56** yields accuracy numbers; **N1K** yields scale, cost and rule-mining signal. Neither is used for training — the model is frozen and zero-shot.
