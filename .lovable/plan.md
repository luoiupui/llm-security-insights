
# Phase N1K — Scale the CTI corpus from 56 → 1,000 via public sources

Goal: bring the ThreatGraph corpus from N=56 to N≥1,000 by ingesting real public CTI documents, with every case carrying an auditable **source citation** (feed, URL, publisher, retrieval date, license), and drive extraction through a **fan-out / worker / reduce** runner controllable from the GUI.

Scope: CTI-only. Clinical mode untouched. Pipeline stages (Pathway B) untouched — this phase adds an ingestion + orchestration layer *around* them.

---

## 1. Public sources (each case's `source_ref` is mandatory, never inferred)

| Source | Feed | Volume target | Format | License note |
|---|---|---:|---|---|
| **CISA KEV** | `known_exploited_vulnerabilities.json` (already wired in `cisa-advisories-ingest`) | 300 | JSON | US-Gov public domain |
| **CISA ICS advisories** | RSS + HTML detail pages | 150 | HTML | US-Gov public domain |
| **MITRE ATT&CK Groups** | `enterprise-attack.json` `intrusion-set` narratives (already in `kb-ingest`) | 150 | STIX 2.1 | Apache-2.0 |
| **JPCERT/CC advisories** | `jpcert.or.jp/english/at/*.rss` | 120 | RSS+HTML | attribution required, stored in `source_ref.license` |
| **CNCERT/CC bulletins** | `cert.org.cn` weekly bulletins | 100 | HTML (ZH) | attribution required |
| **Vendor PSIRTs** (Cisco, Microsoft MSRC, Fortinet, Palo Alto, Ivanti) | vendor RSS feeds | 180 | RSS+HTML | vendor terms — quote-only |
| **Total** | | **≈1,000** | | |

Each source has a dedicated adapter in `supabase/functions/corpus-ingest-<src>/` that:
1. fetches the feed,
2. deduplicates against `bench_cases.source_url`,
3. normalizes into a common `IngestRecord` shape, and
4. inserts into a new `bench_cases` table (below).

---

## 2. New schema (migration)

```sql
-- one row per ingested public CTI document
create table public.bench_cases (
  id uuid primary key default gen_random_uuid(),
  source_feed text not null,             -- 'cisa_kev' | 'mitre_group' | 'jpcert' | ...
  source_url  text not null,             -- canonical URL
  publisher   text not null,             -- 'CISA' | 'JPCERT/CC' | 'Cisco PSIRT' | ...
  license     text not null,             -- 'US-Gov PD' | 'Apache-2.0' | 'vendor-quote-only'
  retrieved_at timestamptz not null default now(),
  language    text not null default 'en',
  stratum     text not null,             -- 'kev' | 'ics' | 'apt-narrative' | 'psirt' | 'multilingual'
  raw_text    text not null,
  title       text,
  metadata    jsonb not null default '{}'::jsonb,
  unique (source_feed, source_url)
);

-- one row per (case, pathway, run) — supports fan-out/worker/reduce
create table public.bench_runs (
  id uuid primary key default gen_random_uuid(),
  run_batch uuid not null,               -- groups a whole N=1000 sweep
  case_id   uuid not null references public.bench_cases(id) on delete cascade,
  pathway   text not null check (pathway in ('B','C')),
  status    text not null default 'queued' check (status in ('queued','running','done','error')),
  started_at timestamptz,
  finished_at timestamptz,
  metrics   jsonb,                        -- {precision,recall,f1,latency_ms,tokens_in,tokens_out}
  error     text
);
```
Both tables get GRANTs per the public-schema rule; RLS: public read, service-role write. `bench_cases` is append-only via edge function only.

---

## 3. Fan-out / worker / reduce runner

Three new edge functions, each a small wrapper around existing stages — **no pipeline changes**:

```text
POST /bench-schedule       (fan-out)
   ├─ inputs:  { batch_size, pathways: ["B"|"C"], strata?: [...] }
   ├─ actions: pick N cases from bench_cases, insert queued rows into bench_runs,
   │           enqueue in chunks of 20 via EdgeRuntime.waitUntil → bench-worker
   └─ output:  { run_batch, queued: N }

POST /bench-worker         (per-chunk, isolated 150s budget)
   ├─ picks 20 queued rows, calls existing threat-preprocess → extract → kb-validate
   │  → threat-conflicts → threat-kg-query (Pathway B) OR threat-extract-hyper (Pathway C)
   ├─ writes metrics + latency + token counts into bench_runs
   └─ emits monitoring_events for progress

POST /bench-aggregate      (reduce)
   ├─ groups by run_batch, pathway, stratum
   └─ returns aggregate P/R/F1, Wilson CIs (reuse src/lib/kg-bench/stats.ts),
      per-stratum breakdown, cost totals
```

Concurrency knob: `p-limit = 8` per worker to stay inside gateway rate limits. Checkpointing is implicit (state lives in `bench_runs`), so a killed worker resumes cleanly.

