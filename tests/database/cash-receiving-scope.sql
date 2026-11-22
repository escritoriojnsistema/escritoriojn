-- Disposable PostgreSQL only. The fixtures and their grants always roll back.
BEGIN;

DO $$
<<fixture>>
DECLARE
  db_role text := current_user;
  office_id constant uuid := '73730000-0000-4000-8000-000000000001';
  foreign_office constant uuid := '73730000-0000-4000-8000-000000000002';
  owner_id constant uuid := '73730000-0000-4000-8000-000000000011';
  admin_id constant uuid := '73730000-0000-4000-8000-000000000012';
  employee_id constant uuid := '73730000-0000-4000-8000-000000000013';
  customer_id constant uuid := '73730000-0000-4000-8000-000000000014';
  bank_admin_id constant uuid := '73730000-0000-4000-8000-000000000015';
  staff_id uuid;
  membership_id uuid;
  admin_membership uuid;
  bank_membership uuid;
  unit_id uuid;
  cash_account uuid;
  bank_account uuid;
  method_id uuid;
  owner_session uuid;
  admin_session uuid;
  request_category uuid;
  request_id uuid;
  foreign_charge uuid;
  result jsonb;
  configuration jsonb;
  replay_key uuid := gen_random_uuid();
  cash_command jsonb;
  payment_command jsonb;
  channel text;
  charge_ids uuid[] := '{}';
  fixture_charge uuid;
  category_result jsonb;
