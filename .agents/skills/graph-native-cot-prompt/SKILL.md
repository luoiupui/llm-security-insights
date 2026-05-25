---
name: graph-native-cot-prompt
description: The 8-step Graph-Native Chain-of-Thought prompt contract used by threat-extract. Differs from standard LLM-NER by emitting (Subject, Predicate, Object) triples as first-class reasoning steps. Includes the CTI (STIX 2.1) and Clinical variants and the strict JSON output schema.
---

# Graph-Native CoT prompt

Lives in `supabase/functions/threat-extract/index.ts` as `GRAPH_NATIVE_COT_PROMPT`.

## Core idea
The LLM does NOT extract entities first, then build a graph. It THINKS in triples from step 1.
Every observation is immediately formalised as a graph triple inside the reasoning chain.

## The 8 steps (do not reorder)
1. **Narrative graph seed** — emit seed triples `(campaign_X, attributed-to, actor_Y)` etc. No bare entity list.
2. **Ontology-grounded node expansion** — every node gets `stix_type | clinical_code`, `confidence`, `evidence_span`. Reject nodes that don't map to the ontology.
3. **Predicate inference with evidence** — every edge cites a text span; apply transitivity at `parent_conf × 0.7`.
4. **Temporal subgraph construction** — `(event_i, precedes, event_j)` with certainty: `explicit_timestamp > narrative_order > inferred`.
5. **Causal graph fusion** — fuse temporal + relational into causal edges (`enables` w=0.9, `leads_to` w=0.85, `triggers` w=0.8, `precedes` w=0.6). Causal_conf = `min(temporal_conf, relational_conf) × causal_weight`.
6. **Confidence weighting with source reliability** — propagate `conf × source_reliability` along edges.
7. **Graph metadata emission** — output subgraph groupings (campaigns, kill-chains).
8. **Narrative summary** — 2-3 sentence prose for human review.

## Output JSON schema (strict)
```json
{
  "entities": [{"name", "type", "confidence", "stix_type?", "mitre_id?", "context?"}],
  "relations": [{"source", "relation", "target", "confidence", "evidence?", "edge_type", "derived_from?"}],
  "causal_links": [{"cause", "effect", "causal_type", "temporal_order", "confidence", "evidence?", "mitre_tactic?"}],
  "graph_native": {"nodes": [...], "edges": [...], "subgraphs": [{"name", "type", "node_ids"}]}
}
```

## Domain swap
- CTI ontology: see `src/lib/ontology/cti.ts`.
- Clinical ontology: see `src/lib/ontology/clinical.ts` — replace SDO/SRO with ICD-10/RxCUI/LOINC vocabularies. STEP labels unchanged.

## Rules
- Never break the output schema without updating `pipeline-stage-contracts` AND bumping KG-Bench gold.
- RAG context is prepended via `rag_context` param; if empty, model must rely solely on source text.
- `reliability_score` (0–1) is multiplied into all entity confidences post-extraction (Step 6 enforces this).
