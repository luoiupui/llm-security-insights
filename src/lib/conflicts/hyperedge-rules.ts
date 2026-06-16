/**
 * Hyperedge conflict rules R14–R16  (Pathway C, Stage 5'; PH3).
 *
 * These rules operate on the NATIVE hyperedge representation, not on
 * decomposed triples. They catch failures that R1–R13 cannot, because
 * R1–R13 see only one binary edge at a time.
 *
 * R14 — Joint Validity
 *   A hyperedge is rejected if ≥2 of its member participants individually
 *   conflict on a structural axis (date, jurisdiction, actor attribution).
 *   This is the "Brittleness of Distribution" point in the hypergraph note §4.
 *
 * R15 — Qualifier Consistency
 *   A hyperedge cannot carry two qualifiers under the same key with
 *   different values (e.g. two `occurred_at` a year apart). The extractor
 *   should have split the hyperedge; emitting both is a hard fail.
 *
 * R16 — Provenance Overlap
 *   Each `node_ids` participant must overlap (token / substring, case-
 *   insensitive) with `source_passage`, OR the hyperedge must explicitly
 *   flag the participant as inferred (qualifiers.inferred_participants
 *   includes it). Otherwise the provenance does not actually authorise
 *   the n-ary claim — the extractor padded participants.
 *
 * Spec: .lovable/plan.md → "PH3 — Parallel conflict rules (Stage 5')".
 */

import type { Hyperedge } from "@/lib/ontology/hypergraph";

export type HyperedgeRuleId = "R14" | "R15" | "R16";

export interface HyperedgeConflict {
  rule: HyperedgeRuleId;
  status: "pass" | "warn" | "fail";
  type: "joint_validity" | "qualifier_consistency" | "provenance_overlap";
  detail: string;
  /** Hyperedge ids implicated. */
  affected_items: string[];
  /** Optional structured payload for UI rendering. */
  evidence?: Record<string, unknown>;
}

/* -------------------------------------------------------------------------- */
/* R14 — Joint Validity                                                        */
/* -------------------------------------------------------------------------- */

/** Two values for the same structural axis on the same hyperedge → conflict. */
const STRUCTURAL_AXES = ["occurred_at", "jurisdiction", "actor", "campaign"] as const;
type StructuralAxis = (typeof STRUCTURAL_AXES)[number];

/** Lightweight per-hyperedge axis check; cross-hyperedge axis check is R14b below. */
function axisValue(h: Hyperedge, axis: StructuralAxis): string | null {
  const v = (h.qualifiers ?? {})[axis];
  return v == null ? null : String(v).trim().toLowerCase();
}

export function applyR14(hyperedges: Hyperedge[]): HyperedgeConflict {
  // R14 fires when ≥2 hyperedges share a member node but disagree on a
  // structural axis. This is the joint-validity violation: the SAME event
  // cannot have happened on two different dates / in two different
  // jurisdictions / under two different campaigns.
  const conflicts: Array<{ axis: StructuralAxis; node: string; ids: string[]; values: string[] }> = [];

  // Group hyperedges by member node.
  const byNode = new Map<string, Hyperedge[]>();
  for (const h of hyperedges) {
    for (const n of h.node_ids) {
      const key = n.toLowerCase();
      const arr = byNode.get(key) ?? [];
      arr.push(h);
      byNode.set(key, arr);
    }
  }

  for (const [node, group] of byNode) {
    if (group.length < 2) continue;
    for (const axis of STRUCTURAL_AXES) {
      const values = new Map<string, string[]>(); // value → hyperedge ids
      for (const h of group) {
        const v = axisValue(h, axis);
        if (!v) continue;
        const ids = values.get(v) ?? [];
        ids.push(h.id);
        values.set(v, ids);
      }
      if (values.size >= 2) {
        conflicts.push({
          axis,
          node,
          ids: group.map((g) => g.id),
          values: Array.from(values.keys()),
        });
      }
    }
  }

  if (conflicts.length === 0) {
    return {
      rule: "R14",
      status: "pass",
      type: "joint_validity",
      detail: `${hyperedges.length} hyperedge(s) checked; no joint-validity conflicts`,
      affected_items: [],
    };
  }

  const affected = Array.from(new Set(conflicts.flatMap((c) => c.ids)));
  return {
    rule: "R14",
    status: "fail",
    type: "joint_validity",
    detail: `${conflicts.length} joint-validity conflict(s): ${conflicts
      .map((c) => `${c.node} disagrees on ${c.axis} (${c.values.join(" vs ")})`)
      .join("; ")}`,
    affected_items: affected,
    evidence: { conflicts },
  };
}

/* -------------------------------------------------------------------------- */
/* R15 — Qualifier Consistency (intra-hyperedge)                               */
/* -------------------------------------------------------------------------- */

