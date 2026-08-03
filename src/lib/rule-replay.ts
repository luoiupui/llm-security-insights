/**
 * Replayable rule governance (G3, browser side).
 *
 * Re-runs the deterministic adaptive layers (C1, C2, C3) against a stored
 * extraction and diffs the resulting violation set against the one recorded
 * when the KG was produced. C4 is intentionally excluded from replay: it is
 * a distribution-dependent warn-only detector, so it is not reproducible
 * from a frozen snapshot.
 */
import { supabase } from "@/integrations/supabase/client";
import { runTemporalRules } from "@/lib/conflicts/temporal-rules";
import { runKillChainRules } from "@/lib/conflicts/killchain-rules";
import { MINED_RULES } from "@/lib/conflicts/mined-rules.generated";
import type { ThreatEntity, ThreatRelation, CausalLink } from "@/lib/threat-pipeline";

export interface ReplayInput {
  sourceLabel: string;
  reportId?: string | null;
  entities: ThreatEntity[];
  relations: ThreatRelation[];
  causalLinks: CausalLink[];
  /** rule_id list recorded on the original run */
  originalViolationIds: string[];
  originalRuleSetVersion?: string | null;
  replayRuleSetVersion: string;
}

export interface ReplayResult {
  matched: boolean;
  originalCount: number;
  replayCount: number;
  added: string[];
  removed: string[];
}

export function computeDeterministicViolationIds(
  entities: ThreatEntity[],
  relations: ThreatRelation[],
  causalLinks: CausalLink[],
): string[] {
  const ids = [
    ...runTemporalRules(entities, relations, causalLinks).map((v) => v.rule_id),
    ...runKillChainRules(relations, causalLinks).map((v) => v.rule_id),
    ...MINED_RULES.filter((r) => {
      try {
        return r.match({ entities, relations, causal: causalLinks });
      } catch {
        return false;
      }
    }).map((r) => r.rule_id),
  ];
  return ids.sort();
}

export async function replayRun(input: ReplayInput): Promise<ReplayResult> {
  const replayIds = computeDeterministicViolationIds(
    input.entities,
    input.relations,
    input.causalLinks,
  );
  const original = [...input.originalViolationIds].sort();

  const added = replayIds.filter((id) => !original.includes(id));
  const removed = original.filter((id) => !replayIds.includes(id));
  const matched = added.length === 0 && removed.length === 0;

  const result: ReplayResult = {
    matched,
    originalCount: original.length,
    replayCount: replayIds.length,
    added,
    removed,
  };

  await supabase.from("kg_rule_replays").insert({
    source_label: input.sourceLabel,
    report_id: input.reportId ?? null,
    original_rule_set_version: input.originalRuleSetVersion ?? null,
    replay_rule_set_version: input.replayRuleSetVersion,
    original_violation_count: result.originalCount,
    replay_violation_count: result.replayCount,
    diff: { added, removed },
    matched,
  });

  return result;
}
