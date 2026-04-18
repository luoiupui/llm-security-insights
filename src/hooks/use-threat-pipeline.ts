import { useState, useCallback } from "react";
import {
  preprocessText,
  retrieveContext,
  extractThreats,
  validateAgainstKB,
  detectConflicts,
  performAttribution,
  persistExtraction,
  runFullPipeline,
  type PreprocessResult,
  type ExtractionResult,
  type ConflictAnalysis,
  type AttributionResult,
  type ThreatEntity,
  type ThreatRelation,
  type CausalLink,
  type GraphNative,
  type KBValidation,
  type RAGContext,
} from "@/lib/threat-pipeline";
import { toast } from "sonner";

export interface PipelineState {
  isProcessing: boolean;
  currentStep: string;
  preprocessing: PreprocessResult | null;
  rag: RAGContext | null;
  extraction: ExtractionResult | null;
  kbValidation: KBValidation | null;
  conflicts: ConflictAnalysis | null;
  attribution: AttributionResult | null;
  persistence: { report_id: string; persisted: boolean } | null;
  error: string | null;
}

const INITIAL_STATE: PipelineState = {
  isProcessing: false,
  currentStep: "",
  preprocessing: null,
  rag: null,
  extraction: null,
  kbValidation: null,
  conflicts: null,
  attribution: null,
  persistence: null,
  error: null,
};

export function useThreatPipeline() {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);

  const setStep = (step: string) => setState((s) => ({ ...s, currentStep: step }));

  const runPreprocess = useCallback(async (text: string, sourceType?: string) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Preprocessing..." }));
    try {
      const result = await preprocessText(text, sourceType);
      setState((s) => ({ ...s, preprocessing: result, currentStep: "Preprocessing complete" }));
      toast.success(`Preprocessed: ${result.iocs_found.length} IOCs found`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Preprocessing failed";
      setState((s) => ({ ...s, error: msg })); toast.error(msg);
      return null;
    } finally {
      setState((s) => ({ ...s, isProcessing: false }));
    }
  }, []);

  const runRetrieval = useCallback(async (text: string, topK = 3) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Layer B+C: Retrieving context (Vector RAG + GraphRAG)..." }));
    try {
      const r = await retrieveContext(text, topK);
      setState((s) => ({ ...s, rag: r, currentStep: "Retrieval complete" }));
      toast.success(`RAG: ${r.similar_reports.length} similar reports, ${r.subgraph.entities.length} prior entities`);
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Retrieval failed";
      setState((s) => ({ ...s, error: msg })); toast.error(msg);
      return null;
    } finally { setState((s) => ({ ...s, isProcessing: false })); }
  }, []);

  const runExtraction = useCallback(async (text: string, mode: "full" | "ner" | "re" | "causality" = "full", sourceType?: string, reliability?: number, ragContext = "") => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Graph-Native LLM Extraction..." }));
    try {
      const result = await extractThreats(text, mode, sourceType, reliability, ragContext);
      setState((s) => ({ ...s, extraction: result, currentStep: "Graph-Native Extraction complete" }));
      const nodeCount = result.graph_native?.nodes?.length || result.ner?.entities?.length || 0;
      const edgeCount = result.graph_native?.edges?.length || result.re?.relations?.length || 0;
      const causalCount = result.causality?.causal_links?.length || 0;
      toast.success(`Graph-Native: ${nodeCount} nodes, ${edgeCount} edges, ${causalCount} causal links${result.rag_used ? " (RAG-grounded)" : ""}`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed";
      setState((s) => ({ ...s, error: msg })); toast.error(msg);
      return null;
    } finally { setState((s) => ({ ...s, isProcessing: false })); }
  }, []);

  const runKBValidation = useCallback(async (entities: ThreatEntity[], relations: ThreatRelation[], causalLinks: CausalLink[]) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Layer A: Validating against authoritative KB..." }));
    try {
      const v = await validateAgainstKB(entities, relations, causalLinks);
      setState((s) => ({ ...s, kbValidation: v, currentStep: "KB validation complete" }));
      const acc = (v.accuracy * 100).toFixed(0);
      toast.success(`KB grounding: ${v.summary.ok}/${v.summary.total_checks} verified (${acc}%) · ${v.summary.hallucinated} hallucinated`);
      return v;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "KB validation failed";
      setState((s) => ({ ...s, error: msg })); toast.error(msg);
      return null;
    } finally { setState((s) => ({ ...s, isProcessing: false })); }
  }, []);

  const runConflictDetection = useCallback(async (entities: ThreatEntity[], relations: ThreatRelation[], causalLinks: CausalLink[], reliability?: number, graphNative?: GraphNative) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Graph-Integrated Conflict detection..." }));
    try {
      const result = await detectConflicts(entities, relations, causalLinks, reliability, graphNative);
      setState((s) => ({ ...s, conflicts: result, currentStep: "Conflict detection complete" }));
      toast.success(`Conflicts: ${result.summary.passed} passed, ${result.summary.warnings} warnings, ${result.summary.failures} failures`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Conflict detection failed";
      setState((s) => ({ ...s, error: msg })); toast.error(msg);
      return null;
    } finally { setState((s) => ({ ...s, isProcessing: false })); }
  }, []);

  const runAttribution = useCallback(async (query: string, entities: ThreatEntity[], relations: ThreatRelation[], causalLinks: CausalLink[], graphNative?: GraphNative) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Graph-Aware Attribution..." }));
    try {
      const result = await performAttribution(query, entities, relations, causalLinks, graphNative);
      setState((s) => ({ ...s, attribution: result, currentStep: "Attribution complete" }));
      toast.success(`Attributed to: ${result.attributed_actor} (${(result.confidence * 100).toFixed(0)}%)`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Attribution failed";
      setState((s) => ({ ...s, error: msg })); toast.error(msg);
      return null;
    } finally { setState((s) => ({ ...s, isProcessing: false })); }
  }, []);

  const runFull = useCallback(async (rawText: string, sourceType?: string, query?: string) => {
    setState({ ...INITIAL_STATE, isProcessing: true, currentStep: "Starting RAG-Augmented Graph-Native Pipeline..." });
    try {
      setStep("Layer 1: Preprocessing → Layer B/C: Retrieval → Layer 2: Extract → Layer A: KB grounding → Layer 3/4: Conflicts/Attribution → Persist");
      const result = await runFullPipeline(rawText, sourceType, query);
      setState({
        isProcessing: false,
        currentStep: "Pipeline complete",
        preprocessing: result.preprocessing,
        rag: result.rag,
        extraction: result.extraction,
        kbValidation: result.kbValidation,
        conflicts: result.conflicts,
        attribution: result.attribution,
        persistence: result.persistence,
        error: null,
      });
      toast.success(`Pipeline complete — ${result.attribution.attributed_actor} · KB ${(result.kbValidation.accuracy * 100).toFixed(0)}% verified · ${result.rag.similar_reports.length} prior events used`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Pipeline failed";
      setState((s) => ({ ...s, isProcessing: false, error: msg, currentStep: "Pipeline failed" }));
      toast.error(msg);
      return null;
    }
  }, []);

  return {
    ...state,
    runPreprocess,
    runRetrieval,
    runExtraction,
    runKBValidation,
    runConflictDetection,
    runAttribution,
    runFull,
  };
}
