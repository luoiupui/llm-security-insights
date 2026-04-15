import { useState, useCallback } from "react";
import {
  preprocessText,
  extractThreats,
  detectConflicts,
  performAttribution,
  runFullPipeline,
  type PreprocessResult,
  type ExtractionResult,
  type ConflictAnalysis,
  type AttributionResult,
  type ThreatEntity,
  type ThreatRelation,
  type CausalLink,
  type GraphNative,
} from "@/lib/threat-pipeline";
import { toast } from "sonner";

export interface PipelineState {
  isProcessing: boolean;
  currentStep: string;
  preprocessing: PreprocessResult | null;
  extraction: ExtractionResult | null;
  conflicts: ConflictAnalysis | null;
  attribution: AttributionResult | null;
  error: string | null;
}

export function useThreatPipeline() {
  const [state, setState] = useState<PipelineState>({
    isProcessing: false,
    currentStep: "",
    preprocessing: null,
    extraction: null,
    conflicts: null,
    attribution: null,
    error: null,
  });

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
      setState((s) => ({ ...s, error: msg }));
      toast.error(msg);
      return null;
    } finally {
      setState((s) => ({ ...s, isProcessing: false }));
    }
  }, []);

  const runExtraction = useCallback(async (text: string, mode: "full" | "ner" | "re" | "causality" = "full", sourceType?: string, reliability?: number) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Graph-Native LLM Extraction..." }));
    try {
      const result = await extractThreats(text, mode, sourceType, reliability);
      setState((s) => ({ ...s, extraction: result, currentStep: "Graph-Native Extraction complete" }));
      const nodeCount = result.graph_native?.nodes?.length || result.ner?.entities?.length || 0;
      const edgeCount = result.graph_native?.edges?.length || result.re?.relations?.length || 0;
      const causalCount = result.causality?.causal_links?.length || 0;
      toast.success(`Graph-Native: ${nodeCount} nodes, ${edgeCount} edges, ${causalCount} causal links`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Extraction failed";
      setState((s) => ({ ...s, error: msg }));
      toast.error(msg);
      return null;
    } finally {
      setState((s) => ({ ...s, isProcessing: false }));
    }
  }, []);

  const runConflictDetection = useCallback(async (entities: ThreatEntity[], relations: ThreatRelation[], causalLinks: CausalLink[], reliability?: number, graphNative?: GraphNative) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Graph-Integrated Conflict detection..." }));
    try {
      const result = await detectConflicts(entities, relations, causalLinks, reliability, graphNative);
      setState((s) => ({ ...s, conflicts: result, currentStep: "Conflict detection complete" }));
      toast.success(`Conflicts: ${result.summary.passed} passed, ${result.summary.warnings} warnings, ${result.summary.failures} failures (${result.summary.total_rules} rules)`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Conflict detection failed";
      setState((s) => ({ ...s, error: msg }));
      toast.error(msg);
      return null;
    } finally {
      setState((s) => ({ ...s, isProcessing: false }));
    }
  }, []);

  const runAttribution = useCallback(async (query: string, entities: ThreatEntity[], relations: ThreatRelation[], causalLinks: CausalLink[], graphNative?: GraphNative) => {
    setState((s) => ({ ...s, isProcessing: true, error: null, currentStep: "Graph-Aware Attribution..." }));
    try {
      const result = await performAttribution(query, entities, relations, causalLinks, graphNative);
      setState((s) => ({ ...s, attribution: result, currentStep: "Attribution complete" }));
      toast.success(`Attributed to: ${result.attributed_actor} (${(result.confidence * 100).toFixed(0)}% confidence)`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Attribution failed";
      setState((s) => ({ ...s, error: msg }));
      toast.error(msg);
      return null;
    } finally {
      setState((s) => ({ ...s, isProcessing: false }));
    }
  }, []);

  const runFull = useCallback(async (rawText: string, sourceType?: string, query?: string) => {
    setState({
      isProcessing: true,
      currentStep: "Starting Graph-Native Pipeline...",
      preprocessing: null,
      extraction: null,
      conflicts: null,
      attribution: null,
      error: null,
    });
    try {
      setStep("Layer 1: Data Acquisition & Preprocessing...");
      const result = await runFullPipeline(rawText, sourceType, query);
      setState({
        isProcessing: false,
        currentStep: "Pipeline complete",
        preprocessing: result.preprocessing,
        extraction: result.extraction,
        conflicts: result.conflicts,
        attribution: result.attribution,
        error: null,
      });
      toast.success(`Graph-Native pipeline complete — attributed to ${result.attribution.attributed_actor}`);
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
    runExtraction,
    runConflictDetection,
    runAttribution,
    runFull,
  };
}
