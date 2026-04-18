/**
 * Bulk-bootstrap GraphRAG corpus from the CISA Known Exploited Vulnerabilities
 * catalog. Each KEV entry is converted into a synthetic threat report and run
 * through the full extraction → KB validation → persist pipeline so Layer B+C
 * have a non-empty history to retrieve from.
 *
 * Invariant: this function NEVER writes to kb_entries (Layer A ground truth).
 * It only writes to threat_reports / kg_entities / kg_relations / kg_causal_links
 * via the existing threat-rag persist pipeline.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

interface KEVEntry {
  cveID: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  shortDescription: string;
  requiredAction: string;
  knownRansomwareCampaignUse?: string;
  cwes?: string[];
}

function buildSyntheticReport(k: KEVEntry): string {
  const ransom = k.knownRansomwareCampaignUse === "Known"
    ? ` This vulnerability has been exploited in known ransomware campaigns.`
    : "";
  const cwe = k.cwes && k.cwes.length > 0 ? ` CWE classification: ${k.cwes.join(", ")}.` : "";
  return `CISA KEV Advisory — ${k.dateAdded}: ${k.vulnerabilityName} (${k.cveID}). ` +
    `Vendor: ${k.vendorProject}. Affected product: ${k.product}. ` +
    `${k.shortDescription}${ransom}${cwe} ` +
    `Required mitigation: ${k.requiredAction}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Parse + validate up front so we can return fast
  let limit = 10;
  let skipExisting = true;
  try {
    const body = await req.json().catch(() => ({}));
    limit = Math.min(Number(body.limit ?? 10), 50);
    skipExisting = body.skip_existing !== false;
  } catch {
    /* ignore */
  }

  // Background worker: runs after we've already responded.
  const runIngest = async () => {
    try {
      await supabase.from("monitoring_events").insert({
        event_type: "cisa_bootstrap_start",
        category: "ingest",
        title: `CISA KEV bootstrap started (limit=${limit})`,
        detail: "Background worker pulling KEV catalog and running pipeline",
      });

      const r = await fetch(KEV_URL);
      if (!r.ok) throw new Error(`KEV fetch failed: ${r.status}`);
      const kev = await r.json();
      const entries: KEVEntry[] = kev.vulnerabilities ?? [];
      entries.sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? ""));

      let toIngest = entries.slice(0, limit);
      if (skipExisting) {
        const { data: existing } = await supabase
          .from("threat_reports")
          .select("source_text")
          .ilike("source_text", "%CISA KEV Advisory%")
          .limit(500);
        const seen = new Set(
          (existing ?? []).flatMap((row: any) => {
            const m = String(row.source_text).match(/CVE-\d{4}-\d+/g);
            return m ?? [];
          }),
        );
        toIngest = toIngest.filter((e) => !seen.has(e.cveID));
      }

      let succeeded = 0;
      let failed = 0;
      const failures: string[] = [];

      for (const entry of toIngest) {
        const sourceText = buildSyntheticReport(entry);
        try {
          const extractRes = await fetch(`${supaUrl}/functions/v1/threat-extract`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              text: sourceText, mode: "full", source_type: "cisa_kev",
              reliability: 0.95, rag_context: "",
            }),
          });
          if (!extractRes.ok) throw new Error(`extract ${extractRes.status}`);
          const extraction = await extractRes.json();

          const persistRes = await fetch(`${supaUrl}/functions/v1/threat-rag`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({
              mode: "persist", source_text: sourceText, source_type: "cisa_kev", extraction,
            }),
          });
          if (!persistRes.ok) throw new Error(`persist ${persistRes.status}`);
          succeeded++;

          // Progress event every 3 advisories
          if (succeeded % 3 === 0) {
            await supabase.from("monitoring_events").insert({
              event_type: "cisa_bootstrap_progress",
              category: "ingest",
              title: `Bootstrap progress: ${succeeded}/${toIngest.length}`,
              detail: `Last ingested: ${entry.cveID} (${entry.vendorProject})`,
            });
          }
        } catch (e) {
          failed++;
          const msg = `${entry.cveID}: ${e instanceof Error ? e.message : "unknown"}`;
          failures.push(msg);
          console.error("ingest failed:", msg);
        }
      }

      const { count: reportCount } = await supabase
        .from("threat_reports").select("*", { count: "exact", head: true });
      const { count: entityCount } = await supabase
        .from("kg_entities").select("*", { count: "exact", head: true });

      await supabase.from("monitoring_events").insert({
        event_type: "cisa_bootstrap_complete",
        category: "ingest",
        title: `CISA KEV bootstrap complete: ${succeeded} ingested, ${failed} failed`,
        detail: `Corpus now: ${reportCount} reports, ${entityCount} entities. GraphRAG warm-up done.`,
        metadata: { succeeded, failed, report_count: reportCount, entity_count: entityCount, sample_failures: failures.slice(0, 5) },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.error("cisa-advisories-ingest worker error:", msg);
      await supabase.from("monitoring_events").insert({
        event_type: "cisa_bootstrap_error",
        category: "ingest",
        title: "CISA KEV bootstrap failed",
        detail: msg,
      });
    }
  };

  // Fire-and-forget: keep the runtime alive for the background task,
  // but respond to the client immediately to avoid the 150s idle timeout.
  // @ts-ignore — EdgeRuntime is provided by Supabase Edge Runtime
  EdgeRuntime.waitUntil(runIngest());

  return new Response(
    JSON.stringify({
      ok: true,
      queued: true,
      limit,
      message: `Bootstrap started in background. Watch monitoring_events (cisa_bootstrap_progress / _complete) on the Threat Feed for progress. Estimated ~${Math.ceil(limit * 6 / 60)}min for ${limit} advisories.`,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

