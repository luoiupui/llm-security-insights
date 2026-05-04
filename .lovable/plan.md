## Goals

1. Make extraction reproducibility **configurable** from the UI (defaults pinned to deterministic, but user can switch for comparison).
2. Surface the **temporal/timeline** dimension that already exists in the data but is currently invisible in the rendered KG.

---

## Part 1 — Reproducibility Controls

### Current state (verified)
- `threat-extract/index.ts` line 413 hardcodes `temperature: 0.1`, no `seed`.
- `threat-rag/index.ts` line 59 reads `top_k` from request body (default 3), but the UI always passes 3 and uses live (growing) corpus.
- No "frozen snapshot" concept exists.

### Changes

**A. `supabase/functions/threat-extract/index.ts`**
- Accept new body fields: `temperature` (number, default `0`), `seed` (number, default `42`), `deterministic` (bool, default `true`).
- Pass `temperature` and `seed` into the Lovable AI Gateway call. When `deterministic=true`, force `temperature=0` and a fixed seed regardless.

**B. `supabase/functions/threat-rag/index.ts`**
- Accept `frozen_snapshot_at` (ISO timestamp). When set, filter `threat_reports` with `created_at <= frozen_snapshot_at` before similarity search — this freezes the GraphRAG corpus for reproducibility.
- Keep `top_k` as-is but make sure the value flows through from the UI.

**C. `src/lib/threat-pipeline.ts`**
- Extend `extractThreats(...)` and `retrieveContext(...)` signatures with a single optional `repro?: ReproConfig` param:
  ```ts
  type ReproConfig = {
    deterministic: boolean;   // default true
    temperature: number;       // 0..1
    seed: number;
    topK: number;              // 1..10
    frozenSnapshotAt: string | null; // ISO date or null = live
  }
  ```
- Default exported constant `DEFAULT_REPRO` with deterministic preset.
- Thread `repro` through `runFullPipeline`.

**D. `src/hooks/use-threat-pipeline.ts`**
- Accept and forward `repro` to extract/retrieve calls.

**E. `src/pages/KGConstruction.tsx` — new "Reproducibility Settings" panel**
- Collapsible card above the Input Source card titled **"Reproducibility & Comparison Mode"**.
- Controls:
  - Preset selector (radio): **Deterministic (default)** | **Exploratory** | **Custom**.
    - Deterministic → `{temperature:0, seed:42, topK:3, frozenSnapshotAt:<now-at-first-load>}`
    - Exploratory → `{temperature:0.7, seed:random, topK:5, frozenSnapshotAt:null}`
    - Custom → reveals individual controls.
  - Slider: Temperature (0.0 – 1.0, step 0.1).
  - Number input: Seed.
  - Slider: Top-K RAG (1 – 10).
  - Toggle + datetime: Freeze RAG snapshot at … (defaults to "now" timestamp captured on toggle-on).
- Settings persisted in `localStorage` under `tg.repro.config`.
- Small badge on the "LLM-Generated Knowledge Graph" card showing the active preset (e.g. `Deterministic · T=0 · seed=42 · k=3 · snapshot=2026-05-04T…`) so each generated graph is self-documenting for thesis comparisons.

---

## Part 2 — Timeline / Temporal KG

### Current state (verified)
- The schema already stores temporal data:
  - `kg_causal_links.temporal_order` (integer)
  - `kg_causal_links.causal_type` ∈ {enables, leads_to, triggers, precedes}
  - `extraction.causality.attack_timeline[]` with `order`, `event`, `timestamp_mentioned`, `certainty`
- The current SVG renderer (`KGConstruction.tsx` lines 477–497) only plots **nodes + relational edges** with random/force coordinates. **Causal links and `temporal_order` are extracted and persisted but never drawn.** So the final KG is rendered as a *static* graph despite the underlying data being temporal.

### Changes

**A. KG renderer — add a "Timeline view" toggle**
- Add a view-mode segmented control on the "LLM-Generated Knowledge Graph" card: **Force-directed** (current) | **Timeline** (new).
- **Timeline layout** (when selected):
  - X-axis = `temporal_order` from `attack_timeline` / `causal_links` (left = earliest).
  - Y-axis = entity type lane (threat_actor / malware / vulnerability / infrastructure / ttp).
  - Causal edges drawn as arrows with markers; edge color encodes `causal_type` (enables=blue, leads_to=amber, triggers=red, precedes=gray).
  - Edge labels show the causal_type when zoomed; small timestamp captions under each event node when `timestamp_mentioned` exists.
  - Lightweight time axis at the bottom with tick labels for ordered steps `t1 … tN`.

**B. Build a `buildTimelineLayout(extraction)` helper**
- Walk `extraction.causality.attack_timeline` → assign each event an x-slot.
- Map each event to its primary entity (string match against `nodes`) → assign y-lane.
- Produce `{nodes:[{id,x,y,type,timestamp}], edges:[{from,to,causal_type,confidence}]}`.

**C. SVG export (PNG + SVG buttons) already in place** — they will automatically capture the new timeline view since they serialize whatever is in `svgRef`.

**D. Legend + empty-state**
- If `causal_links.length === 0`, show an inline note: *"No temporal links extracted from this corpus — switch to Force-directed view."* and disable the Timeline option.

---

## Technical notes

- Lovable AI Gateway (`gemini-3-flash-preview`) accepts `temperature`; `seed` is forwarded but model-side determinism is best-effort. The UI badge will make this transparent.
- `frozen_snapshot_at` filter is a simple `WHERE created_at <= $1` on `threat_reports` inside `match_threat_reports` call path. We can add it client-side after fetching candidates (no DB function change needed) to keep the migration scope zero.
- No DB migration required — all temporal data already exists.

## Files touched

- `supabase/functions/threat-extract/index.ts`
- `supabase/functions/threat-rag/index.ts`
- `src/lib/threat-pipeline.ts`
- `src/hooks/use-threat-pipeline.ts`
- `src/pages/KGConstruction.tsx` (new repro panel + timeline view + helper)

## Answer to your second question

The system **does** capture the temporal dimension end-to-end (LLM extracts `attack_timeline` with order + timestamps + certainty, persisted in `kg_causal_links.temporal_order`/`causal_type`), but the **final KG visualization in the UI is static** — it renders only structural nodes and relational edges and ignores `temporal_order` and `causal_type`. So the data is dynamic; only the rendering is static. Part 2 above closes that gap.
