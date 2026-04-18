# Technical Report — LLM-Enhanced Knowledge Graph & Attribution System

**Generated:** 2026-04-18
**Backbone Model:** google/gemini-3-flash-preview (via Lovable AI Gateway)
**Backend:** Supabase Edge Functions (Lovable Cloud)
**Versions tracked:** 12

---

## 1. System Architecture (4 Layers)

1. **Data Acquisition** — multi-source ingestion (PDF, STIX, blog, forum, OSINT)
2. **LLM Extraction** — graph-native CoT (KG triples constructed *inside* LLM reasoning, not post-hoc)
3. **KG Storage** — STIX 2.1 ontology, transitive inference with confidence decay (×0.85/hop)
4. **Inference Application** — neuro-symbolic conflict detection, causal DAG, attribution

## 2. Innovation vs. OpenCTI / Standard LLM-KG Pipelines

| Aspect | OpenCTI / Standard | This System |
|---|---|---|
| KG construction | Post-hoc parsing of LLM text | Triples emitted **during** LLM reasoning |
| Causality | Separate engine over finished KG | Embedded in LLM CoT (cause→effect triples + temporal order) |
| Conflict detection | Manual rules | 10 symbolic rules + LLM-assisted resolution |
| Attribution | Entity matching | Graph-path weight Π(conf_edge) |
| Hallucination control | Post-filter | In-prompt STIX 2.1 enforcement + confidence scoring |

## 3. Verified LLM Call-Sites (7)

- `supabase/functions/threat-extract/index.ts` → **callGraphNativeLLM (graph-native CoT)** — Graph-native KG triple extraction inside the LLM reasoning chain
- `supabase/functions/threat-extract/index.ts` → **callGraphNativeLLM (causal subgraph)** — Causal subgraph fusion (enables / leads_to / triggers / precedes)
- `supabase/functions/threat-conflicts/index.ts` → **resolveConflictsWithLLM** — LLM-assisted resolution of symbolic conflict-rule violations
- `supabase/functions/threat-kg-query/index.ts` → **performGraphAttribution** — Path-weighted threat-actor attribution over the constructed KG
- `supabase/functions/threat-kg-query/index.ts` → **reconstructGraphAttackPath** — Attack-path reconstruction via topological reasoning
- `supabase/functions/threat-kg-query/index.ts` → **predictFromGraph** — Next-step prediction from current KG state
- `supabase/functions/experiment-runner/index.ts` → **runLLMExtraction** — Live LLM evaluation against ground-truth experiment samples

## 4. Edge Functions

### `supabase/functions/threat-preprocess/index.ts`
- **LLM role:** non-llm
- **Chapter:** 3
- **Purpose:** Multi-source preprocessing: source-type detection, IOC defang, normalization


### `supabase/functions/threat-extract/index.ts`
- **LLM role:** direct-llm-call
- **Chapter:** 3
- **Purpose:** Graph-native CoT extraction — KG triples constructed inside LLM reasoning
  - Builds 8-step Graph-Native CoT prompt (STIX 2.1 enforced in-prompt)
  - POST to https://ai.gateway.lovable.dev/v1/chat/completions
  - Model: google/gemini-3-flash-preview
  - Parses LLM JSON output → nodes / edges / causal subgraph / reasoning trace

### `supabase/functions/threat-conflicts/index.ts`
- **LLM role:** direct-llm-call
- **Chapter:** 4
- **Purpose:** Neuro-symbolic conflict detection (10 rules) + DAG cycle validation
  - Runs 10 symbolic rules over the KG
  - If conflicts found → calls LLM to propose resolutions
  - Computes credibility S = Σ(wᵢ × confᵢ × reliabilityᵢ) / N

### `supabase/functions/threat-kg-query/index.ts`
- **LLM role:** direct-llm-call
- **Chapter:** 4
- **Purpose:** Graph-aware attribution, attack-path reconstruction, prediction
  - 3 distinct LLM call sites (attribute / attack_path / predict)
  - Sends graph topology (hubs, bridges, paths) into the prompt
  - Returns ranked actors + reasoning trace

### `supabase/functions/experiment-runner/index.ts`
- **LLM role:** direct-llm-call
- **Chapter:** 5
- **Purpose:** Live experiment runner — LLM vs BERT-NER vs Rule-based
  - Calls gemini-3-flash-preview on a ground-truth sample
  - Computes precision / recall / F1 against gold labels

