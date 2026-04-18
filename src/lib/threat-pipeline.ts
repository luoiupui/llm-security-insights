/**
 * Threat Intelligence Pipeline Client
 * Graph-Native LLM Architecture (Innovation beyond OpenCTI)
 *
 * Layer 1: Data Acquisition → threat-preprocess
 * Layer B+C: Retrieval (Vector RAG + GraphRAG) → threat-rag (embed_and_retrieve)
 * Layer 2: Graph-Native LLM Extraction (RAG-augmented) → threat-extract
 * Layer A: Authoritative KB Grounding → kb-validate (deterministic)
 * Layer 3+4: Conflict + Attribution → threat-conflicts + threat-kg-query
 * Layer C persist: store KG for future retrieval → threat-rag (persist)
 */

import { supabase } from "@/integrations/supabase/client";

/* ── Types ── */

export interface ThreatEntity {
  name: string;
  type: "threat_actor" | "malware" | "vulnerability" | "ttp" | "infrastructure" | "software" | "campaign" | "indicator" | "identity";
  confidence: number;
  stix_type?: string;
  mitre_id?: string;
  context?: string;
  propagated_confidence?: number;
}

export interface ThreatRelation {
  source: string;
  relation: string;
  target: string;
  confidence: number;
  evidence?: string;
  edge_type?: "relational" | "temporal" | "causal" | "inferred";
  derived_from?: string;
}

export interface CausalLink {
  cause: string;
  effect: string;
  causal_type: "enables" | "leads_to" | "triggers" | "precedes";
  temporal_order: number;
  confidence: number;
  evidence?: string;
  mitre_tactic?: string;
}

export interface GraphNative {
  nodes: ThreatEntity[];
  edges: ThreatRelation[];
  subgraphs: { name: string; type: string; node_ids: string[] }[];
  graph_metadata: {
    node_count: number;
    edge_count: number;
    density: number;
    narrative: string;
    stix_compliance?: number;
  };
  graph_warnings: { type: string; detail: string; affected_items?: string[] }[];
  reasoning_trace: string;
}

export interface PreprocessResult {
  cleaned_text: string;
  source_type: string;
  reliability_score: number;
  iocs_found: { type: string; value: string; defanged: string }[];
  cleaning_steps: string[];
  metadata: Record<string, unknown>;
}

export interface ExtractionResult {
  ner?: { entities: ThreatEntity[]; narrative_summary?: string };
  re?: { relations: ThreatRelation[] };
  causality?: {
    causal_links: CausalLink[];
    attack_timeline?: { order: number; event: string; timestamp_mentioned?: string; certainty?: string }[];
    kill_chain_mapping?: { tactic: string; technique_id?: string; technique_name?: string; events: string[] }[];
    primary_attack_path?: string[];
  };
  graph_native?: GraphNative;
  extraction_method?: string;
  source_type: string;
  source_reliability: number;
  timestamp: string;
  rag_used?: boolean;
}

export interface KBValidationFinding {
  kind: "ok" | "hallucinated" | "malformed" | "non_canonical";
  id_type: "mitre_technique" | "mitre_tactic" | "cve" | "stix_sdo" | "stix_sro" | "capec";
  raw_value: string;
  matched_name?: string | null;
  suggestion?: string | null;
  entity_name?: string;
}

export interface KBValidation {
  findings: KBValidationFinding[];
  summary: { total_checks: number; ok: number; hallucinated: number; malformed: number; non_canonical: number };
  accuracy: number;
  kb_size: number;
}

export interface RAGContext {
  similar_reports: Array<{ id: string; source_text: string; summary: string; similarity: number; created_at: string }>;
  subgraph: {
    entities: Array<{ name: string; entity_type: string; mitre_id?: string }>;
    relations: Array<{ source_name: string; target_name: string; relation: string }>;
  };
  context_block: string;
  embedding_used: boolean;
}

export interface ConflictResult {
  rule: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  type: string;
  affected_items?: string[];
}

export interface ConflictAnalysis {
  conflicts: ConflictResult[];
  credibility_score: number;
  llm_resolution: string | null;
  summary: { total_rules: number; passed: number; warnings: number; failures: number };
}

export interface AttributionResult {
  attributed_actor: string;
  confidence: number;
  credibility_score?: number;
  graph_topology?: {
    hub_nodes: string[];
    authority_nodes: string[];
    bridge_nodes: string[];
    graph_density: number;
  };
  evidence_chain: { evidence: string; weight: number; source_type?: string; graph_path?: string }[];
  attack_stages: { stage: string; technique?: string; detail: string; mitre_tactic?: string }[];
  causal_chain?: CausalLink[];
  alternative_actors?: { actor: string; confidence: number; reason?: string; path_weight?: number }[];
  reasoning_trace?: string;
}

/* ── Layer 1: Preprocess ── */

