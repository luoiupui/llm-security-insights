-- Layer B/C foundations: pgvector, KB, persistent KG, event log

create extension if not exists vector;

-- ── Knowledge Base (Layer A grounding source) ──
create table public.kb_entries (
  id uuid primary key default gen_random_uuid(),
  kb_type text not null,                 -- 'mitre_technique' | 'mitre_tactic' | 'cve' | 'capec' | 'stix_type'
  external_id text not null,             -- e.g. 'T1566.001', 'CVE-2024-3400'
  name text not null,
  description text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (kb_type, external_id)
);
create index kb_entries_type_idx on public.kb_entries(kb_type);
create index kb_entries_external_id_idx on public.kb_entries(external_id);
alter table public.kb_entries enable row level security;
create policy "kb_entries_public_read" on public.kb_entries for select using (true);

-- ── Threat Reports Archive (Layer B: Vector RAG) ──
create table public.threat_reports (
  id uuid primary key default gen_random_uuid(),
  source_text text not null,
  source_type text default 'report',
  summary text,
  embedding vector(768),                 -- gemini text-embedding-004 dimension
  extraction_payload jsonb,              -- full extraction result snapshot
  created_at timestamptz not null default now()
);
create index threat_reports_embedding_idx on public.threat_reports
  using ivfflat (embedding vector_cosine_ops) with (lists = 50);
create index threat_reports_created_at_idx on public.threat_reports(created_at desc);
alter table public.threat_reports enable row level security;
create policy "threat_reports_public_read" on public.threat_reports for select using (true);

-- ── Persistent KG (Layer C: GraphRAG) ──
create table public.kg_entities (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.threat_reports(id) on delete cascade,
  name text not null,
  canonical_name text not null,          -- lowercased / normalised for matching
  entity_type text not null,
  stix_type text,
  mitre_id text,
  confidence numeric default 0,
  context text,
  created_at timestamptz not null default now()
);
create index kg_entities_canonical_idx on public.kg_entities(canonical_name);
create index kg_entities_report_idx on public.kg_entities(report_id);
create index kg_entities_type_idx on public.kg_entities(entity_type);
alter table public.kg_entities enable row level security;
create policy "kg_entities_public_read" on public.kg_entities for select using (true);

create table public.kg_relations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.threat_reports(id) on delete cascade,
  source_name text not null,
  source_canonical text not null,
  target_name text not null,
  target_canonical text not null,
  relation text not null,
  edge_type text default 'relational',   -- relational | temporal | causal | inferred
  confidence numeric default 0,
  evidence text,
  created_at timestamptz not null default now()
);
create index kg_relations_source_idx on public.kg_relations(source_canonical);
create index kg_relations_target_idx on public.kg_relations(target_canonical);
create index kg_relations_report_idx on public.kg_relations(report_id);
alter table public.kg_relations enable row level security;
create policy "kg_relations_public_read" on public.kg_relations for select using (true);

create table public.kg_causal_links (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.threat_reports(id) on delete cascade,
  cause text not null,
  effect text not null,
  causal_type text not null,             -- enables | leads_to | triggers | precedes
  temporal_order int default 0,
  confidence numeric default 0,
  mitre_tactic text,
  evidence text,
  created_at timestamptz not null default now()
);
create index kg_causal_links_report_idx on public.kg_causal_links(report_id);
alter table public.kg_causal_links enable row level security;
create policy "kg_causal_links_public_read" on public.kg_causal_links for select using (true);

-- ── Monitoring Event Log ──
create table public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,              -- 'kb_validation' | 'rag_retrieval' | 'graphrag_retrieval' | 'baseline_run' | 'pipeline_run' | 'kg_persisted'
  category text not null default 'pipeline',
  title text not null,
  detail text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index monitoring_events_created_at_idx on public.monitoring_events(created_at desc);
create index monitoring_events_type_idx on public.monitoring_events(event_type);
alter table public.monitoring_events enable row level security;
create policy "monitoring_events_public_read" on public.monitoring_events for select using (true);

-- ── Helper: vector similarity search over prior reports ──
create or replace function public.match_threat_reports(
  query_embedding vector(768),
  match_count int default 5,
  similarity_threshold float default 0.5
)
returns table (
  id uuid,
  source_text text,
  summary text,
  similarity float,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.source_text,
    r.summary,
    1 - (r.embedding <=> query_embedding) as similarity,
    r.created_at
  from public.threat_reports r
  where r.embedding is not null
    and 1 - (r.embedding <=> query_embedding) > similarity_threshold
  order by r.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Helper: subgraph retrieval around a set of canonical entity names ──
create or replace function public.fetch_subgraph(
  entity_names text[],
  max_hops int default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'entities', coalesce(jsonb_agg(distinct to_jsonb(e.*)) filter (where e.id is not null), '[]'::jsonb),
    'relations', coalesce(jsonb_agg(distinct to_jsonb(r.*)) filter (where r.id is not null), '[]'::jsonb)
  )
  into result
  from public.kg_entities e
  full outer join public.kg_relations r
    on r.source_canonical = e.canonical_name
    or r.target_canonical = e.canonical_name
  where e.canonical_name = any(entity_names)
     or r.source_canonical = any(entity_names)
     or r.target_canonical = any(entity_names);
  return coalesce(result, jsonb_build_object('entities','[]'::jsonb,'relations','[]'::jsonb));
end;
$$;