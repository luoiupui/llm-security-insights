/**
 * CorroboratedFinding — ontology extension (Phase 3).
 *
 * Reference implementation of the contract defined in
 * `public/reports/ontology-corroborated-finding-spec.md`. The DB table
 * `public.kg_corroborated_findings` is the persistence layer; this module
 * is the in-app reference (helpers, types, fusion math) used by the future
 * fusion job and by KG-Bench scoring.
 *
 * **Storage rule (non-negotiable, spec §1.2):** `conf_narrative` and
 * `conf_behavioral` are independent stored fields. NEVER persist a
 * collapsed `fused_conf` — recompute via `fusedConfidence()` at read time.
 */

import { noisyOr, minFusion, weightedFusion, clamp01 } from "@/lib/fusion";

export type SourceModality = "external_cti" | "internal_telemetry" | "fused";

export type FusionMethod = "noisy_or" | "dempster_shafer" | "min" | "weighted";

export const FUSION_METHODS: ReadonlyArray<FusionMethod> = [
  "noisy_or",
  "dempster_shafer",
  "min",
  "weighted",
] as const;

export interface EvidenceWindow {
  start: string; // ISO-8601
  end: string;   // ISO-8601
}

export interface Provenance {
  producer: string;
  version: string;
  run_id: string;
  repro_preset?: string;
}

export interface CorroboratedFinding {
  id: string;
  ttp_ref: string | null;
  ttp_name: string;
  flow_ref: string;
  conf_narrative: number;
  conf_behavioral: number;
  fusion_method: FusionMethod;
  evidence_window?: EvidenceWindow;
  provenance: Provenance;
  created_at: string;
}

/**
 * Recompute the fused confidence at read time. Never store this value as the
 * sole confidence on a node — the dual signal must remain inspectable so R13
 * (cross-modal disagreement) can fire.
 */
export function fusedConfidence(
  method: FusionMethod,
  conf_narrative: number,
  conf_behavioral: number,
  alpha = 0.5,
): number {
  const n = clamp01(conf_narrative);
  const b = clamp01(conf_behavioral);
  switch (method) {
    case "noisy_or":
      return noisyOr(n, b);
    case "min":
      return minFusion(n, b);
    case "weighted":
      return weightedFusion(n, b, alpha);
    case "dempster_shafer":
      // Research extension — deferred. Fall back to noisy-or with a tag.
      // Spec §1.3 documents this explicitly.
      return noisyOr(n, b);
  }
}

/**
 * Two-key promotion rule (spec §6). A node may only carry `confirmed_threat`
 * when a CorroboratedFinding pairs it with internal telemetry above per-modality
 * thresholds.
 */
export interface PromotionThresholds {
  narrative: number;
  behavioral: number;
}

export const DEFAULT_PROMOTION_THRESHOLDS: PromotionThresholds = {
  narrative: 0.7,
  behavioral: 0.5,
};

export function canPromoteToConfirmedThreat(
  finding: Pick<CorroboratedFinding, "conf_narrative" | "conf_behavioral">,
  thresholds: PromotionThresholds = DEFAULT_PROMOTION_THRESHOLDS,
): boolean {
  return (
    finding.conf_narrative >= thresholds.narrative &&
    finding.conf_behavioral >= thresholds.behavioral
  );
}

/**
 * STIX 2.1 export shape — a Sighting Relationship Object with a custom
 * extension (spec §5). Pure mapping; does not perform I/O.
 */
export interface StixSightingExtension {
  type: "sighting";
  sighting_of_ref: string;
  observed_data_refs: string[];
  first_seen?: string;
  last_seen?: string;
  count?: number;
  extensions: {
    [k: `extension-definition--${string}`]: {
      conf_narrative: number;
      conf_behavioral: number;
      fusion_method: FusionMethod;
      fused_conf_at_export: number;
      fused_conf_snapshot_at: string;
    };
  };
}

export const CORROBORATED_FINDING_EXTENSION_URI =
  "extension-definition--threatgraph-corroborated-finding-v1" as const;

export function toStixSighting(
  finding: CorroboratedFinding,
  observationCount = 1,
): StixSightingExtension {
  const fused = fusedConfidence(
    finding.fusion_method,
    finding.conf_narrative,
    finding.conf_behavioral,
  );
  return {
    type: "sighting",
    sighting_of_ref: finding.ttp_ref ?? `x-ttp-name:${finding.ttp_name}`,
    observed_data_refs: [`x-flow-ref:${finding.flow_ref}`],
    first_seen: finding.evidence_window?.start,
    last_seen: finding.evidence_window?.end,
    count: observationCount,
    extensions: {
      [CORROBORATED_FINDING_EXTENSION_URI]: {
        conf_narrative: finding.conf_narrative,
        conf_behavioral: finding.conf_behavioral,
        fusion_method: finding.fusion_method,
        fused_conf_at_export: fused,
        fused_conf_snapshot_at: new Date().toISOString(),
      },
    },
  };
}

/** Edge types introduced by the fusion layer (spec §2). */
export const FUSION_EDGE_TYPES = ["corroborates", "contradicts"] as const;
export type FusionEdgeType = (typeof FUSION_EDGE_TYPES)[number];
