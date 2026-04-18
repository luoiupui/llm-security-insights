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

const canon = (s: string) => String(s ?? "").trim().toLowerCase();

// Deterministic lexical "embedding" — token set used for Jaccard similarity.
// No external embedding model available in the gateway, so we use lexical RAG.
const STOPWORDS = new Set(["the","a","an","and","or","of","to","in","on","for","with","by","is","are","was","were","be","been","as","at","this","that","it","from","has","have","had","will","can","may","not","but","if","then","than","also","such","via","using","used","into","over","under","about"]);

function tokenize(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s.-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode = body.mode || "embed_and_retrieve";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (mode === "embed_and_retrieve") {
      const { text, top_k = 3, similarity_threshold = 0.1 } = body;
      if (!text) {
        return new Response(JSON.stringify({ error: "text required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Lexical RAG: pull recent reports, score by Jaccard token overlap
      const queryTokens = tokenize(text);
      const { data: candidates } = await supabase
        .from("threat_reports")
        .select("id, summary, source_text, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      const scored = (candidates ?? [])
        .map((r: any) => {
          const corpus = `${r.summary ?? ""} ${r.source_text ?? ""}`;
          const sim = jaccard(queryTokens, tokenize(corpus));
          return { ...r, similarity: sim };
        })
        .filter((r: any) => r.similarity >= similarity_threshold)
        .sort((a: any, b: any) => b.similarity - a.similarity)
        .slice(0, top_k);

      const similar = scored;

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

      const contextBlock = buildContextBlock(similar, subgraph);

      await supabase.from("monitoring_events").insert({
        event_type: "rag_retrieval",
        category: "retrieval",
        title: `Lexical RAG: retrieved ${similar.length} similar reports`,
        detail: `GraphRAG: ${subgraph.entities.length} entities + ${subgraph.relations.length} relations from history`,
        metadata: { top_k, similarity_threshold, similar_count: similar.length, method: "jaccard_lexical" },
      });

      return new Response(JSON.stringify({
        similar_reports: similar,
        subgraph,
        context_block: contextBlock,
        embedding_used: false,
        retrieval_method: "lexical_jaccard",
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
