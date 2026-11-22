-- Etapas 2, 3 & 6: Payment Providers, Pix/Cards/Terminals Settings, Electronic Checkout Intents,
-- Signed Webhooks Deduplication & Scheduled Maintenance Sweep.
-- Strictly agnostic provider architecture; never stores banking passwords or plaintext secrets.

CREATE TABLE private.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  provider_code text NOT NULL CHECK (provider_code IN ('generic_psp_pix_card', 'generic_pix_bank', 'generic_acquirer_terminal')),
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  institution_label text NOT NULL CHECK (char_length(btrim(institution_label)) BETWEEN 2 AND 120 AND institution_label !~ '[[:cntrl:]]'),
  environment text NOT NULL CHECK (environment IN ('sandbox', 'homologation', 'production')),
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('unconfigured', 'configured', 'validated', 'active', 'disabled', 'error')),
  enabled_methods text[] NOT NULL DEFAULT '{}',
  receiving_account_id uuid,
  financial_unit_id uuid,
  -- Opaque server-side vault/env reference only; reject obvious password or private key material
  credential_ref text CHECK (
    credential_ref IS NULL OR (
      char_length(btrim(credential_ref)) BETWEEN 3 AND 120
      AND credential_ref !~ '[[:cntrl:]]'
      AND credential_ref !~* 'BEGIN (RSA |EC )?PRIVATE KEY'
    )
  ),
  homologated boolean NOT NULL DEFAULT false,
  last_validated_at timestamptz,
  last_sync_at timestamptz,
  last_error_safe text,
  version integer NOT NULL DEFAULT 1 CHECK (version BETWEEN 1 AND 2147483646),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (office_id, id)
);

CREATE TABLE private.payment_pix_settings (
  office_id uuid PRIMARY KEY REFERENCES public.offices(id) ON DELETE RESTRICT,
  provider_id uuid,
  enabled boolean NOT NULL DEFAULT false,
  dynamic_qr_enabled boolean NOT NULL DEFAULT false,
  copy_paste_enabled boolean NOT NULL DEFAULT false,
  expiration_minutes integer NOT NULL DEFAULT 30 CHECK (expiration_minutes BETWEEN 1 AND 10080),
  reconciliation_enabled boolean NOT NULL DEFAULT false,
  refund_enabled boolean NOT NULL DEFAULT false,
  pix_key_masked text,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (office_id, provider_id) REFERENCES private.payment_providers(office_id, id) ON DELETE RESTRICT
);

CREATE TABLE private.payment_online_card_settings (
  office_id uuid PRIMARY KEY REFERENCES public.offices(id) ON DELETE RESTRICT,
  provider_id uuid,
  enabled boolean NOT NULL DEFAULT false,
  credit_enabled boolean NOT NULL DEFAULT false,
  debit_enabled boolean NOT NULL DEFAULT false,
  installments_enabled boolean NOT NULL DEFAULT false,
  max_installments integer NOT NULL DEFAULT 1 CHECK (max_installments BETWEEN 1 AND 12),
  min_installment_cents integer NOT NULL DEFAULT 2000 CHECK (min_installment_cents > 0),
  fee_policy_note text CHECK (fee_policy_note IS NULL OR (char_length(btrim(fee_policy_note)) <= 240 AND fee_policy_note !~ '[[:cntrl:]]')),
  settlement_days_credit integer CHECK (settlement_days_credit IS NULL OR settlement_days_credit BETWEEN 0 AND 180),
  settlement_days_debit integer CHECK (settlement_days_debit IS NULL OR settlement_days_debit BETWEEN 0 AND 60),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (office_id, provider_id) REFERENCES private.payment_providers(office_id, id) ON DELETE RESTRICT
);

CREATE TABLE private.payment_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  provider_id uuid,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 80 AND label !~ '[[:cntrl:]]'),
  manufacturer text NOT NULL CHECK (char_length(btrim(manufacturer)) BETWEEN 2 AND 80 AND manufacturer !~ '[[:cntrl:]]'),
  model text NOT NULL CHECK (char_length(btrim(model)) BETWEEN 2 AND 80 AND model !~ '[[:cntrl:]]'),
  provider_name text NOT NULL CHECK (char_length(btrim(provider_name)) BETWEEN 2 AND 80 AND provider_name !~ '[[:cntrl:]]'),
  serial_masked text,
  connection_mode text NOT NULL CHECK (connection_mode IN ('cloud_api', 'local_agent_connector')),
  supported_protocols text[] NOT NULL DEFAULT ARRAY['cloud_api_v1', 'local_agent_hmac_v1'],
  unit_id uuid,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('active', 'disconnected', 'inactive', 'error')),
  last_heartbeat_at timestamptz,
  last_error_safe text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (office_id, id),
  FOREIGN KEY (office_id, provider_id) REFERENCES private.payment_providers(office_id, id) ON DELETE RESTRICT
);