## 5. Two-Stage Experiment Framework (Chapter 5)

- **Stage 1:** MITRE ATT&CK + CAPEC (~1,000 samples) — core CTI ontology
- **Stage 2:** + NVD/CVE + STIX/TAXII (~3,050 samples) — scale & diversity
- **Baselines:** BERT-NER (SecureBERT), Rule-based extraction
- **Metrics:** Precision / Recall / F1 per task (NER, RE, Causality, Attribution, Hallucination)

## 6. Repository Inventory (23 files)

| Path | Layer | LLM Role | Chapter |
|---|---|---|---|
| `supabase/functions/threat-preprocess/index.ts` | edge-function | non-llm | 3 |
| `supabase/functions/threat-extract/index.ts` | edge-function | direct-llm-call | 3 |
| `supabase/functions/threat-conflicts/index.ts` | edge-function | direct-llm-call | 4 |
| `supabase/functions/threat-kg-query/index.ts` | edge-function | direct-llm-call | 4 |
| `supabase/functions/experiment-runner/index.ts` | edge-function | direct-llm-call | 5 |
| `src/lib/threat-pipeline.ts` | frontend-lib | orchestrates-llm | 3 |
| `src/hooks/use-threat-pipeline.ts` | frontend-hook | orchestrates-llm | 3 |
| `src/lib/experiment-config.ts` | frontend-lib | non-llm | 5 |
| `src/lib/implementation-log.ts` | frontend-lib | non-llm | — |
| `src/lib/github-sync.ts` | frontend-lib | non-llm | — |
| `src/pages/Overview.tsx` | frontend-page | consumes-llm-output | 2 |
| `src/pages/DataIngestion.tsx` | frontend-page | orchestrates-llm | 3 |
| `src/pages/KGConstruction.tsx` | frontend-page | consumes-llm-output | 3 |
| `src/pages/Attribution.tsx` | frontend-page | consumes-llm-output | 4 |
| `src/pages/Experiments.tsx` | frontend-page | orchestrates-llm | 5 |
| `src/pages/ThreatFeed.tsx` | frontend-page | consumes-llm-output | — |
| `src/pages/ImplementationLog.tsx` | frontend-page | non-llm | — |
| `src/pages/GitHubSync.tsx` | frontend-page | non-llm | — |
| `src/pages/SettingsPage.tsx` | frontend-page | non-llm | — |
| `src/components/AppSidebar.tsx` | frontend-component | non-llm | — |
| `src/components/DashboardLayout.tsx` | frontend-component | non-llm | — |
| `supabase/config.toml` | config | non-llm | — |
| `src/integrations/supabase/client.ts` | config | non-llm | — |

## 7. Version History

### v1.0.0 — Initial 4-Layer Pipeline Architecture (2026-04-15, major)
- Established 4-layer pipeline: Data Acquisition → LLM Extraction → KG Storage → Inference
- Created Supabase Edge Functions for all pipeline stages
- Integrated google/gemini-3-flash-preview as backbone LLM via Lovable AI Gateway
- Built client-side pipeline orchestrator with useThreatPipeline hook

### v1.1.0 — Multi-Source Preprocessing Engine (2026-04-15, major)
- Implemented source-type detection (PDF, STIX, Blog, Forum, OSINT)
- IOC defanging and re-fanging (IPs, domains, hashes, CVEs)
- HTML/markdown stripping and text normalization
- Source reliability scoring based on type classification

### v1.2.0 — 8-Step CoT Prompt Engineering for NER/RE (2026-04-15, major)
- Designed Chain-of-Thought prompts with 8 explicit reasoning steps
- Step 1-2: Entity identification with STIX 2.1 type mapping
- Step 3-4: Relationship extraction with edge typing (relational/temporal/causal/inferred)
- Step 5-6: Confidence scoring with source reliability weighting
- Step 7-8: Graph validation and narrative summary generation

### v1.3.0 — Graph-Native KG Construction (Innovation Beyond OpenCTI) (2026-04-15, major)
- LLM now reasons in (Subject, Predicate, Object) triples from step 1
- STIX 2.1 ontology enforced DURING reasoning, not post-hoc
- Transitive inference: A→uses→B→exploits→C ⟹ A→indirectly_exploits→C
- Confidence decay on inferred edges: conf × 0.85 per hop
- Graph metadata computed within LLM output: density, node/edge count, warnings
- Subgraph clustering for campaign-level grouping
- Reasoning trace preserved for auditability

