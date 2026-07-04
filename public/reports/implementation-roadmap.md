# Implementation Roadmap & Capability Map

**Document type:** living research artefact
**Scope:** the entire ThreatGraph platform (CTI + Clinical, all pathways, all layers)
**Last updated:** 2026-07-04
**Update rule:** every merged feature must add one row to §6 (Change log) and, if it introduces a new capability, one row to §3 (Capability matrix). Anything not in §3 is not shipped.

---

## 1. Purpose & how to read this document

ThreatGraph is not a single-purpose CTI extractor. It is a comprehensive LLM-KG research
platform that combines: (i) two application domains — Cyber Threat Intelligence and a
Clinical simulation track; (ii) three execution pathways — a deterministic 7-stage
pipeline (B), an agentic AI-SDK loop (A), and a hypergraph n-ary pathway (C); (iii) an
adaptive reasoning layer C1–C4 that promotes rules automatically instead of by hand;
(iv) a full evaluation stack (KG-Bench, Experiments, ablation, statistical tests); and
(v) cross-cutting privacy, safety, and observability surfaces.

Different readers should enter through different doors — §2 maps personas to modules.
§3 is the ground-truth inventory: every capability cites the concrete file, edge
function, or page so any claim in a paper or a demo can be audited in one click.
§4 is the platform architecture in one diagram. §5 tags every capability with a
maturity level so reviewers can tell what is benchmarked from what is a simulation.
§6 is the append-only change log. §7 is the forward roadmap keyed to the same
P0/P1/P2/P3 buckets already used in the SOTA-gap and adaptive-layer reports, so the
roadmap is not a new tax — closing an item there closes it here. §8 is the update rule.

---

## 2. User personas addressed

**CTI analyst.** Enters at `/threat-feed` or `/kg-construction` with the domain switch
on CTI. Uses the deterministic pathway B to extract STIX 2.1 entities/relations from
advisories, blogs, or forum posts. Runs adaptive conflict layers C1–C4 to catch
temporal drift, kill-chain jumps, and mined-rule violations before persisting to the
KG. Cross-references CISA advisories and MITRE ATT&CK through the ingested KB.

**Clinical researcher (simulation).** Switches the domain header to Clinical. Same
pipeline, different ontology (ICD-10 / RxCUI / LOINC), different validators, and a
PHI-scrub guard runs before any text leaves the browser. Every clinical view carries a
"Simulation" banner — no real patient data is ever processed.

**ML / KG researcher.** Enters at `/experiments`. Runs KG-Bench across 7 categories
(entity F1, relation F1, causality, attribution, hallucination, temporal, multilingual)
and compares pathway A vs B vs C. Uses `src/lib/kg-bench/runner.ts` and the ablation
runner edge function to isolate C1–C4 contributions. Wilson CIs, bootstrap and
McNemar tests via `src/lib/kg-bench/stats.ts`.

**Privacy / security engineer.** Enters at `/redaction-lab`, `/privacy-fl-lab`,
`/ai-threat-model`. Exercises PHI-scrub, DP noise, FedAvg simulation, secure
aggregation, MIA membership-inference simulation, and the prompt-firewall guard on the
extract stage.

**Reproducibility auditor.** Uses the Repro panel and `pipeline_perf_events` table
plus the deterministic pathway B and the mined-rule diffs in
`public/reports/adaptive-layers-clarification.md` to reproduce every headline number
in the paper.

**Thesis author / reviewer.** Enters via the Reports panel (or directly through this
file). All 20+ MD/PDF artefacts are downloadable and cross-linked; the
`issue3-*` series covers cost, comparative scorecard, and SOTA-gap.

---

## 3. Capability matrix — what is implemented today

Every row is auditable. `File(s)` are project-relative. `Mat.` is the maturity tag
defined in §5: **GA** benchmarked; **Beta** implemented and exercised, not formally
benchmarked; **Sim** simulation only; **Spec** design document exists.

