
# Plan: LLM-KG-Bench 3.0 — adapted to evaluate the *KG generator*

## 1. Feasibility (short answer)

**Yes — feasible, with a meaningful adaptation.**

LLM-KG-Bench 3.0 (arxiv 2505.13098) is a task-oriented harness: it feeds an LLM standardized KG-engineering tasks (Turtle/RDF syntax repair, SPARQL Q&A, ontology fact retrieval, fact extraction from text → triples, etc.), auto-checks the output against a reference, and emits per-task scores. It evaluates **the model behind the API**.

In this project the unit under test is not a bare LLM — it is a **pipeline**: `Preprocess → Graph-Native CoT extract → KB-validate → Conflicts → KG insert`. So we cannot reuse the upstream Python harness as-is, but we **can reuse its task design, scoring rubric, and reporting model** and apply them to the pipeline's output. The "system-under-test" plug just becomes our edge-function chain instead of a raw `chat.completions` call.

Tasks that port cleanly to a KG-generator evaluator:
- **Fact Extraction → Triples** (drop-in: paste text, compare extracted (s,p,o) against gold)
- **Ontology Conformance** (every emitted node/edge type must be in the active ontology — CTI or Clinical)
- **Turtle / JSON-LD Serialization** (serialize the produced subgraph; parse-check with a Turtle/JSON-LD parser)
- **SPARQL-style Q&A** (run questions through `threat-kg-query`; compare answer sets)
- **Schema/Type Repair** (inject malformed triples → does `kb-validate` + `threat-conflicts` reject/fix them?)
- **Hallucination Control** (already partially implemented — formalize as a KG-Bench task)
- **Multilingual Generalization** (reuse the JA/ZH clinical samples you already drafted as a localized task pack)

Tasks deliberately **out of scope** (need a real triplestore or licensed ontologies): full SPARQL 1.1, OWL reasoning, DBpedia/Wikidata lookups, SHACL shape graphs. We will note these as "not implemented — requires triplestore".

## 2. What gets built

### A. Task pack (pure data, no infra)
`src/lib/kg-bench/` containing:
- `tasks.ts` — task definitions (id, name, domain, input, gold, scorer)
- `scorers.ts` — micro-/macro-F1 over triple sets, exact-match for serialization, set-overlap for Q&A
- `corpus/cti.ts` and `corpus/clinical.ts` — ~15 gold-annotated cases per domain (reuse existing CTI test corpus + the JA/ZH/EN clinical samples)

### B. Runner edge function
`supabase/functions/kg-bench-runner/index.ts`:
- Input: `{ taskIds, domain, modelOverride? }`
- For each task: invoke the project's existing pipeline (`threat-preprocess` → `threat-extract` → `kb-validate` → `threat-conflicts`) with `domain` propagated, then score
- Output: per-task scores + aggregate (Bench-Score), persisted to `monitoring_events` for the dashboard

### C. New "KG-Bench" tab inside the existing **Experiments** page
**No new sidebar item.** Add a `KG-Bench` tab next to "System Test" / "Stage 1" / "Stage 2":
- Task selector (checkbox grid grouped by category)
- Domain badge (CTI / Clinical) reads from `DomainContext`
- "Run Bench" button + live progress
- Results table: task · precision · recall · F1 · pass/fail · latency
- Radar chart: capability profile across the 7 task categories
- Comparison toggle: "Ours (pipeline)" vs "Vanilla LLM zero-shot" (reuses existing baseline runner) — this is what makes the result **publishable as KG-generator evaluation**, not just LLM evaluation
- "Export bench report" → JSON + Markdown under `/public/reports/`

### D. Documentation updates
- `public/reports/white-paper.md`: new section *"KG-Bench: adapting LLM-KG-Bench 3.0 to evaluate a KG-generation pipeline"* — methodology, deviations from upstream, score interpretation, multilingual results
- `public/reports/comprehensive-technical-report.md`: append latest bench scores per domain
- `public/reports/manifest.json`: register the new bench-report artifact
- New `mem://features/kg-bench` memory + index entry: "KG-Bench tab in Experiments; evaluates the *pipeline*, not the LLM alone; tasks port from LLM-KG-Bench 3.0; CTI + Clinical."

## 3. Files touched

**New**
- `src/lib/kg-bench/{tasks,scorers,index}.ts`
- `src/lib/kg-bench/corpus/{cti,clinical}.ts`
- `src/components/KGBenchPanel.tsx`
- `supabase/functions/kg-bench-runner/index.ts`
- `mem://features/kg-bench`

**Edited**
- `src/pages/Experiments.tsx` — mount `<KGBenchPanel />` inside a new `TabsTrigger value="kg-bench"`
- `public/reports/white-paper.md`, `comprehensive-technical-report.md`, `manifest.json`
- `mem://index.md` — add reference line

**Unchanged**
- Sidebar, routing, existing pipeline edge functions, DB schema (results go into `monitoring_events.metadata` JSONB — no migration)

## 4. Deliberately out of scope
- Importing the upstream Python harness (`pip install llm-kg-bench`) — runtime mismatch with edge functions; we port task *definitions* only
- Real triplestore (Fuseki/GraphDB) for SPARQL 1.1
- Licensed ontologies (full SNOMED CT, DBpedia dumps)
- DP/FL wrapping of the bench runner (kept compatible — runner already takes `domain`; a later FL layer slots in)

## 5. Risk / size
- ~700 LOC new, ~80 LOC edited, 0 deps, 0 migrations, 0 new secrets
- Default behavior unchanged for everyone not opening the new tab
- Bench runs reuse existing LLM budget (Gemini via Lovable AI Gateway) — typical 15-task run ≈ 30 LLM calls

## 6. What you'll see after build
1. Open **Experiments** → new **KG-Bench** tab
2. Pick tasks (default: 7 core), click **Run Bench**
3. Live table fills in; radar chart shows capability profile; "Ours vs vanilla-LLM" delta is the headline number
4. Switch the header to **Clinical** → same tab, clinical task pack auto-loads, JA/ZH samples included
5. **Export** writes `public/reports/kg-bench-<domain>-<timestamp>.{json,md}` and updates the white paper section
