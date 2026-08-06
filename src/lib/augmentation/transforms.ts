/**
 * GoldAug-CTI — transform families.
 *
 * Each transform takes a Gold-56 seed sample and returns a variant, or `null`
 * when the transform does not apply to that seed. Transforms are pure and
 * deterministic: the same seed + same variant index always yields the same
 * text, so the augmented corpus is reproducible without being stored.
 *
 * Label discipline
 * ----------------
 *   labelPreserving = true  → groundTruth is carried over unchanged (canonical
 *                             surface forms are kept on purpose: the extractor
 *                             is expected to normalise the perturbed surface).
 *   labelPreserving = false → the transform deliberately injects a defect; the
 *                             sample is scored on conflict-rule detection, not
 *                             on F1, and carries `expects`.
 */

import type { TestSample } from "@/lib/test-corpus";
import {
  ACTOR_ALIASES,
  SOFTWARE_ALIASES,
  BOILERPLATE_PREFIX,
  BOILERPLATE_SUFFIX,
  INJECTION_STRINGS,
} from "./aliases";

export type AugFamily = "A1" | "A2" | "A3";

export type AugTransformId =
  | "a1-actor-alias"
  | "a1-software-alias"
  | "a1-defang-ioc"
  | "a1-cve-case"
  | "a2-boilerplate-prefix"
  | "a2-boilerplate-suffix"
  | "a2-sentence-rotate"
  | "a3-prompt-injection"
  | "a3-temporal-inversion";

export interface AugmentedSample extends TestSample {
  /** Gold-56 case this variant was derived from. Cluster key for statistics. */
  seedId: string;
  family: AugFamily;
  transform: AugTransformId;
  labelPreserving: boolean;
  /** Only on non label-preserving (A3 defect) variants. */
  expects?: "no_label_change_under_injection" | "temporal_conflict";
  /** Human-readable description of what the variant probes. */
  probe: string;
}

const FAMILY_OF: Record<AugTransformId, AugFamily> = {
  "a1-actor-alias": "A1",
  "a1-software-alias": "A1",
  "a1-defang-ioc": "A1",
  "a1-cve-case": "A1",
  "a2-boilerplate-prefix": "A2",
  "a2-boilerplate-suffix": "A2",
  "a2-sentence-rotate": "A2",
  "a3-prompt-injection": "A3",
  "a3-temporal-inversion": "A3",
};

export const TRANSFORM_LABEL: Record<AugTransformId, string> = {
  "a1-actor-alias": "Actor alias swap",
  "a1-software-alias": "Product-name variant",
  "a1-defang-ioc": "Defanged IOC",
  "a1-cve-case": "CVE case/format variant",
  "a2-boilerplate-prefix": "Leading boilerplate distractor",
  "a2-boilerplate-suffix": "Trailing boilerplate distractor",
  "a2-sentence-rotate": "Sentence rotation",
  "a3-prompt-injection": "Prompt-injection resilience",
  "a3-temporal-inversion": "Temporal-order defect",
};

/** Deterministic small hash → index, so variant choice never uses Math.random. */
function hashIndex(key: string, mod: number): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}

function make(
  seed: TestSample,
  transform: AugTransformId,
  text: string,
  probe: string,
  opts: { labelPreserving?: boolean; expects?: AugmentedSample["expects"] } = {},
): AugmentedSample {
  return {
    ...seed,
    id: `${seed.id}~${transform}`,
    text,
    source: `${seed.source} [GoldAug ${transform}]`,
    seedId: seed.id,
    family: FAMILY_OF[transform],
    transform,
    labelPreserving: opts.labelPreserving ?? true,
    expects: opts.expects,
    probe,
    groundTruth: seed.groundTruth,
  };
}

/* ── A1: surface-form ── */

