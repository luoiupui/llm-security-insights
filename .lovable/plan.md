# Heart-Sound Feature-Vector Ingest Spec (Clinical KG)

Deliverable: one new spec document, no code. Scope: T2 recording-level features uploaded from an external system (DSP/ML pipeline outside this project).

## Files to create

1. `public/reports/clinical-feature-ingest-spec.md` — the spec (primary deliverable, human-readable)
2. `public/schemas/heart-sound-features.v1.schema.json` — JSON Schema for validators
3. `public/schemas/examples/heart-sound-features.example.json` — one synthetic record
4. `docs/memory/features/clinical-feature-ingest.md` + index entry in `docs/memory/index.md`

No edits to runtime code, edge functions, ontology, or pipeline. The spec describes the contract; implementation is a follow-up.

## Spec contents (`clinical-feature-ingest-spec.md`)

1. **Purpose & scope** — why T2 features are valid intermediates for KG (de-identified, compact, reusable for classification + symbolic reasoning); explicit non-goals (no raw PCG handling, no inline DSP).
2. **Position in pipeline** — sibling of `threat-preprocess` on the Clinical branch; emits the same normalized "document" shape that `threat-extract` consumes, with a machine-readable `features` block and an auto-rendered `text_view` the LLM reads. Respects existing stage contracts from the `pipeline-stage-contracts` skill.
3. **Record schema (T2)** — one JSON object per recording:
   - `record_id`, `schema_version: "1.0"`
   - `subject_ref` (opaque pseudonym, never raw MRN), `encounter_ref`
   - `signal_meta`: `sampling_rate_hz`, `duration_s`, `channels`, `device_model`, `auscultation_site` (aortic/pulmonic/tricuspid/mitral/erb)
   - `features` (T2 aggregates): heart_rate_bpm, hrv_sdnn_ms, hrv_rmssd_ms, s1_s2_interval_ms (mean/std), s2_s1_interval_ms (mean/std), systolic_murmur_energy, diastolic_murmur_energy, murmur_grade_estimate (0–6), spectral_centroid_hz, spectral_rolloff_hz, mfcc_mean[13], mfcc_std[13], wavelet_band_energy[6], shannon_entropy, snr_db, quality_score (0–1)
   - `findings` (optional T3 passthrough): array of `{code_system, code, display, confidence, evidence_refs[]}`
   - `provenance`: `producer_model_id`, `producer_version`, `preprocessing_chain[]`, `calibration_id`, `created_at` (ISO-8601), `quality_flags[]`
   - `text_view` (string, auto-derived) — natural-language rendering used by the LLM extractor.
4. **Units & coding** — UCUM for all `valueQuantity`; LOINC for measurements (e.g. `8867-4` HR), SNOMED-CT for findings (e.g. `88610006` Heart murmur); project-local codes for engineered features without a standard, registered in `src/lib/ontology/clinical.ts` as a follow-up.
5. **FHIR R5 mapping** — record → `DiagnosticReport` with one `Observation` per top-level feature; embeddings/arrays via `Observation.valueSampledData`; `derivedFrom` references the upstream `Media` resource (kept external).
6. **File formats** — JSON for single records, NDJSON for batches; gzip allowed; max 5 MB per record. Parquet/HDF5 explicitly out of scope for v1.
7. **Validation rules** — required-field list, range checks (HR 20–250, quality_score 0–1, sampling_rate ≥ 500 Hz), UCUM conformance, monotonic timestamps, presence of all provenance fields. Records failing validation are rejected at ingest with a structured error.
8. **PHI guard** — `subject_ref` MUST be opaque; spec forbids name/DOB/MRN/free-text patient narrative. Selective-redaction §9 is wired but expected to be a no-op for T2; remains active for any free-text `interpretation` field.
9. **Mapping to KG triples** — worked example: `(Recording r1) -[has_finding]-> (SystolicMurmur f1)`; `(f1) -[graded]-> (Grade3)`; `(f1) -[suggests, confidence=0.78]-> (AorticStenosis)`; `(Patient p1) -[underwent]-> (r1)`. Shows how validators and credibility scoring (existing formula) consume `quality_score` and `confidence`.
10. **KG-Bench Clinical hooks** — gold-case shape for feature→finding→condition triples; notes that adding cases requires bumping the KG-Bench gold version per the cardinal rule in `pipeline-stage-contracts`.
11. **Open extension points (not v1)** — T1 frame-level (Parquet), T3 embeddings sidecar, inline DSP, streaming ingest.

## Technical notes

- Spec only — no edge function, no UI, no schema migration in this plan.
- JSON Schema uses Draft 2020-12 with `$id` pointing at the public path so external producers can validate offline.
- Memory entry summarises the contract so future build-mode work picks it up automatically.

## Out of scope

- T1/T3 tiers, inline feature computation, raw audio handling, ingest endpoint, UI uploader, ontology extensions, KG-Bench gold-case authoring.
