/**
 * bench-schedule — Phase N1K fan-out.
 * Picks up to `batch_size` cases from bench_cases (optionally filtered by
 * strata), inserts a queued row into bench_runs for each (case, pathway),
 * and asynchronously dispatches bench-worker in chunks.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const CHUNK = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supaUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batch_size ?? 20), 1), 1000);
    const pathways: string[] = Array.isArray(body.pathways) && body.pathways.length
      ? body.pathways.filter((p: string) => p === "B" || p === "C")
      : ["B"];
    const strata: string[] | null = Array.isArray(body.strata) && body.strata.length
      ? body.strata : null;

    let q = supabase.from("bench_cases").select("id, stratum").limit(batchSize);
    if (strata) q = q.in("stratum", strata);
    const { data: cases, error } = await q;
    if (error) throw error;
    if (!cases || cases.length === 0) {
      return new Response(JSON.stringify({ ok: true, run_batch: null, queued: 0,
        note: "no bench_cases matched — ingest first" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const run_batch = crypto.randomUUID();
    const runs = cases.flatMap((c) => pathways.map((p) => ({
      run_batch, case_id: c.id, pathway: p, status: "queued",
    })));
    const { error: insErr } = await supabase.from("bench_runs").insert(runs);
    if (insErr) throw insErr;

    // Dispatch workers in chunks. Each worker call is fire-and-forget.
    const dispatch = async () => {
      for (let i = 0; i < runs.length; i += CHUNK) {
        try {
          await fetch(`${supaUrl}/functions/v1/bench-worker`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ run_batch, chunk: CHUNK }),
          });
        } catch (e) {
          console.error("worker dispatch failed:", e);
        }
      }
    };
    // @ts-ignore EdgeRuntime provided by Supabase
    EdgeRuntime.waitUntil(dispatch());

    await supabase.from("monitoring_events").insert({
      event_type: "bench_schedule", category: "bench",
      title: `Bench run scheduled: ${runs.length} tasks`,
      detail: `run_batch=${run_batch} pathways=${pathways.join(",")} cases=${cases.length}`,
      metadata: { run_batch, queued: runs.length, pathways },
    });

    return new Response(JSON.stringify({ ok: true, run_batch, queued: runs.length, pathways }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
