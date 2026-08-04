# Hybrid Rule Governance — Detailed Clarification

**Document purpose**: explain what *Hybrid Rule Governance* (HRG) means in the
ThreatGraph pipeline, how it extends the earlier manual rule-based conflict
detector, where it sits relative to state-of-the-art (SOTA) CTI knowledge-graph
construction, and what characteristics distinguish it from purely expert,
purely learned, or purely neural alternatives.

---

## 1. What Hybrid Rule Governance is

Hybrid Rule Governance is the layer inside the S5 `threat-conflicts` stage that
combines:

1. **Expert baseline rules** (R1–R13) — hand-written, deterministic predicates
   co-designed with a domain expert, frozen between releases, and treated as the
   reproducible trust anchor.
2. **Adaptive deterministic layers** (C1–C2) — automatically generated rules
   derived from the ontology and temporal/kill-chain structure, executed without
   query-time LLM tokens.
3. **LLM-proposed + human-reviewed mined rules** (C3) — a semi-automatic
   rule-evolution loop in which the model proposes candidate rules from recent
   monitoring events and validated extractions, a human accepts or rejects each
   proposal, and accepted rules are compiled into the deterministic engine.
4. **Embedding anomaly surfacing** (C4) — a statistical novelty detector that
   compares the edge-pattern vector of a new extraction against the historical
   distribution in `kg_relations`, raising a `warn`-only flag for patterns that
   are rare or unseen.

All four layers are orchestrated through a single **Rule Kernel Registry**
(`supabase/functions/_shared/rules/registry.ts`). The registry is snapshotted
into `kg_rule_sets` on every run, and every KG output carries a deterministic
fingerprint so the exact rule set that produced it can be replayed later.

In short, HRG replaces the assumption *"a human must write every rule"* with the
principle *"experts write the non-negotiable baseline; the system proposes,
measures, and surfaces everything else, while humans remain the final gate for
new rule admission."*

---

## 2. Enhanced role in KG construction vs. manual rule-based detection

### 2.1 The old model — manual rule-based conflict detection

Before HRG, the pipeline relied on a fixed set of 7 symbolic rules
(`mem://architecture/threat-reasoning`). Their role was to catch obvious
contradictions after LLM extraction:

* R1 temporal overlap
* R2 TTP consistency
* R3 infrastructure reuse
* R4 credibility
* R5 causal coherence
* R6 attribution contradiction
* R7 entity duplication

These rules are valuable because they are transparent, deterministic, and
reproducible. However, they suffer from three limitations that become visible
when the corpus grows beyond simple cases:

1. **Coverage is static.** The rulebase cannot detect attack-chain patterns
   that the original authors did not anticipate (e.g., multi-stage kill-chain
   jumpers, temporal drift, alias flips).
2. **Maintenance is manual.** Adding a new rule means editing a TypeScript file,
   writing a unit test, and redeploying the edge function. There is no audit
   trail connecting a rule to the evidence that motivated it.
3. **No provenance-weighted scoring.** Every violation is treated as equally
   authoritative, even though some rules encode hard ontological truths (e.g.,
   a cause cannot be observed after its effect) while others encode heuristic
   warnings (e.g., shared infrastructure).

### 2.2 The new model — Hybrid Rule Governance

HRG keeps the 7 expert rules untouched as the **baseline**, but adds four
adaptive capabilities that change how the KG is guarded:

| Capability | Manual-only model | Hybrid Rule Governance model |
|---|---|---|
| **Temporal drift detection** | Not covered; analyst eyeballs timelines | C1 runs deterministic R8–R12 on every extraction (cause-after-effect, 180-day window, alias flip, report drift) |
| **Kill-chain structural checks** | Not covered; analyst manually traces phases | C2 runs deterministic R13–R15 (stage jumper, inversion, cyclic causality, orphan impact) |
| **Rule evolution** | Edit `.ts` files by hand, no audit trail | C3 LLM proposes candidates → `kg_conflict_rule_candidates` table → human review → compiled into `mined-rules.generated.ts` with full provenance |
| **Novelty surfacing** | Not covered; hallucination vs. new intel indistinguishable | C4 raises `warn` on edge patterns > μ + 3σ from historical `kg_relations` distribution |
| **Credibility scoring** | Uniform penalty per violation | Provenance-weighted penalty: expert (1.0) > adaptive (0.7) > mined (0.4) |
| **Replay / audit** | None; rule version implicit in Git history | `kg_rule_sets` snapshots registry + SHA fingerprint; `kg_rule_replays` reruns rules against stored extraction |
| **Ablations** | Requires code edits | Layer toggles via `layers?: ["C1","C2","C3","C4"]` in `runAdaptiveLayers` |

### 2.3 Why this matters for KG construction

In a manual-only pipeline, the KG is the output of an LLM extractor followed by
a static linting step. The rules do not *guide* construction; they only *reject*
obvious errors. In the HRG model, the rule layers become an active part of the
construction feedback loop:

* **Before extraction:** the ontology and rule taxonomy shape the prompt
  vocabulary (e.g., the LLM is asked to emit `observed_at` timestamps because C1
  needs them).
