# Adaptive Layers (C1–C4) — What Is Automated, What Is Still Manual, and How to Test Them

**Scope**: This note answers three reviewer questions about the four adaptive
layers stacked on top of the seven hand-written symbolic rules
(`mem://architecture/threat-reasoning`, `conflict-detection-adaptive.md`):

1. What does each red-highlighted layer (C1 temporal, C2 kill-chain, C3 LLM
   rule-mining with human-in-the-loop, C4 embedding anomaly) actually do, and
   where does it replace manual rule authoring with automatic behaviour?
2. Has the pipeline already been "trained" (i.e. wired end-to-end) with these
   adaptive versions, or are some still shelf-ware?
3. Are Test Corpus counts and the CTI/Clinical domain separation reflected in
   the GUI, or is the UI still showing the pre-expansion state?

---

## 1. Layer-by-layer function table

| Layer | File(s) | Input | Output | Manual → Automatic delta |
|-------|---------|-------|--------|---------------------------|
| **C1 Temporal** | `src/lib/conflicts/temporal-rules.ts` (R8–R12) | `entities`, `relations`, `causal_links` with `observed_at` | `TemporalViolation[]` (rule_id, severity, evidence) | Deterministic, **fully automatic** at inference time. Replaces the manual "check the dates by hand" step that a human analyst would otherwise do when triaging causal chains. No human labels needed; runs on every extraction. |
| **C2 Kill-chain graph** | `src/lib/conflicts/killchain-rules.ts` (R13–R15) | `causal_links[]` — phases inferred via regex `inferPhase()` | `KillChainViolation[]` | Deterministic, **fully automatic**. Replaces the manual "does this attack chain skip phases?" review. Phase inference is currently regex-based (transparent, no learning). A future upgrade to MITRE-tactic-ID lookup is orthogonal and does not change the layer's automation status. |
| **C3 LLM rule-mining + human-in-the-loop** | `kg_conflict_rule_candidates` (DB), `mined-rules.generated.ts` (compiled sink) | Recent `monitoring_events` + validated extractions | New candidate rules with `{when, then, rationale, confidence}` written to `kg_conflict_rule_candidates` (status `proposed`) | **Semi-automatic**. The LLM proposes; a human accepts/rejects on the KG-Construction page; accepted rules compile into `mined-rules.generated.ts` and behave like any deterministic rule thereafter. This is where the rulebase *grows itself* — the reviewer's "how do new threats get in" question. |
| **C4 Embedding anomaly** | Design in `conflict-detection-adaptive.md §4` — piggy-backs on the `threat_reports.embedding` (pgvector) column already populated by `threat-rag` | Edge-set of a new extraction vs historical distribution in `kg_relations` | Cosine distance; flag = `warn` if > μ + 3σ | **Automatic (surfacing), manual (interpretation)**. No labels required. Purely surfaces "we have never seen a relation pattern like this" — analyst decides if it is novel intel or a hallucination. |

### Where automation replaces manual work

| Manual work being displaced | Automated by | Wiring status |
|-----------------------------|--------------|---------------|
| Analyst reads timeline column and eyeballs date order | R9 timestamp-order | ✅ wired (temporal-rules.ts) |
| Analyst notices "180 days between cause and effect is suspicious" | R10 drift window | ✅ wired |
| Analyst flips through phase list to spot skipped stages | R13 stage-jumper | ✅ wired |
| Analyst maintains a rule spreadsheet, hand-edits `.ts` files | C3 mining loop → candidate table → compile | ⚠️ partially wired (see §2) |
| Analyst clusters historical relations mentally to sniff out novelty | C4 embedding anomaly | ⚠️ designed, not yet computed at inference time (see §2) |

---

## 2. Has the pipeline actually been trained/wired with these adaptive layers?

"Trained" here means **wired into the running pipeline and exercised on the
test corpus**, not "the LLM was fine-tuned". This project does not fine-tune
Gemini — all adaptivity is at the *engineering* layer, not the *weights* layer.

| Layer | Code in tree | Called from `threat-conflicts` edge fn | Covered by unit tests | KG-Bench category | Verdict |
|-------|--------------|----------------------------------------|-----------------------|-------------------|---------|
| C1 temporal | ✅ `temporal-rules.ts` | ⚠️ **not yet invoked** by `supabase/functions/threat-conflicts/index.ts` | ✅ `__tests__/temporal-killchain.test.ts` | ❌ `conflict_adaptivity` category still deferred (GOLD_VERSION v2→v3 pending) | **Code-complete, not yet in the live pathway** |
| C2 kill-chain | ✅ `killchain-rules.ts` | ⚠️ **not yet invoked** by `threat-conflicts` | ✅ same test file | ❌ same as above | Same status as C1 |
| C3 mining loop | ✅ table `kg_conflict_rule_candidates` (migrated, RLS + GRANTs) + typed sink `mined-rules.generated.ts` (empty array) | ❌ no `threat-conflicts-mine` edge fn yet | N/A (no rules mined yet) | N/A | **Schema-frozen, mining function + review UI pending** |
| C4 embedding anomaly | ⚠️ design-only; leverages existing pgvector column | ❌ not implemented | N/A | N/A | **Documented, not implemented** |

