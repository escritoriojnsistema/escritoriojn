-- Provider configuration is independent of verification by a deployed adapter.
ALTER TABLE private.payment_providers
  ADD COLUMN verified_version integer,
  ADD COLUMN verified_at timestamptz,
  ADD COLUMN external_account_reference text,
  ADD CONSTRAINT payment_provider_credential_reference CHECK (
    credential_ref IS NULL OR credential_ref ~ '^(vault://[A-Za-z0-9_/-]{1,112}|env:[A-Z][A-Z0-9_]{2,115})$'
  ) NOT VALID,
  ADD CONSTRAINT payment_provider_verified_config CHECK (
    (verified_version IS NULL AND verified_at IS NULL AND external_account_reference IS NULL)
    OR (verified_version IS NOT NULL AND verified_at IS NOT NULL AND external_account_reference IS NOT NULL
      AND char_length(btrim(external_account_reference)) BETWEEN 2 AND 128)
  );

CREATE FUNCTION private.payment_provider_ready(p private.payment_providers)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(
    p.status IN ('configured','validated','active') AND p.verified_version=p.version
    AND p.verified_at IS NOT NULL AND p.external_account_reference IS NOT NULL
    AND p.credential_ref ~ '^(vault://[A-Za-z0-9_/-]{1,112}|env:[A-Z][A-Z0-9_]{2,115})$'
    AND p.receiving_account_id IS NOT NULL
    AND (p.environment<>'production' OR p.homologated)
    AND EXISTS (
      SELECT FROM private.financial_accounts a
      JOIN private.cash_units u ON u.office_id=a.office_id AND u.id=a.unit_id
      WHERE a.office_id=p.office_id AND a.id=p.receiving_account_id
        AND a.unit_id=p.financial_unit_id AND a.active AND u.active AND a.type IN ('bank','digital')
    ),false
  );
$$;

