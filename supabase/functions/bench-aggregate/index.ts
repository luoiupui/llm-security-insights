/**
 * bench-aggregate — Phase N1K reduce.
 * Aggregates a run_batch: counts by status, mean latency, total tokens,
 * per-stratum × pathway breakdowns.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  try {
    const body = await req.json().catch(() => ({}));
    const runBatch: string | undefined = body.run_batch;
    if (!runBatch) {
      return new Response(JSON.stringify({ error: "run_batch required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: runs, error } = await supabase
      .from("bench_runs")
      .select("id, pathway, status, metrics, case_id")
      .eq("run_batch", runBatch);
    if (error) throw error;

    const caseIds = [...new Set((runs ?? []).map((r) => r.case_id))];
    const { data: cases } = await supabase
      .from("bench_cases").select("id, stratum, publisher").in("id", caseIds);
    const stratumOf = new Map((cases ?? []).map((c: any) => [c.id, c.stratum]));

    const counts = { queued: 0, running: 0, done: 0, error: 0 };
    const byPathway: Record<string, {
      done: number; error: number; totalLatency: number; totalTokens: number;
      totalEntities: number; totalRelations: number;
    }> = {};
    const byStratum: Record<string, { done: number; total: number }> = {};

    for (const r of runs ?? []) {
      counts[r.status as keyof typeof counts]++;
      byPathway[r.pathway] ??= { done: 0, error: 0, totalLatency: 0, totalTokens: 0, totalEntities: 0, totalRelations: 0 };
      const s = stratumOf.get(r.case_id) ?? "unknown";
      byStratum[s] ??= { done: 0, total: 0 };
      byStratum[s].total++;
      if (r.status === "done") {
        byPathway[r.pathway].done++;
        byStratum[s].done++;
        const m = r.metrics ?? {};
        byPathway[r.pathway].totalLatency += Number(m.latency_ms ?? 0);
        byPathway[r.pathway].totalTokens += Number(m.tokens_est ?? 0);
        byPathway[r.pathway].totalEntities += Number(m.entities ?? 0);
        byPathway[r.pathway].totalRelations += Number(m.relations ?? 0);
      } else if (r.status === "error") {
        byPathway[r.pathway].error++;
      }
    }
    const pathwaySummary = Object.fromEntries(Object.entries(byPathway).map(([p, v]) => [p, {
      done: v.done, error: v.error,
      mean_latency_ms: v.done ? Math.round(v.totalLatency / v.done) : null,
      total_tokens_est: v.totalTokens,
      mean_entities_per_doc: v.done ? +(v.totalEntities / v.done).toFixed(1) : null,
      mean_relations_per_doc: v.done ? +(v.totalRelations / v.done).toFixed(1) : null,
    }]));

    return new Response(JSON.stringify({
      ok: true, run_batch: runBatch, total: (runs ?? []).length,
      counts, pathway: pathwaySummary, stratum: byStratum,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
