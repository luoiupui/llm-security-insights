# Clinical Feature-Vector Ingest Spec (v1.0)

**Status:** Draft · spec only · no runtime code yet
**Scope:** Heart-sound (PCG) **T2 recording-level** feature vectors, uploaded from an external DSP / ML pipeline, consumed by the Clinical branch of the ThreatGraph KG pipeline.
**Domain mode:** `clinical` (research simulation only — never real PHI).

---

## 1. Purpose & scope

Heart-sound classifiers typically emit a single disease label. The intermediate **multi-dimensional feature vector** that precedes that label is, however, far more valuable for a knowledge graph:

- **De-identified by construction** — features carry no name, DOB, MRN, or free-text narrative.
- **Compact** — a few hundred floats per recording vs. megabytes of waveform.
- **Reusable** — the same vector feeds (a) downstream classifiers and (b) symbolic reasoning over the KG (rules, conflict detection, credibility scoring).
- **Semantically tractable** — features map cleanly onto FHIR `Observation` / `DiagnosticReport` resources, so the LLM-extraction layer can produce typed, attributed, temporal triples instead of inventing them from a waveform it can't read.

**Non-goals (v1):** raw PCG handling, inline DSP / feature computation, T1 frame-level arrays, T3 embedding sidecars, streaming ingest, ontology extension, KG-Bench gold-case authoring.

## 2. Position in the pipeline

The ingest is a **sibling of `threat-preprocess`** on the Clinical branch. It emits the same normalized "document" shape that `threat-extract` consumes:

```text
External DSP/ML system
        │  (JSON / NDJSON upload)
        ▼
clinical-features-ingest   ← future edge function (out of scope here)
        │   emits { cleaned_text: text_view,
        │            iocs_found: [],
        │            source_type: "clinical_features",
        │            reliability_score: quality_score,
        │            clinical_codes: [...],
        │            features: { ... }  ← machine-readable side channel
        │          }
        ▼
threat-rag → threat-extract → kb-validate → threat-conflicts → threat-kg-query → persist
```

Stage contracts from the `pipeline-stage-contracts` skill are unchanged. The new module fills the Stage-1 slot; everything downstream sees a familiar shape, plus an optional `features` block for validators that want numeric access.

## 3. Record schema (T2 — one JSON object per recording)

| Field | Type | Notes |
|---|---|---|
| `record_id` | string (UUID) | Globally unique per recording |
| `schema_version` | string | `"1.0"` for this document |
| `subject_ref` | string | **Opaque pseudonym.** Never raw MRN, name, DOB |
| `encounter_ref` | string \| null | Opaque encounter id |
| `signal_meta.sampling_rate_hz` | number | ≥ 500 |
| `signal_meta.duration_s` | number | > 0 |
| `signal_meta.channels` | integer | 1 or 2 |
| `signal_meta.device_model` | string | Free text, e.g. `"Eko CORE 1"` |
| `signal_meta.auscultation_site` | enum | `aortic` \| `pulmonic` \| `tricuspid` \| `mitral` \| `erb` |
| `features.heart_rate_bpm` | number | 20 – 250 |
| `features.hrv_sdnn_ms` | number | ≥ 0 |
| `features.hrv_rmssd_ms` | number | ≥ 0 |
| `features.s1_s2_interval_ms` | `{mean, std}` | Systolic interval |
| `features.s2_s1_interval_ms` | `{mean, std}` | Diastolic interval |
| `features.systolic_murmur_energy` | number | Normalised 0–1 |
| `features.diastolic_murmur_energy` | number | Normalised 0–1 |
| `features.murmur_grade_estimate` | number | 0 – 6 (Levine) |
| `features.spectral_centroid_hz` | number | |
| `features.spectral_rolloff_hz` | number | |
| `features.mfcc_mean` | number[13] | |
| `features.mfcc_std` | number[13] | |
| `features.wavelet_band_energy` | number[6] | |
| `features.shannon_entropy` | number | |
| `features.snr_db` | number | |
| `features.quality_score` | number | 0 – 1 — drives `reliability_score` downstream |
| `findings[]` *(optional, T3 passthrough)* | `{code_system, code, display, confidence, evidence_refs[]}` | E.g. SNOMED `88610006` "Heart murmur" |
| `provenance.producer_model_id` | string | E.g. `"pcg-feat-v2.3"` |
| `provenance.producer_version` | string | Semver |
| `provenance.preprocessing_chain` | string[] | Ordered, e.g. `["bandpass:25-400Hz","schmidt-segmentation","mfcc:13"]` |
| `provenance.calibration_id` | string \| null | |
| `provenance.created_at` | string | ISO-8601 |
| `provenance.quality_flags` | string[] | E.g. `["motion_artifact_low"]` |
| `text_view` | string | Auto-rendered natural-language summary; what the LLM reads |

## 4. Units & coding

- **UCUM** for every numeric quantity (`/min`, `ms`, `Hz`, `dB`, `1` for dimensionless).
- **LOINC** for standard measurements: heart rate `8867-4`, HRV SDNN `80404-7`, etc.
- **SNOMED-CT** for findings: heart murmur `88610006`, aortic stenosis `60573004`, third heart sound `258194002`, etc.
- **Project-local codes** for engineered features without a standard (e.g. `mfcc_mean[3]`) — to be registered in `src/lib/ontology/clinical.ts` as a follow-up. They must carry `code_system: "threatgraph-clinical-local/1.0"`.