### 3.1 Pipelines / pathways

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.1.1 | Pathway B — deterministic 7-stage pipeline (preprocess → rag → extract → kb-validate → conflicts → kg-query → persist) | `src/lib/threat-pipeline.ts`, `src/hooks/use-threat-pipeline.ts`, `supabase/functions/threat-{preprocess,rag,extract,conflicts,kg-query}/`, `supabase/functions/kb-validate/` | GA |
| 3.1.2 | Pathway A — agent loop with Vercel AI SDK `generateText` + tool catalog + `stopWhen(stepCountIs(50))` | `supabase/functions/threat-agent/index.ts`, `src/components/AgentLoopPanel.tsx` | Beta |
| 3.1.3 | Pathway C — hypergraph n-ary extraction and persistence | `supabase/functions/threat-extract-hyper/`, `src/lib/hyperedge-persistence.ts`, `public/reports/hypergraph-pathway-technical-report.md` | Beta |
| 3.1.4 | Graph-Native 8-step CoT prompt used inside `threat-extract` | `supabase/functions/threat-extract/index.ts` | GA |
| 3.1.5 | RAG stage — embed + retrieve top-k similar reports & subgraph context | `supabase/functions/threat-rag/index.ts` | GA |

### 3.2 Domains

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.2.1 | CTI domain — STIX 2.1 SDO/SRO ontology | `src/lib/ontology/stix.ts`, prompts inside `threat-extract` | GA |
| 3.2.2 | Clinical domain — ICD-10 / RxCUI / LOINC / SNOMED-CT | `src/lib/ontology/clinical.ts`, `public/reports/clinical-feature-ingest-spec.md` | Sim |
| 3.2.3 | Domain switch in header — routes every stage's `domain` parameter | `src/components/DomainSwitch.tsx`, all edge functions | GA |
| 3.2.4 | Domain-scoped test corpus (CTI 56 cases, Clinical simulation) | `src/lib/test-corpus/`, `src/lib/test-corpus.ts` | GA |
| 3.2.5 | Simulation banner on every clinical view | `src/pages/*.tsx` guarded by domain | Sim |

### 3.3 Knowledge-graph surfaces

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.3.1 | Entity/relation KG persistence with confidence + reliability weighting | `supabase/functions/threat-rag/index.ts` (`persist`), migrations under `supabase/migrations/` | GA |
| 3.3.2 | Hypergraph n-ary persistence (corroborated findings) | `src/lib/hyperedge-persistence.ts`, `public/reports/ontology-corroborated-finding-spec.md` | Beta |
| 3.3.3 | KG query — attribution over graph paths (hub/authority/bridge nodes, path-weight scoring) | `supabase/functions/threat-kg-query/index.ts`, `src/pages/Attribution.tsx` | GA |
| 3.3.4 | Transitive inference with confidence decay (conf × 0.85 per hop) | `supabase/functions/threat-extract/index.ts` | GA |
| 3.3.5 | Causal DAG validation (cycle detection, topological attack path) | `supabase/functions/threat-conflicts/index.ts` | GA |

### 3.4 Adaptive reasoning C1–C4

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.4.1 | C1 — Temporal rules (event ordering, TTL, staleness) | `src/lib/conflicts/temporal-rules.ts` | Beta |
| 3.4.2 | C2 — Kill-chain graph rules (MITRE tactic-order constraints, jumper detection) | `src/lib/conflicts/killchain-rules.ts` | Beta |
| 3.4.3 | C3 — LLM rule-mining with human-in-the-loop, compiled back into the symbolic layer | `src/lib/conflicts/mined-rules.ts`, `public/reports/adaptive-layers-clarification.md` | Beta |
| 3.4.4 | C4 — Embedding-anomaly detector | `src/lib/conflicts/embedding-anomaly.ts` | Beta |
| 3.4.5 | Wiring of C1–C4 into `threat-conflicts` edge function | `supabase/functions/threat-conflicts/index.ts` | Spec (P0 — see §7) |

