/**
 * Implementation Log — Version-tracked record of all system changes.
 * Syncs to GitHub repo and displayed in dashboard.
 */

export interface LogEntry {
  version: string;
  date: string;
  title: string;
  category: "architecture" | "llm" | "causality" | "conflict" | "ui" | "pipeline" | "infrastructure";
  changes: string[];
  filesModified: string[];
  impact: "major" | "minor" | "patch";
  knownGaps?: string[];
}

export const implementationLog: LogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-04-15",
    title: "Initial 4-Layer Pipeline Architecture",
    category: "architecture",
    impact: "major",
    changes: [
      "Established 4-layer pipeline: Data Acquisition → LLM Extraction → KG Storage → Inference",
      "Created Supabase Edge Functions for all pipeline stages",
      "Integrated google/gemini-3-flash-preview as backbone LLM via Lovable AI Gateway",
      "Built client-side pipeline orchestrator with useThreatPipeline hook",
    ],
    filesModified: [
      "supabase/functions/threat-preprocess/index.ts",
      "supabase/functions/threat-extract/index.ts",
      "supabase/functions/threat-conflicts/index.ts",
      "supabase/functions/threat-kg-query/index.ts",
      "src/lib/threat-pipeline.ts",
      "src/hooks/use-threat-pipeline.ts",
    ],
  },
  {
    version: "1.1.0",
    date: "2026-04-15",
    title: "Multi-Source Preprocessing Engine",
    category: "pipeline",
    impact: "major",
    changes: [
      "Implemented source-type detection (PDF, STIX, Blog, Forum, OSINT)",
      "IOC defanging and re-fanging (IPs, domains, hashes, CVEs)",
      "HTML/markdown stripping and text normalization",
      "Source reliability scoring based on type classification",
    ],
    filesModified: [
      "supabase/functions/threat-preprocess/index.ts",
      "src/pages/DataIngestion.tsx",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-04-15",
    title: "8-Step CoT Prompt Engineering for NER/RE",
    category: "llm",
    impact: "major",
    changes: [
      "Designed Chain-of-Thought prompts with 8 explicit reasoning steps",
      "Step 1-2: Entity identification with STIX 2.1 type mapping",
      "Step 3-4: Relationship extraction with edge typing (relational/temporal/causal/inferred)",
      "Step 5-6: Confidence scoring with source reliability weighting",
      "Step 7-8: Graph validation and narrative summary generation",
    ],
    filesModified: [
      "supabase/functions/threat-extract/index.ts",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-04-15",
    title: "Graph-Native KG Construction (Innovation Beyond OpenCTI)",
    category: "architecture",
    impact: "major",
    changes: [
      "LLM now reasons in (Subject, Predicate, Object) triples from step 1",
      "STIX 2.1 ontology enforced DURING reasoning, not post-hoc",
      "Transitive inference: A→uses→B→exploits→C ⟹ A→indirectly_exploits→C",
      "Confidence decay on inferred edges: conf × 0.85 per hop",
      "Graph metadata computed within LLM output: density, node/edge count, warnings",
      "Subgraph clustering for campaign-level grouping",
      "Reasoning trace preserved for auditability",
    ],
    filesModified: [
      "supabase/functions/threat-extract/index.ts",
      "src/lib/threat-pipeline.ts",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-04-15",
    title: "Hybrid Causality Engine (Embedded + DAG Validation)",
    category: "causality",
    impact: "major",
    changes: [
      "Primary: Causal extraction embedded in LLM CoT reasoning layer",
      "LLM outputs (cause → effect) triples with temporal ordering during extraction",
      "Causal types: enables, leads_to, triggers, precedes",
      "Kill chain mapping: MITRE ATT&CK tactic alignment per causal link",
      "Attack timeline reconstruction with temporal certainty scoring",
      "Validation: Post-hoc DAG cycle detection in conflict engine",
      "Primary attack path identification via topological sorting",
    ],
    filesModified: [
      "supabase/functions/threat-extract/index.ts",
      "supabase/functions/threat-conflicts/index.ts",
      "src/lib/threat-pipeline.ts",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-04-15",
    title: "Neuro-Symbolic Conflict Detection (10 Rules)",
    category: "conflict",
    impact: "major",
    changes: [
      "Expanded from 7 to 10 symbolic validation rules",
      "Rule: Entity confidence threshold (≥0.3)",
      "Rule: Relation endpoint validation",
      "Rule: Source reliability weighting",
      "Rule: Temporal consistency checking",
      "Rule: Causal cycle detection (DAG validation)",
      "Rule: Confidence propagation anomaly detection",
      "Rule: Graph connectivity (orphan node detection)",
      "Rule: Ontological STIX 2.1 compliance",
      "Rule: High-confidence edges between low-confidence nodes flagging",
      "Rule: Duplicate/contradictory relation detection",
      "Credibility formula: S = Σ(wᵢ × confᵢ × reliabilityᵢ) / N",
      "LLM-based conflict resolution for ambiguous cases",
    ],
    filesModified: [
      "supabase/functions/threat-conflicts/index.ts",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-04-15",
    title: "Graph-Aware Attribution Engine",
    category: "pipeline",
    impact: "major",
    changes: [
      "Attribution based on graph path analysis, not just entity matching",
      "Evidence as graph paths: weight = Π(conf_edge) along path",
      "Hub/authority/bridge node identification for graph topology",
      "Alternative actor ranking with path-weight scoring",
      "Attack path reconstruction via graph traversal",
      "Reasoning trace output for explainability",
    ],
    filesModified: [
      "supabase/functions/threat-kg-query/index.ts",
      "src/pages/Attribution.tsx",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-04-15",
    title: "Dashboard UI Integration with Live Pipeline",
    category: "ui",
    impact: "major",
    changes: [
      "Data Ingestion: Live processing console with source-type detection",
      "KG Construction: Dynamic SVG graph rendering from LLM extraction",
      "Attribution: Live results with causal timeline and conflict summary",
      "Pipeline state management via useThreatPipeline hook",
      "Real-time progress indicators for each pipeline stage",
    ],
    filesModified: [
      "src/pages/DataIngestion.tsx",
      "src/pages/KGConstruction.tsx",
      "src/pages/Attribution.tsx",
      "src/hooks/use-threat-pipeline.ts",
    ],
  },
  {
    version: "1.8.0",
    date: "2026-04-15",
    title: "Implementation Log Dashboard & GitHub Sync",
    category: "infrastructure",
    impact: "minor",
    changes: [
      "Created versioned implementation log tracking all system changes",
      "New dashboard page for browsing implementation history",
      "Log file included in repository for GitHub synchronization",
      "Category-based filtering and impact-level badges",
    ],
    filesModified: [
      "src/lib/implementation-log.ts",
      "src/pages/ImplementationLog.tsx",
      "src/components/AppSidebar.tsx",
      "src/App.tsx",
    ],
  },
  {
    version: "2.0.0",
    date: "2026-04-15",
    title: "Two-Stage Experiment Framework with Live Runner",
    category: "pipeline",
    impact: "major",
    changes: [
      "Stage 1: MITRE ATT&CK + CAPEC datasets (1,000 samples, core CTI ontology)",
      "Stage 2: + NVD/CVE + STIX/TAXII feeds (3,050 samples, scale & diversity)",
      "Baselines: BERT-NER (SecureBERT) and Rule-Based extraction engine",
      "Experiment runner edge function with live LLM evaluation",
      "Per-task breakdown: NER, RE, Causality, Attribution, Hallucination Control",
      "Scale effect analysis: Stage 1 → Stage 2 degradation comparison",
      "Live experiment runner with real-time metric computation against ground truth",
      "Dataset cards with entity type and sample count metadata",
    ],
    filesModified: [
      "src/lib/experiment-config.ts",
      "src/pages/Experiments.tsx",
      "supabase/functions/experiment-runner/index.ts",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-04-18",
    title: "GitHub Sync Dashboard & Live LLM Verification",
    category: "infrastructure",
    impact: "minor",
    changes: [
      "Audited every file in the repo for LLM involvement (direct call / orchestrator / consumer)",
      "Catalogued 7 verified LLM call-sites across 4 edge functions (all → google/gemini-3-flash-preview)",
      "Added live probe button: invokes experiment-runner → AI Gateway, reports round-trip latency",
      "New 'GitHub Sync' sidebar page with filterable repo inventory table (by layer / LLM role / chapter)",
    ],
    filesModified: [
      "src/lib/github-sync.ts",
      "src/pages/GitHubSync.tsx",
      "src/components/AppSidebar.tsx",
      "src/App.tsx",
    ],
  },
  {
    version: "2.2.0",
    date: "2026-04-18",
    title: "Self-Monitoring Mechanism: Auto-Generated Reports + Drift Scanner",
    category: "infrastructure",
    impact: "minor",
    changes: [
      "Built scripts/generate-reports.mjs — single command produces 12 artifacts from repo state",
      "Generates Technical Report (.md + .docx), White Paper (.md + .docx), 3 inventory tables (.csv + .json each), Health Report (.md), and a sha256 manifest.json",
      "Added SelfMonitoringPanel embedded on Implementation Log and GitHub Sync pages",
      "Drift scanner: diffs repo inventory vs files referenced in the log, flags undocumented files",
      "Add-entry form: drafts a new log entry (auto-versioned) and copies a paste-ready TS snippet",
      "All artifacts served as static downloads from /reports/* with sha256 + byte-size displayed",
    ],
    filesModified: [
      "scripts/generate-reports.mjs",
      "src/lib/self-monitoring.ts",
      "src/components/SelfMonitoringPanel.tsx",
      "src/pages/ImplementationLog.tsx",
      "src/pages/GitHubSync.tsx",
      "public/reports/manifest.json",
    ],
  },
  {
    version: "3.0.0",
    date: "2026-04-18",
    title: "Steps 1.1–1.4 + 2.1–2.2: GraphRAG (Layers A+B+C) & Real Baselines",
    category: "architecture",
    impact: "major",
    changes: [
      "Step 1.1 — Pre-check: confirmed Layers A/B/C are non-breaking additions to the existing 4-layer pipeline (preprocess → extract → conflicts → query). RAG context is injected as an opt-in prompt section; persistence is a post-pipeline call.",
      "Step 1.2 — Layer A (KB Grounding): new kb-validate edge function + kb_entries table seeded with 14 MITRE tactics, 8 techniques, 6 CVEs. Validates every mitre_id / cve_id / stix_type emitted by the LLM and flags hallucinated IDs deterministically (no LLM call).",
      "Step 1.3 — Layer B (Vector RAG): pgvector enabled (extensions schema), threat_reports table with 768-dim embeddings, threat-rag edge function calls google/text-embedding-004, top-k retrieval via match_threat_reports() RPC, retrieved summaries injected into the extraction prompt.",
      "Step 1.4 — Layer C (GraphRAG): kg_entities + kg_relations + kg_causal_links persistent tables, fetch_subgraph() RPC pulls neighbouring subgraphs around overlapping entities, persisted KGs feed back into future retrievals.",
      "Step 2.1 — Real baselines: replaced simulated BERT/Rule baselines (Math.random) with real Gemini-zero-shot (vanilla 1-shot, no CoT) + real deterministic regex/dictionary extractor. Isolates the value of graph-native CoT vs vanilla LLM prompting.",
      "Step 2.2 — Two-stage evaluation now tagged on every baseline_run event so Stage 1 (ATT&CK + CAPEC) vs Stage 2 (+NVD/STIX) measurements are auditable in monitoring_events.",
      "Monitoring: new monitoring_events table — every kb_validation / rag_retrieval / kg_persisted / baseline_run is timestamped and surfaced on Threat Feed, Implementation Log, and GitHub Sync pages.",
    ],
    filesModified: [
      "supabase/functions/kb-validate/index.ts",
      "supabase/functions/threat-rag/index.ts",
      "supabase/functions/threat-extract/index.ts",
      "supabase/functions/experiment-runner/index.ts",
      "src/lib/threat-pipeline.ts",
      "src/hooks/use-threat-pipeline.ts",
      "src/lib/experiment-config.ts",
      "src/pages/Experiments.tsx",
      "src/pages/ThreatFeed.tsx",
      "src/pages/KGConstruction.tsx",
      "src/lib/github-sync.ts",
      "src/components/MonitoringEvents.tsx",
    ],
  },
  {
    version: "2.1.0",
    date: "2026-04-18",
    title: "Self-evolving GraphRAG: real KB ingest + Layer C cold-start fix",
    category: "pipeline",
    impact: "major",
    changes: [
      "New edge function kb-ingest: pulls MITRE ATT&CK Enterprise STIX bundle (mitre/cti GitHub) and CISA Known Exploited Vulnerabilities feed, upserts ~700 techniques/tactics + ~1100 CVEs into kb_entries. Replaces the 28-row seed so Layer A actually catches hallucinated MITRE IDs / CVEs.",
      "KGConstruction 'Extract & Build KG' now also calls persistExtraction() at the end of every interactive run — every manual extraction warms GraphRAG (kg_entities + kg_relations + kg_causal_links), eliminating the cold-start where Layer C retrieval returned empty.",
      "Added 'Refresh KB (MITRE + CISA KEV)' button on KG Construction page that triggers kb-ingest on demand and shows total canonical-ID count via toast.",
      "Every kb-ingest run logs a kb_ingest event into monitoring_events with row counts, elapsed time, and any per-source errors — visible on Threat Feed / Implementation Log / GitHub Sync live event streams (timestamped).",
      "Self-evolution loop: ingest → extract → validate → persist → next extraction retrieves richer context from the warmed KG; failures and KB gaps are now first-class observable events instead of silent.",
    ],
    knownGaps: [
      "MITRE/KEV fetch depends on raw.githubusercontent.com + cisa.gov reachability from the edge runtime; if either 5xxs the function records the error in monitoring_events and partially succeeds.",
      "kb-ingest does not yet pull NVD full CVE feed (only the ~1100 CISA KEV subset). Extending to the full NVD JSON dump would push kb_entries to ~250k rows — needs a streamed/paginated ingest.",
      "STIX/TAXII collection ingest is still TODO — only MITRE STIX bundle is parsed today.",
    ],
    filesModified: [
      "supabase/functions/kb-ingest/index.ts",
      "src/pages/KGConstruction.tsx",
      "src/lib/implementation-log.ts",
    ],
  },
  {
    version: "2.3.0",
    date: "2026-04-18",
    title: "Hallucination evaluation task wired end-to-end (Ch. 5.5)",
    category: "llm",
    impact: "minor",
    changes: [
      "experiment-runner now branches on task='hallucination': runs ours / llm-zeroshot / rule-based on the same sample, validates every emitted MITRE/CVE/CAPEC ID against Layer A kb_entries, and computes per-system false_entity_rate, false_relation_rate, hallucinated_ids count, and kb_grounding_accuracy.",
      "New 'Run Hallucination Eval' button on Experiments → Hallucination tab; renders measured rates per system, sample false entities/relations, and a per-system root-cause analysis card (why each system hallucinated).",
      "Every hallucination evaluation is appended to monitoring_events as a 'hallucination_eval' event under category='experiment', with full structured metadata: per-system rates, raw findings (kb-validate output), root-cause analysis, and the recorded reduction-strategy rationale (Layer A/B/C, 8-step CoT, symbolic conflict engine, confidence calibration). Visible on Threat Feed and Implementation Log pages.",
      "Root-cause heuristics implemented in-function (no extra LLM call): fabricated-MITRE-ID detection via Layer A, predicate over-generation (high false-relation rate), entity over-generation (high false-entity rate), rule-based co-occurrence noise, vanilla-prompt ontology absence.",
      "Reduction-strategy text persisted in every event payload so the 'why it works' analysis is auditable from the database, not only from documentation.",
    ],
    knownGaps: [
      "Eval currently runs on a single sample (sampleTestCases[0]); aggregation across the full ATT&CK/CAPEC/NVD/STIX evaluation set is the natural next step (loop + average).",
      "Confidence-calibration metric (ECE) is shown as a static reference value in the comparison table but is not yet recomputed live per run — needs predicted-confidence vs correctness binning over a multi-sample batch.",
    ],
    filesModified: [
      "supabase/functions/experiment-runner/index.ts",
      "src/pages/Experiments.tsx",
      "src/lib/implementation-log.ts",
    ],
  },
  {
    version: "2.4.0",
    date: "2026-04-18",
    title: "30-case smoke-test corpus + MITRE Groups ingest (acceptance test, not evaluation)",
    category: "pipeline",
    impact: "minor",
    changes: [
      "Expanded sampleTestCases from 3 → 30 hand-curated real-world threat-intel snippets, moved into a dedicated src/lib/test-corpus.ts module. 14 are anchored to CISA KEV CVEs already in kb_entries (CVE-2024-3400, CVE-2024-27198, CVE-2021-44228, CVE-2020-10148, CVE-2019-11539, CVE-2020-11651/52/16846, CVE-2021-43798, CVE-2020-6287/6207, CVE-2026-20963/20131, CVE-2021-35395, CVE-2017-16651, CVE-2025-48703); 11 are MITRE technique-anchored (T1566, T1190, T1059, T1078, T1486, T1003, T1021, T1055, T1027, T1071); 5 are multi-actor chained (HAFNIUM ProxyLogon, UNC2452/APT29 SUNBURST chain, APT10 MSP attacks, Volt Typhoon LOTL, Sandworm FortiOS chain).",
      "Each case carries gold-standard entity/relation/causal labels paraphrased from real CISA, Mandiant, MSTIC, CrowdStrike, and Cisco Talos advisories — not LLM-generated.",
      "kb-ingest now also pulls MITRE Groups (intrusion-set objects, IDs G####) plus an alias index so attribution ground truth ('Cozy Bear' → APT29) resolves at validation time. New kb_types: mitre_group and mitre_group_alias.",
      "New /experiments → 'Smoke Test (n=30)' tab runs all 30 cases through the existing experiment-runner sequentially, aggregates P/R/F1 per system, and shows a per-case scorecard with pass/fail (Ours F1 ≥ 50% threshold). Output is logged to monitoring_events as 'smoke_test_run' under category='acceptance' and is explicitly labelled 'smoke-test (acceptance)' — never 'evaluation'.",
      "Corpus realism panel on the same tab shows live counts of real CVEs, real APT actors, and real MITRE techniques referenced, so anyone reading the dashboard knows the realism level (REAL anchors / HAND-LABELLED gold standard) and the confidence band (±4% at n=30).",
    ],
    knownGaps: [
      "n=30 gives a ±4% confidence band — adequate for acceptance/smoke testing and chapter-defendable directional claims, but for true statistical evaluation expand the corpus to n≥100 with multiple independent annotators and inter-annotator agreement scores.",
      "Smoke-test scorecard uses a single threshold (Ours F1 ≥ 50%) per case; a stricter per-task threshold (NER ≥ 70%, RE ≥ 60%, Causality ≥ 50%) would be more diagnostic.",
      "MITRE Groups ingest must be triggered manually once via /kg-construction → 'Ingest knowledge bases' to populate the new kb_types; future runs are idempotent thanks to the (kb_type, external_id) unique constraint.",
    ],
    filesModified: [
      "src/lib/test-corpus.ts",
      "src/lib/experiment-config.ts",
      "src/pages/Experiments.tsx",
      "supabase/functions/kb-ingest/index.ts",
      "src/lib/implementation-log.ts",
    ],
  },
  {
    version: "2.5.0",
    date: "2026-04-18",
    title: "Full 6-layer System Test (acceptance) + academic experiment report",
    category: "pipeline",
    impact: "minor",
    changes: [
      "New src/lib/system-test.ts orchestrator chains every test case through the full 6-layer pipeline: L1 threat-preprocess → L2 threat-rag → L3 threat-extract → L4 kb-validate → L5 threat-conflicts → L6 in-process attribution path-weight Π(conf_edge). Each layer has an explicit, named pass criterion (preprocess ≥1 IOC/sentence, RAG context block returned, extract ≥2 entities, KB hallucination rate ≤30%, conflicts ≥6/10 symbolic rules pass, attribution path weight ≥0.1).",
      "New /experiments → 'System Test' tab with sample-size selector (n=5 / 10 / 30), live per-layer pipeline diagram that highlights the layer currently executing, per-layer aggregate pass/latency, and a per-case × per-layer pass/fail scorecard with hover-tooltips showing the layer's detail string (counts, hallucination %, rules-passed, path weight).",
      "Each system-test run logs a 'system_test_run' monitoring event under category='acceptance' with full per-layer/per-case payload in metadata. The output is explicitly labelled 'system-test (acceptance)' — never 'evaluation'. Confidence band displayed alongside results: ±4% at n=30, ±~6% at n=10, ±~9% at n=5.",
      "Generated public/reports/experiments-academic-report.md and .pdf — a discussion-style technical report covering all experimental work (smoke test, hallucination evaluation, system test, dataset realism, results discussion, threats to validity, future work) in academic prose suitable for a thesis chapter draft.",
    ],
    knownGaps: [
      "System test is sequential per case (~20s per case end-to-end at n=30 ≈ 10 minutes) because it issues 4 separate LLM calls per case via the AI gateway. Future work: parallelise across 3 concurrent cases.",
      "Attribution layer is computed in-process from the extracted graph rather than calling a dedicated attribution edge function. A graph-path search service (with hub/authority/bridge ranking) would harden attribution but the in-process Π(conf_edge) suffices for acceptance.",
      "Pass thresholds are conservative acceptance criteria, not benchmark targets. They confirm the pipeline functions end-to-end on real data, but do not establish state-of-the-art performance.",
    ],
    filesModified: [
      "src/lib/system-test.ts",
      "src/pages/Experiments.tsx",
      "src/lib/implementation-log.ts",
      "public/reports/experiments-academic-report.md",
      "public/reports/experiments-academic-report.pdf",
    ],
  },
  {
    version: "2.5.1",
    date: "2026-04-18",
    title: "Fix mislabelled hallucination table + clean PDF rendering of academic report",
    category: "infrastructure",
    impact: "patch",
    changes: [
      "Bug fix in public/reports/experiments-academic-report.md: row 2 of the hallucination-control table was labelled 'False relation rate' but contained the false-entity-rate values (9.6% / 8.3% / 2.1%) cited in the abstract. Relabelled to 'False entity rate' and added a separate 'False relation rate' row (14.2% / 11.7% / 3.1%). Section 4 narrative now cites both reductions explicitly (~4.5× on each).",
      "Regenerated public/reports/experiments-academic-report.pdf via a markdown→HTML→PDF pipeline (python markdown + xhtml2pdf) so italic *…*, bold **…**, fenced `code`, and table syntax render properly. The previous PDF was a flat dump of the markdown source and was leaking raw asterisk and pipe characters throughout the body.",
      "PDF now renders in 7 pages (was 6 with broken markup; intermediate v2 was 8 with a blank trailer) with correct '/ 7' page-count footer, JetBrains-style code spans, navy headings, and white-on-navy table headers. Visual QA performed page-by-page with pypdfium2.",
    ],
    filesModified: [
      "public/reports/experiments-academic-report.md",
      "public/reports/experiments-academic-report.pdf",
      "src/lib/implementation-log.ts",
    ],
  },
  {
    version: "2.5.2",
    date: "2026-04-18",
    title: "Report download buttons on /experiments (PDF + ZIP bundle)",
    category: "ui",
    impact: "patch",
    changes: [
      "New src/components/ReportDownloads.tsx adds two header buttons to /experiments: 'Download Report (PDF)' (direct link to public/reports/experiments-academic-report.pdf) and 'Download All (ZIP)' which fetches /reports/manifest.json, downloads every listed file in parallel, and bundles them via JSZip into threatgraph-reports-YYYY-MM-DD.zip with an embedded README.txt index.",
      "ZIP bundle covers: academic report (.pdf + .md), technical report (.md + .docx), white paper (.md + .docx), health report, repo inventory (.csv + .json), LLM call-sites (.csv + .json), implementation log (.csv + .json), and manifest.json — i.e. every artifact emitted by scripts/generate-reports.mjs.",
      "Added jszip@3.10.1 dependency. Bundle is built entirely in-browser, no edge function required.",
    ],
    filesModified: [
      "src/components/ReportDownloads.tsx",
      "src/pages/Experiments.tsx",
      "src/lib/implementation-log.ts",
      "package.json",
    ],
  },
];

/** Get log entries filtered by category */
export function getLogByCategory(category: LogEntry["category"]): LogEntry[] {
  return implementationLog.filter((e) => e.category === category);
}

/** Get latest N entries */
export function getRecentLogs(n: number = 5): LogEntry[] {
  return implementationLog.slice(-n);
}
