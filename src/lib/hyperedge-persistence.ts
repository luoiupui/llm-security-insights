/**
 * Hyperedge persistence (PH4 — Pathway C)
 * -----------------------------------------------------------
 * Writes hyperedges produced by `threat-extract-hyper` into
 * `kg_hyperedges`, and per-source A/B comparison metrics into
 * `kg_pathway_runs`. Both tables have public read; writes are
 * authorized via the service_role used by edge functions, OR
 * — for the dashboard — issued from the client with anon (the
 * insert is rejected unless RLS is widened, by design: dashboard
 * compares in-memory and only persists from the experiment runner).
 *
 * This module is the single source of truth for the row shape
 * so PH5 (KG-Bench Cat 10/11) and PH6 (panels) read/write the
 * same fields.
 */
import { supabase } from "@/integrations/supabase/client";
import type { HyperedgeRecord } from "@/lib/threat-pipeline";

export type Pathway = "B" | "C";

export interface PathwayRunMetrics {
  source_label: string;
  pathway: Pathway;
  triples_count: number;
  hyperedges_count: number;
  conflicts_count: number;
  credibility_score?: number | null;
  latency_ms?: number | null;
  bench_scores?: Record<string, number>;
  notes?: string | null;
  report_id?: string | null;
}

export interface PersistedHyperedgeRow {
  hyperedge_id: string;
  report_id: string | null;
  pathway: Pathway;
  relation_type: string;
  node_ids: string[];
  roles: Record<string, string>;
  qualifiers: Record<string, unknown>;
  source_passage: string | null;
  confidence: number;
  inferred_participants: string[];
  evidence: string | null;
  domain: "cti";
}

export function toPersistedRows(
  hyperedges: HyperedgeRecord[],
  opts: { report_id?: string | null; pathway?: Pathway } = {},
): PersistedHyperedgeRow[] {
  const pathway: Pathway = opts.pathway ?? "C";
  return hyperedges.map((h) => {
    const q = (h.qualifiers ?? {}) as Record<string, unknown>;
    const roles = (q.roles ?? {}) as Record<string, string>;
    const inferred = Array.isArray(q.inferred_participants)
      ? (q.inferred_participants as string[])
      : [];
    const evidence = typeof q.evidence === "string" ? (q.evidence as string) : null;
    return {
      hyperedge_id: h.id,
      report_id: opts.report_id ?? null,
      pathway,
      relation_type: h.type,
      node_ids: h.node_ids,
      roles,
      qualifiers: q,
      source_passage: h.source_passage ?? null,
      confidence: clamp01(h.confidence ?? 0.5),
      inferred_participants: inferred,
      evidence,
      domain: "cti",
    };
  });
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Persist hyperedges. Rejected silently when RLS denies the insert —
 * the dashboard treats persistence as best-effort; the live A/B view
 * does not require DB round-trip.
 */
export async function persistHyperedges(
  hyperedges: HyperedgeRecord[],
  opts: { report_id?: string | null; pathway?: Pathway } = {},
): Promise<{ ok: boolean; written: number; error?: string }> {
  if (hyperedges.length === 0) return { ok: true, written: 0 };
  const rows = toPersistedRows(hyperedges, opts);
  // Cast to satisfy generated Json typing for jsonb columns.
  const { error, count } = await supabase
    .from("kg_hyperedges")
    .insert(rows as unknown as never, { count: "exact" });
  if (error) return { ok: false, written: 0, error: error.message };
  return { ok: true, written: count ?? rows.length };
}


export async function persistPathwayRun(
  metrics: PathwayRunMetrics,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("kg_pathway_runs").insert({
    report_id: metrics.report_id ?? null,
    source_label: metrics.source_label,
    pathway: metrics.pathway,
    triples_count: metrics.triples_count,
    hyperedges_count: metrics.hyperedges_count,
    conflicts_count: metrics.conflicts_count,
    credibility_score: metrics.credibility_score ?? null,
    latency_ms: metrics.latency_ms ?? null,
    bench_scores: metrics.bench_scores ?? {},
    notes: metrics.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchPathwayRuns(
  source_label?: string,
): Promise<PathwayRunMetrics[]> {
  let q = supabase
    .from("kg_pathway_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (source_label) q = q.eq("source_label", source_label);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((r) => ({
    source_label: r.source_label,
    pathway: r.pathway as Pathway,
    triples_count: r.triples_count ?? 0,
    hyperedges_count: r.hyperedges_count ?? 0,
    conflicts_count: r.conflicts_count ?? 0,
    credibility_score: r.credibility_score == null ? null : Number(r.credibility_score),
    latency_ms: r.latency_ms ?? null,
    bench_scores: (r.bench_scores as Record<string, number>) ?? {},
    notes: r.notes ?? null,
    report_id: r.report_id ?? null,
  }));
}
