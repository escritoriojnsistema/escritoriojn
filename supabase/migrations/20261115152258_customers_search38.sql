-- Stage38: ten distinct sessions over10k customers exposed per-row authority
-- evaluation and eager JSON construction before pagination (API503 at ~8s).
-- Keep actor/office/membership locks, private INVOKER wrapper/ACL, registration
-- inclusion, closed-account exclusion, masking, ordering and page contract.
CREATE OR REPLACE FUNCTION private.customers_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; all_records boolean; result jsonb; query_text text; query_digits text;
BEGIN
 caller:=private.customers_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN (3,5) THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 -- customers_actor holds the office and current membership FOR SHARE: management
 -- writes cannot commit during this operation. Clock-based expiry is checked
 -- again below before returning. Never persist/cache this value across calls.
 all_records:=private.current_permissions(p_office_id) @> ARRAY['customers.read_all'];
 query_text:=btrim(p_query);
 IF query_text ~ '^[0-9 ./-]+$' THEN query_digits:=nullif(regexp_replace(query_text,'[^0-9]','','g'),''); END IF;
 WITH candidates AS (
  SELECT c.id,c.name,c.identifier,c.created_at,c AS customer,NULL::private.customer_registrations AS registration,false AS from_registration
  FROM public.customers c
  WHERE c.office_id=p_office_id AND c.merged_into_id IS NULL AND c.blocked_at IS NULL
   AND NOT EXISTS(SELECT FROM private.closed_account_offices ca WHERE ca.office_id=c.office_id AND ca.customer_id=c.id)
   AND CASE WHEN all_records THEN true
    -- Coarse prefilter only; the canonical scope function still decides each
    -- non-read_all candidate, including revocation, dates and active membership.
    WHEN c.created_by=caller OR c.id IN(
     SELECT cr.customer_id FROM private.customer_relations cr JOIN public.memberships m ON m.office_id=cr.office_id AND m.id=cr.membership_id
     WHERE cr.office_id=p_office_id AND cr.relation_type='assignment' AND m.user_id=caller
    ) THEN private.customer_in_scope(c,caller) ELSE false END
  UNION ALL
  SELECT r.id,r.name,NULL::text,r.created_at,NULL::public.customers,r,true
  FROM private.customer_registrations r
  WHERE r.office_id=p_office_id AND all_records AND r.materialized_customer_id IS NULL AND private.customer_registration_active(r) AND NOT private.customer_intake_resolved(r)
 ), filtered AS (
  SELECT * FROM candidates WHERE query_text='' OR strpos(lower(name),lower(query_text))>0
   OR (query_digits IS NOT NULL AND strpos(identifier,query_digits)>0)
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'page',p_page,'page_size',p_size,
  'items',coalesce((SELECT jsonb_agg(CASE WHEN page.from_registration THEN private.customer_registration_summary(page.registration) ELSE private.customers_summary(page.customer) END ORDER BY page.created_at DESC,page.id DESC)
   FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size) page),'[]'::jsonb)) INTO result;
 -- SHARE locks do not freeze session inactivity or delegation deadlines. Fail
 -- closed if the authority that admitted this page expired during evaluation.
 PERFORM private.customers_actor(p_office_id);
 IF all_records AND NOT (private.current_permissions(p_office_id) @> ARRAY['customers.read_all']) THEN
  RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
