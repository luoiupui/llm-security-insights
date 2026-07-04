/**
 * Compiled conflict rules mined by the LLM proposal loop.
 *
 * This file is INITIALLY EMPTY. Rules land here after a human accepts a
 * candidate in `kg_conflict_rule_candidates` and the compile step runs.
 * Keeping the file in-tree means TypeScript can type-check consumers
 * before any rule is accepted.
 */

import type { ThreatEntity, ThreatRelation, CausalLink } from "@/lib/threat-pipeline";

export interface MinedRule {
  rule_id: string;
  taxonomy: "temporal" | "causal" | "ontological" | "provenance" | "cross_modal" | "kill_chain" | "other";
  description: string;
  match: (ctx: { entities: ThreatEntity[]; relations: ThreatRelation[]; causal: CausalLink[] }) => boolean;
  severity: "warning" | "failure";
  message: string;
}

export const MINED_RULES: MinedRule[] = [];
