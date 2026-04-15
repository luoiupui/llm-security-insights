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
];

/** Get log entries filtered by category */
export function getLogByCategory(category: LogEntry["category"]): LogEntry[] {
  return implementationLog.filter((e) => e.category === category);
}

/** Get latest N entries */
export function getRecentLogs(n: number = 5): LogEntry[] {
  return implementationLog.slice(-n);
}
