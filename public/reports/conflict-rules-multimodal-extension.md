# Conflict-Rule Extension: Multi-Modal Fusion Rules R11–R13

**Status:** Phase 2 SHIPPED (2026-06-13). Rules R11/R12/R13 are implemented in
`src/lib/conflicts/multimodal-rules.ts` (pure TS, 12 unit tests) and inlined
into `supabase/functions/threat-conflicts/index.ts`. The Conflict Detection
tab on `/attribution` renders dual-confidence bars (external vs. internal,
freshness factor, fused before→after) whenever a multi-modal rule fires.
KG-Bench gold-version bump intentionally deferred to Phase 3 because the
rules are strictly additive and `pass` as no-ops on existing single-modality
pipeline inputs.

Extends the 10-rule symbolic conflict engine described in
`mem://architecture/threat-reasoning` with three rules that govern fusion of
**external CTI** (narrative) and **internal telemetry** (CICIDS-style flow
statistics). See `cti-multimodal-fusion.md` for the conceptual frame and
`ontology-corroborated-finding-spec.md` for the node/edge types these rules
reference.

---

## 1. Rule summary

| Rule | ID                          | Severity | Precondition (informal)                                                                                              | Action                                                                                                  |
|------|-----------------------------|----------|-----------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------|
| R11  | `unverified_external`       | warn     | Entity has only `source_modality = external_cti` evidence above the attribution threshold                            | Flag `requires_internal_corroboration`; clamp `fused_conf ≤ 0.6`                                        |
| R12  | `weak_match_stale_ioc`      | warn     | Internal flow matches an external IoC whose `observed_at` age > decay-threshold                                       | Flag `stale_match`; multiply edge confidence by `freshness(age)`                                        |
| R13  | `cross_modal_disagreement`  | error    | Same entity has `conf_narrative ≥ 0.8` and `conf_behavioral ≤ 0.3` (or the inverse)                                  | Flag `modality_conflict`; route to LLM resolver with both evidence sets                                 |

Decay thresholds (defaults, override via env):

| Indicator type | Half-life | Hard cut-off |
|----------------|-----------|--------------|
| IP / domain    | 30 d      | 180 d        |
| File hash      | 180 d     | 730 d        |
| TTP / TID      | 365 d     | none         |

`freshness(age) = 0.5 ^ (age / half_life)`, clamped to `[0.05, 1.0]`.

## 2. Effect on the credibility score

The existing aggregate is `S = Σ(wᵢ × confᵢ × reliabilityᵢ) / N`. The new rules
modify the inputs *before* aggregation; they never rewrite `S` directly.

- R11 reduces the effective `confᵢ` for any edge whose endpoints are
  `external_cti`-only by `min(confᵢ, 0.6)`.
- R12 substitutes `confᵢ ← confᵢ × freshness(age)`.
- R13 sets `wᵢ ← 0` for the conflicting evidence pending resolver verdict, and
  emits a `modality_conflict` event consumed by `SelfMonitoringPanel`.

This preserves the formula's audit trail — every change to `S` is attributable
to a specific rule firing on a specific edge.

## 3. Worked examples

### 3.1 R11 — unverified external

External report claims `APT-29 → uses → SUNBURST` with `conf = 0.92`. No
internal flow node corroborates SUNBURST C2 traffic. R11 fires:

```
flag:         requires_internal_corroboration
edge:         APT-29 --uses--> SUNBURST
before:       conf_narrative=0.92, fused_conf=0.92
after:        fused_conf=0.60 (clamped); narrative untouched
status_badge: unverified_external
```

### 3.2 R12 — stale IoC match

Internal flow `10.0.7.21 → 185.225.69.24:443` matches IoC IP from a report
observed 95 days ago. Half-life for IPs is 30 d.

```
freshness(95, 30) = 0.5 ^ (95/30) ≈ 0.111
edge:              FlowPattern --matches_ioc--> Indicator(185.225.69.24)
before:            edge_conf=0.88
after:             edge_conf=0.88 × 0.111 ≈ 0.098
flag:              stale_match
```

### 3.3 R13 — cross-modal disagreement

KG TTP node `T1071.001` has `conf_narrative=0.91` from a vendor report; the
internal FlowPattern node connected via `corroborates` carries
`conf_behavioral=0.18` (high jitter, large payload variance — pattern does not
match beaconing). R13 fires:

```
flag:        modality_conflict
ttp:         T1071.001  (conf_narrative=0.91)
flow:        FlowPattern#a42b   (conf_behavioral=0.18)
weight:      wᵢ ← 0 for this CorroboratedFinding pending resolution
event:       monitoring_events.category='security'
             event_type='modality_conflict'
resolver_in: {narrative_evidence, flow_features, decay_factor, env_baseline}
```

### 3.4 LLM-resolver prompt sketch (R13)

```
You are a CTI fusion arbiter. Given:
- NARRATIVE: <evidence sentences, source URL, observed_at, conf_narrative>
- BEHAVIORAL: <flow feature vector, anomaly score, baseline percentile, conf_behavioral>
- DECAY:      <freshness(age)>
- ENV:        <asset role, allow-list hits, peer-baseline summary>

Decide one of:
  A) PROMOTE   — behavioral is benign; demote narrative claim on this asset
  B) DEMOTE    — narrative likely stale; downgrade fused_conf to 0.3
  C) ESCALATE  — genuine disagreement, hand to human analyst

Return JSON: { verdict, fused_conf, rationale, evidence_refs[] }.
```

## 4. Wiring notes (follow-up build task — not in this revision)

Edits required in `supabase/functions/threat-conflicts/index.ts`:

1. Import a new `multimodal-rules` module (to be created alongside the existing
   rule modules) exposing `applyR11`, `applyR12`, `applyR13`.
2. Extend the rule registry array; ensure R11/R12/R13 run **after** the
   existing structural rules so endpoint confidences are already normalized.
3. Add `modality_conflict` to the `event_type` enum used by
   `monitoring_events` inserts. No DB migration is needed if the column is
   already `text`; otherwise extend the CHECK constraint.
4. Surface the new flags in the response shape:
   `{ rule_id, severity, flag, edge_id, before, after, freshness? }`.
5. KG-Bench impact: adding the rules changes the deterministic pipeline's
   per-stage assertions. Per the cardinal rule in `pipeline-stage-contracts`,
   a gold-version bump (`kg-bench/gold.vN → vN+1`) is required *in the same PR*
   as the wiring. This revision does not perform the bump.

## 5. Out of scope

- Implementing the rules in code.
- Authoring KG-Bench gold cases that exercise R11/R12/R13.
- Tuning decay constants against a real corpus (defaults are placeholders).
- UI surfacing beyond the existing `SelfMonitoringPanel`.