REVOKE ALL ON FUNCTION private.payment_provider_ready(private.payment_providers)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.client_payment_checkout_summary(
  p_office_id uuid,
  p_charge_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  c private.charges;
  r public.requests;
  amounts record;
  pix_cfg private.payment_pix_settings;
  card_cfg private.payment_online_card_settings;
  pix_prov private.payment_providers;
  card_prov private.payment_providers;
  methods text[] := ARRAY[]::text[];
  v_active jsonb := NULL;
  v_recent jsonb := '[]'::jsonb;
  v_installments jsonb := '[]'::jsonb;
  v_service_summary text := '';
  v_discount_cents bigint := 0;
  v_surcharge_cents bigint := 0;
  v_state text := 'provider_unconfigured';
  v_configured boolean := false;
BEGIN
  actor := private.team_require_identity();
  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id;
  IF c.id IS NULL THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF m.role_code = 'client' AND private.finance_client_request(r, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  ELSIF m.role_code <> 'client' AND (
    NOT (private.current_permissions(p_office_id) @> ARRAY['charges.read'])
    OR private.request_in_scope(r, m) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);

  SELECT coalesce(sum(abs(delta_cents)) FILTER (WHERE kind = 'adjusted' AND delta_cents < 0), 0)::bigint,
         coalesce(sum(delta_cents) FILTER (WHERE kind = 'adjusted' AND delta_cents > 0), 0)::bigint
    INTO v_discount_cents, v_surcharge_cents
  FROM private.charge_events
  WHERE office_id = p_office_id AND charge_id = p_charge_id;

  SELECT coalesce(string_agg(coalesce(ci.snapshot->'definition'->>'name', 'Serviço'), ', '), r.title)
    INTO v_service_summary
  FROM private.charge_items ci
  WHERE ci.office_id = p_office_id AND ci.charge_id = p_charge_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'number', inst.number,
      'amount_cents', inst.amount_cents,
      'due_date', to_char(inst.due_date, 'YYYY-MM-DD'),
      'status', CASE WHEN amounts.cancelled THEN 'cancelled' WHEN amounts.balance_cents <= 0 THEN 'paid' ELSE 'open' END
    ) ORDER BY inst.number ASC
  ), '[]'::jsonb) INTO v_installments
  FROM private.charge_installments inst
  WHERE inst.office_id = p_office_id AND inst.charge_id = p_charge_id AND inst.version = amounts.version;

  SELECT * INTO pix_cfg FROM private.payment_pix_settings WHERE office_id = p_office_id;
  IF pix_cfg.enabled AND pix_cfg.provider_id IS NOT NULL THEN
    SELECT * INTO pix_prov FROM private.payment_providers
    WHERE office_id = p_office_id AND id = pix_cfg.provider_id AND private.payment_provider_ready(payment_providers);
    IF pix_prov.id IS NOT NULL THEN
      IF pix_cfg.dynamic_qr_enabled AND 'pix_qr'=ANY(pix_prov.enabled_methods) THEN methods := array_append(methods, 'pix_qr'); END IF;
      IF pix_cfg.copy_paste_enabled AND 'pix_copy_paste'=ANY(pix_prov.enabled_methods) THEN methods := array_append(methods, 'pix_copy_paste'); END IF;
    END IF;
  END IF;

  SELECT * INTO card_cfg FROM private.payment_online_card_settings WHERE office_id = p_office_id;
  IF card_cfg.enabled AND card_cfg.provider_id IS NOT NULL THEN
    SELECT * INTO card_prov FROM private.payment_providers
    WHERE office_id = p_office_id AND id = card_cfg.provider_id AND private.payment_provider_ready(payment_providers);
    IF card_prov.id IS NOT NULL THEN
      IF card_cfg.credit_enabled AND 'credit_card'=ANY(card_prov.enabled_methods) THEN methods := array_append(methods, 'credit_card'); END IF;
      IF card_cfg.debit_enabled AND 'debit_card'=ANY(card_prov.enabled_methods) THEN methods := array_append(methods, 'debit_card'); END IF;
      IF card_cfg.installments_enabled AND card_cfg.max_installments > 1 AND 'installments'=ANY(card_prov.enabled_methods) THEN methods := array_append(methods, 'installments'); END IF;
    END IF;
  END IF;

  v_configured := array_length(methods, 1) IS NOT NULL AND array_length(methods, 1) > 0;

  SELECT private.payment_intent_json(i) INTO v_active
  FROM private.payment_checkout_intents i
  WHERE i.office_id = p_office_id AND i.charge_id = p_charge_id
    AND i.state IN ('awaiting_payment', 'processing', 'pending_reconciliation')
  ORDER BY i.created_at DESC LIMIT 1;

  SELECT coalesce(jsonb_agg(private.payment_intent_json(i) ORDER BY i.created_at DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT * FROM private.payment_checkout_intents
    WHERE office_id = p_office_id AND charge_id = p_charge_id
    ORDER BY created_at DESC LIMIT 5
  ) i;

  IF amounts.cancelled THEN
    v_state := 'cancelled';
  ELSIF amounts.balance_cents <= 0 THEN
    v_state := 'confirmed';
  ELSIF v_active IS NOT NULL THEN
    v_state := v_active->>'state';
  ELSIF amounts.allocated_cents > 0 THEN
    v_state := 'partially_received';
  ELSIF v_configured THEN
    -- shared/paymentCheckout.ts clientPaymentStates uses 'available' for "ready to pay".
    v_state := 'available';
  ELSE
    v_state := 'provider_unconfigured';
  END IF;

  RETURN jsonb_build_object(
    'office_id', p_office_id,
    'charge', jsonb_build_object(
      'charge_id', c.id,
      'request_id', c.request_id,
      'protocol', r.protocol,
      'service_summary', coalesce(v_service_summary, r.title),
      'channel', r.origin,
      'original_cents', coalesce(amounts.original_cents, 0),
      'approved_discount_cents', v_discount_cents,
      'authorized_surcharge_cents', v_surcharge_cents,
      'card_fee_cents', 0,
      'final_cents', coalesce(amounts.due_cents, 0),
      'paid_cents', coalesce(amounts.allocated_cents, 0),
      'balance_cents', greatest(0, coalesce(amounts.balance_cents, 0)),
      'charge_status', CASE WHEN amounts.cancelled THEN 'cancelled' WHEN amounts.balance_cents <= 0 THEN 'paid' ELSE 'open' END,
      'charge_version', coalesce(amounts.version, 1),
      'installments', v_installments,
      'receipt', NULL
    ),
    'payment_state', v_state,
    'provider_configured', v_configured,
    'provider_message', CASE
      WHEN v_configured THEN NULL
      ELSE 'Provedor não configurado ou não validado para este escritório.'
    END,
    'available_methods', to_jsonb(methods),
    'max_installments', coalesce(card_cfg.max_installments, 1),
    'min_installment_cents', coalesce(card_cfg.min_installment_cents, 2000),
    'active_intent', v_active,
    'recent_intents', v_recent
  );
END $$;

CREATE OR REPLACE FUNCTION private.payment_checkout_intent_status(
  p_office_id uuid,
  p_intent_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  i private.payment_checkout_intents;
  c private.charges;
  r public.requests;
BEGIN
  actor := private.team_require_identity();
  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO i FROM private.payment_checkout_intents WHERE office_id = p_office_id AND id = p_intent_id;
  IF i.id IS NULL THEN RAISE EXCEPTION 'INTENT_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = i.charge_id;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF m.role_code = 'client' AND private.finance_client_request(r, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'INTENT_NOT_FOUND' USING ERRCODE = 'PT404';
  ELSIF m.role_code <> 'client' AND (
    NOT (private.current_permissions(p_office_id) && ARRAY['charges.read', 'cash.read'])
    OR private.request_in_scope(r, m) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'INTENT_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  RETURN private.payment_intent_json(i);
END $$;

CREATE OR REPLACE FUNCTION private.payment_checkout_create_intent(
  p_office_id uuid,
  p_charge_id uuid,
  p_expected_charge_version integer,
  p_method text,
  p_installments_count integer,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  c private.charges;
  r public.requests;
  amounts record;
  existing private.payment_checkout_intents;
  pix_cfg private.payment_pix_settings;
  card_cfg private.payment_online_card_settings;
  prov private.payment_providers;
  v_expires timestamptz;
  v_inst_cents bigint := NULL;
  v_out private.payment_checkout_intents;
BEGIN
  actor := private.team_require_identity();
  IF p_method IS NULL OR p_method NOT IN ('pix_qr','pix_copy_paste','credit_card','debit_card','installments')
     OR p_installments_count IS NULL OR p_installments_count NOT BETWEEN 1 AND 12
     OR (p_method <> 'installments' AND p_installments_count <> 1)
     OR p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128
     OR p_expected_charge_version IS NULL THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE = 'PT422';
  END IF;


  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF m.role_code <> 'client' OR private.finance_client_request(r, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  SELECT * INTO existing
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id AND charge_id = p_charge_id AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    IF existing.initiated_by_user_id <> actor OR existing.channel <> 'portal'
       OR existing.method <> p_method OR existing.installments_count <> p_installments_count
       OR existing.charge_version_snapshot <> p_expected_charge_version THEN
      RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    RETURN private.payment_intent_json(existing);
  END IF;

  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR amounts.balance_cents <= 0 THEN
    RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF p_method IN ('pix_qr', 'pix_copy_paste') THEN
    SELECT * INTO pix_cfg FROM private.payment_pix_settings WHERE office_id = p_office_id;
    IF NOT coalesce(pix_cfg.enabled, false) OR pix_cfg.provider_id IS NULL THEN
      RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503';
    END IF;
    SELECT * INTO prov FROM private.payment_providers
    WHERE office_id = p_office_id AND id = pix_cfg.provider_id AND private.payment_provider_ready(payment_providers);
    IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;
    IF (p_method='pix_qr' AND NOT pix_cfg.dynamic_qr_enabled)
       OR (p_method='pix_copy_paste' AND NOT pix_cfg.copy_paste_enabled) THEN
      RAISE EXCEPTION 'METHOD_UNSUPPORTED' USING ERRCODE = 'PT422';
    END IF;
    v_expires := clock_timestamp() + make_interval(mins => coalesce(pix_cfg.expiration_minutes, 30));
  ELSE
    SELECT * INTO card_cfg FROM private.payment_online_card_settings WHERE office_id = p_office_id;
    IF NOT coalesce(card_cfg.enabled, false) OR card_cfg.provider_id IS NULL THEN
      RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503';
    END IF;
    SELECT * INTO prov FROM private.payment_providers
    WHERE office_id = p_office_id AND id = card_cfg.provider_id AND private.payment_provider_ready(payment_providers);
    IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;
    IF (p_method='credit_card' AND NOT card_cfg.credit_enabled)
       OR (p_method='debit_card' AND NOT card_cfg.debit_enabled) THEN
      RAISE EXCEPTION 'METHOD_UNSUPPORTED' USING ERRCODE = 'PT422';
    END IF;
    IF p_method = 'installments' AND (NOT card_cfg.installments_enabled OR p_installments_count > card_cfg.max_installments) THEN
      RAISE EXCEPTION 'METHOD_UNSUPPORTED' USING ERRCODE = 'PT422';
    END IF;
    IF p_installments_count > 1 THEN
      v_inst_cents := ceil(amounts.balance_cents::numeric / p_installments_count)::bigint;
      IF v_inst_cents < card_cfg.min_installment_cents THEN
        RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE = 'PT422';
      END IF;
    END IF;
    v_expires := clock_timestamp() + interval '30 minutes';
  END IF;

  IF NOT (p_method = ANY(prov.enabled_methods)) THEN
    RAISE EXCEPTION 'METHOD_UNSUPPORTED' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT FROM private.payment_checkout_intents pending
    WHERE pending.office_id=p_office_id AND pending.charge_id=p_charge_id
      AND pending.state IN ('processing','pending_reconciliation','awaiting_payment')
      AND (pending.state<>'awaiting_payment' OR pending.expires_at>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO private.payment_checkout_intents(
    office_id, charge_id, charge_version_snapshot, provider_id, initiated_by_user_id,
    channel, method, state, settlement_stage, amount_cents, installments_count,
    installment_amount_cents, idempotency_key, expires_at, safe_message
  ) VALUES (
    p_office_id, p_charge_id, amounts.version, prov.id, actor,
    'portal', p_method, 'awaiting_payment', 'none', amounts.balance_cents,
    p_installments_count, v_inst_cents, btrim(p_idempotency_key), v_expires,
    'Intenção registrada aguardando emissão e confirmação autoritativa do provedor configurado.'
  )
  RETURNING * INTO v_out;

  RETURN private.payment_intent_json(v_out);
END $$;

CREATE OR REPLACE FUNCTION private.staff_payment_generate_pix(
  p_office_id uuid,
  p_charge_id uuid,
  p_expected_charge_version integer,
  p_amount_cents bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
  existing private.payment_checkout_intents;
  c private.charges;
  r public.requests;
  amounts record;
  pix_cfg private.payment_pix_settings;
  prov private.payment_providers;
  v_out private.payment_checkout_intents;
BEGIN
  actor := private.team_require_identity();
  IF p_charge_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0
     OR p_expected_charge_version IS NULL OR p_idempotency_key IS NULL
     OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
  END IF;

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  caps := private.current_permissions(p_office_id);
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR NOT (caps @> ARRAY['charges.read','cash.open']) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF private.request_can_work(r, m) IS NOT TRUE THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO existing
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id AND charge_id = p_charge_id AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    IF existing.initiated_by_user_id <> actor OR existing.channel = 'portal'
       OR existing.amount_cents <> p_amount_cents OR existing.charge_version_snapshot <> p_expected_charge_version OR existing.terminal_id IS NOT NULL THEN
      RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    RETURN private.payment_intent_json(existing);
  END IF;

  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR p_amount_cents > amounts.balance_cents THEN
    RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO pix_cfg FROM private.payment_pix_settings WHERE office_id = p_office_id;
  IF NOT coalesce(pix_cfg.enabled AND pix_cfg.dynamic_qr_enabled, false) OR pix_cfg.provider_id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503';
  END IF;
  SELECT * INTO prov FROM private.payment_providers
  WHERE office_id = p_office_id AND id = pix_cfg.provider_id AND private.payment_provider_ready(payment_providers);
  IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;

  IF NOT ('pix_qr' = ANY(prov.enabled_methods)) THEN
    RAISE EXCEPTION 'METHOD_UNSUPPORTED' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT FROM private.payment_checkout_intents pending
    WHERE pending.office_id=p_office_id AND pending.charge_id=p_charge_id
      AND pending.state IN ('processing','pending_reconciliation','awaiting_payment')
      AND (pending.state<>'awaiting_payment' OR pending.expires_at>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO private.payment_checkout_intents(
    office_id, charge_id, charge_version_snapshot, provider_id, initiated_by_user_id,
    channel, method, state, settlement_stage, amount_cents, installments_count,
    idempotency_key, expires_at, safe_message
  ) VALUES (
    p_office_id, p_charge_id, amounts.version, prov.id, actor,
    'whatsapp', 'pix_qr', 'awaiting_payment', 'none', p_amount_cents, 1,
    btrim(p_idempotency_key),
    clock_timestamp() + make_interval(mins => coalesce(pix_cfg.expiration_minutes, 30)),
    'Cobrança Pix registrada e vinculada à cobrança oficial. Aguardando payload/confirmação do provedor.'
  )
  RETURNING * INTO v_out;

  RETURN private.payment_intent_json(v_out);
END $$;

CREATE OR REPLACE FUNCTION private.staff_payment_start_terminal(
  p_office_id uuid,
  p_charge_id uuid,
  p_expected_charge_version integer,
  p_terminal_id uuid,
  p_sale_mode text,
  p_installments_count integer,
  p_amount_cents bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
  existing private.payment_checkout_intents;
  c private.charges;
  r public.requests;
  t private.payment_terminals;
  prov private.payment_providers;
  amounts record;
  v_method text;
  v_inst_cents bigint := NULL;
  v_out private.payment_checkout_intents;
BEGIN
  actor := private.team_require_identity();
  IF p_charge_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0
     OR p_expected_charge_version IS NULL OR p_idempotency_key IS NULL
     OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
  END IF;

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  caps := private.current_permissions(p_office_id);
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR NOT (caps @> ARRAY['charges.read','cash.open']) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  IF p_terminal_id IS NULL OR p_sale_mode IS NULL
     OR p_sale_mode NOT IN ('debit','credit_cash','credit_installment')
     OR p_installments_count IS NULL OR p_installments_count NOT BETWEEN 1 AND 12
     OR (p_sale_mode = 'credit_installment') IS DISTINCT FROM (p_installments_count > 1) THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
  END IF;
  v_method := CASE p_sale_mode
    WHEN 'debit' THEN 'debit_card'
    WHEN 'credit_installment' THEN 'installments'
    ELSE 'credit_card'
  END;

  SELECT * INTO t FROM private.payment_terminals
  WHERE office_id = p_office_id AND id = p_terminal_id AND status = 'active'
    AND last_heartbeat_at > clock_timestamp()-interval '5 minutes'
  FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO prov FROM private.payment_providers
  WHERE office_id = p_office_id AND id = t.provider_id AND private.payment_provider_ready(payment_providers);
  IF prov.id IS NULL OR t.unit_id IS DISTINCT FROM prov.financial_unit_id THEN
    RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503';
  END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF private.request_can_work(r, m) IS NOT TRUE THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO existing
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id AND charge_id = p_charge_id AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    IF existing.initiated_by_user_id <> actor OR existing.channel = 'portal'
       OR existing.amount_cents <> p_amount_cents OR existing.charge_version_snapshot <> p_expected_charge_version OR existing.terminal_id IS DISTINCT FROM p_terminal_id
       OR existing.method<>v_method OR existing.installments_count<>p_installments_count THEN
      RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
    END IF;
    RETURN private.payment_intent_json(existing);
  END IF;

  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR p_amount_cents > amounts.balance_cents THEN
    RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF p_installments_count > 1 THEN
    v_inst_cents := ceil(p_amount_cents::numeric / p_installments_count)::bigint;
  END IF;

  IF NOT (v_method = ANY(prov.enabled_methods)) THEN
    RAISE EXCEPTION 'METHOD_UNSUPPORTED' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT FROM private.payment_checkout_intents pending
    WHERE pending.office_id=p_office_id AND pending.charge_id=p_charge_id
      AND pending.state IN ('processing','pending_reconciliation','awaiting_payment')
      AND (pending.state<>'awaiting_payment' OR pending.expires_at>clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  IF EXISTS (
    SELECT FROM private.payment_checkout_intents busy
    WHERE busy.office_id=p_office_id AND busy.terminal_id=t.id
      AND busy.state IN ('processing','pending_reconciliation','awaiting_payment')
  ) THEN
    RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO private.payment_checkout_intents(
    office_id, charge_id, charge_version_snapshot, provider_id, terminal_id, initiated_by_user_id,
    channel, method, state, terminal_state, settlement_stage, amount_cents, installments_count,
    installment_amount_cents, idempotency_key, expires_at, safe_message
  ) VALUES (
    p_office_id, p_charge_id, amounts.version, prov.id, t.id, actor,
    'presencial', v_method, 'processing', 'waiting_terminal', 'none', p_amount_cents,
    p_installments_count, v_inst_cents, btrim(p_idempotency_key),
    clock_timestamp() + interval '5 minutes',
    'Valor enviado para a maquininha. Aguardando retorno autoritativo do terminal.'
  )
  RETURNING * INTO v_out;

  RETURN private.payment_intent_json(v_out);
END $$;

CREATE OR REPLACE FUNCTION private.payment_provider_validate(
  p_office_id uuid,
  p_provider_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  p private.payment_providers;
BEGIN
  m := private.payment_providers_actor(p_office_id);
  SELECT * INTO p
  FROM private.payment_providers
  WHERE office_id = p_office_id AND id = p_provider_id
  FOR UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  -- This human RPC checks configuration. Connection verification belongs to the deployed adapter.
  IF p.credential_ref IS NULL OR p.receiving_account_id IS NULL THEN
    UPDATE private.payment_providers
       SET status = 'error',
           last_validated_at = clock_timestamp(),
           last_error_safe = 'Informe uma referência de credencial server-side e a conta financeira de destino antes de validar.',
           updated_at = clock_timestamp()
     WHERE id = p.id;
  ELSE
    UPDATE private.payment_providers
       SET status = CASE WHEN private.payment_provider_ready(p) THEN 'active' ELSE 'configured' END,
           last_validated_at = clock_timestamp(),
           last_error_safe = CASE WHEN private.payment_provider_ready(p) THEN NULL
             ELSE 'Configuração local conferida. Aguardando homologação do adaptador.' END,
           updated_at = clock_timestamp()
     WHERE id = p.id;
  END IF;

  PERFORM private.emit_business_event(
    p_office_id, 'payment_providers.validated', 'payment_provider', p.id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE OR REPLACE FUNCTION private.payment_terminal_test(
  p_office_id uuid,
  p_terminal_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t private.payment_terminals;
BEGIN
  PERFORM private.payment_providers_actor(p_office_id);
  SELECT * INTO t
  FROM private.payment_terminals
  WHERE office_id = p_office_id AND id = p_terminal_id
  FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
END $$;

CREATE OR REPLACE FUNCTION private.payment_webhook_ingest(
  p_provider_code text,
  p_event_id text,
  p_provider_reference text,
  p_event_type text,
  p_payload_sha256 text,
  p_amount_cents bigint DEFAULT NULL,
  p_authorization_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- The legacy envelope does not identify the provider connection, environment or account.
  RAISE EXCEPTION 'PROVIDER_UNAVAILABLE' USING ERRCODE = 'PT503';
END $$;

ALTER TABLE private.payment_webhook_events
  ADD COLUMN provider_id uuid,
  ADD COLUMN environment text CHECK (environment IN ('sandbox','homologation','production')),
  ADD COLUMN transaction_reference text,
  ADD COLUMN reported_amount_cents bigint CHECK (reported_amount_cents>0),
  ADD COLUMN currency text CHECK (currency='BRL'),
  ADD COLUMN occurred_at timestamptz,
  ADD COLUMN processing_code text,
  ADD CONSTRAINT payment_webhook_provider_fk FOREIGN KEY (office_id,provider_id)
    REFERENCES private.payment_providers(office_id,id) ON DELETE RESTRICT,
  DROP CONSTRAINT payment_webhook_events_provider_code_event_id_key;

CREATE UNIQUE INDEX payment_webhook_legacy_dedup
  ON private.payment_webhook_events(provider_code,event_id) WHERE provider_id IS NULL;
CREATE UNIQUE INDEX payment_webhook_provider_dedup
  ON private.payment_webhook_events(office_id,provider_id,environment,event_id) WHERE provider_id IS NOT NULL;

ALTER TABLE private.payment_checkout_intents
  ADD COLUMN transaction_reference text,
  ADD COLUMN last_provider_event_at timestamptz,
  ADD COLUMN provider_environment text,
  ADD COLUMN provider_version integer,
  ADD COLUMN receiving_account_reference text,
  ADD COLUMN receiving_unit_id uuid,
  ADD COLUMN receiving_account_id uuid,
  ADD CONSTRAINT payment_checkout_receiving_account FOREIGN KEY (office_id,receiving_unit_id,receiving_account_id)
    REFERENCES private.financial_accounts(office_id,unit_id,id) ON DELETE RESTRICT;

CREATE INDEX payment_checkout_receiving_account_idx
  ON private.payment_checkout_intents(office_id,receiving_unit_id,receiving_account_id)
  WHERE receiving_account_id IS NOT NULL;

CREATE FUNCTION private.payment_checkout_provider_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  provider private.payment_providers;
BEGIN
  SELECT * INTO provider FROM private.payment_providers
  WHERE office_id=NEW.office_id AND id=NEW.provider_id FOR SHARE;
  IF NOT FOUND OR NOT private.payment_provider_ready(provider) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE='PT503';
  END IF;
  NEW.provider_environment := provider.environment;
  NEW.provider_version := provider.version;
  NEW.receiving_account_reference := provider.external_account_reference;
  NEW.receiving_unit_id := provider.financial_unit_id;
  NEW.receiving_account_id := provider.receiving_account_id;
  RETURN NEW;
END $$;

CREATE TRIGGER payment_checkout_provider_snapshot BEFORE INSERT ON private.payment_checkout_intents
FOR EACH ROW EXECUTE FUNCTION private.payment_checkout_provider_snapshot();

REVOKE ALL ON FUNCTION private.payment_checkout_provider_snapshot() FROM PUBLIC,anon,authenticated,service_role;

CREATE UNIQUE INDEX payment_checkout_external_transaction
  ON private.payment_checkout_intents(office_id,provider_id,transaction_reference)
  WHERE transaction_reference IS NOT NULL;

-- Only a trusted server adapter calls this RPC, after authenticating the
-- native protocol and mapping the verified account to the named connection.
-- It retains normalized evidence and never creates an official receipt/payment.
CREATE FUNCTION private.payment_webhook_record(
  p_office_id uuid, p_provider_id uuid, p_environment text, p_receiver text,
  p_event_id text, p_intent_reference text, p_transaction_reference text,
  p_event_type text, p_amount_cents bigint, p_currency text,
  p_occurred_at timestamptz, p_payload_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  provider private.payment_providers;
  intent private.payment_checkout_intents;
  event private.payment_webhook_events;
  code text := 'processed';
  incoming_stage text;
  incoming_state text;
BEGIN
  IF p_office_id IS NULL OR p_provider_id IS NULL OR p_environment IS NULL
     OR p_receiver IS NULL OR p_event_id IS NULL OR p_intent_reference IS NULL
     OR p_transaction_reference IS NULL OR p_event_type IS NULL
     OR p_amount_cents IS NULL OR p_amount_cents<=0 OR p_currency IS DISTINCT FROM 'BRL'
     OR p_occurred_at IS NULL OR NOT isfinite(p_occurred_at)
     OR p_occurred_at>clock_timestamp()+interval '5 minutes'
     OR p_payload_sha256 IS NULL OR p_payload_sha256!~'^[0-9a-f]{64}$'
     OR p_event_id !~ '^[A-Za-z0-9_.:-]{4,128}$'
     OR p_intent_reference !~ '^[A-Za-z0-9_.:-]{2,128}$'
     OR p_transaction_reference !~ '^[A-Za-z0-9_.:-]{2,128}$' THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
  END IF;

  SELECT * INTO provider FROM private.payment_providers
  WHERE office_id=p_office_id AND id=p_provider_id AND environment=p_environment
    AND external_account_reference=p_receiver FOR UPDATE;
  IF NOT FOUND OR NOT private.payment_provider_ready(provider) THEN
    RAISE EXCEPTION 'PROVIDER_UNAVAILABLE' USING ERRCODE='PT503';
  END IF;

  INSERT INTO private.payment_webhook_events(
    provider_code,office_id,provider_id,environment,event_id,provider_reference,event_type,
    transaction_reference,reported_amount_cents,currency,occurred_at,payload_sha256,
    signature_verified,processing_status
  ) VALUES (
    provider.provider_code,p_office_id,p_provider_id,p_environment,p_event_id,p_intent_reference,p_event_type,
    p_transaction_reference,p_amount_cents,p_currency,p_occurred_at,p_payload_sha256,true,'received'
  ) ON CONFLICT (office_id,provider_id,environment,event_id) WHERE provider_id IS NOT NULL DO NOTHING
  RETURNING * INTO event;

  IF NOT FOUND THEN
    SELECT * INTO STRICT event FROM private.payment_webhook_events
    WHERE office_id=p_office_id AND provider_id=p_provider_id AND environment=p_environment AND event_id=p_event_id;
    IF event.payload_sha256<>p_payload_sha256 OR event.provider_reference<>p_intent_reference
       OR event.transaction_reference<>p_transaction_reference OR event.event_type<>p_event_type
       OR event.reported_amount_cents<>p_amount_cents OR event.occurred_at<>p_occurred_at THEN
      RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE='PT409';
    END IF;
    IF event.processing_code IS DISTINCT FROM 'unmatched_reference' THEN
      RETURN jsonb_build_object('status','ignored_duplicate','event_id',p_event_id);
    END IF;
  END IF;

  SELECT * INTO intent FROM private.payment_checkout_intents
  WHERE office_id=p_office_id AND provider_id=p_provider_id AND provider_reference=p_intent_reference
    AND provider_environment=p_environment AND provider_version=provider.version
    AND receiving_account_reference=p_receiver AND receiving_account_id=provider.receiving_account_id
  FOR UPDATE;

  IF NOT FOUND THEN code := 'unmatched_reference';
  ELSIF (intent.transaction_reference IS NOT NULL AND intent.transaction_reference<>p_transaction_reference)
     OR EXISTS (
       SELECT FROM private.payment_checkout_intents i WHERE i.office_id=p_office_id AND i.provider_id=p_provider_id
         AND i.transaction_reference=p_transaction_reference AND i.id<>intent.id
     ) THEN code := 'transaction_mismatch';
  ELSIF p_event_type IN ('payment.refunded','payment.disputed') THEN code := 'review_reversal';
  ELSIF p_amount_cents<>intent.amount_cents THEN
    code := CASE WHEN p_amount_cents<intent.amount_cents THEN 'partial_amount' ELSE 'excess_amount' END;
  ELSE
    CASE p_event_type
      WHEN 'payment.authorized' THEN
        IF intent.method NOT IN ('pix_qr','pix_copy_paste') AND intent.settlement_stage='none'
           AND intent.state IN ('awaiting_payment','processing') THEN
          incoming_stage := 'authorized';
          incoming_state := 'processing';
        END IF;
      WHEN 'payment.captured' THEN
        IF intent.method NOT IN ('pix_qr','pix_copy_paste') AND intent.settlement_stage IN ('none','authorized') THEN
          incoming_stage := 'captured';
          incoming_state := 'pending_reconciliation';
        END IF;
      WHEN 'payment.confirmed' THEN
        IF intent.method IN ('pix_qr','pix_copy_paste') AND intent.settlement_stage='none' THEN
          incoming_stage := 'settled';
          incoming_state := 'pending_reconciliation';
        END IF;
      WHEN 'payment.settled' THEN
        IF intent.settlement_stage IN ('none','authorized','captured') THEN
          incoming_stage := 'settled';
          incoming_state := 'pending_reconciliation';
        END IF;
      ELSE code := 'review_event';
    END CASE;

    IF incoming_state IS NULL THEN
      IF code='processed' THEN code := 'ignored_transition'; END IF;
    ELSE
      IF incoming_state='pending_reconciliation' AND intent.expires_at<=p_occurred_at THEN code := 'late_payment'; END IF;
      UPDATE private.payment_checkout_intents
      SET state=CASE WHEN confirmed_payment_id IS NULL THEN incoming_state ELSE state END,
          settlement_stage=incoming_stage, transaction_reference=p_transaction_reference,
          last_provider_event_at=greatest(last_provider_event_at,p_occurred_at),
          safe_message=CASE WHEN incoming_state='pending_reconciliation'
                            THEN 'Evidência externa registrada. Aguardando conciliação com o financeiro oficial.'
                            ELSE safe_message END,
          updated_at=clock_timestamp()
      WHERE id=intent.id RETURNING * INTO intent;
    END IF;
  END IF;

  UPDATE private.payment_webhook_events
  SET processing_status=CASE WHEN code IN ('processed','late_payment','ignored_transition') THEN 'processed' ELSE 'failed' END,
      processing_code=code, processed_at=clock_timestamp()
  WHERE id=event.id;

  RETURN jsonb_build_object('status',code,'event_id',p_event_id,'intent_id',intent.id,
    'state',intent.state,'settlement_stage',intent.settlement_stage);
END $$;

CREATE FUNCTION public.payment_webhook_record(
  p_office_id uuid, p_provider_id uuid, p_environment text, p_receiver text,
  p_event_id text, p_intent_reference text, p_transaction_reference text,
  p_event_type text, p_amount_cents bigint, p_currency text,
  p_occurred_at timestamptz, p_payload_sha256 text
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_webhook_record(
    p_office_id,p_provider_id,p_environment,p_receiver,p_event_id,p_intent_reference,
    p_transaction_reference,p_event_type,p_amount_cents,p_currency,p_occurred_at,p_payload_sha256
  );
$$;

REVOKE ALL ON FUNCTION
  private.payment_webhook_record(uuid,uuid,text,text,text,text,text,text,bigint,text,timestamptz,text),
  public.payment_webhook_record(uuid,uuid,text,text,text,text,text,text,bigint,text,timestamptz,text)
FROM PUBLIC,anon,authenticated,service_role;
-- The qualified adapter identity and its grant are provisioned during provider onboarding.

NOTIFY pgrst,'reload schema';

-- Called by a future provider adapter after a successful, authenticated issuer
-- response. Access remains unprovisioned until the office, provider and runtime
-- identity are selected. QR payload and hosted URL are mutually exclusive.
CREATE FUNCTION private.payment_checkout_bind_provider(
  p_office_id uuid, p_provider_id uuid, p_environment text, p_intent_id uuid,
  p_reference text, p_pix_payload text DEFAULT NULL, p_checkout_url text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  provider private.payment_providers;
  intent private.payment_checkout_intents;
BEGIN
  IF p_office_id IS NULL OR p_provider_id IS NULL OR p_intent_id IS NULL OR p_environment IS NULL
     OR p_reference IS NULL OR p_reference !~ '^[A-Za-z0-9_.:-]{2,128}$'
     OR (p_pix_payload IS NOT NULL AND (length(p_pix_payload) NOT BETWEEN 1 AND 2048 OR p_pix_payload ~ '[[:cntrl:]]'))
     OR (p_checkout_url IS NOT NULL AND (length(p_checkout_url)>2048 OR p_checkout_url !~ '^https://[^/@[:space:]]+(/[^[:space:]]*)?$')) THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
  END IF;

  SELECT * INTO provider FROM private.payment_providers
  WHERE office_id=p_office_id AND id=p_provider_id AND environment=p_environment FOR UPDATE;
  IF NOT FOUND OR NOT private.payment_provider_ready(provider) THEN
    RAISE EXCEPTION 'PROVIDER_UNAVAILABLE' USING ERRCODE='PT503';
  END IF;
  SELECT * INTO intent FROM private.payment_checkout_intents
  WHERE office_id=p_office_id AND provider_id=p_provider_id AND id=p_intent_id
    AND provider_environment=p_environment AND provider_version=provider.version
    AND receiving_account_reference=provider.external_account_reference
    AND receiving_account_id=provider.receiving_account_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INTENT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF intent.provider_reference IS NOT NULL THEN
    IF intent.provider_reference IS DISTINCT FROM p_reference
       OR intent.pix_copy_paste IS DISTINCT FROM p_pix_payload
       OR intent.checkout_url IS DISTINCT FROM p_checkout_url THEN
      RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN;
  END IF;

  IF intent.state NOT IN ('awaiting_payment','processing') OR intent.expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE='PT409';
  END IF;
  IF intent.method IN ('pix_qr','pix_copy_paste') THEN
    IF p_pix_payload IS NULL OR p_checkout_url IS NOT NULL THEN
      RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
    END IF;
  ELSIF p_pix_payload IS NOT NULL OR (p_checkout_url IS NULL) IS DISTINCT FROM (intent.terminal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE='PT422';
  END IF;
  UPDATE private.payment_checkout_intents SET provider_reference=p_reference, pix_qr_payload=p_pix_payload,
    pix_copy_paste=p_pix_payload, checkout_url=p_checkout_url, updated_at=clock_timestamp()
  WHERE id=intent.id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'PAYMENT_CONFLICT' USING ERRCODE='PT409';
END $$;
REVOKE ALL ON FUNCTION private.payment_checkout_bind_provider(uuid,uuid,text,uuid,text,text,text)
FROM PUBLIC,anon,authenticated,service_role;
