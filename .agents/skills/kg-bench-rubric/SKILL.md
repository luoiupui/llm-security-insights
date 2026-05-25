---
name: kg-bench-rubric
description: How KG-Bench (adapted from LLM-KG-Bench 3.0, arXiv 2505.13098) scores the deterministic ThreatGraph pipeline. 7 task categories, per-case precision/recall/F1, macro-F1 bench-score. Covers CTI + Clinical with JA/ZH multilingual cases.
---

# KG-Bench scoring

Lives in `src/lib/kg-bench/{scorers,corpus,runner}.ts`. UI: `src/components/KGBenchPanel.tsx` mounted in `src/pages/Experiments.tsx`.

## Key adaptation vs upstream
Upstream LLM-KG-Bench evaluates a bare LLM (one chat call).
We swap the system-under-test to the **full Pathway B pipeline** (`preprocess → extract → kb-validate → conflicts`). Task design + rubric reused.
**Pathway A (agent loop) is intentionally NOT scored** — its variable ordering would invalidate per-stage assertions.

## 7 task categories
1. **Fact Extraction → Triples** — F1 over `(subject, predicate, object)`.
2. **Ontology Conformance** — fraction of nodes/edges whose `stix_type` / clinical code matches the schema.
3. **Turtle / JSON-LD Serialisation** — round-trip parse + structural equality.
4. **SPARQL-style Subgraph Q&A** — answer set F1 over entity names.
5. **Schema / Type Repair** — model recovers from malformed input.
6. **Hallucination Control** — fraction of emitted entities that pass `kb-validate`.
7. **Multilingual Generalisation** — JA + ZH clinical samples; tests language-agnostic code extraction (ICD-10, RxCUI).

## Scoring (`scorers.ts`)
- `scoreTriples(predicted, gold) → { precision, recall, f1, tp, fp, fn }` using a normalised triple key.
- `scoreSet(predicted, gold)` for entity-list tasks.
- `scoreTurtleRoundtrip(turtle)` for serialisation.
- Per-run aggregate: **Bench-Score = macro-F1 over all categories**.

## Adding a new gold case
1. Edit `src/lib/kg-bench/corpus.ts`, append to the relevant domain + category array.
2. Include `id`, `text`, expected `gold` (triples / set / turtle as appropriate), and `tags` (e.g. `["ja", "icd10"]`).
3. Re-run from UI → export Markdown → diff against previous bench-score.

## Out of scope
- Full SPARQL 1.1 endpoint (needs triplestore)
- OWL reasoning / SHACL shapes
- Licensed ontologies (full SNOMED CT, DBpedia)
- Scoring Pathway A

## Reproducibility
Bench runs filter `monitoring_events.metadata->>'path' = 'pipeline'`. Agent-loop runs use `'agent_loop'` and are excluded.
