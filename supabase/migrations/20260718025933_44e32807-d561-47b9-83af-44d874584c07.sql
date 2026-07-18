
create table public.bench_cases (
  id uuid primary key default gen_random_uuid(),
  source_feed text not null,
  source_url  text not null,
  publisher   text not null,
  license     text not null,
  retrieved_at timestamptz not null default now(),
  language    text not null default 'en',
  stratum     text not null,
  raw_text    text not null,
  title       text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  unique (source_feed, source_url)
);

grant select on public.bench_cases to anon, authenticated;
grant all on public.bench_cases to service_role;
alter table public.bench_cases enable row level security;

create policy "bench_cases public read" on public.bench_cases
  for select using (true);
create policy "bench_cases service write" on public.bench_cases
  for all to service_role using (true) with check (true);

create index bench_cases_stratum_idx on public.bench_cases(stratum);
create index bench_cases_feed_idx on public.bench_cases(source_feed);

create table public.bench_runs (
  id uuid primary key default gen_random_uuid(),
  run_batch uuid not null,
  case_id   uuid not null references public.bench_cases(id) on delete cascade,
  pathway   text not null check (pathway in ('B','C')),
  status    text not null default 'queued' check (status in ('queued','running','done','error')),
  started_at timestamptz,
  finished_at timestamptz,
  metrics   jsonb,
  error     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select on public.bench_runs to anon, authenticated;
grant all on public.bench_runs to service_role;
alter table public.bench_runs enable row level security;

create policy "bench_runs public read" on public.bench_runs
  for select using (true);
create policy "bench_runs service write" on public.bench_runs
  for all to service_role using (true) with check (true);

create index bench_runs_batch_idx on public.bench_runs(run_batch);
create index bench_runs_status_idx on public.bench_runs(status);
create index bench_runs_case_idx on public.bench_runs(case_id);
