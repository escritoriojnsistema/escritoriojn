-- Keep manual boleto distinct through configuration, payments and the cash ledger.
ALTER TABLE private.payment_methods
  DROP CONSTRAINT payment_methods_type_check,
  ADD CONSTRAINT payment_methods_type_check CHECK (type IN ('cash', 'pix', 'card', 'transfer', 'boleto'));
ALTER TABLE private.payments
  DROP CONSTRAINT payments_payment_type_check,
  ADD CONSTRAINT payments_payment_type_check CHECK (payment_type IN ('cash', 'pix', 'card', 'transfer', 'boleto'));
ALTER TABLE private.cash_entries
  DROP CONSTRAINT cash_entries_payment_type_check,
  ADD CONSTRAINT cash_entries_payment_type_check CHECK (payment_type IN ('cash', 'pix', 'card', 'transfer', 'boleto'));

CREATE OR REPLACE FUNCTION private.cash_configure(p_office_id uuid,p_configuration jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<cash_configure>>
DECLARE caller uuid;c private.cash_commands;digest text;k text;name text;active boolean;rid uuid;uid uuid;aid uuid;ver integer;oldv integer;resource jsonb;result jsonb;u private.cash_units;a private.financial_accounts;m private.payment_methods;keys text[];BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.manage');
 IF p_configuration IS NULL OR jsonb_typeof(p_configuration)<>'object' OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_configuration->>'kind';keys:=ARRAY['kind','id','expected_version','name','active'];
 IF k='account' THEN keys:=keys||ARRAY['unit_id','type'];ELSIF k='payment_method' THEN keys:=keys||ARRAY['unit_id','type','destination_account_id'];ELSIF k IS DISTINCT FROM 'unit' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT p_configuration ?& keys OR (SELECT count(*) FROM jsonb_object_keys(p_configuration))<>cardinality(keys) OR jsonb_typeof(p_configuration->'name')<>'string' OR jsonb_typeof(p_configuration->'active')<>'boolean' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 name:=p_configuration->>'name';active:=(p_configuration->>'active')::boolean;
 IF char_length(name) NOT BETWEEN 2 AND 120 OR name<>btrim(name) OR name ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 rid:=(p_configuration->>'id')::uuid;ver:=(p_configuration->>'expected_version')::integer;
 IF rid IS NULL THEN IF p_configuration->'id'<>'null'::jsonb OR p_configuration->'expected_version'<>'null'::jsonb THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 ELSIF jsonb_typeof(p_configuration->'id')<>'string' OR jsonb_typeof(p_configuration->'expected_version')<>'number' OR ver IS NULL OR ver NOT BETWEEN 1 AND 2147483645 OR (p_configuration->>'expected_version')::numeric<>ver THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF k<>'unit' THEN uid:=(p_configuration->>'unit_id')::uuid;IF uid IS NULL OR jsonb_typeof(p_configuration->'unit_id')<>'string' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 IF k='payment_method' THEN aid:=(p_configuration->>'destination_account_id')::uuid;IF aid IS NULL OR jsonb_typeof(p_configuration->'destination_account_id')<>'string' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 IF k='account' AND(p_configuration->>'type' IS NULL OR p_configuration->>'type' NOT IN('cash','bank','digital')) OR k='payment_method' AND(p_configuration->>'type' IS NULL OR p_configuration->>'type' NOT IN('cash','pix','card','transfer','boleto')) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(p_configuration::text,'sha256'),'hex');
 SELECT * INTO c FROM private.cash_commands WHERE office_id=p_office_id AND kind='configure' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF c.actor_id<>caller OR c.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN c.result;END IF;
 IF k='unit' AND rid IS NOT NULL THEN SELECT version INTO oldv FROM private.cash_units WHERE office_id=p_office_id AND id=rid FOR UPDATE;
 ELSIF k='account' AND rid IS NOT NULL THEN SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND id=rid FOR UPDATE;oldv:=a.version;
 ELSIF k='payment_method' AND rid IS NOT NULL THEN SELECT * INTO m FROM private.payment_methods WHERE office_id=p_office_id AND id=rid FOR UPDATE;oldv:=m.version;END IF;
 IF rid IS NOT NULL AND oldv IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF rid IS NOT NULL AND oldv<>ver THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k<>'unit' THEN
  SELECT * INTO u FROM private.cash_units WHERE office_id=p_office_id AND id=uid FOR UPDATE;
  IF u.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF active AND NOT u.active THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 IF k='account' AND a.id IS NOT NULL AND (a.unit_id<>uid OR a.type<>p_configuration->>'type') AND (EXISTS(SELECT FROM private.cash_sessions WHERE office_id=p_office_id AND cash_account_id=a.id) OR EXISTS(SELECT FROM private.payment_methods WHERE office_id=p_office_id AND destination_account_id=a.id)) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='payment_method' THEN
  SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=uid AND id=aid FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF (active AND NOT a.active) OR (p_configuration->>'type'='cash')<>(a.type='cash') OR (p_configuration->>'type'='boleto' AND a.type<>'bank') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 -- Explicit policy14: no deactivation of a unit/account/method while its unit's affected cash is open.
 IF rid IS NOT NULL AND NOT active AND EXISTS(SELECT FROM private.cash_sessions WHERE office_id=p_office_id AND status='open' AND CASE k WHEN 'unit' THEN unit_id=rid WHEN 'account' THEN cash_account_id=rid ELSE unit_id=m.unit_id END) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 caller:=private.cash_actor(p_office_id,true,'cash.manage');
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'configure',p_idempotency_key,caller,digest);
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 IF k='unit' THEN
  IF rid IS NULL THEN INSERT INTO private.cash_units(office_id,name,active,version)VALUES(p_office_id,name,active,1)RETURNING to_jsonb(cash_units)-'office_id' INTO resource;
  ELSE UPDATE private.cash_units SET name=cash_configure.name,active=cash_configure.active,version=version+1 WHERE office_id=p_office_id AND id=rid RETURNING to_jsonb(cash_units)-'office_id' INTO resource;END IF;
 ELSIF k='account' THEN
  IF rid IS NULL THEN INSERT INTO private.financial_accounts(office_id,unit_id,name,type,active,version)VALUES(p_office_id,uid,name,p_configuration->>'type',active,1)RETURNING to_jsonb(financial_accounts)-'office_id' INTO resource;
  ELSE UPDATE private.financial_accounts SET unit_id=uid,name=cash_configure.name,type=p_configuration->>'type',active=cash_configure.active,version=version+1 WHERE office_id=p_office_id AND id=rid RETURNING to_jsonb(financial_accounts)-'office_id' INTO resource;END IF;
 ELSE
  IF rid IS NULL THEN INSERT INTO private.payment_methods(office_id,unit_id,name,type,destination_account_id,active,version)VALUES(p_office_id,uid,name,p_configuration->>'type',aid,active,1)RETURNING to_jsonb(payment_methods)-'office_id' INTO resource;
  ELSE UPDATE private.payment_methods SET unit_id=uid,name=cash_configure.name,type=p_configuration->>'type',destination_account_id=aid,active=cash_configure.active,version=version+1 WHERE office_id=p_office_id AND id=rid RETURNING to_jsonb(payment_methods)-'office_id' INTO resource;END IF;
 END IF;
 PERFORM private.emit_business_event(p_office_id,'cash.configured','cash_'||k,(resource->>'id')::uuid,p_idempotency_key,'{}');
 result:=jsonb_build_object('resource',resource,'configuration',private.cash_configuration_record(p_office_id,NULL,1,50));
 UPDATE private.cash_commands SET result=cash_configure.result WHERE office_id=p_office_id AND kind='configure' AND idempotency_key=p_idempotency_key;
 PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.finance19_filters(p_office uuid,f jsonb,p_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET datestyle='ISO,YMD' AS $$
DECLARE actor uuid;keys text[]:=ARRAY['view','scope','from_date','until_date','unit_id','operator_id','service_id','payment_type','account_id','status','customer_id'];v text;sc text;a date;b date;key text;filterid uuid;BEGIN
 actor:=private.finance19_actor(p_office,false,false,p_export);
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR NOT f ?& keys OR(SELECT count(*) FROM jsonb_object_keys(f))<>cardinality(keys) OR EXISTS(SELECT FROM unnest(ARRAY['view','scope','from_date','until_date','payment_type','status'])k WHERE jsonb_typeof(f->k) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 v:=f->>'view';sc:=f->>'scope';
 IF v NOT IN('obligations','movements','cash') OR sc NOT IN('own','all') OR f->>'payment_type' NOT IN('all','cash','pix','card','transfer','boleto') OR f->>'from_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR f->>'until_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN a:=(f->>'from_date')::date;b:=(f->>'until_date')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END;
 IF a<DATE '0001-01-01' OR b>DATE '9999-12-31' OR b-a NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 IF sc='all' AND NOT private.current_permissions(p_office) @> ARRAY['finance.reports.read_all','cash.read_all'] THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF v='obligations' AND(f->'unit_id'<>'null' OR f->'account_id'<>'null' OR f->>'payment_type'<>'all' OR f->>'status' NOT IN('all','open','paid','cancelled','zero')) OR v='movements' AND f->>'status' NOT IN('all','confirmed') OR v='cash' AND(f->'service_id'<>'null' OR f->'customer_id'<>'null' OR f->>'payment_type'<>'all' OR f->>'status' NOT IN('all','open','closed')) THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 FOREACH key IN ARRAY ARRAY['unit_id','operator_id','service_id','account_id','customer_id'] LOOP
 IF f->key='null'::jsonb THEN CONTINUE;END IF;
 IF jsonb_typeof(f->key) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN filterid:=(f->>key)::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END;
 IF key='operator_id' THEN
 IF sc='own' AND filterid<>actor THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office AND user_id=filterid AND role_code<>'client') THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 ELSIF key='customer_id' THEN PERFORM private.request_customer(p_office,filterid,actor);
 ELSIF key='service_id' THEN IF NOT EXISTS(SELECT FROM public.services WHERE office_id=p_office AND services.id=filterid) THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 ELSIF key='unit_id' THEN IF NOT EXISTS(SELECT FROM private.cash_units u WHERE office_id=p_office AND u.id=filterid AND(sc='all' OR EXISTS(SELECT FROM private.cash_sessions s WHERE s.office_id=p_office AND s.unit_id=u.id AND s.operator_id=actor))) THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 ELSIF key='account_id' THEN IF v='cash' AND EXISTS(SELECT FROM private.financial_accounts ac WHERE ac.office_id=p_office AND ac.id=filterid AND ac.type<>'cash') THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;IF NOT EXISTS(SELECT FROM private.financial_accounts ac WHERE office_id=p_office AND ac.id=filterid AND(f->>'unit_id' IS NULL OR ac.unit_id=(f->>'unit_id')::uuid) AND(sc='all' OR EXISTS(SELECT FROM private.cash_sessions s WHERE s.office_id=p_office AND s.unit_id=ac.unit_id AND s.operator_id=actor))) THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 END IF;
 END LOOP;
 -- Customer locks may wait independently of office authority; Auth is checked again even on snapshot replays.
 PERFORM private.finance19_actor(p_office,false,false,p_export);
 RETURN f;
END $$;
