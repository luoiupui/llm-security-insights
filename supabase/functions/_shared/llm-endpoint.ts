// Central LLM endpoint indirection.
// -----------------------------------------------------------------------------
// By default every edge function talks to the Lovable AI Gateway. For a fully
// local deployment (Ollama / vLLM / llama.cpp / LM Studio — all OpenAI-compatible)
// set these secrets/env vars and NO code change is required:
//
//   LLM_BASE_URL = http://host.docker.internal:11434/v1   (Ollama example)
//   LLM_MODEL    = qwen2.5:14b-instruct
//   LLM_API_KEY  = ollama                                  (any non-empty string)
//
// Notes:
//  - LLM_BASE_URL must be an OpenAI-compatible base ending in /v1.
//  - Keep the model deterministic (temperature 0, fixed seed) to preserve the
//    zero-shot / reproducible posture of the CTI pipeline.

const DEFAULT_BASE = "https://ai.gateway.lovable.dev/v1";

export const LLM_BASE_URL = (Deno.env.get("LLM_BASE_URL") ?? DEFAULT_BASE).replace(/\/+$/, "");

export const LLM_CHAT_URL = `${LLM_BASE_URL}/chat/completions`;

export const IS_LOVABLE_GATEWAY = LLM_BASE_URL.startsWith(DEFAULT_BASE);

/** Backbone chat model. Override with LLM_MODEL when running a local model. */
export const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "google/gemini-3-flash-preview";

/** Resolve the API key: local key first, otherwise the Lovable gateway key. */
export function llmApiKey(): string | undefined {
  return Deno.env.get("LLM_API_KEY") ?? Deno.env.get("LOVABLE_API_KEY") ?? undefined;
}

/** Headers valid for both the Lovable gateway and any OpenAI-compatible server. */
export function llmHeaders(key?: string): Record<string, string> {
  const k = key ?? llmApiKey() ?? "";
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${k}`,
  };
  if (IS_LOVABLE_GATEWAY) h["Lovable-API-Key"] = k;
  return h;
}