---

## 4. GUI — new panel on the Experiments page

New component `src/components/CorpusIngestPanel.tsx` (CTI-only, gated by `DomainContext`). Layout:

```text
┌─────────────────────────────────────────────────────────────┐
│  Corpus Ingest & Bench Runner            [CTI · Experiment] │
├─────────────────────────────────────────────────────────────┤
│  1. INGEST                                                  │
│     ┌───────────────┬──────────┬───────────┬─────────────┐  │
│     │ Source         │ In DB    │ Feed size │ Action      │  │
│     ├───────────────┼──────────┼───────────┼─────────────┤  │
│     │ CISA KEV       │ 87 / 300 │ 1,247     │ [Fetch 50]  │  │
│     │ JPCERT/CC      │  0 / 120 │   ~800    │ [Fetch 50]  │  │
│     │ CNCERT/CC      │  0 / 100 │   ~500    │ [Fetch 30]  │  │
│     │ MITRE Groups   │ 42 / 150 │   163     │ [Fetch all] │  │
│     │ Vendor PSIRTs  │  0 / 180 │   ~2,000  │ [Fetch 40]  │  │
│     └───────────────┴──────────┴───────────┴─────────────┘  │
│     Total: 129 / 1000                          ▓▓░░░░ 13%   │
├─────────────────────────────────────────────────────────────┤
│  2. RUN BENCH  (Pathway B ▣  Pathway C ▢)                   │
│     Sample: [ All | Stratified 200 | Custom __ ]            │
│     [Start Run]  → run_batch=b7f2…  · 172 queued            │
│                                                             │
│  3. LIVE STATUS (auto-refresh)                              │
│     queued 40  · running 8  · done 118  · error 6           │
│     ETA ~4 min · tokens 0.42 M · $ est. n/a (gateway)       │
│                                                             │
│  4. RESULTS                                                 │
│     Pathway B — F1 0.71 ± 0.03 (Wilson 95%)                 │
│     Per-stratum table · [Download JSON] [Download CSV]      │
├─────────────────────────────────────────────────────────────┤
│  Every case card shows: publisher · feed · URL · retrieved  │
│  · license — clickable to the original source.              │
└─────────────────────────────────────────────────────────────┘
```

Operation workflow (documented on the panel itself):

1. **Ingest** — click *Fetch N* per source; adapter runs in background, monitoring events stream into the existing Threat Feed.
2. **Verify** — dedup + attribution check runs automatically; any case missing `source_url` or `license` is rejected.
3. **Schedule** — pick pathway(s) and sample size, click *Start Run*. This calls `bench-schedule`.
4. **Watch** — the Live Status block polls `bench_runs` counts every 3 s.
5. **Aggregate** — when `queued+running = 0`, the panel calls `bench-aggregate` and renders the results block with per-stratum F1 + Wilson CI.
6. **Export** — download JSON/CSV of the full run for the paper appendix.

The existing `KG Construction` page also gets a small "Corpus source" badge under each dropdown entry showing `publisher · retrieved YYYY-MM-DD`, so a demo user always sees where a case came from.

---

## 5. Report updates

- **New**: `public/reports/n1000-ingest-runbook.md` — lists every source, adapter, license, dedup key, and the exact GUI workflow above (this doc is what reviewers cite).
- **Updated**: `public/reports/issue3-n1000-impact-analysis.md` §3.3 — mark "bench orchestration" and "persistent run store" as **implemented**, with links to `bench-schedule/worker/aggregate` and the `bench_runs` schema.
- **Updated**: `public/reports/implementation-roadmap.md` — add Phase N1K row (status: Beta once first 200 cases land, GA at ≥1,000).
- Add Mermaid figure `/mnt/documents/n1000_fanout_flow.mmd` illustrating schedule → worker×k → aggregate.

---

## 6. Deliverables & sequencing

1. Migration: `bench_cases` + `bench_runs` (+ GRANTs, RLS).
2. Edge functions: `corpus-ingest-cisa-kev` (refactor of existing), `-jpcert`, `-cncert`, `-mitre-groups`, `-psirt-rss`.
3. Edge functions: `bench-schedule`, `bench-worker`, `bench-aggregate`.
4. Frontend: `CorpusIngestPanel.tsx` mounted on `Experiments` page; source-badge tweak in `KGConstruction.tsx`.
5. Reports: runbook + roadmap + impact-analysis §3.3 update + mermaid.
6. Smoke run: fetch 50 KEV + 20 JPCERT, execute Pathway B, verify aggregated F1 lands with CI.

## 7. Explicitly *not* in this phase

- No changes to pipeline stages, prompts, or ontologies.
- No fine-tuning, no new backbone model.
- Human adjudication of silver labels is deferred to a follow-up "gold expansion" phase; N1K runs against the existing gold slice for scoring, with silver labels persisted for later review.
- Clinical corpus untouched.

Approve this plan and I'll ship it in the order listed.
