/**
 * corpus-ingest-mitre-groups — Phase N1K adapter.
 * Pulls MITRE ATT&CK intrusion-set narratives from the official STIX bundle
 * and stores each as a bench_cases row (stratum='apt-narrative').
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const MITRE_URL =
  "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let limit = 50;
  try {
    const body = await req.json().catch(() => ({}));
    limit = Math.min(Number(body.limit ?? 50), 200);
  } catch { /* ignore */ }

  try {
    const r = await fetch(MITRE_URL);
    if (!r.ok) throw new Error(`MITRE fetch ${r.status}`);
    const bundle = await r.json();
    const groups: any[] = [];
    for (const o of bundle.objects ?? []) {
      if (o.type !== "intrusion-set" || o.revoked || o.x_mitre_deprecated) continue;
      const ext = (o.external_references ?? []).find((x: any) => x.source_name === "mitre-attack");
      if (!ext?.external_id || !/^G\d{4}$/.test(ext.external_id)) continue;
      if (!o.description || o.description.length < 200) continue; // skip stubs
      groups.push({ id: ext.external_id, o, url: ext.url });
    }
    const rows = groups.slice(0, limit).map(({ id, o, url }) => ({
      source_feed: "mitre_attack",
      source_url: url ?? `https://attack.mitre.org/groups/${id}/`,
      publisher: "MITRE Corporation",
      license: "Apache-2.0",
      language: "en",
      stratum: "apt-narrative",
      title: `${o.name} (${id})`,
      raw_text: `${o.name} (${id}). ${o.description}${
        Array.isArray(o.aliases) && o.aliases.length > 1
          ? ` Aliases: ${o.aliases.filter((a: string) => a !== o.name).join(", ")}.` : ""
      }`,
      metadata: { group_id: id, stix_id: o.id, aliases: o.aliases ?? [] },
    }));

    const { data, error } = await supabase
      .from("bench_cases")
      .upsert(rows, { onConflict: "source_feed,source_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;

    const inserted = data?.length ?? 0;
    await supabase.from("monitoring_events").insert({
      event_type: "corpus_ingest", category: "corpus",
      title: `MITRE Groups ingest: +${inserted} cases`,
      detail: `Requested ${limit}, inserted ${inserted} new.`,
      metadata: { feed: "mitre_attack", requested: limit, inserted },
    });
    return new Response(JSON.stringify({ ok: true, feed: "mitre_attack", inserted, requested: limit }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