* **During extraction:** the Graph-Native CoT prompt already bakes graph
  structure into the LLM inference process; HRG then validates that structure.
* **After extraction:** violations are surfaced with provenance, severity, and
  layer tags, so a downstream analyst or attribution algorithm knows whether a
  low credibility score comes from a hard contradiction (expert failure) or a
  novel pattern (adaptive warning).
* **Over time:** C3 turns validated extractions and monitoring events into new
  rules, so the coverage of the guardrail grows with the corpus without requiring
  a full redeploy cycle for every insight.

This is the difference between a *rulebook* and a *governance system*: a
rulebook lists what is forbidden; a governance system records who decided,
when, why, and how the decision can be revisited.

---

## 3. SOTA insights and positioning

### 3.1 What the CTI KG literature typically does

The public SOTA in CTI knowledge-graph construction (DNRTI, APTNER, CASIE,
AttacKG, STIXnet, Open-CyKG, CTIBench, SEvenLLM, CyberLLMBench) generally
follows one of three patterns:

1. **Fine-tuned neural extractors** — BERT-family or Llama-family models trained
   on annotated CTI corpora to emit entities, relations, or events. Strength:
   high F1 on seen patterns. Weakness: brittle to novel threat vocabulary and
   expensive to retrain.
2. **Rule / pipeline post-processors** — hand-written patterns or spaCy
   pipelines that clean and canonicalise neural output. Strength: transparent.
   Weakness: static, English-centric, and disconnected from the evidence that
   motivated each rule.
3. **Pure LLM prompting** — zero-shot or few-shot extraction with a frozen
   model. Strength: fast to adapt. Weakness: no deterministic guardrails and no
   systematic way to encode domain invariants (e.g., causality cannot violate
   time).

### 3.2 The gap HRG fills

HRG is closest to pattern (2) — a symbolic post-processor — but it addresses
the three weaknesses above:

* **It is not static.** C3 provides an evidence-driven rule-evolution loop.
* **It is not English-only.** The rule kernel operates on structured graph
  objects, so the same predicates apply regardless of the source language of
  the report.
* **It is not disconnected from evidence.** Every mined rule carries a
  confidence score, a source completion, and an accept/reject decision in
  `kg_conflict_rule_candidates`.

At the same time, HRG does not try to replace the neural extractor. It sits
*after* the LLM and *before* attribution, which means it can enforce invariants
that a frozen LLM cannot guarantee (e.g., temporal monotonicity, kill-chain
ordering) without requiring fine-tuning.

### 3.3 Honest SOTA comparison

| Dimension | Typical SOTA neural CTI KG | Typical SOTA rule post-processor | ThreatGraph HRG |
|---|---|---|---|
| **Coverage growth** | Requires re-annotation + fine-tuning | Requires hand-editing rules | Expert baseline + LLM-proposed + human-gated rules |
| **Novel-pattern handling** | Generalises within distribution; fails on out-of-distribution threats | Fails unless rule exists | C4 surfaces novelty as `warn`; C3 can turn it into a rule |
| **Explainability** | Attention maps or rationales | Rule ID + message | Rule ID + layer + provenance + severity + replay fingerprint |
| **Reproducibility** | Depends on weights, seeds, GPUs | Depends on Git history | Deterministic rule snapshot + SHA fingerprint per run |
| **Deployment cost** | GPU-hours for training | Negligible | Negligible (no query-time LLM for C1/C2; C3 uses small proposal calls) |
| **Human oversight** | Rare after deployment | Implicit code review | Explicit accept/reject panel in `RuleGovernancePanel` |
| **Multilingual support** | Usually English-only | Usually English-only | Language-agnostic graph predicates |
| **Temporal / kill-chain invariants** | Not enforced | Partial, if hand-coded | C1 + C2 enforce deterministically |

The key insight is that HRG is not a replacement for neural extraction; it is
a **governance layer** that makes neural extraction safer, more auditable, and
more maintainable in a production CTI workflow.

---

## 4. Characteristics of Hybrid Rule Governance

The following table summarises the defining characteristics of HRG as
implemented in ThreatGraph.

