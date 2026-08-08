import { LLM_CHAT_URL, LLM_MODEL, llmHeaders } from "../_shared/llm-endpoint.ts";
// supabase/functions/redaction-adjudicate/index.ts
// LLM adjudicator for selective redaction.
// Receives text + candidate spans, returns per-span action (upgrade/keep/drop).
// The symbolic guard in src/lib/redaction/guard.ts enforces non-downgrade.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface Candidate {
  start: number; end: number; axis: string; rule_id: string;
  action: string; placeholder: string; rationale?: string;
}

interface Body {
  text: string;
  domain: "clinical" | "cti" | "archive";
  candidates: Candidate[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.text || !Array.isArray(body.candidates)) {
      return new Response(JSON.stringify({ error: "invalid body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing", decisions: body.candidates }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const system = `You are a sensitivity-policy adjudicator for the ${body.domain} domain.
Given a document and candidate sensitive spans (already flagged by rules), decide for each:
- KEEP: action is appropriate
- UPGRADE: severity should be raised (redact > pseudonymize > generalize)
- propose new spans if the rule layer obviously missed something (rare).
You MAY ONLY upgrade severity; downgrades will be rejected by a downstream guard.
Reply with strict JSON: { "decisions": [{ "start": n, "end": n, "axis": "...", "rule_id": "...", "action": "redact|pseudonymize|generalize|redact_attribution|redact_document", "placeholder": "...", "rationale": "..." }] }`;

    const user = JSON.stringify({ text: body.text.slice(0, 4000), candidates: body.candidates });

    const r = await fetch(LLM_CHAT_URL, {
      method: "POST",
      headers: {
        ...llmHeaders(apiKey),

      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: `gateway ${r.status}: ${t}`, decisions: body.candidates }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const j = await r.json();
    const content = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { decisions?: Candidate[] } = {};
    try { parsed = JSON.parse(content); } catch { parsed = { decisions: body.candidates }; }

    return new Response(JSON.stringify({ decisions: parsed.decisions ?? body.candidates }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