### 3.5 Evaluation

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.5.1 | KG-Bench 3.0 adapted — 7 categories, CTI + Clinical, EN/JA/ZH | `src/lib/kg-bench/runner.ts`, `src/lib/kg-bench/corpus.ts` | GA |
| 3.5.2 | Experiments page with live LLM runs and per-task breakdown | `src/pages/Experiments.tsx`, `supabase/functions/experiment-runner/index.ts` | GA |
| 3.5.3 | Ablation runner (C1/C2/C3/C4 on/off) | `supabase/functions/ablation-runner/index.ts` | Beta |
| 3.5.4 | Statistics — Wilson CI, bootstrap CI, McNemar, stratified k-fold | `src/lib/kg-bench/stats.ts` | GA |
| 3.5.5 | Corpus expansion doc (N=56, JA+ZH multilingual, difficulty tiers) | `public/reports/corpus-expansion-and-statistics.md` | GA |

### 3.6 Privacy & safety

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.6.1 | Redaction pipeline + adjudicator | `src/lib/redaction/`, `supabase/functions/redaction-adjudicate/`, `src/pages/RedactionLab.tsx` | Beta |
| 3.6.2 | Privacy & FL Lab — DP, FedAvg, secure aggregation, MIA | `src/lib/privacy/`, `src/pages/PrivacyFLLab.tsx` | Sim |
| 3.6.3 | AI system threat model & posture registry | `src/lib/security/`, `src/pages/AISystemThreatModel.tsx` | Beta |
| 3.6.4 | Prompt-firewall guard on the extract stage | `src/lib/security/prompt-firewall.ts` | Beta |
| 3.6.5 | PHI scrub before any clinical text leaves the browser | `src/lib/redaction/phi-scrub.ts` | Sim |

### 3.7 Data ingestion

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.7.1 | CISA advisories ingest | `supabase/functions/cisa-advisories-ingest/index.ts` | Beta |
| 3.7.2 | Knowledge-base ingest (MITRE, NVD, references) | `supabase/functions/kb-ingest/index.ts` | Beta |
| 3.7.3 | Multilingual CTI corpus (EN + JA 10 + ZH 10) N=56 | `src/lib/test-corpus/`, `src/lib/i18n/` | GA |
| 3.7.4 | Flow-feature ingest spec (netflow-style CTI features) | `public/reports/cti-flow-feature-ingest-spec.md` | Spec |
| 3.7.5 | Multimodal fusion spec | `public/reports/cti-multimodal-fusion.md`, `src/lib/fusion/` | Spec |

### 3.8 Observability & repro

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.8.1 | `pipeline_perf_events` table — per-stage latency, tokens, cost | migration in `supabase/migrations/` | Beta |
| 3.8.2 | Self-monitoring panel — drift signals, auto-generated reports | `src/lib/self-monitoring.ts` | Beta |
| 3.8.3 | Repro panel — `frozen_snapshot_at` propagation for deterministic replay | `src/lib/threat-pipeline.ts` | Beta |
| 3.8.4 | Implementation log (versioned, filterable) | `src/lib/implementation-log.ts`, `src/pages/ImplementationLog.tsx`, `public/reports/implementation-log.csv` | GA |
| 3.8.5 | LLM call-site inventory | `public/reports/llm-call-sites.csv`, `public/reports/llm-call-sites.json` | GA |

### 3.9 Reports & artefacts (`public/reports/`)

