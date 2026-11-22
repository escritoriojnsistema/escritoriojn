-- Etapas 4 & 5: Two-step Financial Approvals (Manual Payments & Commercial Discounts)
-- Single-use execution under FOR UPDATE locks, strict commercial discount vs card fee separation,
-- backend-filtered office approvers, and automatic invalidation triggers on charge or access changes.

CREATE TABLE private.financial_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('manual_payment', 'discount')),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'revoked', 'executed')),
  charge_id uuid NOT NULL,
  charge_version_snapshot integer NOT NULL CHECK (charge_version_snapshot BETWEEN 1 AND 2147483646),
  request_id uuid NOT NULL,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approver_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  original_cents bigint NOT NULL CHECK (original_cents >= 0),
  requested_amount_cents bigint NOT NULL CHECK (requested_amount_cents > 0),
  discount_mode text CHECK (discount_mode IS NULL OR discount_mode IN ('amount_cents', 'percent')),
  discount_cents bigint CHECK (discount_cents IS NULL OR discount_cents > 0),
  discount_percent numeric(5, 2) CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100)),
  final_cents bigint NOT NULL CHECK (final_cents >= 0),
  card_fee_cents bigint NOT NULL DEFAULT 0 CHECK (card_fee_cents >= 0),
  payment_method_id uuid,
  session_id uuid,
  unit_id uuid,
  destination_account_id uuid,
  operation_date date,
  external_reference text CHECK (external_reference IS NULL OR (char_length(external_reference) BETWEEN 1 AND 120 AND external_reference = btrim(external_reference) AND external_reference !~ '[[:cntrl:]]')),
  justification text NOT NULL CHECK (char_length(btrim(justification)) BETWEEN 5 AND 300 AND justification !~ '[[:cntrl:]]'),
  decision_note text CHECK (decision_note IS NULL OR (char_length(btrim(decision_note)) BETWEEN 1 AND 300 AND decision_note !~ '[[:cntrl:]]')),
  invalidation_reason text,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  decision_idempotency_key text,
  execution_idempotency_key text,
  executed_payment_id uuid,
  expires_at timestamptz NOT NULL,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (office_id, requester_user_id, idempotency_key),
  FOREIGN KEY (office_id, charge_id) REFERENCES private.charges(office_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (office_id, request_id) REFERENCES public.requests(office_id, id) ON DELETE RESTRICT,
  CHECK (requester_user_id <> approver_user_id),
  CHECK (
    (kind = 'manual_payment' AND payment_method_id IS NOT NULL AND session_id IS NOT NULL AND unit_id IS NOT NULL AND operation_date IS NOT NULL)
    OR (kind = 'discount' AND discount_mode IS NOT NULL AND discount_cents IS NOT NULL)
  )
);

CREATE UNIQUE INDEX financial_approvals_exec_key_idx
  ON private.financial_approvals(execution_idempotency_key)
  WHERE execution_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX financial_approvals_exec_payment_idx
  ON private.financial_approvals(office_id, executed_payment_id)
  WHERE executed_payment_id IS NOT NULL;

CREATE INDEX financial_approvals_office_page_idx
  ON private.financial_approvals(office_id, created_at DESC, id DESC);

CREATE INDEX financial_approvals_approver_open_idx
  ON private.financial_approvals(office_id, approver_user_id, status)
  WHERE status IN ('pending', 'approved');

CREATE INDEX financial_approvals_charge_open_idx
  ON private.financial_approvals(office_id, charge_id, status)
  WHERE status IN ('pending', 'approved');

ALTER TABLE private.financial_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.financial_approvals FROM PUBLIC, anon, authenticated, service_role;

