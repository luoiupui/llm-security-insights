import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── KG Inference & Attribution Reasoning (Ch. 4.2–4.3: Layers 3+4) ── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, entities = [], relations = [], causal_links = [], mode = "attribute" } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let result: unknown;

    switch (mode) {
      case "attribute":
        result = await performAttribution(LOVABLE_API_KEY, query, entities, relations, causal_links);
        break;
      case "attack_path":
        result = await reconstructAttackPath(LOVABLE_API_KEY, entities, relations, causal_links);
        break;
      case "predict":
        result = await predictNextSteps(LOVABLE_API_KEY, entities, relations, causal_links);
        break;
      default:
        return new Response(JSON.stringify({ error: "Invalid mode. Use: attribute, attack_path, predict" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-kg-query error:", e);
    const status = (e as any)?.status || 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function performAttribution(apiKey: string, query: string, entities: unknown[], relations: unknown[], causalLinks: unknown[]) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `You are a neuro-symbolic threat attribution engine. You combine:
1. Neural reasoning (LLM-based pattern matching and evidence correlation)
2. Symbolic rules (temporal consistency, TTP fingerprinting, infrastructure analysis)

Given a Knowledge Graph with entities, relations, and causal links, perform attribution reasoning.
Compute a credibility score using: S = Σ(w_i × conf_i × reliability_i) / N

Return structured JSON with:
- attributed_actor: most likely threat actor
- confidence: overall attribution confidence (0-1)
- evidence_chain: list of evidence items supporting the attribution
- attack_stages: reconstructed kill chain stages
- credibility_score: computed credibility
- alternative_actors: other possible attributions with lower confidence
- reasoning_trace: step-by-step reasoning showing how attribution was derived`,
        },
        {
          role: "user",
          content: `Query: ${query}\n\nKnowledge Graph:\nEntities: ${JSON.stringify(entities)}\nRelations: ${JSON.stringify(relations)}\nCausal Links: ${JSON.stringify(causalLinks)}`,
        },
      ],
      temperature: 0.15,
      tools: [{
        type: "function",
        function: {
          name: "attribution_result",
          description: "Return structured attribution analysis",
          parameters: {
            type: "object",
            properties: {
              attributed_actor: { type: "string" },
              confidence: { type: "number" },
              credibility_score: { type: "number" },
              evidence_chain: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    evidence: { type: "string" },
                    weight: { type: "number" },
                    source_type: { type: "string" },
                  },
                  required: ["evidence", "weight"],
                },
              },
              attack_stages: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    stage: { type: "string" },
                    technique: { type: "string" },
                    detail: { type: "string" },
                    mitre_tactic: { type: "string" },
                  },
                  required: ["stage", "detail"],
                },
              },
              causal_chain: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    cause: { type: "string" },
                    effect: { type: "string" },
                    causal_type: { type: "string" },
                    temporal_order: { type: "number" },
                    confidence: { type: "number" },
                  },
                  required: ["cause", "effect", "causal_type"],
                },
              },
              alternative_actors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    actor: { type: "string" },
                    confidence: { type: "number" },
                    reason: { type: "string" },
                  },
                  required: ["actor", "confidence"],
                },
              },
              reasoning_trace: { type: "string" },
            },
            required: ["attributed_actor", "confidence", "evidence_chain", "attack_stages"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "attribution_result" } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error("Credits exhausted"), { status: 402 });
    throw new Error(`LLM error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { return JSON.parse(toolCall.function.arguments); } catch { return { raw: toolCall.function.arguments }; }
  }
  return { raw: data.choices?.[0]?.message?.content || "" };
}

async function reconstructAttackPath(apiKey: string, entities: unknown[], relations: unknown[], causalLinks: unknown[]) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: "You are a cyber attack path reconstruction engine. Given KG data with entities, relations, and causal links, reconstruct the full attack path from initial access to final objective. Map each step to MITRE ATT&CK tactics/techniques.",
        },
        {
          role: "user",
          content: `Reconstruct the attack path:\nEntities: ${JSON.stringify(entities)}\nRelations: ${JSON.stringify(relations)}\nCausal Links: ${JSON.stringify(causalLinks)}`,
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return { attack_path: data.choices?.[0]?.message?.content || "" };
}

async function predictNextSteps(apiKey: string, entities: unknown[], relations: unknown[], causalLinks: unknown[]) {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: "You are a predictive threat intelligence engine. Based on observed attack patterns in the KG, predict likely next steps the threat actor may take. Base predictions on MITRE ATT&CK framework and known APT behavioral patterns.",
        },
        {
          role: "user",
          content: `Based on current KG state, predict next attack steps:\nEntities: ${JSON.stringify(entities)}\nRelations: ${JSON.stringify(relations)}\nCausal Links: ${JSON.stringify(causalLinks)}`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM error [${response.status}]: ${text}`);
  }

  const data = await response.json();
  return { predictions: data.choices?.[0]?.message?.content || "" };
}