| File | Purpose |
|---|---|
| `comprehensive-technical-report.{md,pdf}` | Full platform technical report |
| `experiments-academic-report.{md,pdf}` | Academic-style experiments write-up |
| `technical-report.{md,docx}` | Executive technical summary |
| `white-paper.{md,docx}`, `general_whitepaper.{md,pdf}` | Positioning white papers |
| `health-report.md` | Nightly health digest |
| `implementation-log.{csv,json}` | Versioned change log |
| `llm-call-sites.{csv,json}` | Every LLM invocation catalogued |
| `repo-inventory.{csv,json}` | Every file classified by layer/LLM role/chapter |
| `performance-and-resource-report.md` | Resource envelope |
| `corpus-expansion-and-statistics.md` | N=56 stratification and stats |
| `adaptive-layers-clarification.md` | How C1–C4 promote rules automatically |
| `conflict-detection-adaptive.md` | Adaptive conflict engine notes |
| `conflict-rules-multimodal-extension.md` | Spec — rules R11–R13 |
| `ontology-corroborated-finding-spec.md` | Corroborated-finding hyperedge spec |
| `hypergraph-pathway-technical-report.md` | Pathway C living doc |
| `hypergraph-analysis-rationale-and-limits.md` | HG scope and limits |
| `hypergraph-scope-and-maturity.md` | HG maturity tags |
| `cti-multimodal-fusion.md`, `cti-multimodal-fusion-technical-report.md` | Multimodal fusion spec + report |
| `cti-flow-feature-ingest-spec.md` | CTI flow-feature ingest spec |
| `clinical-feature-ingest-spec.md` | Clinical ingest spec |
| `issue3-cost-training-vs-inference.md` | Cost breakdown (train vs infer) |
| `issue3-comparative-scorecard.md` | Composite 0–5 scorecard vs S0–S3 |
| `issue3-sota-benchmark-gap.md` | Head-to-head vs 14 SOTA CTI systems |
| `implementation-roadmap.md` | **This file** |

### 3.10 External sync

| # | Capability | File(s) | Mat. |
|---|---|---|---|
| 3.10.1 | GitHub-sync dashboard — filterable repo inventory by layer/LLM role/chapter | `src/lib/github-sync.ts`, `src/pages/GitHubSync.tsx` | GA |
| 3.10.2 | Downloadable reports panel (all §3.9 artefacts) | `src/pages/*` Reports tab, `public/reports/manifest.json` | GA |

---

## 4. Architecture snapshot

<lov-artifact url="/__l5e/documents/threatgraph_capability_map.mmd" mime_type="text/vnd.mermaid"></lov-artifact>

The diagram groups the platform into five bands: **inputs** (paste, feeds, KB, corpus,
clinical sim), **domain switch**, **three pathways** (A agent, B deterministic 7-stage,
C hypergraph), the **adaptive C1–C4 layer** feeding compiled rules back into the
conflict stage, the **KG + HG surfaces** with the attribution engine, and two
cross-cutting bands — **evaluation** (KG-Bench, Experiments, ablation, stats) and
**privacy/safety/observability/reports**.

---

## 5. Maturity classification

- **GA** — used in headline claims, unit-tested, evaluated in KG-Bench. Safe to cite
  as an implemented, measured capability in a paper.
- **Beta** — implemented and exercised end-to-end on the demo corpus. No formal
  benchmark yet or benchmarked only in a spot-check. Safe to cite as implemented but
  not yet as a measured claim.
- **Sim** — simulation only, never touches real user data (Clinical, FL Lab, MIA).
  Cite explicitly as a simulation.
- **Spec** — design document exists in `public/reports/`, code is partial or absent.
  Do not cite as implemented.

Rows in §3 use these tags verbatim. Counts as of 2026-07-04: **GA 18, Beta 15,
Sim 5, Spec 5**.

---

## 6. Change log (append-only)

Seeded from `public/reports/implementation-log.csv` (see that file for the full
version-by-version history). Only headline milestones are surfaced here; every
entry cites the §3 sub-section it advanced.

