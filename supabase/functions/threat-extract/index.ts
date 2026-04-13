import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/* ── Chain-of-Thought Prompts (Ch. 3.3) ── */

const NER_SYSTEM_PROMPT = `You are a cybersecurity threat intelligence analyst performing Named Entity Recognition (NER).

Follow this Chain-of-Thought process EXACTLY:
Step 1: Read the entire text and identify the main threat narrative.
Step 2: Identify all THREAT ACTORS (APT groups, nation-state actors, cybercriminal groups).
Step 3: Identify all MALWARE families, tools, backdoors, and implants.
Step 4: Identify all VULNERABILITIES (CVE IDs, zero-days, exploit names).
Step 5: Identify all TTPs and map to MITRE ATT&CK technique IDs (e.g., T1059, T1195.002).
Step 6: Identify all INFRASTRUCTURE (IP addresses, domains, C2 servers, URLs).
Step 7: Identify all SOFTWARE products mentioned.
Step 8: Assign confidence score (0.0-1.0) for each entity based on how explicitly it was mentioned.

CONSTRAINTS:
- Only extract explicitly stated information
- Flag uncertain attributions with confidence < 0.7
- Do NOT hallucinate connections not present in the text
- Normalize IOCs: defang IPs (1.2.3.4 → 1.2.3[.]4), lowercase hashes`;

const RE_SYSTEM_PROMPT = `You are a cybersecurity analyst performing Relation Extraction (RE) on previously identified entities.

Follow this Chain-of-Thought process:
Step 1: For each entity pair, determine if a relationship exists based on the text.
Step 2: Classify the relationship type: uses, exploits, targets, attributed_to, communicates_with, drops, implements, hosts, affects.
Step 3: Determine the directionality (source → target).
Step 4: Assign confidence (0.0-1.0) based on how explicit the relationship is in the text.
Step 5: Map relationships to STIX 2.1 Relationship Objects where possible.

CONSTRAINTS:
- Only extract relationships explicitly stated or strongly implied in the text
- Do NOT infer relationships across separate, unrelated paragraphs
- Flag inferred relationships with confidence < 0.7`;

const CAUSALITY_SYSTEM_PROMPT = `You are a cybersecurity analyst performing CAUSAL REASONING on attack chains.

Follow this Chain-of-Thought process:
Step 1: Reconstruct the attack timeline from temporal information in the text.
Step 2: For each event pair, determine the causal type:
  - ENABLES: initial access enables lateral movement
  - LEADS_TO: exploitation leads to code execution
  - PRECEDES: in kill chain ordering (temporal only, no proven causation)
  - TRIGGERS: beacon triggers C2 communication
Step 3: Assign temporal ordering (1, 2, 3...) based on the attack sequence.
Step 4: Assess causal confidence:
  - Strong (≥0.8): explicitly stated causal connection
  - Moderate (0.5-0.8): implied by sequence and context
  - Weak (<0.5): inferred from general attack patterns

OUTPUT CONSTRAINTS:
- Only output causal links supported by the text
- Mark inferred temporal ordering vs. explicitly stated ordering
- Flag contradictory timelines for conflict detection`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text, mode = "full", source_type = "report", source_reliability = 0.8 } = await req.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: "Text input is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const results: Record<string, unknown> = { source_type, source_reliability, timestamp: new Date().toISOString() };

    // ── Step 1: NER Extraction ──
    if (mode === "full" || mode === "ner") {
      const nerResponse = await callLLM(LOVABLE_API_KEY, NER_SYSTEM_PROMPT, 
        `Extract all cybersecurity entities from the following threat intelligence text. Return JSON with this structure:
{
  "entities": [{"name": "...", "type": "threat_actor|malware|vulnerability|ttp|infrastructure|software", "confidence": 0.0-1.0, "mitre_id": "optional", "context": "brief quote from text"}],
  "narrative_summary": "one sentence summary of the threat"
}

TEXT:
${text}`
      );
      results.ner = nerResponse;
    }

    // ── Step 2: Relation Extraction ──
    if (mode === "full" || mode === "re") {
      const entities_context = results.ner ? JSON.stringify(results.ner) : "No prior NER results";
      const reResponse = await callLLM(LOVABLE_API_KEY, RE_SYSTEM_PROMPT,
        `Given these previously extracted entities:
${entities_context}

Extract all relationships from the text. Return JSON:
{
  "relations": [{"source": "entity_name", "relation": "uses|exploits|targets|attributed_to|communicates_with|drops|implements", "target": "entity_name", "confidence": 0.0-1.0, "evidence": "brief quote"}]
}

TEXT:
${text}`
      );
      results.re = reResponse;
    }

    // ── Step 3: Causality Extraction ──
    if (mode === "full" || mode === "causality") {
      const causalityResponse = await callLLM(LOVABLE_API_KEY, CAUSALITY_SYSTEM_PROMPT,
        `Analyze the following threat intelligence text for causal relationships in the attack chain. Return JSON:
{
  "causal_links": [{"cause": "event/action", "effect": "event/action", "causal_type": "enables|leads_to|triggers|precedes", "temporal_order": 1, "confidence": 0.0-1.0, "evidence": "brief quote"}],
  "attack_timeline": [{"order": 1, "event": "...", "timestamp_mentioned": "if any"}]
}

TEXT:
${text}`
      );
      results.causality = causalityResponse;
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("threat-extract error:", e);
    const status = (e as any)?.status || 500;
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: status === 429 ? 429 : status === 402 ? 402 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function callLLM(apiKey: string, systemPrompt: string, userPrompt: string): Promise<unknown> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      tools: [{
        type: "function",
        function: {
          name: "extract_threat_data",
          description: "Extract structured threat intelligence data",
          parameters: {
            type: "object",
            properties: {
              entities: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string", enum: ["threat_actor", "malware", "vulnerability", "ttp", "infrastructure", "software"] },
                    confidence: { type: "number" },
                    mitre_id: { type: "string" },
                    context: { type: "string" },
                  },
                  required: ["name", "type", "confidence"],
                },
              },
              relations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    source: { type: "string" },
                    relation: { type: "string" },
                    target: { type: "string" },
                    confidence: { type: "number" },
                    evidence: { type: "string" },
                  },
                  required: ["source", "relation", "target", "confidence"],
                },
              },
              causal_links: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    cause: { type: "string" },
                    effect: { type: "string" },
                    causal_type: { type: "string", enum: ["enables", "leads_to", "triggers", "precedes"] },
                    temporal_order: { type: "number" },
                    confidence: { type: "number" },
                    evidence: { type: "string" },
                  },
                  required: ["cause", "effect", "causal_type", "confidence"],
                },
              },
              narrative_summary: { type: "string" },
              attack_timeline: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    order: { type: "number" },
                    event: { type: "string" },
                    timestamp_mentioned: { type: "string" },
                  },
                  required: ["order", "event"],
                },
              },
            },
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_threat_data" } },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`LLM API error [${response.status}]:`, errText);
    if (response.status === 429) throw Object.assign(new Error("Rate limited"), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error("Credits exhausted"), { status: 402 });
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch {
      return { raw: toolCall.function.arguments };
    }
  }

  // Fallback to content
  const content = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(content);
  } catch {
    return { raw: content };
  }
}
