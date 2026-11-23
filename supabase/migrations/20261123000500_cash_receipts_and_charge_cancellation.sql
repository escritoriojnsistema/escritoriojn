INSERT INTO public.permissions(code,name)
VALUES ('payments.cash.receive','Registrar recebimentos em dinheiro');
INSERT INTO public.role_permissions(role_code,permission_code)
VALUES ('owner','payments.cash.receive');

DO $permissions$
DECLARE target record; updated text;
BEGIN
  FOR target IN
    SELECT conrelid::regclass AS relation,conname,pg_get_constraintdef(oid) AS source
    FROM pg_constraint WHERE connamespace='private'::regnamespace AND conname IN (
      'team_member_permissions_permission_code_check','team_delegations_allowed_permissions_check',
      'team_invitations_permissions_check'
    )
  LOOP
    updated := replace(target.source,'''payments.manual.approve''','''payments.cash.receive'',''payments.manual.approve''');
    IF updated=target.source THEN RAISE EXCEPTION 'Cash permission constraint has drifted: %',target.conname; END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      target.relation,target.conname,target.conname,updated);
  END LOOP;
  FOR target IN
    SELECT pg_get_functiondef(oid) AS source,proname FROM pg_proc
    WHERE pronamespace='private'::regnamespace AND proname IN (
      'team_scope_for_member','team_validate_assignment','safe_audit_changes_before_request_delete'
    )
  LOOP
    updated := replace(target.source,'''payments.manual.approve''','''payments.cash.receive'',''payments.manual.approve''');
    IF updated=target.source THEN RAISE EXCEPTION 'Cash permission routine has drifted: %',target.proname; END IF;
    EXECUTE updated;
  END LOOP;
END $permissions$;

