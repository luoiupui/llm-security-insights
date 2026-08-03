CREATE TABLE public.kg_rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  kernel_version text NOT NULL,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kg_rule_sets TO anon;
GRANT SELECT, INSERT ON public.kg_rule_sets TO authenticated;
GRANT ALL ON public.kg_rule_sets TO service_role;
ALTER TABLE public.kg_rule_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rule sets public read" ON public.kg_rule_sets FOR SELECT USING (true);
CREATE POLICY "rule sets public insert" ON public.kg_rule_sets FOR INSERT WITH CHECK (true);

CREATE TABLE public.kg_rule_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label text NOT NULL,
  report_id uuid REFERENCES public.threat_reports(id) ON DELETE SET NULL,
  original_rule_set_version text,
  replay_rule_set_version text NOT NULL,
  original_violation_count integer NOT NULL DEFAULT 0,
  replay_violation_count integer NOT NULL DEFAULT 0,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kg_rule_replays TO anon;
GRANT SELECT, INSERT ON public.kg_rule_replays TO authenticated;
GRANT ALL ON public.kg_rule_replays TO service_role;
ALTER TABLE public.kg_rule_replays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rule replays public read" ON public.kg_rule_replays FOR SELECT USING (true);
CREATE POLICY "rule replays public insert" ON public.kg_rule_replays FOR INSERT WITH CHECK (true);