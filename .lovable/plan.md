# Dual-Pathway Agent Harness + Skills

## What's there today (audit)

- **No agent framework.** LLM calls are raw `fetch` to `https://ai.gateway.lovable.dev/v1/chat/completions` inside edge functions (`threat-extract`, `threat-conflicts`, `kb-validate`, `experiment-runner`, `ablation-runner`).
- **Pattern**: hand-rolled fixed-order pipeline `Preprocess → RAG → Extract (8-step Graph-Native CoT) → KB-Validate → Conflicts → Attribution → Persist`, orchestrated by `src/lib/threat-pipeline.ts` + `src/hooks/use-threat-pipeline.ts`. This is **Plan-Execute + Critic**, not a tool-calling agent.
- **No `SKILL.md`, no `.workspace/skills/`, no `lovable/agents/*`, no AI SDK (`ai`, `@ai-sdk/openai-compatible`).**
- KG-Bench depends on the deterministic stage order (it asserts per-stage outputs).

## Goal

Two parallel pathways, both selectable from the dashboard, plus a portable Skill set documenting the system.

```
┌─────────────────────── Pathway A (NEW): Agent-Loop ──────────────────────┐
│  AI SDK streamText + tool() + stopWhen(stepCountIs(50))                  │
│  Model decides ordering; tools = preprocess/retrieve/extract/validate/   │
│  conflicts/attribute/persist. Streams reasoning trace to UI.             │
│  Purpose: research experiment (emergent ordering, tool-call traces).     │
│  NOT scored by KG-Bench.                                                 │
└──────────────────────────────────────────────────────────────────────────┘
┌─────────────────── Pathway B (EXISTING, lightly refactored) ─────────────┐
│  Deterministic fixed-order pipeline. AI SDK replaces only the raw fetch  │
│  + manual JSON.parse inside threat-extract / threat-conflicts /          │
│  kb-validate using generateText + Output.object (Zod schemas).           │
│  Stage order unchanged → KG-Bench still works unchanged.                 │
└──────────────────────────────────────────────────────────────────────────┘
```

## Deliverables

### 1. Shared gateway helper
- `supabase/functions/_shared/ai-gateway.ts` — `createLovableAiGatewayProvider(key)` per `ai-sdk-lovable-gateway` (uses `npm:@ai-sdk/openai-compatible`, `Lovable-API-Key` header, `X-Lovable-AIG-SDK: vercel-ai-sdk`).

### 2. Pathway B — partial AI-SDK migration (deterministic, KG-Bench compatible)
Edit three edge functions to swap raw `fetch` + `JSON.parse` for `generateText({ model, output: Output.object({ schema: z.object({...}) }) })`. **Stage signatures, response shapes, and order all preserved**, so `src/lib/threat-pipeline.ts`, `use-threat-pipeline`, and `kg-bench/runner.ts` need zero changes.
- `supabase/functions/threat-extract/index.ts` — Zod schema for `{entities, relations, causal_links, graph_native}`.
- `supabase/functions/threat-conflicts/index.ts` — Zod schema for arbitration output.
- `supabase/functions/kb-validate/index.ts` — Zod schema for synthesis output.
Verify after deploy by re-running KG-Bench in the UI; macro-F1 should stay within ±2 points.

### 3. Pathway A — true agent loop (NEW)
- `supabase/functions/threat-agent/index.ts` — single endpoint. Defines 7 AI-SDK tools wrapping the same internal logic (`preprocess`, `retrieve`, `extract`, `kb_validate`, `detect_conflicts`, `attribute`, `persist`). Calls `streamText({ model: gemini-3-flash-preview, tools, system: AGENT_SYSTEM_PROMPT, stopWhen: stepCountIs(50) })`. Returns `toUIMessageStreamResponse()`.
- `src/lib/agent-loop.ts` — thin client invoker via `useChat`/`DefaultChatTransport` pointed at the function URL.
- `src/components/AgentLoopPanel.tsx` — new tab content: text input, live streamed tool-call trace (render `message.parts` showing tool names, args, results), final attribution summary, "tools used" badge cloud. Marked **EXPERIMENTAL · not benchmarked**.
- `src/pages/KGConstruction.tsx` — add a top-level `Tabs` row: **`Deterministic Pipeline` (default)** | **`Agent Loop (experimental)`**. Existing UI moves under the first tab; `AgentLoopPanel` mounts under the second. KG-Bench panel in `Experiments.tsx` stays bound to Pathway B only and gets a small note: *"Scores the deterministic pathway."*

### 4. Skills (`.agents/skills/*`, applied via `skills--apply_draft`)
Five compact skills, each `SKILL.md` ≤ 100 lines + optional references:
- `threatgraph-overview` — system map, pathway selection, when to use which.
- `graph-native-cot-prompt` — the 8-step CoT contract + output JSON schema (CTI + Clinical variants).
- `pipeline-stage-contracts` — input/output Zod schemas for every stage; rule: never break these without bumping KG-Bench gold.
- `kg-bench-rubric` — 7 task families, scoring formulas, how to add a new gold case.
- `agent-loop-tools` — tool catalog for Pathway A, system prompt, `stopWhen` rules, when to add a new tool.

After writing under `.agents/skills/<name>/`, call `skills--apply_draft` on each so they activate in `.workspace/skills/`.

### 5. Docs + memory
- `public/reports/white-paper.md` — add §7 "Dual-Pathway Harness: deterministic vs agentic" with a comparison table.
- `mem://architecture/agent-harness` (new) + update `mem://index.md` Memories list.

## Technical details

- **Model**: `google/gemini-3-flash-preview` on both pathways (unchanged).
- **stopWhen**: `stepCountIs(50)` (rule minimum).
- **needsApproval**: set on `persist` tool only (it writes to DB).
- **Domain switch**: agent-loop tools accept `domain: "cti" | "clinical"` arg; system prompt branches ontology vocabulary the same way the deterministic pipeline does.
- **No DB migration, no new secrets** (`LOVABLE_API_KEY` already present).
- **Deps to add**: `npm:ai`, `npm:@ai-sdk/openai-compatible`, `npm:zod` inside the edge functions only (Deno `npm:` imports — no `package.json` change).
- **Reproducibility**: agent-loop runs are logged to `monitoring_events` with `path: "agent_loop"`; deterministic runs keep `path: "pipeline"`. KG-Bench filters on `path = "pipeline"`.

## Out of scope (explicit)
- Migrating `experiment-runner` / `ablation-runner` (they back KG-Bench numerics — leave as raw fetch for byte-identical reproducibility).
- Privacy-Preserving Computation / Federated Learning wrappers (future).
- Replacing the symbolic conflict rules with LLM-only reasoning.

## Files touched

Created: `supabase/functions/_shared/ai-gateway.ts`, `supabase/functions/threat-agent/index.ts`, `src/lib/agent-loop.ts`, `src/components/AgentLoopPanel.tsx`, `.agents/skills/{threatgraph-overview,graph-native-cot-prompt,pipeline-stage-contracts,kg-bench-rubric,agent-loop-tools}/SKILL.md`, `mem://architecture/agent-harness`.

Edited: `supabase/functions/threat-extract/index.ts`, `supabase/functions/threat-conflicts/index.ts`, `supabase/functions/kb-validate/index.ts`, `src/pages/KGConstruction.tsx`, `src/components/KGBenchPanel.tsx` (one-line note), `public/reports/white-paper.md`, `mem://index.md`.

Approx ~900 LOC new, ~120 LOC edited, 0 migrations, 0 new secrets, 0 npm package.json changes.
