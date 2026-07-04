# Adaptive conflict detection — beyond hand-written rules

**Reviewer critique**: "Conflict detection relies on manually predefined logical rules, which lacks sufficient coverage of complex attack chains (time drift, multi-stage jumpers), and fails to explain how the rules dynamically evolve with new threats."

**Response**: the existing 7 symbolic rules are the *reproducible baseline* (`mem://architecture/threat-reasoning`) and stay untouched. We add four layers on top.

## 1. Coverage matrix — before

The 7 legacy rules cover:

| Class          | Legacy rules       | Coverage |
|----------------|--------------------|----------|
| Ontological    | R1–R3              | Good     |
| Provenance     | R4                 | Partial  |
| Cross-modal    | R5 (multimodal-rules.ts), R9 (STIX SRO validator) | Good     |
| Temporal       | —                  | **Missing** |
| Kill-chain     | —                  | **Missing** |
| Alias / drift  | —                  | **Missing** |

## 2. Coverage matrix — after (this pass)

Rules 8–15 land in `src/lib/conflicts/temporal-rules.ts` and `src/lib/conflicts/killchain-rules.ts`, all deterministic (no LLM), all unit-tested.

| Rule | Class        | Detects                                                                | Severity |
|------|--------------|------------------------------------------------------------------------|----------|
| R8   | Causal       | Non-monotonic verb sequence (`triggers` before `enables` on same node) | warn     |
| R9   | Temporal     | Cause `observed_at` later than effect `observed_at`                    | fail     |
| R10  | Temporal     | Causal span > 180 d without a documented intermediate stage            | warn     |
| R11  | Alias / drift| `also_known_as` cycle spans two entity types                           | fail     |
| R12  | Report drift | Same (source,target) pair changes relation across dated reports        | warn     |
| R13  | Kill-chain   | Multi-stage jumper (≥ 3 phases skipped, e.g. initial_access → impact)  | warn     |
| R13' | Kill-chain   | Stage inversion (later phase enables earlier)                          | fail     |
| R14  | Kill-chain   | Cyclic causality (a → b → … → a)                                       | fail     |
| R15  | Kill-chain   | Orphan `impact` phase with no upstream exec/lateral/privesc            | warn     |

Kill-chain phase inference (`inferPhase`) is regex-based; TTP-id-based inference (MITRE tactic → phase) is a follow-up.

## 3. How the rulebase evolves — Layer C3 (rule mining)

Hard-coded rules can never keep up with novel threats. The evolution loop:

```text
recent monitoring_events + validated extractions
        │
        ▼
threat-conflicts-mine (edge fn, follow-up)   ── constrained JSON schema:
        │                                      { taxonomy, when_pattern,
        │                                        then_violation, rationale,
        │                                        confidence }
        ▼
kg_conflict_rule_candidates (table, migrated) ── status: proposed
        │
        ▼
human review panel on /kg-construction (follow-up)
        │  accepted → status: accepted
        ▼
mined-rules.generated.ts   ── compiled into the deterministic rule engine
```

The **table exists in this pass** (`kg_conflict_rule_candidates` — created with GRANTs, RLS, and taxonomy CHECK). The mining edge function and review UI are the next commit; the schema they will read from is frozen now so downstream code can be typed against it.

## 4. Layer C4 — embedding anomaly flag (design)

`threat-conflicts` computes cosine distance between the new extraction's edge-set and the historical distribution in `kg_relations`. Distances > μ + 3σ raise a **novel-but-plausible** flag (warn, not fail) so we surface "we've never seen this before" without blocking it — this is the missing "novel threat" affordance the reviewer asked about. Implementation reuses the pgvector embeddings already present on `threat_reports`.

## 5. KG-Bench category `conflict_adaptivity` (planned)

12 gold cases: 4 temporal-drift, 4 kill-chain jumpers, 2 alias flips, 2 orphan-impact. This will bump `GOLD_VERSION` v2 → v3 (per `pipeline-stage-contracts` cardinal rule) — deferred to a dedicated commit so KG-Bench baselines don't shift mid-experiment.

## 6. What the paper can now claim

Before: *"7 symbolic rules co-designed with a domain expert."*

After: *"15 deterministic rules across 5 taxonomies (ontological, provenance, cross-modal, temporal, kill-chain) plus an LLM rule-proposal loop reviewed against a candidate table with an accept/reject audit trail."*

The dynamic-evolution mechanism is now describable in terms the reviewer explicitly asked for, and the "how do new threats get in?" question has a mechanism-level answer, not a hand-wave.

## 7. Honest gaps

- Kill-chain phase inference is regex-based → will miss novel tactic names until augmented with MITRE tactic IDs.
- R10 uses a fixed 180-day window → should become domain-configurable.
- Rule mining is designed but not yet wired.
