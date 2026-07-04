/**
 * Performance instrumentation for Pathway B, Pathway A, and the
 * lightweight rule-based baseline. Emits stage-level latency, token
 * usage, and input size to the `pipeline_perf_events` table.
 *
 * IMPORTANT: this is a SIDE CHANNEL — it does NOT alter any stage's
 * response shape, so `pipeline-stage-contracts` remains intact.
 */

import { supabase } from "@/integrations/supabase/client";

export type Pathway = "pipeline" | "agent_loop" | "rule_based" | "llm_zeroshot";

export interface PerfEvent {
  run_id?: string;
  pathway: Pathway;
  stage: string;
  wall_ms: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  input_chars?: number | null;
  sample_id?: string | null;
  domain?: string;
  metadata?: Record<string, unknown>;
}

const buffer: PerfEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Wraps an async stage call, records wall_ms + metadata to Supabase. */
export async function withPerf<T>(
  meta: Omit<PerfEvent, "wall_ms">,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    record({ ...meta, wall_ms: performance.now() - t0 }, result);
    return result;
  } catch (err) {
    record({
      ...meta,
      wall_ms: performance.now() - t0,
      metadata: { ...(meta.metadata ?? {}), error: (err as Error).message },
    });
    throw err;
  }
}

function record(event: PerfEvent, result?: unknown): void {
  // best-effort token counts if the stage returned usage
  const usage =
    result && typeof result === "object" && result !== null && "usage" in result
      ? (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage
      : undefined;
  buffer.push({
    ...event,
    input_tokens: event.input_tokens ?? usage?.prompt_tokens ?? null,
    output_tokens: event.output_tokens ?? usage?.completion_tokens ?? null,
  });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, 500);
}

export async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)("pipeline_perf_events").insert(batch);
  } catch {
    // swallow — perf logging must never break the pipeline
  }
}

/** Manual insertion for callers that don't want the wrapper. */
export async function logPerf(event: PerfEvent): Promise<void> {
  buffer.push(event);
  scheduleFlush();
}

/** Rough token estimate for input-only counting when the stage doesn't return usage. */
export function estimateTokens(text: string): number {
  // GPT-family rule of thumb: 1 token ≈ 4 chars of English (or 1 CJK char)
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(rest / 4) + cjk;
}