CREATE TABLE private.payment_checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  charge_id uuid NOT NULL,
  charge_version_snapshot integer NOT NULL CHECK (charge_version_snapshot BETWEEN 1 AND 2147483646),
  provider_id uuid NOT NULL,
  terminal_id uuid,
  initiated_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('portal', 'presencial', 'whatsapp')),
  method text NOT NULL CHECK (method IN ('pix_qr', 'pix_copy_paste', 'credit_card', 'debit_card', 'installments')),
  state text NOT NULL CHECK (state IN (
    'provider_unconfigured', 'ready_to_pay', 'awaiting_payment', 'processing',
    'confirmed', 'partially_received', 'refused', 'cancelled', 'expired',
    'refunded', 'communication_error', 'pending_reconciliation'
  )),
  terminal_state text CHECK (terminal_state IS NULL OR terminal_state IN (
    'waiting_terminal', 'sending_amount', 'waiting_card', 'processing',
    'approved', 'refused', 'cancelled', 'timeout', 'communication_error'
  )),
  settlement_stage text NOT NULL DEFAULT 'none' CHECK (settlement_stage IN ('none', 'authorized', 'captured', 'settled', 'refunded', 'disputed')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  installments_count integer NOT NULL DEFAULT 1 CHECK (installments_count BETWEEN 1 AND 12),
  installment_amount_cents bigint CHECK (installment_amount_cents IS NULL OR installment_amount_cents > 0),
  pix_qr_payload text,
  pix_copy_paste text,
  checkout_url text CHECK (checkout_url IS NULL OR checkout_url ~* '^https://'),
  provider_reference text,
  authorization_code text,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 8 AND 128),
  expires_at timestamptz,
  confirmed_payment_id uuid,
  safe_message text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (office_id, charge_id, idempotency_key),
  FOREIGN KEY (office_id, charge_id) REFERENCES private.charges(office_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (office_id, provider_id) REFERENCES private.payment_providers(office_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (office_id, terminal_id) REFERENCES private.payment_terminals(office_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX payment_checkout_intents_provider_ref_idx
  ON private.payment_checkout_intents(provider_id, provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE INDEX payment_checkout_intents_charge_idx
  ON private.payment_checkout_intents(office_id, charge_id, created_at DESC);

CREATE INDEX payment_checkout_intents_open_expiry_idx
  ON private.payment_checkout_intents(state, expires_at)
  WHERE state = 'awaiting_payment' AND expires_at IS NOT NULL;

CREATE TABLE private.payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL CHECK (char_length(btrim(provider_code)) BETWEEN 2 AND 64),
  office_id uuid,
  event_id text NOT NULL CHECK (char_length(btrim(event_id)) BETWEEN 4 AND 128),
  provider_reference text NOT NULL CHECK (char_length(btrim(provider_reference)) BETWEEN 2 AND 128),
  event_type text NOT NULL CHECK (char_length(btrim(event_type)) BETWEEN 2 AND 64),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean NOT NULL,
  processed_at timestamptz,
  processing_status text NOT NULL CHECK (processing_status IN ('received', 'processed', 'ignored_duplicate', 'failed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (provider_code, event_id)
);

CREATE TABLE private.payment_provider_commands (
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  action text NOT NULL,
  idempotency_key text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (office_id, action, idempotency_key)
);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'payment_providers',
    'payment_pix_settings',
    'payment_online_card_settings',
    'payment_terminals',
    'payment_checkout_intents',
    'payment_webhook_events',
    'payment_provider_commands'
  ] LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
END $$;

-- Internal helper: require owner/admin + settings.access + payments.providers.manage
CREATE FUNCTION private.payment_providers_actor(p_office_id uuid) RETURNS public.memberships
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid;
  m public.memberships;
  caps text[];
BEGIN
  actor := private.team_require_identity();
  SELECT * INTO m
  FROM public.memberships
  WHERE office_id = p_office_id AND user_id = actor AND active
  FOR SHARE;
  IF m.id IS NULL OR m.role_code NOT IN ('owner', 'admin') OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'PROVIDERS_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;
  caps := private.current_permissions(p_office_id);
  IF NOT (caps @> ARRAY['settings.access', 'payments.providers.manage']) THEN
    RAISE EXCEPTION 'PROVIDERS_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;
  RETURN m;
END $$;

-- Internal helper: build full PaymentProvidersState payload
CREATE FUNCTION private.payment_providers_build_state(p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_providers jsonb;
  v_pix jsonb;
  v_cards jsonb;
  v_terminals jsonb;
  v_pending integer;
  v_diag jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'office_id', p.office_id,
      'provider_code', p.provider_code,
      'display_name', p.display_name,
      'institution_label', p.institution_label,
      'environment', p.environment,
      'status', p.status,
      'enabled_methods', to_jsonb(p.enabled_methods),
      'receiving_account_id', p.receiving_account_id,
      'receiving_account_name', fa.name,
      'financial_unit_id', p.financial_unit_id,
      'financial_unit_name', cu.name,
      'credential_ref', p.credential_ref,
      'last_validated_at', p.last_validated_at,
      'last_sync_at', p.last_sync_at,
      'last_error_safe', p.last_error_safe,
      'homologated', p.homologated
    ) ORDER BY p.created_at ASC
  ), '[]'::jsonb) INTO v_providers
  FROM private.payment_providers p
  LEFT JOIN private.cash_units cu ON cu.office_id = p.office_id AND cu.id = p.financial_unit_id
  LEFT JOIN private.financial_accounts fa ON fa.office_id = p.office_id AND fa.id = p.receiving_account_id
  WHERE p.office_id = p_office_id;

  SELECT jsonb_build_object(
    'enabled', s.enabled,
    'provider_id', s.provider_id,
    'dynamic_qr_enabled', s.dynamic_qr_enabled,
    'copy_paste_enabled', s.copy_paste_enabled,
    'expiration_minutes', s.expiration_minutes,
    'reconciliation_enabled', s.reconciliation_enabled,
    'refund_enabled', s.refund_enabled,
    'pix_key_masked', s.pix_key_masked
  ) INTO v_pix
  FROM private.payment_pix_settings s
  WHERE s.office_id = p_office_id;

  SELECT jsonb_build_object(
    'enabled', s.enabled,
    'provider_id', s.provider_id,
    'credit_enabled', s.credit_enabled,
    'debit_enabled', s.debit_enabled,
    'installments_enabled', s.installments_enabled,
    'max_installments', s.max_installments,
    'min_installment_cents', s.min_installment_cents,
    'fee_policy_note', s.fee_policy_note,
    'settlement_days_credit', s.settlement_days_credit,
    'settlement_days_debit', s.settlement_days_debit
  ) INTO v_cards
  FROM private.payment_online_card_settings s
  WHERE s.office_id = p_office_id;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'office_id', t.office_id,
      'provider_id', t.provider_id,
      'label', t.label,
      'manufacturer', t.manufacturer,
      'model', t.model,
      'provider_name', t.provider_name,
      'serial_masked', t.serial_masked,
      'connection_mode', t.connection_mode,
      'supported_protocols', to_jsonb(t.supported_protocols),
      'unit_id', t.unit_id,
      'unit_name', cu.name,
      'status', t.status,
      'last_heartbeat_at', t.last_heartbeat_at,
      'last_error_safe', t.last_error_safe
    ) ORDER BY t.created_at ASC
  ), '[]'::jsonb) INTO v_terminals
  FROM private.payment_terminals t
  LEFT JOIN private.cash_units cu ON cu.office_id = t.office_id AND cu.id = t.unit_id
  WHERE t.office_id = p_office_id;

  SELECT count(*)::integer INTO v_pending
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id
    AND state IN ('processing', 'pending_reconciliation');

  v_diag := jsonb_build_array(
    jsonb_build_object(
      'id', 'providers-db',
      'scope', 'provider',
      'label', 'Cadastro de provedores e contas de recebimento',
      'status', CASE WHEN jsonb_array_length(v_providers) > 0 THEN 'ok' ELSE 'warning' END,
      'message', CASE
        WHEN jsonb_array_length(v_providers) > 0 THEN 'Provedores persistidos com segurança no banco do escritório.'
        ELSE 'Nenhum provedor bancário ou adquirente cadastrado ainda.'
      END,
      'checked_at', clock_timestamp()
    ),
    jsonb_build_object(
      'id', 'reconciliation-queue',
      'scope', 'reconciliation',
      'label', 'Conciliação pendente de transações eletrônicas',
      'status', CASE WHEN v_pending = 0 THEN 'ok' ELSE 'warning' END,
      'message', CASE
        WHEN v_pending = 0 THEN 'Nenhuma transação eletrônica pendente de conciliação.'
        ELSE v_pending::text || ' transação(ões) aguardando conciliação autoritativa.'
      END,
      'checked_at', clock_timestamp()
    )
  );

  RETURN jsonb_build_object(
    'office_id', p_office_id,
    'providers', v_providers,
    'pix', coalesce(v_pix, jsonb_build_object(
      'enabled', false, 'provider_id', NULL, 'dynamic_qr_enabled', false, 'copy_paste_enabled', false,
      'expiration_minutes', 30, 'reconciliation_enabled', false, 'refund_enabled', false, 'pix_key_masked', NULL
    )),
    'online_cards', coalesce(v_cards, jsonb_build_object(
      'enabled', false, 'provider_id', NULL, 'credit_enabled', false, 'debit_enabled', false,
      'installments_enabled', false, 'max_installments', 1, 'min_installment_cents', 2000,
      'fee_policy_note', NULL, 'settlement_days_credit', NULL, 'settlement_days_debit', NULL
    )),
    'terminals', v_terminals,
    'diagnostics', v_diag,
    'pending_reconciliations_count', v_pending
  );
