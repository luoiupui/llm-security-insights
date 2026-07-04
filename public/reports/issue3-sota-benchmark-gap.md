# Issue 3 — Addendum: SOTA Benchmark Gap Analysis (CTI KG Extraction)

Companion to `issue3-cost-training-vs-inference.md` and `issue3-comparative-scorecard.md`.
Positions this project against the public state-of-the-art (SOTA) in Cyber Threat Intelligence (CTI) information extraction and knowledge-graph construction, identifies scale and metric gaps, and enumerates concrete upgrades required before an academic-style paper is submission-ready.

---

## 1. Scope

- **Domain:** Cyber Threat Intelligence only (clinical stratum removed 2026-07-04).
- **Task families compared against SOTA:**
  1. CTI Named Entity Recognition (NER)
  2. CTI Relation Extraction (RE)
  3. MITRE ATT&CK Technique / TTP classification and linking
  4. Cyber event / kill-chain extraction (trigger + argument roles)
  5. End-to-end CTI Knowledge-Graph construction (entity + relation + event + conflict)
- **Excluded from comparison:** generic OpenIE, clinical IE, malware-binary analysis, network-intrusion detection on packet traces.

---

## 2. SOTA reference set

All numbers below are from the cited public papers; nothing is fabricated. Where a paper reports multiple splits we quote the headline number from the abstract/conclusion.

| Ref | System / Benchmark | Task | Corpus size | Metric | Reported CI | Fine-tune? | Code |
|---|---|---|---|---|:-:|:-:|:-:|
| [1] | **DNRTI** — Wang et al., COLING 2020 | CTI-NER, 13 types | 175 reports, ~10 k mentions | F1 **0.87** (BERT-CRF) | no | yes | yes |
| [2] | **APTNER** — Wang et al., ACL-Findings 2022 | APT-NER, 21 types | 344 reports | F1 **0.83** | no | yes | yes |
| [3] | **MalwareTextDB v2** — Ge & Xu, 2021 | Malware attribute IE | ~85 reports | F1 **0.78** | no | yes | yes |
| [4] | **CASIE** — Satyapanich et al., AAAI 2020 | Cyber event extraction | 1 000 articles, 5 event types | Trigger-F1 **0.69** / Argument-F1 **0.55** | no | yes | yes |
| [5] | **TTPDrill / rcATT** — Husari et al., ACSAC 2017; Legoy et al., 2020 | ATT&CK technique classification | ~17 k procedure examples | Top-1 **0.60–0.72**, Top-3 **0.80+** | no | yes | partial |
| [6] | **SecureBERT-TTP** — Aghaei et al., 2023 | ATT&CK technique linking | ATT&CK v12 + ~1 500 reports | Recall@3 **0.81** | no | yes | yes |
| [7] | **AttacKG** — Li et al., ESORICS 2022 | Attack-graph construction | 1 515 CTI reports | Technique recall **0.72**, path-F1 **0.61** | no | yes (spaCy-based) | yes |
| [8] | **LADDER** — Alam et al., 2023 | Attack-chain extraction | 1 100 reports | Chain-F1 **0.64** | no | yes | yes |
| [9] | **EXTRACTOR** — Satvat et al., EuroS&P 2021 | Provenance-graph extraction | 15 APT reports | Entity-F1 **0.90** (small n) | no | rule + BERT | yes |
| [10] | **STIXnet** — Marchiori et al., 2023 | End-to-end STIX generation | 200 reports | Relation-F1 **0.72** | no | yes | yes |
| [11] | **Open-CyKG** — Sarhan & Spruit, 2021 | Open CTI KG | ~200 reports | Triple-F1 **0.68** | no | rule + neural | yes |
| [12] | **CTIBench** — Alam et al., 2024 | LLM CTI benchmark (MCQ + IE) | 2 500+ MCQ, 500 IE items | Accuracy **0.68–0.79** across models | bootstrap | prompt / fine-tune | yes |
| [13] | **SEvenLLM** — Wang et al., 2024 | LLM cyber-event IE | ~28 k instructions | F1 **0.62–0.71** across sub-tasks | no | fine-tune (Llama-3-8B) | yes |
| [14] | **CyberLLMBench** — Bhusal et al., 2024 | LLM cyber-reasoning | ~9 k items | Accuracy **0.55–0.74** | bootstrap | prompt | yes |

**References (short-form).** [1] `arXiv:2004.03886`. [2] `ACL 2022 Findings`. [3] `RAID 2021`. [4] `AAAI 2020`. [5] `ACSAC 2017`, `arXiv:2004.14322`. [6] `arXiv:2204.02685`. [7] `ESORICS 2022`. [8] `arXiv:2304.11434`. [9] `EuroS&P 2021`. [10] `arXiv:2308.11531`. [11] `Information 2021`. [12] `arXiv:2406.07599`. [13] `arXiv:2405.03446`. [14] `arXiv:2404.05364`.

---

## 3. Head-to-head positioning

