
# Clinical-KG mode for ThreatGraph (simulation only)

Goal: let the existing dashboard ingest de-identified clinical text and build a medical KG using the same pipeline, **without adding new sidebar pages or breaking the current GUI**, and without committing to PPC/FL yet.

## Guiding principles

- **One product, two domains.** Name stays "ThreatGraph". A header toggle switches the *ontology and validators*, not the layout.
- **No new sidebar items.** Existing pages (Data Ingestion, KG Construction, Attribution, Experiments…) work for both domains.
- **Simulation banner everywhere** when domain = `clinical`: "Research simulation — not for clinical use. Do not paste real PHI."
- **PPC/FL-ready, but not implemented now.** All new code accepts a `domain` field so a later FL/DP layer slots in cleanly.

## Scope (this plan)

### A. Domain switch (UI only, no business-logic change)
- New `DomainContext` (React) with values `cti | clinical`, persisted in `localStorage`.
- Small `<DomainSwitch />` in `DashboardLayout` header (segmented control, two options).
- When `clinical`: show an amber `Badge` "Clinical — simulation" next to the title; show a one-line disclaimer banner on `Data Ingestion` and `KG Construction`.
- Sample-text buttons on `Data Ingestion` swap between CTI samples and synthetic clinical notes.
- KG legend on `KG Construction` swaps entity-type colors/labels via the ontology config.

### B. Ontology config (pure data)
- New `src/lib/ontology/cti.ts` (extracted from current constants) and `src/lib/ontology/clinical.ts`:
  - entity types, relation types, causal types, color tokens, MITRE-equivalent ID prefixes.
- New `src/lib/ontology/index.ts` exporting `getOntology(domain)`.
- `KGConstruction.tsx` and `Attribution.tsx` read colors/labels from `getOntology(domain)` instead of hard-coded maps. **No layout change.**

### C. Clinical prompt + KB seed (back-end behavior)
- `threat-extract` accepts an optional `domain: "cti" | "clinical"` (default `cti`, fully back-compatible).
  - `clinical` mode swaps the system prompt's entity/relation enums to: Patient, Condition, Medication, Procedure, Observation, Encounter, Provider, AdverseEvent + relations prescribed_for, diagnosed_with, contraindicates, causes_adverse_event, follows_protocol, ordered_for.
  - Causality types unchanged (`enables / leads_to / triggers / precedes`) — they generalize.
- `threat-preprocess` accepts `domain`. In `clinical`:
  - **PHI-scrub safety net**: regex-mask names heuristics, dates, MRN/NHS-ID patterns, emails, phones, addresses, even on "already de-identified" input (defense in depth).
  - Replace IOC extractors with clinical-code extractors (ICD-10, RxNorm RXCUI, LOINC, SNOMED CT IDs, dosages).
- `kb-validate` accepts `domain`. Ships a **small seeded dictionary** (≈200 entries) of common ICD-10, RxNorm, LOINC codes for hallucination checks. Full SNOMED is out of scope (licensed, ~350k concepts).
- `threat-conflicts` accepts `domain`. Adds clinical rules: drug-drug interaction (against tiny seed list), allergy↔medication contradiction, dosage-range sanity, contraindication.

No DB migrations needed: `kg_entities`, `kg_relations`, `monitoring_events` already store `entity_type` / `relation` as free text. We add a `domain` field to the JSONB metadata on insert.

### D. Documentation
- One new section in `public/reports/white-paper.md` titled "Cross-domain transferability: CTI → Clinical (simulation)" describing what is reused, what swaps, what is deliberately out of scope (real PHI, HIPAA, real SNOMED, real PPC/FL).
- Update `mem://index.md` Core: "Two domains: CTI (default) and Clinical (simulation only). Same pipeline, swappable ontology + validators."

## Deliberately OUT of scope (will be follow-up plans)

- Privacy-preserving computation (DP, k-anonymity).
- Federated learning simulation (FedAvg over silos).
- Real PHI handling, HIPAA/GDPR posture, auth/RBAC hardening.
- Full SNOMED CT / RxNorm / LOINC ingestion (licensed, large).
- A separate "Clinical" sidebar section or duplicate pages.

These remain compatible: every new function already takes a `domain` parameter, so a later DP/FL layer wraps the pipeline without refactor.

## Files touched

- **New**: `src/contexts/DomainContext.tsx`, `src/components/DomainSwitch.tsx`, `src/lib/ontology/{index,cti,clinical}.ts`, `src/lib/sample-corpus/clinical.ts`.
- **Edited (UI only)**: `src/components/DashboardLayout.tsx` (mount switch + banner), `src/pages/DataIngestion.tsx` (sample picker + disclaimer), `src/pages/KGConstruction.tsx` (legend from ontology), `src/pages/Attribution.tsx` (label/color from ontology), `src/App.tsx` (wrap in `DomainProvider`), `src/lib/threat-pipeline.ts` (forward `domain` to edge functions).
- **Edited (edge fns)**: `threat-preprocess`, `threat-extract`, `kb-validate`, `threat-conflicts` — each gets an optional `domain` arg with `cti` default; `clinical` branch adds the swaps above.
- **Edited (docs/memory)**: `public/reports/white-paper.md`, `mem://index.md`.

## Risk / size

- Pure additive change for `cti` users — default behavior is byte-identical.
- ~600 LOC new, ~150 LOC edited across 8 existing files.
- No DB migration, no new tables, no new secrets, no new dependencies.

## What you'll see after build

1. Header gains a `CTI | Clinical` toggle.
2. Switch to **Clinical** → amber "simulation" banner appears, sample texts on `Data Ingestion` change to synthetic discharge summaries, the KG legend on `KG Construction` shows medical entity colors.
3. Run the same pipeline → graph nodes are Patient/Condition/Medication etc., causal links read "Drug X → AdverseEvent Y", conflicts panel flags drug-drug interactions.
4. Switch back to **CTI** → everything behaves exactly as today.