-- Internal helper: check whether a target membership is currently eligible to approve kind in office
CREATE FUNCTION private.financial_approval_member_can_approve(
  p_office_id uuid,
  p_user_id uuid,
  p_kind text
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  needed text;
  perms text[];
BEGIN
  needed := CASE WHEN p_kind = 'manual_payment' THEN 'payments.manual.approve' ELSE 'charges.discount.approve' END;
  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = p_user_id AND active;
  IF m.id IS NULL OR m.role_code NOT IN ('owner', 'admin') THEN
    RETURN false;
  END IF;
  IF NOT private.team_user_active(m.user_id, p_office_id) THEN
    RETURN false;
  END IF;
  IF m.role_code = 'owner' THEN
    RETURN true;
  END IF;
  perms := private.team_permissions_for_member(m.id);
  RETURN perms @> ARRAY[needed];
END $$;

-- Internal helper: project approval row to FinancialApprovalItem DTO
CREATE FUNCTION private.financial_approval_json(
  a private.financial_approvals,
  p_viewer_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_protocol text := '';
  v_customer_name text := '';
  v_service_summary text := '';
  v_requester_name text := '';
  v_approver_name text := '';
  v_method_name text := NULL;
  v_unit_name text := NULL;
  v_account_name text := NULL;
  v_effective_status text := a.status;
  v_can_decide boolean := false;
  v_can_execute boolean := false;
BEGIN
  IF a.status IN ('pending', 'approved') AND a.expires_at <= clock_timestamp() THEN
    v_effective_status := 'expired';
  END IF;

  SELECT r.protocol, coalesce(c.name, 'Cliente do atendimento')
    INTO v_protocol, v_customer_name
  FROM public.requests r
  LEFT JOIN public.customers c ON c.office_id = r.office_id AND c.id = r.customer_id
  WHERE r.office_id = a.office_id AND r.id = a.request_id;

  SELECT coalesce(string_agg(coalesce(ci.snapshot->'definition'->>'name', 'Serviço'), ', '), 'Serviço registrado')
    INTO v_service_summary
  FROM private.charge_items ci
  WHERE ci.office_id = a.office_id AND ci.charge_id = a.charge_id;

  SELECT coalesce(p.display_name, 'Operador') INTO v_requester_name
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.office_id = a.office_id AND m.user_id = a.requester_user_id
  LIMIT 1;

  SELECT coalesce(p.display_name, 'Aprovador') INTO v_approver_name
  FROM public.memberships m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.office_id = a.office_id AND m.user_id = a.approver_user_id
  LIMIT 1;

  IF a.payment_method_id IS NOT NULL THEN
    SELECT pm.name INTO v_method_name
    FROM private.payment_methods pm
    WHERE pm.office_id = a.office_id AND pm.id = a.payment_method_id;
  END IF;

  IF a.unit_id IS NOT NULL THEN
    SELECT u.name INTO v_unit_name
    FROM private.cash_units u
    WHERE u.office_id = a.office_id AND u.id = a.unit_id;
  END IF;

  IF a.destination_account_id IS NOT NULL THEN
    SELECT fa.name INTO v_account_name
    FROM private.financial_accounts fa
    WHERE fa.office_id = a.office_id AND fa.id = a.destination_account_id;
  END IF;

  v_can_decide := (
    v_effective_status = 'pending'
    AND p_viewer_user_id = a.approver_user_id
    AND private.financial_approval_member_can_approve(a.office_id, p_viewer_user_id, a.kind)
  );

  v_can_execute := (
    v_effective_status = 'approved'
    AND a.kind = 'manual_payment'
    AND a.executed_payment_id IS NULL
    AND (p_viewer_user_id = a.requester_user_id OR p_viewer_user_id = a.approver_user_id)
  );

  RETURN jsonb_build_object(
    'id', a.id,
    'office_id', a.office_id,
    'kind', a.kind,
    'status', v_effective_status,
    'charge_id', a.charge_id,
    'charge_version_snapshot', a.charge_version_snapshot,
    'request_id', a.request_id,
    'protocol', coalesce(v_protocol, ''),
    'customer_name', coalesce(v_customer_name, ''),
    'service_summary', coalesce(v_service_summary, ''),
    'requester_user_id', a.requester_user_id,
    'requester_name', coalesce(v_requester_name, ''),
    'approver_user_id', a.approver_user_id,
    'approver_name', coalesce(v_approver_name, ''),
    'original_cents', a.original_cents,
    'requested_amount_cents', a.requested_amount_cents,
    'discount_cents', a.discount_cents,
    'discount_percent', a.discount_percent::double precision,
    'final_cents', a.final_cents,
    'card_fee_cents', a.card_fee_cents,
    'payment_method_id', a.payment_method_id,
    'payment_method_name', v_method_name,
    'session_id', a.session_id,
    'unit_id', a.unit_id,
    'unit_name', v_unit_name,
    'destination_account_id', a.destination_account_id,
    'destination_account_name', v_account_name,
    'operation_date', CASE WHEN a.operation_date IS NOT NULL THEN to_char(a.operation_date, 'YYYY-MM-DD') ELSE NULL END,
    'external_reference', a.external_reference,
    'justification', a.justification,
    'decision_note', a.decision_note,
    'created_at', a.created_at,
    'expires_at', a.expires_at,
    'decided_at', a.decided_at,
    'executed_at', a.executed_at,
    'can_decide', v_can_decide,
    'can_execute', v_can_execute,
    'invalidation_reason', a.invalidation_reason
  );
END $$;

-- RPC 1: financial_approval_eligible_approvers
CREATE FUNCTION private.financial_approval_eligible_approvers(
  p_office_id uuid,
  p_kind text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  needed text;
  result jsonb;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_kind NOT IN ('manual_payment', 'discount') THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  needed := CASE WHEN p_kind = 'manual_payment' THEN 'payments.manual.approve' ELSE 'charges.discount.approve' END;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'membership_id', cand.id,
      'user_id', cand.user_id,
      'name', coalesce(pr.display_name, 'Aprovador do escritório'),
      'role_code', cand.role_code
    ) ORDER BY CASE WHEN cand.role_code = 'owner' THEN 0 ELSE 1 END, lower(coalesce(pr.display_name, ''))
  ), '[]'::jsonb) INTO result
  FROM public.memberships cand
  LEFT JOIN public.profiles pr ON pr.id = cand.user_id
  WHERE cand.office_id = p_office_id
    AND cand.active
    AND cand.user_id <> actor
    AND cand.role_code IN ('owner', 'admin')
    AND private.team_user_active(cand.user_id, p_office_id)
    AND (
      cand.role_code = 'owner'
      OR private.team_permissions_for_member(cand.id) @> ARRAY[needed]
    );

  RETURN result;
