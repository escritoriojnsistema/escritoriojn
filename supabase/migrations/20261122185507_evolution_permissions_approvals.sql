-- Incremental fixes for the already-recorded evolution migrations.

DO $permissions$
DECLARE
  item record;
  definition text;
  anchor constant text := '''requests.cancel''';
  expanded constant text := anchor || ',''requests.delete'',''payments.manual.approve'',''payments.providers.manage'',''charges.discount.approve''';
BEGIN
  FOR item IN
    SELECT conrelid::regclass AS relation,conname,pg_get_constraintdef(oid) AS source
    FROM pg_constraint WHERE conname IN (
      'team_member_permissions_permission_code_check','team_delegations_allowed_permissions_check',
      'team_invitations_permissions_check'
    ) AND connamespace='private'::regnamespace
  LOOP
    definition := replace(item.source,anchor,expanded);
    IF definition=item.source THEN RAISE EXCEPTION 'Permission constraint has drifted: %',item.conname; END IF;
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I, ADD CONSTRAINT %I %s',
      item.relation,item.conname,item.conname,definition);
  END LOOP;

  FOR item IN
    SELECT pg_get_functiondef(oid) AS source,proname FROM pg_proc
    WHERE pronamespace='private'::regnamespace AND proname IN (
      'team_scope_for_member','team_validate_assignment','safe_audit_changes'
    )
  LOOP
    definition := replace(item.source,anchor,expanded);
    IF definition=item.source THEN RAISE EXCEPTION 'Permission routine has drifted: %',item.proname; END IF;
    EXECUTE definition;
  END LOOP;
END $permissions$;

ALTER TABLE private.financial_approvals ADD COLUMN request_digest text
  CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$');

