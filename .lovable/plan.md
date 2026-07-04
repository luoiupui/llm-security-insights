# Implementation roadmap & capability map

Create a single, living document that (a) illustrates everything already implemented in the project across all pathways, domains, and modules, and (b) sets up a versioned roadmap format that gets updated with every future feature. Same artefact shape as the existing `issue3-*.md` reports — Markdown under `public/reports/`, registered in `manifest.json`, downloadable from the Reports panel.

## Deliverables

1. **New file:** `public/reports/implementation-roadmap.md` — the capability map + roadmap.
2. **New file:** `/mnt/documents/threatgraph_capability_map.mmd` — one Mermaid diagram summarising the platform, referenced from the doc via `<lov-artifact>`.
3. **Update:** `public/reports/manifest.json` — one new entry.

No code changes, no schema changes, no UI changes. Research-artefact only.

## Structure of `implementation-roadmap.md`

1. **Purpose & how to read this document**
   - Positions the project as a comprehensive LLM-KG research platform, not a single-purpose extractor.
   - States the update rule: every merged feature adds one row to §6 (Change log) and, if it introduces a new capability, one row to §3 (Capability matrix). Anything not in §3 is not shipped.

2. **User personas addressed** — one paragraph each, so a reader picks the right entry point:
   - **CTI analyst** — Threat Feed, KG Construction (CTI), Attribution, adaptive conflict layers.
   - **Clinical researcher (simulation)** — Domain switch, Clinical KG, PHI-scrub guard, Simulation banner.
   - **ML / KG researcher** — KG-Bench, Experiments, Ablation runner, Pathway A vs B comparison, `stats.ts`.
   - **Privacy / security engineer** — Redaction Lab, Privacy & FL Lab, AI Threat Model, prompt-firewall.
   - **Reproducibility auditor** — Repro panel, `pipeline_perf_events`, deterministic pathway B, mined-rule diffs.
   - **Thesis author / reviewer** — Reports panel, issue-3 reports, SOTA benchmark gap doc, implementation log.

3. **Capability matrix (what is actually implemented today)** — grouped tables. Every row cites the concrete file / edge function / page so the claim is auditable.

   3.1 **Pipelines / pathways.** Pathway B stages (7), Pathway A agent loop with tool catalog, Pathway C hypergraph.
   3.2 **Domains.** CTI (STIX 2.1) + Clinical (ICD-10 / RxCUI / LOINC), domain switch, per-domain ontology & validators.
   3.3 **Knowledge-graph surfaces.** Entities/relations, hypergraph persistence, corroborated-finding ontology, KG query, attribution.
   3.4 **Adaptive reasoning (C1–C4).** Temporal rules, kill-chain rules, LLM-mined→compiled rules, embedding-anomaly hook.
   3.5 **Evaluation.** KG-Bench (7 categories + multilingual), Experiments page, ablation runner, `stats.ts` (Wilson / bootstrap / McNemar / stratified k-fold).
   3.6 **Privacy / safety.** Redaction pipeline, DP, FedAvg simulation, secure-agg, MIA sim, prompt-firewall, PHI-scrub.
   3.7 **Data ingestion.** CISA advisories ingest, KB ingest, multilingual CTI corpus (JA/ZH), flow-feature ingest.
   3.8 **Observability & repro.** `pipeline_perf_events`, self-monitoring panel, repro panel, implementation log, LLM call-site inventory.
   3.9 **Reports & artefacts.** Enumerate every file already in `public/reports/` with a one-line purpose.
   3.10 **GitHub & external sync.** `github-sync.ts`, Reports downloads.

4. **Architecture snapshot (Mermaid)**
   - One diagram showing: input sources → domain switch → Pathway A / B / C → adaptive C1–C4 layer → KG + HG surfaces → evaluation & reporting outputs. Cross-cutting bands for privacy/safety and observability.

5. **Maturity classification** — every row in §3 is tagged with one of:
   - **GA** (used in headline claims, unit-tested, evaluated in KG-Bench),
   - **Beta** (implemented, exercised, no formal benchmark yet),
   - **Sim** (simulation only — e.g. Clinical, FL Lab),
   - **Spec** (design document exists, code partial or absent).

6. **Change log (append-only)** — reverse-chronological table of every meaningful milestone that has already landed, seeded from `implementation-log.csv`. Columns: date, area (§3 sub-section), summary, files touched, maturity.

7. **Forward roadmap** — three time horizons, each is a bullet list keyed to the P0/P1/P2/P3 buckets already used in `issue3-sota-benchmark-gap.md` and `adaptive-layers-clarification.md`, so the roadmap is not a new tax on the project:
   - **Next (P0 — before paper submission):** wire C1–C4 into the live `threat-conflicts` edge function; N=56 → N≥150; run on DNRTI / APTNER; IAA on ≥ 10 % of corpus; version-pin the LLM.
   - **Soon (P1):** Performance tab UI over `pipeline_perf_events`; per-type F1 tables; component ablation C1–C4; per-language F1; STIX 2.1 round-trip validation.
   - **Later (P2 / P3):** fine-tuned upper-bound comparator (LoRA); cross-dataset generalisation run; publish paraphrased corpus; camera-ready polish.

8. **How to update this document** — one short section:
   - Every PR that adds a feature must add (i) one row in §6 change log with today's date, (ii) if new capability, one row in §3 with file citation and maturity tag, (iii) if it changes an existing maturity level, edit the row in place.
   - Every PR that closes a P0/P1/P2/P3 roadmap item must strike it through in §7 and note the closing date.
   - Every quarter, roll the change-log into an "archived milestones" collapsible so §6 stays scannable.

## Technical details

- Pure Markdown, ~600–900 lines, same conventions as `issue3-comparative-scorecard.md`.
- Mermaid diagram written to `/mnt/documents/threatgraph_capability_map.mmd` and referenced via a `<lov-artifact>` tag inside the doc.
- Every capability row cites at least one concrete path (e.g. `src/lib/conflicts/temporal-rules.ts`, `supabase/functions/threat-conflicts/index.ts`, `src/pages/Experiments.tsx`).
- No emojis in Mermaid.
- `manifest.json` gets one appended entry `implementation-roadmap.md`.

## Out of scope

- Any UI panel that renders the roadmap in-app (future item; can be added when Reports panel gets a redesign).
- Any code, edge-function, schema, or test change.
- Auto-generating the change log from git history (kept manual + `implementation-log.csv`-seeded for now).
