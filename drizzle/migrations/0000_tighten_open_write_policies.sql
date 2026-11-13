DROP POLICY IF EXISTS "rule sets public insert" ON public.kg_rule_sets;
CREATE POLICY "rule sets validated insert" ON public.kg_rule_sets FOR INSERT TO anon, authenticated
WITH CHECK (length(version) BETWEEN 1 AND 64 AND length(kernel_version) BETWEEN 1 AND 64 AND jsonb_typeof(rules)='array' AND pg_column_size(rules) < 500000 AND (notes IS NULL OR length(notes) <= 4000));

DROP POLICY IF EXISTS "perf events open insert (research demo)" ON public.pipeline_perf_events;
CREATE POLICY "perf events validated insert" ON public.pipeline_perf_events FOR INSERT TO anon, authenticated
WITH CHECK (length(pathway) BETWEEN 1 AND 32 AND length(stage) BETWEEN 1 AND 64 AND wall_ms >= 0 AND wall_ms < 3600000 AND coalesce(input_tokens,0) >= 0 AND coalesce(output_tokens,0) >= 0 AND (metadata IS NULL OR pg_column_size(metadata) < 20000));

DROP POLICY IF EXISTS "kg_pathway_runs_public_insert" ON public.kg_pathway_runs;
CREATE POLICY "kg_pathway_runs_validated_insert" ON public.kg_pathway_runs FOR INSERT TO anon, authenticated
WITH CHECK (pathway IN ('A','B','C') AND length(source_label) BETWEEN 1 AND 500 AND triples_count >= 0 AND hyperedges_count >= 0 AND conflicts_count >= 0 AND (notes IS NULL OR length(notes) <= 4000) AND pg_column_size(bench_scores) < 50000);

DROP POLICY IF EXISTS "rule replays public insert" ON public.kg_rule_replays;
CREATE POLICY "rule replays validated insert" ON public.kg_rule_replays FOR INSERT TO anon, authenticated
WITH CHECK (length(source_label) BETWEEN 1 AND 500 AND length(replay_rule_set_version) BETWEEN 1 AND 64 AND original_violation_count >= 0 AND replay_violation_count >= 0 AND pg_column_size(diff) < 200000);

DROP POLICY IF EXISTS "kg_hyperedges_public_insert" ON public.kg_hyperedges;
CREATE POLICY "kg_hyperedges_validated_insert" ON public.kg_hyperedges FOR INSERT TO anon, authenticated
WITH CHECK (length(hyperedge_id) BETWEEN 1 AND 200 AND length(relation_type) BETWEEN 1 AND 100 AND cardinality(node_ids) BETWEEN 2 AND 50 AND confidence >= 0 AND confidence <= 1 AND (source_passage IS NULL OR length(source_passage) <= 10000) AND (evidence IS NULL OR length(evidence) <= 10000));

DROP POLICY IF EXISTS "rule candidates auth update" ON public.kg_conflict_rule_candidates;
CREATE POLICY "rule candidates review update" ON public.kg_conflict_rule_candidates FOR UPDATE TO authenticated
USING (status IN ('proposed','accepted','rejected'))
WITH CHECK (status IN ('proposed','accepted','rejected') AND (reviewer_note IS NULL OR length(reviewer_note) <= 2000));