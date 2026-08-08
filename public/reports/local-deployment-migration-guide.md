# Local Deployment & Offline Migration Guide — ThreatGraph (CTI)

Version 1.0 · scope: run the **entire** project on a local PC, with the Lovable-hosted
LLM replaced by a locally deployed model. CTI domain only (Clinical stays a simulation).

---

## 1. What is accessible, and from where

| Asset | Lovable site | GitHub repo | Downloadable? |
|---|---|---|---|
| Frontend codebase (`src/`, `index.html`, configs) | Code editor → **Download codebase** (paid workspace) | Yes — full mirror via two-way sync | Yes |
| Edge functions (`supabase/functions/*`, 22 functions) | Included in codebase download | Yes | Yes |
| DB schema / migrations (`supabase/migrations`) | Included in codebase download | Yes | Yes |
| **DB rows** (KG entities, relations, hyperedges, rule sets, replays, bench runs) | Cloud → Advanced settings → **Export data** | Not in git (data ≠ code) | Yes, separate export |
| Gold-56 corpus (`src/lib/test-corpus.ts`) | In codebase | Yes | Yes |
| GoldAug-CTI v1 (333/336 items — generated deterministically from the 56 seeds by `src/lib/augmentation/`) | In codebase | Yes | Yes (regenerated at runtime, no blob needed) |
| N≥1,000 bench corpus | **Not in git** — ingested at runtime into the DB by `corpus-ingest-*` functions from public feeds (CISA KEV, MITRE Groups, RSS) | Adapters only | Re-ingestible locally, or via DB export |
| External benchmarks (DNRTI / CASIE) | Loader/adapters only, no data | Adapters only | User must supply the licensed files |
| Reports & docs (46 files in `public/reports/`) | **Experiments → Download All (ZIP)**, or `/reports/<name>` direct link | Yes, in repo | Yes |
| Mermaid architecture diagrams (`docs/roadmap/*.mmd`) | In codebase | Yes | Yes |
| Secrets (`LOVABLE_API_KEY`, service-role key, DB password) | **Not exportable** by design | No | No — you provide your own locally |

**Panel-by-panel accessibility after local migration**

| Panel / route | Works fully offline? | Requires |
|---|---|---|
| `/` Overview | Yes | none |
| `/data-ingestion` | Yes | local Supabase + local LLM |
| `/kg-construction` (Pathway A/B/C, GoldAug tab) | Yes | local LLM (`threat-extract`, `-hyper`) |
| `/attribution` | Yes | local LLM (`threat-kg-query`) |
| `/experiments` (KG-Bench, ablation, robustness, rule governance, external benchmarks) | Yes | local LLM; DNRTI/CASIE files if used |
| `/threat-feed`, corpus ingest panels | Needs **internet** for CISA/MITRE/RSS fetches; otherwise seed from the DB export | outbound HTTPS or DB dump |
| `/implementation-log`, `/github-sync` | Yes (static) | none |
| `/threat-model`, `/privacy-fl-lab`, `/redaction-lab` | Yes (simulations, in-browser) | none (redaction adjudicator uses the LLM, optional) |
| `/settings` | Yes | none |
| MCP server (`/functions/v1/mcp`) | Yes | local Supabase |

---

## 2. LLM replacement — already wired, config-only

All 7 raw chat call-sites plus the AI-SDK provider now read a single indirection layer:
`supabase/functions/_shared/llm-endpoint.ts`.

```
LLM_BASE_URL = http://host.docker.internal:11434/v1     # Ollama
LLM_MODEL    = qwen2.5:14b-instruct
LLM_API_KEY  = ollama                                    # any non-empty string
```

Defaults (unset) = Lovable AI Gateway + `google/gemini-3-flash-preview`. **No code edit is
needed to switch.** Any OpenAI-compatible server works: Ollama, vLLM, llama.cpp
(`llama-server`), LM Studio, Text-Generation-WebUI, TGI.

Affected functions: `threat-extract`, `threat-extract-hyper`, `threat-conflicts`,
`threat-conflicts-mine`, `threat-kg-query`, `experiment-runner`, `ablation-runner`,
`redaction-adjudicate`, `threat-agent`.

**Model requirements for the CTI pipeline**
- Strict JSON / `response_format: {type:"json_object"}` support (or a model reliable at
  JSON-only output). Recommended: Qwen2.5-14B/32B-Instruct, Llama-3.1-70B-Instruct,
  Mistral-Small-3, DeepSeek-V3 local builds.
- ≥ 16k context (Graph-Native CoT prompts + RAG context are long).
- `temperature: 0` and a fixed `seed` to preserve determinism/replayability.
- No embedding model is needed — RAG here is deterministic lexical (Jaccard), by design.