**Bottom line — honest reviewer answer**: the *rules themselves* (C1, C2) are
written, unit-tested, and deterministic; they simply have not been plugged
into the live edge function yet, so today's smoke-test numbers on the corpus
still reflect the 7-rule baseline. C3 has its persistence layer but not its
producer/consumer. C4 is a design.

**Next commit to close the gap** (single, contained change):

```text
supabase/functions/threat-conflicts/index.ts
  + import { runTemporalRules } from '@shared/temporal-rules'
  + import { runKillChainRules } from '@shared/killchain-rules'
  + merge violations into the existing summary, keep summary shape unchanged
  → does NOT bump pipeline-stage-contracts response shape (violations[] already exists)
  → does bump GOLD_VERSION v2 → v3 (new gold cases for conflict_adaptivity)
```

---

## 3. How the layers can be tested today

Yes — the current end-user test path is exactly what the reviewer described:

1. Navigate to **KG Construction** page.
2. Choose an input source:
   * **Paste text** — free-form paste box.
   * **Test corpus (n=<N>)** — dropdown of the hand-curated cases.
   * **Live feed** — most recent DB-ingested reports.
3. Click **Extract, Validate & Persist to KG**.

There is currently **no dedicated "run adaptive layers only" button** — the
adaptive rules run (or will run, once wired per §2) inside stage 5
`threat-conflicts` as part of that single click. The Experiments page →
**Smoke Test** tab and **KG-Bench** tab are the batch equivalents; they
invoke the same pipeline in a loop over the corpus.

### Fixes shipped with this note

| Issue reported | Root cause | Fix |
|----------------|-----------|-----|
| GUI still shows *Test Corpus (n=30)* despite the 56-case expansion | Two hard-coded literals: `KGConstruction.tsx` tab label + footer, `Experiments.tsx` tab label + section header | Replaced with `{domainCases.length}` / `{corpusStats.totalSamples}` — the number now tracks `sampleTestCases.length` and will follow the pass-2 expansion to 150 automatically |
| CTI and Clinical corpus items appear mixed after selecting a domain | `KGConstruction.tsx` iterated `sampleTestCases` unconditionally; the corpus is now CTI-only, so Clinical mode inherited the CTI list | Corpus dropdown is now filtered via `useDomain()`. In Clinical mode, the dropdown is replaced by an inline notice explaining the CTI-only scope and pointing to **Paste text** as the Clinical workflow. In CTI mode, the current 56 CTI cases render as before. |

Confirmation of what to see after refresh:

* Header domain switch = **CTI** → *Test corpus (n=56)* tab, dropdown lists 56 CTI cases (KEV, MITRE, STIX, hard-negative, ml-ja-*, ml-zh-*, ics-*, adv-*, hg-*).
* Header domain switch = **Clinical** → *Test corpus (n=0)* tab, dropdown replaced by amber notice: *"The hand-curated test corpus is CTI-only in the current build."*
* Experiments page → *Smoke Test (n=56)* tab, header text and case-count widget both dynamic.

---

## 4. Quick FAQ for the reviewer

**Q. Is "adaptive" a fine-tuned model?**
A. No. All four layers add rules and detectors *around* the LLM; the LLM
itself (`google/gemini-3-flash-preview` via Lovable AI Gateway) is used
zero-shot. Adaptivity is deterministic + human-in-the-loop, which is
intentional for reproducibility.

**Q. What makes C3 different from just editing `.ts` files by hand?**
A. Provenance and audit. Every mined rule carries a source LLM completion,
a confidence score, an accept/reject decision by a named reviewer, and a
timestamp — all in `kg_conflict_rule_candidates`. Hand-edited rules have
none of this trail.

**Q. Will C4 fire false positives on brand-new CVEs?**
A. Yes — that is the *point*. C4 raises `warn`, never `fail`. It is the
"novel-but-plausible" flag the reviewer explicitly asked for, deliberately
tuned to over-surface rather than to gate persistence.

**Q. When will C1/C2 actually affect the live conflict summary?**
A. Next commit — the diff is one edge-function import + one array
concatenation, and the response shape is already `violations[]`, so the
`pipeline-stage-contracts` cardinal rule holds.
