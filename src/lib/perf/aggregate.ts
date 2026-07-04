/**
 * Aggregation helpers for the Performance tab.
 * Computes p50/p95/p99 latency, throughput, mean tokens/sample.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Pathway } from "./metrics";

export interface StageAggregate {
  pathway: Pathway;
  stage: string;
  n: number;
  p50: number;
  p95: number;
  p99: number;
  mean_ms: number;
  mean_input_tokens: number;
  mean_output_tokens: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

export async function fetchPerfAggregates(sinceIso?: string): Promise<StageAggregate[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = (supabase.from as any)("pipeline_perf_events")
    .select("pathway,stage,wall_ms,input_tokens,output_tokens")
    .limit(20000);
  if (sinceIso) query.gte("created_at", sinceIso);
  const { data, error } = await query;
  if (error || !data) return [];

  type Row = {
    pathway: Pathway;
    stage: string;
    wall_ms: number;
    input_tokens: number | null;
    output_tokens: number | null;
  };
  const rows = data as Row[];
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.pathway}::${r.stage}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const out: StageAggregate[] = [];
  for (const [key, arr] of groups) {
    const [pathway, stage] = key.split("::") as [Pathway, string];
    const sorted = arr.map((r) => r.wall_ms).sort((a, b) => a - b);
    const inTok = arr.map((r) => r.input_tokens ?? 0).filter((x) => x > 0);
    const outTok = arr.map((r) => r.output_tokens ?? 0).filter((x) => x > 0);
    out.push({
      pathway,
      stage,
      n: arr.length,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      mean_ms: sorted.reduce((s, x) => s + x, 0) / sorted.length,
      mean_input_tokens: inTok.length ? inTok.reduce((s, x) => s + x, 0) / inTok.length : 0,
      mean_output_tokens: outTok.length ? outTok.reduce((s, x) => s + x, 0) / outTok.length : 0,
    });
  }
  return out.sort((a, b) => a.pathway.localeCompare(b.pathway) || a.stage.localeCompare(b.stage));
}

export function resourceRatio(base: StageAggregate, comp: StageAggregate) {
  return {
    latency_x: comp.mean_ms / Math.max(base.mean_ms, 1),
    tokens_x:
      (comp.mean_input_tokens + comp.mean_output_tokens) /
      Math.max(base.mean_input_tokens + base.mean_output_tokens, 1),
  };
}