END $$;

-- RPC 2: financial_approvals_page
CREATE FUNCTION private.financial_approvals_page(
  p_office_id uuid,
  p_scope text,
  p_kind text,
  p_page integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
  can_view_all boolean;
  result jsonb;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL
     OR p_scope NOT IN ('all', 'assigned_to_me', 'requested_by_me')
     OR (p_kind IS NOT NULL AND p_kind NOT IN ('manual_payment', 'discount'))
     OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  caps := private.current_permissions(p_office_id);
  IF NOT (caps && ARRAY['cash.read', 'cash.open', 'charges.read', 'payments.manual.approve', 'charges.discount.approve']) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  can_view_all := (
    m.role_code = 'owner'
    OR caps @> ARRAY['cash.read_all']
    OR caps @> ARRAY['payments.manual.approve']
    OR caps @> ARRAY['charges.discount.approve']
  );

  WITH visible AS (
    SELECT a.*
    FROM private.financial_approvals a
    WHERE a.office_id = p_office_id
      AND (p_kind IS NULL OR a.kind = p_kind)
      AND (
        (p_scope = 'assigned_to_me' AND a.approver_user_id = actor)
        OR (p_scope = 'requested_by_me' AND a.requester_user_id = actor)
        OR (p_scope = 'all' AND (can_view_all OR a.requester_user_id = actor OR a.approver_user_id = actor))
      )
  ), paged AS (
    SELECT *
    FROM visible
    ORDER BY created_at DESC, id DESC
    LIMIT 5 OFFSET (p_page - 1) * 5
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(private.financial_approval_json(p, actor) ORDER BY p.created_at DESC, p.id DESC) FROM paged p), '[]'::jsonb),
    'total', (SELECT count(*)::integer FROM visible),
    'page', p_page,
    'page_size', 5
  ) INTO result;

  RETURN result;
END $$;

