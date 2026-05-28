---
mem_path: mem://features/clinical-feature-ingest
name: clinical-feature-ingest
description: T2 heart-sound feature-vector ingest contract for the Clinical KG branch — JSON Schema, FHIR mapping, PHI guard, KG-Bench hooks. Spec only; no runtime code yet.
type: feature
---

External DSP/ML systems can feed the Clinical KG with **T2 recording-level** feature vectors (no raw PCG, no PHI).

**Authoritative artifacts**
- Spec: `public/reports/clinical-feature-ingest-spec.md`
- JSON Schema (Draft 2020-12): `public/schemas/heart-sound-features.v1.schema.json`
- Example: `public/schemas/examples/heart-sound-features.example.json`

**Contract highlights**
- One JSON record per recording; NDJSON for batches; gzip allowed; 5 MB/record cap.
- Required blocks: `signal_meta`, `features` (HR, HRV, S1/S2 intervals, murmur energies + grade, MFCC[13], wavelet[6], SNR, quality), `provenance` (model id + semver, preprocessing chain, ISO-8601 timestamp), `text_view` (LLM-readable summary).
- `subject_ref` is opaque (regex enforced); MRN/SSN/email/name patterns rejected at ingest.
- Units: UCUM. Codes: LOINC for measurements, SNOMED-CT for findings, `threatgraph-clinical-local/1.0` for engineered features without a standard.
- FHIR R5 mapping: record → `DiagnosticReport`, each feature → `Observation`, arrays → `valueSampledData`.

**Pipeline position**
Sibling of `threat-preprocess` on the Clinical branch. Emits the standard Stage-1 shape (`cleaned_text` = `text_view`, `reliability_score` = `quality_score`, plus a `features` side channel). Stages 2–7 unchanged — respects `skill://pipeline-stage-contracts`.

**Out of scope (v1)**: T1 frame-level (Parquet/NPY), T3 embedding sidecars, inline DSP, streaming ingest, ontology extension, KG-Bench gold-case authoring (would require bumping `src/lib/kg-bench/corpus.ts` version).

**Implementation status:** spec only. No edge function, UI, or migration yet.