export function applyR15(hyperedges: Hyperedge[]): HyperedgeConflict {
  // A single hyperedge cannot legitimately carry two values for the same
  // qualifier key. The extractor must split the hyperedge instead. We
  // surface this via the array-valued check (qualifier as Array with >1
  // distinct entry) since JSON objects already enforce key uniqueness.
  const offenders: Array<{ id: string; key: string; values: string[] }> = [];

  for (const h of hyperedges) {
    for (const [key, value] of Object.entries(h.qualifiers ?? {})) {
      if (!Array.isArray(value)) continue;
      const distinct = Array.from(new Set(value.map((v) => String(v).trim().toLowerCase()))).filter(Boolean);
      if (distinct.length > 1) {
        offenders.push({ id: h.id, key, values: distinct });
      }
    }
  }

  if (offenders.length === 0) {
    return {
      rule: "R15",
      status: "pass",
      type: "qualifier_consistency",
      detail: `${hyperedges.length} hyperedge(s) checked; qualifiers are key-unique`,
      affected_items: [],
    };
  }

  return {
    rule: "R15",
    status: "fail",
    type: "qualifier_consistency",
    detail: `${offenders.length} hyperedge(s) carry multi-valued qualifiers (should split): ${offenders
      .map((o) => `${o.id}.${o.key}=[${o.values.join(",")}]`)
      .join("; ")}`,
    affected_items: offenders.map((o) => o.id),
    evidence: { offenders },
  };
}

/* -------------------------------------------------------------------------- */
/* R16 — Provenance Overlap                                                    */
/* -------------------------------------------------------------------------- */

/** Normalise a name for substring search (lowercase, strip punctuation, collapse spaces). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function applyR16(hyperedges: Hyperedge[]): HyperedgeConflict {
  const offenders: Array<{ id: string; missing: string[] }> = [];

  for (const h of hyperedges) {
    const passage = norm(h.source_passage);
    const inferred = new Set<string>(
      Array.isArray((h.qualifiers ?? {}).inferred_participants)
        ? ((h.qualifiers ?? {}).inferred_participants as unknown[]).map((x) => norm(String(x)))
        : [],
    );

    const missing: string[] = [];
    for (const node of h.node_ids) {
      const n = norm(node);
      if (!n) continue;
      if (inferred.has(n)) continue;
      // Substring match is intentionally permissive — the LLM may render
      // "U.S. Treasury" in the passage but "US Treasury" in node_ids.
      const tokens = n.split(" ").filter((t) => t.length >= 3);
      const hits = tokens.filter((t) => passage.includes(t)).length;
      const ratio = tokens.length === 0 ? 0 : hits / tokens.length;
      if (ratio < 0.5) missing.push(node);
    }

    if (missing.length > 0) {
      offenders.push({ id: h.id, missing });
    }
  }

  if (offenders.length === 0) {
    return {
      rule: "R16",
      status: "pass",
      type: "provenance_overlap",
      detail: `${hyperedges.length} hyperedge(s) checked; all participants attested in source_passage`,
      affected_items: [],
    };
  }

  // Provenance gaps are a WARN, not FAIL — the LLM may legitimately use a
  // canonical name that differs from the surface form. Status escalates to
  // FAIL only if ≥50% of the hyperedge's participants are missing.
  const hardFail = offenders.some((o) => {
    const h = hyperedges.find((x) => x.id === o.id)!;
    return o.missing.length / h.node_ids.length >= 0.5;
  });

  return {
    rule: "R16",
    status: hardFail ? "fail" : "warn",
    type: "provenance_overlap",
    detail: `${offenders.length} hyperedge(s) have participants missing from source_passage: ${offenders
      .map((o) => `${o.id}=[${o.missing.join(",")}]`)
      .join("; ")}`,
    affected_items: offenders.map((o) => o.id),
    evidence: { offenders },
  };
}

/* -------------------------------------------------------------------------- */
/* Aggregate entrypoint                                                        */
/* -------------------------------------------------------------------------- */

export interface HyperedgeConflictSummary {
  conflicts: HyperedgeConflict[];
  summary: { total_rules: number; passed: number; warnings: number; failures: number };
  /** Hyperedges that failed R14 or R15 (hard joint-validity violations). */
  rejected_hyperedge_ids: string[];
}

export function runHyperedgeRules(hyperedges: Hyperedge[]): HyperedgeConflictSummary {
  const conflicts = [applyR14(hyperedges), applyR15(hyperedges), applyR16(hyperedges)];
  const rejected = new Set<string>();
  for (const c of conflicts) {
    if (c.status === "fail" && (c.rule === "R14" || c.rule === "R15")) {
      c.affected_items.forEach((id) => rejected.add(id));
    }
  }
  return {
    conflicts,
    summary: {
      total_rules: conflicts.length,
      passed: conflicts.filter((c) => c.status === "pass").length,
      warnings: conflicts.filter((c) => c.status === "warn").length,
      failures: conflicts.filter((c) => c.status === "fail").length,
    },
    rejected_hyperedge_ids: Array.from(rejected),
  };
}
