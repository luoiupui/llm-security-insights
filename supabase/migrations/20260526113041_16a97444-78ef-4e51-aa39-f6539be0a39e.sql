
CREATE OR REPLACE FUNCTION public.match_threat_reports(query_embedding extensions.vector, match_count integer DEFAULT 5, similarity_threshold double precision DEFAULT 0.5)
 RETURNS TABLE(id uuid, source_text text, summary text, similarity double precision, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY INVOKER
 SET search_path TO 'public', 'extensions'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.fetch_subgraph(entity_names text[], max_hops integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE EXECUTE ON FUNCTION public.match_threat_reports(extensions.vector, integer, double precision) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fetch_subgraph(text[], integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.match_threat_reports(extensions.vector, integer, double precision) TO service_role;
GRANT EXECUTE ON FUNCTION public.fetch_subgraph(text[], integer) TO service_role;
