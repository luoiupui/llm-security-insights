## Goal

Three coordinated changes:

1. **Thesis** — insert §2.1 *KG Construction Flow & Corpus Usage* (diagram + unit-vs-corpus table) into `experiments-academic-report.md/.pdf` so the relationship between the 7-step pipeline and the n=30 corpus is explicit.
2. **KG Construction page** — turn the single textarea into a **multi-source input picker** that exposes every data source the KG is actually built from, with reserved slots for future sources.
3. **KG Construction page** — add a **Downstream Consumers** panel below the graph showing where the persisted KG flows next (dashboard review, attribution, future intelligent decisioning), with reserved slots for future consumers.

No DB schema changes. No new edge functions.

---

## 1. Thesis update — §2.1 KG Construction Flow & Corpus Usage

**File:** `scripts/generate-reports.mjs` (the `whitePaper` template, ~line 150–209) → regenerates `public/reports/experiments-academic-report.md` and `.pdf`.

Insert a new subsection **before current §2.1 Graph-Native CoT**, renumber the existing 2.1–2.4 to 2.2–2.5.

Content to add:

- **One-paragraph clarification**: the KG only materialises after step 7 (persist). Steps 1–6 produce an in-memory graph used immediately for UI rendering; step 7 writes to `kg_entities` / `kg_relations` / `kg_causal_links` and makes it queryable by future runs (GraphRAG warm-up).
- **ASCII pipeline diagram** in a fenced ```text block:

```text
Input text (1 of 30 corpus cases  OR  live CISA feed  OR  pasted IOC report)
        |
        v
[1] Preprocess     -> defang, IOC extraction, source-reliability score
[2] RAG Retrieval  -> Vector RAG (pgvector) + GraphRAG subgraph from prior KG
[3] LLM Extract    -> 8-step Graph-Native CoT  (in-memory KG produced here)
[4] KB-Validate    -> deterministic check vs 2,844 MITRE/CVE/STIX entries
[5] Conflicts      -> neuro-symbolic rules + credibility scoring
[6] KG-Query       -> attribution / attack-path reconstruction
[7] Persist        -> writes kg_entities, kg_relations, kg_causal_links
                     (this is the durable KG; feeds step 2 of next run)
```

- **Unit-vs-corpus table** (Markdown table) showing how each experimental unit consumes the same n=30 corpus:

| Experimental unit | Corpus role | Pipeline stages exercised | Metric reported |
|---|---|---|---|
| Hallucination-Control (§5) | Inputs streamed to step 4 | 1→4 | hallucinated-ID rate |
| Comparative Smoke Test (§6) | Inputs scored vs gold labels | 1→3 (per system) | NER/RE F1 |
| Six-Layer System Test (§7) | Drives full pipeline; subgraphs become case studies | 1→7 | qualitative + Layer A coverage |
| Ablation Study (§8) | Same 30 inputs, pipeline toggles per arm | 1→7 with components disabled | delta vs full system |

- **Closing sentence**: clarifies that the n=30 corpus is the **shared input substrate** across all four units, which is why their numbers are directly comparable.

After editing the template, run `node scripts/generate-reports.mjs` to regenerate the `.md` and `.pdf`.

---

## 2. KG Construction page — Multi-source input picker

**File:** `src/pages/KGConstruction.tsx`

Replace the single `Textarea` block with a tabbed input picker. Tabs:

1. **Paste text** — current `Textarea` (default, unchanged behaviour).
2. **Test corpus (n=30)** — `Select` populated from `sampleTestCases` in `src/lib/test-corpus.ts`; selecting a case fills `inputText` with its `.text` and shows the case `id` + `source` as a small caption. Makes the §2.1 corpus link visible in the UI.
3. **Live CISA feed** — read-only list (last 5 rows from `threat_reports` where `source_type='cisa_advisory'`); clicking one loads its `source_text`. If the table query returns 0 rows, show a hint pointing to the existing *Bootstrap GraphRAG Corpus* button.
4. **Upload file** *(reserved)* — disabled tab with a "Coming soon" badge; placeholder for future `.txt` / STIX bundle upload.
5. **External API connector** *(reserved)* — disabled tab with a "Coming soon" badge; placeholder for OTX / MISP / VirusTotal pulls.

The existing **Extract, Validate & Persist to KG** button stays and operates on whichever source produced `inputText`. The descriptive paragraph under the buttons is updated to mention the four (current + reserved) source channels.

No new dependencies — uses existing `Tabs`, `Select`, `Badge` UI primitives and the `supabase` client already imported.

---

## 3. KG Construction page — Downstream Consumers panel

**File:** `src/pages/KGConstruction.tsx`

Add a new `Card` rendered after the graph SVG (only when `pipeline.persistence?.persisted` is true, otherwise show a muted placeholder explaining "Persist a KG to see downstream consumers"). Title: **KG Downstream — Where this graph flows next**.

Content: a 2-column grid of compact "consumer" cards. Each card has an icon, name, status badge, and one-line description. Initial set:

| Consumer | Status | Description |
|---|---|---|
| Dashboard review (Overview / KG Construction) | Active | Human analyst inspection of nodes, edges, causal links |
| Attribution engine (`/attribution`) | Active | Graph-aware actor attribution via `threat-kg-query` |
| GraphRAG warm-up (next pipeline run) | Active | Persisted KG becomes step 2 retrieval context |
| Conflict / credibility scoring | Active | Neuro-symbolic rules consume entities + relations |
| Automated response playbooks | Reserved | Future SOAR hand-off (e.g. block IOC, isolate host) |
| Risk-scoring & decision support | Reserved | Future analyst-assist for prioritisation |
| STIX 2.1 export to external SIEM | Reserved | Future bundle export endpoint |
| ML feedback loop (re-ranking) | Reserved | Future training signal for embedding fine-tune |

Active cards link to their existing route where one exists (`/attribution`, `/overview`). Reserved cards are visually muted with a "Planned" badge and no link — this satisfies the "leave space for further upgrade towards more intelligent decision making" requirement and makes the downstream surface explicit without faking functionality.

No backend work; this is a documentation/UX surface.

---

## Technical notes

- `sampleTestCases` is already exported from `src/lib/test-corpus.ts`; the new corpus tab imports it directly (client-side, no fetch).
- The CISA feed tab uses `supabase.from('threat_reports').select('id,source_text,created_at,source_type').eq('source_type','cisa_advisory').order('created_at',{ascending:false}).limit(5)`.
- Reserved tabs/cards use `disabled` + a `Badge variant="outline"` reading "Planned" — no half-built handlers.
- Thesis regeneration: the `whitePaper` template in `scripts/generate-reports.mjs` is the single source of truth; `.pdf` is built from it by the same script.
- No migration, no new edge function, no schema change. Memory remains accurate.

## Out of scope

- No real upload handler, no real external-API connector — those are deliberately reserved tabs.
- No new metrics, no new ablation runs — §2.1 is purely structural/expository.
- No changes to `/experiments`, ablation-runner, or any other pipeline code.
