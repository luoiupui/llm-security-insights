# Data Augmentation Feasibility for Gold-56 and the N1K Bench Corpus

**Date:** 2026-08-06 · **Scope:** CTI only · **Status:** analysis (no augmented corpus shipped)

---

## 0. Short answer

- **Gold-56 can be augmented**, but only in the *evaluation-robustness* sense, not the *NN-training* sense. Augmentation multiplies documents; it does **not** multiply independent evidence. F1 computed on 56 originals + 500 perturbations is still statistically an **n=56** result, because the perturbed copies are not independent samples. The correct use is **robustness/invariance testing**, not a bigger headline n.
- **The 166 (→1,000) bench rows cannot be brought to gold quality by augmentation.** Augmentation transforms *inputs*; it cannot create *labels* that do not exist. Label-free rows can only gain labels through annotation, weak supervision (with measured error), or external gold benchmarks.

This is the central asymmetry: augmentation is a *label-preserving* operation. It amplifies labels you already have and is a no-op on rows you never labelled.

---

## 1. Why classical NN-style augmentation does not transfer directly

Typical NN augmentation (image flips, mixup, back-translation) works because:
1. The model is being **trained** — more input variety changes learned weights.
2. The transformation is **label-preserving by construction**.

Neither premise holds cleanly here:

| Premise | ThreatGraph status |
|---|---|
| Model is trained | **False.** `google/gemini-3-flash-preview` is frozen, zero-shot (see `zero-shot-attestation.md`). Extra examples change nothing unless injected into the prompt — which the attestation forbids for evaluation cases. |
| Label preservation is trivial | **False.** A CTI label is a set of typed entities, triples, qualifiers and *verbatim provenance spans*. Paraphrasing a sentence breaks span offsets; renaming an actor breaks the alias graph; reordering events can silently invert a temporal/causal edge that rules R8–R13 depend on. |

So augmentation here must be **span-aware and rule-aware**, which is much narrower than text augmentation in classification tasks.

---

## 2. What augmentation of Gold-56 *is* defensible

Four transformation families are label-safe if applied with an offset-remapping step:

| Family | Transformation | Label handling | Legitimate metric |
|---|---|---|---|
| **A1 Surface-form** | Entity alias swap (APT29 ↔ Cozy Bear ↔ UNC2452), CVE formatting, defanged IOCs (`hxxp`, `1.2.3[.]4`) | Deterministic mapping through the alias table; spans recomputed | Alias-robustness / IOC-normalisation recall |
| **A2 Structural** | Sentence reordering **within a stated timeline**, split/merge of paragraphs, injected boilerplate ("About the vendor…") | Triples unchanged, spans remapped | Distractor robustness, atomicity (Cat 10) |
| **A3 Adversarial (label-flipping, intentional)** | Temporal inversion, contradictory patch date, prompt-injection strings, actor-alias flip | Label deliberately changed to the new correct answer | Conflict-rule R1–R16 detection rate |
| **A4 Cross-lingual** | Machine translation JA/ZH→EN or EN→JA/ZH, then human span re-anchoring | Requires human check; MT drift is real | Multilingual stratum robustness (currently thin: 6 cases) |

Rough yield: 56 originals × ~6–10 safe variants ≈ **350–550 evaluation items**, produced at roughly 0.3–0.5 person-hours per original including the span re-anchoring check.

### 2.1 Reporting rule (non-negotiable)

Report augmented results as a **separate robustness table**, never folded into the headline:

```
Headline (independent):  F1 = 0.930, Wilson 95% CI [0.84, 0.97], n = 56
Robustness (derived):    F1_A1 = 0.918  (Δ −0.012, 336 variants from 56 seeds)
                         F1_A2 = 0.901  (Δ −0.029)
                         F1_A3 = rule recall 0.86 on 112 injected conflicts
```

Cluster-aware statistics are mandatory: bootstrap must resample **seed cases**, not variants, or the CI collapses to a fictitious width. `stratifiedKFold` in `src/lib/kg-bench/stats.ts` must keep all variants of a seed inside the same fold to avoid leakage.

