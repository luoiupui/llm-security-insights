/**
 * Kill-chain / multi-stage conflict rules (rules 13–15).
 *
 * Detects "multi-stage jumpers" — causal chains that skip Lockheed-Martin
 * kill-chain phases — plus cyclic causality and stage-inversion, both
 * highlighted as uncovered by the reviewer.
 */

import type { CausalLink, ThreatRelation } from "@/lib/threat-pipeline";

export interface KillChainViolation {
  rule_id: string;
  severity: "warning" | "failure";
  message: string;
  evidence: unknown;
}

/**
 * Ordered kill-chain phases. TTP → phase mapping is coarse but covers
 * the MITRE ATT&CK tactics we care about for jumper detection.
 */
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
const PHASE_INDEX: Record<string, number> = Object.fromEntries(
  PHASE_ORDER.map((p, i) => [p, i]),
);

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

/** R13 — multi-stage jumper: cause and effect skip ≥2 kill-chain phases. */
export function ruleR13_stageJumper(causal: CausalLink[]): KillChainViolation[] {
  const out: KillChainViolation[] = [];
  for (const link of causal) {
    const pc = inferPhase(link.cause);
    const pe = inferPhase(link.effect);
    if (!pc || !pe) continue;
    const gap = PHASE_INDEX[pe] - PHASE_INDEX[pc];
    if (gap >= 3) {
      out.push({
        rule_id: "R13_stage_jumper",
        severity: "warning",
        message: `Kill-chain skip: "${link.cause}" (${pc}) → "${link.effect}" (${pe}) skips ${gap - 1} phase(s)`,
        evidence: { pc, pe, gap },
      });
    } else if (gap < 0) {
      out.push({
        rule_id: "R13_stage_inversion",
        severity: "failure",
        message: `Kill-chain inversion: "${pc}" claimed to enable an earlier phase "${pe}"`,
        evidence: { pc, pe, gap },
      });
    }
  }
  return out;
}

/** R14 — cyclic causality: a → b → … → a. */
export function ruleR14_cyclicCausality(causal: CausalLink[]): KillChainViolation[] {
  const graph = new Map<string, string[]>();
  for (const l of causal) {
    const arr = graph.get(l.cause) ?? [];
    arr.push(l.effect);
    graph.set(l.cause, arr);
  }
  const out: KillChainViolation[] = [];
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
        out.push({
          rule_id: "R14_cyclic_causality",
          severity: "failure",
          message: `Causal cycle detected: ${cyc.join(" → ")}`,
          evidence: { cycle: cyc },
        });
        break; // one cycle is enough to flag
      }
    }
  }
  return out;
}

/** R15 — orphan impact: an "impact" phase with no upstream execution/lateral phase. */
export function ruleR15_orphanImpact(causal: CausalLink[]): KillChainViolation[] {
  const out: KillChainViolation[] = [];
  const impacts = causal.filter((l) => inferPhase(l.effect) === "impact");
  const upstreamPhases = new Set(
    causal
      .map((l) => inferPhase(l.cause))
      .filter((p): p is Phase => !!p),
  );
  const hasIntermediate = ["execution", "lateral_movement", "privilege_escalation"].some((p) =>
    upstreamPhases.has(p as Phase),
  );
  if (impacts.length > 0 && !hasIntermediate) {
    for (const l of impacts) {
      out.push({
        rule_id: "R15_orphan_impact",
        severity: "warning",
        message: `Impact "${l.effect}" is claimed without any documented execution/lateral/privesc phase`,
        evidence: l,
      });
    }
  }
  return out;
}

export function runKillChainRules(
  _relations: ThreatRelation[],
  causal: CausalLink[],
): KillChainViolation[] {
  return [
    ...ruleR13_stageJumper(causal),
    ...ruleR14_cyclicCausality(causal),
    ...ruleR15_orphanImpact(causal),
  ];
}
