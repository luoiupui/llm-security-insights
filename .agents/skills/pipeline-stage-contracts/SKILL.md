---
name: pipeline-stage-contracts
description: Input/output contracts for every deterministic pipeline stage (Pathway B). These shapes are load-bearing — KG-Bench, the React hook, the agent-loop tools, and the persistence layer all depend on them. Break them and you break the benchmark.
---

# Stage contracts (Pathway B)

Source of truth: `src/lib/threat-pipeline.ts`. Mirror in `supabase/functions/<stage>/index.ts`.

## Cardinal rule
**Do not change a stage's response shape without** (a) updating consumers in `src/hooks/use-threat-pipeline.ts`, `src/components/AgentLoopPanel.tsx`, `src/lib/kg-bench/runner.ts`, AND (b) bumping the gold-corpus version in `src/lib/kg-bench/corpus.ts`.

## Stage 1 — `threat-preprocess`
- In: `{ text, source_type?, domain }`
- Out: `{ cleaned_text, iocs_found[], source_type, reliability_score (0–1), clinical_codes[]? }`

## Stage 2 — `threat-rag` (action: `embed_and_retrieve`)
- In: `{ action, text, top_k, frozen_snapshot_at? }`
- Out: `{ similar_reports[], subgraph: { entities[], relations[] }, context_block }`

## Stage 3 — `threat-extract` (Graph-Native CoT)
- In: `{ text, mode: "full"|"ner"|"re"|"causality", source_type?, reliability?, rag_context, domain, repro? }`
- Out: see `graph-native-cot-prompt` skill — fields `ner`, `re`, `causality`, `graph_native`, `rag_used`.

## Stage 4 — `kb-validate`
- In: `{ entities[], relations[], causal_links[], source_text, domain }`
- Out: `{ accuracy (0–1), summary: { ok, total_checks, hallucinated }, synthesized? }`

## Stage 5 — `threat-conflicts`
- In: `{ entities, relations, causal_links, reliability?, graph_native?, domain }`
- Out: `{ summary: { passed, warnings, failures }, credibility_score, violations[] }`

## Stage 6 — `threat-kg-query` (attribution)
- In: `{ query, entities, relations, causal_links, graph_native?, domain }`
- Out: `{ attributed_actor, confidence (0–1), reasoning_trace[], alternatives[] }`

## Stage 7 — persist (`threat-rag` action `persist`)
- In: full extraction + source text
- Out: `{ report_id, persisted: true }`
- **Requires user approval in agent loop (`needsApproval`)** — it writes to the DB.

## Domain parameter
Every stage accepts `domain: "cti" | "clinical"` (default `"cti"`). Forward it explicitly — do not infer.