END $$;

-- =========================================================================
-- Etapa 6 RPCs (Payment Providers & Terminals Management)
-- =========================================================================

CREATE FUNCTION private.payment_providers_state(p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.payment_providers_actor(p_office_id);
  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_provider_save(
  p_office_id uuid,
  p_provider_id uuid,
  p_provider_code text,
  p_institution_label text,
  p_environment text,
  p_enabled_methods text[],
  p_receiving_account_id uuid,
  p_financial_unit_id uuid,
  p_credential_ref text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  v_display text;
  v_id uuid;
BEGIN
  m := private.payment_providers_actor(p_office_id);
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  IF EXISTS (
    SELECT 1 FROM private.payment_provider_commands
    WHERE office_id = p_office_id AND action = 'provider_save' AND idempotency_key = btrim(p_idempotency_key)
  ) THEN
    RETURN private.payment_providers_build_state(p_office_id);
  END IF;

  IF p_financial_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.cash_units WHERE office_id = p_office_id AND id = p_financial_unit_id AND active
  ) THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  IF p_receiving_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.financial_accounts
    WHERE office_id = p_office_id AND id = p_receiving_account_id AND active
      AND (p_financial_unit_id IS NULL OR unit_id = p_financial_unit_id)
  ) THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  v_display := CASE p_provider_code
    WHEN 'generic_psp_pix_card' THEN 'PSP Integrado (Pix + Cartões)'
    WHEN 'generic_pix_bank' THEN 'API Bancária Pix Oficial'
    WHEN 'generic_acquirer_terminal' THEN 'Adquirente / Maquininha Integrada'
    ELSE NULL
  END;
  IF v_display IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  IF p_provider_id IS NULL THEN
    INSERT INTO private.payment_providers(
      office_id, provider_code, display_name, institution_label, environment, status,
      enabled_methods, receiving_account_id, financial_unit_id, credential_ref, created_by
    ) VALUES (
      p_office_id, p_provider_code, v_display, btrim(p_institution_label), p_environment, 'configured',
      coalesce(p_enabled_methods, '{}'::text[]), p_receiving_account_id, p_financial_unit_id,
      nullif(btrim(coalesce(p_credential_ref, '')), ''), m.user_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE private.payment_providers
       SET provider_code = p_provider_code,
           display_name = v_display,
           institution_label = btrim(p_institution_label),
           environment = p_environment,
           enabled_methods = coalesce(p_enabled_methods, '{}'::text[]),
           receiving_account_id = p_receiving_account_id,
           financial_unit_id = p_financial_unit_id,
           credential_ref = nullif(btrim(coalesce(p_credential_ref, '')), ''),
           version = version + 1,
           updated_at = clock_timestamp()
     WHERE office_id = p_office_id AND id = p_provider_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'PROVIDER_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
  END IF;

  INSERT INTO private.payment_provider_commands(office_id, action, idempotency_key, actor_id)
  VALUES (p_office_id, 'provider_save', btrim(p_idempotency_key), m.user_id);

  PERFORM private.emit_business_event(
    p_office_id, 'payment_providers.configured', 'payment_provider', v_id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_provider_validate(
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

  -- Honest validation: only marks validated when credential_ref and destination account are bound;
  -- never claims external bank homologation without explicit credential reference.
  IF p.credential_ref IS NULL OR p.receiving_account_id IS NULL THEN
    UPDATE private.payment_providers
       SET status = 'error',
           last_validated_at = clock_timestamp(),
           last_error_safe = 'Informe uma referência de credencial server-side e a conta financeira de destino antes de validar.',
           updated_at = clock_timestamp()
     WHERE id = p.id;
  ELSE
    UPDATE private.payment_providers
       SET status = 'validated',
           last_validated_at = clock_timestamp(),
           last_error_safe = NULL,
           updated_at = clock_timestamp()
     WHERE id = p.id;
  END IF;

  PERFORM private.emit_business_event(
    p_office_id, 'payment_providers.validated', 'payment_provider', p.id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_pix_settings_save(
  p_office_id uuid,
  p_provider_id uuid,
  p_enabled boolean,
  p_dynamic_qr_enabled boolean,
  p_copy_paste_enabled boolean,
  p_expiration_minutes integer,
  p_reconciliation_enabled boolean,
  p_refund_enabled boolean,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
BEGIN
  m := private.payment_providers_actor(p_office_id);
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.payment_provider_commands
    WHERE office_id = p_office_id AND action = 'pix_save' AND idempotency_key = btrim(p_idempotency_key)
  ) THEN
    RETURN private.payment_providers_build_state(p_office_id);
  END IF;

  IF p_provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.payment_providers WHERE office_id = p_office_id AND id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  INSERT INTO private.payment_pix_settings(
    office_id, provider_id, enabled, dynamic_qr_enabled, copy_paste_enabled,
    expiration_minutes, reconciliation_enabled, refund_enabled, updated_by, updated_at
  ) VALUES (
    p_office_id, p_provider_id, p_enabled, p_dynamic_qr_enabled, p_copy_paste_enabled,
    p_expiration_minutes, p_reconciliation_enabled, p_refund_enabled, m.user_id, clock_timestamp()
  )
  ON CONFLICT (office_id) DO UPDATE SET
    provider_id = EXCLUDED.provider_id,
    enabled = EXCLUDED.enabled,
    dynamic_qr_enabled = EXCLUDED.dynamic_qr_enabled,
    copy_paste_enabled = EXCLUDED.copy_paste_enabled,
    expiration_minutes = EXCLUDED.expiration_minutes,
    reconciliation_enabled = EXCLUDED.reconciliation_enabled,
    refund_enabled = EXCLUDED.refund_enabled,
    updated_by = EXCLUDED.updated_by,
    updated_at = clock_timestamp();

  INSERT INTO private.payment_provider_commands(office_id, action, idempotency_key, actor_id)
  VALUES (p_office_id, 'pix_save', btrim(p_idempotency_key), m.user_id);

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_online_cards_save(
  p_office_id uuid,
  p_provider_id uuid,
  p_enabled boolean,
  p_credit_enabled boolean,
  p_debit_enabled boolean,
  p_installments_enabled boolean,
  p_max_installments integer,
  p_min_installment_cents integer,
  p_fee_policy_note text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
BEGIN
  m := private.payment_providers_actor(p_office_id);
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.payment_provider_commands
    WHERE office_id = p_office_id AND action = 'cards_save' AND idempotency_key = btrim(p_idempotency_key)
  ) THEN
    RETURN private.payment_providers_build_state(p_office_id);
  END IF;

  IF p_provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.payment_providers WHERE office_id = p_office_id AND id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  INSERT INTO private.payment_online_card_settings(
    office_id, provider_id, enabled, credit_enabled, debit_enabled,
    installments_enabled, max_installments, min_installment_cents, fee_policy_note, updated_by, updated_at
  ) VALUES (
    p_office_id, p_provider_id, p_enabled, p_credit_enabled, p_debit_enabled,
    p_installments_enabled, p_max_installments, p_min_installment_cents,
    nullif(btrim(coalesce(p_fee_policy_note, '')), ''), m.user_id, clock_timestamp()
  )
  ON CONFLICT (office_id) DO UPDATE SET
    provider_id = EXCLUDED.provider_id,
    enabled = EXCLUDED.enabled,
    credit_enabled = EXCLUDED.credit_enabled,
    debit_enabled = EXCLUDED.debit_enabled,
    installments_enabled = EXCLUDED.installments_enabled,
    max_installments = EXCLUDED.max_installments,
    min_installment_cents = EXCLUDED.min_installment_cents,
    fee_policy_note = EXCLUDED.fee_policy_note,
    updated_by = EXCLUDED.updated_by,
    updated_at = clock_timestamp();

  INSERT INTO private.payment_provider_commands(office_id, action, idempotency_key, actor_id)
  VALUES (p_office_id, 'cards_save', btrim(p_idempotency_key), m.user_id);

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_terminal_save(
  p_office_id uuid,
  p_terminal_id uuid,
  p_provider_id uuid,
  p_label text,
  p_manufacturer text,
  p_model text,
  p_provider_name text,
  p_connection_mode text,
  p_unit_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  v_id uuid;
BEGIN
  m := private.payment_providers_actor(p_office_id);
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  IF EXISTS (
    SELECT 1 FROM private.payment_provider_commands
    WHERE office_id = p_office_id AND action = 'terminal_save' AND idempotency_key = btrim(p_idempotency_key)
  ) THEN
    RETURN private.payment_providers_build_state(p_office_id);
  END IF;

  IF p_provider_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.payment_providers WHERE office_id = p_office_id AND id = p_provider_id
  ) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF p_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM private.cash_units WHERE office_id = p_office_id AND id = p_unit_id AND active
  ) THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  IF p_terminal_id IS NULL THEN
    INSERT INTO private.payment_terminals(
      office_id, provider_id, label, manufacturer, model, provider_name,
      connection_mode, unit_id, status, created_by
    ) VALUES (
      p_office_id, p_provider_id, btrim(p_label), btrim(p_manufacturer), btrim(p_model),
      btrim(p_provider_name), p_connection_mode, p_unit_id, 'disconnected', m.user_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE private.payment_terminals
       SET provider_id = p_provider_id,
           label = btrim(p_label),
           manufacturer = btrim(p_manufacturer),
           model = btrim(p_model),
           provider_name = btrim(p_provider_name),
           connection_mode = p_connection_mode,
           unit_id = p_unit_id,
           updated_at = clock_timestamp()
     WHERE office_id = p_office_id AND id = p_terminal_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
  END IF;

  INSERT INTO private.payment_provider_commands(office_id, action, idempotency_key, actor_id)
  VALUES (p_office_id, 'terminal_save', btrim(p_idempotency_key), m.user_id);

  PERFORM private.emit_business_event(
    p_office_id, 'payment_terminals.configured', 'payment_terminal', v_id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_terminal_test(
  p_office_id uuid,
  p_terminal_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  t private.payment_terminals;
  p private.payment_providers;
BEGIN
  PERFORM private.payment_providers_actor(p_office_id);
  SELECT * INTO t
  FROM private.payment_terminals
  WHERE office_id = p_office_id AND id = p_terminal_id
  FOR UPDATE;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  IF t.provider_id IS NOT NULL THEN
    SELECT * INTO p FROM private.payment_providers WHERE office_id = p_office_id AND id = t.provider_id;
  END IF;

  IF p.id IS NULL OR p.status NOT IN ('validated', 'active') THEN
    UPDATE private.payment_terminals
       SET status = 'disconnected',
           last_error_safe = 'Vincule e valide um provedor de adquirente antes de ativar a maquininha.',
           updated_at = clock_timestamp()
     WHERE id = t.id;
  ELSE
    UPDATE private.payment_terminals
       SET status = 'active',
           last_heartbeat_at = clock_timestamp(),
           last_error_safe = NULL,
           updated_at = clock_timestamp()
     WHERE id = t.id;
  END IF;

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_terminal_deactivate(
  p_office_id uuid,
  p_terminal_id uuid,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  v_id uuid;
BEGIN
  m := private.payment_providers_actor(p_office_id);
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 128 THEN
    RAISE EXCEPTION 'PROVIDER_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  UPDATE private.payment_terminals
     SET status = 'inactive',
         updated_at = clock_timestamp()
   WHERE office_id = p_office_id AND id = p_terminal_id
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE = 'PT404';
  END IF;

  PERFORM private.emit_business_event(
    p_office_id, 'payment_terminals.deactivated', 'payment_terminal', v_id, gen_random_uuid(), '{}'::jsonb
  );

  RETURN private.payment_providers_build_state(p_office_id);
END $$;

-- =========================================================================
-- Etapas 2 & 3 RPCs (Client Checkout & Staff Electronic Collection)
-- =========================================================================

CREATE FUNCTION private.payment_intent_json(i private.payment_checkout_intents) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', i.id,
    'charge_id', i.charge_id,
    'office_id', i.office_id,
    'method', i.method,
    'state', CASE
      WHEN i.state = 'awaiting_payment' AND i.expires_at IS NOT NULL AND i.expires_at <= clock_timestamp() THEN 'expired'
      ELSE i.state
    END,
    'amount_cents', i.amount_cents,
    'installments_count', i.installments_count,
    'installment_amount_cents', i.installment_amount_cents,
    'provider_label', (SELECT p.institution_label FROM private.payment_providers p WHERE p.office_id = i.office_id AND p.id = i.provider_id),
    'pix_qr_payload', i.pix_qr_payload,
    'pix_copy_paste', i.pix_copy_paste,
    'expires_at', i.expires_at,
    'checkout_url', i.checkout_url,
    'terminal_id', i.terminal_id,
    'terminal_state', i.terminal_state,
    'settlement_stage', i.settlement_stage,
    'authorization_code', i.authorization_code,
    'provider_reference', i.provider_reference,
    'safe_message', i.safe_message,
    'updated_at', i.updated_at
  );
$$;

CREATE FUNCTION private.client_payment_checkout_summary(
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
    WHERE office_id = p_office_id AND id = pix_cfg.provider_id AND status IN ('validated', 'active');
    IF pix_prov.id IS NOT NULL THEN
      IF pix_cfg.dynamic_qr_enabled THEN methods := array_append(methods, 'pix_qr'); END IF;
      IF pix_cfg.copy_paste_enabled THEN methods := array_append(methods, 'pix_copy_paste'); END IF;
    END IF;
  END IF;

  SELECT * INTO card_cfg FROM private.payment_online_card_settings WHERE office_id = p_office_id;
  IF card_cfg.enabled AND card_cfg.provider_id IS NOT NULL THEN
    SELECT * INTO card_prov FROM private.payment_providers
    WHERE office_id = p_office_id AND id = card_cfg.provider_id AND status IN ('validated', 'active');
    IF card_prov.id IS NOT NULL THEN
      IF card_cfg.credit_enabled THEN methods := array_append(methods, 'credit_card'); END IF;
      IF card_cfg.debit_enabled THEN methods := array_append(methods, 'debit_card'); END IF;
      IF card_cfg.installments_enabled AND card_cfg.max_installments > 1 THEN methods := array_append(methods, 'installments'); END IF;
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

CREATE FUNCTION private.payment_checkout_create_intent(
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
  SELECT * INTO existing
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id AND charge_id = p_charge_id AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    RETURN private.payment_intent_json(existing);
  END IF;

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  IF m.id IS NULL OR NOT private.team_user_active(actor, p_office_id) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF m.role_code = 'client' AND private.finance_client_request(r, m) IS NOT TRUE THEN
    RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404';
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
    WHERE office_id = p_office_id AND id = pix_cfg.provider_id AND status IN ('validated', 'active');
    IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;
    v_expires := clock_timestamp() + make_interval(mins => coalesce(pix_cfg.expiration_minutes, 30));
  ELSE
    SELECT * INTO card_cfg FROM private.payment_online_card_settings WHERE office_id = p_office_id;
    IF NOT coalesce(card_cfg.enabled, false) OR card_cfg.provider_id IS NULL THEN
      RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503';
    END IF;
    SELECT * INTO prov FROM private.payment_providers
    WHERE office_id = p_office_id AND id = card_cfg.provider_id AND status IN ('validated', 'active');
    IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;
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

CREATE FUNCTION private.payment_checkout_intent_status(
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

CREATE FUNCTION private.staff_payment_generate_pix(
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
  SELECT * INTO existing
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id AND charge_id = p_charge_id AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    RETURN private.payment_intent_json(existing);
  END IF;

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  caps := private.current_permissions(p_office_id);
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR NOT (caps @> ARRAY['charges.read']) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF private.request_in_scope(r, m) IS NOT TRUE THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR p_amount_cents > amounts.balance_cents THEN
    RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  SELECT * INTO pix_cfg FROM private.payment_pix_settings WHERE office_id = p_office_id;
  IF NOT coalesce(pix_cfg.enabled, false) OR pix_cfg.provider_id IS NULL THEN
    RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503';
  END IF;
  SELECT * INTO prov FROM private.payment_providers
  WHERE office_id = p_office_id AND id = pix_cfg.provider_id AND status IN ('validated', 'active');
  IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;

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

CREATE FUNCTION private.staff_payment_start_terminal(
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
  SELECT * INTO existing
  FROM private.payment_checkout_intents
  WHERE office_id = p_office_id AND charge_id = p_charge_id AND idempotency_key = btrim(p_idempotency_key);
  IF existing.id IS NOT NULL THEN
    RETURN private.payment_intent_json(existing);
  END IF;

  SELECT * INTO m FROM public.memberships WHERE office_id = p_office_id AND user_id = actor AND active;
  caps := private.current_permissions(p_office_id);
  IF m.id IS NULL OR m.role_code = 'client' OR NOT private.team_user_active(actor, p_office_id)
     OR NOT (caps @> ARRAY['charges.read']) THEN
    RAISE EXCEPTION 'CHECKOUT_FORBIDDEN' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO t FROM private.payment_terminals
  WHERE office_id = p_office_id AND id = p_terminal_id AND status = 'active';
  IF t.id IS NULL THEN RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO prov FROM private.payment_providers
  WHERE office_id = p_office_id AND id = t.provider_id AND status IN ('validated', 'active');
  IF prov.id IS NULL THEN RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE = 'PT503'; END IF;

  SELECT * INTO c FROM private.charges WHERE office_id = p_office_id AND id = p_charge_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = c.request_id;
  IF private.request_in_scope(r, m) IS NOT TRUE THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE = 'PT404'; END IF;
  SELECT * INTO amounts FROM private.charges_amounts(p_office_id, p_charge_id);
  IF amounts.cancelled OR amounts.version <> p_expected_charge_version OR p_amount_cents > amounts.balance_cents THEN
    RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE = 'PT409';
  END IF;

  v_method := CASE p_sale_mode
    WHEN 'debit' THEN 'debit_card'
    WHEN 'credit_installment' THEN 'installments'
    ELSE 'credit_card'
  END;
  IF p_installments_count > 1 THEN
    v_inst_cents := ceil(p_amount_cents::numeric / p_installments_count)::bigint;
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

-- =========================================================================
-- Service-role only server automation RPCs (Signed Webhook Ingest & Cron)
-- =========================================================================

CREATE FUNCTION private.payment_webhook_ingest(
  p_provider_code text,
  p_event_id text,
  p_provider_reference text,
  p_event_type text,
  p_payload_sha256 text,
  p_amount_cents bigint DEFAULT NULL,
  p_authorization_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_event private.payment_webhook_events;
  v_intent private.payment_checkout_intents;
  v_new_state text;
  v_new_stage text;
  v_new_terminal text;
BEGIN
  IF p_provider_code IS NULL OR p_event_id IS NULL OR p_provider_reference IS NULL
     OR p_event_type IS NULL OR p_payload_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CHECKOUT_VALIDATION' USING ERRCODE = 'PT422';
  END IF;

  INSERT INTO private.payment_webhook_events(
    provider_code, event_id, provider_reference, event_type,
    payload_sha256, signature_verified, processing_status
  ) VALUES (
    btrim(p_provider_code), btrim(p_event_id), btrim(p_provider_reference), btrim(p_event_type),
    p_payload_sha256, true, 'received'
  )
  ON CONFLICT (provider_code, event_id) DO NOTHING
  RETURNING * INTO v_event;

  IF v_event.id IS NULL THEN
    RETURN jsonb_build_object('status', 'ignored_duplicate', 'event_id', p_event_id);
  END IF;

  SELECT i.* INTO v_intent
  FROM private.payment_checkout_intents i
  JOIN private.payment_providers p ON p.office_id = i.office_id AND p.id = i.provider_id
  WHERE p.provider_code = btrim(p_provider_code)
    AND i.provider_reference = btrim(p_provider_reference)
  FOR UPDATE OF i;

  IF v_intent.id IS NULL THEN
    UPDATE private.payment_webhook_events
       SET processing_status = 'failed', processed_at = clock_timestamp()
     WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'unmatched_reference', 'event_id', p_event_id);
  END IF;

  -- Never trust a declared amount that disagrees with the official intention/charge.
  IF p_amount_cents IS NOT NULL AND p_amount_cents <> v_intent.amount_cents THEN
    UPDATE private.payment_webhook_events
       SET office_id = v_intent.office_id,
           processing_status = 'failed',
           processed_at = clock_timestamp()
     WHERE id = v_event.id;
    RETURN jsonb_build_object('status', 'amount_mismatch', 'event_id', p_event_id, 'intent_id', v_intent.id);
  END IF;

  -- The provider confirms that money exists, but the official financial ledger of the office only
  -- recognises a payment through an authorized cash session (never a fictional one). A confirmed
  -- provider event therefore parks the intent at pending_reconciliation, with the settlement stage
  -- reported by the provider kept separate from the office ledger.
  v_new_state := CASE p_event_type
    WHEN 'payment.authorized' THEN 'processing'
    WHEN 'payment.captured' THEN 'pending_reconciliation'
    WHEN 'payment.settled' THEN 'pending_reconciliation'
    WHEN 'payment.confirmed' THEN 'pending_reconciliation'
    WHEN 'payment.refused' THEN 'refused'
    WHEN 'payment.cancelled' THEN 'cancelled'
    WHEN 'payment.expired' THEN 'expired'
    WHEN 'payment.refunded' THEN 'refunded'
    ELSE v_intent.state
  END;

  v_new_stage := CASE p_event_type
    WHEN 'payment.authorized' THEN 'authorized'
    WHEN 'payment.captured' THEN 'captured'
    WHEN 'payment.settled' THEN 'settled'
    WHEN 'payment.confirmed' THEN 'settled'
    WHEN 'payment.refunded' THEN 'refunded'
    WHEN 'payment.disputed' THEN 'disputed'
    ELSE v_intent.settlement_stage
  END;

  v_new_terminal := CASE
    WHEN v_intent.terminal_id IS NULL THEN NULL
    WHEN p_event_type IN ('payment.authorized', 'payment.captured', 'payment.settled', 'payment.confirmed') THEN 'approved'
    WHEN p_event_type = 'payment.refused' THEN 'refused'
    WHEN p_event_type = 'payment.cancelled' THEN 'cancelled'
    WHEN p_event_type = 'payment.expired' THEN 'timeout'
    ELSE v_intent.terminal_state
  END;

  UPDATE private.payment_checkout_intents
     SET state = v_new_state,
         settlement_stage = v_new_stage,
         terminal_state = v_new_terminal,
         authorization_code = coalesce(nullif(btrim(coalesce(p_authorization_code, '')), ''), authorization_code),
         safe_message = CASE
           WHEN v_new_state = 'pending_reconciliation'
             THEN 'Pagamento confirmado pelo provedor e pendente de conciliação com o financeiro oficial do escritório.'
           ELSE safe_message
         END,
         updated_at = clock_timestamp()
   WHERE id = v_intent.id;

  UPDATE private.payment_webhook_events
     SET office_id = v_intent.office_id,
         processing_status = 'processed',
         processed_at = clock_timestamp()
   WHERE id = v_event.id;

  RETURN jsonb_build_object(
    'status', 'processed',
    'event_id', p_event_id,
    'intent_id', v_intent.id,
    'state', v_new_state,
    'settlement_stage', v_new_stage
  );
END $$;

CREATE FUNCTION private.payment_maintenance_sweep() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_expired_intents integer := 0;
  v_expired_approvals integer := 0;
BEGIN
  UPDATE private.payment_checkout_intents
     SET state = 'expired',
         safe_message = 'Prazo de pagamento expirado.',
         updated_at = clock_timestamp()
   WHERE state = 'awaiting_payment'
     AND expires_at IS NOT NULL
     AND expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_expired_intents = ROW_COUNT;

  UPDATE private.financial_approvals
     SET status = 'expired',
         updated_at = clock_timestamp()
   WHERE status IN ('pending', 'approved')
     AND expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_expired_approvals = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_intents', v_expired_intents,
    'expired_approvals', v_expired_approvals,
    'ran_at', clock_timestamp()
  );
END $$;

-- =========================================================================
-- Public SECURITY INVOKER Wrappers (13 authenticated RPCs)
-- =========================================================================

CREATE FUNCTION public.payment_providers_state(p_office_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_providers_state(p_office_id);
$$;

CREATE FUNCTION public.payment_provider_save(
  p_office_id uuid, p_provider_id uuid, p_provider_code text, p_institution_label text,
  p_environment text, p_enabled_methods text[], p_receiving_account_id uuid,
  p_financial_unit_id uuid, p_credential_ref text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_provider_save(
    p_office_id, p_provider_id, p_provider_code, p_institution_label, p_environment,
    p_enabled_methods, p_receiving_account_id, p_financial_unit_id, p_credential_ref, p_idempotency_key
  );
$$;

CREATE FUNCTION public.payment_provider_validate(p_office_id uuid, p_provider_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_provider_validate(p_office_id, p_provider_id);
$$;

CREATE FUNCTION public.payment_pix_settings_save(
  p_office_id uuid, p_provider_id uuid, p_enabled boolean, p_dynamic_qr_enabled boolean,
  p_copy_paste_enabled boolean, p_expiration_minutes integer, p_reconciliation_enabled boolean,
  p_refund_enabled boolean, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_pix_settings_save(
    p_office_id, p_provider_id, p_enabled, p_dynamic_qr_enabled, p_copy_paste_enabled,
    p_expiration_minutes, p_reconciliation_enabled, p_refund_enabled, p_idempotency_key
  );
$$;

CREATE FUNCTION public.payment_online_cards_save(
  p_office_id uuid, p_provider_id uuid, p_enabled boolean, p_credit_enabled boolean,
  p_debit_enabled boolean, p_installments_enabled boolean, p_max_installments integer,
  p_min_installment_cents integer, p_fee_policy_note text, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_online_cards_save(
    p_office_id, p_provider_id, p_enabled, p_credit_enabled, p_debit_enabled,
    p_installments_enabled, p_max_installments, p_min_installment_cents, p_fee_policy_note, p_idempotency_key
  );
$$;

CREATE FUNCTION public.payment_terminal_save(
  p_office_id uuid, p_terminal_id uuid, p_provider_id uuid, p_label text,
  p_manufacturer text, p_model text, p_provider_name text, p_connection_mode text,
  p_unit_id uuid, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_terminal_save(
    p_office_id, p_terminal_id, p_provider_id, p_label, p_manufacturer,
    p_model, p_provider_name, p_connection_mode, p_unit_id, p_idempotency_key
  );
$$;

CREATE FUNCTION public.payment_terminal_test(p_office_id uuid, p_terminal_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_terminal_test(p_office_id, p_terminal_id);
$$;

CREATE FUNCTION public.payment_terminal_deactivate(p_office_id uuid, p_terminal_id uuid, p_idempotency_key text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_terminal_deactivate(p_office_id, p_terminal_id, p_idempotency_key);
$$;

CREATE FUNCTION public.client_payment_checkout_summary(p_office_id uuid, p_charge_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.client_payment_checkout_summary(p_office_id, p_charge_id);
$$;

CREATE FUNCTION public.payment_checkout_create_intent(
  p_office_id uuid, p_charge_id uuid, p_expected_charge_version integer,
  p_method text, p_installments_count integer, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_checkout_create_intent(
    p_office_id, p_charge_id, p_expected_charge_version, p_method, p_installments_count, p_idempotency_key
  );
$$;

CREATE FUNCTION public.payment_checkout_intent_status(p_office_id uuid, p_intent_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_checkout_intent_status(p_office_id, p_intent_id);
$$;

CREATE FUNCTION public.staff_payment_generate_pix(
  p_office_id uuid, p_charge_id uuid, p_expected_charge_version integer,
  p_amount_cents bigint, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.staff_payment_generate_pix(
    p_office_id, p_charge_id, p_expected_charge_version, p_amount_cents, p_idempotency_key
  );
$$;

CREATE FUNCTION public.staff_payment_start_terminal(
  p_office_id uuid, p_charge_id uuid, p_expected_charge_version integer,
  p_terminal_id uuid, p_sale_mode text, p_installments_count integer,
  p_amount_cents bigint, p_idempotency_key text
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.staff_payment_start_terminal(
    p_office_id, p_charge_id, p_expected_charge_version, p_terminal_id,
    p_sale_mode, p_installments_count, p_amount_cents, p_idempotency_key
  );
$$;

-- Public SECURITY INVOKER wrappers granted EXCLUSIVELY to service_role (PostgREST only exposes public)
CREATE FUNCTION public.payment_webhook_ingest(
  p_provider_code text,
  p_event_id text,
  p_provider_reference text,
  p_event_type text,
  p_payload_sha256 text,
  p_amount_cents bigint DEFAULT NULL,
  p_authorization_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_webhook_ingest(
    p_provider_code, p_event_id, p_provider_reference, p_event_type,
    p_payload_sha256, p_amount_cents, p_authorization_code
  );
$$;

CREATE FUNCTION public.payment_maintenance_sweep() RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT private.payment_maintenance_sweep();
$$;

-- Strict ACL: revoke from all, grant only explicit wrappers to authenticated and automation RPCs to service_role
REVOKE ALL ON FUNCTION
  private.payment_providers_actor(uuid),
  private.payment_providers_build_state(uuid),
  private.payment_intent_json(private.payment_checkout_intents),
  private.payment_providers_state(uuid),
  private.payment_provider_save(uuid, uuid, text, text, text, text[], uuid, uuid, text, text),
  private.payment_provider_validate(uuid, uuid),
  private.payment_pix_settings_save(uuid, uuid, boolean, boolean, boolean, integer, boolean, boolean, text),
  private.payment_online_cards_save(uuid, uuid, boolean, boolean, boolean, boolean, integer, integer, text, text),
  private.payment_terminal_save(uuid, uuid, uuid, text, text, text, text, text, uuid, text),
  private.payment_terminal_test(uuid, uuid),
  private.payment_terminal_deactivate(uuid, uuid, text),
  private.client_payment_checkout_summary(uuid, uuid),
  private.payment_checkout_create_intent(uuid, uuid, integer, text, integer, text),
  private.payment_checkout_intent_status(uuid, uuid),
  private.staff_payment_generate_pix(uuid, uuid, integer, bigint, text),
  private.staff_payment_start_terminal(uuid, uuid, integer, uuid, text, integer, bigint, text),
  private.payment_webhook_ingest(text, text, text, text, text, bigint, text),
  private.payment_maintenance_sweep(),
  public.payment_providers_state(uuid),
  public.payment_provider_save(uuid, uuid, text, text, text, text[], uuid, uuid, text, text),
  public.payment_provider_validate(uuid, uuid),
  public.payment_pix_settings_save(uuid, uuid, boolean, boolean, boolean, integer, boolean, boolean, text),
  public.payment_online_cards_save(uuid, uuid, boolean, boolean, boolean, boolean, integer, integer, text, text),
  public.payment_terminal_save(uuid, uuid, uuid, text, text, text, text, text, uuid, text),
  public.payment_terminal_test(uuid, uuid),
  public.payment_terminal_deactivate(uuid, uuid, text),
  public.client_payment_checkout_summary(uuid, uuid),
  public.payment_checkout_create_intent(uuid, uuid, integer, text, integer, text),
  public.payment_checkout_intent_status(uuid, uuid),
  public.staff_payment_generate_pix(uuid, uuid, integer, bigint, text),
  public.staff_payment_start_terminal(uuid, uuid, integer, uuid, text, integer, bigint, text),
  public.payment_webhook_ingest(text, text, text, text, text, bigint, text),
  public.payment_maintenance_sweep()
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  private.payment_providers_state(uuid),
  private.payment_provider_save(uuid, uuid, text, text, text, text[], uuid, uuid, text, text),
  private.payment_provider_validate(uuid, uuid),
  private.payment_pix_settings_save(uuid, uuid, boolean, boolean, boolean, integer, boolean, boolean, text),
  private.payment_online_cards_save(uuid, uuid, boolean, boolean, boolean, boolean, integer, integer, text, text),
  private.payment_terminal_save(uuid, uuid, uuid, text, text, text, text, text, uuid, text),
  private.payment_terminal_test(uuid, uuid),
  private.payment_terminal_deactivate(uuid, uuid, text),
  private.client_payment_checkout_summary(uuid, uuid),
  private.payment_checkout_create_intent(uuid, uuid, integer, text, integer, text),
  private.payment_checkout_intent_status(uuid, uuid),
  private.staff_payment_generate_pix(uuid, uuid, integer, bigint, text),
  private.staff_payment_start_terminal(uuid, uuid, integer, uuid, text, integer, bigint, text),
  public.payment_providers_state(uuid),
  public.payment_provider_save(uuid, uuid, text, text, text, text[], uuid, uuid, text, text),
  public.payment_provider_validate(uuid, uuid),
  public.payment_pix_settings_save(uuid, uuid, boolean, boolean, boolean, integer, boolean, boolean, text),
  public.payment_online_cards_save(uuid, uuid, boolean, boolean, boolean, boolean, integer, integer, text, text),
  public.payment_terminal_save(uuid, uuid, uuid, text, text, text, text, text, uuid, text),
  public.payment_terminal_test(uuid, uuid),
  public.payment_terminal_deactivate(uuid, uuid, text),
  public.client_payment_checkout_summary(uuid, uuid),
  public.payment_checkout_create_intent(uuid, uuid, integer, text, integer, text),
  public.payment_checkout_intent_status(uuid, uuid),
  public.staff_payment_generate_pix(uuid, uuid, integer, bigint, text),
  public.staff_payment_start_terminal(uuid, uuid, integer, uuid, text, integer, bigint, text)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  private.payment_webhook_ingest(text, text, text, text, text, bigint, text),
  private.payment_maintenance_sweep(),
  public.payment_webhook_ingest(text, text, text, text, text, bigint, text),
  public.payment_maintenance_sweep()
TO service_role;

NOTIFY pgrst, 'reload schema';
