# Dempster–Shafer Theory in ThreatGraph — Concepts, Application, and Deployment Procedures

**Version:** 1.0 · **Date:** 2026-10-21 · **Scope:** CTI pathway (Pathway B backbone; applies equally to Pathway C hyperedges)
**Status of D-S in the codebase today:** declared as a fusion method, **implementation deferred** (falls back to noisy-or). This report clarifies the concepts, maps them onto the project, and gives concrete deployment procedures.

---

## 1. Why this report exists

Earlier documents (`ontology-corroborated-finding-spec.md`, `cti-multimodal-fusion-technical-report.md`) mention Dempster–Shafer (D-S) only at the concept level: `fusion_method` accepts the enum value `dempster_shafer`, but the spec explicitly defers the math and the code falls back to noisy-or. This report (a) defines the D-S concepts formally, (b) states exactly where they apply in ThreatGraph, and (c) gives step-by-step deployment procedures — including what changes (and what does **not** change) for LLM selection, host machine, server, and cloud.

---

## 2. D-S concepts, clarified

Dempster–Shafer theory (evidence theory) is a framework for combining uncertain evidence from independent sources **without assuming a full probability distribution**.

| Concept | Formal definition | Plain meaning in ThreatGraph |
|---|---|---|
| **Frame of discernment** Θ | The finite set of mutually exclusive, exhaustive hypotheses. | For a candidate finding: Θ = {`threat`, `¬threat`}. For attribution: Θ = {APT28, APT29, …, unknown}. |
| **Mass function** m | m: 2^Θ → [0,1] with m(∅)=0 and Σ m(A)=1. | Each evidence source assigns belief mass to hypotheses — crucially, mass may go to **Θ itself** ("I don't know"). |
| **Ignorance mass** m(Θ) | Mass assigned to the whole frame. | A source with low reliability keeps mass on Θ instead of being forced to commit — this is what noisy-or and weighted averages **cannot** express. |
| **Belief** Bel(A) | Σ_{B⊆A} m(B). | Total committed support for "this is a real threat". |
| **Plausibility** Pl(A) | 1 − Bel(¬A). | Support once uncommitted mass is counted. The interval [Bel, Pl] is the honest uncertainty band shown to the analyst. |
| **Dempster's rule** | (m₁⊕m₂)(A) = Σ_{B∩C=A} m₁(B)m₂(C) / (1−K) | Combines two independent sources; K is the conflict mass (below). |
| **Conflict** K | K = Σ_{B∩C=∅} m₁(B)m₂(C) | Direct measure of disagreement between sources — e.g. narrative CTI says "threat", internal telemetry says "not threat". K feeds the existing R13 cross-modal disagreement rule. |

**Key property that motivates D-S here:** noisy-or and weighted fusion treat a missing/weak source as *zero support*; D-S treats it as *ignorance* (mass on Θ). For CTI fusion — where one modality is often silent — this is the semantically correct behavior.

### 2.1 Worked example (ThreatGraph two-source fusion)

Narrative CTI source (reliability 0.8) reports TTP T1059 with confidence 0.7; internal telemetry (reliability 0.9) shows matching behavior with confidence 0.4.

- m₁: m₁(threat)=0.56, m₁(Θ)=0.44 (reliability-discounted)
- m₂: m₂(threat)=0.36, m₂(Θ)=0.64
- K = 0 (no direct contradiction), fused m(threat) = 0.56 + 0.36·0.44 ≈ 0.72, m(Θ) = 0.44·0.64 ≈ 0.28
- **Bel(threat) = 0.72, Pl(threat) = 1.0** → promote candidate; the residual 0.28 ignorance is displayed, not hidden.

If telemetry had instead asserted ¬threat at 0.5, K = 0.56·0.45 ≈ 0.25 → the conflict mass itself becomes the R13 signal, with no extra rule code.

---

## 3. Where D-S applies in this project

### 3.1 Current state (audited 2026-10-21)

| Location | What exists today | D-S status |
|---|---|---|
| `src/lib/ontology/corroborated-finding.ts` | `FusionMethod` enum includes `"dempster_shafer"`; `fusedConfidence()` falls back to `noisyOr` with a "research extension — deferred" comment | **Stub only** |
| `src/lib/fusion/index.ts` | `noisyOr`, `minFusion`, `weightedFusion`, `clamp01`, freshness decay | No D-S math yet |
| `supabase/functions/threat-conflicts/index.ts` | `credibility_score = source_reliability × (failures===0 ? 1 : 0.6)`, adaptive penalty, R13 cross-modal disagreement | Credibility is a **scalar product**, not evidence-theoretic |
| `public.kg_corroborated_findings` (DB) | Stores `conf_narrative`, `conf_behavioral` separately; fused value recomputed at read time (storage rule §1.2) | Schema already D-S-ready — no migration needed |
| `ontology-corroborated-finding-spec.md` §1.3 | Documents the deferral | To be updated on deployment |

### 3.2 Target application points