---

## 3. Why the 166/1,000 rows cannot be augmented into gold

| Attempt | Outcome |
|---|---|
| Paraphrase the 166 unlabeled rows | Still unlabeled. 166 × 10 = 1,660 unlabeled rows. Zero accuracy signal. |
| Use pipeline output as labels ("self-labelling") | **Circular.** Scoring the system against its own predictions yields F1 → 1.0 by construction. Academically inadmissible. |
| Use a *different, stronger* LLM as annotator (LLM-as-judge) | Produces **silver** labels with unmeasured error. Usable only if the judge's own error is calibrated against Gold-56 first, and reported as silver, never gold. |
| Weak supervision (regex/CVE/ATT&CK-ID matchers + Snorkel-style label model) | Viable for **high-precision slices only** — CVE mentions, ATT&CK technique IDs, hash/IP IOCs. Cannot label relations, qualifiers, or causal order. |
| Import external gold (DNRTI, CASIE) | The only route to genuinely more *independent* labelled data. Already scaffolded in `src/lib/kg-bench/external-adapters.ts`. |

### 3.1 The realistic ladder for N1K

```text
166 raw rows
  ├─ weak supervision on entity-only slices ......... ~120 rows, entity-P/R only, silver
  ├─ LLM-judge pre-annotation + human accept/reject .. ~5 min/doc → 100 docs ≈ 8 person-hours
  │     └─ these become genuine gold once human-verified
  └─ external gold import (DNRTI / CASIE) ........... hundreds of labelled sentences, different ontology → needs mapping
```

Human-in-the-loop pre-annotation is the cost-effective path: the LLM proposes, the analyst corrects. Empirically this cuts annotation time ~3–5× versus labelling from scratch, and the resulting labels **are** gold because a human signed off. This is the same HITL pattern already implemented for C3 rule mining (`RuleGovernancePanel`).

---

## 4. Does augmentation help the *frozen* model at all?

Only through two channels, both outside training:

1. **Few-shot in-context exemplars.** Augmented variants could diversify the exemplar pool (see `gold56-influence-and-few-shot-feasibility.md`). Constraint: any case used as an exemplar must be excluded from the F1 evaluation, and the current attestation keeps the production prompt example-free.
2. **Retrieval / GraphRAG index density.** More paraphrases improve retrieval recall of the KB, which indirectly helps extraction. This is a *system* effect, measurable on latency/recall, not an accuracy claim.

There is no third channel, because there are no weights to update.

---

## 5. Recommendation

| Priority | Action | Effect on the paper |
|---|---|---|
| 1 | Build the A1–A3 augmentation harness over Gold-56 (span-remapping + cluster-aware bootstrap) | Adds a credible **robustness** section; costs days, not weeks |
| 2 | HITL pre-annotation of ~100 N1K rows into gold | Moves headline from n=56 to **n≈150** with real independence |
| 3 | Map and import DNRTI/CASIE via the existing adapters | External validity; cross-dataset comparison |
| 4 | Weak supervision for entity-only silver labels on the remaining N1K | Reported separately as silver; supports C3 rule mining |
| — | Do **not** report augmented variants inside the headline n | Prevents an easily-attacked statistical claim |

---

## 6. Bottom line

Augmentation is the right tool for the question *"is the extractor robust to how the same intelligence is written?"* and the wrong tool for the question *"how much labelled evidence do we have?"* Gold-56 can honestly become ~350–550 **robustness** items; it cannot honestly become n=500. The 166 bench rows reach gold quality only through annotation — LLM-assisted, human-signed — or through importing an existing gold benchmark.

**See also:** `gold56-influence-and-few-shot-feasibility.md`, `issue3-corpus-scaleup-feasibility.md`, `n1000-corpus-dataset-card.md`, `zero-shot-attestation.md`, `corpus-expansion-and-statistics.md`.
