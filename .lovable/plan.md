# Zero-Shot Attestation for the CTI Pipeline

## What the audit found (verified in code)

- The extractor (`threat-extract`) calls `google/gemini-3-flash-preview` through the AI Gateway with a pure instruction prompt: no in-context examples, no gold cases, no corpus injected. Model id is fixed, `temperature` defaults to 0 in deterministic mode.
- No gradient, epoch, LoRA, fine-tune, or checkpoint code exists anywhere in `supabase/functions/` or in the KG layers (`src/lib/threat-pipeline.ts`, conflicts, hyperedge, persistence).
- Gold-56 / N1K corpora are only read by `src/lib/kg-bench/*` and the experiment/ablation runners — i.e. evaluation only, never fed back into extraction.
- Two places can mislead a reader into thinking training happens, and both are unrelated to CTI KG construction:
  - Privacy/FL Lab (`src/pages/PrivacyFLLab.tsx`, `src/lib/privacy/fl-fedavg.ts`) — a simulation-only federated-learning demo ("Training…", "2 epochs", weight averaging) on synthetic data.
  - `src/pages/KGConstruction.tsx` lists an "ML feedback loop … training signal for embedding fine-tune" item marked `reserved` (not implemented).

Conclusion: the CTI LLM and KG-construction layers are **zero-shot, frozen-model, prompt-only**. Nothing needs to be removed; what is missing is an explicit, auditable statement of it.

## What to build

1. **Zero-shot attestation report** — new `public/reports/zero-shot-attestation.md`, registered in `public/reports/manifest.json`:
   - Scope: which layers are covered (preprocess → RAG/context → graph-native extraction → KB-validate → conflicts → attribution).
   - Evidence table: file, call site, what it does, why it is training-free (frozen model id, no examples in prompt, temperature/seed for reproducibility, not learning).
   - Corpus-usage table: Gold-56 and N1K listed as evaluation-only inputs with the exact modules that read them.
   - Explicit carve-outs: Privacy/FL Lab is a simulation track, not part of the CTI pipeline; the ML feedback loop is reserved/unimplemented.
   - A short "how to re-verify" section listing the grep patterns an auditor can run.

2. **UI clarity, no behaviour change**
   - Add a compact "Zero-shot · frozen model · no fine-tuning" badge to the KG Construction pathway header, linking to the attestation report.
   - Reword the reserved "ML feedback loop" item so it clearly reads as *not implemented / would break zero-shot posture if enabled*.
   - Add a one-line "simulation only — does not train the CTI pipeline" note next to the FL Lab training controls.
   - Add the same one-liner to the Experiments page header so evaluation is not read as training.

3. **Memory** — save the zero-shot posture as a project constraint so future work does not silently add fine-tuning or few-shot exemplars.

## Technical notes

- No edge-function, prompt, or database changes; the extraction path stays byte-identical.
- Badge/notes use existing semantic tokens and the current badge components — presentation only.
- Report follows the existing report style and is added to the manifest so it appears in Report Downloads.
