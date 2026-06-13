# CTI Multi-Modal Fusion: External KG + Internal CICIDS Flow Profiles

Deliver four tightly-scoped artifacts that together formalize how external (after-event, narrative) CTI and internal (live, statistical) CICIDS-style telemetry are fused in this project. All four are spec / docs / ontology / UI-mock work — **no edge functions, no DB migrations, no pipeline runtime changes, no KG-Bench gold-case authoring**.

---

## Deliverable 1 — Fusion white-paper page

**File:** `public/reports/cti-multimodal-fusion.md` (new)

Sections:
1. Problem statement — modality mismatch (external narrative vs internal telemetry).
2. Comparison table (origin, temporality, subject, granularity, truth model, identifiers, modality).
3. Where mismatch creates insight (hypothesis ⊕ evidence).
4. Failure modes — stale IoC, misattribution, scope confusion, identifier collision, temporal inversion, confidence laundering.
5. Guard catalog — provenance separation, temporal decay, modality-typed edges, asymmetric trust, conflict rules, identifier hygiene, independent confidence channels, two-key promotion.
6. Three fusion patterns — Hypothesis→Hunt, Anomaly→Context, Bidirectional reinforcement.
7. Multi-modal framing — parallel to Clinical narrative⊕T2-features architecture.
8. Cross-references to Deliverables 2, 3, 4 and to existing white-paper §2–§4.

Also: add a one-line entry to `public/reports/manifest.json` so it shows up in `ReportDownloads`.

## Deliverable 2 — Conflict-rule extension spec

**File:** `public/reports/conflict-rules-multimodal-extension.md` (new)

Extends the existing 10-rule symbolic conflict engine described in `mem://architecture/threat-reasoning` with three new rules. Spec only — no edits to `threat-conflicts` edge function.

| Rule ID | Trigger | Action |
|---|---|---|
| R11 `unverified_external` | KG entity has only `source_modality = external_cti` evidence above attribution threshold | Flag `requires_internal_corroboration`; demote `fused_conf` ceiling to 0.6 |
| R12 `weak_match_stale_ioc` | Internal flow matches an external IoC whose `observed_at` age > decay-threshold (IP: 30d, hash: 180d, TTP: 365d) | Flag `stale_match`; apply `freshness(age)` factor to edge confidence |
| R13 `cross_modal_disagreement` | Same entity has `conf_narrative ≥ 0.8` and `conf_behavioral ≤ 0.3` (or inverse) | Flag `modality_conflict`; route to LLM resolver with both evidence sets |

Each rule documents: precondition, severity, downstream effect on credibility score `S`, suggested LLM-resolver prompt sketch, and a worked example.

Includes a "wiring note" section listing the exact (future) edits needed in `supabase/functions/threat-conflicts/index.ts` so a follow-up build task can implement it without re-design.

## Deliverable 3 — `CorroboratedFinding` ontology extension spec

**File:** `public/reports/ontology-corroborated-finding-spec.md` (new)

Specifies the new node + edge types and the dual-confidence storage rule. Spec only — `src/lib/ontology/cti.ts` is not edited in this plan.

Contents:
- **New node type** `CorroboratedFinding`
  - Fields: `id`, `ttp_ref` (KG node id), `flow_ref` (flow-pattern node id), `conf_narrative` (0–1), `conf_behavioral` (0–1), `fused_conf` (0–1, derived), `fusion_method` (enum: `noisy_or | dempster_shafer | min | weighted`), `evidence_window` (`{start, end}`), `created_at`, `provenance`.
  - Storage rule: `conf_narrative` and `conf_behavioral` are **independent stored fields**; `fused_conf` is computed at read time, never persisted as the sole confidence.
- **New edge types**
  - `corroborates` (TTP → FlowPattern, typed, carries its own confidence; never collapses endpoint confidences)
  - `contradicts` (TTP ↔ FlowPattern, used by R13)
- **New entity tag** `source_modality ∈ {external_cti, internal_telemetry, fused}` required on every node going forward (migration strategy: default existing nodes to `external_cti`).
- **Identifier-hygiene allow-list spec** — CDN/cloud/shared IPs excluded from `indicator_match` edges but allowed for `behavioral_match` edges.
- **STIX 2.1 alignment** — maps `CorroboratedFinding` to a STIX `sighting` with custom extension properties; documents the extension URI.
- **Two-key promotion rule** — `CorroboratedFinding` is required for any node to receive a `confirmed_threat` label; mirrors the existing `needsApproval` pattern on the agent's `persist` tool.
- Worked example end-to-end: external report → KG TTP node → CICIDS-derived flow-pattern node → `corroborates` edge → `CorroboratedFinding` → attribution path weight.

## Deliverable 4 — Fusion mock panel on KG Construction

**File:** `src/components/MultiModalFusionMock.tsx` (new, presentation-only)
**Edit:** `src/pages/KGConstruction.tsx` — mount the panel inside a new `<Collapsible>` below the existing graph area, collapsed by default. No edits to graph-construction logic, hooks, or edge-function calls.

Panel contents (static mock data, no network calls, no state beyond local UI):
- Three columns:
  1. **External TTP node** card — actor name, TTP id (T1071.001), source URL placeholder, `observed_at`, `conf_narrative` bar.
  2. **Internal Flow-Pattern node** card — host pseudonym, JA3 hash, inter-arrival stats, anomaly score, `conf_behavioral` bar.
  3. **`corroborates` edge** card — fusion method dropdown (visual only), evidence window, computed `fused_conf` bar.
- Footer strip: badge row showing which guards from Deliverable 1 §5 are "active" on this mock (provenance separation, temporal decay, two-key promotion).
- Caption: "Mock — illustrates the contract defined in `ontology-corroborated-finding-spec.md`. Not wired to live data."
- All colors come from existing design tokens (threat-level palette per `mem://style/visual-identity`); no hardcoded hex.

i18n: English copy only in v1; strings collected at the top of the component for future extraction into `src/lib/i18n/dictionary.ts`.

---

## Memory updates

- New file `docs/memory/features/multimodal-fusion.md` (type: `feature`) — one-paragraph summary + pointers to the four artifacts and to the conflict-rule + ontology extension specs.
- Update `docs/memory/index.md` to add the new entry.
- No changes to `mem://architecture/threat-reasoning` or `mem://features/threat-intelligence`; those remain authoritative for the current 10-rule engine and the existing KG.

## Technical notes

- All four artifacts are additive — no existing file is functionally changed except `KGConstruction.tsx` (one collapsible mount) and `manifest.json` (one entry).
- No edge function deploy, no migration, no KG-Bench gold version bump in this plan. Each deliverable explicitly lists the future wiring points so build-mode follow-ups can pick them up without redesign.
- `fused_conf` formula left as a documented choice (default `noisy_or`: `1 − (1 − conf_narrative)(1 − conf_behavioral)`); alternatives noted for later experiments.

## Out of scope (intentionally)

- Implementing R11/R12/R13 inside `threat-conflicts`.
- Editing `src/lib/ontology/cti.ts` to add the new node/edge types.
- A real CICIDS ingest path or flow-feature extractor.
- KG-Bench gold cases for cross-modal fusion (requires version bump per cardinal rule).
- Any DB schema change to persist `CorroboratedFinding` rows.
