/**
 * GitHub Sync Inventory — auto-generated catalog of all files in the repo,
 * with their role in the LLM-Enhanced KG & Attribution System.
 *
 * Use this as the source of truth for the "GitHub Sync" dashboard table.
 */

export type FileLayer =
  | "frontend-page"
  | "frontend-component"
  | "frontend-hook"
  | "frontend-lib"
  | "edge-function"
  | "config"
  | "docs"
  | "test";

export type LLMRole =
  | "direct-llm-call"          // makes fetch() to ai.gateway.lovable.dev
  | "orchestrates-llm"         // calls an edge function that calls the LLM
  | "consumes-llm-output"      // renders / processes LLM results
  | "non-llm";                 // unrelated to LLM

export interface RepoFile {
  path: string;
  layer: FileLayer;
  llmRole: LLMRole;
  purpose: string;
  /** Which Chapter of the research outline this maps to (3=Extraction, 4=Causality/Conflict, 5=Experiments) */
  chapter?: 2 | 3 | 4 | 5;
  /** Concrete LLM-related work performed in this file. Empty for non-LLM files. */
  llmWork?: string[];
}

/**
 * Verified call sites — every place where the codebase actually
 * invokes the Lovable AI Gateway (gemini-3-flash-preview).
 * Counted from grep over `ai.gateway.lovable.dev/v1/chat/completions`.
 */
export const LLM_CALL_SITES: Array<{
  file: string;
  functionName: string;
  purpose: string;
  model: string;
}> = [
  {
    file: "supabase/functions/threat-extract/index.ts",
    functionName: "callGraphNativeLLM (graph-native CoT)",
    purpose: "Graph-native KG triple extraction inside the LLM reasoning chain",
    model: "google/gemini-3-flash-preview",
  },
  {
    file: "supabase/functions/threat-extract/index.ts",
    functionName: "callGraphNativeLLM (causal subgraph)",
    purpose: "Causal subgraph fusion (enables / leads_to / triggers / precedes)",
    model: "google/gemini-3-flash-preview",
  },
  {
    file: "supabase/functions/threat-conflicts/index.ts",
    functionName: "resolveConflictsWithLLM",
    purpose: "LLM-assisted resolution of symbolic conflict-rule violations",
    model: "google/gemini-3-flash-preview",
  },
  {
    file: "supabase/functions/threat-kg-query/index.ts",
    functionName: "performGraphAttribution",
    purpose: "Path-weighted threat-actor attribution over the constructed KG",
    model: "google/gemini-3-flash-preview",
  },
  {
    file: "supabase/functions/threat-kg-query/index.ts",
    functionName: "reconstructGraphAttackPath",
    purpose: "Attack-path reconstruction via topological reasoning",
    model: "google/gemini-3-flash-preview",
  },
  {
    file: "supabase/functions/threat-kg-query/index.ts",
    functionName: "predictFromGraph",
    purpose: "Next-step prediction from current KG state",
    model: "google/gemini-3-flash-preview",
  },
  {
    file: "supabase/functions/experiment-runner/index.ts",
    functionName: "runLLMExtraction",
    purpose: "Live LLM evaluation against ground-truth experiment samples",
    model: "google/gemini-3-flash-preview",
  },
];