**Expect a metrics shift.** Gold-56 F1 was measured on the frozen Gemini backbone. After
swapping the backbone, re-run *Experiments → KG-Bench* and record new numbers; the
zero-shot posture is unchanged (still prompt-only, no fine-tuning).

---

## 3. Local deployment — step by step

### 3.0 Prerequisites
Docker Desktop, Node 20+ (or Bun), Deno 1.45+, Supabase CLI, Git, ~20 GB disk,
GPU strongly recommended for a 14B+ model.

### 3.1 Get the code
```bash
# Option A — GitHub (recommended, keeps history)
git clone https://github.com/<your-org>/<your-repo>.git threatgraph
cd threatgraph

# Option B — Lovable: Code editor → Download codebase → unzip
```

### 3.2 Start a local backend (Supabase stack in Docker)
```bash
supabase init          # only if supabase/config.toml lacks local settings
supabase start         # Postgres + Auth + Storage + Edge runtime + Studio
supabase status        # note API URL (http://localhost:54321) and anon key
```

### 3.3 Apply schema
```bash
supabase db reset          # applies everything in supabase/migrations
# then, optionally, load your exported data:
psql "postgresql://postgres:postgres@localhost:54321/postgres" -f threatgraph_export.sql
```
Enable the vector extension if the reset complains: `create extension if not exists vector;`

### 3.4 Run a local LLM
```bash
# Ollama
ollama pull qwen2.5:14b-instruct
ollama serve                       # http://localhost:11434/v1

# or vLLM
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-14B-Instruct --port 8000   # http://localhost:8000/v1
```

### 3.5 Point the functions at it
`supabase/functions/.env` (loaded by `supabase functions serve --env-file`):
```
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_MODEL=qwen2.5:14b-instruct
LLM_API_KEY=local
SUPABASE_URL=http://host.docker.internal:54321
SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
```
> On Linux, replace `host.docker.internal` with `172.17.0.1` or run with
> `--network host`.

```bash
supabase functions serve --env-file supabase/functions/.env --no-verify-jwt
```

### 3.6 Frontend
`.env` in the project root:
```
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key from `supabase status`>
VITE_SUPABASE_PROJECT_ID=local
```
```bash
bun install      # or npm install
bun run dev      # http://localhost:8080
```

### 3.7 Smoke test (in this order)
1. `/data-ingestion` → paste a CTI paragraph → **Preprocess** (no LLM; must pass first).
2. `/kg-construction` → **Extract, Validate & Persist to KG** → confirm nodes/edges render.
3. `/kg-construction` → **Refresh KB** → **Bootstrap GraphRAG Corpus**.
4. `/attribution` → run attribution (exercises `threat-kg-query`).
5. `/experiments` → KG-Bench on Gold-56 → record the new backbone's F1.
6. `/experiments` → Rule Governance → replay (pure symbolic, must be identical to hosted).
7. `/experiments` → **Download All (ZIP)** → verify report bundle.

### 3.8 Corpora
- **Gold-56 + GoldAug-CTI**: already in the codebase, nothing to fetch.
- **N≥1,000**: either allow outbound HTTPS and run the ingest panel
  (`corpus-ingest-cisa-kev`, `-mitre-groups`, `-rss`), or restore the Cloud data export
  for a byte-identical, fully offline corpus.
- **DNRTI / CASIE**: obtain under their own licenses and load via the External
  Benchmarks panel (in-memory, not persisted).

### 3.9 Production-ish local hosting (optional)
```bash
bun run build       # static bundle in dist/
npx serve dist      # or nginx; SPA fallback to index.html is required
```

---

## 4. Things that do NOT migrate

| Item | Why | Local substitute |
|---|---|---|
| `LOVABLE_API_KEY` | Lovable-issued gateway credential | `LLM_API_KEY` for your local server |
| Supabase service-role key / DB password of the hosted project | Not exposed on Lovable Cloud | Local `supabase status` values |
| Hosted preview/published URLs | Platform-managed | `localhost:8080` |
| Lovable AI billing/credits | N/A offline | your own GPU cost |
| Auto-deploy of edge functions | Platform feature | `supabase functions serve` / `deploy` |

---

## 5. Reproducibility checklist for the thesis

- Record: model name + quantization + `temperature=0` + `seed`, commit SHA, corpus
  versions (Gold-56, GoldAug-CTI v1, N1K snapshot date).
- Re-run KG-Bench and the ablation runner on the local backbone; report both hosted and
  local numbers side by side.
- Symbolic layers (R1–R13, C1–C2, C4) are backbone-independent and must reproduce exactly;
  a divergence there indicates a migration defect, not model variance.