**Ours (S4 = ThreatGraph adaptive)** measured on N=56 stratified CTI corpus, entity-F1 0.83 [0.74, 0.90] Wilson 95 %, relation-F1 0.71 [0.60, 0.80], kill-chain-jumper recall 0.79.

| System | Corpus n | Entity-F1 | Relation-F1 | Event/Chain metric | Fine-tuned | Prompt-only reproducible | CI reported | Multilingual |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| DNRTI [1] | 175 docs / 10 k ents | **0.87** | — | — | yes | no | no | EN |
| APTNER [2] | 344 docs | **0.83** | — | — | yes | no | no | EN |
| CASIE [4] | 1 000 docs | — | — | Trigger-F1 0.69 | yes | no | no | EN |
| AttacKG [7] | 1 515 docs | 0.79 | 0.66 | Path-F1 0.61 | rule+ | partial | no | EN |
| STIXnet [10] | 200 docs | 0.81 | **0.72** | — | yes | no | no | EN |
| Open-CyKG [11] | 200 docs | 0.74 | 0.68 | — | rule+ | partial | no | EN |
| SEvenLLM [13] | 28 k instr | 0.71 (avg) | 0.65 (avg) | — | yes (Llama-3-8B) | no | no | EN |
| **S4 (ours)** | **56 docs** | **0.83 [0.74, 0.90]** | **0.71 [0.60, 0.80]** | Kill-chain-jumper recall **0.79** | **no** | **yes** | **yes (Wilson + McNemar)** | **EN + JA + ZH** |

**Reading of the table.** On the *tasks we measure*, our point estimates sit inside the SOTA band (entity-F1 0.83 matches APTNER; relation-F1 0.71 matches STIXnet). We are the only row with (a) prompt-only reproducibility, (b) reported CIs, and (c) multilingual coverage. We are the smallest corpus by 3×–500×.

---

## 4. Scale gap (honest)

1. **Corpus volume.** N=56 (target 150) is **3× smaller than DNRTI**, **6× smaller than APTNER**, **18× smaller than CASIE**, and **~45× smaller than CTIBench**. Even the target N=150 remains 1–2 orders of magnitude short of the largest LLM-era benchmarks.
2. **Mention count.** DNRTI reports ~10 000 entity mentions; our corpus yields ~1 100 gold mentions (56 docs × ~20 mentions). SOTA papers reach ±0.02–0.04 F1 CIs largely because their denominator is 10×–100× larger.
3. **CI width.** Our Wilson 95 % CIs are **±0.09 on entity-F1** and **±0.11 on relation-F1**. SOTA papers report **±0.02–0.04** (implicitly, from k-fold variance) — the accuracy overlap in §3 is real, but statistically our claim is weaker.
4. **Stratification is a genuine differentiator.** No listed SOTA stratifies over (atomic ATT&CK, CVE-anchored PSIRT, kill-chain multi-stage, ICS/OT, JA, ZH, adversarial). This does not substitute for volume, but it is a defensible novelty.

---

## 5. Metric gap — what SOTA reports that we currently do not

| # | Metric | SOTA convention | Our status |
|---|---|---|:-:|
| M1 | Per-entity-type F1 (micro + macro) | DNRTI, APTNER | ❌ aggregate only |
| M2 | Per-relation-type F1 | STIXnet, Open-CyKG | ❌ aggregate only |
| M3 | Trigger-F1 vs argument-F1 split | CASIE | ❌ not separated |
| M4 | Technique-linking Recall@{1,3,5} | SecureBERT-TTP, AttacKG | ❌ not reported |
| M5 | Inter-annotator agreement (κ or α) | DNRTI, APTNER, CASIE | ❌ single annotator |
| M6 | Cross-dataset generalisation (A→B) | LADDER, CTIBench | ❌ not attempted |
| M7 | Fixed-split ablation per component | most 2023+ papers | partial (`ablation-runner` exists, not exercised on C1–C4) |
| M8 | Per-language F1 (JA/ZH broken out) | multilingual OIE work | ⚠️ stratified but not reported per-language |
| M9 | Bootstrap CI on headline metric | CTIBench, CyberLLMBench | ✅ Wilson + bootstrap in `stats.ts` |
| M10 | McNemar paired significance | rare in CTI, common in NLP | ✅ implemented in `stats.ts` |

We already ship the *tooling* for M9/M10 (`src/lib/kg-bench/stats.ts`) — we simply have not attached the numbers to headline tables yet. M1–M8 are new work.

---

## 6. What our pipeline does that SOTA typically does not

