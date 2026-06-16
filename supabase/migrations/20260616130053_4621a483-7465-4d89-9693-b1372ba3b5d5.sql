
-- PH4: Hypergraph Pathway C persistence
CREATE TABLE public.kg_hyperedges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hyperedge_id TEXT NOT NULL,
  report_id UUID REFERENCES public.threat_reports(id) ON DELETE CASCADE,
  pathway TEXT NOT NULL DEFAULT 'C' CHECK (pathway IN ('B','C')),
  relation_type TEXT NOT NULL,
  node_ids TEXT[] NOT NULL,
  roles JSONB NOT NULL DEFAULT '{}'::jsonb,
  qualifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_passage TEXT,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  inferred_participants TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence TEXT,
  domain TEXT NOT NULL DEFAULT 'cti' CHECK (domain = 'cti'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, hyperedge_id)
);
CREATE INDEX kg_hyperedges_report_idx ON public.kg_hyperedges(report_id);
CREATE INDEX kg_hyperedges_pathway_idx ON public.kg_hyperedges(pathway);
CREATE INDEX kg_hyperedges_relation_idx ON public.kg_hyperedges(relation_type);

GRANT SELECT ON public.kg_hyperedges TO anon, authenticated;
GRANT ALL ON public.kg_hyperedges TO service_role;
ALTER TABLE public.kg_hyperedges ENABLE ROW LEVEL SECURITY;
CREATE POLICY kg_hyperedges_public_read ON public.kg_hyperedges FOR SELECT USING (true);

CREATE TABLE public.kg_pathway_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID REFERENCES public.threat_reports(id) ON DELETE CASCADE,
  source_label TEXT NOT NULL,
  pathway TEXT NOT NULL CHECK (pathway IN ('B','C')),
  triples_count INTEGER NOT NULL DEFAULT 0,
  hyperedges_count INTEGER NOT NULL DEFAULT 0,
  conflicts_count INTEGER NOT NULL DEFAULT 0,
  credibility_score NUMERIC(4,3),
  latency_ms INTEGER,
  bench_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX kg_pathway_runs_label_idx ON public.kg_pathway_runs(source_label);
CREATE INDEX kg_pathway_runs_pathway_idx ON public.kg_pathway_runs(pathway);

GRANT SELECT ON public.kg_pathway_runs TO anon, authenticated;
GRANT ALL ON public.kg_pathway_runs TO service_role;
ALTER TABLE public.kg_pathway_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY kg_pathway_runs_public_read ON public.kg_pathway_runs FOR SELECT USING (true);
