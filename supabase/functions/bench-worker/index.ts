/**
 * bench-worker — Phase N1K worker.
 * Pulls up to `chunk` queued rows for a run_batch, runs the existing extraction
 * pipeline (threat-preprocess → threat-extract for Pathway B; threat-extract-
 * hyper for Pathway C), records latency+token metrics, and writes back.
 *
 * Isolates each case in a try/catch so one failure doesn't halt the batch.
 * Concurrency capped at CONCURRENCY to stay inside gateway rate limits.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const CONCURRENCY = 4;

async function runOne(supaUrl: string, key: string, run: any, caseRow: any) {
  const t0 = performance.now();
  const text = String(caseRow.raw_text ?? "").slice(0, 12000);
  let entities = 0, relations = 0, tokens_est = 0;
  try {
    // preprocess (deterministic)
    const preRes = await fetch(`${supaUrl}/functions/v1/threat-preprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ text, domain: "cti", source_type: caseRow.source_feed }),
    });
    const pre = await preRes.json().catch(() => ({}));
    const cleaned = pre?.cleaned_text ?? text;

    const endpoint = run.pathway === "C" ? "threat-extract-hyper" : "threat-extract";
    const extRes = await fetch(`${supaUrl}/functions/v1/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        text: cleaned, mode: "full", source_type: caseRow.source_feed,
        reliability: 0.9, rag_context: "", domain: "cti",
      }),
    });
    if (!extRes.ok) throw new Error(`extract ${extRes.status}`);
    const ext = await extRes.json();

    if (run.pathway === "C") {
      entities = (ext?.hyperedges ?? []).reduce(
        (n: number, h: any) => n + (h.participants?.length ?? 0), 0);
      relations = (ext?.hyperedges ?? []).length;
    } else {
      entities = (ext?.ner ?? []).length;
      relations = (ext?.re ?? []).length + (ext?.causality ?? []).length;
    }
    tokens_est = Math.round(text.length / 4) + Math.round(JSON.stringify(ext).length / 4);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown", latency_ms: performance.now() - t0 };
  }
  return { entities, relations, latency_ms: Math.round(performance.now() - t0), tokens_est };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supaUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const runBatch: string | undefined = body.run_batch;
    const chunk = Math.min(Number(body.chunk ?? 10), 20);
    if (!runBatch) {
      return new Response(JSON.stringify({ error: "run_batch required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rows, error } = await supabase
      .from("bench_runs")
      .select("id, case_id, pathway, status")
      .eq("run_batch", runBatch)
      .eq("status", "queued")
      .limit(chunk);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Claim rows
    const ids = rows.map((r) => r.id);
    await supabase.from("bench_runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .in("id", ids);

    const caseIds = [...new Set(rows.map((r) => r.case_id))];
    const { data: cases } = await supabase
      .from("bench_cases").select("id, raw_text, source_feed").in("id", caseIds);
    const caseMap = new Map((cases ?? []).map((c: any) => [c.id, c]));

    // Concurrency-limited run
    const results: Array<{ id: string; res: any }> = [];
    let idx = 0;
    async function worker() {
      while (idx < rows.length) {
        const my = idx++;
        const run = rows[my];
        const caseRow = caseMap.get(run.case_id);
        if (!caseRow) {
          results.push({ id: run.id, res: { error: "case not found" } });
          continue;
        }
        const res = await runOne(supaUrl, serviceKey, run, caseRow);
        results.push({ id: run.id, res });
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    // Write back
    for (const { id, res } of results) {
      if (res.error) {
        await supabase.from("bench_runs").update({
          status: "error", finished_at: new Date().toISOString(),
          error: String(res.error).slice(0, 500),
          metrics: { latency_ms: res.latency_ms ?? null },
        }).eq("id", id);
      } else {
        await supabase.from("bench_runs").update({
          status: "done", finished_at: new Date().toISOString(),
          metrics: {
            entities: res.entities, relations: res.relations,
            latency_ms: res.latency_ms, tokens_est: res.tokens_est,
          },
        }).eq("id", id);
      }
    }

    // Continue if more queued rows remain
    const { count: remaining } = await supabase.from("bench_runs")
      .select("*", { count: "exact", head: true })
      .eq("run_batch", runBatch).eq("status", "queued");
    if ((remaining ?? 0) > 0) {
      // @ts-ignore EdgeRuntime
      EdgeRuntime.waitUntil(fetch(`${supaUrl}/functions/v1/bench-worker`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ run_batch: runBatch, chunk }),
      }));
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, remaining }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
