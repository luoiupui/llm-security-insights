---
mem_path: mem://features/corroborated-finding
name: CorroboratedFinding ontology + KG-Bench Cat fusion_corroboration
description: Phase 3 — DB table, ontology helpers, dual-confidence storage rule, two-key promotion, STIX 2.1 Sighting export, and GOLD_VERSION v2 bench category.
type: feature
exported_at: 2026-06-13
---

Phase 3 of the multi-modal fusion arc. Materialises the
`CorroboratedFinding` contract from
`public/reports/ontology-corroborated-finding-spec.md`.

**DB:** `public.kg_corroborated_findings` with `ttp_ref`, `ttp_name`,
`flow_ref`, `conf_narrative`, `conf_behavioral`, `fusion_method`,
`evidence_window_*`, `provenance`, `report_id`. Public-read RLS matches the
sibling `kg_entities` pattern; only `service_role` writes. Validation done by
trigger `validate_corroborated_finding_trg` (not CHECK — the project rule for
evolving rules). Added `kg_entities.source_modality` (default `external_cti`).

**Code:** `src/lib/ontology/corroborated-finding.ts` exposes
`fusedConfidence(method, n, b, α?)`, `canPromoteToConfirmedThreat()`
(two-key rule, defaults 0.7 / 0.5), and `toStixSighting()` which exports the
custom extension `extension-definition--threatgraph-corroborated-finding-v1`.
Storage rule (non-negotiable): `conf_narrative` and `conf_behavioral` are
stored independently; `fused_conf` is **always** recomputed at read time.

**KG-Bench:** `GOLD_VERSION = "v2"` (bumped per the cardinal rule in
`pipeline-stage-contracts`). New category `fusion_corroboration` with scorer
`scoreCorroborations()`. 2 CTI cases (`cti-fc-1`, `cti-fc-2`) + 1 clinical
case (`cl-fc-1`). Pre-fusion-job baseline is 0 by design; the cases anchor
the climb when the matcher lands.

**Conflict engine:** `corroborates`, `contradicts`, `matches_ioc` plus the
node types `flow_pattern` and `corroborated_finding` are whitelisted in the
STIX SRO/SDO validator (rule 9) so they no longer false-flag.

**Out of scope (still):** the fusion matcher job itself, UI panels on
`/kg-construction` for browsing CorroboratedFindings, Dempster-Shafer fusion
implementation (currently aliased to noisy-or).