export const repoInventory: RepoFile[] = [
  // ── Edge functions (backend / LLM layer) ──────────────────────────
  {
    path: "supabase/functions/threat-preprocess/index.ts",
    layer: "edge-function",
    llmRole: "non-llm",
    chapter: 3,
    purpose: "Multi-source preprocessing: source-type detection, IOC defang, normalization",
  },
  {
    path: "supabase/functions/threat-extract/index.ts",
    layer: "edge-function",
    llmRole: "direct-llm-call",
    chapter: 3,
    purpose: "Graph-native CoT extraction — KG triples constructed inside LLM reasoning",
    llmWork: [
      "Builds 8-step Graph-Native CoT prompt (STIX 2.1 enforced in-prompt)",
      "POST to https://ai.gateway.lovable.dev/v1/chat/completions",
      "Model: google/gemini-3-flash-preview",
      "Parses LLM JSON output → nodes / edges / causal subgraph / reasoning trace",
    ],
  },
  {
    path: "supabase/functions/threat-conflicts/index.ts",
    layer: "edge-function",
    llmRole: "direct-llm-call",
    chapter: 4,
    purpose: "Neuro-symbolic conflict detection (10 rules) + DAG cycle validation",
    llmWork: [
      "Runs 10 symbolic rules over the KG",
      "If conflicts found → calls LLM to propose resolutions",
      "Computes credibility S = Σ(wᵢ × confᵢ × reliabilityᵢ) / N",
    ],
  },
  {
    path: "supabase/functions/threat-kg-query/index.ts",
    layer: "edge-function",
    llmRole: "direct-llm-call",
    chapter: 4,
    purpose: "Graph-aware attribution, attack-path reconstruction, prediction",
    llmWork: [
      "3 distinct LLM call sites (attribute / attack_path / predict)",
      "Sends graph topology (hubs, bridges, paths) into the prompt",
      "Returns ranked actors + reasoning trace",
    ],
  },
  {
    path: "supabase/functions/experiment-runner/index.ts",
    layer: "edge-function",
    llmRole: "direct-llm-call",
    chapter: 5,
    purpose: "Live experiment runner — LLM vs BERT-NER vs Rule-based",
    llmWork: [
      "Calls gemini-3-flash-preview on a ground-truth sample",
      "Computes precision / recall / F1 against gold labels",
    ],
  },

  // ── Frontend libs ─────────────────────────────────────────────────
  {
    path: "src/lib/threat-pipeline.ts",
    layer: "frontend-lib",
    llmRole: "orchestrates-llm",
    chapter: 3,
    purpose: "Client orchestrator: chains preprocess → extract → conflicts → query",
    llmWork: ["Invokes 4 edge functions sequentially via supabase.functions.invoke()"],
  },
  {
    path: "src/hooks/use-threat-pipeline.ts",
    layer: "frontend-hook",
    llmRole: "orchestrates-llm",
    chapter: 3,
    purpose: "React hook exposing pipeline state, progress, and results",
  },
  {
    path: "src/lib/experiment-config.ts",
    layer: "frontend-lib",
    llmRole: "non-llm",
    chapter: 5,
    purpose: "Two-stage dataset config (MITRE ATT&CK+CAPEC → +NVD/CVE+STIX/TAXII)",
  },
  {
    path: "src/lib/implementation-log.ts",
    layer: "frontend-lib",
    llmRole: "non-llm",
    purpose: "Versioned change log (10 versions, synced to GitHub)",
  },
  {
    path: "src/lib/github-sync.ts",
    layer: "frontend-lib",
    llmRole: "non-llm",
    purpose: "This file — repository inventory + verified LLM call-site list",
  },

  // ── Frontend pages ────────────────────────────────────────────────
  {
    path: "src/pages/Overview.tsx",
    layer: "frontend-page",
    llmRole: "consumes-llm-output",
    chapter: 2,
    purpose: "System overview dashboard",
  },
  {
    path: "src/pages/DataIngestion.tsx",
    layer: "frontend-page",
    llmRole: "orchestrates-llm",
    chapter: 3,
    purpose: "Source ingestion + live preprocessing console",
  },
  {
    path: "src/pages/KGConstruction.tsx",
    layer: "frontend-page",
    llmRole: "consumes-llm-output",
    chapter: 3,
    purpose: "Renders dynamic SVG KG from graph-native LLM output",
  },
  {
    path: "src/pages/Attribution.tsx",
    layer: "frontend-page",
    llmRole: "consumes-llm-output",
    chapter: 4,
    purpose: "Attribution results, causal timeline, conflict summary",
  },
  {
    path: "src/pages/Experiments.tsx",
    layer: "frontend-page",
    llmRole: "orchestrates-llm",
    chapter: 5,
    purpose: "Experiment dashboard (5 tabs incl. Live Run against LLM)",
  },
  {
    path: "src/pages/ThreatFeed.tsx",
    layer: "frontend-page",
    llmRole: "consumes-llm-output",
    purpose: "Live threat feed view",
  },
  {
    path: "src/pages/ImplementationLog.tsx",
    layer: "frontend-page",
    llmRole: "non-llm",
    purpose: "Versioned implementation history dashboard",
  },
  {
    path: "src/pages/GitHubSync.tsx",
    layer: "frontend-page",
    llmRole: "non-llm",
    purpose: "This page — repo inventory + LLM call verification table",
  },
  {
    path: "src/pages/SettingsPage.tsx",
    layer: "frontend-page",
    llmRole: "non-llm",
    purpose: "Settings",
  },

  // ── Frontend components ───────────────────────────────────────────
  {
    path: "src/components/AppSidebar.tsx",
    layer: "frontend-component",
    llmRole: "non-llm",
    purpose: "Sidebar navigation",
  },
  {
    path: "src/components/DashboardLayout.tsx",
    layer: "frontend-component",
    llmRole: "non-llm",
    purpose: "Top-level dashboard shell",
  },

  // ── Config ────────────────────────────────────────────────────────
  {
    path: "supabase/config.toml",
    layer: "config",
    llmRole: "non-llm",
    purpose: "Edge-function deployment config",
  },
  {
    path: "src/integrations/supabase/client.ts",
    layer: "config",
    llmRole: "non-llm",
    purpose: "Supabase client (auto-generated, do not edit)",
  },
];

/** Aggregate counts for summary cards */
export function getRepoStats() {
  const total = repoInventory.length;
  const directLLM = repoInventory.filter((f) => f.llmRole === "direct-llm-call").length;
  const orchestrates = repoInventory.filter((f) => f.llmRole === "orchestrates-llm").length;
  const consumes = repoInventory.filter((f) => f.llmRole === "consumes-llm-output").length;
  const edgeFns = repoInventory.filter((f) => f.layer === "edge-function").length;
  return { total, directLLM, orchestrates, consumes, edgeFns, callSites: LLM_CALL_SITES.length };
}
