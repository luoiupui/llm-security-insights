
# Address the three reviewer critiques

Three parallel workstreams, each landing in code + a short academic-style report so the thesis can cite concrete numbers and mechanisms.

## 1. Expand the evaluation corpus (30 → ~150 cases + bootstrap CIs)

Goal: replace "N=30 hand-curated" with a stratified corpus large enough for confidence intervals.

- **Grow gold corpus** in `src/lib/test-corpus.ts` from 30 → **120–150 samples**, stratified:
  - 40 CTI atomic (MITRE ATT&CK anchored)
  - 30 CTI multi-stage / kill-chain (STIX/TAXII, CISA KEV)
  - 20 CVE-heavy (NVD 2023–2024)
  - 30 Clinical (ICD-10/RxCUI/LOINC), incl. 10 JA + 10 ZH multilingual
  - 15 hard-negative / adversarial (hallucination bait, contradiction, temporal drift)
  - 15 hypergraph / n-ary events (feeds Cat `fusion_corroboration` + hyperedge scorer)
- **Statistical reliability layer** in `src/lib/kg-bench/`:
  - New `stats.ts`: `bootstrapCI(scores, B=1000, α=0.05)`, `mcnemarTest(sysA, sysB)`, `wilsonInterval(p, n)`.
  - Runner emits per-category F1 **with 95% CI** and pairwise significance (Ours vs LLM-Zeroshot, Ours vs Rule-Based).
  - Add `k`-fold (k=5) stratified split option so numbers aren't a single point estimate.
- **UI**: extend `KGBenchPanel.tsx` — show `F1 ± CI`, "n=" per stratum, and a significance badge on the pairwise deltas.
- **Report**: `public/reports/corpus-expansion-and-statistics.md` — sampling protocol, stratum table, inter-annotator note, bootstrap methodology, and the new headline numbers vs the old N=30 result.

## 2. Adaptive conflict detection (beyond hand-written rules)

Diagnosis first, then layered fix. Keeps the current 7 symbolic rules (they are the reproducible baseline) and adds three adaptive layers on top.

- **Coverage audit** — script `scripts/audit-conflict-coverage.mjs` that reads every rule in `supabase/functions/threat-conflicts/index.ts` + `src/lib/conflicts/*.ts` and maps it to a taxonomy (temporal, causal, ontological, provenance, cross-modal). Output: `public/reports/conflict-rule-coverage-matrix.md` — explicitly lists uncovered classes (time drift across reports, multi-stage jumper, actor alias flip, TTP-chain shortcut).
- **Layer C1 — Temporal-drift rule set** (`src/lib/conflicts/temporal-rules.ts`): sliding-window checks on `kg_causal_links.observed_at`, out-of-order `enables → leads_to → triggers`, and campaign-timeline monotonicity. Deterministic, ships as rules 8–12.
- **Layer C2 — Multi-stage / kill-chain graph rule** (`src/lib/conflicts/killchain-rules.ts`): pattern match over `graph_native` for kill-chain jumpers (e.g., `initial_access → impact` with no intermediate stage) and cyclic causality.
- **Layer C3 — LLM rule-proposal loop** (`supabase/functions/threat-conflicts-mine/index.ts`, new): given a batch of recent `monitoring_events` + validated extractions, Gemini proposes candidate rules in a constrained JSON schema (`when` pattern, `then` violation, `rationale`, `confidence`). Proposals land in a new table `kg_conflict_rule_candidates` (status: `proposed | accepted | rejected`) — human-in-the-loop via a small panel on `KGConstruction.tsx`. Accepted rules are compiled into `src/lib/conflicts/mined-rules.generated.ts` on next build.
- **Layer C4 — Embedding-based anomaly flag**: cosine distance between a new extraction's edge-set and the historical distribution in `kg_relations`; flags "novel-but-plausible" patterns for review instead of hard-failing. Runs inside `threat-conflicts`.
- **KG-Bench**: new category `conflict_adaptivity` with 12 gold cases covering time drift + multi-stage jumpers. Bumps `GOLD_VERSION` v2 → v3 (per `pipeline-stage-contracts` cardinal rule).
- **Report**: `public/reports/conflict-detection-adaptive.md` — rule taxonomy, coverage matrix before/after, C3 mining protocol, and how new threats enter the rulebase (proposal → review → accept → compile).

