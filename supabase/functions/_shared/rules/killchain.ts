// C2 — Kill-chain rules R13–R15 (deterministic, no LLM).
// Edge-function copy of src/lib/conflicts/killchain-rules.ts.

import type { RuleCausalLink, RuleViolation } from "./types.ts";

const PHASE_ORDER = [
  "reconnaissance",
  "resource_development",
  "initial_access",
  "execution",
  "persistence",
  "privilege_escalation",
  "defense_evasion",
  "credential_access",
  "discovery",
  "lateral_movement",
  "collection",
  "command_and_control",
  "exfiltration",
  "impact",
] as const;
type Phase = typeof PHASE_ORDER[number];
const PHASE_INDEX: Record<string, number> = Object.fromEntries(PHASE_ORDER.map((p, i) => [p, i]));

const tag = (v: Omit<RuleViolation, "layer" | "provenance">): RuleViolation => ({
  ...v,
  layer: "C2",
  provenance: "adaptive",
});

/** Best-effort phase inference from an effect/cause phrase or TTP id. */
export function inferPhase(label: string): Phase | undefined {
  const l = label.toLowerCase();
  if (/(recon|scanning|osint)/.test(l)) return "reconnaissance";
  if (/(phish|initial access|drive-by|exploit public)/.test(l)) return "initial_access";
  if (/(execut|run|powershell|command)/.test(l)) return "execution";
  if (/(persist|scheduled task|registry run)/.test(l)) return "persistence";
  if (/(priv esc|privilege escalation|uac)/.test(l)) return "privilege_escalation";
  if (/(evasion|obfuscat|masquerad)/.test(l)) return "defense_evasion";
  if (/(credential|password|dump)/.test(l)) return "credential_access";
  if (/(discover|enumerat|recon internal)/.test(l)) return "discovery";
  if (/(lateral|remote services|smb|rdp)/.test(l)) return "lateral_movement";
  if (/(collect|screenshot|clipboard)/.test(l)) return "collection";
  if (/(c2|command.and.control|beacon)/.test(l)) return "command_and_control";
  if (/(exfil|data transfer|upload)/.test(l)) return "exfiltration";
  if (/(ransom|wipe|impact|destroy|encrypt files)/.test(l)) return "impact";
  return undefined;
}

/** R13 — multi-stage jumper / stage inversion. */
export function ruleR13_stageJumper(causal: RuleCausalLink[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  for (const link of causal) {
    const pc = inferPhase(link.cause);
    const pe = inferPhase(link.effect);
    if (!pc || !pe) continue;
    const gap = PHASE_INDEX[pe] - PHASE_INDEX[pc];
    if (gap >= 3) {
      out.push(tag({
        rule_id: "R13_stage_jumper",
        severity: "warning",
        message: `Kill-chain skip: "${link.cause}" (${pc}) → "${link.effect}" (${pe}) skips ${gap - 1} phase(s)`,
        evidence: { pc, pe, gap },
      }));
    } else if (gap < 0) {
      out.push(tag({
        rule_id: "R13_stage_inversion",
        severity: "failure",
        message: `Kill-chain inversion: "${pc}" claimed to enable an earlier phase "${pe}"`,
        evidence: { pc, pe, gap },
      }));
    }
  }
  return out;
}

/** R14 — cyclic causality: a → b → … → a. */
export function ruleR14_cyclicCausality(causal: RuleCausalLink[]): RuleViolation[] {
  const graph = new Map<string, string[]>();
  for (const l of causal) {
    const arr = graph.get(l.cause) ?? [];
    arr.push(l.effect);
    graph.set(l.cause, arr);
  }
  const out: RuleViolation[] = [];
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  function dfs(node: string): string[] | null {
    color.set(node, GRAY);
    stack.push(node);
    for (const nxt of graph.get(node) ?? []) {
      if (color.get(nxt) === GRAY) {
        const start = stack.indexOf(nxt);
        return stack.slice(start).concat(nxt);
      }
      if ((color.get(nxt) ?? WHITE) === WHITE) {
        const cyc = dfs(nxt);
        if (cyc) return cyc;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  }
  for (const node of graph.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const cyc = dfs(node);
      if (cyc) {
        out.push(tag({
          rule_id: "R14_cyclic_causality",
          severity: "failure",
          message: `Causal cycle detected: ${cyc.join(" → ")}`,
          evidence: { cycle: cyc },
        }));
        break;
      }
    }
  }
  return out;
}

/** R15 — orphan impact: impact phase with no upstream execution/lateral/privesc. */
export function ruleR15_orphanImpact(causal: RuleCausalLink[]): RuleViolation[] {
  const out: RuleViolation[] = [];
  const impacts = causal.filter((l) => inferPhase(l.effect) === "impact");
  const upstream = new Set(causal.map((l) => inferPhase(l.cause)).filter((p): p is Phase => !!p));
  const hasIntermediate = ["execution", "lateral_movement", "privilege_escalation"].some((p) =>
    upstream.has(p as Phase)
  );
  if (impacts.length > 0 && !hasIntermediate) {
    for (const l of impacts) {
      out.push(tag({
        rule_id: "R15_orphan_impact",
        severity: "warning",
        message: `Impact "${l.effect}" is claimed without any documented execution/lateral/privesc phase`,
        evidence: l,
      }));
    }
  }
  return out;
}

export function runKillChainRules(causal: RuleCausalLink[]): RuleViolation[] {
  return [
    ...ruleR13_stageJumper(causal),
    ...ruleR14_cyclicCausality(causal),
    ...ruleR15_orphanImpact(causal),
  ];
}