-- cash_actor takes the office write lock, also used by permission and payment
-- method changes. The canonical command still validates session, method and funds.
CREATE OR REPLACE FUNCTION private.payment_operate(p_office_id uuid,p_operation jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid;
  payment_kind text;
  source_id uuid;
BEGIN
  IF p_operation->>'kind'='confirm' OR
     (p_operation->>'kind'='record' AND p_operation->>'status'='confirmed') THEN
    actor := private.cash_actor(p_office_id,true,'cash.open');
    IF private.financial_approval_member_can_approve(p_office_id,actor,'manual_payment') IS NOT TRUE THEN
      IF NOT private.current_permissions(p_office_id) @> ARRAY['payments.cash.receive'] THEN
        RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';
      END IF;
      BEGIN
        IF p_operation->>'kind'='record' THEN
          source_id := (p_operation->>'payment_method_id')::uuid;
          SELECT type INTO payment_kind FROM private.payment_methods
          WHERE office_id=p_office_id AND id=source_id;
        ELSE
          source_id := (p_operation->>'payment_id')::uuid;
          SELECT payment_type INTO payment_kind FROM private.payments
          WHERE office_id=p_office_id AND id=source_id AND actor_id=actor;
        END IF;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';
      END;
      IF payment_kind IS DISTINCT FROM 'cash' THEN
        RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';
      END IF;
    END IF;
  END IF;
  RETURN private.payment_operate_authorized(p_office_id,p_operation);
END $$;

CREATE FUNCTION private.charges_can_cancel_request(r public.requests,m public.memberships)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(r.office_id=m.office_id AND m.active AND m.role_code<>'client'
    AND private.current_permissions(r.office_id) @> ARRAY['charges.cancel']
    AND (private.document_cash_can_work(r,m) IS TRUE OR
      (m.role_code IN ('owner','admin')
       AND private.request_execution_allowed(r,m) IS TRUE
       AND private.request_in_scope(r,m) IS TRUE
       AND (m.role_code='owner' OR private.current_permissions(r.office_id) @> ARRAY['requests.read_all'])
       AND NOT EXISTS (SELECT 1 FROM private.category_intakes i WHERE i.office_id=r.office_id AND i.request_id=r.id AND i.submitted_at IS NULL)
       AND NOT EXISTS (SELECT 1 FROM private.service_intakes33 i WHERE i.office_id=r.office_id AND i.request_id=r.id AND i.submitted_at IS NULL))),false);
$$;
REVOKE ALL ON FUNCTION private.charges_can_cancel_request(public.requests,public.memberships)
FROM PUBLIC,anon,authenticated,service_role;

-- Cancellation uses its own capability. Keep the existing adjustment scope,
-- locks, idempotency and audit trail for the canonical command.
DO $cancellation$
DECLARE source text; updated text;
BEGIN
  source := pg_get_functiondef('private.charges_mutate_authorized(uuid,uuid,integer,jsonb,uuid)'::regprocedure);
  updated := replace(source,'IF private.document_cash_can_work(r,m) IS NOT TRUE THEN',
    'IF (CASE WHEN kind=''cancel'' THEN private.charges_can_cancel_request(r,m) ELSE private.document_cash_can_work(r,m) END) IS NOT TRUE THEN');
  IF updated=source THEN RAISE EXCEPTION 'Charge cancellation scope has drifted'; END IF;
  source := updated;
  updated := replace(source,'OR a.cancelled OR r.status=''cancelado''',
    'OR a.cancelled OR (kind=''adjust'' AND r.status=''cancelado'') OR (kind=''cancel'' AND a.allocated_cents<>0)');
  IF updated=source THEN RAISE EXCEPTION 'Charge cancellation guard has drifted'; END IF;
  EXECUTE updated;

  source := pg_get_functiondef('private.charges_view_record(public.requests,public.memberships,integer)'::regprocedure);
  updated := replace(source,'''can_cancel'',can_work AND r.status<>''cancelado'' AND NOT a.cancelled AND caps @> ARRAY[''charges.cancel'']',
    '''can_cancel'',NOT a.cancelled AND a.allocated_cents=0 AND private.charges_can_cancel_request(r,m)');
  IF updated=source THEN RAISE EXCEPTION 'Charge cancellation projection has drifted'; END IF;
  EXECUTE updated;
END $cancellation$;

-- The obligation and its audit remain linked to the request after cancellation.
-- Tell operators which operation is still possible without purging accounting data.
DO $deletion$
DECLARE source text; changed text;
BEGIN
  source := pg_get_functiondef('private.request_deletion_evaluate(uuid,uuid,boolean)'::regprocedure);
  changed := replace(source,'has_charges boolean := false;',
    'has_charges boolean := false; open_charge boolean; can_archive boolean := false;');
  IF changed=source THEN RAISE EXCEPTION 'Deletion charge declaration has drifted'; END IF;
  source := changed;
  changed := replace(source,'INTO has_charges;',
    'INTO has_charges;
  SELECT EXISTS (
    SELECT 1 FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id) a
    WHERE c.office_id=p_office_id AND c.request_id=p_request_id AND NOT a.cancelled
  ) INTO open_charge;

  IF actor_kind=''team'' AND m.role_code IN (''owner'',''admin'') AND caps @> ARRAY[''requests.archives.manage'']
     AND r.status IN (''concluido'',''cancelado'') AND private.request_in_scope(r,m) IS TRUE THEN
    can_archive := NOT private.request_is_archived(r,(private.request_archive_policy_record(p_office_id)->>''cutoff'')::timestamptz);
  END IF;');
  IF changed=source THEN RAISE EXCEPTION 'Deletion charge guard has drifted'; END IF;
  source := changed;
  changed := replace(source,
    'Esta solicitação possui cobrança vinculada e precisa permanecer no histórico financeiro. Consulte o financeiro para cancelar o atendimento quando aplicável.'';',
    'Esta solicitação possui cobrança vinculada e precisa permanecer no histórico financeiro.'';
    IF open_charge THEN
      block_reason := ''CHARGE_OPEN'';
      block_message := ''Existe uma cobrança ativa vinculada. Abra a cobrança para consultar o saldo e cancelar a obrigação quando permitido.'';
    ELSE
      block_reason := ''CHARGE_CANCELLED'';
      block_message := CASE WHEN r.status IN (''concluido'',''cancelado'')
        THEN ''A cobrança já está cancelada. Arquive o atendimento para retirá-lo da fila ativa e preservar o histórico financeiro.''
        ELSE ''A cobrança já está cancelada. Cancele o atendimento e depois arquive-o para retirá-lo da fila ativa.'' END;
    END IF;');
  IF changed=source THEN RAISE EXCEPTION 'Deletion charge explanation has drifted'; END IF;
  source := changed;
  changed := replace(source,'''can_show_action'', can_show,','''can_show_action'', can_show,''can_archive'', can_archive AND block_reason IS DISTINCT FROM ''CONCURRENT_OPERATION'',');
  IF changed=source THEN RAISE EXCEPTION 'Deletion archive projection has drifted'; END IF;
  EXECUTE changed;
END $deletion$;

NOTIFY pgrst,'reload schema';
