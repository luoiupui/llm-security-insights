## Why the "Test Corpus (n=56)" dropdown does not reflect N=1,000

They are **two different data stores that were never wired together** — this is expected, not a bug, but the label should say so.

### Two corpora, two purposes

| # | Store | Where it lives | Count | Purpose |
|---|---|---|---|---|
| 1 | **Curated eval corpus** | `src/lib/test-corpus.ts` (bundled TS array) | **56 CTI cases** | Hand-picked fixtures with expected entities/relations. Used by KG-Bench scorers (Precision/Recall/F1) and by the KG Construction dropdown so you can one-click paste a known input. Ships in the JS bundle. |
| 2 | **N1K ingest corpus** | `bench_cases` table (Lovable Cloud DB), populated by `corpus-ingest-cisa-kev` / `mitre-groups` / `rss` | up to **N≥1,000** | Bulk documents with source attribution for large-scale Pathway B/C runs orchestrated by `bench-schedule` → `bench-worker` → `bench-runs`. No gold labels; used for throughput, cost, and aggregate metrics — not F1. |

The KG Construction "KG Input Source" panel only reads store #1 (the bundled TS array), which is why it still shows n=56. Store #2 is consumed by the **Corpus Ingest** tab on the Experiments page (fan-out runner), not by the paste-and-extract panel.

### So no — the sequence you asked about is not the right next step for this

"Extract, Validate & Persist to KG" → "Refresh KB" → "Bootstrap GraphRAG Corpus" operates on **one document at a time** from the paste box or a single dropdown selection. Clicking it 1,000 times to touch the N1K set is not the intended path. It also would not surface the N1K cases in the dropdown, because the dropdown never queries `bench_cases`.

### What the plan proposes (documentation-only, no code changes)

Since this is plan mode and the user asked for an explanation + next-step guidance, the plan is purely to align the UI and docs so the split is obvious. Implementation happens after approval.

1. **Clarify the dropdown label** in `src/pages/KGConstruction.tsx`
   - Rename "Test Corpus (n=56)" → **"Curated eval corpus (n=56, gold-labelled)"**.
   - Add a one-line helper under it: *"For N≥1,000 ingested cases, use Experiments → Corpus Ingest → Run batch."*
   - Add a small "View N1K batch" link that deep-links to `/experiments#corpus-ingest`.

2. **Cross-link from the Corpus Ingest panel back to KG Construction** for single-case inspection: each `bench_cases` row gets a "Send to KG Construction" action that pastes `raw_text` into the input box.

3. **Correct next-step recipe** (added as a callout box on KG Construction):
   - *Single-case inspection / demo / gold-labelled scoring:* stay on this page → pick from the curated dropdown OR paste text → **Extract, Validate & Persist to KG** → optionally **Refresh KB** → optionally **Bootstrap GraphRAG Corpus**. This is the right sequence — but it is per-document.
   - *N=1,000 batch run:* go to **Experiments → Corpus Ingest** → (a) click each ingest source button to populate `bench_cases`, (b) **Schedule batch** (fan-out to `bench_runs`), (c) **Run workers** (concurrency-limited), (d) **Aggregate** (writes metrics). This is the path that actually exercises Pathway B/C at N=1,000.

4. **Update `public/reports/n1000-ingest-runbook.md`** with a "Two-corpus model" section stating the split explicitly, and update `implementation-roadmap.md` to mark the dropdown-labelling task.

### Answering the button question directly

- **Extract, Validate & Persist to KG** — yes, run this per case you want in the persisted KG. It writes entities/relations to `kg_*` tables, runs conflict rules, and updates credibility. Do it once per demo document; don't loop it manually over 1,000 rows — that's what `bench-worker` is for.
- **Refresh KB** — click after `kb-ingest` runs (MITRE ATT&CK + CISA KEV) or after you notice Layer A validation warnings about unknown IDs. Not tied to each extract.
- **Bootstrap GraphRAG Corpus** — click **once** after you have a meaningful KG persisted (say, ≥20 extracted documents), so subsequent runs get retrieval-augmented context. Re-run only when the KG has materially grown.

No files are edited in this plan step; approval turns the four items above into build-mode changes.