## 3. Quantitative performance metrics + lightweight baseline

Fills the "no numbers on latency / throughput / cost" gap and adds a real lightweight baseline for resource comparison.

- **Perf instrumentation** (`src/lib/perf/metrics.ts`, new):
  - Wraps every Pathway B stage with `performance.now()` → records `stage`, `wall_ms`, `input_tokens`, `output_tokens`, `input_chars`.
  - Persists to a new table `pipeline_perf_events` (append-only, service-role write, public-read RLS matching `monitoring_events`).
- **Aggregation queries** (`src/lib/perf/aggregate.ts`): p50 / p95 / p99 latency per stage, end-to-end latency, throughput (samples/min), tokens/sec, cost per sample (using AI Gateway `credits` column already exposed).
- **Lightweight baseline**: promote the existing deterministic **Rule-Based** extractor in `src/lib/experiment-config.ts` to a full pipeline runner (`src/lib/baselines/rule-based-runner.ts`) that emits the same perf events — gives a real CPU-only, no-LLM reference for the resource-consumption table.
- **Reporting page**: new tab **Performance** in `src/pages/Experiments.tsx` — table + bar charts of:
  - Latency (p50/p95/p99) per stage, per pathway, per baseline
  - Throughput (samples/min) at batch sizes 1, 8, 32
  - LLM tokens & Lovable-credit cost per sample
  - Resource ratio: Ours vs Rule-Based (× slower, × more tokens, × more cost)
- **Report**: `public/reports/performance-and-resource-report.md` — measurement protocol (hardware note: Lovable AI Gateway shared inference, not a local A100 — this is corrected honestly in the doc), tables with mean ± std, and a discussion of when the extra cost is justified by F1 gains from §1.

### Technical details

- All three workstreams share the same corpus expansion (§1) so §2 and §3 numbers are computed on the same 150-sample stratified set → reviewers get consistent N across all tables.
- Migrations needed:
  - `pipeline_perf_events` (service_role write, authenticated read, anon read for public demo — matches `monitoring_events` policy).
  - `kg_conflict_rule_candidates` (service_role write, authenticated read).
  - Both include `GRANT` blocks per project rule.
- `GOLD_VERSION` bump v2 → v3 with a one-line changelog in `src/lib/kg-bench/corpus.ts`.
- No change to Pathway B stage response shapes → `pipeline-stage-contracts` cardinal rule respected; perf events are a side-channel via `performance.now()`, not a new field in stage outputs.
- Pathway A (agent loop) is instrumented for perf only; still excluded from KG-Bench scoring per `agent-harness` memory.

### Deliverables checklist

- Code: expanded corpus, `stats.ts`, `temporal-rules.ts`, `killchain-rules.ts`, `threat-conflicts-mine` function, `mined-rules.generated.ts`, `perf/metrics.ts`, `perf/aggregate.ts`, `rule-based-runner.ts`, Performance tab.
- DB: 2 migrations with GRANTs + RLS.
- Bench: `GOLD_VERSION` v3, new category `conflict_adaptivity`, CI + significance in output.
- Docs: three new reports under `public/reports/` (corpus, conflict adaptivity, performance).

### Out of scope (intentionally)

- Fine-tuning the Gemini backbone (violates reproducibility per `agent-harness`).
- Standing up a local A100 / Neo4j cluster — the report will explicitly reframe the deployment as Lovable AI Gateway + Supabase, and cite gateway-measured numbers rather than fabricate on-prem metrics.
- Full inter-annotator agreement study (Cohen's κ): documented as future work; corpus expansion §1 is single-annotator with a spot-check protocol.
