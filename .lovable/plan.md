# SOTA benchmarking report for the CTI pipeline

Create one new academic-style document that positions this project against the current SOTA in CTI knowledge-graph extraction, calls out where our scale/metrics fall short, and lists concrete upgrades needed before submission. No code changes — this is a research-artefact deliverable, same shape as the existing `issue3-*.md` reports.

## Deliverable

**New file:** `public/reports/issue3-sota-benchmark-gap.md`

Registered in `public/reports/manifest.json` so it appears in the Reports downloads panel alongside the other issue-3 artefacts.

## Structure of the report

1. **Scope** — CTI IE + KG construction only (not generic OpenIE, not clinical). Task families compared: NER, relation extraction, TTP/technique classification, event/kill-chain extraction, end-to-end KG construction.

2. **SOTA reference set** (public, citeable) — for each: task, dataset, size, headline metric.
   - **DNRTI** (Wang et al., COLING 2020) — 175 reports, 13 entity types, CTI-NER benchmark. SOTA F1 ~0.87 (BERT-CRF family).
   - **MalwareTextDB / APTNER** (Ge & Xu, 2021; Wang et al., 2022) — APT-focused NER, ~300 docs, F1 ~0.78–0.83.
   - **TTPDrill / rcATT / SecureBERT-TTP** — MITRE ATT&CK technique classification on Procedure Examples + threat reports; top-1 accuracy 0.60–0.72, top-3 0.80+.
   - **CASIE** (Satyapanich et al., AAAI 2020) — cyber event extraction, 1000 articles, 5 event types, trigger-F1 ~0.69, argument-F1 ~0.55.
   - **AttacKG / LADDER / EXTRACTOR / TIM** (2021–2023) — end-to-end attack-graph construction from threat reports; evaluated on 10–1600 reports with recall-oriented metrics on technique linking.
   - **STIXnet / Open-CyKG / CTI-KG (2023–2024)** — LLM-assisted CTI KG pipelines; typically 200–2000 documents, entity-F1 0.75–0.86, relation-F1 0.55–0.72.
   - **LLM-era CTI extractors (2024–2025)** — CyberLLMBench, SEvenLLM, CTIBench — thousands of MCQ/QA items plus a few hundred extraction items; report accuracy and F1 with bootstrap CIs.

3. **Head-to-head table** — our S4 (N=56, entity-F1 0.83 / relation-F1 0.71 / kill-chain-jumper recall 0.79) placed alongside the SOTA rows above with matching columns (dataset size, task, metric, CI reported yes/no, code released yes/no, fine-tuned vs prompt-only).

4. **Scale gap** — honest statement:
   - Our N=56 (target 150) is **1–2 orders of magnitude smaller** than DNRTI (175 docs but ~10k entities), CASIE (1000), CTIBench (thousands). Wilson CIs on our numbers are ±0.09; SOTA papers report ±0.02–0.04.
   - Stratification (7 strata, JA/ZH included) is a genuine differentiator no listed SOTA offers, but it does not substitute for volume.

5. **Metric gap** — what SOTA reports that we currently don't:
   - Per-entity-type and per-relation-type F1 (micro + macro).
   - Trigger-F1 vs argument-F1 split for event extraction (CASIE convention).
   - Technique-linking Recall@k for ATT&CK mapping (AttacKG / TIM convention).
   - Inter-annotator agreement (Cohen's κ or Krippendorff's α).
   - Cross-dataset generalisation (train on A, test on B).
   - Ablation over each pipeline stage on a fixed test split.

6. **What our pipeline does that SOTA typically does not** — kept short and honest:
   - Adaptive conflict layers C1–C4 with zero query-time token cost.
   - Hybrid HG+KG surface with n-ary event scoring.
   - Prompt-only reproducibility (no A100, no fine-tune).
   - Human-in-the-loop mined-rule compilation (C3) that is diffable.

7. **Upgrades required for an academic-style paper** — prioritised, each with effort estimate:
   - **P0 (must-fix before submission).** Evaluate on at least one public CTI benchmark (DNRTI or APTNER) end-to-end; report entity-F1 with 95 % CI against the published SOTA number.
   - **P0.** Expand corpus to N ≥ 150 with the existing stratification; re-report all numbers.
   - **P1.** Add IAA (double-annotate ≥ 10 % of the corpus; report κ).
   - **P1.** Add per-type F1 tables and technique-linking Recall@{1,3,5}.
   - **P1.** Add a fixed-split ablation removing each of C1–C4 in turn.
   - **P2.** Cross-dataset generalisation run (train-prompt on our corpus, test on DNRTI test split).
   - **P2.** Fine-tuned LLM comparator (LoRA on SecureBERT or Llama-3-8B) as an upper-bound reference.
   - **P3.** Pin `gemini-3-flash-preview` version and re-run before camera-ready.

8. **Bottom-line verdict** — one paragraph:
   - Our accuracy numbers are **in the SOTA band** on the tasks we measure (entity-F1 0.83 vs SOTA 0.75–0.87; relation-F1 0.71 vs 0.55–0.72), but the **evidence base is not yet SOTA-scale**. The adaptive-layer + zero-token contribution is genuinely novel; the empirical case for it needs the P0 items above before it becomes publishable at a top venue.

## Technical details

- Pure Markdown, ~500–700 lines, same formatting conventions as `issue3-comparative-scorecard.md`.
- All cited SOTA numbers carry a full citation (author, venue, year) so the reviewer can verify without me fabricating figures.
- No source-code changes; no schema changes; no edge-function changes.
- `public/reports/manifest.json` gets one new entry.

## Out of scope for this task

- Actually running our pipeline on DNRTI / APTNER (that is a P0 upgrade item, tracked in the report but not executed here).
- Corpus expansion from 56 → 150 (separate task).
- Any UI work (no Performance tab, no Reports panel restyle).