-- RPC 3: financial_approval_request_manual_payment (Etapa 4)
CREATE FUNCTION private.financial_approval_request_manual_payment(
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

  SELECT * INTO existing
  FROM private.financial_approvals
  WHERE office_id = p_office_id
    AND requester_user_id = actor
    AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
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
  IF NOT EXISTS (
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
  IF private.request_in_scope(v_request, m) IS NOT TRUE THEN
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
    idempotency_key, expires_at
  ) VALUES (
    p_office_id, 'manual_payment', 'pending', p_charge_id, amounts.version, p_request_id,
    actor, p_approver_user_id, amounts.balance_cents, p_amount_cents,
    amounts.balance_cents - p_amount_cents, 0, p_payment_method_id, p_session_id, p_unit_id,
    dest_account, p_operation_date, nullif(btrim(coalesce(p_external_reference, '')), ''), btrim(p_justification),
    btrim(p_idempotency_key), clock_timestamp() + interval '4 hours'
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

-- RPC 4: financial_approval_request_discount (Etapa 5)
CREATE FUNCTION private.financial_approval_request_discount(
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
  v_request public.requests;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_charge_id IS NULL OR p_request_id IS NULL
     OR p_approver_user_id IS NULL OR p_mode NOT IN ('amount_cents', 'percent')
     OR p_discount_cents IS NULL OR p_discount_cents <= 0
     OR p_justification IS NULL OR char_length(btrim(p_justification)) NOT BETWEEN 5 AND 300
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO existing
  FROM private.financial_approvals
  WHERE office_id = p_office_id
    AND requester_user_id = actor
    AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
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
    IF p_discount_percent IS NULL OR p_discount_percent <= 0 OR p_discount_percent > 100 THEN
      RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
    END IF;
    computed_discount := round((amounts.balance_cents::numeric * p_discount_percent) / 100.0)::bigint;
  ELSE
    computed_discount := p_discount_cents;
  END IF;

  IF computed_discount <= 0 OR computed_discount > amounts.balance_cents THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT r.protocol INTO v_protocol FROM public.requests r WHERE r.office_id = p_office_id AND r.id = p_request_id;
  SELECT id INTO approver_mid FROM public.memberships WHERE office_id = p_office_id AND user_id = p_approver_user_id AND active LIMIT 1;

  INSERT INTO private.financial_approvals(
    office_id, kind, status, charge_id, charge_version_snapshot, request_id,
    requester_user_id, approver_user_id, original_cents, requested_amount_cents,
    discount_mode, discount_cents, discount_percent, final_cents, card_fee_cents,
    justification, idempotency_key, expires_at
  ) VALUES (
    p_office_id, 'discount', 'pending', p_charge_id, amounts.version, p_request_id,
    actor, p_approver_user_id, amounts.balance_cents, computed_discount,
    p_mode, computed_discount, p_discount_percent, amounts.balance_cents - computed_discount, 0,
    btrim(p_justification), btrim(p_idempotency_key), clock_timestamp() + interval '24 hours'
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

-- RPC 5: financial_approval_decide (approve/reject manual payment or discount)
CREATE FUNCTION private.financial_approval_decide(
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
  v_due_date date;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_approval_id IS NULL
     OR p_decision NOT IN ('approve', 'reject')
     OR p_expected_charge_version IS NULL OR p_expected_charge_version < 1
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO a
  FROM private.financial_approvals
  WHERE office_id = p_office_id AND id = p_approval_id
  FOR UPDATE;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- Idempotent replay on same decision key
  IF a.decision_idempotency_key = btrim(p_idempotency_key) THEN
    RETURN private.financial_approval_json(a, actor);
  END IF;

  IF a.approver_user_id <> actor THEN
    RAISE EXCEPTION 'WRONG_APPROVER' USING ERRCODE = 'PT403';
  END IF;
  IF NOT private.financial_approval_member_can_approve(p_office_id, actor, a.kind) THEN
    RAISE EXCEPTION 'PERMISSION_REVOKED' USING ERRCODE = 'PT403';
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
    SELECT coalesce(min(ci.due_date), current_date) INTO v_due_date
    FROM private.charge_installments ci
    WHERE ci.office_id = p_office_id AND ci.charge_id = a.charge_id AND ci.version = amounts.version;

    -- Guard so our charge_events invalidation trigger does not revoke THIS approval being executed
    PERFORM set_config('jn.applying_approval_id', a.id::text, true);
    INSERT INTO private.charge_events(office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    VALUES (
      p_office_id, a.charge_id, v_new_version, 'adjusted', -a.discount_cents,
      left('Desconto comercial aprovado: ' || a.justification, 500), actor
    );
    INSERT INTO private.charge_installments(office_id, charge_id, version, number, due_date, amount_cents)
    VALUES (p_office_id, a.charge_id, v_new_version, 1, v_due_date, greatest(0, amounts.due_cents - a.discount_cents));

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

-- RPC 6: financial_approval_execute_manual_payment (single-use atomic execution in open cash session)
CREATE FUNCTION private.financial_approval_execute_manual_payment(
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
  v_entry_id uuid;
  v_protocol text;
BEGIN
  actor := private.team_require_identity();
  IF p_office_id IS NULL OR p_approval_id IS NULL OR p_session_id IS NULL
     OR p_expected_charge_version IS NULL OR p_expected_charge_version < 1
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'APPROVAL_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  SELECT * INTO a
  FROM private.financial_approvals
  WHERE office_id = p_office_id AND id = p_approval_id
  FOR UPDATE;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'APPROVAL_NOT_FOUND' USING ERRCODE = 'PT404';
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

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR (actor <> a.requester_user_id AND actor <> a.approver_user_id) THEN
    RAISE EXCEPTION 'APPROVAL_FORBIDDEN' USING ERRCODE = 'PT403';
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
  IF pm.id IS NULL OR NOT pm.active THEN
    RAISE EXCEPTION 'APPROVAL_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  -- Delegate to canonical Etapa 15 payment_operate so all cash_commands, cash_entries,
  -- payment_allocations, payment_decisions, payment_ledger_links, and session version guards are honored.
  PERFORM private.payment_operate(
    p_office_id,
    jsonb_build_object(
      'kind', 'record',
      'session_id', s.id,
      'expected_version', s.version,
      'idempotency_key', md5('jn-fa-exec:' || a.id::text || ':' || btrim(p_idempotency_key))::uuid,
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

-- Automatic invalidation trigger 1: any charge event invalidates open pending/approved approvals for that charge
CREATE FUNCTION private.financial_approvals_invalidate_on_charge_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  applying_id text := nullif(current_setting('jn.applying_approval_id', true), '');
BEGIN
  UPDATE private.financial_approvals
     SET status = 'revoked',
         invalidation_reason = 'Cobrança alterada após o pedido de autorização.',
         updated_at = clock_timestamp()
   WHERE office_id = NEW.office_id
     AND charge_id = NEW.charge_id
     AND status IN ('pending', 'approved')
     AND (applying_id IS NULL OR id::text <> applying_id);
  RETURN NEW;
END $$;

CREATE TRIGGER financial_approvals_charge_change_guard
  AFTER INSERT ON private.charge_events
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_approvals_invalidate_on_charge_event();

-- Automatic invalidation trigger 2: revoking/downgrading approver membership revokes open approvals
CREATE FUNCTION private.financial_approvals_invalidate_on_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (OLD.active AND NOT NEW.active) OR (OLD.role_code IS DISTINCT FROM NEW.role_code AND NEW.role_code NOT IN ('owner', 'admin')) THEN
    UPDATE private.financial_approvals
       SET status = 'revoked',
           invalidation_reason = 'Permissão ou vínculo do aprovador alterado antes da conclusão.',
           updated_at = clock_timestamp()
     WHERE office_id = NEW.office_id
       AND approver_user_id = NEW.user_id
       AND status IN ('pending', 'approved');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER financial_approvals_membership_guard
  AFTER UPDATE OF active, role_code ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.financial_approvals_invalidate_on_membership();

-- Public SECURITY INVOKER RPC wrappers (exact signatures called by Express)
CREATE FUNCTION public.financial_approval_eligible_approvers(p_office_id uuid, p_kind text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.financial_approval_eligible_approvers(p_office_id, p_kind);
$$;

CREATE FUNCTION public.financial_approvals_page(p_office_id uuid, p_scope text, p_kind text, p_page integer) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.financial_approvals_page(p_office_id, p_scope, p_kind, p_page);
$$;

CREATE FUNCTION public.financial_approval_request_manual_payment(
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
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.financial_approval_request_manual_payment(
    p_office_id, p_charge_id, p_charge_version, p_request_id, p_session_id,
    p_unit_id, p_destination_account_id, p_payment_method_id, p_approver_user_id,
    p_amount_cents, p_operation_date, p_external_reference, p_justification, p_idempotency_key
  );
$$;

CREATE FUNCTION public.financial_approval_request_discount(
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
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.financial_approval_request_discount(
    p_office_id, p_charge_id, p_charge_version, p_request_id, p_approver_user_id,
    p_mode, p_discount_cents, p_discount_percent, p_justification, p_idempotency_key
  );
$$;

CREATE FUNCTION public.financial_approval_decide(
  p_office_id uuid,
  p_approval_id uuid,
  p_decision text,
  p_expected_charge_version integer,
  p_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.financial_approval_decide(
    p_office_id, p_approval_id, p_decision, p_expected_charge_version, p_note, p_idempotency_key
  );
$$;

CREATE FUNCTION public.financial_approval_execute_manual_payment(
  p_office_id uuid,
  p_approval_id uuid,
  p_session_id uuid,
  p_expected_charge_version integer,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.financial_approval_execute_manual_payment(
    p_office_id, p_approval_id, p_session_id, p_expected_charge_version, p_idempotency_key
  );
$$;

REVOKE ALL ON FUNCTION
  private.financial_approval_member_can_approve(uuid, uuid, text),
  private.financial_approval_json(private.financial_approvals, uuid),
  private.financial_approvals_invalidate_on_charge_event(),
  private.financial_approvals_invalidate_on_membership(),
  private.financial_approval_eligible_approvers(uuid, text),
  private.financial_approvals_page(uuid, text, text, integer),
  private.financial_approval_request_manual_payment(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid, uuid, bigint, date, text, text, text),
  private.financial_approval_request_discount(uuid, uuid, integer, uuid, uuid, text, bigint, numeric, text, text),
  private.financial_approval_decide(uuid, uuid, text, integer, text, text),
  private.financial_approval_execute_manual_payment(uuid, uuid, uuid, integer, text),
  public.financial_approval_eligible_approvers(uuid, text),
  public.financial_approvals_page(uuid, text, text, integer),
  public.financial_approval_request_manual_payment(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid, uuid, bigint, date, text, text, text),
  public.financial_approval_request_discount(uuid, uuid, integer, uuid, uuid, text, bigint, numeric, text, text),
  public.financial_approval_decide(uuid, uuid, text, integer, text, text),
  public.financial_approval_execute_manual_payment(uuid, uuid, uuid, integer, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  private.financial_approval_eligible_approvers(uuid, text),
  private.financial_approvals_page(uuid, text, text, integer),
  private.financial_approval_request_manual_payment(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid, uuid, bigint, date, text, text, text),
  private.financial_approval_request_discount(uuid, uuid, integer, uuid, uuid, text, bigint, numeric, text, text),
  private.financial_approval_decide(uuid, uuid, text, integer, text, text),
  private.financial_approval_execute_manual_payment(uuid, uuid, uuid, integer, text),
  public.financial_approval_eligible_approvers(uuid, text),
  public.financial_approvals_page(uuid, text, text, integer),
  public.financial_approval_request_manual_payment(uuid, uuid, integer, uuid, uuid, uuid, uuid, uuid, uuid, bigint, date, text, text, text),
  public.financial_approval_request_discount(uuid, uuid, integer, uuid, uuid, text, bigint, numeric, text, text),
  public.financial_approval_decide(uuid, uuid, text, integer, text, text),
  public.financial_approval_execute_manual_payment(uuid, uuid, uuid, integer, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
