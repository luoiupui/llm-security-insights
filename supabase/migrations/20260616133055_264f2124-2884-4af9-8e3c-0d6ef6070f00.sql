GRANT INSERT ON public.kg_pathway_runs TO anon, authenticated;
GRANT INSERT ON public.kg_hyperedges  TO anon, authenticated;
CREATE POLICY kg_pathway_runs_public_insert ON public.kg_pathway_runs FOR INSERT WITH CHECK (true);
CREATE POLICY kg_hyperedges_public_insert  ON public.kg_hyperedges  FOR INSERT WITH CHECK (true);