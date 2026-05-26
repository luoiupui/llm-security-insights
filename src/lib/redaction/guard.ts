/**
 * Symbolic non-downgrade guard.
 * Given a deterministic rule-based action and an LLM adjudicator's proposed
 * action, allow the LLM to ONLY upgrade severity (never downgrade or remove).
 * This is the trust-boundary primitive from white paper §9.
 */
import { ACTION_RANK, ActionType } from "./policy";

export interface SpanDecision {
  start: number;
  end: number;
  axis: string;
  rule_id: string;
  action: ActionType;
  placeholder: string;
  source: "rule" | "llm" | "guard";
  rationale?: string;
}

export function guardDecision(rule: SpanDecision | null, llm: SpanDecision | null): SpanDecision | null {
  if (!rule && !llm) return null;
  if (!rule) {
    // LLM-only proposal — keep but mark as needing review (lower trust).
    return llm ? { ...llm, source: "llm" } : null;
  }
  if (!llm) return rule;

  const ruleR = ACTION_RANK[rule.action];
  const llmR = ACTION_RANK[llm.action];
  // Allow upgrade only.
  if (llmR > ruleR) {
    return { ...llm, source: "guard", rationale: `upgraded ${rule.action} → ${llm.action}` };
  }
  // Reject downgrade — keep rule decision.
  return rule;
}

/** Sort + remove overlapping span decisions (keep highest severity). */
export function dedupeSpans(spans: SpanDecision[]): SpanDecision[] {
  const sorted = [...spans].sort((a, b) =>
    a.start - b.start || ACTION_RANK[b.action] - ACTION_RANK[a.action],
  );
  const kept: SpanDecision[] = [];
  for (const s of sorted) {
    const last = kept[kept.length - 1];
    if (!last || s.start >= last.end) kept.push(s);
    else if (ACTION_RANK[s.action] > ACTION_RANK[last.action]) kept[kept.length - 1] = s;
  }
  return kept;
}