export async function preprocessText(text: string, sourceType: string = "auto"): Promise<PreprocessResult> {
  const { data, error } = await supabase.functions.invoke("threat-preprocess", {
    body: { text, source_type: sourceType },
  });
  if (error) throw new Error(`Preprocessing failed: ${error.message}`);
  return data;
}

/* ── Layer B+C: Retrieval (Vector RAG + GraphRAG) ── */

export async function retrieveContext(text: string, topK: number = 3): Promise<RAGContext> {
  const { data, error } = await supabase.functions.invoke("threat-rag", {
    body: { mode: "embed_and_retrieve", text, top_k: topK, similarity_threshold: 0.4 },
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);
  return data;
}

export async function persistExtraction(
  sourceText: string,
  sourceType: string,
  extraction: ExtractionResult,
): Promise<{ report_id: string; persisted: boolean }> {
  const { data, error } = await supabase.functions.invoke("threat-rag", {
    body: { mode: "persist", source_text: sourceText, source_type: sourceType, extraction },
  });
  if (error) throw new Error(`Persist failed: ${error.message}`);
  return data;
}

/* ── Layer 2: Graph-Native Extraction (with optional RAG context) ── */

export async function extractThreats(
  text: string,
  mode: "full" | "ner" | "re" | "causality" = "full",
  sourceType: string = "report",
  sourceReliability: number = 0.8,
  ragContext: string = "",
): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke("threat-extract", {
    body: { text, mode, source_type: sourceType, source_reliability: sourceReliability, rag_context: ragContext },
  });
  if (error) throw new Error(`Extraction failed: ${error.message}`);
  return data;
}

/* ── Layer A: Authoritative KB Validation (deterministic) ── */

export async function validateAgainstKB(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[],
): Promise<KBValidation> {
  const { data, error } = await supabase.functions.invoke("kb-validate", {
    body: { entities, relations, causal_links: causalLinks },
  });
  if (error) throw new Error(`KB validation failed: ${error.message}`);
  return data;
}

/* ── Layer 3+4: Conflict Detection ── */

export async function detectConflicts(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[],
  sourceReliability: number = 0.8,
  graphNative?: GraphNative,
): Promise<ConflictAnalysis> {
  const { data, error } = await supabase.functions.invoke("threat-conflicts", {
    body: {
      entities, relations, causal_links: causalLinks,
      source_reliability: sourceReliability, graph_native: graphNative,
    },
  });
  if (error) throw new Error(`Conflict detection failed: ${error.message}`);
  return data;
}

/* ── Layer 4: Attribution ── */

export async function performAttribution(
  query: string,
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[],
  graphNative?: GraphNative,
): Promise<AttributionResult> {
  const { data, error } = await supabase.functions.invoke("threat-kg-query", {
    body: {
      query, entities, relations, causal_links: causalLinks,
      graph_native: graphNative, mode: "attribute",
    },
  });
  if (error) throw new Error(`Attribution failed: ${error.message}`);
  return data;
}

export async function reconstructAttackPath(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[],
  graphNative?: GraphNative,
): Promise<{ attack_path: string }> {
  const { data, error } = await supabase.functions.invoke("threat-kg-query", {
    body: {
      entities, relations, causal_links: causalLinks,
      graph_native: graphNative, mode: "attack_path",
    },
  });
  if (error) throw new Error(`Attack path reconstruction failed: ${error.message}`);
  return data;
}

/* ── Full RAG-Augmented Pipeline ── */

export async function runFullPipeline(
  rawText: string,
  sourceType: string = "auto",
  query: string = "Identify the threat actor and reconstruct the attack chain",
): Promise<{
  preprocessing: PreprocessResult;
  rag: RAGContext;
  extraction: ExtractionResult;
  kbValidation: KBValidation;
  conflicts: ConflictAnalysis;
  attribution: AttributionResult;
  persistence: { report_id: string; persisted: boolean };
}> {
  const preprocessing = await preprocessText(rawText, sourceType);
  const rag = await retrieveContext(preprocessing.cleaned_text, 3);
  const extraction = await extractThreats(
    preprocessing.cleaned_text, "full", preprocessing.source_type,
    preprocessing.reliability_score, rag.context_block,
  );
  const entities = extraction.ner?.entities || [];
  const relations = extraction.re?.relations || [];
  const causalLinks = extraction.causality?.causal_links || [];
  const graphNative = extraction.graph_native;

  const kbValidation = await validateAgainstKB(entities, relations, causalLinks);
  const conflicts = await detectConflicts(entities, relations, causalLinks, preprocessing.reliability_score, graphNative);
  const attribution = await performAttribution(query, entities, relations, causalLinks, graphNative);
  const persistence = await persistExtraction(preprocessing.cleaned_text, preprocessing.source_type, extraction);

  return { preprocessing, rag, extraction, kbValidation, conflicts, attribution, persistence };
}
