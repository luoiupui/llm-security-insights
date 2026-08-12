# Plan: Full-Stack Architecture Technical Report

## Goal
Write a single technical report that confirms ThreatGraph is a full-stack AI application, maps every layer (frontend, backend, data, AI), and lists the typical full-stack tools each layer uses. Output: `public/reports/full-stack-architecture-assessment.md` + manifest update.

## Confirmed current state (pre-plan reads)

### Frontend (client)
- React 18.3 + TypeScript 5.8 + Vite 5.4 (build/serve)
- Tailwind CSS v3.4 + shadcn/ui (Radix UI primitives: 30+ packages)
- React Router v6 (12 routes in `src/App.tsx`)
- TanStack Query v5 (server-state cache)
- Recharts v2 (KG growth, threat distribution, F1 curves)
- Framer Motion v12 (animated cards, transitions)
- React Hook Form v7 + Zod v3 (forms/validation)
- 13 pages, 18 components, domain + language contexts, i18n dictionary

### Backend (server)
- 22 Supabase Edge Functions (Deno runtime) under `supabase/functions/`
- Groups: pipeline (`threat-preprocess`, `threat-rag`, `threat-extract`, `threat-extract-hyper`, `kb-validate`, `threat-conflicts`, `threat-conflicts-mine`, `threat-kg-query`), experiments (`experiment-runner`, `ablation-runner`, `bench-worker`, `bench-aggregate`, `bench-schedule`), corpus ingest (`corpus-ingest-cisa-kev`, `-mitre-groups`, `-rss`, `cisa-advisories-ingest`, `kb-ingest`), infra (`mcp`, `redaction-adjudicate`, `threat-agent`)
- Shared helpers: `_shared/llm-endpoint.ts` (LLM indirection), `_shared/ai-gateway.ts` (AI SDK provider), `_shared/rules/` (rule kernel)

### Data (persistence)
- 10 migrations; 14 `public.*` tables: `kb_entries`, `threat_reports`, `kg_entities`, `kg_relations`, `kg_causal_links`, `monitoring_events`, `bench_cases`, `bench_runs`, `kg_conflict_rule_candidates`, `kg_corroborated_findings`, `kg_hyperedges`, `kg_pathway_runs`, `kg_rule_replays`, `kg_rule_sets`, `pipeline_perf_events`
- RLS enabled; research/demo posture (open writes to append-only tables, public reads on `threat_reports`)

### AI / integration
- Lovable AI Gateway (`google/gemini-3-flash-preview`) via `_shared/llm-endpoint.ts`
- LLM indirection layer supports local swap (Ollama/vLLM/llama.cpp) with zero code changes
- MCP server at `/functions/v1/mcp` (5 tools, `@lovable.dev/mcp-js`)
- Zero-shot posture: frozen model, no training in CTI/KG layers

## Report structure (what will be written)

1. **Verdict** — Yes, full-stack AI app; one-paragraph summary with evidence pointers.
2. **Architecture diagram** — Mermaid `flowchart LR` showing Browser → Edge Functions → PostgreSQL, with AI Gateway + MCP sidecars.
3. **Layer-by-layer table** — columns: Layer | Responsibility | Tools | Key files.
   - Frontend, Backend (Edge Functions), Data (Postgres/RLS), AI (Gateway/LLM indirection), Integration (MCP), Testing, DevOps/Build.
4. **Full-stack characteristics checklist** — 8 items (client-server flow, persistence, auth-ready, stateful pipeline, API contracts, env-driven config, real-time eval, deployment artifacts) each marked present/absent with evidence.
5. **Gaps vs typical full-stack** — what is deliberately absent (auth login flow, SSR, websocket realtime subscriptions, CI/CD pipeline, containerization) and why.
6. **Conclusion** — maturity rating per layer + overall.

## Files to create/modify
- CREATE `public/reports/full-stack-architecture-assessment.md`
- EDIT `public/reports/manifest.json` — add the new report entry

## Non-goals
- No code changes to frontend/backend logic.
- No new dependencies.
- No security/RLS changes.
