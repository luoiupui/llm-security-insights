/**
 * Redaction policy loader + validator.
 * Loads per-domain JSON from /policies/<domain>.json (version-controlled in GitHub).
 */
import { z } from "zod";

export const SensitivityAxis = z.enum([
  "pii", "cultural", "legal_restricted", "security_classified",
]);
export type SensitivityAxis = z.infer<typeof SensitivityAxis>;

export const ActionType = z.enum([
  "redact", "pseudonymize", "generalize", "redact_attribution", "redact_document",
]);
export type ActionType = z.infer<typeof ActionType>;

export const PolicyRule = z.object({
  id: z.string(),
  axis: SensitivityAxis,
  type: z.string().optional(),
  pattern: z.string().optional(),         // regex (for closed-vocab rules)
  condition: z.string().optional(),       // DSL expression (for federated rules)
  action: ActionType,
  placeholder: z.string(),
  rationale: z.string(),
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const Policy = z.object({
  domain: z.string(),
  version: z.string(),
  source: z.string(),
  rules: z.array(PolicyRule),
  ontology_overrides: z.record(z.string()).optional(),
});
export type Policy = z.infer<typeof Policy>;

export type PolicyDomain = "clinical" | "cti" | "archive";

const cache = new Map<PolicyDomain, Policy>();

export async function loadPolicy(domain: PolicyDomain): Promise<Policy> {
  if (cache.has(domain)) return cache.get(domain)!;
  const res = await fetch(`/policies/${domain}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Policy ${domain} not found`);
  const raw = await res.json();
  const parsed = Policy.parse(raw);
  cache.set(domain, parsed);
  return parsed;
}

export function clearPolicyCache() { cache.clear(); }

/** Rank action severity — used by the symbolic non-downgrade guard. */
export const ACTION_RANK: Record<ActionType, number> = {
  generalize: 1,
  pseudonymize: 2,
  redact: 3,
  redact_attribution: 4,
  redact_document: 5,
};