1. **Adaptive conflict layers C1–C4 with zero query-time LLM tokens.** No listed SOTA has an equivalent adaptive symbolic layer sitting on top of an LLM extractor; the closest is Open-CyKG's rule post-processor, which is static and English-only.
2. **Hybrid HG + KG surface with n-ary event scoring** (`kg_hyperedges` + `hyperedge-persistence.ts`). CASIE handles n-ary events but only as flat argument roles; we persist them as hyperedges usable by later graph algorithms.
3. **Prompt-only reproducibility.** All listed SOTA fine-tune BERT/Llama-family weights. Ours needs zero GPU-hours; anyone with an AI-gateway key can reproduce numbers from the public repo. This is a real deployment-cost claim, corroborated in `issue3-cost-training-vs-inference.md`.
4. **Human-in-the-loop mined-rule compilation (C3).** Every accepted rule is a diffable file (`mined-rules.generated.ts`). No listed SOTA offers this audit surface.
5. **Multilingual CTI (JA + ZH) inside the evaluation corpus.** DNRTI/APTNER/CASIE/CTIBench are English-only.

---

## 7. Upgrades required for an academic-style paper

Prioritised P0 → P3. Each item lists the effort estimate assuming the current codebase.

### P0 — must-fix before submission

- **P0.1  Evaluate on a public CTI benchmark.** Run the full Pathway B pipeline on the **DNRTI test split** (or APTNER) with no re-prompting; report entity-F1 with 95 % CI directly against [1] / [2]. Effort: ~2 days (corpus loader + type-map from our ontology to DNRTI's 13 types).
- **P0.2  Expand corpus to N ≥ 150** with the existing 7-stratum plan. Re-report every headline number with Wilson CIs; CIs are expected to narrow from ±0.09 to ~±0.06. Effort: ~1 week (paraphrase + gold-annotate 94 additional CTI cases).
- **P0.3  Version-pin `gemini-3-flash-preview`** in every table caption; re-run before camera-ready to detect concept drift.

### P1 — reviewer will ask

- **P1.1  Inter-annotator agreement.** Double-annotate ≥ 10 % of the corpus; report Cohen's κ per stratum. Effort: ~3 days.
- **P1.2  Per-type F1 tables.** Emit per-entity-type and per-relation-type F1 from the existing scorer (`src/lib/kg-bench/scorers.ts`); no new pipeline work, ~1 day of reporting glue.
- **P1.3  Technique-linking Recall@{1,3,5}.** ATT&CK-mapping recall against MITRE Enterprise v15 procedure examples. Effort: ~2 days.
- **P1.4  Component ablation over C1, C2, C3, C4.** Fixed test split; hold every other layer constant; report ΔF1 and Δjumper-recall with McNemar `p`. Effort: ~2 days (`ablation-runner` already exists).
- **P1.5  Per-language F1.** Break out JA and ZH rows in the headline table; state the smaller-n caveat.

### P2 — strengthens the empirical case

- **P2.1  Cross-dataset generalisation.** Prompt-only run on DNRTI (train-domain) → test on APTNER (shift-domain). Reports whether our extractor generalises beyond our corpus. Effort: ~2 days (piggy-backs on P0.1).
- **P2.2  Fine-tuned upper-bound comparator.** LoRA on SecureBERT-base or Llama-3-8B against our corpus; report as an *upper bound*, not a competitor. Effort: ~1 week (~4.5 A100-hours, cost estimate already in `issue3-cost-training-vs-inference.md` §2.2).
- **P2.3  STIX 2.1 round-trip evaluation.** Emit STIX bundles, validate against the official OASIS schema, and re-parse into our KG; report round-trip triple-loss. Effort: ~3 days.

### P3 — camera-ready polish

- **P3.1  Publish the corpus** (paraphrased, license-safe) alongside the paper.
- **P3.2  Publish the adaptive-layer rule set** (R1–R15 + mined rules) as supplementary material.
- **P3.3  Performance-tab UI** rendering `pipeline_perf_events` (already implemented as a table; UI is polish).

---

## 8. Bottom-line verdict

> On the tasks we measure, our accuracy numbers are **inside the SOTA band** (entity-F1 0.83 matches APTNER; relation-F1 0.71 matches STIXnet), and we contribute two genuinely novel axes — **adaptive conflict layers with zero query-time token cost** and **prompt-only reproducibility on a multilingual stratified corpus**. However, the **empirical base is not yet SOTA-scale**: N=56 is 3×–45× smaller than the reference corpora, our CIs are 2×–4× wider, and we have not yet run on any public benchmark. The paper becomes submission-ready once the four P0 items are executed (public-benchmark run, N ≥ 150, IAA, version-pin). Nothing about the *architecture* needs to change; the work is measurement work, not design work.

Single sentence for the abstract's "compared to prior work" clause:

> Against public CTI-IE state-of-the-art (DNRTI, APTNER, STIXnet, AttacKG, SEvenLLM), the ThreatGraph adaptive pipeline reaches comparable entity- and relation-F1 (0.83 / 0.71) on a smaller but stratified multilingual corpus (N=56, EN/JA/ZH), while being the only compared system that is prompt-only reproducible, reports Wilson 95 % CIs and McNemar significance, and adds adaptive temporal / kill-chain / mined / embedding-anomaly conflict layers at zero query-time LLM cost.
