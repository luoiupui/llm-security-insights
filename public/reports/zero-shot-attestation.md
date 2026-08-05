# Zero-Shot Attestation — CTI LLM & KG-Construction Layers

**Status:** verified against the repository at time of writing.
**Claim attested:** the CTI pipeline performs **no model training of any kind**. It is zero-shot, frozen-model, prompt-only. Labelled corpora are used **exclusively for evaluation**, never as training input or as in-context exemplars.

---

## 1. Scope

Layers covered by this attestation (the full CTI path from raw report to persisted KG):

| Stage | Implementation | Learns anything? |
|---|---|---|
| S1 Preprocess | `supabase/functions/threat-preprocess/index.ts` | No — deterministic regex/normalisation |
| S2 RAG / retrieval | `supabase/functions/threat-rag/index.ts` | No — read-only vector lookup over already-persisted rows |
| S3 Context assembly | in-function prompt assembly | No — string composition |
| S4 Graph-native extraction | `supabase/functions/threat-extract/index.ts`, `threat-extract-hyper/index.ts` | No — single API call to a hosted frozen model |
| S5 KB-validate | `supabase/functions/kb-validate/index.ts` | No — lookup against curated KB |
| S6 Conflicts + hybrid rule governance | `supabase/functions/threat-conflicts/index.ts`, `_shared/rules/*` | No — symbolic rule evaluation; C3 mined rules are LLM-*proposed* and human-accepted, not learned weights |
| S7 Attribution / query | `supabase/functions/threat-kg-query/index.ts` | No — graph traversal + frozen-model reasoning call |

---

## 2. Evidence: why each LLM call site is training-free

| Call site | Model | Evidence of zero-shot |
|---|---|---|
| `threat-extract` → `callGraphNativeLLM` | `google/gemini-3-flash-preview` (hard-coded) | Prompt contains instructions and the STIX schema only — no gold cases, no worked examples, no corpus text. `temperature` is 0 under deterministic mode; `seed` is recorded for replay. |
| `threat-extract-hyper` | same | Same prompt discipline for n-ary hyperedges. |
| `threat-conflicts` → `resolveConflictsWithLLM` | same | Receives only the current run's violations; output is advisory text, never written back as model state. |
| `threat-kg-query` → attribute / attack-path / predict | same | Receives only the current graph topology. |
| `threat-conflicts-mine` (C3) | same | Emits **rule candidates as text**; candidates enter `kg_rule_sets` only after human acceptance. This is symbolic rule authoring, not gradient learning. |
| `experiment-runner`, `ablation-runner`, `bench-worker` | same | Evaluation harnesses. They read gold labels **after** the model has answered, to score it. Labels never enter the prompt. |

There is no gradient step, optimiser, epoch loop, checkpoint, adapter, LoRA, or local weight file anywhere in `supabase/functions/` or in the KG-construction libraries (`src/lib/threat-pipeline.ts`, `src/lib/conflicts/*`, `src/lib/hyperedge-persistence.ts`, `src/lib/ontology/*`).

---

## 3. Corpus usage — evaluation only

| Corpus | Size | Where it is read | Purpose | Ever sent to the extractor as an example? |
|---|---|---|---|---|
| Gold-56 (CTI, hand-annotated) | 56 | `src/lib/kg-bench/corpus.ts` → `runner.ts`, `scorers.ts`, `stats.ts` | F1 / precision / recall, Wilson CI, McNemar, regression gate | No |
| N1K bench corpus (CISA KEV, MITRE Groups, RSS advisories) | ≈1,000 | corpus-ingest functions → `bench-worker` / `bench-aggregate` | Scale, latency, throughput, cost | No |
| External benchmarks (DNRTI / CASIE adapters) | in-memory | `src/lib/kg-bench/external-adapters.ts` | Cross-dataset accuracy comparison | No |

The evaluation loop is strictly: **input document → frozen model → predicted KG → compare to gold**. Gold annotations are loaded on the scoring side of that boundary.

---

## 4. Explicit carve-outs (things that look like training but are not part of the CTI pipeline)

1. **Privacy & FL Lab** (`src/pages/PrivacyFLLab.tsx`, `src/lib/privacy/fl-fedavg.ts`). A *simulation-only* federated-learning demonstrator: it trains a small logistic head on synthetic client data to illustrate FedAvg, differential privacy, secure aggregation, and membership-inference risk. It is a research-illustration track for the privacy chapter. It does not touch the extractor, the prompts, or the KG.
2. **"ML feedback loop"** on the KG Construction capability list. Marked `reserved` — not implemented. If it were ever implemented it would introduce a learned component and this attestation would have to be revised.
3. **Reproducibility controls** (`ReproPanel`: temperature, seed, top-K, frozen snapshot). These change *sampling*, not model parameters.

---

## 5. How to re-verify (auditor checklist)

```bash
# 1. No training machinery anywhere in backend or KG libs
rg -ni "fine[- ]?tune|lora|gradient|backprop|optimizer|epoch|checkpoint|torch|tensorflow" supabase/ src/lib/

# 2. Model id is fixed and hosted (no local weights)
rg -n "model:" supabase/functions/

# 3. No gold data reaches a prompt
rg -n "corpus|gold" supabase/functions/threat-extract/index.ts   # expect: no matches

# 4. Gold corpora are only imported by benchmark/scoring code
rg -n "from \"./corpus\"|kg-bench/corpus" src/
```

Expected outcome: matches for (1) only inside `src/lib/privacy/` and `src/pages/PrivacyFLLab.tsx` (the simulation track); no matches for (3).

---

## 6. Statement for the thesis

> All CTI knowledge-graph construction in ThreatGraph is performed **zero-shot** against a frozen hosted model (`google/gemini-3-flash-preview`) accessed through an inference gateway. No fine-tuning, adapter training, or in-context exemplar injection is used at any stage; the system's domain competence is supplied by prompt design, a formal STIX-2.1 ontology, and a symbolic rule kernel rather than by learned parameters. Labelled corpora (Gold-56) and unlabelled scale corpora (N≈1,000) are introduced **only at the evaluation stage**, on the scoring side of the model boundary, and therefore cannot leak into the construction path. Training cost is consequently **zero GPU-hours**; the entire resource profile of the system is inference cost.
