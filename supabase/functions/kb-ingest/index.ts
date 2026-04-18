/**
 * kb-ingest — Bulk-loads authoritative knowledge bases into kb_entries:
 *   • MITRE ATT&CK Enterprise (tactics + techniques + sub-techniques) from the
 *     official mitre/cti GitHub STIX bundle.
 *   • CISA Known Exploited Vulnerabilities (KEV) catalog (CVE list).
 *
 * After this runs, Layer A (kb-validate) actually has ground truth to catch
 * hallucinated MITRE IDs and CVEs — instead of the 28-row seed it ships with.
 *
 * POST { sources?: ("mitre"|"kev")[] }   default: both
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MITRE_URL =
  "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";
const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

interface Row {
  kb_type: string;
  external_id: string;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

async function ingestMitre(): Promise<Row[]> {
  const res = await fetch(MITRE_URL);
  if (!res.ok) throw new Error(`MITRE fetch failed: ${res.status}`);
  const bundle = await res.json();
  const rows: Row[] = [];
  for (const obj of bundle.objects ?? []) {
    if (obj.revoked || obj.x_mitre_deprecated) continue;
    const ext = (obj.external_references || []).find(
      (r: any) => r.source_name === "mitre-attack",
    );
    if (!ext?.external_id) continue;
    const id: string = ext.external_id;
    if (obj.type === "x-mitre-tactic" && /^TA\d{4}$/.test(id)) {
      rows.push({
        kb_type: "mitre_tactic",
        external_id: id,
        name: obj.name,
        description: obj.description?.slice(0, 1000) ?? null,
        metadata: { stix_id: obj.id, x_mitre_shortname: obj.x_mitre_shortname },
      });
    } else if (obj.type === "attack-pattern" && /^T\d{4}(\.\d{3})?$/.test(id)) {
      rows.push({
        kb_type: "mitre_technique",
        external_id: id,
        name: obj.name,
        description: obj.description?.slice(0, 1000) ?? null,
        metadata: {
          stix_id: obj.id,
          is_subtechnique: obj.x_mitre_is_subtechnique ?? false,
          platforms: obj.x_mitre_platforms ?? [],
          tactics: (obj.kill_chain_phases ?? []).map((k: any) => k.phase_name),
        },
      });
    }
  }
  return rows;
}

async function ingestKev(): Promise<Row[]> {
  const res = await fetch(KEV_URL);
  if (!res.ok) throw new Error(`CISA KEV fetch failed: ${res.status}`);
  const data = await res.json();
  const rows: Row[] = [];
  for (const v of data.vulnerabilities ?? []) {
    if (!v.cveID) continue;
    rows.push({
      kb_type: "cve",
      external_id: String(v.cveID).toUpperCase(),
      name: v.vulnerabilityName ?? v.cveID,
      description: (v.shortDescription ?? "").slice(0, 1000),
      metadata: {
        vendor: v.vendorProject,
        product: v.product,
        date_added: v.dateAdded,
        ransomware_use: v.knownRansomwareCampaignUse,
        source: "CISA-KEV",
      },
    });
  }
  return rows;
}

async function upsertChunked(supabase: any, rows: Row[]) {
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("kb_entries")
      .upsert(slice, { onConflict: "kb_type,external_id", ignoreDuplicates: false });
    if (error) throw new Error(`upsert chunk ${i}: ${error.message}`);
    inserted += slice.length;
  }
  return inserted;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const sources: string[] = Array.isArray(body.sources) ? body.sources : ["mitre", "kev"];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: Record<string, number> = {};
    const errors: string[] = [];

    if (sources.includes("mitre")) {
      try {
        const rows = await ingestMitre();
        results.mitre = await upsertChunked(supabase, rows);
      } catch (e) {
        errors.push(`mitre: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (sources.includes("kev")) {
      try {
        const rows = await ingestKev();
        results.kev = await upsertChunked(supabase, rows);
      } catch (e) {
        errors.push(`kev: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Final KB size after ingest
    const { count } = await supabase
      .from("kb_entries")
      .select("*", { count: "exact", head: true });

    const elapsed = Date.now() - startedAt;
    await supabase.from("monitoring_events").insert({
      event_type: "kb_ingest",
      category: "grounding",
      title: `KB ingest: ${Object.entries(results).map(([k, v]) => `${k}=${v}`).join(", ")} (total ${count})`,
      detail: errors.length
        ? `Completed in ${elapsed}ms with errors: ${errors.join(" | ")}`
        : `Completed in ${elapsed}ms — Layer A grounding now has ${count} canonical IDs.`,
      metadata: { results, errors, kb_size: count, elapsed_ms: elapsed, sources },
    });

    return new Response(
      JSON.stringify({ ok: errors.length === 0, results, errors, kb_size: count, elapsed_ms: elapsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("kb-ingest error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
