# Gold-56 vs. N≥1,000: Influence and Few-Shot Feasibility

**Date:** 2026-07-30  
**Scope:** CTI-only (Clinical mode excluded from this analysis)  
**Status:** Implemented and in production use

---

## 1. Which corpus has more influence?

The two corpora serve **non-interchangeable** purposes. Their influence is complementary, but weighted differently depending on what aspect of the system is being evaluated.

### 1.1 Gold-56 (curated, labeled)

| Dimension | Influence |
|-----------|-----------|
| **Accuracy / F1 / McNemar / Wilson CI** | **Dominant**. Gold labels are the only source of ground truth for precision, recall, and statistical comparison. |
| **Prompt engineering & CoT design** | **High**. The 56 cases are used to inspect failure modes and refine the 8-step prompt. |
| **Conflict-rule validation (R1-R16)** | **High**. Each rule is validated against gold cases; false positives/negatives are traced back to labeled examples. |
| **Hypergraph pathway (Pathway C)** | **High**. Atomicity (Cat 10) and explanation-cost (Cat 11) metrics require gold annotations. |
| **Regression gate** | **Required**. A new model/prompt/rule must not degrade Gold-56 F1 before merge. |
| **Scale / cost / latency** | **Low**. 56 cases are too small to estimate production throughput. |

### 1.2 N≥1,000 bench corpus (live, unlabeled)

| Dimension | Influence |
|-----------|-----------|
| **Scale testing & fan-out architecture** | **Dominant**. Determines whether the pipeline can handle batch ingestion without rate-limit or memory collapse. |
| **Cost / latency / throughput** | **Dominant**. Provides per-token and per-request cost curves. |
| **Adaptive rule mining (C3)** | **High**. Frequency of relation co-occurrence and temporal patterns are mined from N1K. |
| **RAG retrieval quality** | **Moderate**. Larger corpus tests embedding density and retrieval recall, but without labels we cannot measure correctness. |
| **Accuracy / F1** | **None**. No gold labels means N1K cannot be used for accuracy scoring. |

### 1.3 Summary of influence

- **For KG construction *quality*** → **Gold-56 is more influential** because it is the only corpus that can validate correctness.
- **For KG construction *system design*** → **N1K is more influential** because it forces decisions about orchestration, caching, rate limits, and cost.
- **For the research claim** "LLM-based KG generation is robust and accurate" → **Gold-56 is the evidentiary basis**. N1K supports the claim "the system scales to production volumes."

---

## 2. Can Gold-56 be used for few-shot NN design?

### 2.1 Clarification: what kind of "NN design"?

The ThreatGraph pipeline does **not** perform gradient-based training. The LLM (`google/gemini-3-flash-preview` via Lovable AI Gateway) is used as a frozen reasoning engine with:

- 8-step Chain-of-Thought prompts,
- STIX/ontology constraints,
- Symbolic conflict rules (R1-R16),
- Optional in-context examples.

Therefore, the relevant question is not "Can we train a model on 56 cases?" but rather:

> **Can 56 gold cases serve as effective few-shot examples for in-context learning?**

### 2.2 Feasibility for few-shot prompting

**Yes, with caveats.**

| Factor | Assessment |
|--------|------------|
| **Quantity** | 56 cases is small but usable for few-shot. Typical few-shot settings use 1–32 examples per prompt. |
| **Diversity** | Gold-56 covers CTI classes such as CVE→TTP, APT→infrastructure, malware→C2, and kill-chain sequencing. This is sufficient for *domain-specific* few-shot. |
| **Per-prompt budget** | Each example may be 200–800 tokens. Including more than ~8 examples per prompt risks exceeding context limits or diluting attention. |
| **Selection strategy** | Random selection is suboptimal. A better approach is **retrieval-based example selection** (similar cases from a vector index) or **stratified sampling** across CTI classes. |
| **Risk of overfitting** | Low for frozen LLMs, but high if the same 56 examples are reused in every prompt. The model may memorize surface patterns rather than generalize. |

### 2.3 Not feasible for fine-tuning

| Approach | Feasibility with 56 cases | Reason |
|----------|---------------------------|--------|
| **Full fine-tuning** | Not feasible | Severe overfitting; 56 << typical minimum of 1,000–10,000 examples. |
| **LoRA / QLoRA** | Marginally feasible as a research demo | Possible with heavy data augmentation and strong regularization, but not academically defensible. |
| **Validation set** | Too small | A held-out validation split (e.g., 20%) would leave only ~11 cases — statistically unstable. |
| **Test set** | Too small | Cannot produce reliable confidence intervals. |

### 2.4 Recommended use of Gold-56 for few-shot

1. **Stratified selection**: pick 2–4 examples per CTI class (e.g., CVE, APT, malware, C2, kill-chain).
2. **Dynamic retrieval**: encode Gold-56 into the vector KB; at inference time, retrieve the top-k most similar labeled examples.
3. **Example formatting**: use a consistent JSON/JSON-LD template that mirrors the expected output schema.
4. **Ablate the examples**: measure Gold-56 F1 with 0-shot, 1-shot, 2-shot, 4-shot, and 8-shot to find the optimal number.
5. **Do not mix train/test**: if examples are used in the prompt, exclude that case from the F1 evaluation.

---

## 3. Why Gold-56 remains the authoritative corpus

The N1K corpus is architecturally important but **cannot replace** Gold-56 for the core research claim because:

1. **No labels** → no accuracy measurement.
2. **Live feeds** → distribution drift; today's N1K is not tomorrow's N1K.
3. **Noisy input** → RSS/PSIRT text contains marketing language and duplicate advisories.
4. **Legal/ethical** → some vendor advisories have usage restrictions.

Gold-56, by contrast, is:

- **Static** (versioned),
- **Labeled** (entity + relation + provenance),
- **Curated** (conflict cases and edge cases intentionally included),
- **Reproducible** (seed 42, temperature 0, deterministic Pathway B).

Therefore, any paper or report should present **Gold-56 F1 as the primary result** and N1K scale/cost as a secondary, supporting result.

---

## 4. Quick-reference table

| Question | Gold-56 | N≥1,000 |
|----------|---------|---------|
| Used for accuracy (P/R/F1)? | **Yes** | No |
| Used for few-shot prompting? | **Yes** | No |
| Used for fine-tuning an LLM? | No (too small) | No (no labels) |
| Used for scale testing? | No (too small) | **Yes** |
| Used for cost/latency analysis? | Partial | **Yes** |
| Used for adaptive rule mining (C3)? | Partial | **Yes** |
| Used for regression gate? | **Yes** | No |
| Influences prompt design? | **High** | Low |
| Influences architecture? | Low | **High** |
| Primary evidentiary role | **Correctness** | **Scalability** |

---

## 5. Conclusion

- **Gold-56 has more influence on the scientific claim** that the pipeline produces accurate, robust CTI knowledge graphs.
- **N1K has more influence on engineering decisions** about throughput, cost, and adaptive rule mining.
- **56 gold cases are feasible for few-shot in-context learning** with a frozen LLM, provided examples are selected strategically and not reused for evaluation.
- **56 cases are not sufficient for gradient-based fine-tuning** or for producing stable train/validation/test splits.

For a stronger academic result, the next step is to expand the gold set to **N ≥ 150–500** through weak supervision, external benchmarks (DNRTI/CASIE), or multi-annotator curation, while keeping N1K as the scale/cost corpus.
