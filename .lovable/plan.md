
## Findings (verified against the live DB and repo)

**1. Can the N1K corpus alone in the Experiments Panel replace the gold n=56 for KG construction training/test?**

No — and the code already enforces this by design (two-corpus model):

- `bench_cases` currently holds **166 rows** (not 1,000 yet): 50 CISA KEV, 50 MITRE ATT&CK groups, 30 Cisco PSIRT, 30 MSRC, 6 JPCERT. `bench_runs` is empty — no batch has been executed yet.
- `bench_cases` rows carry **no gold triples / no gold hyperedges**. The KG-Bench scorers in `src/lib/kg-bench/scorers.ts` compute Precision / Recall / F1 by comparing extractor output against the gold set in `src/lib/test-corpus.ts` (n=56). Without gold labels, N1K can only measure **throughput, latency, token cost, and coverage** — not extraction accuracy.
- The pipeline is zero-shot (no fine-tuning), so "training" here means prompt/rule engineering + rule-mining candidates (C3), not gradient training. N1K feeds C3 rule mining and stress-tests the pipeline; it does **not** substitute for the labeled evaluation set.

Correct division of labor:
- **Gold n=56** → accuracy scoring (F1, McNemar, Wilson CI), regression gate.
- **N1K (target 1,000, live 166)** → scale / cost / latency / rule-mining signal, and demo persistence.

**2. Is there already a report on the N1K corpus (sources, types, correlation, usage)?**

Partial, spread across three docs — none is a single "dataset card" with the *actually ingested* numbers:

| Report | What it covers | Gap |
|---|---|---|
| `n1000-ingest-runbook.md` | Operator workflow, attribution model, Appendix A two-corpus note | No per-feed counts, no stratum breakdown of live data |
| `issue3-n1000-impact-analysis.md` | Compute-cost projection at N=1,000 | Projection only; not a dataset description |
| `issue3-corpus-scaleup-feasibility.md` | Source-tier feasibility (CISA/MITRE/PSIRT/JPCERT/CNCERT) | Pre-ingest planning, no live counts |
| `corpus-expansion-and-statistics.md` | Gold n=56 stratification & stats layer | Explicitly about the gold set, not N1K |

No document currently states: what is *in* `bench_cases` today, per-feed license/publisher, how each stratum correlates to the gold-56 strata, and which downstream module consumes which slice.

## Plan

### 1. New report: `public/reports/n1000-corpus-dataset-card.md`

A single dataset card for the N1K corpus with live numbers. Sections:

- **Snapshot** — live counts from `bench_cases` (currently 166 / target 1,000), progress bar per feed toward the Tier-3 mix in `issue3-corpus-scaleup-feasibility.md`.
- **Sources & attribution table** — per feed: publisher, license, URL pattern, adapter file (`corpus-ingest-cisa-kev`, `corpus-ingest-mitre-groups`, `corpus-ingest-rss`), refresh cadence.
- **Type taxonomy** — map `stratum` values (`kev`, `apt-narrative`, `psirt`, `multilingual`, planned `ics-ot`, `adversarial`) to CTI content classes (exploit chain, actor narrative, vendor advisory, multilingual advisory, ICS/OT, hard negative).
- **Correlation to gold n=56** — table showing which gold-56 strata each N1K stratum stresses, and which it does *not* cover (so reviewers see the intentional separation).
- **Usage matrix** — which module consumes N1K: `bench-schedule` / `bench-worker` (batch runs), C3 rule-mining candidate generation, GraphRAG bootstrap corpus, throughput/latency measurement. Explicit callout that F1/P/R scoring is **not** on this path.
- **What N1K cannot replace** — the gold set; explains why and points to the two-corpus model in the runbook.
- **Refresh + reproducibility** — how to re-ingest, dedup key (`source_feed,source_url`), and how to snapshot a run.

Registered in `public/reports/manifest.json` so it ships in the ReportDownloads ZIP.

### 2. GUI clarification (Experiments → Corpus N1K tab)

In `src/components/CorpusIngestPanel.tsx`, add a short info banner at the top:

> "N1K measures scale, latency, cost, and rule-mining signal. Accuracy scoring (F1, McNemar) stays on the gold n=56 set — the two corpora are complementary, not interchangeable."

Link the banner to the new dataset card and to Appendix A of the runbook.

### 3. Cross-links

- Append a "See also" pointer to the new dataset card in `n1000-ingest-runbook.md`, `issue3-n1000-impact-analysis.md`, and `corpus-expansion-and-statistics.md`.

### Out of scope for this plan
- Actually ingesting the remaining ~834 rows to reach N=1,000 (operator action via the existing Fetch buttons).
- Adding gold labels to N1K rows (would be a separate annotation project — see feasibility memo §Annotation cost).
