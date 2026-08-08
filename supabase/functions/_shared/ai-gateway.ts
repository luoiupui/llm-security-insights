// Shared Lovable AI Gateway provider helper for AI SDK calls in edge functions.
// See knowledge://ai-sdk-lovable-gateway.
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@^0.2";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: (Deno.env.get("LLM_BASE_URL") ?? "https://ai.gateway.lovable.dev/v1").replace(/\/+$/, ""),
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
