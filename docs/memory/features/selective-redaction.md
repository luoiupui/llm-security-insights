---
name: Selective Redaction
description: Simulation of open-domain selective redaction (§9 of general_whitepaper). Federated resolvers (Wikidata/GeoNames/LCSH stub-cached), symbolic non-downgrade guard, one-way masking. KG-Bench Cat 8 scorer. New Redaction Lab page.
type: feature
---
- **Page**: `src/pages/RedactionLab.tsx` (route `/redaction-lab`, sidebar "Security & Privacy" group).
- **Pipeline**: `src/lib/redaction/pipeline.ts` — Detect (regex) → Resolve (federated) → Adjudicate (LLM, opt-in) → Guard (non-downgrade) → Mask (one-way).
- **Policies (version-controlled)**: `public/policies/{clinical,cti,archive}.json`.
- **Federated resolvers**: `src/lib/redaction/resolvers/index.ts` with Wikidata + GeoNames + LCSH + Local adapters. Stub-cached against `fixtures/*.json` — no live HTTPS.
- **Symbolic guard**: `src/lib/redaction/guard.ts` — LLM adjudicator may ONLY upgrade severity (rank: generalize < pseudonymize < redact < redact_attribution < redact_document).
- **Mask**: one-way typed placeholders (`[PERSON-1]`, `[MRN-2]`). Mapping NOT persisted — irreversible by design.
- **LLM adjudicator**: `supabase/functions/redaction-adjudicate/index.ts` (gemini-3-flash-preview via Lovable AI Gateway). Opt-in via toggle.
- **Eval**: KG-Bench Category 8 (`scoreRedactionSpans` in `src/lib/kg-bench/scorers.ts`). Bench-Score-8 = 0.5·F1 + 0.3·utility − 0.2·over_redaction.
- **Corpus**: `src/lib/redaction/corpus/{clinical-phi,cti-tlp,archive,hard-negatives}.json` — synthetic, with gold sidecars.
- **Domain switch**: extended to `"cti" | "clinical" | "archive"`.

Out of scope (forward-port): live Wikidata/GeoNames HTTPS, reversible masking, editable policy DB + approval workflow, real archive corpus under DUA, MIA on redacted output.
