-- ════════════════════════════════════════════════════════════════════
-- Phase 3 — CorroboratedFinding ontology + source_modality tag
-- Spec: public/reports/ontology-corroborated-finding-spec.md
-- ════════════════════════════════════════════════════════════════════

-- 1) Universal source_modality tag on existing nodes (§3 of the spec)
ALTER TABLE public.kg_entities
  ADD COLUMN IF NOT EXISTS source_modality text NOT NULL DEFAULT 'external_cti';

COMMENT ON COLUMN public.kg_entities.source_modality IS
  'One of: external_cti | internal_telemetry | fused. Backfilled to external_cti for legacy rows.';

-- 2) New table: kg_corroborated_findings
CREATE TABLE IF NOT EXISTS public.kg_corroborated_findings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- ttp_ref points at kg_entities.id when available. We keep it nullable +
  -- store the resolved canonical name so corroborations can be created before
  -- the TTP node exists (the fusion job may run ahead of full extraction).
  ttp_ref uuid REFERENCES public.kg_entities(id) ON DELETE SET NULL,
  ttp_name text NOT NULL,
  -- flow_ref is an opaque identifier from the internal flow store. The flow
  -- store itself is not yet a Postgres table, so we keep it as text rather
  -- than fabricate a foreign key. See cti-flow-feature-ingest-spec.md.
  flow_ref text NOT NULL,
  conf_narrative numeric NOT NULL,
  conf_behavioral numeric NOT NULL,
  fusion_method text NOT NULL DEFAULT 'noisy_or',
  evidence_window_start timestamptz,
  evidence_window_end timestamptz,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  report_id uuid REFERENCES public.threat_reports(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.kg_corroborated_findings IS
  'Per spec public/reports/ontology-corroborated-finding-spec.md: stores conf_narrative and conf_behavioral as independent fields. Never persist a collapsed fused_conf — recompute at read time via the declared fusion_method.';

-- 3) GRANTs — match the public-read / service-write pattern used by sibling
--    knowledge-graph tables (kg_entities, kg_relations, kg_causal_links).
GRANT SELECT ON public.kg_corroborated_findings TO anon, authenticated;
GRANT ALL ON public.kg_corroborated_findings TO service_role;

-- 4) RLS
ALTER TABLE public.kg_corroborated_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kg_corroborated_findings_public_read"
  ON public.kg_corroborated_findings
  FOR SELECT
  TO public
  USING (true);

-- 5) Validation trigger (per project rule: triggers, not CHECK, for evolving rules)
CREATE OR REPLACE FUNCTION public.validate_corroborated_finding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.fusion_method NOT IN ('noisy_or', 'dempster_shafer', 'min', 'weighted') THEN
    RAISE EXCEPTION 'invalid fusion_method: %', NEW.fusion_method;
  END IF;
  IF NEW.conf_narrative < 0 OR NEW.conf_narrative > 1 THEN
    RAISE EXCEPTION 'conf_narrative out of range [0,1]: %', NEW.conf_narrative;
  END IF;
  IF NEW.conf_behavioral < 0 OR NEW.conf_behavioral > 1 THEN
    RAISE EXCEPTION 'conf_behavioral out of range [0,1]: %', NEW.conf_behavioral;
  END IF;
  IF NEW.evidence_window_start IS NOT NULL
     AND NEW.evidence_window_end IS NOT NULL
     AND NEW.evidence_window_start > NEW.evidence_window_end THEN
    RAISE EXCEPTION 'evidence_window_start must be <= evidence_window_end';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_corroborated_finding_trg
  ON public.kg_corroborated_findings;
CREATE TRIGGER validate_corroborated_finding_trg
  BEFORE INSERT OR UPDATE ON public.kg_corroborated_findings
  FOR EACH ROW EXECUTE FUNCTION public.validate_corroborated_finding();

-- 6) Helpful index for lookups by TTP name and report
CREATE INDEX IF NOT EXISTS kg_corroborated_findings_ttp_name_idx
  ON public.kg_corroborated_findings (ttp_name);
CREATE INDEX IF NOT EXISTS kg_corroborated_findings_report_id_idx
  ON public.kg_corroborated_findings (report_id);
CREATE INDEX IF NOT EXISTS kg_entities_source_modality_idx
  ON public.kg_entities (source_modality);