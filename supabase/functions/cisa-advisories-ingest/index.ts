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

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Number(body.limit ?? 25), 100);
    const skipExisting = body.skip_existing !== false;

    await supabase.from("monitoring_events").insert({
      event_type: "cisa_bootstrap_start",
      category: "ingest",
      title: `CISA KEV bootstrap started (limit=${limit})`,
      detail: "Pulling KEV catalog and running each entry through full pipeline",
    });

    // 1. Fetch CISA KEV catalog (no auth needed, public JSON feed)
    const r = await fetch(KEV_URL);
    if (!r.ok) throw new Error(`KEV fetch failed: ${r.status}`);
    const kev = await r.json();
    const entries: KEVEntry[] = kev.vulnerabilities ?? [];

    // Most recent first
    entries.sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? ""));

    // Optionally skip CVEs already in threat_reports (idempotent re-runs)
    let toIngest = entries.slice(0, limit);
    if (skipExisting) {
      const cveIds = toIngest.map((e) => e.cveID);
      const { data: existing } = await supabase
        .from("threat_reports")
        .select("source_text")
        .ilike("source_text", "%CISA KEV Advisory%")
        .limit(500);
      const seen = new Set(
        (existing ?? []).flatMap((r: any) => {
          const m = String(r.source_text).match(/CVE-\d{4}-\d+/g);
          return m ?? [];
        }),
      );
      toIngest = toIngest.filter((e) => !seen.has(e.cveID));
    }

    let succeeded = 0;
    let failed = 0;
    const failures: string[] = [];

    // 2. Process each entry through extract → validate → persist
    for (const entry of toIngest) {
      const sourceText = buildSyntheticReport(entry);
      try {
        // Extract via threat-extract (no RAG context — we're seeding)
        const extractRes = await fetch(`${supaUrl}/functions/v1/threat-extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            text: sourceText,
            mode: "full",
            source_type: "cisa_kev",
            reliability: 0.95,
            rag_context: "",
          }),
        });

        if (!extractRes.ok) {
          throw new Error(`extract ${extractRes.status}: ${await extractRes.text()}`);
        }
        const extraction = await extractRes.json();

        // Persist into GraphRAG corpus
        const persistRes = await fetch(`${supaUrl}/functions/v1/threat-rag`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            mode: "persist",
            source_text: sourceText,
            source_type: "cisa_kev",
            extraction,
          }),
        });

        if (!persistRes.ok) {
          throw new Error(`persist ${persistRes.status}: ${await persistRes.text()}`);
        }

        succeeded++;
      } catch (e) {
        failed++;
        const msg = `${entry.cveID}: ${e instanceof Error ? e.message : "unknown"}`;
        failures.push(msg);
        console.error("ingest failed:", msg);
      }

      // Small delay to avoid hammering the LLM gateway
      await new Promise((res) => setTimeout(res, 250));
    }

    // 3. Final report
    const { count: reportCount } = await supabase
      .from("threat_reports")
      .select("*", { count: "exact", head: true });
    const { count: entityCount } = await supabase
      .from("kg_entities")
      .select("*", { count: "exact", head: true });

    await supabase.from("monitoring_events").insert({
      event_type: "cisa_bootstrap_complete",
      category: "ingest",
      title: `CISA KEV bootstrap complete: ${succeeded} ingested, ${failed} failed`,
      detail: `Corpus now: ${reportCount} reports, ${entityCount} entities. GraphRAG warm-up done.`,
      metadata: {
        succeeded,
        failed,
        skipped: entries.length - toIngest.length - failed,
        report_count: reportCount,
        entity_count: entityCount,
        sample_failures: failures.slice(0, 5),
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        attempted: toIngest.length,
        succeeded,
        failed,
        skipped_existing: skipExisting ? entries.length - toIngest.length : 0,
        corpus: { reports: reportCount, entities: entityCount },
        sample_failures: failures.slice(0, 3),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("cisa-advisories-ingest error:", msg);
    await supabase.from("monitoring_events").insert({
      event_type: "cisa_bootstrap_error",
      category: "ingest",
      title: "CISA KEV bootstrap failed",
      detail: msg,
    });
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
