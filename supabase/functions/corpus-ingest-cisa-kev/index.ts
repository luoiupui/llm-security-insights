/**
 * corpus-ingest-cisa-kev — Phase N1K adapter.
 * Fetches CISA Known Exploited Vulnerabilities, normalizes each entry into an
 * IngestRecord, and inserts into public.bench_cases with mandatory source
 * attribution (feed, URL, publisher, license, retrieved_at).
 *
 * Does NOT run the extraction pipeline — that is bench-worker's job.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let limit = 50;
  try {
    const body = await req.json().catch(() => ({}));
    limit = Math.min(Number(body.limit ?? 50), 300);
  } catch { /* ignore */ }

  try {
    const r = await fetch(KEV_URL);
    if (!r.ok) throw new Error(`KEV fetch ${r.status}`);
    const kev = await r.json();
    const entries = (kev.vulnerabilities ?? []) as Array<{
      cveID: string; vendorProject: string; product: string;
      vulnerabilityName: string; dateAdded: string; shortDescription: string;
      requiredAction: string; knownRansomwareCampaignUse?: string; cwes?: string[];
    }>;
    entries.sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? ""));

    const rows = entries.slice(0, limit).map((e) => ({
      source_feed: "cisa_kev",
      source_url: `https://nvd.nist.gov/vuln/detail/${e.cveID}`,
      publisher: "CISA",
      license: "US-Gov Public Domain",
      language: "en",
      stratum: "kev",
      title: `${e.vulnerabilityName} (${e.cveID})`,
      raw_text: [
        `CISA KEV Advisory — ${e.dateAdded}: ${e.vulnerabilityName} (${e.cveID}).`,
        `Vendor: ${e.vendorProject}. Affected product: ${e.product}.`,
        e.shortDescription,
        e.knownRansomwareCampaignUse === "Known"
          ? "This vulnerability has been exploited in known ransomware campaigns." : "",
        e.cwes?.length ? `CWE: ${e.cwes.join(", ")}.` : "",
        `Required mitigation: ${e.requiredAction}`,
      ].filter(Boolean).join(" "),
      metadata: {
        cve_id: e.cveID, vendor: e.vendorProject, product: e.product,
        date_added: e.dateAdded, ransomware_use: e.knownRansomwareCampaignUse,
        cwes: e.cwes ?? [],
      },
    }));

    const { data, error } = await supabase
      .from("bench_cases")
      .upsert(rows, { onConflict: "source_feed,source_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;

    const inserted = data?.length ?? 0;
    await supabase.from("monitoring_events").insert({
      event_type: "corpus_ingest",
      category: "corpus",
      title: `CISA KEV ingest: +${inserted} cases`,
      detail: `Requested ${limit}, inserted ${inserted} new (deduped by source_url).`,
      metadata: { feed: "cisa_kev", requested: limit, inserted },
    });
    return new Response(JSON.stringify({ ok: true, feed: "cisa_kev", inserted, requested: limit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
