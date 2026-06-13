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

Wiring not yet performed: `threat-conflicts` edge function, `src/lib/ontology/cti.ts`,
DB schema for the new node/edge types, KG-Bench gold cases (would require a
gold-version bump).