BEGIN
  INSERT INTO public.offices(id,name) VALUES (office_id,'Caixa inicial fictício'),(foreign_office,'Outro escritório fictício');
  FOREACH staff_id IN ARRAY ARRAY[owner_id,admin_id,employee_id,customer_id,bank_admin_id] LOOP
    INSERT INTO auth.users(id,email,email_confirmed_at) VALUES (staff_id,staff_id::text||'@example.test',now());
    INSERT INTO auth.sessions(id,user_id) VALUES (staff_id,staff_id);
    INSERT INTO public.profiles(id,display_name) VALUES (staff_id,'Pessoa fictícia');
    INSERT INTO public.memberships(office_id,user_id,role_code)
    VALUES (office_id,staff_id,CASE staff_id WHEN owner_id THEN 'owner'
      WHEN admin_id THEN 'admin' WHEN bank_admin_id THEN 'admin'
      WHEN customer_id THEN 'client' ELSE 'employee' END);
  END LOOP;
  SELECT id INTO STRICT membership_id FROM public.memberships WHERE user_id=employee_id;
  SELECT id INTO STRICT admin_membership FROM public.memberships WHERE user_id=admin_id;
  SELECT id INTO STRICT bank_membership FROM public.memberships WHERE user_id=bank_admin_id;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'session_id',owner_id)::text,true);
  PERFORM set_config('role','authenticated',true);
  configuration := public.cash_configuration(office_id,NULL,1,50);
  IF NOT configuration @> '{"units":[],"accounts":[],"payment_methods":[],"units_total":0}' THEN
    RAISE EXCEPTION 'CASH_SCOPE: blank office must return empty configuration';
  END IF;
  cash_command := '{"kind":"unit","id":null,"expected_version":null,"name":"Unidade fictícia","active":true}';
  result := public.cash_configure(office_id,cash_command,replay_key);
  unit_id := (result->'resource'->>'id')::uuid;
  IF unit_id IS NULL OR public.cash_configure(office_id,cash_command,replay_key) IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'CASH_SCOPE: first unit or idempotent retry failed';
  END IF;
  BEGIN
    PERFORM public.cash_configure(office_id,cash_command||'{"name":"Outro nome"}',replay_key);
    RAISE EXCEPTION 'CASH_SCOPE: conflicting idempotent retry accepted';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  FOREACH channel IN ARRAY ARRAY['cash','bank'] LOOP
    result := public.cash_configure(office_id,jsonb_build_object('kind','account','id',NULL,
      'expected_version',NULL,'unit_id',unit_id,'type',channel,'name','Conta fictícia '||channel,'active',true),
      gen_random_uuid());
    IF channel='cash' THEN cash_account := (result->'resource'->>'id')::uuid;
    ELSE bank_account := (result->'resource'->>'id')::uuid;
    END IF;
  END LOOP;
  cash_command := jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,
    'unit_id',unit_id,'type','cash','name','Espécie fictícia','active',true,'destination_account_id',cash_account);
  BEGIN
    PERFORM public.cash_configure(office_id,cash_command||jsonb_build_object('destination_account_id',bank_account),gen_random_uuid());
    RAISE EXCEPTION 'CASH_SCOPE: cash method accepted a bank destination';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  result := public.cash_configure(office_id,cash_command,gen_random_uuid());
  method_id := (result->'resource'->>'id')::uuid;
  configuration := public.cash_configuration(office_id,unit_id,1,50);
  IF NOT configuration @> '{"units_total":1,"accounts_total":2,"payment_methods_total":1}' THEN
    RAISE EXCEPTION 'CASH_SCOPE: first unit, accounts and method missing';
  END IF;

  result := public.cash_open(office_id,unit_id,cash_account,0,gen_random_uuid());
  owner_session := (result->'sessions'->0->>'id')::uuid;
  IF owner_session IS NULL THEN RAISE EXCEPTION 'CASH_SCOPE: first cash session missing'; END IF;
  category_result := public.service_categories_command(office_id,
    '{"kind":"create","name":"Categoria fictícia Caixa","execution_level":3,"reason":"Fixture financeira isolada"}',
    gen_random_uuid());
  SELECT (item->>'id')::uuid INTO STRICT request_category
  FROM jsonb_array_elements(category_result->'items') item WHERE item->>'name'='Categoria fictícia Caixa';

  PERFORM public.team_set_member(office_id,admin_membership,'admin',true,
    ARRAY['foundation.access','requests.read','requests.read_all','cash.read','cash.open','charges.read',
      'payments.manual.approve'],gen_random_uuid());
  PERFORM public.team_set_member(office_id,bank_membership,'admin',true,
    ARRAY['foundation.access','settings.access','payments.providers.manage'],gen_random_uuid());
  PERFORM public.team_set_member(office_id,membership_id,'employee',true,
    ARRAY['foundation.access','cash.read','cash.open','charges.read','requests.read','requests.read_all'],gen_random_uuid());

  PERFORM set_config('role',db_role,true);
  FOREACH channel IN ARRAY ARRAY['presencial','whatsapp','portal','externo'] LOOP
    INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,priority,status,idempotency_key,payload_digest)
    VALUES(CASE WHEN channel='externo' THEN foreign_office ELSE office_id END,
      'AT-73730'||cardinality(charge_ids),'Recebimento de teste '||channel,
      CASE WHEN channel='externo' THEN 'presencial' ELSE channel END,
      CASE WHEN channel='portal' THEN customer_id ELSE employee_id END,
      NULL,'normal','aberto',gen_random_uuid(),'fixture') RETURNING id INTO request_id;
    IF channel<>'externo' THEN
      INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256)
      VALUES(office_id,request_id,request_category,'Categoria fictícia Caixa',owner_id,gen_random_uuid(),repeat('a',64));
      UPDATE public.requests r SET assignee_id=membership_id WHERE r.id=request_id;
    END IF;
    INSERT INTO private.charges(office_id,request_id,created_by)
    VALUES(CASE WHEN channel='externo' THEN foreign_office ELSE office_id END,request_id,owner_id)
    RETURNING id INTO fixture_charge;
    INSERT INTO private.charge_events(office_id,charge_id,version,kind,delta_cents,reason,actor_id)
    VALUES(CASE WHEN channel='externo' THEN foreign_office ELSE office_id END,fixture_charge,1,'created',5000,
      'Obrigação exclusivamente fictícia',owner_id);
    INSERT INTO private.charge_installments(office_id,charge_id,version,number,due_date,amount_cents)
    VALUES(CASE WHEN channel='externo' THEN foreign_office ELSE office_id END,fixture_charge,1,1,current_date,5000);
    IF channel='externo' THEN foreign_charge := fixture_charge;
    ELSE charge_ids := array_append(charge_ids,fixture_charge);
    END IF;
  END LOOP;

  PERFORM set_config('role','authenticated',true);
  result := public.cash_eligible_charges(office_id,'',1);
  IF (result->>'total')::int<>3 THEN RAISE EXCEPTION 'CASH_SCOPE: owner cannot list all three channels'; END IF;
  payment_command := jsonb_build_object('kind','record','session_id',owner_session,'expected_version',1,
    'idempotency_key',gen_random_uuid(),'evidence','Evidência sintética para o primeiro recebimento',
    'payment_method_id',method_id,'status','confirmed','presented_cents',1000,'fee_cents',0,
    'allocations',jsonb_build_array(jsonb_build_object('charge_id',charge_ids[1],'expected_charge_version',1,'amount_cents',1000)),
    'settlement','not_applicable','settled_on',NULL,'external_reference','local-owner');
  result := public.payment_operate(office_id,payment_command);
  IF public.payment_operate(office_id,payment_command) IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'CASH_SCOPE: retry changed the canonical result';
  END IF;
  BEGIN
    PERFORM public.payment_operate(office_id,payment_command||jsonb_build_object(
      'expected_version',2,'idempotency_key',gen_random_uuid(),
      'allocations',jsonb_build_array(jsonb_build_object('charge_id',foreign_charge,'expected_charge_version',1,'amount_cents',1000))));
    RAISE EXCEPTION 'CASH_SCOPE: foreign charge accepted';
  EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT404' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'session_id',admin_id)::text,true);
  result := public.cash_open(office_id,unit_id,cash_account,0,gen_random_uuid());
  admin_session := (result->'sessions'->0->>'id')::uuid;
  IF (public.cash_eligible_charges(office_id,'',1)->>'total')::integer<>3 THEN
    RAISE EXCEPTION 'CASH_SCOPE: explicitly authorized admin missing office charges';
  END IF;
  payment_command := payment_command||jsonb_build_object(
    'session_id',admin_session,'idempotency_key',gen_random_uuid(),'external_reference','local-admin',
    'allocations',jsonb_build_array(jsonb_build_object('charge_id',charge_ids[2],'expected_charge_version',1,'amount_cents',1000)));
  PERFORM public.payment_operate(office_id,payment_command);

  result := public.closure_state(office_id,admin_session,1,1);
  PERFORM public.closure_operate(office_id,jsonb_build_object(
    'kind','close','session_id',admin_session,'expected_version',result->'session_version',
    'idempotency_key',gen_random_uuid(),'reason','Fechamento fictício para teste',
    'counts',(SELECT jsonb_agg(jsonb_build_object('key',g->>'key','counted_cents',g->'expected_cents'))
      FROM jsonb_array_elements(result->'groups') g)));
  BEGIN
    PERFORM public.payment_operate(office_id,payment_command||jsonb_build_object(
      'expected_version',3,'idempotency_key',gen_random_uuid()));
    RAISE EXCEPTION 'CASH_SCOPE: closed cash session accepted a new payment';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',employee_id,'session_id',employee_id)::text,true);
  BEGIN
    PERFORM public.payment_operate(office_id,payment_command);
    RAISE EXCEPTION 'CASH_SCOPE: broad request read enabled a direct payment';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',customer_id,'session_id',customer_id)::text,true);
  result := public.cash_client_finance(office_id,1,1,NULL);
  IF (result->>'total')::integer<>1 OR (result->'items'->0->>'id')::uuid<>charge_ids[3] THEN
    RAISE EXCEPTION 'CASH_SCOPE: customer finance is not isolated';
  END IF;
  IF public.account_read(office_id) IS NULL THEN RAISE EXCEPTION 'CASH_SCOPE: own account missing'; END IF;
  BEGIN
    PERFORM public.account_read(foreign_office);
    RAISE EXCEPTION 'CASH_SCOPE: foreign account access accepted';
  EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT404' THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',bank_admin_id,'session_id',bank_admin_id)::text,true);
  result := public.payment_provider_receiving_options(office_id,NULL,1);
  IF (result->>'units_total')::int<>1 OR (result->>'accounts_total')::int<>1
     OR (result->'accounts'->0->>'id')::uuid<>bank_account THEN
    RAISE EXCEPTION 'CASH_SCOPE: provider options include an ineligible destination or are missing';
  END IF;
  IF (public.payment_provider_receiving_options(office_id,NULL,2)->'accounts')<>'[]'::jsonb THEN
    RAISE EXCEPTION 'CASH_SCOPE: provider options ignore pagination';
  END IF;
  BEGIN
    PERFORM public.cash_configuration(office_id,NULL,1,50);
    RAISE EXCEPTION 'CASH_SCOPE: provider-only access granted operational cash read';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
  END;
  BEGIN
    PERFORM public.payment_provider_receiving_options(foreign_office,NULL,1);
    RAISE EXCEPTION 'CASH_SCOPE: provider options exposed another office';
  EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
  END;
  BEGIN
    PERFORM public.payment_provider_save(office_id,NULL,'generic_pix_bank','Banco fictício','sandbox',
      ARRAY['pix_qr'],cash_account,unit_id,NULL,'fixture-invalid-cash');
    RAISE EXCEPTION 'CASH_SCOPE: provider accepted cash as the receiving account';
  EXCEPTION WHEN SQLSTATE 'PT422' THEN NULL;
  END;
  result := public.payment_provider_save(office_id,NULL,'generic_pix_bank','Banco fictício','sandbox',
    ARRAY['pix_qr'],bank_account,NULL,NULL,'fixture-bank-provider');
  IF (result->'providers'->0->>'financial_unit_id')::uuid<>unit_id THEN
    RAISE EXCEPTION 'CASH_SCOPE: provider did not bind the account to its own unit';
  END IF;

  PERFORM set_config('role',db_role,true);
  IF (SELECT count(*) FROM private.payment_allocations a WHERE a.office_id=fixture.office_id)<>2
     OR (SELECT count(*) FROM private.charges c WHERE c.office_id=fixture.office_id)<>3 THEN
    RAISE EXCEPTION 'CASH_SCOPE: fixture payment or obligation duplicated';
  END IF;
END $$;

ROLLBACK;
SELECT 'PASS: bootstrap, scope across channels, payment/role/retry, closed cash, account privacy, and provider options';
