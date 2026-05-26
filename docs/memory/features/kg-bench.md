---
mem_path: mem://features/kg-bench
name: KG-Bench
description: LLM-KG-Bench 3.0 adapted to evaluate the KG generator pipeline (not LLM alone); CTI + Clinical; tab in Experiments
type: feature
exported_at: 2026-05-26
---
KG-Bench (Experiments → KG-Bench tab) evaluates the full pipeline (Preprocess → Extract → Validate → Conflicts), not the LLM in isolation. Adapted from LLM-KG-Bench 3.0 (arXiv:2505.13098v1).

7 task categories: fact_extraction, ontology_conformance, serialization, qa, repair, hallucination, multilingual (EN/JA/ZH).

Files:
- `src/lib/kg-bench/{corpus,scorers,runner}.ts` — gold corpus, F1 scorers, pipeline driver
- `src/components/KGBenchPanel.tsx` — task picker, radar chart, per-case table, .md export
- Mounted as `<TabsTrigger value="kgbench">` inside `src/pages/Experiments.tsx`

Bench-Score = macro-F1 across active categories. Triple matching is case- and punctuation-insensitive. Hallucination category rewards empty output on no-fact text. Domain (CTI/Clinical) auto-switches via `useDomain()`; runner forwards `domain` to all edge functions so a future DP/FL wrapper slots in without refactor.

Out of scope: full SPARQL 1.1, OWL, SHACL, licensed ontologies — would require a triplestore.
