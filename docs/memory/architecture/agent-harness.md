---
mem_path: mem://architecture/agent-harness
name: agent-harness
description: Dual-pathway architecture — deterministic pipeline (Pathway B, KG-Bench scored) and AI-SDK agent loop (Pathway A, experimental). When each is used and why both must coexist.
type: architecture
exported_at: 2026-05-26
---

ThreatGraph runs two parallel KG-construction pathways:

**Pathway B (default, deterministic)** — `src/lib/threat-pipeline.ts` orchestrates fixed-order edge functions (preprocess → rag → extract → kb-validate → conflicts → attribute → persist). Raw `fetch` to Lovable AI Gateway. KG-Bench (`src/lib/kg-bench/*`) scores this pathway only; per-stage assertions require deterministic order.

**Pathway A (experimental)** — `supabase/functions/threat-agent/index.ts` uses Vercel AI SDK `generateText` + `tool()` + `stopWhen(stepCountIs(50))`. Tools wrap the same edge functions; LLM chooses order. UI: `src/components/AgentLoopPanel.tsx` mounted at top of `src/pages/KGConstruction.tsx`. Marked EXPERIMENTAL · not benchmarked. Logs to `monitoring_events.metadata.path = "agent_loop"`.

**Why both**: research demands reproducibility (B) AND emergent-ordering experiments (A). Migrating B to AI SDK would break KG-Bench gold; agent-only would lose paper-grade benchmarks.

**Rule**: never reorder B's stages or change a stage's response shape without bumping KG-Bench gold (`pipeline-stage-contracts` skill). Adding a tool to A is safe — just wrap, don't re-implement.

**Shared helper**: `supabase/functions/_shared/ai-gateway.ts` exposes `createLovableAiGatewayProvider(key)`. Use it for any future AI-SDK-based edge function.
