# Implement Selective Redaction (Simulation)

Build the §9 architecture from `general_whitepaper.md` as a runnable simulation. No real PHI. All resolvers stub-cached (no live HTTPS). Policies as version-controlled JSON. New "Redaction Lab" page. KG-Bench gains Category 8.

## Defaults chosen (since questions skipped)
- **Scope**: Full simulation with stub adapters (~1300 LOC). Resolvers are real interfaces with cached JSON fixtures instead of live Wikidata/GeoNames — closer to white paper, no network flakiness.
- **Policy storage**: Static JSON in `public/policies/` — version-controlled in GitHub, no DB migration, hot-reload by redeploy. Matches the user's earlier preference for GitHub-tracked memory/docs.

## Deliverables

### 1. Datasets (in-repo, synthetic)
- `src/lib/redaction/corpus/clinical-phi.json` — 10 docs with Safe-Harbor PHI (names, MRNs, dates, zips), EN/JA/ZH
- `src/lib/redaction/corpus/cti-tlp.json` — 10 CTI snippets with TLP:RED/AMBER/GREEN markings
- `src/lib/redaction/corpus/archive.json` — 10 historical excerpts with synthetic living-relative / cultural / sealed-until overlays
- `src/lib/redaction/corpus/hard-negatives.json` — 5 docs that look sensitive but aren't (declassified CVEs, >100y-deceased figures)
- Each doc has a gold sidecar: `[{start, end, axis, rule_id, action}]`

### 2. Knowledge sources (cached JSON fixtures)
- `public/policies/clinical.json` — HIPAA Safe-Harbor 18 identifiers as policy rules
- `public/policies/cti.json` — TLP/FIRST classification rules
- `public/policies/archive.json` — death-date thresholds, cultural-sensitivity gazetteer stub
- `src/lib/redaction/resolvers/fixtures/wikidata.json` — pre-canned entity lookups (date_of_death, occupation)
- `src/lib/redaction/resolvers/fixtures/geonames.json` — pre-canned place lookups
- `src/lib/redaction/resolvers/fixtures/lcsh.json` — subject-heading stub

### 3. Software modules

| Path | Purpose | LOC |
|---|---|---|
| `src/lib/redaction/policy.ts` | Loader + Zod schema validator | 120 |
| `src/lib/redaction/resolvers/{wikidata,geonames,lcsh,local}.ts` | 4 adapters, common interface | 300 |
| `src/lib/redaction/cache.ts` | LRU cache wrapper | 80 |
| `src/lib/redaction/guard.ts` | Symbolic non-downgrade guard | 60 |
| `src/lib/redaction/mask.ts` | Typed placeholders (`[PERSON-7]`, `[DATE-REDACTED]`) | 100 |
| `src/lib/redaction/pipeline.ts` | Orchestrator: extract→resolve→adjudicate→guard→mask | 150 |
| `supabase/functions/redaction-adjudicate/index.ts` | LLM policy adjudicator via Lovable AI Gateway (`gemini-3-flash-preview`) | 150 |
| `src/lib/kg-bench/scorers.ts` (extend) + `corpus.ts` (extend) | KG-Bench Category 8: `0.5·F1 + 0.3·utility − 0.2·over_redaction` | 150 |
| `src/pages/RedactionLab.tsx` | Diff view (original ↔ masked), per-axis legend, policy trace, simulation banner | 250 |
| `src/components/AppSidebar.tsx` (extend) + `src/App.tsx` (route) | Nav entry | 20 |
| `src/lib/self-monitoring.ts` (extend) | `category="redaction"` events | 20 |
| `supabase/functions/threat-agent/index.ts` (extend) | New tool `propose_policy_entry` (Pathway A) | 50 |
| `src/contexts/DomainContext.tsx` (extend) | Add `"archive"` domain | 30 |

**Total: ~1480 LOC.**

### 4. UI flow (Redaction Lab page)
```text
┌──────────────────────────────────────────────────┐
│ [Domain: CTI ▾]  [Doc: select ▾]  [Run ▶]       │
├─────────────────────┬────────────────────────────┤
│  Original           │  Masked (one-way)          │
│  John Smith, MRN    │  [PERSON-1], [MRN-RED],    │
│  12345, born 1952…  │  born [DATE-REDACTED]…     │
├─────────────────────┴────────────────────────────┤
│ Axis legend: ■ PII  ■ Cultural  ■ Legal  ■ Sec  │
│ Policy trace: rule HIPAA-§164.514(b)(2)(i)(A)    │
│ Score: F1 0.92 · utility 0.81 · over-red 0.04    │
│ ⚠ Simulation only — no real PHI processed        │
└──────────────────────────────────────────────────┘
```

### 5. Evaluation
- KG-Bench Cat 8 added as 8th tab category in existing `KGBenchPanel`
- Skip-counter for utility tasks where gold answer falls inside a masked span
- Over-redaction baseline: run on `hard-negatives.json`, expect score → 0

### 6. Governance / safety
- Simulation banner on `RedactionLab` (matches `PrivacyFLLab` pattern)
- Symbolic guard rejects any adjudicator output that *downgrades* a rule-based mask
- All runs emit `monitoring_events` row with `category="redaction"`

## Documentation updates
- Append "Implementation Status" subsection to `public/reports/general_whitepaper.md` §9 (list shipped vs. forward-port)
- New memory file `mem://features/selective-redaction` + add to `mem://index.md`
- Mirror to `docs/memory/features/selective-redaction.md` for GitHub

## Out of scope (forward port)
- Live Wikidata/GeoNames HTTPS calls (stubbed)
- Reversible masking (one-way only, per earlier decision)
- Editable policy DB + approval workflow (static JSON for now)
- Real archive corpus under DUA
- MIA probe on redacted output

## Risks
- LLM adjudicator may over-redact on archive docs with sparse context → mitigated by symbolic guard *only allowing upgrades*, never blind LLM masking
- Stub resolver fixtures will diverge from real Wikidata over time → fixtures are explicitly dated and marked as test data
