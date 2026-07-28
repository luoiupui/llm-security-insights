# N1K Ingest Runbook — Scaling the CTI Corpus to N ≥ 1,000

**Status**: Beta (ships 2026-07-18). Ships the ingest layer, the fan-out/worker/aggregate runner, and the GUI. Actual N depends on how many *Fetch* clicks the operator has run.

## 1. Public sources & attribution

Every row inserted into `public.bench_cases` carries **five mandatory attribution fields** — `source_feed`, `source_url`, `publisher`, `license`, `retrieved_at`. Cases missing any of these are refused by the adapter. The `(source_feed, source_url)` pair is the dedup key.

| Feed key        | Publisher            | License                | Stratum         | Target | Adapter                              |
|-----------------|----------------------|------------------------|-----------------|-------:|--------------------------------------|
| `cisa_kev`      | CISA                 | US-Gov Public Domain   | kev             |    300 | `corpus-ingest-cisa-kev`             |
| `mitre_attack`  | MITRE Corporation    | Apache-2.0             | apt-narrative   |    150 | `corpus-ingest-mitre-groups`         |
| `jpcert`        | JPCERT/CC            | attribution-required   | multilingual    |    120 | `corpus-ingest-rss` (feed_id)        |
| `cncert`        | CNCERT/CC            | attribution-required   | multilingual    |    100 | `corpus-ingest-rss` (feed_id)        |
| `cisco_psirt`   | Cisco PSIRT          | vendor-quote-only      | psirt           |     60 | `corpus-ingest-rss` (feed_id)        |
| `fortinet_psirt`| Fortinet PSIRT       | vendor-quote-only      | psirt           |     60 | `corpus-ingest-rss` (feed_id)        |
| `msrc`          | Microsoft MSRC       | vendor-quote-only      | psirt           |     60 | `corpus-ingest-rss` (feed_id)        |
| **Total**       |                      |                        |                 |  **850**+ |                                    |

Extra headroom of ~150 slots is intentional; MSRC, CNCERT, and some vendor feeds are behind CDN/anti-bot walls and may return partial results, so the ingestable ceiling is closer to 1,000 than 850.

## 2. Runner architecture — fan-out / worker / aggregate

Realises the sketch in `issue3-n1000-impact-analysis.md` §3.3.

```
POST /bench-schedule            (fan-out)
   ├─ selects N cases from bench_cases (optional stratum filter)
   ├─ inserts (case × pathway) rows into bench_runs with status='queued'
   └─ EdgeRuntime.waitUntil → dispatches bench-worker in chunks of 10

POST /bench-worker              (per-chunk, 150s isolated budget)
   ├─ claims up to 20 queued rows, sets status='running'
   ├─ runs threat-preprocess + threat-extract (B) OR
   │  threat-extract-hyper (C) at concurrency 4
   ├─ writes metrics {latency_ms, tokens_est, entities, relations} back
   └─ if queued rows remain, re-invokes itself (chained continuation)

POST /bench-aggregate           (reduce)
   └─ groups by pathway × stratum; returns counts, mean latency,
      token totals, entities/relations per doc
```

State lives entirely in `bench_runs` — killing a tab or a worker never loses progress. Concurrency is capped at 4 per worker + 10 workers-in-flight to stay inside gateway rate limits at ~1,000 cases.

## 3. GUI workflow (Experiments → *Corpus N1K* tab)

```
 ┌──────────────── Corpus Ingest & Bench Runner ────────────────┐
 │ 1 · Ingest                                                    │
 │   Source table with publisher · license · in-DB · target      │
 │   [Fetch 50] per row → corpus-ingest-<adapter>                │
 │   Total progress bar: X / 1000                                │
 │                                                                │
 │ 2 · Run bench                                                 │
 │   ☑ Pathway B  ☐ Pathway C   Sample: [50]  [Start run]        │
 │   → POST bench-schedule                                       │
 │                                                                │
 │ 3 · Live status  (polls bench_runs every 3 s)                 │
 │   Queued · Running · Done · Error                             │
 │                                                                │
 │ 4 · Aggregate results  (auto after queued+running = 0)        │
 │   Pathway B: done/error, mean latency, tokens, ent/doc, rel/doc│
 │   Per-stratum table                                           │
 │   [Download JSON]                                             │
 └────────────────────────────────────────────────────────────────┘
```