1. **Corroborated-finding fusion (primary).** Replace the noisy-or fallback in `fusedConfidence()` with Dempster's rule over the two stored modalities. The dual-field storage rule is untouched: Bel/Pl are computed at read time, never persisted.
2. **Credibility scoring in `threat-conflicts` (secondary, optional).** Source reliability becomes the discounting factor on each mass function (Shafer's discounting: m'(A) = r·m(A), m'(Θ) = 1−r + r·m(Θ)). This makes R4/R13 evidence-theoretic instead of heuristic.
3. **Attribution hypotheses (future).** Frame Θ = candidate threat actors; each indicator (infrastructure overlap, TTP overlap, timing) contributes a mass function; K quantifies attribution ambiguity.

---

## 4. Deployment procedures

### 4.0 What D-S deployment does **not** involve

- **LLM selection: unchanged.** D-S is deterministic post-inference math. The backbone stays `google/gemini-3-flash-preview` via the Lovable AI Gateway (or the local model configured through `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` — see `local-deployment-migration-guide.md`). No prompt, model, or fine-tuning change is required; the zero-shot posture is preserved.
- **Database schema: unchanged.** `kg_corroborated_findings` already stores both modalities separately.
- **No new edge function, no new table, no new secret.**

### 4.1 Step-by-step (current Lovable Cloud deployment)

| # | Step | File / location | Effort |
|---|---|---|---|
| 1 | Implement `dempsterShafer(m1, m2)` — two-hypothesis frame with discounting and conflict K | `src/lib/fusion/index.ts` | ~40 lines, pure function |
| 2 | Wire the `dempster_shafer` branch of `fusedConfidence()` to call it; return `{ bel, pl, K }` alongside the scalar | `src/lib/ontology/corroborated-finding.ts` | ~20 lines |
| 3 | Add unit tests: commutativity, identity with full ignorance, K>0 on contradiction, Bel ≤ Pl invariant | `src/lib/fusion/__tests__/fusion.test.ts` | ~60 lines |
| 4 | Surface K as the R13 trigger value (replace the heuristic disagreement check) | `supabase/functions/threat-conflicts/index.ts` | ~15 lines |
| 5 | Display the [Bel, Pl] interval in the Corroborated Findings view | `/kg-construction` panel | small UI change |
| 6 | Update spec §1.3 from "deferred" to "deployed", with the mass-assignment convention | `public/reports/ontology-corroborated-finding-spec.md` | doc edit |
| 7 | Regression: run KG-Bench Gold-56 suite; fused scores must not shift existing F1 beyond noise (fusion is read-time only) | Experiments panel | one run |

**Total: one focused change-set, no infrastructure work.** Because fusion is recomputed at read time (storage rule §1.2), deployment is instant and reversible — no backfill, no migration.

### 4.2 Host / server / cloud options

D-S runs wherever the project runs; it adds negligible compute (a handful of multiplications per finding).

| Deployment | Procedure | Notes |
|---|---|---|
| **Lovable Cloud (current, default)** | Merge the change-set; edge functions redeploy automatically. | Zero ops. Recommended. |
| **Published site** | Publish from the Lovable UI after the preview verifies. | `secure-llm-mind.lovable.app` serves the update. |
| **Local PC (per `local-deployment-migration-guide.md`)** | `git pull` → `supabase start` (local CLI + Docker) → edge functions serve locally → point the Vite client at the local backend. D-S code lives in `src/lib/fusion/` (shared client/edge) so it works identically. | LLM swap to Ollama/vLLM is independent of D-S. |
| **Self-hosted server / other cloud** | Deploy the Deno edge functions to any Deno-compatible host (or containerize), PostgreSQL for the tables. D-S has no platform dependency — it is pure TypeScript arithmetic. | Keep `src/lib/fusion/` shared between client and server bundles. |

### 4.3 Verification checklist after deployment

- [ ] `fusion.test.ts` passes, including the four D-S invariants in step 3
- [ ] A finding with one silent modality shows Bel < Pl (ignorance visible), not a collapsed scalar
- [ ] A contradicting pair produces K > 0 and fires R13
- [ ] Gold-56 KG-Bench F1 unchanged (read-time fusion must not perturb extraction scoring)
- [ ] STIX sighting export still carries both raw modality confidences plus the fused snapshot

---

## 5. Risks and limits

| Risk | Mitigation |
|---|---|
| **Independence assumption.** Dempster's rule assumes independent sources; narrative CTI and telemetry about the same incident may be correlated. | Use cautious/discounted combination (or keep `min` fusion) when correlation is suspected; log the chosen method per finding (already stored). |
| **High-conflict instability.** As K → 1 the normalized rule amplifies small masses. | Guard: if K ≥ 0.9, report K and skip fusion (flag for analyst) rather than normalizing. |
| **False precision.** Bel/Pl intervals look authoritative. | UI shows the interval and the contributing masses, never a bare fused number. |

---

## 6. Summary

- D-S is **declared but not yet implemented**; the schema and enum are already prepared for it.
- Deployment is a **pure-code change** in two files plus tests — no LLM, model, schema, or infrastructure change.
- It deploys identically on Lovable Cloud, the published site, a local PC, or any Deno-compatible server.
- Its concrete value: honest uncertainty (ignorance mass), a principled conflict signal (K) for R13, and reliability-discounted fusion that noisy-or cannot express.
