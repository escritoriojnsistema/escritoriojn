-- Evolution (IA 2) regression suite: RBAC, exclusão definitiva, autorizações financeiras,
-- provedores de pagamento e webhooks. Fixtures descartáveis, criadas e consumidas aqui.
-- Executar contra um banco descartável já migrado (mesmo contrato de tests/database/*.sql).
BEGIN;

CREATE TEMP TABLE evo_ctx (k text PRIMARY KEY, val uuid NOT NULL) ON COMMIT DROP;

-- Fixture base: escritório, quatro vínculos (proprietário, administrador, funcionário, cliente).
INSERT INTO auth.users (id, email, email_confirmed_at, encrypted_password) VALUES
  ('00000000-0000-4000-a000-0000000ee001', 'evo-owner@example.test', now(), 'x'),
  ('00000000-0000-4000-a000-0000000ee002', 'evo-admin@example.test', now(), 'x'),
  ('00000000-0000-4000-a000-0000000ee003', 'evo-employee@example.test', now(), 'x'),
  ('00000000-0000-4000-a000-0000000ee004', 'evo-client@example.test', now(), 'x')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.sessions (id, user_id) VALUES
  ('00000000-0000-4000-c000-0000000ee001', '00000000-0000-4000-a000-0000000ee001'),
  ('00000000-0000-4000-c000-0000000ee002', '00000000-0000-4000-a000-0000000ee002'),
  ('00000000-0000-4000-c000-0000000ee003', '00000000-0000-4000-a000-0000000ee003'),
  ('00000000-0000-4000-c000-0000000ee004', '00000000-0000-4000-a000-0000000ee004')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, display_name) VALUES
  ('00000000-0000-4000-a000-0000000ee001', 'Dono Evo'),
  ('00000000-0000-4000-a000-0000000ee002', 'Admin Evo'),
  ('00000000-0000-4000-a000-0000000ee003', 'Funcionário Evo'),
  ('00000000-0000-4000-a000-0000000ee004', 'Cliente Evo')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.offices (id, name) VALUES ('00000000-0000-4000-e000-0000000ee001', 'Escritório Evo')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.memberships (id, office_id, user_id, role_code) VALUES
  ('00000000-0000-4000-b000-0000000ee001', '00000000-0000-4000-e000-0000000ee001', '00000000-0000-4000-a000-0000000ee001', 'owner'),
  ('00000000-0000-4000-b000-0000000ee002', '00000000-0000-4000-e000-0000000ee001', '00000000-0000-4000-a000-0000000ee002', 'admin'),
  ('00000000-0000-4000-b000-0000000ee003', '00000000-0000-4000-e000-0000000ee001', '00000000-0000-4000-a000-0000000ee003', 'employee'),
  ('00000000-0000-4000-b000-0000000ee004', '00000000-0000-4000-e000-0000000ee001', '00000000-0000-4000-a000-0000000ee004', 'client')
ON CONFLICT (id) DO NOTHING;
INSERT INTO private.team_member_permissions (membership_id, permission_code)
  SELECT '00000000-0000-4000-b000-0000000ee002', unnest(ARRAY['requests.read','charges.read','cash.read','cash.open','requests.delete','payments.manual.approve'])
ON CONFLICT DO NOTHING;
INSERT INTO private.team_member_permissions (membership_id, permission_code)
  SELECT '00000000-0000-4000-b000-0000000ee003', unnest(ARRAY['requests.read','charges.read','cash.read','cash.open'])
ON CONFLICT DO NOTHING;

INSERT INTO evo_ctx VALUES ('category', (
  SELECT id FROM private.service_categories
   WHERE office_id='00000000-0000-4000-e000-0000000ee001' AND system_key IS NULL
   ORDER BY name LIMIT 1))
ON CONFLICT (k) DO UPDATE SET val = EXCLUDED.val;

-- EVO-01: as quatro permissões novas existem no catálogo e apenas o proprietário as recebe por papel.
DO $$
DECLARE v_codes text[] := ARRAY['requests.delete','payments.providers.manage','payments.manual.approve','charges.discount.approve'];
BEGIN
  IF (SELECT count(*) FROM public.permissions WHERE code = ANY(v_codes)) <> 4 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-01: catálogo de permissões incompleto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.role_permissions
    WHERE permission_code = ANY(v_codes) AND role_code <> 'owner'
  ) THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-01: permissão nova concedida fora do proprietário';
  END IF;
  IF (SELECT count(*) FROM public.role_permissions WHERE permission_code = ANY(v_codes) AND role_code = 'owner') <> 4 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-01: proprietário sem as permissões novas';
  END IF;
END $$;

-- EVO-02: tabelas novas do schema privado têm RLS e nenhum acesso direto para authenticated/service_role.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'private'
    AND c.relname IN ('request_deletion_operations','financial_approvals','payment_providers',
                      'payment_checkout_intents','payment_webhook_events','payment_terminals',
                      'payment_pix_settings','payment_online_card_settings','payment_provider_commands')
    AND (NOT c.relrowsecurity
         OR has_table_privilege('authenticated', c.oid, 'SELECT')
         OR has_table_privilege('service_role', c.oid, 'SELECT'));
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-02: % tabela(s) privada(s) exposta(s)', v_bad;
  END IF;
END $$;

-- Configuração de caixa pelo proprietário (unidade, conta em espécie e meio de pagamento).
DO $$
DECLARE v_admin text := current_user; v jsonb; v_unit uuid; v_acc uuid; v_method uuid; v_session uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
  PERFORM set_config('role', 'authenticated', true);
  v := public.cash_configure('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('kind','unit','id',null,'expected_version',null,'name','Unidade Evo','active',true), gen_random_uuid());
  v_unit := (v->'resource'->>'id')::uuid;
  v := public.cash_configure('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('kind','account','id',null,'expected_version',null,'name','Espécie Evo','active',true,
      'type','cash','unit_id',v_unit), gen_random_uuid());
  v_acc := (v->'resource'->>'id')::uuid;
  v := public.cash_configure('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('kind','payment_method','id',null,'expected_version',null,'name','Dinheiro Evo','active',true,
      'type','cash','unit_id',v_unit,'destination_account_id',v_acc), gen_random_uuid());
  v_method := (v->'resource'->>'id')::uuid;
  v := public.cash_open('00000000-0000-4000-e000-0000000ee001', v_unit, v_acc, 0, gen_random_uuid());
  v_session := (v->'sessions'->0->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  INSERT INTO evo_ctx VALUES ('unit', v_unit), ('account', v_acc), ('method', v_method), ('session', v_session)
    ON CONFLICT (k) DO UPDATE SET val = EXCLUDED.val;
END $$;

-- EVO-03: exclusão pelo cliente de solicitação sem dependências, sem auditoria empresarial nem notificação.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_id uuid; v_el jsonb;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role', 'authenticated', true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo cliente','message','Teste evo','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  UPDATE public.requests SET status = 'aberto', assignee_id = NULL WHERE id = v_id;
  v_el := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  IF coalesce((v_el->>'eligible')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-03: cliente deveria ser elegível (%).', v_el->>'block_reason';
  END IF;
  v := public.request_delete_permanently('00000000-0000-4000-e000-0000000ee001', v_id,
    (v_el->>'version')::integer, v_el->>'status', gen_random_uuid()::text, true);
  PERFORM set_config('role', v_admin, true);
  IF v->>'status' <> 'completed' OR (v->>'db_deleted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-03: exclusão do cliente não concluiu (%)', v->>'status';
  END IF;
  IF (v->>'audit_recorded')::boolean IS TRUE OR (v->>'client_notified')::boolean IS TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-03: exclusão do cliente gerou auditoria/notificação';
  END IF;
  IF EXISTS (SELECT 1 FROM public.requests WHERE id = v_id) THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-03: solicitação continua no banco';
  END IF;
  IF EXISTS (SELECT 1 FROM public.audit_events WHERE target_id = v_id AND action = 'requests.deleted') THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-03: evento de exclusão para o cliente';
  END IF;
END $$;

-- EVO-04: exclusão pela equipe audita e deixa notificação legível sem a solicitação original.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_id uuid; v_el jsonb; v_notif record;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo equipe','message','Teste equipe','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
  v_el := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  IF coalesce((v_el->>'eligible')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-04: equipe deveria ser elegível (%).', v_el->>'block_reason';
  END IF;
  v := public.request_delete_permanently('00000000-0000-4000-e000-0000000ee001', v_id,
    (v_el->>'version')::integer, v_el->>'status', gen_random_uuid()::text, true);
  PERFORM set_config('role', v_admin, true);
  IF v->>'status' <> 'completed' OR (v->>'audit_recorded')::boolean IS NOT TRUE OR (v->>'client_notified')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-04: exclusão da equipe sem auditoria/notificação (%)', v;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.audit_events WHERE target_id = v_id AND action = 'requests.deleted') THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-04: evento requests.deleted ausente';
  END IF;
  SELECT * INTO v_notif FROM private.internal_notifications
   WHERE kind = 'request_deleted' AND deleted_protocol = v->>'protocol'
   ORDER BY created_at DESC LIMIT 1;
  IF v_notif.id IS NULL THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-04: notificação ao cliente ausente';
  END IF;
  IF v_notif.request_id IS NOT NULL THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-04: notificação depende da solicitação excluída';
  END IF;
  IF v_notif.recipient_id <> '00000000-0000-4000-b000-0000000ee004' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-04: notificação entregue ao destinatário errado';
  END IF;
END $$;

-- EVO-05: cliente não exclui solicitação sob responsabilidade da equipe.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_id uuid; v_caught boolean := false; v_reason text;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo bloqueio','message','Teste bloqueio','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  PERFORM set_config('role', v_admin, true);
  UPDATE public.requests SET status = 'em_atendimento', assignee_id = '00000000-0000-4000-b000-0000000ee001' WHERE id = v_id;
  BEGIN
    PERFORM set_config('role','authenticated',true);
    v := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-05: consulta deveria devolver bloqueio, não erro';
  END IF;
  IF coalesce((v->>'eligible')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-05: cliente não pode ser elegível em atendimento da equipe';
  END IF;
  v_reason := coalesce(v->>'block_reason','');
  IF v_reason NOT IN ('CONTROL_WITH_TEAM','INSUFFICIENT_PERMISSION','STATUS_NOT_ELIGIBLE') THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-05: motivo inesperado %', v_reason;
  END IF;
END $$;

-- EVO-06: cobrança com pagamento confirmado impede a exclusão e devolve o motivo ao backend.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_id uuid; v_el jsonb; v_caught boolean := false;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo pago','message','Teste pago','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  PERFORM set_config('role', v_admin, true);
  UPDATE public.requests SET status = 'aberto', assignee_id = NULL WHERE id = v_id;
  INSERT INTO private.charges (office_id, request_id, created_by)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_id, '00000000-0000-4000-a000-0000000ee001');
  INSERT INTO private.charge_events (office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    SELECT '00000000-0000-4000-e000-0000000ee001', c.id, 1, 'created', 5000, 'Obrigação fictícia',
           '00000000-0000-4000-a000-0000000ee001'
      FROM private.charges c WHERE c.request_id = v_id;
  BEGIN
    PERFORM set_config('role','authenticated',true);
    v_el := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  EXCEPTION WHEN OTHERS THEN
    v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-06: consulta de elegibilidade falhou';
  END IF;
  IF coalesce((v_el->>'eligible')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-06: solicitação com cobrança deveria ser bloqueada';
  END IF;
  IF coalesce(v_el->>'block_reason','') = '' OR coalesce(v_el->>'block_message','') = '' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-06: bloqueio financeiro sem motivo/mensagem';
  END IF;
END $$;

-- EVO-07: anexo exclusivo passa pelo fluxo em duas fases (processando -> claim -> concluído).
DO $$
DECLARE v_admin text := current_user; v jsonb; v_id uuid; v_file uuid; v_up uuid := gen_random_uuid();
        v_el jsonb; v_claim jsonb; v_done jsonb; v_op uuid;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo anexo','message','Teste anexo','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  PERFORM set_config('role', v_admin, true);
  UPDATE public.requests SET status='aberto', assignee_id=NULL WHERE id=v_id;
  INSERT INTO public.files (office_id, request_id, name, mime_type, size_bytes, sha256, classification, status, created_by, scanner_status)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_id, 'evo.pdf', 'application/pdf', 1234, repeat('c',64),
            'documento', 'disponivel', '00000000-0000-4000-a000-0000000ee004', 'clean')
    RETURNING id INTO v_file;
  INSERT INTO private.upload_intents (id, office_id, request_id, file_id, created_by, session_id, idempotency_key,
      payload_digest, bucket, object_path, policy_snapshot, expires_at)
    VALUES (v_up, '00000000-0000-4000-e000-0000000ee001', v_id, v_file, '00000000-0000-4000-a000-0000000ee004',
            '00000000-0000-4000-c000-0000000ee004', 'evo-intent-file', repeat('d',64), 'request-attachments',
            '00000000-0000-4000-e000-0000000ee001/' || v_up || '/' || v_file, '{}'::jsonb,
            clock_timestamp() + interval '1 hour');
  PERFORM set_config('role','authenticated',true);
  v_el := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  IF (v_el->'attachments'->>'exclusive_count')::int <> 1 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-07: anexo exclusivo não contabilizado (%)', v_el->'attachments';
  END IF;
  v := public.request_delete_permanently('00000000-0000-4000-e000-0000000ee001', v_id,
    (v_el->>'version')::integer, v_el->>'status', gen_random_uuid()::text, true);
  PERFORM set_config('role', v_admin, true);
  IF v->>'status' <> 'processing' OR (v->>'storage_cleanup_completed')::boolean IS TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-07: exclusão com arquivo deveria aguardar o Storage (%)', v->>'status';
  END IF;
  PERFORM set_config('role','service_role',true);
  v_claim := public.request_deletion_claim_cleanup('00000000-0000-4000-e000-0000000ee001', NULL);
  v_op := (v_claim->0->>'operation_id')::uuid;
  v_done := public.request_deletion_complete_cleanup(v_op, ARRAY[v_file], 0, NULL);
  PERFORM set_config('role', v_admin, true);
  IF v_done->>'status' <> 'completed' OR (v_done->>'storage_cleanup_completed')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-07: limpeza do Storage não concluiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.requests WHERE id = v_id) THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-07: solicitação sobreviveu à limpeza';
  END IF;
END $$;

-- EVO-08: arquivo compartilhado e retenção legal bloqueiam a exclusão.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_id uuid; v_file uuid; v_el jsonb; v_reason text;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo compartilhado','message','Teste arquivo','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  PERFORM set_config('role', v_admin, true);
  UPDATE public.requests SET status='aberto', assignee_id=NULL WHERE id=v_id;
  INSERT INTO public.files (office_id, request_id, name, mime_type, size_bytes, sha256, classification, status, created_by, scanner_status)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_id, 'shared.pdf', 'application/pdf', 99, repeat('e',64),
            'documento', 'disponivel', '00000000-0000-4000-a000-0000000ee004', 'clean')
    RETURNING id INTO v_file;
  INSERT INTO private.file_references (office_id, file_id, reference_kind)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_file, 'document_version')
    ON CONFLICT DO NOTHING;
  PERFORM set_config('role','authenticated',true);
  v_el := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  PERFORM set_config('role', v_admin, true);
  IF coalesce((v_el->>'eligible')::boolean, false) IS TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-08: arquivo compartilhado não bloqueou';
  END IF;
  IF coalesce(v_el->>'block_message','') NOT LIKE '%compartilh%' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-08: mensagem não explica o arquivo compartilhado (%)', v_el->>'block_message';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo retido','message','Teste retenção','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_id := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  PERFORM set_config('role', v_admin, true);
  UPDATE public.requests SET status='aberto', assignee_id=NULL WHERE id=v_id;
  INSERT INTO public.files (office_id, request_id, name, mime_type, size_bytes, sha256, classification, status, created_by, scanner_status, legal_hold)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_id, 'legal.pdf', 'application/pdf', 10, repeat('f',64),
            'documento', 'disponivel', '00000000-0000-4000-a000-0000000ee004', 'clean', true);
  PERFORM set_config('role','authenticated',true);
  v_el := public.request_deletion_eligibility('00000000-0000-4000-e000-0000000ee001', v_id);
  PERFORM set_config('role', v_admin, true);
  v_reason := coalesce(v_el->>'block_reason','');
  IF coalesce((v_el->>'eligible')::boolean, false) IS TRUE OR v_reason NOT IN ('LEGAL_RETENTION','STATUS_NOT_ELIGIBLE') THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-08: retenção legal não bloqueou (%)', v_reason;
  END IF;
END $$;

-- EVO-09: autorização financeira completa (pedido -> aprovação -> execução única) e revogação por alteração da cobrança.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_req uuid; v_charge uuid; v_ap uuid; v_ap2 uuid;
        v_session uuid; v_unit uuid; v_acc uuid; v_method uuid; v_el jsonb; v_caught boolean;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  SELECT val INTO v_unit FROM evo_ctx WHERE k='unit';
  SELECT val INTO v_acc FROM evo_ctx WHERE k='account';
  SELECT val INTO v_method FROM evo_ctx WHERE k='method';
  SELECT val INTO v_session FROM evo_ctx WHERE k='session';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo financeiro','message','Teste financeiro','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_req := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  INSERT INTO private.charges (office_id, request_id, created_by)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_req, '00000000-0000-4000-a000-0000000ee001')
    RETURNING id INTO v_charge;
  INSERT INTO private.charge_events (office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 'created', 10000, 'Obrigação fictícia',
            '00000000-0000-4000-a000-0000000ee001');
  INSERT INTO private.charge_installments (office_id, charge_id, version, number, due_date, amount_cents)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 1, current_date, 10000);

  -- funcionário sem permissão não pode pedir autorização para cobrança fora do seu escopo
  v_caught := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee003","session_id":"00000000-0000-4000-c000-0000000ee003"}', true);
    PERFORM set_config('role','authenticated',true);
    PERFORM public.financial_approval_request_manual_payment('00000000-0000-4000-e000-0000000ee001', v_charge, 1, v_req,
      v_session, v_unit, v_acc, v_method, '00000000-0000-4000-a000-0000000ee002', 10000, current_date, 'evo-ref-x',
      'Tentativa fora de escopo', 'evo-manual-x1');
  EXCEPTION WHEN sqlstate 'PT404' THEN v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF NOT v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: pedido de autorização fora de escopo foi aceito';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.financial_approval_request_manual_payment('00000000-0000-4000-e000-0000000ee001', v_charge, 1, v_req,
    v_session, v_unit, v_acc, v_method, '00000000-0000-4000-a000-0000000ee002', 10000, current_date, 'evo-ref',
    'Recebimento fictício', 'evo-manual-1');
  v_ap := (v->>'id')::uuid;
  IF v->>'status' <> 'pending' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: autorização não ficou pendente (%)', v->>'status';
  END IF;

  -- quem pediu não decide; aprovador designado decide
  v_caught := false;
  BEGIN
    PERFORM public.financial_approval_decide('00000000-0000-4000-e000-0000000ee001', v_ap, 'approve', 1, 'Autoaprovação', 'evo-decide-x');
  EXCEPTION WHEN sqlstate 'PT403' THEN v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: solicitante conseguiu aprovar a própria autorização';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee002","session_id":"00000000-0000-4000-c000-0000000ee002"}', true);
  v := public.financial_approval_decide('00000000-0000-4000-e000-0000000ee001', v_ap, 'approve', 1, 'Aprovado fictício', 'evo-decide-1');
  IF (v->>'can_execute')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: aprovação não liberou execução';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
  v := public.financial_approval_execute_manual_payment('00000000-0000-4000-e000-0000000ee001', v_ap, v_session, 1, 'evo-exec-1');
  IF v->>'status' <> 'executed' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: execução não concluiu (%)', v->>'status';
  END IF;
  PERFORM set_config('role', v_admin, true);

  -- a execução criou exatamente um pagamento e uma alocação, zerando o saldo
  IF (SELECT count(*) FROM private.payment_allocations WHERE charge_id = v_charge) <> 1 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: alocação ausente ou duplicada';
  END IF;
  IF (SELECT (private.charges_amounts('00000000-0000-4000-e000-0000000ee001', v_charge)).balance_cents) <> 0 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: saldo não foi zerado';
  END IF;

  -- segunda execução é bloqueada
  v_caught := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
    PERFORM set_config('role','authenticated',true);
    PERFORM public.financial_approval_execute_manual_payment('00000000-0000-4000-e000-0000000ee001', v_ap, v_session, 1, 'evo-exec-2');
  EXCEPTION WHEN sqlstate 'PT409' THEN v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF NOT v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: execução duplicada permitida';
  END IF;

  -- autorização pendente é revogada quando a cobrança muda (segunda cobrança, ainda em aberto)
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo revogação','message','Teste revogação','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_req := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  INSERT INTO private.charges (office_id, request_id, created_by)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_req, '00000000-0000-4000-a000-0000000ee001')
    RETURNING id INTO v_charge;
  INSERT INTO private.charge_events (office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 'created', 5000, 'Obrigação fictícia 2',
            '00000000-0000-4000-a000-0000000ee001');
  INSERT INTO private.charge_installments (office_id, charge_id, version, number, due_date, amount_cents)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 1, current_date, 5000);
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.financial_approval_request_manual_payment('00000000-0000-4000-e000-0000000ee001', v_charge, 1, v_req,
    v_session, v_unit, v_acc, v_method, '00000000-0000-4000-a000-0000000ee002', 5000, current_date,
    'evo-ref-2', 'Segundo recebimento fictício', 'evo-manual-2');
  v_ap2 := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  INSERT INTO private.charge_events (office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 2, 'adjusted', 0, 'Ajuste concorrente',
            '00000000-0000-4000-a000-0000000ee001');
  IF (SELECT status FROM private.financial_approvals WHERE id = v_ap2) <> 'revoked' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-09: alteração da cobrança não revogou a autorização';
  END IF;
END $$;

-- EVO-10: provedor de pagamento só é gerenciado por quem possui a permissão; ativação e leitura do checkout funcionam.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_state jsonb; v_provider uuid; v_charge uuid; v_req uuid;
        v_session uuid; v_unit uuid; v_acc uuid; v_method uuid; v_caught boolean;
BEGIN
  SELECT val INTO v_session FROM evo_ctx WHERE k='session';
  SELECT val INTO v_unit FROM evo_ctx WHERE k='unit';
  SELECT val INTO v_acc FROM evo_ctx WHERE k='account';
  SELECT val INTO v_method FROM evo_ctx WHERE k='method';

  v_caught := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee003","session_id":"00000000-0000-4000-c000-0000000ee003"}', true);
    PERFORM set_config('role','authenticated',true);
    PERFORM public.payment_provider_save('00000000-0000-4000-e000-0000000ee001', NULL, 'generic_psp_pix_card',
      'Banco Evo', 'sandbox', ARRAY['pix_qr'], v_acc, v_unit, 'vault://evo/pix', 'evo-prov-x');
  EXCEPTION WHEN sqlstate 'PT403' THEN v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF NOT v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-10: funcionário sem permissão cadastrou provedor';
  END IF;

  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
  PERFORM set_config('role','authenticated',true);
  v_state := public.payment_provider_save('00000000-0000-4000-e000-0000000ee001', NULL, 'generic_psp_pix_card',
    'Banco Evo', 'sandbox', ARRAY['pix_qr','pix_copy_paste'], v_acc, v_unit, 'vault://evo/pix', 'evo-prov-1');
  v_provider := (v_state->'providers'->0->>'id')::uuid;
  v_state := public.payment_pix_settings_save('00000000-0000-4000-e000-0000000ee001', v_provider, true, true, true, 30, true, false, 'evo-pix-1');
  v_state := public.payment_provider_validate('00000000-0000-4000-e000-0000000ee001', v_provider);
  IF v_state->'providers'->0->>'status' <> 'validated' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-10: provedor não validou (%)', v_state->'providers'->0->>'status';
  END IF;
  PERFORM set_config('role', v_admin, true);
  IF EXISTS (SELECT 1 FROM private.payment_providers WHERE id = v_provider AND credential_ref IS NOT NULL AND credential_ref !~ '^vault://') THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-10: credencial armazenada fora de referência segura';
  END IF;
END $$;

-- EVO-11: webhook idempotente, validação de valor e conciliação pendente (sem caixa fictício).
DO $$
DECLARE v_admin text := current_user; v jsonb; v_intent uuid; v_charge uuid; v_req uuid; v_el jsonb;
        v_caught boolean; v_state text;
        v_cat uuid;
BEGIN
  SELECT val INTO v_cat FROM evo_ctx WHERE k='category';
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.request_create('00000000-0000-4000-e000-0000000ee001',
    jsonb_build_object('origin','portal','title','Pedido evo checkout','message','Teste checkout','category_id',
      v_cat),
    gen_random_uuid(), gen_random_uuid());
  v_req := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  INSERT INTO private.charges (office_id, request_id, created_by)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_req, '00000000-0000-4000-a000-0000000ee001')
    RETURNING id INTO v_charge;
  INSERT INTO private.charge_events (office_id, charge_id, version, kind, delta_cents, reason, actor_id)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 'created', 5000, 'Obrigação fictícia',
            '00000000-0000-4000-a000-0000000ee001');
  INSERT INTO private.charge_installments (office_id, charge_id, version, number, due_date, amount_cents)
    VALUES ('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 1, current_date, 5000);

  -- cliente da própria cobrança vê o checkout pronto para pagar
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.client_payment_checkout_summary('00000000-0000-4000-e000-0000000ee001', v_charge);
  IF v->>'payment_state' <> 'available' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: checkout deveria estar disponível (%)', v->>'payment_state';
  END IF;
  v := public.payment_checkout_create_intent('00000000-0000-4000-e000-0000000ee001', v_charge, 1, 'pix_copy_paste', 1, 'evo-intent-1');
  v_intent := (v->>'id')::uuid;
  PERFORM set_config('role', v_admin, true);
  UPDATE private.payment_checkout_intents SET provider_reference = 'evo-ref-checkout-1' WHERE id = v_intent;

  -- outro cliente não acessa a cobrança alheia
  v_caught := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee003","session_id":"00000000-0000-4000-c000-0000000ee003"}', true);
    PERFORM set_config('role','authenticated',true);
    PERFORM public.client_payment_checkout_summary('00000000-0000-4000-e000-0000000ee001', v_charge);
  EXCEPTION WHEN sqlstate 'PT404' THEN v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF NOT v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: cobrança acessível a usuário fora do vínculo';
  END IF;

  -- authenticated não executa ingestão nem varredura
  v_caught := false;
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee001","session_id":"00000000-0000-4000-c000-0000000ee001"}', true);
    PERFORM set_config('role','authenticated',true);
    PERFORM public.payment_webhook_ingest('generic_psp_pix_card', 'evo-evt-x', 'evo-ref-checkout-1', 'payment.confirmed', repeat('a',64));
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  PERFORM set_config('role', v_admin, true);
  IF NOT v_caught THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: authenticated conseguiu ingerir webhook';
  END IF;

  -- valor divergente é recusado
  PERFORM set_config('role','service_role',true);
  v := public.payment_webhook_ingest('generic_psp_pix_card', 'evo-evt-bad', 'evo-ref-checkout-1', 'payment.confirmed', repeat('b',64), 999);
  PERFORM set_config('role', v_admin, true);
  IF v->>'status' <> 'amount_mismatch' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: valor divergente aceito (%)', v->>'status';
  END IF;

  -- confirmação válida: processada, duplicata ignorada e nada alocado automaticamente
  PERFORM set_config('role','service_role',true);
  v := public.payment_webhook_ingest('generic_psp_pix_card', 'evo-evt-1', 'evo-ref-checkout-1', 'payment.confirmed', repeat('c',64), 5000);
  PERFORM set_config('role', v_admin, true);
  IF v->>'status' <> 'processed' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: evento válido não processado (%)', v->>'status';
  END IF;
  PERFORM set_config('role','service_role',true);
  v := public.payment_webhook_ingest('generic_psp_pix_card', 'evo-evt-1', 'evo-ref-checkout-1', 'payment.confirmed', repeat('c',64), 5000);
  PERFORM set_config('role', v_admin, true);
  IF v->>'status' <> 'ignored_duplicate' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: duplicata não ignorada (%)', v->>'status';
  END IF;
  SELECT state INTO v_state FROM private.payment_checkout_intents WHERE id = v_intent;
  IF v_state <> 'pending_reconciliation' THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: estado deveria ser pending_reconciliation (%)', v_state;
  END IF;
  IF EXISTS (SELECT 1 FROM private.payment_allocations WHERE charge_id = v_charge) THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-11: webhook criou alocação sem caixa autorizado';
  END IF;
END $$;

-- EVO-12: a página de notificações do cliente mostra a exclusão sem link para o detalhe.
DO $$
DECLARE v_admin text := current_user; v jsonb; v_item jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000ee004","session_id":"00000000-0000-4000-c000-0000000ee004"}', true);
  PERFORM set_config('role','authenticated',true);
  v := public.notifications_page('00000000-0000-4000-e000-0000000ee001', '', 'all', 'request_deleted', 1, 5);
  PERFORM set_config('role', v_admin, true);
  IF coalesce((v->>'total')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'EVOLUTION FAIL EVO-12: notificação de exclusão não listada';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v->'items','[]'::jsonb)) LOOP
    IF (v_item->>'can_open')::boolean IS TRUE THEN
      RAISE EXCEPTION 'EVOLUTION FAIL EVO-12: notificação de exclusão oferece detalhe inexistente';
    END IF;
  END LOOP;
END $$;

-- A suíte é somente leitura para o restante do banco: tudo o que foi criado volta atrás.
ROLLBACK;
