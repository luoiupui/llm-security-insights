/**
 * Phase 4 — CorroboratedFinding matcher.
 *
 * Pure function. Joins external CTI TTP claims (narrative side) with
 * CICIDS-style flow records (behavioral side) on MITRE technique id, then
 * emits CorroboratedFinding rows that obey the dual-confidence storage rule
 * from `public/reports/ontology-corroborated-finding-spec.md` §1.2.
 *
 * Pipeline (per candidate pair):
 *   1. Filter flow's `findings[]` by `code_system == "MITRE"`.
 *   2. Match on `technique_id === code`.
 *   3. Apply R11 (unverified external clamp) when reliability < 0.4.
 *   4. Apply R12 freshness decay to `conf_narrative` via `freshness()`.
 *   5. Compute fused = noisy_or by default; caller may pick method.
 *   6. Drop candidates whose fused < `min_fused` (default 0.4) — keeps demo
 *      output meaningful without hiding R11/R12 evidence.
 *
 * NO I/O, NO Supabase. Safe in browser + edge + tests.
 */

import { fuse, freshness, type FusionMethod } from "@/lib/fusion";
import type { CorroboratedFinding } from "@/lib/ontology/corroborated-finding";
import type { FlowFeatureRecord } from "@/lib/test-corpus/flow-samples";
import type { ExternalTtpClaim } from "./external-ttp-fixtures";

export interface MatcherOptions {
  method?: FusionMethod;
  /** Reference "now" for staleness decay. Default = Date.now(). */
  asOf?: Date;
  /** Drop fused < threshold (default 0.4). */
  min_fused?: number;
  /** Weighted-fusion alpha; ignored unless method=="weighted". */
  alpha?: number;
  /** R11 trigger threshold for reliability. */
  unverified_below?: number;
  /** R11 clamp ceiling applied to conf_narrative when unverified. */
  unverified_clamp?: number;
  run_id?: string;
}

export interface MatchedFinding extends CorroboratedFinding {
  /** Raw, pre-decay narrative confidence (audit trail). */
  conf_narrative_raw: number;
  /** Freshness factor in [0.05, 1] applied to conf_narrative_raw. */
  freshness_factor: number;
  /** True when R11 clamp fired. */
  unverified_external: boolean;
  /** Computed fused confidence (NEVER persisted — derived for UI/tests). */
  fused_conf: number;
  actor: string;
  source_url: string;
  technique_id: string;
}

const DEFAULTS: Required<Omit<MatcherOptions, "asOf" | "run_id">> & {
  asOf: Date;
  run_id: string;
} = {
  method: "noisy_or",
  asOf: new Date("2026-04-13T00:00:00Z"),
  min_fused: 0.4,
  alpha: 0.5,
  unverified_below: 0.4,
  unverified_clamp: 0.6,
  run_id: "fusion-matcher-default",
};

export function matchCorroborations(
  external: ExternalTtpClaim[],
  flows: FlowFeatureRecord[],
  opts: MatcherOptions = {},
): MatchedFinding[] {
  const cfg = { ...DEFAULTS, ...opts };
  const out: MatchedFinding[] = [];

  for (const claim of external) {
    for (const flow of flows) {
      const mitreFindings = (flow.findings ?? []).filter(
        (f) => f.code_system === "MITRE" && f.code === claim.technique_id,
      );
      for (const f of mitreFindings) {
        // R11 — unverified external clamp.
        const unverified = claim.reliability < cfg.unverified_below;
        const confNarrRaw = claim.conf_narrative;
        const confNarrClamped = unverified
          ? Math.min(confNarrRaw, cfg.unverified_clamp)
          : confNarrRaw;

        // R12 — temporal decay on narrative side.
        const ageDays = Math.max(
          0,
          (cfg.asOf.getTime() - new Date(claim.published_at).getTime()) /
            86_400_000,
        );
        // Use ttp half-life by default (90d) — matches public/reports/conflict-rules-multimodal-extension.md §1.
        const factor = freshness(ageDays, 90);
        const confNarr = confNarrClamped * factor;

        const confBehav = f.confidence;
        const fused_conf = fuse(cfg.method, confNarr, confBehav, cfg.alpha);
        if (fused_conf < cfg.min_fused) continue;

        out.push({
          id: `corr-${claim.id}-${flow.record_id.slice(0, 8)}`,
          ttp_ref: claim.technique_id,
          ttp_name: claim.technique_name,
          flow_ref: flow.record_id,
          conf_narrative: confNarr,
          conf_behavioral: confBehav,
          fusion_method: cfg.method,
          evidence_window: {
            start: flow.flow_meta.start_ts,
            end: flow.flow_meta.end_ts,
          },
          provenance: {
            producer: "fusion-matcher",
            version: "0.4.0",
            run_id: cfg.run_id,
            repro_preset: "phase4-default",
          },
          created_at: cfg.asOf.toISOString(),
          // ---- derived / audit fields ----
          conf_narrative_raw: confNarrRaw,
          freshness_factor: factor,
          unverified_external: unverified,
          fused_conf,
          actor: claim.actor,
          source_url: claim.source_url,
          technique_id: claim.technique_id,
        });
      }
    }
  }

  // Stable sort: highest fused first, then by id for determinism.
  out.sort((a, b) => b.fused_conf - a.fused_conf || a.id.localeCompare(b.id));
  return out;
}
