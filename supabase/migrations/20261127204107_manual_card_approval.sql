-- Carry card details through authorization to the canonical payment command.
ALTER TABLE private.financial_approvals
  ADD COLUMN card_settled_on date,
  ADD COLUMN card_details_captured boolean NOT NULL DEFAULT false;

DO $manual_card$
DECLARE
  source text;
  updated text;
BEGIN
  source := pg_get_functiondef(
    'private.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text)'::regprocedure
  );
  updated := replace(source,'p_idempotency_key text)','p_idempotency_key text, p_card_details jsonb)');
  updated := replace(updated,'  v_request public.requests;',
    '  v_request public.requests;
  v_card_fee bigint := 0;
  v_card_settled_on date;');
  updated := replace(updated,$digest$btrim(p_justification))::text,'sha256')$digest$,
    $digest$btrim(p_justification)) ||
    CASE WHEN p_card_details IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_card_details) END)::text,'sha256')$digest$);
  -- The old command digest is identical for calls without card details.
  updated := replace(updated,$old$extensions.digest(jsonb_build_array('manual_payment'$old$,
    $new$extensions.digest((jsonb_build_array('manual_payment'$new$);
  updated := replace(updated,'  dest_account := coalesce(p_destination_account_id, pm.destination_account_id);',
    $validation$  IF p_card_details IS NOT NULL THEN
    IF pm.type<>'card' OR jsonb_typeof(p_card_details) IS DISTINCT FROM 'object' OR NOT p_card_details ?& ARRAY['fee_cents','settled_on'] THEN
      RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE='PT422';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_card_details))<>2
       OR jsonb_typeof(p_card_details->'fee_cents') IS DISTINCT FROM 'number'
       OR (p_card_details->>'fee_cents')::numeric NOT BETWEEN 0 AND p_amount_cents
       OR (p_card_details->>'fee_cents')::numeric<>trunc((p_card_details->>'fee_cents')::numeric) THEN
      RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE='PT422';
    END IF;
    v_card_fee := (p_card_details->>'fee_cents')::numeric::bigint;
    BEGIN
      v_card_settled_on := private.payment_date(p_card_details->'settled_on',true);
    EXCEPTION WHEN SQLSTATE 'PT422' THEN
      RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE='PT422';
    END;
  END IF;
  dest_account := coalesce(p_destination_account_id, pm.destination_account_id);$validation$);
  updated := replace(updated,'final_cents, card_fee_cents, payment_method_id',
    'final_cents, card_fee_cents, card_settled_on, card_details_captured, payment_method_id');
  updated := replace(updated,'amounts.balance_cents - p_amount_cents, 0, p_payment_method_id',
    'amounts.balance_cents - p_amount_cents, v_card_fee, v_card_settled_on, p_card_details IS NOT NULL, p_payment_method_id');
  IF strpos(updated,'p_card_details jsonb')=0 OR strpos(updated,'v_card_fee, v_card_settled_on, p_card_details IS NOT NULL, p_payment_method_id')=0 THEN
    RAISE EXCEPTION 'Manual payment authorization contract has drifted';
  END IF;
  EXECUTE updated;

  source := pg_get_functiondef('private.financial_approval_execute_manual_payment(uuid,uuid,uuid,integer,text)'::regprocedure);
  updated := replace(source,$old$'fee_cents', 0,
      'settlement', CASE WHEN pm.type = 'card' THEN 'pending' ELSE 'not_applicable' END,
      'settled_on', NULL,$old$,$new$'fee_cents', CASE WHEN pm.type='card' THEN a.card_fee_cents ELSE 0 END,
      'settlement', CASE WHEN pm.type<>'card' THEN 'not_applicable' WHEN a.card_settled_on IS NULL THEN 'pending' ELSE 'settled' END,
      'settled_on', CASE WHEN pm.type='card' THEN to_char(a.card_settled_on,'YYYY-MM-DD') END,$new$);
  updated := replace(updated,'pm.destination_account_id IS DISTINCT FROM a.destination_account_id THEN',
    'pm.destination_account_id IS DISTINCT FROM a.destination_account_id
    OR (a.card_details_captured AND pm.type<>''card'') THEN');
  IF updated=source THEN RAISE EXCEPTION 'Manual payment execution contract has drifted'; END IF;
  EXECUTE updated;

  source := pg_get_functiondef('private.financial_approval_json(private.financial_approvals,uuid)'::regprocedure);
  updated := replace(source,$old$'card_fee_cents', a.card_fee_cents,$old$,
    $new$'card_fee_cents', a.card_fee_cents,
    'card_details', CASE WHEN a.card_details_captured THEN jsonb_build_object(
      'fee_cents',a.card_fee_cents,'settled_on',to_char(a.card_settled_on,'YYYY-MM-DD')
    ) END,$new$);
  IF updated=source THEN RAISE EXCEPTION 'Approval card summary contract has drifted'; END IF;
  EXECUTE updated;
END $manual_card$;

CREATE OR REPLACE FUNCTION private.financial_approval_request_manual_payment(
  p_office_id uuid, p_charge_id uuid, p_charge_version integer, p_request_id uuid,
  p_session_id uuid, p_unit_id uuid, p_destination_account_id uuid, p_payment_method_id uuid,
  p_approver_user_id uuid, p_amount_cents bigint, p_operation_date date,
  p_external_reference text, p_justification text, p_idempotency_key text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.financial_approval_request_manual_payment(
    p_office_id,p_charge_id,p_charge_version,p_request_id,p_session_id,p_unit_id,p_destination_account_id,
    p_payment_method_id,p_approver_user_id,p_amount_cents,p_operation_date,p_external_reference,
    p_justification,p_idempotency_key,NULL::jsonb
  );
$$;

CREATE FUNCTION public.financial_approval_request_manual_payment(
  p_office_id uuid, p_charge_id uuid, p_charge_version integer, p_request_id uuid,
  p_session_id uuid, p_unit_id uuid, p_destination_account_id uuid, p_payment_method_id uuid,
  p_approver_user_id uuid, p_amount_cents bigint, p_operation_date date,
  p_external_reference text, p_justification text, p_idempotency_key text, p_card_details jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.financial_approval_request_manual_payment(
    p_office_id,p_charge_id,p_charge_version,p_request_id,p_session_id,p_unit_id,p_destination_account_id,
    p_payment_method_id,p_approver_user_id,p_amount_cents,p_operation_date,p_external_reference,
    p_justification,p_idempotency_key,p_card_details
  );
$$;

REVOKE ALL ON FUNCTION
  private.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text,jsonb),
  public.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  private.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text,jsonb),
  public.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text,jsonb)
TO authenticated;
