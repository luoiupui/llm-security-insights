---
mem_path: mem://features/multimodal-fusion
name: Multi-Modal Fusion (External CTI ⊕ Internal CICIDS)
description: Spec for fusing narrative external CTI with statistical internal telemetry via CorroboratedFinding node, conflict rules R11–R13, and a mock panel.
type: feature
exported_at: 2026-06-13
---

Multi-modal fusion contract for CTI: external (narrative, post-event) reports
become KG TTP nodes; internal CICIDS-style flow data becomes FlowPattern nodes;
the two are joined by a typed `corroborates` edge and materialised as a
`CorroboratedFinding` node carrying independent `conf_narrative` and
`conf_behavioral` (never collapsed at storage).

Spec artifacts (all spec-only, no runtime code yet):
- `public/reports/cti-multimodal-fusion.md` — concept, failure modes, guard catalog, three fusion patterns, Clinical parallel.
- `public/reports/conflict-rules-multimodal-extension.md` — rules R11 `unverified_external`, R12 `weak_match_stale_ioc`, R13 `cross_modal_disagreement` extending the existing 10-rule engine.
- `public/reports/ontology-corroborated-finding-spec.md` — node/edge schema, dual-confidence storage rule, STIX 2.1 Sighting mapping, identifier-hygiene allow-list, two-key promotion.
- `src/components/MultiModalFusionMock.tsx` — presentation-only mock mounted on `/kg-construction`.

Two-key promotion: a KG node may only carry `confirmed_threat` when a
`CorroboratedFinding` joins it to internal telemetry above per-modality
thresholds — mirrors the agent harness `needsApproval` pattern.

Phase 1 SHIPPED (2026-06-13): pure fusion math (`src/lib/fusion`),
CDN/cloud ASN allow-list, flow-feature ingest spec + JSON Schema, synthetic
flow corpus, 24 unit tests. No runtime/schema impact.

Phase 2 SHIPPED (2026-06-13): rules R11/R12/R13 implemented in
`src/lib/conflicts/multimodal-rules.ts` (12 unit tests) and inlined into the
`threat-conflicts` edge function. UI surfacing on Conflict Detection tab of
`/attribution` shows dual-confidence bars (external vs. internal, freshness,
fused before→after). Rules are no-ops when modality metadata is absent, so
existing pipeline runs are unaffected.

Phase 3 (pending, separate change): `CorroboratedFinding` ontology in
`src/lib/ontology/cti.ts`, DB schema for the node/edge types, pipeline stage
to materialise corroboration, and KG-Bench Cat 8 gold cases (with a
gold-version bump per the cardinal rule).

---

**Status update — Phase 1 landed (2026-06-13).** The internal-telemetry input
contract and pure foundations are in place: see
[`mem://features/flow-feature-ingest`](./flow-feature-ingest.md) for the T2
flow-feature spec, JSON Schema, synthetic fixture, CDN/cloud ASN allow-list,
and pure fusion math (`noisy_or` / `min` / `weighted` / `freshness`). Still
spec/pure-code only — no DB or edge-function wiring.