function swapFromTable(seed: TestSample, table: Record<string, string>): string | null {
  // Longest key first so "Lazarus Group" wins over "Lazarus".
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  let text = seed.text;
  let hit = false;
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}\\b`, "g");
    if (re.test(text)) {
      text = text.replace(re, table[k]);
      hit = true;
    }
  }
  return hit ? text : null;
}

export function a1ActorAlias(seed: TestSample): AugmentedSample | null {
  const text = swapFromTable(seed, ACTOR_ALIASES);
  if (!text) return null;
  return make(seed, "a1-actor-alias", text, "Alias resolution: gold keeps the canonical actor name.");
}

export function a1SoftwareAlias(seed: TestSample): AugmentedSample | null {
  const text = swapFromTable(seed, SOFTWARE_ALIASES);
  if (!text) return null;
  return make(seed, "a1-software-alias", text, "Product-name normalisation with vendor prefix present.");
}

const DOMAIN_RE = /\b([a-z0-9][a-z0-9-]*)\.(com|net|org|io|ru|cn|top|xyz|info|co\.uk)\b/gi;
const IP_RE = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g;

export function a1DefangIoc(seed: TestSample): AugmentedSample | null {
  let text = seed.text;
  let hit = false;
  if (DOMAIN_RE.test(text)) {
    hit = true;
    text = text.replace(DOMAIN_RE, (_m, a, b) => `${a}[.]${b}`);
  }
  if (IP_RE.test(text)) {
    hit = true;
    text = text.replace(IP_RE, (_m, a, b, c, d) => `${a}.${b}.${c}[.]${d}`);
  }
  if (/https?:\/\//i.test(text)) {
    hit = true;
    text = text.replace(/http(s?):\/\//gi, (_m, s) => `hxxp${s}://`);
  }
  return hit
    ? make(seed, "a1-defang-ioc", text, "Defanged indicators must still resolve to the canonical IOC.")
    : null;
}

export function a1CveCase(seed: TestSample): AugmentedSample | null {
  if (!/CVE-\d{4}-\d{4,7}/.test(seed.text)) return null;
  const text = seed.text.replace(/CVE-(\d{4})-(\d{4,7})/g, (_m, y, n) => `cve-${y}-${n}`);
  return make(seed, "a1-cve-case", text, "Lower-cased CVE identifier; gold keeps the uppercase canonical id.");
}

/* ── A2: structural ── */

export function a2BoilerplatePrefix(seed: TestSample): AugmentedSample {
  const bp = BOILERPLATE_PREFIX[hashIndex(seed.id + "pre", BOILERPLATE_PREFIX.length)];
  return make(
    seed,
    "a2-boilerplate-prefix",
    `${bp} ${seed.text}`,
    "Entity-free boilerplate before the payload — precision must not drop.",
  );
}

export function a2BoilerplateSuffix(seed: TestSample): AugmentedSample {
  const bp = BOILERPLATE_SUFFIX[hashIndex(seed.id + "suf", BOILERPLATE_SUFFIX.length)];
  return make(
    seed,
    "a2-boilerplate-suffix",
    `${seed.text} ${bp}`,
    "Entity-free boilerplate after the payload — precision must not drop.",
  );
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Rotation is only safe when the seed declares no causal links: reordering a
 * narrative that encodes cause→effect would silently change the label.
 */
export function a2SentenceRotate(seed: TestSample): AugmentedSample | null {
  if (seed.groundTruth.causalLinks?.length) return null;
  const parts = splitSentences(seed.text);
  if (parts.length < 3) return null;
  const rotated = [parts[parts.length - 1], ...parts.slice(0, -1)].join(" ");
  return make(
    seed,
    "a2-sentence-rotate",
    rotated,
    "Order-invariance: the same facts presented in a different sentence order.",
  );
}

/* ── A3: adversarial / defect injection ── */

export function a3PromptInjection(seed: TestSample): AugmentedSample {
  const inj = INJECTION_STRINGS[hashIndex(seed.id + "inj", INJECTION_STRINGS.length)];
  return make(
    seed,
    "a3-prompt-injection",
    `${inj} ${seed.text}`,
    "The extractor must ignore the instruction and return the unchanged gold graph.",
    { labelPreserving: true, expects: "no_label_change_under_injection" },
  );
}

/**
 * Appends a statement that inverts the seed's first causal link. The gold graph
 * is unchanged; what changes is that a temporal/causal conflict (R8-R13) must now
 * fire. Scored as rule recall, never as F1.
 */
export function a3TemporalInversion(seed: TestSample): AugmentedSample | null {
  const link = seed.groundTruth.causalLinks?.[0];
  if (!link) return null;
  const text =
    `${seed.text} Telemetry review indicates that ${link.effect} was observed several days ` +
    `before ${link.cause} occurred.`;
  return make(
    seed,
    "a3-temporal-inversion",
    text,
    `Injected inversion of "${link.cause} → ${link.effect}"; a temporal conflict must be raised.`,
    { labelPreserving: false, expects: "temporal_conflict" },
  );
}

export const TRANSFORMS: ((s: TestSample) => AugmentedSample | null)[] = [
  a1ActorAlias,
  a1SoftwareAlias,
  a1DefangIoc,
  a1CveCase,
  a2BoilerplatePrefix,
  a2BoilerplateSuffix,
  a2SentenceRotate,
  a3PromptInjection,
  a3TemporalInversion,
];