CREATE OR REPLACE FUNCTION private.notifications_page(
  p_office_id uuid, p_query text, p_read text, p_kind text, p_page integer, p_size integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships := private.notifications_actor(p_office_id);
  caps text[] := private.current_permissions(p_office_id);
  q text := lower(btrim(p_query));
  result jsonb;
  evolution_kinds constant text[] := ARRAY[
    'request_deleted','payment_approval_requested','payment_approval_decided',
    'discount_approval_requested','discount_approval_decided'
  ];
  document_kinds constant text[] := ARRAY[
    'document_review_pending','document_approved','document_returned','document_rejected',
    'document_withdrawn','smart_submission','conference_done','charge_released','correction_requested','correction_resolved'
  ];
  finance_kinds constant text[] := ARRAY[
    'payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled'
  ];
  portal_kinds constant text[] := ARRAY['request_returned','request_cancelled','assignee_changed','account_updated'];
  staff_kinds constant text[] := ARRAY['handoff','pending','account_correction'];
BEGIN
  IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]'
     OR p_read IS NULL OR p_read NOT IN ('all','unread','read')
     OR p_kind IS NULL OR NOT (p_kind='all' OR p_kind=ANY(
       evolution_kinds||document_kinds||finance_kinds||portal_kinds||staff_kinds
     ))
     OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN (3,5) THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
  END IF;

  WITH visible AS (
    SELECT n.*, r.id AS current_request_id, r.protocol AS current_protocol,
      m.role_code='client' OR r.category='account_correction' OR caps @> ARRAY['requests.read_all']
        OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS (
          SELECT FROM private.request_assignments a
          WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id
        ) AS legacy_can_open
    FROM private.internal_notifications n
    LEFT JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id
    WHERE n.office_id=p_office_id AND n.recipient_id=m.id
      AND CASE
        WHEN n.kind=ANY(evolution_kinds) THEN private.notification_visible(n,r,m)
        WHEN r.id IS NULL THEN false
        WHEN n.kind=ANY(document_kinds) AND private.notification_visible(n,r,m) IS NOT TRUE THEN false
        WHEN m.role_code='client' THEN
          (n.kind=ANY(portal_kinds||array_remove(document_kinds,'document_review_pending'))
            AND r.origin='portal' AND r.created_by=m.user_id)
          OR (n.kind=ANY(finance_kinds) AND private.finance_client_request(r,m))
        ELSE
          caps @> ARRAY['requests.read'] AND n.kind=ANY(staff_kinds||document_kinds)
          AND (r.category<>'account_correction' OR caps @> ARRAY['accounts.corrections.read'])
      END
  ), projected AS (
    SELECT v.*,
      CASE WHEN v.kind=ANY(evolution_kinds) THEN v.current_request_id
           WHEN v.legacy_can_open THEN v.current_request_id END AS visible_id,
      CASE WHEN v.kind='request_deleted' THEN v.deleted_protocol
           WHEN v.kind=ANY(evolution_kinds) OR v.legacy_can_open THEN v.current_protocol END AS visible_protocol
    FROM visible v
  ), filtered AS (
    SELECT * FROM projected
    WHERE (p_read='all' OR p_read='unread' AND read_at IS NULL OR p_read='read' AND read_at IS NOT NULL)
      AND (p_kind='all' OR kind=p_kind)
      AND (q='' OR
        CASE WHEN kind=ANY(evolution_kinds)
          THEN strpos(lower(coalesce(visible_protocol,'')||' '||coalesce(approval_summary,'')),q)>0
          ELSE strpos(lower(visible_protocol),q)>0 OR (kind='assignee_changed' AND strpos(lower(attendant_name),q)>0)
        END
      )
  ), paged AS (
    SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size
  )
  SELECT jsonb_build_object(
    'total',(SELECT count(*) FROM filtered),
    'unread',(SELECT count(*) FROM visible WHERE read_at IS NULL),
    'page',p_page,'page_size',p_size,
    'items',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id',id,'kind',kind,'created_at',created_at,'read_at',read_at,
        'can_open',visible_id IS NOT NULL,'request_id',visible_id,'protocol',visible_protocol,
        'attendant_name',CASE WHEN kind='assignee_changed' THEN attendant_name END,
        'deleted_protocol',deleted_protocol,'approval_id',approval_id,'approval_summary',approval_summary
      ) ORDER BY created_at DESC,id DESC) FROM paged
    ),'[]')
  ) INTO result;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.financial_approval_request_manual_payment(
  p_office_id uuid,
  p_charge_id uuid,
  p_charge_version integer,
  p_request_id uuid,
  p_session_id uuid,
  p_unit_id uuid,
  p_destination_account_id uuid,
  p_payment_method_id uuid,
  p_approver_user_id uuid,
  p_amount_cents bigint,
  p_operation_date date,
  p_external_reference text,
  p_justification text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
  existing private.financial_approvals;
  c private.charges;
  s private.cash_sessions;
  pm private.payment_methods;
  dest_account uuid;
  amounts record;
  approver_mid uuid;
  row_out private.financial_approvals;
  v_protocol text;
  digest text;
  v_request public.requests;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_charge_id IS NULL OR p_request_id IS NULL
     OR p_session_id IS NULL OR p_unit_id IS NULL OR p_payment_method_id IS NULL
     OR p_approver_user_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_operation_date IS NULL OR p_justification IS NULL
     OR char_length(btrim(p_justification)) NOT BETWEEN 5 AND 300
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  PERFORM 1 FROM public.offices WHERE id = p_office_id FOR NO KEY UPDATE;
  actor := private.team_require_identity();

  digest := encode(extensions.digest(jsonb_build_array('manual_payment',p_charge_id,p_charge_version,p_request_id,p_session_id,p_unit_id,p_destination_account_id,p_payment_method_id,p_approver_user_id,p_amount_cents,p_operation_date,p_external_reference,btrim(p_justification))::text,'sha256'),'hex');
  SELECT * INTO existing
  FROM private.financial_approvals
  WHERE office_id = p_office_id
    AND requester_user_id = actor
    AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    IF NOT private.team_user_active(actor,p_office_id)
       OR existing.request_digest IS DISTINCT FROM digest THEN
      RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    RETURN private.financial_approval_json(existing, actor);
  END IF;

  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active;
  caps := private.current_permissions(p_office_id);
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR NOT (caps && ARRAY['cash.open', 'cash.read']) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  IF p_approver_user_id = actor OR NOT private.financial_approval_member_can_approve(p_office_id, p_approver_user_id, 'manual_payment') THEN
    RAISE EXCEPTION 'WRONG_APPROVER' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO s
  FROM private.cash_sessions
  WHERE office_id = p_office_id AND id = p_session_id AND unit_id = p_unit_id
  FOR SHARE;
  IF s.id IS NULL OR s.status <> 'open' THEN
    RAISE EXCEPTION 'CASH_SESSION_CLOSED' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO pm
  FROM private.payment_methods
  WHERE office_id = p_office_id AND unit_id = p_unit_id AND id = p_payment_method_id AND active;
  IF pm.id IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  dest_account := coalesce(p_destination_account_id, pm.destination_account_id);
  IF dest_account IS DISTINCT FROM pm.destination_account_id OR NOT EXISTS (
    SELECT 1 FROM private.financial_accounts fa
    WHERE fa.office_id = p_office_id AND fa.unit_id = p_unit_id AND fa.id = dest_account AND fa.active
  ) THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO c
  FROM private.charges
  WHERE office_id = p_office_id AND id = p_charge_id AND request_id = p_request_id
  FOR SHARE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- The requester must currently see this request under the office rules; a known charge UUID alone
  -- never authorizes asking an approver to release money.
  SELECT * INTO v_request
  FROM public.requests
  WHERE office_id = p_office_id AND id = p_request_id;
  IF private.document_cash_in_scope(v_request, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_charge_version THEN
    RAISE EXCEPTION 'CHARGE_CHANGED' USING ERRCODE = 'PT409';
  END IF;
  IF p_amount_cents > amounts.balance_cents THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT r.protocol INTO v_protocol FROM public.requests r WHERE r.office_id = p_office_id AND r.id = p_request_id;
  SELECT id INTO approver_mid FROM public.memberships WHERE office_id = p_office_id AND user_id = p_approver_user_id AND active LIMIT 1;

  INSERT INTO private.financial_approvals(
    office_id, kind, status, charge_id, charge_version_snapshot, request_id,
    requester_user_id, approver_user_id, original_cents, requested_amount_cents,
    final_cents, card_fee_cents, payment_method_id, session_id, unit_id,
    destination_account_id, operation_date, external_reference, justification,
    idempotency_key, request_digest, expires_at
  ) VALUES (
    p_office_id, 'manual_payment', 'pending', p_charge_id, amounts.version, p_request_id,
    actor, p_approver_user_id, amounts.balance_cents, p_amount_cents,
    amounts.balance_cents - p_amount_cents, 0, p_payment_method_id, p_session_id, p_unit_id,
    dest_account, p_operation_date, nullif(btrim(coalesce(p_external_reference, '')), ''), btrim(p_justification),
    btrim(p_idempotency_key), digest, clock_timestamp() + interval '4 hours'
  )
  RETURNING * INTO row_out;

  IF approver_mid IS NOT NULL THEN
    INSERT INTO private.internal_notifications(
      office_id, request_id, recipient_id, event_id, kind, approval_id, approval_summary
    ) VALUES (
      p_office_id, p_request_id, approver_mid, gen_random_uuid(), 'payment_approval_requested',
      row_out.id, coalesce(v_protocol, '') || ' · Pagamento manual'
    );
  END IF;

  PERFORM private.emit_business_event(
    p_office_id, 'payments.manual_approval_requested', 'financial_approval', row_out.id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.financial_approval_json(row_out, actor);
END $$;

CREATE OR REPLACE FUNCTION private.financial_approval_request_discount(
  p_office_id uuid,
  p_charge_id uuid,
  p_charge_version integer,
  p_request_id uuid,
  p_approver_user_id uuid,
  p_mode text,
  p_discount_cents bigint,
  p_discount_percent numeric,
  p_justification text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
  existing private.financial_approvals;
  c private.charges;
  amounts record;
  computed_discount bigint;
  approver_mid uuid;
  row_out private.financial_approvals;
  v_protocol text;
  digest text;
  v_request public.requests;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_charge_id IS NULL OR p_request_id IS NULL
     OR p_approver_user_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('amount_cents', 'percent')
     OR p_discount_cents IS NULL OR p_discount_cents <= 0
     OR p_justification IS NULL OR char_length(btrim(p_justification)) NOT BETWEEN 5 AND 300
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  PERFORM 1 FROM public.offices WHERE id = p_office_id FOR NO KEY UPDATE;
  actor := private.team_require_identity();

  digest := encode(extensions.digest(jsonb_build_array('discount',p_charge_id,p_charge_version,p_request_id,p_approver_user_id,p_mode,p_discount_cents,p_discount_percent,btrim(p_justification))::text,'sha256'),'hex');
  SELECT * INTO existing
  FROM private.financial_approvals
  WHERE office_id = p_office_id
    AND requester_user_id = actor
    AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    IF NOT private.team_user_active(actor,p_office_id)
       OR existing.request_digest IS DISTINCT FROM digest THEN
      RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    RETURN private.financial_approval_json(existing, actor);
  END IF;

  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active;
  caps := private.current_permissions(p_office_id);
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR NOT (caps @> ARRAY['charges.read']) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  IF p_approver_user_id = actor OR NOT private.financial_approval_member_can_approve(p_office_id, p_approver_user_id, 'discount') THEN
    RAISE EXCEPTION 'WRONG_APPROVER' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO c
  FROM private.charges
  WHERE office_id = p_office_id AND id = p_charge_id AND request_id = p_request_id
  FOR SHARE;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO v_request
  FROM public.requests
  WHERE office_id = p_office_id AND id = p_request_id;
  IF private.request_in_scope(v_request, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_charge_version THEN
    RAISE EXCEPTION 'CHARGE_CHANGED' USING ERRCODE = 'PT409';
  END IF;

  IF p_mode = 'percent' THEN
    IF p_discount_percent IS NULL OR p_discount_percent <= 0 OR p_discount_percent > 100 OR p_discount_percent <> round(p_discount_percent,2) THEN
      RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
    END IF;
    computed_discount := round((amounts.balance_cents::numeric * p_discount_percent) / 100.0)::bigint;
  ELSE
    computed_discount := p_discount_cents;
  END IF;

  IF computed_discount <> p_discount_cents OR computed_discount <= 0 OR computed_discount > amounts.balance_cents THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT r.protocol INTO v_protocol FROM public.requests r WHERE r.office_id = p_office_id AND r.id = p_request_id;
  SELECT id INTO approver_mid FROM public.memberships WHERE office_id = p_office_id AND user_id = p_approver_user_id AND active LIMIT 1;

  INSERT INTO private.financial_approvals(
    office_id, kind, status, charge_id, charge_version_snapshot, request_id,
    requester_user_id, approver_user_id, original_cents, requested_amount_cents,
    discount_mode, discount_cents, discount_percent, final_cents, card_fee_cents,
    justification, idempotency_key, request_digest, expires_at
  ) VALUES (
    p_office_id, 'discount', 'pending', p_charge_id, amounts.version, p_request_id,
    actor, p_approver_user_id, amounts.balance_cents, computed_discount,
    p_mode, computed_discount, p_discount_percent, amounts.balance_cents - computed_discount, 0,
    btrim(p_justification), btrim(p_idempotency_key), digest, clock_timestamp() + interval '24 hours'
  )
  RETURNING * INTO row_out;

  IF approver_mid IS NOT NULL THEN
    INSERT INTO private.internal_notifications(
      office_id, request_id, recipient_id, event_id, kind, approval_id, approval_summary
    ) VALUES (
      p_office_id, p_request_id, approver_mid, gen_random_uuid(), 'discount_approval_requested',
      row_out.id, coalesce(v_protocol, '') || ' · Desconto comercial'
    );
  END IF;

  PERFORM private.emit_business_event(
    p_office_id, 'charges.discount_approval_requested', 'financial_approval', row_out.id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.financial_approval_json(row_out, actor);
END $$;

CREATE OR REPLACE FUNCTION private.financial_approval_decide(
  p_office_id uuid,
  p_approval_id uuid,
  p_decision text,
  p_expected_charge_version integer,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  a private.financial_approvals;
  amounts record;
  requester_mid uuid;
  v_protocol text;
  v_new_version integer;

BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_approval_id IS NULL
     OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject')
     OR p_expected_charge_version IS NULL OR p_expected_charge_version < 1
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  PERFORM 1 FROM public.offices WHERE id = p_office_id FOR NO KEY UPDATE;
  actor := private.team_require_identity();

  SELECT * INTO a
  FROM private.financial_approvals
  WHERE office_id = p_office_id AND id = p_approval_id
  FOR UPDATE;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF a.approver_user_id <> actor THEN
    RAISE EXCEPTION 'WRONG_APPROVER' USING ERRCODE = 'PT403';
  END IF;
  IF NOT private.financial_approval_member_can_approve(p_office_id, actor, a.kind) THEN
    RAISE EXCEPTION 'PERMISSION_REVOKED' USING ERRCODE = 'PT403';
  END IF;
  IF a.decision_idempotency_key = btrim(p_idempotency_key) THEN
    IF (p_decision = 'reject') IS DISTINCT FROM (a.status = 'rejected')
       OR a.charge_version_snapshot <> p_expected_charge_version
       OR a.decision_note IS DISTINCT FROM nullif(btrim(coalesce(p_note, '')), '') THEN
      RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    RETURN private.financial_approval_json(a, actor);
  END IF;
  IF a.status <> 'pending' THEN
    RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE = 'PT409';
  END IF;
  IF a.expires_at <= clock_timestamp() THEN
    UPDATE private.financial_approvals
       SET status = 'expired', updated_at = clock_timestamp()
     WHERE id = a.id;
    RAISE EXCEPTION 'APPROVAL_EXPIRED' USING ERRCODE = 'PT409';
  END IF;

  PERFORM 1 FROM private.charges WHERE office_id = p_office_id AND id = a.charge_id FOR UPDATE;
  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, a.charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR amounts.version <> a.charge_version_snapshot THEN
    UPDATE private.financial_approvals
       SET status = 'revoked',
           invalidation_reason = 'Cobrança alterada após o pedido de autorização.',
           updated_at = clock_timestamp()
     WHERE id = a.id;
    RAISE EXCEPTION 'CHARGE_CHANGED' USING ERRCODE = 'PT409';
  END IF;

  SELECT r.protocol INTO v_protocol FROM public.requests r WHERE r.office_id = p_office_id AND r.id = a.request_id;
  SELECT id INTO requester_mid FROM public.memberships WHERE office_id = p_office_id AND user_id = a.requester_user_id AND active LIMIT 1;

  IF p_decision = 'reject' THEN
    UPDATE private.financial_approvals
       SET status = 'rejected',
           decision_note = nullif(btrim(coalesce(p_note, '')), ''),
           decision_idempotency_key = btrim(p_idempotency_key),
           decided_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE id = a.id
     RETURNING * INTO a;
  ELSIF a.kind = 'discount' THEN
    IF a.discount_cents > amounts.balance_cents THEN
      RAISE EXCEPTION 'CHARGE_CHANGED' USING ERRCODE = 'PT409';
    END IF;
    v_new_version := amounts.version + 1;
    -- Guard so our charge_events invalidation trigger does not revoke THIS approval being executed
    PERFORM set_config('jn.applying_approval_id', a.id::text, true);
    INSERT INTO private.charge_events(office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    VALUES (
      p_office_id, a.charge_id, v_new_version, 'adjusted', -a.discount_cents,
      left('Desconto comercial aprovado: ' || a.justification, 500), actor
    );
    -- Reduce future installments first while preserving their numbers and due dates.
    WITH installments AS (
      SELECT i.*,coalesce(sum(i.amount_cents) OVER (
        ORDER BY i.number DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),0)::bigint AS later_amount
      FROM private.charge_installments i
      WHERE i.office_id=p_office_id AND i.charge_id=a.charge_id AND i.version=amounts.version
    )
    INSERT INTO private.charge_installments(office_id,charge_id,version,number,due_date,amount_cents)
    SELECT p_office_id,a.charge_id,v_new_version,i.number,i.due_date,
      i.amount_cents-least(i.amount_cents,greatest(0,a.discount_cents-i.later_amount))
    FROM installments i;
    PERFORM set_config('jn.applying_approval_id','',true);

    UPDATE private.financial_approvals
       SET status = 'executed',
           decision_note = nullif(btrim(coalesce(p_note, '')), ''),
           decision_idempotency_key = btrim(p_idempotency_key),
           decided_at = clock_timestamp(),
           executed_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE id = a.id
     RETURNING * INTO a;
  ELSE
    UPDATE private.financial_approvals
       SET status = 'approved',
           decision_note = nullif(btrim(coalesce(p_note, '')), ''),
           decision_idempotency_key = btrim(p_idempotency_key),
           decided_at = clock_timestamp(),
           updated_at = clock_timestamp()
     WHERE id = a.id
     RETURNING * INTO a;
  END IF;

  IF requester_mid IS NOT NULL THEN
    INSERT INTO private.internal_notifications(
      office_id, request_id, recipient_id, event_id, kind, approval_id, approval_summary
    ) VALUES (
      p_office_id, a.request_id, requester_mid, gen_random_uuid(),
      CASE WHEN a.kind = 'discount' THEN 'discount_approval_decided' ELSE 'payment_approval_decided' END,
      a.id,
      coalesce(v_protocol, '') || ' · ' || CASE WHEN p_decision = 'approve' THEN 'Aprovado' ELSE 'Recusado' END
    );
  END IF;

  PERFORM private.emit_business_event(
    p_office_id,
    CASE
      WHEN a.kind = 'discount' AND p_decision = 'approve' THEN 'charges.discount_approval_approved'
      WHEN a.kind = 'discount' THEN 'charges.discount_approval_rejected'
      WHEN p_decision = 'approve' THEN 'payments.manual_approval_approved'
      ELSE 'payments.manual_approval_rejected'
    END,
    'financial_approval',
    a.id,
    gen_random_uuid(),
    '{}'::jsonb
  );

  RETURN private.financial_approval_json(a, actor);
END $$;

CREATE OR REPLACE FUNCTION private.financial_approval_execute_manual_payment(
  p_office_id uuid,
  p_approval_id uuid,
  p_session_id uuid,
  p_expected_charge_version integer,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  a private.financial_approvals;
  s private.cash_sessions;
  pm private.payment_methods;
  fa private.financial_accounts;
  amounts record;
  v_payment_id uuid;
  v_command_key uuid;
  v_started_at timestamptz;
  v_protocol text;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_approval_id IS NULL OR p_session_id IS NULL
     OR p_expected_charge_version IS NULL OR p_expected_charge_version < 1
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  PERFORM 1 FROM public.offices WHERE id = p_office_id FOR NO KEY UPDATE;
  actor := private.team_require_identity();

  SELECT * INTO a
  FROM private.financial_approvals
  WHERE office_id = p_office_id AND id = p_approval_id
  FOR UPDATE;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR (actor <> a.requester_user_id AND actor <> a.approver_user_id) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  IF p_session_id IS DISTINCT FROM a.session_id OR p_expected_charge_version <> a.charge_version_snapshot THEN
    RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF a.execution_idempotency_key = btrim(p_idempotency_key) AND a.status = 'executed' THEN
    RETURN private.financial_approval_json(a, actor);
  END IF;

  IF a.kind <> 'manual_payment' THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  IF a.executed_payment_id IS NOT NULL OR a.status = 'executed' THEN
    RAISE EXCEPTION 'ALREADY_EXECUTED' USING ERRCODE = 'PT409';
  END IF;
  IF a.status <> 'approved' THEN
    RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
  END IF;
  IF a.expires_at <= clock_timestamp() THEN
    UPDATE private.financial_approvals SET status = 'expired', updated_at = clock_timestamp() WHERE id = a.id;
    RAISE EXCEPTION 'APPROVAL_EXPIRED' USING ERRCODE = 'PT409';
  END IF;

  -- Revalidate that the approver still holds approval authority
  IF NOT private.financial_approval_member_can_approve(p_office_id, a.approver_user_id, 'manual_payment') THEN
    UPDATE private.financial_approvals
       SET status = 'revoked', invalidation_reason = 'Permissão do aprovador revogada antes da execução.', updated_at = clock_timestamp()
     WHERE id = a.id;
    RAISE EXCEPTION 'PERMISSION_REVOKED' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO s
  FROM private.cash_sessions
  WHERE office_id = p_office_id AND id = p_session_id AND unit_id = a.unit_id
  FOR UPDATE;
  IF s.id IS NULL OR s.status <> 'open' THEN
    RAISE EXCEPTION 'CASH_SESSION_CLOSED' USING ERRCODE = 'PT422';
  END IF;

  PERFORM 1 FROM private.charges WHERE office_id = p_office_id AND id = a.charge_id FOR UPDATE;
  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, a.charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR amounts.version <> a.charge_version_snapshot OR a.requested_amount_cents > amounts.balance_cents THEN
    UPDATE private.financial_approvals
       SET status = 'revoked', invalidation_reason = 'Cobrança ou saldo alterado antes da execução.', updated_at = clock_timestamp()
     WHERE id = a.id;
    RAISE EXCEPTION 'CHARGE_CHANGED' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO pm FROM private.payment_methods WHERE office_id = p_office_id AND unit_id = a.unit_id AND id = a.payment_method_id;
  IF pm.id IS NULL OR NOT pm.active OR pm.destination_account_id IS DISTINCT FROM a.destination_account_id THEN
    RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  -- Delegate to canonical Etapa 15 payment_operate so all cash_commands, cash_entries,
  -- payment_allocations, payment_decisions, payment_ledger_links, and session version guards are honored.
  v_command_key := md5('jn-fa-exec:' || a.id::text || ':' || btrim(p_idempotency_key))::uuid;
  v_started_at := clock_timestamp();
  PERFORM private.payment_operate_authorized(
    p_office_id,
    jsonb_build_object(
      'kind', 'record',
      'session_id', s.id,
      'expected_version', s.version,
      'idempotency_key', v_command_key,
      'evidence', left('Pagamento manual autorizado (' || a.id::text || '): ' || a.justification, 500),
      'payment_method_id', pm.id,
      'status', 'confirmed',
      'allocations', jsonb_build_array(
        jsonb_build_object(
          'charge_id', a.charge_id,
          'expected_charge_version', amounts.version,
          'amount_cents', a.requested_amount_cents
        )
      ),
      'presented_cents', CASE WHEN pm.type = 'cash' THEN a.requested_amount_cents ELSE NULL END,
      'fee_cents', 0,
      'settlement', CASE WHEN pm.type = 'card' THEN 'pending' ELSE 'not_applicable' END,
      'settled_on', NULL,
      'external_reference', a.external_reference
    )
  );

  SELECT p.id INTO v_payment_id
  FROM private.payments p
  JOIN private.payment_allocations pa ON pa.office_id = p.office_id AND pa.payment_id = p.id
  WHERE p.office_id = p_office_id
    AND p.session_id = s.id
    AND p.actor_id = actor
    AND p.created_at >= v_started_at
    AND pa.charge_id = a.charge_id
    AND pa.amount_cents = a.requested_amount_cents
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  UPDATE private.financial_approvals
     SET status = 'executed',
         execution_idempotency_key = btrim(p_idempotency_key),
         executed_payment_id = v_payment_id,
         executed_at = clock_timestamp(),
         updated_at = clock_timestamp()
   WHERE id = a.id
   RETURNING * INTO a;

  PERFORM private.emit_business_event(
    p_office_id, 'payments.manual_approval_executed', 'financial_approval', a.id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.financial_approval_json(a, actor);
END $$;

NOTIFY pgrst, 'reload schema';

-- Apply the approval boundary at the database entry points as well as in the
-- new workflow. Keep the canonical implementations for already-authorized
-- approval execution and the two existing purpose-specific flows.
ALTER FUNCTION private.payment_operate(uuid,jsonb) RENAME TO payment_operate_authorized;
ALTER FUNCTION private.charges_mutate(uuid,uuid,integer,jsonb,uuid) RENAME TO charges_mutate_authorized;

CREATE FUNCTION private.payment_operate(p_office_id uuid,p_operation jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
BEGIN
  IF p_operation->>'kind'='confirm' OR
     (p_operation->>'kind'='record' AND p_operation->>'status'='confirmed') THEN
    actor := private.cash_actor(p_office_id,true,'cash.open');
    IF private.financial_approval_member_can_approve(p_office_id,actor,'manual_payment') IS NOT TRUE THEN
      RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';
    END IF;
  END IF;
  RETURN private.payment_operate_authorized(p_office_id,p_operation);
END $$;

CREATE FUNCTION private.charges_mutate(
  p_office_id uuid,p_charge_id uuid,p_expected_version integer,p_mutation jsonb,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  member public.memberships;
BEGIN
  IF p_mutation->>'kind'='adjust' AND jsonb_typeof(p_mutation->'delta_cents')='number'
     AND (p_mutation->>'delta_cents')::numeric<0 THEN
    member := private.charges_actor(p_office_id,true,'charges.adjust');
    IF private.financial_approval_member_can_approve(p_office_id,member.user_id,'discount') IS NOT TRUE THEN
      RAISE EXCEPTION 'CHARGES_FORBIDDEN' USING ERRCODE='PT403';
    END IF;
  END IF;
  RETURN private.charges_mutate_authorized(p_office_id,p_charge_id,p_expected_version,p_mutation,p_idempotency_key);
END $$;

CREATE OR REPLACE FUNCTION public.payment_operate(p_office_id uuid,p_operation jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_operate(p_office_id,p_operation);
$$;

CREATE OR REPLACE FUNCTION public.charges_mutate(
  p_office_id uuid,p_charge_id uuid,p_expected_version integer,p_mutation jsonb,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.charges_mutate(p_office_id,p_charge_id,p_expected_version,p_mutation,p_idempotency_key);
$$;

REVOKE ALL ON FUNCTION
  private.payment_operate(uuid,jsonb),private.payment_operate_authorized(uuid,jsonb),
  private.charges_mutate(uuid,uuid,integer,jsonb,uuid),private.charges_mutate_authorized(uuid,uuid,integer,jsonb,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.payment_operate(uuid,jsonb),private.charges_mutate(uuid,uuid,integer,jsonb,uuid)
TO authenticated;

DO $authorized_flows$
DECLARE
  source text;
  updated text;
BEGIN
  source := pg_get_functiondef('private.quick_operate(uuid,jsonb)'::regprocedure);
  updated := replace(source,'private.payment_operate(','private.payment_operate_authorized(');
  IF updated=source THEN RAISE EXCEPTION 'Quick operation definition has drifted'; END IF;
  EXECUTE updated;

  source := pg_get_functiondef('private.smart_courtesy_authorize(uuid,uuid,uuid,text,uuid)'::regprocedure);
  updated := replace(source,
    'caps @> ARRAY[''charges.adjust''] OR caps @> ARRAY[''services.courtesy'']',
    'caps @> ARRAY[''charges.adjust'',''services.courtesy'']');
  updated := replace(updated,'private.charges_mutate(','private.charges_mutate_authorized(');
  IF updated=source OR position('caps @> ARRAY[''charges.adjust'',''services.courtesy'']' IN updated)=0 THEN
    RAISE EXCEPTION 'Courtesy authorization definition has drifted';
  END IF;
  EXECUTE updated;
END $authorized_flows$;

CREATE FUNCTION private.financial_approvals_invalidate_on_grant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  member public.memberships;
BEGIN
  SELECT * INTO member FROM public.memberships WHERE id=OLD.membership_id;
  IF FOUND THEN
    UPDATE private.financial_approvals a
    SET status='revoked',
        invalidation_reason='Permissão do aprovador revogada antes da conclusão.',
        updated_at=clock_timestamp()
    WHERE a.office_id=member.office_id AND a.approver_user_id=member.user_id
      AND a.status IN ('pending','approved')
      AND private.financial_approval_member_can_approve(a.office_id,a.approver_user_id,a.kind) IS NOT TRUE;
  END IF;
  RETURN NULL;
END $$;

-- Team management may replace a member's entire grant set in one transaction.
-- Assess its final effective authority before invalidating pending operations.
CREATE CONSTRAINT TRIGGER financial_approvals_direct_grant_guard
AFTER UPDATE OR DELETE ON private.team_member_permissions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (OLD.permission_code IN ('payments.manual.approve','charges.discount.approve'))
EXECUTE FUNCTION private.financial_approvals_invalidate_on_grant_change();

CREATE CONSTRAINT TRIGGER financial_approvals_delegation_guard
AFTER UPDATE OR DELETE ON private.team_delegations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION private.financial_approvals_invalidate_on_grant_change();

REVOKE ALL ON FUNCTION private.financial_approvals_invalidate_on_grant_change()
FROM PUBLIC,anon,authenticated,service_role;
