/**
 * Threat Intelligence Pipeline Client
 * Connects to edge functions for the 4-layer LLM-driven architecture (Ch. 3.1)
 * 
 * Layer 1: Data Acquisition → threat-preprocess
 * Layer 2: LLM Extraction → threat-extract  
 * Layer 3: KG Storage → in-memory temporal KG
 * Layer 4: Inference → threat-kg-query + threat-conflicts
 */

import { supabase } from "@/integrations/supabase/client";

/* ── Types ── */

export interface ThreatEntity {
  name: string;
  type: "threat_actor" | "malware" | "vulnerability" | "ttp" | "infrastructure" | "software";
  confidence: number;
  mitre_id?: string;
  context?: string;
}

export interface ThreatRelation {
  source: string;
  relation: string;
  target: string;
  confidence: number;
  evidence?: string;
}

export interface CausalLink {
  cause: string;
  effect: string;
  causal_type: "enables" | "leads_to" | "triggers" | "precedes";
  temporal_order: number;
  confidence: number;
  evidence?: string;
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
  ner?: {
    entities: ThreatEntity[];
    narrative_summary?: string;
  };
  re?: {
    relations: ThreatRelation[];
  };
  causality?: {
    causal_links: CausalLink[];
    attack_timeline?: { order: number; event: string; timestamp_mentioned?: string }[];
  };
  source_type: string;
  source_reliability: number;
  timestamp: string;
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
  evidence_chain: { evidence: string; weight: number; source_type?: string }[];
  attack_stages: { stage: string; technique?: string; detail: string; mitre_tactic?: string }[];
  causal_chain?: CausalLink[];
  alternative_actors?: { actor: string; confidence: number; reason?: string }[];
  reasoning_trace?: string;
}

/* ── Layer 1: Data Acquisition & Preprocessing ── */

export async function preprocessText(text: string, sourceType: string = "auto"): Promise<PreprocessResult> {
  const { data, error } = await supabase.functions.invoke("threat-preprocess", {
    body: { text, source_type: sourceType },
  });
  if (error) throw new Error(`Preprocessing failed: ${error.message}`);
  return data;
}

/* ── Layer 2: LLM Extraction (NER + RE + Causality) ── */

export async function extractThreats(
  text: string,
  mode: "full" | "ner" | "re" | "causality" = "full",
  sourceType: string = "report",
  sourceReliability: number = 0.8
): Promise<ExtractionResult> {
  const { data, error } = await supabase.functions.invoke("threat-extract", {
    body: { text, mode, source_type: sourceType, source_reliability: sourceReliability },
  });
  if (error) throw new Error(`Extraction failed: ${error.message}`);
  return data;
}

/* ── Layer 3+4: Conflict Detection & Credibility ── */

export async function detectConflicts(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[],
  sourceReliability: number = 0.8
): Promise<ConflictAnalysis> {
  const { data, error } = await supabase.functions.invoke("threat-conflicts", {
    body: { entities, relations, causal_links: causalLinks, source_reliability: sourceReliability },
  });
  if (error) throw new Error(`Conflict detection failed: ${error.message}`);
  return data;
}

/* ── Layer 4: Attribution & Inference ── */

export async function performAttribution(
  query: string,
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[]
): Promise<AttributionResult> {
  const { data, error } = await supabase.functions.invoke("threat-kg-query", {
    body: { query, entities, relations, causal_links: causalLinks, mode: "attribute" },
  });
  if (error) throw new Error(`Attribution failed: ${error.message}`);
  return data;
}

export async function reconstructAttackPath(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[]
): Promise<{ attack_path: string }> {
  const { data, error } = await supabase.functions.invoke("threat-kg-query", {
    body: { entities, relations, causal_links: causalLinks, mode: "attack_path" },
  });
  if (error) throw new Error(`Attack path reconstruction failed: ${error.message}`);
  return data;
}

/* ── Full Pipeline: Preprocess → Extract → Conflicts → Attribute ── */

export async function runFullPipeline(
  rawText: string,
  sourceType: string = "auto",
  query: string = "Identify the threat actor and reconstruct the attack chain"
): Promise<{
  preprocessing: PreprocessResult;
  extraction: ExtractionResult;
  conflicts: ConflictAnalysis;
  attribution: AttributionResult;
}> {
  // Layer 1: Preprocess
  const preprocessing = await preprocessText(rawText, sourceType);

  // Layer 2: Extract (NER + RE + Causality)
  const extraction = await extractThreats(
    preprocessing.cleaned_text,
    "full",
    preprocessing.source_type,
    preprocessing.reliability_score
  );

  // Gather extracted data
  const entities = extraction.ner?.entities || [];
  const relations = extraction.re?.relations || [];
  const causalLinks = extraction.causality?.causal_links || [];

  // Layer 3+4: Conflict detection
  const conflicts = await detectConflicts(entities, relations, causalLinks, preprocessing.reliability_score);

  // Layer 4: Attribution reasoning
  const attribution = await performAttribution(query, entities, relations, causalLinks);

  return { preprocessing, extraction, conflicts, attribution };
}