| # | Characteristic | Description | Implementation evidence |
|---|----------------|-------------|-------------------------|
| C1 | **Expert baseline as trust anchor** | R1–R13 are frozen, deterministic, and co-designed with a domain expert. They provide a reproducible minimum viable guardrail. | `EXPERT_BASELINE` in `supabase/functions/_shared/rules/registry.ts` |
| C2 | **Adaptive deterministic layers** | C1 (temporal R8–R12) and C2 (kill-chain R13–R15) run automatically on every extraction without query-time LLM tokens. | `runTemporalRules`, `runKillChainRules` in `src/lib/conflicts/` and `supabase/functions/_shared/rules/` |
| C3 | **LLM-proposed, human-gated rule mining** | The model proposes candidate rules from monitoring events and validated extractions; humans accept/reject; accepted rules compile into the deterministic engine. | `kg_conflict_rule_candidates` table, `threat-conflicts-mine` edge function, `RuleGovernancePanel.tsx` |
| C4 | **Embedding anomaly surfacing** | Statistical novelty detection on edge-pattern vectors, `warn`-only, never blocks persistence. | `runAnomalyRules` in `supabase/functions/_shared/rules/anomaly.ts` |
| C5 | **Provenance-weighted credibility** | Violations are penalised according to rule provenance: expert (1.0) > adaptive (0.7) > mined (0.4). | `PROVENANCE_WEIGHT` and `provenancePenalty` in `registry.ts` |
| C6 | **Versioned rule snapshots** | Every run records the full registry in `kg_rule_sets` with a SHA-256 fingerprint. | `buildRegistry`, `registryFingerprint`, `kg_rule_sets` schema |
| C7 | **Deterministic replay** | Any historical extraction can be re-run against the archived rule snapshot to audit why a particular KG output was produced. | `kg_rule_replays` table, `src/lib/rule-replay.ts` |
| C8 | **Layer ablation support** | Individual layers can be toggled on/off for experiments or sensitivity analysis. | `layers?: Array<"C1"|"C2"|"C3"|"C4">` in `AdaptiveInput` |
| C9 | **No fine-tuning** | All adaptivity is at the engineering layer; the LLM (`google/gemini-3-flash-preview`) remains frozen zero-shot. | Prompts in `supabase/functions/threat-extract/index.ts` |
| C10 | **Stage-contract preserving** | The `threat-conflicts` response shape (`summary.passed/warnings/failures`, `violations[]`) is unchanged; only additive fields (`layer`, `provenance`, `rule_set_version`) are added. | `threat-conflicts/index.ts` |
| C11 | **Human-in-the-loop as final gate** | No mined rule enters the live engine without explicit human acceptance. This prevents automated rule drift. | `RuleGovernancePanel.tsx` accept/reject buttons |
| C12 | **Warn-before-fail philosophy for novelty** | C4 and most adaptive rules default to `warning`, so novel-but-plausible threat patterns are surfaced, not suppressed. | Severity assignments in `C1_RULES`, `C2_RULES`, `C4_RULES` |

---

## 5. Concrete example: how a new threat pattern enters the system

Consider a previously unseen attack chain:

> "In March 2024 actor X used a zero-day in vendor Y's VPN (initial_access), then
> directly encrypted domain controllers (impact) without any observed execution,
lateral movement, or privilege escalation."

1. **LLM extraction** emits entities, relations, and causal links.
2. **Expert baseline** (R1–R13) checks for contradictions it knows about.
3. **C2 kill-chain** detects an orphan-impact warning (R15) because `impact`
   has no upstream `execution`, `lateral_movement`, or `privilege_escalation`.
4. **C4 anomaly** notices that the edge pattern `initial_access → impact` is
   rare in historical `kg_relations` and raises a `warn`.
5. **Analyst review** sees the orphan-impact warning and decides the pattern is
   real (some ransomware strains do jump straight to impact).
6. **C3 mining** later proposes a rule: *"if initial_access directly causes
   impact and the source report mentions ransomware, downgrade orphan-impact
   from warning to informational."*
7. **Human reviewer** accepts the rule; it is compiled into
   `mined-rules.generated.ts` and a new `kg_rule_sets` snapshot is created.
8. **Replay** of the original run now shows the accepted rule and the updated
   violation set, demonstrating exactly what changed and why.

This workflow is impossible in a purely manual rule system because the original
authors could not have anticipated the specific VPN zero-day chain.

---

## 6. Limitations and honest gaps

HRG is not a panacea. The following limitations are acknowledged:

1. **C1/C2 are only as good as the structure the LLM emits.** If the extractor
   misses timestamps or kill-chain phases, the rules have nothing to validate.
2. **C3 depends on human reviewers.** If reviewers are not available, the rule
   base stops evolving.
3. **C4 can raise false positives on genuinely novel threats.** This is
   intentional (warn-only), but it still creates analyst workload.
4. **Kill-chain phase inference is currently regex-based.** It will miss novel
   tactic names until augmented with MITRE tactic-ID lookup.
5. **The 180-day drift window in R10 is fixed.** It should become
   domain-configurable in a future release.
6. **Coverage of mined rules is unproven at scale.** Until the N1K corpus is
   exercised, the false-positive rate of C3 proposals is unknown.

---

## 7. Conclusion

Hybrid Rule Governance upgrades ThreatGraph from a static conflict-detection
rulebook into an adaptive, auditable governance system. It preserves the
strengths of expert rules (transparency, determinism, reproducibility) while
adding automatic temporal/kill-chain checks, LLM-assisted rule evolution with
human oversight, statistical novelty surfacing, and provenance-weighted
credibility scoring. Relative to SOTA, it occupies a distinct niche: a
prompt-only, multilingual, reproducible neuro-symbolic pipeline with explicit
rule provenance and replay — not as accurate on massive benchmarks as
fine-tuned systems, but far more maintainable and inspectable for operational
CTI workflows.
