# External Benchmarks Loader

**Status:** Scaffolded (loader + adapters + UI). No dataset is committed to this repo.

## Purpose

Wire the KG-construction pipeline to public CTI benchmarks (DNRTI, CASIE, or any
pre-normalised JSON) so that Precision / Recall / F1 can be reported **next to
the gold-56 numbers**, expanding the effective evaluated N without polluting
the training/mining path or the regression gate.

## Scope — what this does and does not

| Aspect | Loader | Gold-56 |
|---|---|---|
| Runs the full pipeline (Preprocess → Extract → Validate → Conflicts) | ✅ | ✅ |
| Scores with `scoreTriples` / `scoreEntityList` (P/R/F1) | ✅ | ✅ |
| Feeds the regression gate (`GOLD_VERSION` bumps) | ❌ | ✅ |
| Used for rule-mining candidate promotion (C3) | ❌ | ✅ |
| Data committed to repo | ❌ (operator supplies path) | ✅ (hand-curated) |
| Persisted to `bench_cases` / `bench_runs` | ❌ (in-memory only) | ❌ |

The loader is **informational**. The gold-56 remains the authoritative
accuracy anchor; external results are reported alongside it as
external-validity evidence.

## Files

- `src/lib/kg-bench/external-adapters.ts` — `parseExternal(format, raw, label)` for `generic | dnrti | casie`; `loadFromUrl` and `loadFromFile` helpers.
- `src/lib/kg-bench/runner.ts` — `runBenchOnCases(domain, cases, onProgress)` bypasses the bundled corpus.
- `src/components/ExternalBenchmarksPanel.tsx` — URL/upload UI, format picker, live progress, per-case table, aggregate P/R/F1.
- Mounted inside `src/components/KGBenchPanel.tsx` under the KG-Bench tab.

## Supported input shapes

### 1. `generic` — pre-normalised
```json
[
  {
    "id": "doc-001",
    "text": "APT29 used Cobalt Strike against a US energy firm.",
    "entities": ["APT29", "Cobalt Strike", "US energy firm"],
    "triples": [
      { "s": "APT29", "p": "uses",    "o": "Cobalt Strike" },
      { "s": "APT29", "p": "targets", "o": "US energy firm" }
    ]
  }
]
```

### 2. `dnrti` — DNRTI-style BIO NER
```json
[{ "id": "d1", "tokens": ["APT29", "used", "Cobalt", "Strike"],
   "tags":   ["B-ThreatActor", "O", "B-Tool", "I-Tool"] }]
```
Entity-only scoring (no gold triples).

### 3. `casie` — CASIE-style event frames
```json
[{
  "id": "c1",
  "text": "Attackers exfiltrated 40GB of source code.",
  "events": [{
    "trigger": { "text": "exfiltrated", "type": "DataBreach" },
    "arguments": [{ "role": "artifact", "text": "40GB of source code" }]
  }]
}]
```
Converted to `(trigger, role, arg)` triples.

## Operator workflow

1. Obtain the dataset locally (DNRTI: GitHub; CASIE: request from authors).
2. Convert to one of the supported shapes with a small script (or serve the
   original JSON if it already matches).
3. Drop the JSON under `public/external/` **locally** (this directory is not
   tracked) or upload via the file picker.
4. Open **Experiments → KG-Bench → External Benchmarks**, pick the format,
   Fetch or Upload, then **Run**.
5. Export results via the KG-Bench Markdown export or screenshot the
   per-case table for the thesis.

## Reporting pattern (recommended for the thesis)

> "Bench-Score on the curated gold-56 corpus is **X.X F1**. On the DNRTI
> public test split (N=Y) the same pipeline scores **Z.Z F1** without any
> retraining or prompt change, demonstrating that the gains generalise
> beyond the internal set."

## Limits

- Adapters are best-effort — DNRTI's fine-grained entity types are collapsed
  to entity strings; CASIE's argument roles become predicates verbatim.
  Full semantic alignment (mapping CASIE roles into the STIX/hyperedge
  ontology) is future work.
- No caching — each Run re-parses and re-executes; use a small subset
  (≤50 cases) for interactive sessions and export to `.md` for archival.
- The pipeline is zero-shot; low external-set F1 usually indicates the
  gold-56 prompt vocabulary does not cover a dataset's dialect. Fix by
  adding representative gold-56 cases, not by tuning to the external set.