### v1.4.0 — Hybrid Causality Engine (Embedded + DAG Validation) (2026-04-15, major)
- Primary: Causal extraction embedded in LLM CoT reasoning layer
- LLM outputs (cause → effect) triples with temporal ordering during extraction
- Causal types: enables, leads_to, triggers, precedes
- Kill chain mapping: MITRE ATT&CK tactic alignment per causal link
- Attack timeline reconstruction with temporal certainty scoring
- Validation: Post-hoc DAG cycle detection in conflict engine
- Primary attack path identification via topological sorting

### v1.5.0 — Neuro-Symbolic Conflict Detection (10 Rules) (2026-04-15, major)
- Expanded from 7 to 10 symbolic validation rules
- Rule: Entity confidence threshold (≥0.3)
- Rule: Relation endpoint validation
- Rule: Source reliability weighting
- Rule: Temporal consistency checking
- Rule: Causal cycle detection (DAG validation)
- Rule: Confidence propagation anomaly detection
- Rule: Graph connectivity (orphan node detection)
- Rule: Ontological STIX 2.1 compliance
- Rule: High-confidence edges between low-confidence nodes flagging
- Rule: Duplicate/contradictory relation detection
- Credibility formula: S = Σ(wᵢ × confᵢ × reliabilityᵢ) / N
- LLM-based conflict resolution for ambiguous cases

### v1.6.0 — Graph-Aware Attribution Engine (2026-04-15, major)
- Attribution based on graph path analysis, not just entity matching
- Evidence as graph paths: weight = Π(conf_edge) along path
- Hub/authority/bridge node identification for graph topology
- Alternative actor ranking with path-weight scoring
- Attack path reconstruction via graph traversal
- Reasoning trace output for explainability

### v1.7.0 — Dashboard UI Integration with Live Pipeline (2026-04-15, major)
- Data Ingestion: Live processing console with source-type detection
- KG Construction: Dynamic SVG graph rendering from LLM extraction
- Attribution: Live results with causal timeline and conflict summary
- Pipeline state management via useThreatPipeline hook
- Real-time progress indicators for each pipeline stage

### v1.8.0 — Implementation Log Dashboard & GitHub Sync (2026-04-15, minor)
- Created versioned implementation log tracking all system changes
- New dashboard page for browsing implementation history
- Log file included in repository for GitHub synchronization
- Category-based filtering and impact-level badges

### v2.0.0 — Two-Stage Experiment Framework with Live Runner (2026-04-15, major)
- Stage 1: MITRE ATT&CK + CAPEC datasets (1,000 samples, core CTI ontology)
- Stage 2: + NVD/CVE + STIX/TAXII feeds (3,050 samples, scale & diversity)
- Baselines: BERT-NER (SecureBERT) and Rule-Based extraction engine
- Experiment runner edge function with live LLM evaluation
- Per-task breakdown: NER, RE, Causality, Attribution, Hallucination Control
- Scale effect analysis: Stage 1 → Stage 2 degradation comparison
- Live experiment runner with real-time metric computation against ground truth
- Dataset cards with entity type and sample count metadata

### v2.1.0 — GitHub Sync Dashboard & Live LLM Verification (2026-04-18, minor)
- Audited every file in the repo for LLM involvement (direct call / orchestrator / consumer)
- Catalogued 7 verified LLM call-sites across 4 edge functions (all → google/gemini-3-flash-preview)
- Added live probe button: invokes experiment-runner → AI Gateway, reports round-trip latency
- New 'GitHub Sync' sidebar page with filterable repo inventory table (by layer / LLM role / chapter)

### v2.2.0 — Self-Monitoring Mechanism: Auto-Generated Reports + Drift Scanner (2026-04-18, minor)
- Built scripts/generate-reports.mjs — single command produces 12 artifacts from repo state
- Generates Technical Report (.md + .docx), White Paper (.md + .docx), 3 inventory tables (.csv + .json each), Health Report (.md), and a sha256 manifest.json
- Added SelfMonitoringPanel embedded on Implementation Log and GitHub Sync pages
- Drift scanner: diffs repo inventory vs files referenced in the log, flags undocumented files
- Add-entry form: drafts a new log entry (auto-versioned) and copies a paste-ready TS snippet
- All artifacts served as static downloads from /reports/* with sha256 + byte-size displayed
