---
name: agent-loop-tools
description: Tool catalog and system prompt for Pathway A (threat-agent edge function). Uses Vercel AI SDK tool() + stopWhen(stepCountIs(50)). When and how to add a new tool, what NOT to expose, and approval rules.
---

# Agent-loop tools (Pathway A)

Edge function: `supabase/functions/threat-agent/index.ts`.
Runtime: Deno + `npm:ai@^5` + `npm:@ai-sdk/openai-compatible` + `npm:zod`.
Shared provider helper: `supabase/functions/_shared/ai-gateway.ts`.

## Loop control
- `stopWhen: stepCountIs(50)` — minimum per Lovable rules. Do not lower.
- Model: `google/gemini-3-flash-preview` (same backbone as Pathway B).
- Returns: `{ steps_taken, finish_reason, summary, trace, scratch }` — non-streaming for trace inspection.

## Tool catalog
| Tool              | Wraps edge function       | needsApproval | Notes |
|-------------------|---------------------------|---------------|-------|
| `preprocess`      | `threat-preprocess`       | no  | Always cheap; agent should usually start here |
| `retrieve`        | `threat-rag` (embed)      | no  | Skippable for short self-contained input |
| `extract`         | `threat-extract`          | no  | The Graph-Native CoT call |
| `kb_validate`     | `kb-validate`             | no  | Requires `extract` first |
| `detect_conflicts`| `threat-conflicts`        | no  | Requires `extract` first |
| `attribute`       | `threat-kg-query`         | no  | Takes a NL query |
| `persist`         | `threat-rag` (persist)    | **yes** | Writes to KG; gated |
| `finish`          | (sentinel)                | no  | Forces clean stop with summary |

All tools share a `scratch` object so later tools can reference earlier outputs without re-passing payloads through the model context.

## When to add a new tool
- It wraps an existing or new edge function with a narrow, serialisable result.
- It does NOT duplicate logic — wrap, don't re-implement.
- Schema is a tight Zod object; no free-form `any`.
- Mutating tools must set `needsApproval`.

## When NOT to add a tool
- For deterministic benchmarking — that's Pathway B's job.
- For raw SQL / shell / file IO — keep blast radius small.
- For another LLM call — that defeats the purpose; let the agent loop reason instead.

## System prompt
Lives inline as `AGENT_SYSTEM_PROMPT`. Lists a "typical productive order" but explicitly allows deviation, with justification. Always asks for a 2-3 sentence final summary.

## Logging
Tag agent-loop monitoring events with `metadata.path = "agent_loop"` so KG-Bench's `path = "pipeline"` filter excludes them.