| Date | Area (§3) | Milestone | Mat. |
|---|---|---|---|
| 2026-07-04 | §3 all | Implementation roadmap & capability map published (**this file**) | GA |
| 2026-07-04 | §3.4 | Adaptive layers clarification doc: how C1–C4 promote rules automatically | Beta |
| 2026-07-04 | §3.5 | Issue-3 SOTA benchmark gap report vs 14 public CTI systems | GA |
| 2026-07-04 | §3.5 | Issue-3 composite scorecard S0–S4 (0–5 across 8 dimensions) | GA |
| 2026-07-04 | §3.8 | Issue-3 cost report: training vs inference separated | GA |
| 2026-04-23 | §3.7 | CTI corpus expanded to N=56 (EN 36 + JA 10 + ZH 10); clinical rows removed | GA |
| 2026-04-23 | §3.4 | C1 temporal, C2 kill-chain, C3 mined→compiled, C4 embedding-anomaly wired into `src/lib/conflicts/` | Beta |
| 2026-04-18 | §3.10 | GitHub-sync dashboard + live LLM verification probe | GA |
| 2026-04-18 | §3.8 | Self-monitoring: auto-generated reports + drift detection | Beta |
| 2026-04-15 | §3.5 | Two-stage experiment framework (Stage 1 MITRE+CAPEC, Stage 2 +NVD+STIX) | GA |
| 2026-04-15 | §3.7 | Implementation log dashboard + GitHub sync | GA |
| 2026-04-15 | §3.3 | Graph-aware attribution engine (path-weight scoring, hub/authority/bridge) | GA |
| 2026-04-15 | §3.4 | Neuro-symbolic conflict detection expanded from 7 to 10 base rules | GA |
| 2026-04-15 | §3.3 | Hybrid causality engine (LLM CoT + DAG cycle validation) | GA |
| 2026-04-15 | §3.1 | Graph-native KG construction (STIX 2.1 during CoT, not post-hoc) | GA |
| 2026-04-15 | §3.1 | 8-step CoT prompt design for NER/RE | GA |
| 2026-04-15 | §3.7 | Multi-source preprocessor (PDF, STIX, Blog, Forum, OSINT) | GA |
| 2026-04-15 | §3.1 | Initial 4-layer pipeline established; `gemini-3-flash-preview` wired | GA |

Rolling policy: every quarter, entries older than 6 months collapse into an
"archived milestones" section at the end of this table.

---

## 7. Forward roadmap

Keyed to the P0/P1/P2/P3 buckets already used in
`issue3-sota-benchmark-gap.md` and `adaptive-layers-clarification.md`. Closing an
item there closes it here.

### P0 — before paper submission (must-fix)

- Wire C1–C4 into the live `supabase/functions/threat-conflicts/index.ts` edge
  function (currently exercised only via `src/lib/conflicts/`).
- Expand CTI corpus from N=56 to N≥150, re-report Wilson CIs.
- Run end-to-end on DNRTI and APTNER test splits.
- Inter-annotator agreement (Cohen's κ) on ≥ 10 % of the corpus.
- Version-pin the LLM: replace `google/gemini-3-flash-preview` with a dated
  snapshot; record the pin in every report.

### P1 — reviewer will ask

- Performance tab UI over `pipeline_perf_events` (per-stage latency, tokens, cost
  visualisation) — the data exists, the panel is missing.
- Per-type F1 tables (per STIX SDO / SRO).
- Technique-linking Recall@{1, 3, 5} against MITRE ATT&CK.
- Fixed-split component ablation of C1 / C2 / C3 / C4 (currently spot-checked).
- Per-language F1 (EN vs JA vs ZH).
- STIX 2.1 round-trip: serialise KG → STIX bundle → re-parse → diff.

### P2 — strengthens contribution

- Cross-dataset generalisation study (train on DNRTI, test on APTNER, and vice versa).
- Fine-tuned upper-bound comparator (LoRA on `Llama-3.1-8B-Instruct` or similar).
- Publish paraphrased corpus (JA + ZH stratified) with prompt-only reproducibility.

### P3 — camera-ready polish

- Publish adaptive-layer mined-rule set as a versioned appendix.
- Re-run all headline numbers on the pinned LLM snapshot.
- Merge `hypergraph-scope-and-maturity.md` into the main technical report.
- Roll the change log's pre-2026-Q3 entries into the archive.

---

## 8. How to update this document

- Every PR that adds a feature must add:
  1. one row in §6 change log with today's date;
  2. if it introduces a new capability, one row in §3 with a file citation and a
     maturity tag from §5;
  3. if it changes an existing maturity level (e.g. Beta → GA after benchmarking),
     edit the row in place and note the promotion in §6.
- Every PR that closes a P0/P1/P2/P3 roadmap item must strike it through in §7 and
  note the closing date next to it.
- Every quarter, roll change-log entries older than 6 months into an "archived
  milestones" collapsible so §6 stays scannable.
- Anything not represented in §3 is not shipped — reviewers will treat this file as
  the ground-truth inventory.
