/**
 * Layer B — Vector RAG (retrieval) + Layer C — GraphRAG (subgraph retrieval)
 *
 * Modes:
 *  - "embed_and_retrieve": embeds input text via Lovable AI, retrieves top-k
 *    similar prior reports + neighbouring subgraphs; returns context block to
 *    inject into the extraction prompt.
 *  - "persist": stores a freshly extracted KG (entities/relations/causal links)
 *    + the embedded source text into the persistent stores so future events
 *    can retrieve them.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_MODEL = "google/text-embedding-004"; // 768-dim, gemini-aligned

async function embed(text: string, apiKey: string): Promise<number[] | null> {
  // Lovable AI gateway exposes OpenAI-style embeddings endpoint
  try {
    const r = await fetch(`${AI_GATEWAY}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: EMBED_MODEL, input: text.slice(0, 8000) }),
    });
    if (!r.ok) {
      console.error("embed failed", r.status, await r.text());
      return null;
    }
    const j = await r.json();
    return j?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("embed error", e);
    return null;
  }
}

const canon = (s: string) => String(s ?? "").trim().toLowerCase();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode = body.mode || "embed_and_retrieve";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;

    if (mode === "embed_and_retrieve") {
      const { text, top_k = 3, similarity_threshold = 0.5 } = body;
      if (!text) {
        return new Response(JSON.stringify({ error: "text required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const vec = await embed(text, apiKey);
      let similar: any[] = [];
      if (vec) {
        const { data } = await supabase.rpc("match_threat_reports", {
          query_embedding: vec as any,
          match_count: top_k,
          similarity_threshold,
        });
        similar = data ?? [];
      }

      // GraphRAG — pull neighbouring subgraph for matched reports' entities
      let subgraph: any = { entities: [], relations: [] };
      if (similar.length > 0) {
        const reportIds = similar.map((s: any) => s.id);
        const [{ data: ents }, { data: rels }] = await Promise.all([
          supabase.from("kg_entities").select("*").in("report_id", reportIds).limit(40),
          supabase.from("kg_relations").select("*").in("report_id", reportIds).limit(60),
        ]);
        subgraph = { entities: ents ?? [], relations: rels ?? [] };
      }

      // Build context block to inject into extraction prompt
      const contextBlock = buildContextBlock(similar, subgraph);

      // Log monitoring event
      await supabase.from("monitoring_events").insert({
        event_type: "rag_retrieval",
        category: "retrieval",
        title: `Vector RAG: retrieved ${similar.length} similar reports`,
        detail: `GraphRAG: ${subgraph.entities.length} entities + ${subgraph.relations.length} relations from history`,
        metadata: { top_k, similarity_threshold, similar_count: similar.length },
      });

      return new Response(JSON.stringify({
        similar_reports: similar,
        subgraph,
        context_block: contextBlock,
        embedding_used: !!vec,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "persist") {
      const { source_text, source_type = "report", extraction } = body;
      if (!source_text || !extraction) {
        return new Response(JSON.stringify({ error: "source_text and extraction required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const vec = await embed(source_text, apiKey);
      const summary = extraction?.graph_native?.graph_metadata?.narrative
        || extraction?.ner?.narrative_summary
        || source_text.slice(0, 240);

      const { data: report, error: reportErr } = await supabase
        .from("threat_reports")
        .insert({
          source_text,
          source_type,
          summary,
          embedding: vec as any,
          extraction_payload: extraction,
        })
        .select()
        .single();

      if (reportErr) throw reportErr;
      const reportId = report.id;

      // Persist entities
      const entities = extraction?.graph_native?.nodes ?? extraction?.ner?.entities ?? [];
      if (entities.length > 0) {
        await supabase.from("kg_entities").insert(
          entities.map((e: any) => ({
            report_id: reportId,
            name: e.name,
            canonical_name: canon(e.name),
            entity_type: e.type ?? "unknown",
            stix_type: e.stix_type ?? null,
            mitre_id: e.mitre_id ?? null,
            confidence: Number(e.confidence ?? 0),
            context: e.context ?? null,
          })),
        );
      }

      // Persist relations
      const relations = extraction?.graph_native?.edges ?? extraction?.re?.relations ?? [];
      if (relations.length > 0) {
        await supabase.from("kg_relations").insert(
          relations.map((r: any) => ({
            report_id: reportId,
            source_name: r.source,
            source_canonical: canon(r.source),
            target_name: r.target,
            target_canonical: canon(r.target),
            relation: r.relation,
            edge_type: r.edge_type ?? "relational",
            confidence: Number(r.confidence ?? 0),
            evidence: r.evidence ?? null,
          })),
        );
      }

      // Persist causal links
      const causal = extraction?.causality?.causal_links ?? [];
      if (causal.length > 0) {
        await supabase.from("kg_causal_links").insert(
          causal.map((c: any) => ({
            report_id: reportId,
            cause: c.cause,
            effect: c.effect,
            causal_type: c.causal_type,
            temporal_order: Number(c.temporal_order ?? 0),
            confidence: Number(c.confidence ?? 0),
            mitre_tactic: c.mitre_tactic ?? null,
            evidence: c.evidence ?? null,
          })),
        );
      }

      await supabase.from("monitoring_events").insert({
        event_type: "kg_persisted",
        category: "graphrag",
        title: `KG persisted: ${entities.length} nodes, ${relations.length} edges`,
        detail: `Report ${reportId.slice(0, 8)}… archived for future GraphRAG retrieval`,
        metadata: { report_id: reportId, entity_count: entities.length, relation_count: relations.length },
      });

      return new Response(JSON.stringify({ report_id: reportId, persisted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: `unknown mode: ${mode}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-rag error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function buildContextBlock(similar: any[], subgraph: any): string {
  if (similar.length === 0) {
    return "";
  }
  const lines: string[] = [];
  lines.push("═══ RETRIEVED HISTORICAL CONTEXT (for grounding, do not copy verbatim) ═══");
  similar.forEach((s, i) => {
    lines.push(`[#${i + 1} | sim=${(s.similarity ?? 0).toFixed(2)}] ${s.summary ?? s.source_text?.slice(0, 200)}`);
  });
  if (subgraph.entities.length > 0) {
    lines.push("");
    lines.push("KNOWN ENTITIES FROM PRIOR EVENTS:");
    const seen = new Set<string>();
    subgraph.entities.slice(0, 25).forEach((e: any) => {
      const key = `${e.name}|${e.entity_type}`;
      if (!seen.has(key)) { seen.add(key); lines.push(`  - ${e.name} (${e.entity_type})${e.mitre_id ? ` [${e.mitre_id}]` : ""}`); }
    });
  }
  if (subgraph.relations.length > 0) {
    lines.push("");
    lines.push("KNOWN RELATIONS FROM PRIOR EVENTS:");
    subgraph.relations.slice(0, 20).forEach((r: any) => {
      lines.push(`  - ${r.source_name} —[${r.relation}]→ ${r.target_name}`);
    });
  }
  lines.push("═══ END CONTEXT ═══");
  return lines.join("\n");
}