## 5. FHIR R5 mapping

| Spec object | FHIR R5 resource |
|---|---|
| One record | `DiagnosticReport` (category `LP29708-2` Cardiology) |
| Each top-level feature | `Observation` referenced from `DiagnosticReport.result` |
| Array-valued features (MFCC, wavelet bands) | `Observation.valueSampledData` |
| `findings[]` entry | `Observation` with `interpretation` + `Condition` link |
| Upstream recording | `Media` (referenced via `Observation.derivedFrom`; not stored here) |
| `subject_ref` | `Patient` resource id (opaque) |

All `Observation.value*` carry UCUM units; `effectiveDateTime` mirrors `provenance.created_at`.

## 6. File formats

- **Single record:** `application/json` (UTF-8).
- **Batch:** NDJSON (`application/x-ndjson`), one record per line.
- **Compression:** `Content-Encoding: gzip` allowed.
- **Limits:** 5 MB / record, 1000 records / batch file (v1).
- **Out of scope (v1):** Parquet, HDF5, Avro, FHIR Bundle binary.

## 7. Validation rules

Records failing any of the following are **rejected at ingest** with a structured `{error_code, field, message}` response and never reach `threat-extract`.

1. All required fields present (schema enforced by `heart-sound-features.v1.schema.json`).
2. `heart_rate_bpm` ∈ [20, 250].
3. `quality_score` ∈ [0, 1]; recordings with `quality_score < 0.3` are accepted but flagged `low_quality`.
4. `sampling_rate_hz` ≥ 500.
5. All numeric fields carry UCUM-compatible units (declared in the schema).
6. `provenance.created_at` ≤ now and monotonic across a batch.
7. All provenance fields non-null (no anonymous models).
8. **PHI guard:** `subject_ref` MUST match `^[A-Za-z0-9_-]{6,64}$`; record is rejected if it matches an MRN-like pattern (`\bMRN[-:\s]?\d{4,}\b`), an SSN, an email, or contains two capitalised tokens resembling a name.

## 8. PHI guard

T2 features are not identifying on their own, but free-text passthrough is the usual failure mode. Therefore:

- `subject_ref` is opaque (rule 8 above).
- No free-text patient narrative field exists in the schema.
- An optional `findings[].display` field MAY contain short clinical phrases; these are routed through the **Selective Redaction** pipeline (`mem://features/selective-redaction`) before being added to `text_view`. For pure T2 records the redaction guard is expected to be a no-op.

## 9. Mapping to KG triples (worked example)

For a record with `features.systolic_murmur_energy = 0.71`, `murmur_grade_estimate = 3`, `findings = [{code: "60573004", confidence: 0.78}]`, `subject_ref = "subj_4f9a"`:

```text
(Patient   subj_4f9a)    -[underwent]->                     (Recording   rec_91c2)
(Recording rec_91c2)     -[has_observation]->               (Observation obs_hr)
(Observation obs_hr)     -[loinc:8867-4 = 78 /min]->        (Quantity    q_78bpm)
(Recording rec_91c2)     -[has_finding]->                   (Finding     f_murmur)
(Finding f_murmur)       -[snomed:88610006 graded Levine]-> (Grade       g_3)
(Finding f_murmur)       -[suggests, confidence=0.78]->     (Condition   AorticStenosis 60573004)
```

`quality_score` flows into `reliability_score` on the document, which the credibility-scoring formula (see `mem://architecture/threat-reasoning`) combines with `kb-validate.accuracy` and `threat-conflicts.summary` to score every triple. `findings[].confidence` becomes the edge weight on `suggests` edges, where `threat-conflicts` can flag contradictions against guideline rules.

## 10. KG-Bench Clinical hooks

Gold-case shape for the Clinical track of KG-Bench (`mem://features/kg-bench`):

```json
{
  "id": "pcg-aort-stenosis-001",
  "domain": "clinical",
  "category": "fact_extraction",
  "input_record_ref": "examples/heart-sound-features.example.json",
  "expected_triples": [
    ["rec_91c2", "has_finding", "Finding:88610006"],
    ["Finding:88610006", "graded", "Levine:3"],
    ["Finding:88610006", "suggests", "Condition:60573004"]
  ],
  "expected_no_triples": [
    ["Patient:subj_4f9a", "name", "*"],
    ["Patient:subj_4f9a", "mrn", "*"]
  ]
}
```

Adding such cases to the runner requires bumping the gold-corpus version in `src/lib/kg-bench/corpus.ts`, per the cardinal rule in the `pipeline-stage-contracts` skill.

## 11. Open extension points (post-v1)

- **T1 frame-level**: per-cycle arrays in Parquet/NPY, referenced by `Observation.derivedFrom`.
- **T3 embeddings sidecar**: 256–768-d learned embeddings carried in `Observation.valueSampledData` or a `Binary` resource.
- **Inline DSP**: optional in-project feature extraction from raw PCG (adds heavy DSP deps; explicitly deferred).
- **Streaming ingest**: NDJSON over a WebSocket for live monitoring.
- **Ontology extension**: register engineered features as first-class entity types in `src/lib/ontology/clinical.ts`.

---

**Authoritative artifacts (v1):**

- This spec: `public/reports/clinical-feature-ingest-spec.md`
- JSON Schema: `public/schemas/heart-sound-features.v1.schema.json`
- Example record: `public/schemas/examples/heart-sound-features.example.json`
- Memory: `docs/memory/features/clinical-feature-ingest.md`
