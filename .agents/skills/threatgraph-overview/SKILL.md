---
name: threatgraph-overview
description: Map of the ThreatGraph system — dual pathways (deterministic pipeline vs agent loop), domain switch (CTI/Clinical), backbone model, and how to pick the right entry point for a task.
---

# ThreatGraph at a glance

LLM-enhanced Knowledge-Graph system. Two domains, two pathways, one backbone.

## Backbone
- Model: `google/gemini-3-flash-preview` via Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1`).
- Auth: `LOVABLE_API_KEY` in `Lovable-API-Key` header. Server-side only.
- Backend: Supabase Edge Functions (Lovable Cloud).

## Two domains (switched in header)
- **CTI** (default): STIX 2.1 SDO/SRO ontology — `threat_actor`, `malware`, `vulnerability`, `attack-pattern`…
- **Clinical** (research simulation only): ICD-10 / RxCUI / LOINC / SNOMED-CT codes. Banner always reads "Simulation".

Same pipeline; only ontology, prompt vocabulary, and validators swap by domain. See `clinical-mode` memory.

## Two pathways (both selectable in KG Construction page)

### Pathway B — Deterministic pipeline (default, KG-Bench scored)
Fixed-order stages, each = one edge function:
```
threat-preprocess → threat-rag → threat-extract → kb-validate
                  → threat-conflicts → threat-kg-query → (persist)
```
Orchestrated by `src/lib/threat-pipeline.ts` + `src/hooks/use-threat-pipeline.ts`.
Use when: reproducibility matters, KG-Bench scoring, benchmarks, ablations, paper figures.

### Pathway A — Agent loop (experimental, NOT benchmarked)
Single edge function `threat-agent` using Vercel AI SDK `generateText` + `tool()` + `stopWhen(stepCountIs(50))`.
Tools wrap the same edge functions but the model chooses order/repetition. Returns full step trace.
Use when: studying emergent ordering, qualitative demos, tool-use research.

## Pick the right pathway
| Task                                  | Pathway |
|---------------------------------------|---------|
| Score generator (precision/recall/F1) | B       |
| Reproducible per-stage timings        | B       |
| KG-Bench / Experiments page           | B       |
| Show off agentic reasoning in demos   | A       |
| Compare emergent vs scripted order    | both    |

## Related skills
- `graph-native-cot-prompt` — the 8-step CoT prompt used inside `threat-extract`
- `pipeline-stage-contracts` — input/output shapes per stage
- `kg-bench-rubric` — how the benchmark scores Pathway B
- `agent-loop-tools` — tool catalog for Pathway A