Six-step operator flow, mirrored in-panel:
1. **Ingest** — click *Fetch N* on each source row.
2. **Verify** — adapter rejects rows missing `source_url` / `license`; monitoring events go to the Threat Feed.
3. **Schedule** — pick pathway(s) + sample size, click *Start run*.
4. **Watch** — live status polls DB every 3 s.
5. **Aggregate** — auto-called when the batch drains.
6. **Export** — JSON for paper appendix.

## 4. Cost & scale expectations at N=1,000

Reproduces the projection from `issue3-n1000-impact-analysis.md` §2:

- Pathway B single-pass: ~1,000 LLM calls, ~6 M tokens, ~13 min at concurrency 4×10 workers ≈ 40 effective parallel calls (well under gateway rate limits).
- Full paper-grade matrix (B + C × 5-fold × 3 comparators) remains a follow-up phase; the runner is ready for it.

## 5. What N1K deliberately does *not* do

- Does not touch pipeline stages, prompts, or ontologies.
- Does not fine-tune any model.
- Does not adjudicate silver labels — scoring vs the N=56 gold slice is still done offline through `src/lib/kg-bench/runner.ts`.
- Does not ingest Clinical corpus (CTI-only per project charter).

## 6. File map

| Piece            | Path                                                             |
|------------------|------------------------------------------------------------------|
| Schema           | migration `bench_cases` + `bench_runs`                           |
| Adapter (KEV)    | `supabase/functions/corpus-ingest-cisa-kev/index.ts`             |
| Adapter (MITRE)  | `supabase/functions/corpus-ingest-mitre-groups/index.ts`         |
| Adapter (RSS)    | `supabase/functions/corpus-ingest-rss/index.ts` (JPCERT, CNCERT, PSIRTs) |
| Schedule (fan-out)| `supabase/functions/bench-schedule/index.ts`                    |
| Worker           | `supabase/functions/bench-worker/index.ts`                       |
| Aggregate (reduce)| `supabase/functions/bench-aggregate/index.ts`                   |
| GUI panel        | `src/components/CorpusIngestPanel.tsx` (Experiments → Corpus N1K)|
| Mermaid          | `/mnt/documents/n1000_fanout_flow.mmd`                           |

---

## Appendix A — Two-corpus model (why the KG Construction dropdown still shows n=56)

The project intentionally maintains **two disjoint corpora**. They are not merged, and the KG Construction "Curated corpus" dropdown never queries the N1K store.

| # | Store                       | Location                                   | Size    | Gold labels | Consumers                                                        |
|---|-----------------------------|--------------------------------------------|---------|-------------|------------------------------------------------------------------|
| 1 | **Curated eval corpus**     | `src/lib/test-corpus.ts` (bundled)         | n = 56  | Yes         | KG-Bench scorers (P/R/F1); KG Construction paste-dropdown        |
| 2 | **N1K ingest corpus**       | `bench_cases` table (Lovable Cloud DB)     | ≥ 1,000 | No          | `bench-schedule` → `bench-worker` → `bench-runs` → `bench-aggregate` |

### Which button sequence to use

- **Single-case demo / gold-scored run** (KG Construction page): pick from *Curated corpus* dropdown or paste text → **Extract, Validate & Persist to KG** → optionally **Refresh KB** (only after MITRE/KEV updates) → **Bootstrap GraphRAG Corpus** (once, after ≥20 cases persisted). Do NOT loop this manually across 1,000 rows.
- **N ≥ 1,000 batch run** (Experiments → Corpus Ingest): (1) click ingest source buttons to populate `bench_cases`, (2) **Schedule batch** to fan out into `bench_runs`, (3) **Run workers** with concurrency limit, (4) **Aggregate** to write metrics. This is the correct large-scale path.

### GUI change (build tag 2026-07-19)

- KG Construction dropdown label renamed from `Test corpus (n=56)` → `Curated corpus (n=56, gold)`.
- New **N1K batch (bench_cases)** tab added for single-case inspection of ingested cases, with a deep-link to Experiments → Corpus Ingest for the batch runner.
- Added a "Two-corpus model" callout above the action buttons so operators pick the right path.


**See also:** [`n1000-corpus-dataset-card.md`](n1000-corpus-dataset-card.md) — live counts, sources, taxonomy, correlation to gold n=56, usage matrix.
