/**
 * corpus-ingest-rss — generic RSS/Atom adapter for JPCERT, CNCERT, and vendor
 * PSIRTs. The caller specifies { feed_id, feed_url, publisher, license,
 * language, stratum, limit }. Parses <item>/<entry> naively and stores each
 * as a bench_cases row.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Curated feed catalog — extend as needed.
const FEEDS: Record<string, {
  url: string; publisher: string; license: string; language: string; stratum: string;
}> = {
  jpcert: {
    url: "https://www.jpcert.or.jp/english/rss/jpcert-en.rdf",
    publisher: "JPCERT/CC", license: "attribution-required",
    language: "en", stratum: "multilingual",
  },
  cncert: {
    url: "https://www.cert.org.cn/publish/main/rss/index.xml",
    publisher: "CNCERT/CC", license: "attribution-required",
    language: "zh", stratum: "multilingual",
  },
  cisco_psirt: {
    url: "https://sec.cloudapps.cisco.com/security/center/psirtrss20/CiscoSecurityAdvisory.xml",
    publisher: "Cisco PSIRT", license: "vendor-quote-only",
    language: "en", stratum: "psirt",
  },
  msrc: {
    url: "https://api.msrc.microsoft.com/update-guide/rss",
    publisher: "Microsoft MSRC", license: "vendor-quote-only",
    language: "en", stratum: "psirt",
  },
  fortinet_psirt: {
    url: "https://feeds.fortinet.com/fortiguard/rss/psirt.xml",
    publisher: "Fortinet PSIRT", license: "vendor-quote-only",
    language: "en", stratum: "psirt",
  },
};

function stripTags(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/\s+/g, " ").trim();
}

function extractField(item: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = item.match(re);
  return m ? stripTags(m[1]) : "";
}

function parseFeed(xml: string): Array<{ title: string; link: string; description: string }> {
  const items: Array<{ title: string; link: string; description: string }> = [];
  const itemRe = /<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi;
  const matches = xml.match(itemRe) ?? [];
  for (const raw of matches) {
    let link = extractField(raw, "link");
    if (!link) {
      // Atom-style: <link href="..."/>
      const m = raw.match(/<link[^>]*href="([^"]+)"/i);
      link = m ? m[1] : "";
    }
    const title = extractField(raw, "title");
    const description =
      extractField(raw, "description") ||
      extractField(raw, "summary") ||
      extractField(raw, "content");
    if (title && link) items.push({ title, link, description });
  }
  return items;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const feedId: string = body.feed_id;
    const limit = Math.min(Number(body.limit ?? 30), 100);
    const cfg = FEEDS[feedId];
    if (!cfg) {
      return new Response(JSON.stringify({
        error: `unknown feed_id '${feedId}'`, available: Object.keys(FEEDS),
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const r = await fetch(cfg.url, {
      headers: { "User-Agent": "ThreatGraph-Corpus/1.0 (research)" },
    });
    if (!r.ok) throw new Error(`feed fetch ${r.status}`);
    const xml = await r.text();
    const items = parseFeed(xml).slice(0, limit);

    if (items.length === 0) {
      return new Response(JSON.stringify({
        ok: true, feed: feedId, inserted: 0, requested: limit,
        note: "feed parsed but 0 items — may be blocked or empty",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rows = items.map((it) => ({
      source_feed: feedId,
      source_url: it.link,
      publisher: cfg.publisher,
      license: cfg.license,
      language: cfg.language,
      stratum: cfg.stratum,
      title: it.title.slice(0, 500),
      raw_text: `${it.title}. ${it.description}`.slice(0, 8000),
      metadata: { feed_url: cfg.url },
    }));

    const { data, error } = await supabase
      .from("bench_cases")
      .upsert(rows, { onConflict: "source_feed,source_url", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;

    const inserted = data?.length ?? 0;
    await supabase.from("monitoring_events").insert({
      event_type: "corpus_ingest", category: "corpus",
      title: `${cfg.publisher} ingest: +${inserted} cases`,
      detail: `Feed ${feedId} → ${inserted} new (of ${items.length} parsed).`,
      metadata: { feed: feedId, requested: limit, parsed: items.length, inserted },
    });
    return new Response(JSON.stringify({
      ok: true, feed: feedId, inserted, parsed: items.length, requested: limit,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
