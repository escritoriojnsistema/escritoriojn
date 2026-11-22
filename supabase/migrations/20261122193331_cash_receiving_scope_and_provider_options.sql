-- The holder of a request and the operator receiving a payment can differ.
-- Additional scope applies only through financial entry points.
CREATE FUNCTION private.cash_can_receive_charge(r public.requests,m public.memberships)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(
    r.office_id=m.office_id AND m.active AND m.role_code<>'client' AND (
      private.document_cash_can_work(r,m) IS TRUE OR (
        m.role_code IN ('owner','admin')
        AND private.current_permissions(r.office_id) @>
          ARRAY['foundation.access','cash.read','cash.open','charges.read','requests.read']
        AND (m.role_code='owner' OR private.current_permissions(r.office_id) @> ARRAY['requests.read_all'])
        AND private.request_execution_allowed(r,m) IS TRUE
        AND NOT EXISTS (
          SELECT FROM private.category_intakes i
          WHERE i.office_id=r.office_id AND i.request_id=r.id AND i.submitted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT FROM private.service_intakes33 i
          WHERE i.office_id=r.office_id AND i.request_id=r.id AND i.submitted_at IS NULL
        )
      )
    ),false
  );
$$;

REVOKE ALL ON FUNCTION private.cash_can_receive_charge(public.requests,public.memberships)
FROM PUBLIC,anon,authenticated,service_role;

-- Reuse the canonical SQL for treasury and ledger. All original locks, retry
-- semantics, method/account checks, inserts and audit events remain in place.
DO $receiving$
DECLARE
  signature regprocedure;
  source text;
  updated text;
  old_scope constant text := 'private.document_cash_can_work(r,m)';
  new_scope constant text := 'private.cash_can_receive_charge(r,m)';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.cash_eligible_charges(uuid,text,integer)'::regprocedure,
    'private.payment_operate_authorized(uuid,jsonb)'::regprocedure,
    'private.cash_operate_before15(uuid,jsonb)'::regprocedure
  ] LOOP
    source := pg_get_functiondef(signature);
    updated := replace(source,old_scope,CASE
      WHEN signature='private.cash_operate_before15(uuid,jsonb)'::regprocedure THEN
        '(CASE WHEN k=''receive'' THEN '||new_scope||' ELSE '||old_scope||' END)'
      ELSE new_scope
    END);
    IF updated=source THEN RAISE EXCEPTION 'Cash scope definition has drifted: %', signature; END IF;
    EXECUTE updated;
  END LOOP;

  signature := 'private.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text)'::regprocedure;
  source := pg_get_functiondef(signature);
  updated := replace(source,'private.document_cash_in_scope(v_request, m)','private.cash_can_receive_charge(v_request,m)');
  IF updated=source THEN RAISE EXCEPTION 'Approval request scope definition has drifted'; END IF;
  EXECUTE updated;
END $receiving$;

-- Finance settings expose only active units and eligible destination accounts.
-- The predicate is also used when accepting a provider's selected destination.
CREATE FUNCTION private.payment_provider_receiving_options(p_office_id uuid,p_unit_id uuid,p_page integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  options jsonb;
  page_size constant integer := 50;
BEGIN
  PERFORM private.payment_providers_actor(p_office_id);
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE='PT422';
  END IF;

  WITH units AS (
    SELECT id,name FROM private.cash_units WHERE office_id=p_office_id AND active
  ), accounts AS (
    SELECT a.id,a.unit_id,a.name,a.type FROM private.financial_accounts a
    JOIN units u ON u.id=a.unit_id
    WHERE a.office_id=p_office_id AND a.active AND a.type IN ('bank','digital')
      AND (p_unit_id IS NULL OR a.unit_id=p_unit_id)
  ), unit_page AS (
    SELECT * FROM units ORDER BY name,id LIMIT page_size OFFSET (p_page-1)*page_size
  ), account_page AS (
    SELECT * FROM accounts ORDER BY name,id LIMIT page_size OFFSET (p_page-1)*page_size
  )
  SELECT jsonb_build_object(
    'units',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.name,u.id) FROM unit_page u),'[]'),
    'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.name,a.id) FROM account_page a),'[]'),
    'units_total',(SELECT count(*) FROM units),
    'accounts_total',(SELECT count(*) FROM accounts),
    'unit_id',p_unit_id,'page',p_page,'page_size',page_size
  ) INTO options;
  RETURN options;
END $$;

CREATE FUNCTION public.payment_provider_receiving_options(p_office_id uuid,p_unit_id uuid,p_page integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_provider_receiving_options(p_office_id,p_unit_id,p_page);
$$;

REVOKE ALL ON FUNCTION
  private.payment_provider_receiving_options(uuid,uuid,integer),
  public.payment_provider_receiving_options(uuid,uuid,integer)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  private.payment_provider_receiving_options(uuid,uuid,integer),
  public.payment_provider_receiving_options(uuid,uuid,integer)
TO authenticated;

DO $destination$
DECLARE
  source text := pg_get_functiondef(
    'private.payment_provider_save(uuid,uuid,text,text,text,text[],uuid,uuid,text,text)'::regprocedure
  );
  updated text;
BEGIN
  updated := replace(source,
    '  IF p_receiving_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.financial_accounts
    WHERE office_id = p_office_id AND id = p_receiving_account_id AND active
      AND (p_financial_unit_id IS NULL OR unit_id = p_financial_unit_id)
  ) THEN
    RAISE EXCEPTION ''PROVIDER_VALIDATION'' USING ERRCODE = ''PT422'';
  END IF;',
    '  IF p_receiving_account_id IS NOT NULL THEN
    SELECT a.unit_id INTO p_financial_unit_id
    FROM private.financial_accounts a
    JOIN private.cash_units u ON u.office_id=a.office_id AND u.id=a.unit_id
    WHERE a.office_id=p_office_id AND a.id=p_receiving_account_id AND a.active
      AND a.type IN (''bank'',''digital'') AND u.active
      AND (p_financial_unit_id IS NULL OR a.unit_id=p_financial_unit_id)
    FOR SHARE OF a,u;
    IF NOT FOUND THEN
      RAISE EXCEPTION ''PROVIDER_VALIDATION'' USING ERRCODE = ''PT422'';
    END IF;
  END IF;');
  IF updated=source THEN RAISE EXCEPTION 'Provider destination definition has drifted'; END IF;
  EXECUTE updated;
END $destination$;

NOTIFY pgrst,'reload schema';
