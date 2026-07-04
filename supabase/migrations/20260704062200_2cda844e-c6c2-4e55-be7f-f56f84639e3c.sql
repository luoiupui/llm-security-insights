
-- Perf events (append-only side channel for pipeline stage latency/tokens)
CREATE TABLE public.pipeline_perf_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID,
  pathway TEXT NOT NULL CHECK (pathway IN ('pipeline','agent_loop','rule_based','llm_zeroshot')),
  stage TEXT NOT NULL,
  wall_ms NUMERIC NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  input_chars INTEGER,
  sample_id TEXT,
  domain TEXT DEFAULT 'cti',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pipeline_perf_events TO authenticated;
GRANT SELECT, INSERT ON public.pipeline_perf_events TO anon;
GRANT ALL ON public.pipeline_perf_events TO service_role;
ALTER TABLE public.pipeline_perf_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "perf events public read" ON public.pipeline_perf_events FOR SELECT USING (true);
CREATE POLICY "perf events open insert (research demo)" ON public.pipeline_perf_events FOR INSERT WITH CHECK (true);
CREATE INDEX pipeline_perf_events_run_idx ON public.pipeline_perf_events (run_id, stage);
CREATE INDEX pipeline_perf_events_created_idx ON public.pipeline_perf_events (created_at DESC);

-- Mined / candidate conflict rules (LLM-proposed, human-reviewed)
CREATE TABLE public.kg_conflict_rule_candidates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_key TEXT NOT NULL UNIQUE,
  taxonomy TEXT NOT NULL CHECK (taxonomy IN ('temporal','causal','ontological','provenance','cross_modal','kill_chain','other')),
  when_pattern JSONB NOT NULL,
  then_violation JSONB NOT NULL,
  rationale TEXT NOT NULL,
  llm_confidence NUMERIC CHECK (llm_confidence BETWEEN 0 AND 1),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','rejected','superseded')),
  evidence_run_ids UUID[] DEFAULT '{}',
  reviewer_note TEXT,
  domain TEXT DEFAULT 'cti',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kg_conflict_rule_candidates TO anon;
GRANT SELECT, INSERT, UPDATE ON public.kg_conflict_rule_candidates TO authenticated;
GRANT ALL ON public.kg_conflict_rule_candidates TO service_role;
ALTER TABLE public.kg_conflict_rule_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rule candidates public read" ON public.kg_conflict_rule_candidates FOR SELECT USING (true);
CREATE POLICY "rule candidates auth insert" ON public.kg_conflict_rule_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "rule candidates auth update" ON public.kg_conflict_rule_candidates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
