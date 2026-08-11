# Fine-Tuning & Fitting on the ThreatGraph LLM — Feasibility and Simulation

**Question addressed:** can LoRA, QLoRA, SFT, DPO or knowledge distillation be applied to the LLM used by this project? If not, what simulation illustrates the workflow?

**Verdict:** real adaptation of the production backbone is **not possible and not desirable today**. A clearly isolated *Fine-Tuning Simulation Lab* (`/finetune-lab`) reproduces the workflow of all five techniques with genuine gradient descent on a toy head.

---

## 1. Why real fine-tuning is not available on the production path

| Blocker | Detail |
|---|---|
| **No weight access** | The backbone `google/gemini-3-flash-preview` is a hosted, frozen model reached through an inference gateway. LoRA/QLoRA/SFT/DPO/distillation all require parameter or logit-level access that the gateway does not expose. |
| **No training runtime** | Edge functions and the browser cannot host a GPU training loop. Any real run would happen off-platform. |
| **Data volume** | Gold-56 has 56 *independent* labels (336 rows with GoldAug-CTI v1 variants, which add no information). Defensible SFT needs ~5k–50k pairs; LoRA/QLoRA ~1k–10k. |
| **No preference data** | DPO requires (chosen, rejected) pairs. None have been collected; the conflict ledger records rule violations, not ranked model outputs. |
| **No teacher traces** | Distillation needs 50k–500k logged teacher generations with intermediate reasoning. The current logs retain final structured output only. |
| **Project constraint** | `mem://constraints/zero-shot-posture` and `/reports/zero-shot-attestation.md` assert zero training in the CTI/KG layers and a zero-GPU-hour resource profile. Introducing learned parameters would invalidate both. |

Note the local-deployment path (`/reports/local-deployment-migration-guide.md`) *does* give weight access if an open-weight model is used via `LLM_MODEL`, but the data and constraint blockers above still stand.

---

## 2. What the simulation lab does

Route: **`/finetune-lab`** — sidebar entry "Fine-Tune Lab (sim)".

- **Frozen encoder surrogate.** A deterministic 24-dimensional hash featurizer (16 hashed n-gram buckets + 8 CTI cue features) stands in for a frozen LLM hidden state. No LLM is called.
- **Real gradients.** SGD genuinely runs, so loss curves, overfitting, and adapter dynamics are observed rather than scripted. Deterministic given the seed.
- **Task.** Binary: does a Gold-56 case carry an exploitation/causal chain? Labels derive from the existing gold annotations.
- **Leakage guard.** Train/holdout split is by **Gold-56 seed cluster**, so a GoldAug variant can never cross to the other side of its seed.

### Techniques reproduced

| Technique | Simulation mechanics | Trainable params (toy) |
|---|---|---|
| **SFT** | Updates the full 24-D head + bias | 25 |
| **LoRA** | Base head frozen; adds `B·A` with rank *r*, `B` zero-initialised as in the paper | r·24 + r + 1 |
| **QLoRA** | Same adapter, base fake-quantised symmetrically to *n* bits (2–8) | r·24 + r + 1, base at n/8 bytes |
| **DPO** | Log-odds margin between a chosen row and a feature-corrupted rejected twin, strength β, anchored by a half-weight label term | 25 |
| **Distillation** | Full-capacity teacher trained first; a 12-feature student fits temperature-softened teacher outputs | 13 |

Panels: dataset prep → hyper-parameters and per-method runs with loss/F1 curves → side-by-side comparison table → real-world scaling table.

---

## 3. Reading the results honestly

The absolute F1 numbers describe the toy head, **not** the CTI extractor. What transfers is the *shape* of the trade-offs:

1. **Parameter budget vs. gain** — LoRA at r=4 recovers most of the SFT gain with a fraction of the trainable parameters.
2. **Quantisation is nearly free on the frozen side** — QLoRA at 4-bit tracks LoRA closely until precision drops to 2-bit.
3. **Overfitting arrives early** — with only ~42 training clusters, holdout loss turns upward while train loss keeps falling. This is the empirical argument against real SFT on Gold-56.
4. **Augmented rows do not help generalisation** — enabling GoldAug variants smooths the train curve without moving holdout F1, exactly as `/reports/corpus-augmentation-feasibility.md` predicts.
5. **Distillation trades accuracy for capacity** — the student loses measurable F1, which is the cost side of any latency/cost-motivated compression.

---

## 4. Gating condition for real adaptation

Real LoRA/QLoRA becomes academically defensible when **all** of the following hold:

1. Independent, signed gold corpus ≥ ~1,000 cases (current: 56).
2. An open-weight backbone deployed locally with pinned quantisation and seed.
3. A frozen zero-shot baseline recorded on the identical corpus for paired comparison (McNemar).
4. A held-out test set never used for prompt or adapter selection.
5. A revision of the zero-shot attestation, since the system would no longer be training-free.

Until then the zero-shot + symbolic-governance posture dominates on cost, reproducibility, and auditability.

---

## 5. Isolation guarantees

- No edge function, prompt, ontology, rule set, or database table is touched by the lab.
- The lab reads Gold-56/GoldAug in the browser only; nothing is written back.
- Extraction remains zero-shot on a frozen hosted model; `/reports/zero-shot-attestation.md` carries this lab as an explicit carve-out alongside the Privacy & FL Lab.
