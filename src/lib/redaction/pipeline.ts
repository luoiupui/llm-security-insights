/**
 * Redaction pipeline orchestrator.
 * Steps: Detect (regex) → Resolve (federated) → Adjudicate (LLM, optional)
 *        → Guard (non-downgrade) → Mask (one-way).
 * Pure simulation: adjudicate step can be skipped via { useLlm: false }.
 */
import { loadPolicy, PolicyDomain, PolicyRule } from "./policy";
import { federatedLookup } from "./resolvers";
import { applyMask, MaskResult } from "./mask";
import { dedupeSpans, guardDecision, SpanDecision } from "./guard";
import { supabase } from "@/integrations/supabase/client";

export interface PipelineInput {
  text: string;
  domain: PolicyDomain;
  metadata?: { year?: number; sealed_until?: number | null };
  useLlm?: boolean;
}

export interface PipelineTrace {
  decisions: SpanDecision[];
  resolverHits: number;
  llmInvoked: boolean;
  llmUpgrades: number;
  policyVersion: string;
  durationMs: number;
}

export interface PipelineOutput extends MaskResult {
  trace: PipelineTrace;
}

/** Run all regex rules from the policy against the text. */
function runRuleStage(text: string, rules: PolicyRule[]): SpanDecision[] {
  const out: SpanDecision[] = [];
  for (const r of rules) {
    if (!r.pattern) continue;
    let re: RegExp;
    try { re = new RegExp(r.pattern, "gi"); } catch { continue; }
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        axis: r.axis,
        rule_id: r.id,
        action: r.action,
        placeholder: r.placeholder,
        source: "rule",
        rationale: r.rationale,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

/** Conditional (federated) rules: name-spotting + resolver lookup. */
async function runConditionalStage(
  text: string, rules: PolicyRule[], metadata?: { year?: number; sealed_until?: number | null },
): Promise<SpanDecision[]> {
  const out: SpanDecision[] = [];
  const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(text))) {
    const term = m[1];
    if (seen.has(term)) continue;
    seen.add(term);
    const fed = await federatedLookup(term);
    if (!fed.anyHit) {
      // Living-person heuristic: no Wikidata hit + Archive domain → presumed living.
      const livingRule = rules.find(r => r.id === "ARCH-LIVING");
      if (livingRule) {
        out.push({
          start: m.index, end: m.index + term.length, axis: livingRule.axis,
          rule_id: livingRule.id, action: livingRule.action,
          placeholder: livingRule.placeholder, source: "rule",
          rationale: "No Wikidata record → presumed living",
        });
      }
      continue;
    }
    // Wikidata hit: check death date.
    const dod = (fed.wikidata.data.date_of_death as string) ?? null;
    if (dod) {
      const deathYear = parseInt(dod.slice(0, 4), 10);
      const now = new Date().getFullYear();
      if (now - deathYear < 70) {
        const r = rules.find(x => x.id === "ARCH-LIVING");
        if (r) out.push({
          start: m.index, end: m.index + term.length, axis: r.axis, rule_id: r.id,
          action: r.action, placeholder: r.placeholder, source: "rule",
          rationale: `Died ${deathYear} — within 70y`,
        });
      }
    }
    // Local: relative-of-living
    if (fed.local.data.relative_of_living) {
      const r = rules.find(x => x.id === "ARCH-RELATIVE-LIVING");
      if (r) out.push({
        start: m.index, end: m.index + term.length, axis: r.axis, rule_id: r.id,
        action: r.action, placeholder: r.placeholder, source: "rule",
        rationale: "Local: relative of living person",
      });
    }
    // Geo: sacred site
    if (fed.geonames.data.sacred_site_flag) {
      const r = rules.find(x => x.id === "ARCH-INDIGENOUS-PLACE");
      if (r) out.push({
        start: m.index, end: m.index + term.length, axis: r.axis, rule_id: r.id,
        action: r.action, placeholder: r.placeholder, source: "rule",
        rationale: "GeoNames: sacred site",
      });
    }
  }
  // LCSH cultural terms (lowercase phrases)
  const cultRule = rules.find(r => r.id === "ARCH-CULTURAL");
  if (cultRule) {
    const terms = ["sweat lodge", "potlatch", "kiva", "songline"];
    for (const t of terms) {
      const idx = text.toLowerCase().indexOf(t);
      if (idx >= 0) {
        out.push({
          start: idx, end: idx + t.length, axis: cultRule.axis,
          rule_id: cultRule.id, action: cultRule.action,
          placeholder: cultRule.placeholder, source: "rule",
          rationale: "LCSH/community cultural flag",
        });
      }
    }
  }
  // Sealed document
  if (metadata?.sealed_until && metadata.sealed_until > new Date().getFullYear()) {
    const r = rules.find(x => x.id === "ARCH-SEALED");
    if (r) out.push({
      start: 0, end: text.length, axis: r.axis, rule_id: r.id, action: r.action,
      placeholder: r.placeholder.replace("{year}", String(metadata.sealed_until)),
      source: "rule", rationale: `Sealed until ${metadata.sealed_until}`,
    });
  }
  return out;
}

export async function runRedactionPipeline(input: PipelineInput): Promise<PipelineOutput> {
  const t0 = performance.now();
  const policy = await loadPolicy(input.domain);

  const ruleSpans = runRuleStage(input.text, policy.rules);
  const condSpans = input.domain === "archive"
    ? await runConditionalStage(input.text, policy.rules, input.metadata)
    : [];

  let combined = dedupeSpans([...ruleSpans, ...condSpans]);
  let llmInvoked = false;
  let llmUpgrades = 0;

  if (input.useLlm) {
    llmInvoked = true;
    try {
      const { data, error } = await supabase.functions.invoke("redaction-adjudicate", {
        body: { text: input.text, domain: input.domain, candidates: combined },
      });
      if (!error && data?.decisions) {
        const guarded: SpanDecision[] = [];
        const byPos = new Map(combined.map(s => [`${s.start}:${s.end}`, s]));
        for (const llm of data.decisions as SpanDecision[]) {
          const key = `${llm.start}:${llm.end}`;
          const rule = byPos.get(key) ?? null;
          const g = guardDecision(rule, { ...llm, source: "llm" });
          if (g) {
            if (g.source === "guard") llmUpgrades++;
            guarded.push(g);
            byPos.delete(key);
          }
        }
        // Preserve rule decisions the LLM omitted.
        byPos.forEach(v => guarded.push(v));
        combined = dedupeSpans(guarded);
      }
    } catch {
      // LLM unavailable — fall back to rule-only (safe default).
    }
  }

  const masked = applyMask(input.text, combined);
  const trace: PipelineTrace = {
    decisions: combined,
    resolverHits: condSpans.length,
    llmInvoked,
    llmUpgrades,
    policyVersion: policy.version,
    durationMs: Math.round(performance.now() - t0),
  };
  return { ...masked, trace };
}
