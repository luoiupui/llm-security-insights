# Fine-Tune Lab Workflow Document

## Goal

Extract the Fine-Tune Lab workflow out of its current two-home split (conceptual description in `public/reports/fine-tuning-feasibility-and-simulation.md`, executable logic in `src/lib/finetune/sim.ts` + `src/pages/FineTuneLab.tsx`) into one self-contained, citation-rich standalone document with a Mermaid pipeline diagram.

## What to create

1. **`public/reports/finetune-lab-workflow.md`** — new standalone workflow doc:
   - **Scope & status** line: simulation-only, does not train the CTI pipeline (link to `fine-tuning-feasibility-and-simulation.md` and `zero-shot-attestation.md` carve-out).
   - **Mermaid pipeline diagram** (inline) showing: Gold-56/GoldAug source → cluster-safe split → 24-D hash featurize → method selection (SFT / LoRA / QLoRA / DPO / Distill) → SGD loop → loss/F1 curves → comparison table → real-world 7B scaling table. Mirrors the actual `buildDataset → train → TrainResult` call chain in `sim.ts`.
   - **Numbered step-by-step workflow** (Steps 1–6), each with: purpose, inputs, the exact `sim.ts`/`FineTuneLab.tsx` function backing it, outputs, and the UI control that triggers it (dataset-prep toggles, hyper-parameter sliders, per-method Run buttons, comparison/scaling tables).
   - **Per-method mechanics table** carried from the feasibility report (SFT/LoRA/QLoRA/DPO/Distill: trainable params, what is frozen, what is learned).
   - **Reproducibility recipe**: seed, deterministic hash featurizer, fixed model id, temperature=0 posture of the *real* backbone vs. the toy head's free SGD — so an auditor can re-run and land on identical curves.
   - **Cross-reference links** back to the feasibility report, zero-shot attestation, and the GoldAug corpus doc.

2. **`/mnt/documents/Finetune_Lab_Workflow.mmd`** — the same Mermaid diagram exported as a downloadable `.mmd` artifact (presentation-artifact), so it can be rendered to SVG via mermaid-cli or mermaid.live.

3. **Manifest + cross-links** — add `finetune-lab-workflow.md` to `public/reports/manifest.json` and add a one-line "See also: workflow doc" pointer at the top of `fine-tuning-feasibility-and-simulation.md`.

## What does NOT change
- No code, prompt, edge-function, ontology, rule, or database change — the lab engine and UI stay byte-identical.
- The zero-shot posture of the CTI pipeline is untouched; this is documentation only.

## Technical notes
- Workflow doc follows the existing report style (markdown, tables, code-citation footers).
- Mermaid uses no emoji tokens and plain `graph TD` syntax for portability.
