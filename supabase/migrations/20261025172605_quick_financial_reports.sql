-- Etapa19: atomic composition of 09/10/13/15 and masked, cutoff-based reports.
-- No business configuration, Auth fixture or individual grant is seeded.
INSERT INTO public.permissions(code,name) VALUES('quick.perform','Atendimento rapido'),('finance.reports.read','Consultar relatorios financeiros'),('finance.reports.read_all','Consolidar relatorios financeiros'),('finance.reports.export','Exportar relatorios financeiros'),('finance.reports.manage','Configurar relatorios financeiros') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('quick.perform','finance.reports.read','finance.reports.read_all','finance.reports.export','finance.reports.manage') ON CONFLICT DO NOTHING;
DO $migration$ DECLARE r record;d text;extra text:=', ''quick.perform'', ''finance.reports.read'', ''finance.reports.read_all'', ''finance.reports.export'', ''finance.reports.manage''';BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cash.read%' LOOP
 d:=replace(r.def,'''cash.read''::text','''cash.read''::text'||replace(extra,', ','::text, ')||'::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP d:=pg_get_functiondef(r.oid);d:=replace(d,'''cash.read''','''cash.read'''||extra);EXECUTE d;END LOOP;
END $migration$;
DO $migration$ DECLARE d text;BEGIN
 SELECT pg_get_functiondef('private.safe_audit_changes(jsonb)'::regprocedure) INTO d;
 d:=replace(d,'ELSIF k=''role_code'' THEN','ELSIF k=''format'' THEN safe:=v IN (''"csv"''::jsonb,''"pdf"''::jsonb); ELSIF k=''role_code'' THEN');EXECUTE d;
END $migration$;
ALTER TABLE private.cash_commands DROP CONSTRAINT cash_commands_kind_check;
ALTER TABLE private.cash_commands ADD CONSTRAINT cash_commands_kind_check CHECK(kind IN('configure','open','operate','payment','correction','expense','transfer','receipt','closure','quick','report_settings','report_begin','report_authorize'));
CREATE TABLE private.quick_operations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,session_id uuid NOT NULL,unit_id uuid NOT NULL,operator_id uuid NOT NULL REFERENCES auth.users(id),
 request_id uuid NOT NULL,charge_id uuid NOT NULL,payment_id uuid,completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),command_key uuid NOT NULL,
 UNIQUE(office_id,command_key),UNIQUE(office_id,request_id),UNIQUE(office_id,charge_id),UNIQUE(office_id,payment_id),
 FOREIGN KEY(office_id,unit_id,session_id) REFERENCES private.cash_sessions(office_id,unit_id,id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id),FOREIGN KEY(office_id,charge_id) REFERENCES private.charges(office_id,id),FOREIGN KEY(office_id,payment_id) REFERENCES private.payments(office_id,id)
);
CREATE INDEX quick_operations_operator_idx ON private.quick_operations(office_id,operator_id,completed_at DESC,id DESC);
CREATE INDEX quick_operations_operator_id_idx ON private.quick_operations(operator_id);
CREATE INDEX quick_operations_session_idx ON private.quick_operations(office_id,unit_id,session_id);
CREATE TABLE private.finance_report_settings(
 office_id uuid PRIMARY KEY REFERENCES public.offices(id),timezone text NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),actor_id uuid NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX finance_report_settings_actor_idx ON private.finance_report_settings(actor_id);
CREATE TABLE private.finance_report_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),command_key uuid NOT NULL,
 snapshot jsonb NOT NULL,rows jsonb NOT NULL CHECK(jsonb_typeof(rows)='array' AND jsonb_array_length(rows)<=1000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,command_key)
);
CREATE INDEX finance_report_snapshots_actor_idx ON private.finance_report_snapshots(office_id,actor_id,created_at DESC,id DESC);
CREATE INDEX finance_report_snapshots_actor_id_idx ON private.finance_report_snapshots(actor_id);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['quick_operations','finance_report_settings','finance_report_snapshots'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 IF t<>'finance_report_settings' THEN EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t);END IF;
END LOOP;END $$;
CREATE FUNCTION private.finance19_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;key uuid;actor uuid;BEGIN
 k:=CASE TG_TABLE_NAME WHEN 'quick_operations' THEN 'quick' WHEN 'finance_report_settings' THEN 'report_settings' ELSE 'report_begin' END;
 key:=nullif(current_setting('jn.cash_command',true),'')::uuid;actor:=auth.uid();
 IF NOT EXISTS(SELECT FROM private.cash_commands c WHERE c.office_id=NEW.office_id AND c.kind=k AND c.idempotency_key=key AND c.actor_id=actor AND c.result IS NULL) THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF TG_TABLE_NAME='quick_operations' THEN IF NEW.operator_id<>actor OR NEW.command_key<>key THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSIF TG_TABLE_NAME='finance_report_snapshots' THEN IF NEW.actor_id<>actor OR NEW.command_key<>key THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE IF NEW.actor_id<>actor OR(TG_OP='UPDATE' AND(NEW.office_id<>OLD.office_id OR NEW.version<>OLD.version+1)) THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER command_guard BEFORE INSERT ON private.quick_operations FOR EACH ROW EXECUTE FUNCTION private.finance19_guard();
CREATE TRIGGER command_guard BEFORE INSERT ON private.finance_report_snapshots FOR EACH ROW EXECUTE FUNCTION private.finance19_guard();
CREATE TRIGGER command_guard BEFORE INSERT OR UPDATE ON private.finance_report_settings FOR EACH ROW EXECUTE FUNCTION private.finance19_guard();
CREATE TRIGGER prevent_delete BEFORE DELETE ON private.finance_report_settings FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.finance19_actor(p_office uuid,p_write boolean DEFAULT false,p_quick boolean DEFAULT false,p_export boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid;caps text[];BEGIN
 actor:=private.cash_actor(p_office,p_write);caps:=private.current_permissions(p_office);
 IF p_quick THEN
 IF NOT caps @> ARRAY['quick.perform','services.read','services.perform','requests.read','requests.create','requests.update','charges.read','charges.create','cash.open'] THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE
 IF NOT caps @> ARRAY['finance.reports.read'] OR(p_export AND NOT caps @> ARRAY['finance.reports.export']) THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;RETURN actor;
END $$;
CREATE FUNCTION private.finance19_safe(v numeric) RETURNS bigint LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN IF v IS NULL THEN RETURN NULL;END IF;IF abs(v)>9007199254740991 OR trunc(v)<>v THEN RAISE EXCEPTION 'FINANCE19_LIMIT' USING ERRCODE='PT422';END IF;RETURN v::bigint;END $$;
CREATE FUNCTION private.quick_eligible19(d jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT d @> '{"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false}'::jsonb
 AND(d->'fields')='[]'::jsonb AND(d->'checklist')='[]'::jsonb;
$$;
CREATE FUNCTION private.quick_session19(s private.cash_sessions) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'version',s.version,'cash_cents',private.finance19_safe(s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)));
$$;
CREATE FUNCTION private.quick_context(p_office_id uuid,p_session_id uuid,p_query text,p_page integer,p_session_page integer,p_method_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;s private.cash_sessions;result jsonb;items jsonb;total bigint;caps text[];BEGIN
 actor:=private.finance19_actor(p_office_id,false,true);caps:=private.current_permissions(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_session_page IS NULL OR p_session_page NOT BETWEEN 1 AND 100000 OR p_method_page IS NULL OR p_method_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_session_id IS NOT NULL THEN
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p_session_id AND operator_id=actor AND status='open';
 IF s.id IS NULL THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 ELSE SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND operator_id=actor AND status='open' ORDER BY opened_at DESC,id DESC LIMIT 1 OFFSET(p_session_page-1)*5;END IF;
 WITH candidates AS(SELECT svc.id,svc.code,v.name,v.category,v.unit,v.price_cents,v.number version,v.effective_from FROM public.services svc CROSS JOIN LATERAL(SELECT ver.* FROM public.service_versions ver WHERE ver.office_id=svc.office_id AND ver.service_id=svc.id AND ver.effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1)v WHERE svc.office_id=p_office_id AND private.quick_eligible19(v.definition) AND caps @> ARRAY(SELECT jsonb_array_elements_text(v.definition->'required_capabilities')) AND(btrim(p_query)='' OR strpos(lower(svc.code||' '||v.name||' '||v.category),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY code,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY code,id) FROM page),'[]') INTO total,items;
 result:=jsonb_build_object('enabled',true,'services',items,'services_total',total,'page',p_page,'page_size',5,'sessions',coalesce((SELECT jsonb_agg(private.quick_session19(x) ORDER BY opened_at DESC,id DESC) FROM(SELECT * FROM private.cash_sessions WHERE office_id=p_office_id AND operator_id=actor AND status='open' ORDER BY opened_at DESC,id DESC LIMIT 5 OFFSET(p_session_page-1)*5)x),'[]'),'sessions_total',(SELECT count(*) FROM private.cash_sessions WHERE office_id=p_office_id AND operator_id=actor AND status='open'),'session_page',p_session_page,'selected_session',CASE WHEN s.id IS NOT NULL THEN private.quick_session19(s) END);
 WITH candidates AS(SELECT m.id,m.name,m.type,a.name account_name FROM private.payment_methods m JOIN private.financial_accounts a ON a.office_id=m.office_id AND a.unit_id=m.unit_id AND a.id=m.destination_account_id JOIN private.cash_units u ON u.office_id=m.office_id AND u.id=m.unit_id WHERE m.office_id=p_office_id AND m.unit_id=s.unit_id AND m.active AND a.active AND u.active AND(m.type<>'cash' OR a.id=s.cash_account_id)),page AS(SELECT * FROM candidates ORDER BY name,id LIMIT 50 OFFSET(p_method_page-1)*50)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY name,id) FROM page),'[]') INTO total,items;
 RETURN result||jsonb_build_object('methods',items,'methods_total',total,'method_page',p_method_page);
END $$;
CREATE FUNCTION private.quick_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE actor uuid;s private.cash_sessions;svc public.services;v public.service_versions;m public.memberships;method private.payment_methods;account private.financial_accounts;cmd private.cash_commands;key uuid;sid uuid;serviceid uuid;quantity integer;expected integer;servicever integer;quoted bigint;digest text;snap jsonb;req jsonb;rid uuid;cid uuid;pid uuid;q private.quick_operations;out_result jsonb;keys text[]:=ARRAY['session_id','expected_session_version','service_id','expected_service_version','quantity','adjustment','quoted_total_cents','payment_method_id','presented_cents','fee_cents','settlement','settled_on','external_reference','evidence','idempotency_key'];BEGIN
 actor:=private.finance19_actor(p_office_id,true,true);
 IF jsonb_typeof(p_operation) IS DISTINCT FROM 'object' OR NOT p_operation ?& keys OR(SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) OR jsonb_typeof(p_operation->'evidence') IS DISTINCT FROM 'string' OR NOT private.finance17_text(p_operation->>'evidence',5,500) THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 key:=private.request_uuid(p_operation->'idempotency_key');sid:=private.request_uuid(p_operation->'session_id');serviceid:=private.request_uuid(p_operation->'service_id');
 quantity:=(p_operation->>'quantity')::integer;expected:=(p_operation->>'expected_session_version')::integer;servicever:=(p_operation->>'expected_service_version')::integer;quoted:=(p_operation->>'quoted_total_cents')::bigint;
 IF quantity IS NULL OR quantity NOT BETWEEN 1 AND 100000 OR expected IS NULL OR expected NOT BETWEEN 1 AND 2147483645 OR servicever IS NULL OR servicever NOT BETWEEN 1 AND 2147483646 OR quoted IS NULL OR quoted NOT BETWEEN 0 AND 1000000000000 OR EXISTS(SELECT FROM unnest(ARRAY['quantity','expected_session_version','expected_service_version','quoted_total_cents'])k WHERE jsonb_typeof(p_operation->k) IS DISTINCT FROM 'number' OR(p_operation->>k)::numeric<>trunc((p_operation->>k)::numeric)) THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 SELECT * INTO svc FROM public.services WHERE office_id=p_office_id AND id=serviceid FOR SHARE;
 -- Acquire configuration locks before choosing catalog vigency, including a method/account wait.
 PERFORM 1 FROM private.cash_units u WHERE u.office_id=p_office_id AND u.id=s.unit_id FOR SHARE;
 PERFORM 1 FROM private.financial_accounts a WHERE a.office_id=p_office_id AND a.unit_id=s.unit_id AND a.id=s.cash_account_id FOR SHARE;
 IF quoted>0 THEN
 SELECT * INTO method FROM private.payment_methods pm WHERE pm.office_id=p_office_id AND pm.unit_id=s.unit_id AND pm.id=private.request_uuid(p_operation->'payment_method_id') FOR SHARE;
 SELECT * INTO account FROM private.financial_accounts a WHERE a.office_id=p_office_id AND a.unit_id=s.unit_id AND a.id=method.destination_account_id FOR SHARE;
 END IF;
 actor:=private.finance19_actor(p_office_id,true,true);m:=private.requests_actor(p_office_id,true,'requests.create');
 IF s.id IS NULL OR s.operator_id<>actor OR svc.id IS NULL THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='quick' AND idempotency_key=key;
 IF FOUND THEN
 IF cmd.actor_id<>actor OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT i.snapshot INTO snap FROM public.request_items i WHERE i.office_id=p_office_id AND i.request_id=(cmd.result->>'request_id')::uuid;
 IF snap IS NULL OR NOT private.current_permissions(p_office_id) @> ARRAY(SELECT jsonb_array_elements_text(snap->'definition'->'required_capabilities')) OR(snap->'adjustment'->>'kind'<>'none' AND NOT private.current_permissions(p_office_id) @> ARRAY[CASE snap->'adjustment'->>'kind' WHEN 'override' THEN 'services.price_override' ELSE 'services.'||(snap->'adjustment'->>'kind') END]) THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN cmd.result||jsonb_build_object('statement',private.cash_statement_record(s,actor,1));END IF;
 SELECT * INTO v FROM public.service_versions WHERE office_id=p_office_id AND service_id=svc.id AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1;
 IF v.id IS NULL OR NOT private.quick_eligible19(v.definition) THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;
 IF s.status<>'open' OR s.version<>expected OR v.number<>servicever OR NOT EXISTS(SELECT FROM private.cash_units u JOIN private.financial_accounts a ON a.office_id=u.office_id AND a.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND a.id=s.cash_account_id AND u.active AND a.active) THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;
 snap:=private.services_snapshot(svc,v,quantity,p_operation->'adjustment',private.current_permissions(p_office_id));
 IF(snap->>'total_cents')::bigint<>quoted THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'quick',key,actor,digest);
 req:=private.request_create(p_office_id,jsonb_build_object('origin','presencial','title',v.name,'customer_id',NULL,'assignee_id',m.id,'priority','normal','priority_reason','','internal_note','','items',jsonb_build_array(jsonb_build_object('service_id',svc.id,'quantity',quantity,'adjustment',p_operation->'adjustment','fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))),md5('jn19:request:'||key)::uuid,md5('jn19:request-event:'||key)::uuid);
 rid:=(req->>'id')::uuid;
 -- Capture10 must match the final current version/total, even when vigency advances during dependency waits.
 IF NOT EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=rid AND version_id=v.id AND(snapshot->>'total_cents')::bigint=quoted) THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.charges_create(p_office_id,rid,jsonb_build_array(jsonb_build_object('due_date',current_date,'amount_cents',quoted)),md5('jn19:charge:'||key)::uuid);
 SELECT id INTO cid FROM private.charges WHERE office_id=p_office_id AND request_id=rid;
 IF quoted>0 THEN
 PERFORM private.payment_operate(p_office_id,jsonb_build_object('kind','record','session_id',s.id,'expected_version',expected,'idempotency_key',md5('jn19:payment:'||key)::uuid,'evidence',p_operation->'evidence','payment_method_id',p_operation->'payment_method_id','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',cid,'expected_charge_version',1,'amount_cents',quoted)),'presented_cents',p_operation->'presented_cents','fee_cents',p_operation->'fee_cents','settlement',p_operation->'settlement','settled_on',p_operation->'settled_on','external_reference',p_operation->'external_reference'));
 SELECT a.payment_id INTO pid FROM private.payment_allocations a WHERE a.office_id=p_office_id AND a.charge_id=cid;
 ELSE
 IF p_operation->'payment_method_id'<>'null'::jsonb OR p_operation->'presented_cents'<>'null'::jsonb OR p_operation->'fee_cents'<>'0'::jsonb OR p_operation->'settlement'<>'"not_applicable"'::jsonb OR p_operation->'settled_on'<>'null'::jsonb OR p_operation->'external_reference'<>'null'::jsonb THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;
 PERFORM private.request_mutate(p_office_id,rid,1,'{"kind":"status","status":"concluido","reason":"Atendimento rapido concluido"}',md5('jn19:complete:'||key)::uuid);
 actor:=private.finance19_actor(p_office_id,true,true);
 PERFORM set_config('jn.cash_command',key::text,true);
 INSERT INTO private.quick_operations(office_id,session_id,unit_id,operator_id,request_id,charge_id,payment_id,command_key)VALUES(p_office_id,s.id,s.unit_id,actor,rid,cid,pid,key)RETURNING * INTO q;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=s.id;
 out_result:=jsonb_build_object('id',q.id,'request_id',rid,'protocol',req->'protocol','charge_id',cid,'payment_id',pid,'total_cents',quoted,'completed_at',q.completed_at,'statement',private.cash_statement_record(s,actor,1));
 PERFORM private.emit_business_event(p_office_id,'quick.completed','request',rid,key,'{}');
 PERFORM set_config('jn.cash_command',key::text,true);UPDATE private.cash_commands c SET result=out_result WHERE office_id=p_office_id AND kind='quick' AND idempotency_key=key;PERFORM set_config('jn.cash_command','',true);RETURN out_result;
END $$;
CREATE FUNCTION private.finance19_settings(p_office uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('timezone',coalesce(s.timezone,'UTC'),'version',coalesce(s.version,0),'configured',s.office_id IS NOT NULL,'can_manage',private.current_permissions(p_office) @> ARRAY['finance.reports.manage','finance.reports.read'] AND EXISTS(SELECT FROM public.memberships WHERE office_id=p_office AND user_id=auth.uid() AND active AND role_code IN('owner','admin'))) FROM(SELECT 1)x LEFT JOIN private.finance_report_settings s ON s.office_id=p_office;
$$;
CREATE FUNCTION private.finance_report_context(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.finance19_actor(p_office_id);RETURN jsonb_build_object('enabled',true,'settings',private.finance19_settings(p_office_id),'can_read_all',private.current_permissions(p_office_id) @> ARRAY['finance.reports.read_all','cash.read_all'],'can_export',private.current_permissions(p_office_id) @> ARRAY['finance.reports.export']);END $$;
CREATE FUNCTION private.finance_report_settings(p_office_id uuid,p_timezone text,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;cmd private.cash_commands;digest text;out_result jsonb;version integer;BEGIN
 actor:=private.finance19_actor(p_office_id,true);
 IF NOT(private.finance19_settings(p_office_id)->>'can_manage')::boolean THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_timezone IS NULL OR char_length(p_timezone)>100 OR NOT EXISTS(SELECT FROM pg_timezone_names WHERE name=p_timezone) OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483645 OR p_idempotency_key IS NULL OR NOT coalesce(private.finance17_text(p_reason,5,500),false) THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('timezone',p_timezone,'version',p_expected_version,'reason',p_reason)::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='report_settings' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.actor_id<>actor OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.finance19_settings(p_office_id);END IF;
 SELECT s.version INTO version FROM private.finance_report_settings s WHERE s.office_id=p_office_id FOR UPDATE;
 actor:=private.finance19_actor(p_office_id,true);IF NOT(private.finance19_settings(p_office_id)->>'can_manage')::boolean THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF coalesce(version,0)<>p_expected_version THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'report_settings',p_idempotency_key,actor,digest);
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 INSERT INTO private.finance_report_settings(office_id,timezone,version,actor_id)VALUES(p_office_id,p_timezone,p_expected_version+1,actor)ON CONFLICT(office_id)DO UPDATE SET timezone=excluded.timezone,version=excluded.version,actor_id=excluded.actor_id,updated_at=clock_timestamp();
 out_result:=private.finance19_settings(p_office_id);PERFORM private.emit_business_event(p_office_id,'finance.report_timezone_changed','office',p_office_id,p_idempotency_key,'{}');
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);UPDATE private.cash_commands SET result=out_result WHERE office_id=p_office_id AND kind='report_settings' AND idempotency_key=p_idempotency_key;PERFORM set_config('jn.cash_command','',true);RETURN out_result;
END $$;
-- Validated canonical filters carry no timezone from the browser. Scope is revalidated for exports.
CREATE FUNCTION private.finance19_filters(p_office uuid,f jsonb,p_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET datestyle='ISO,YMD' AS $$
DECLARE actor uuid;keys text[]:=ARRAY['view','scope','from_date','until_date','unit_id','operator_id','service_id','payment_type','account_id','status','customer_id'];v text;sc text;a date;b date;key text;filterid uuid;BEGIN
 actor:=private.finance19_actor(p_office,false,false,p_export);
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR NOT f ?& keys OR(SELECT count(*) FROM jsonb_object_keys(f))<>cardinality(keys) OR EXISTS(SELECT FROM unnest(ARRAY['view','scope','from_date','until_date','payment_type','status'])k WHERE jsonb_typeof(f->k) IS DISTINCT FROM 'string') THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 v:=f->>'view';sc:=f->>'scope';
 IF v NOT IN('obligations','movements','cash') OR sc NOT IN('own','all') OR f->>'payment_type' NOT IN('all','cash','pix','card','transfer') OR f->>'from_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR f->>'until_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
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
CREATE FUNCTION private.finance_report_options(p_office_id uuid,p_kind text,p_query text,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;all_scope boolean;out_result jsonb;total bigint;BEGIN
 actor:=private.finance19_actor(p_office_id);all_scope:=private.current_permissions(p_office_id) @> ARRAY['finance.reports.read_all','cash.read_all'];
 IF p_kind IS NULL OR p_kind NOT IN('units','operators','accounts','services','customers') OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_kind='customers' AND NOT private.current_permissions(p_office_id) @> ARRAY['customers.read'] THEN RAISE EXCEPTION 'FINANCE19_FORBIDDEN' USING ERRCODE='PT403';END IF;
 WITH options AS(
 SELECT u.id,u.name label FROM private.cash_units u WHERE p_kind='units' AND u.office_id=p_office_id AND(all_scope OR EXISTS(SELECT FROM private.cash_sessions s WHERE s.office_id=u.office_id AND s.unit_id=u.id AND s.operator_id=actor))
 UNION ALL SELECT a.id,a.name FROM private.financial_accounts a WHERE p_kind='accounts' AND a.office_id=p_office_id AND(all_scope OR EXISTS(SELECT FROM private.cash_sessions s WHERE s.office_id=a.office_id AND s.unit_id=a.unit_id AND s.operator_id=actor))
 UNION ALL SELECT m.user_id,coalesce(private.customer_relation_display_label(p.display_name),'Operador') FROM public.memberships m LEFT JOIN public.profiles p ON p.id=m.user_id WHERE p_kind='operators' AND m.office_id=p_office_id AND m.role_code<>'client' AND(all_scope OR m.user_id=actor)
 UNION ALL SELECT s.id,v.name FROM public.services s CROSS JOIN LATERAL(SELECT name FROM public.service_versions v WHERE v.office_id=s.office_id AND v.service_id=s.id ORDER BY (effective_from<=clock_timestamp()) DESC,number DESC LIMIT 1)v WHERE p_kind='services' AND s.office_id=p_office_id
 UNION ALL SELECT c.id,'Cliente vinculado' FROM public.customers c WHERE p_kind='customers' AND c.office_id=p_office_id AND private.customer_in_scope(c,actor)
 ),candidates AS(SELECT DISTINCT id,label FROM options WHERE btrim(p_query)='' OR strpos(lower(label),lower(btrim(p_query)))>0),page AS(SELECT * FROM candidates ORDER BY label,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY label,id) FROM page),'[]') INTO total,out_result;
 RETURN jsonb_build_object('kind',p_kind,'items',out_result,'total',total,'page',p_page,'page_size',5);
END $$;
-- Explicitly project only the report contract. No request note, evidence, payee or customer name.
CREATE FUNCTION private.finance19_row(id uuid,kind text,occurred_at timestamptz,reference text,description text,operator_name text,unit_name text,method_name text,account_name text,customer_label text,status text,amount numeric DEFAULT NULL,paid numeric DEFAULT NULL,balance numeric DEFAULT NULL,expected numeric DEFAULT NULL,counted numeric DEFAULT NULL,difference numeric DEFAULT NULL) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
 SELECT jsonb_build_object('id',id,'kind',kind,'occurred_at',occurred_at,'reference',reference,'description',description,'operator_name',operator_name,'unit_name',unit_name,'method_name',method_name,'account_name',account_name,'customer_label',customer_label,'status',status,'amount_cents',private.finance19_safe(amount),'paid_cents',private.finance19_safe(paid),'balance_cents',private.finance19_safe(balance),'expected_cents',private.finance19_safe(expected),'counted_cents',private.finance19_safe(counted),'difference_cents',private.finance19_safe(difference));
$$;
CREATE FUNCTION private.finance19_rows(p_office uuid,f jsonb,p_from timestamptz,p_until timestamptz) RETURNS TABLE(data jsonb,fee numeric,unknown_fee boolean) LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=auth.uid();uid uuid:=(f->>'unit_id')::uuid;opid uuid:=(f->>'operator_id')::uuid;svcid uuid:=(f->>'service_id')::uuid;accid uuid:=(f->>'account_id')::uuid;custid uuid:=(f->>'customer_id')::uuid;BEGIN
 IF f->>'view'='obligations' THEN RETURN QUERY
 WITH candidates AS(SELECT c.*,r.protocol,r.customer_id,coalesce(private.customer_relation_display_label(p.display_name),'Operador') operator_name,
 (SELECT string_agg(DISTINCT i.snapshot->'definition'->>'name',', ' ORDER BY i.snapshot->'definition'->>'name') FROM private.charge_items i WHERE i.office_id=c.office_id AND i.charge_id=c.id) description,
 coalesce((SELECT sum(e.delta_cents) FROM private.charge_events e WHERE e.office_id=c.office_id AND e.charge_id=c.id AND e.created_at<p_until),0) due,
 coalesce((SELECT sum(e.applied_cents) FROM private.cash_entries e WHERE e.office_id=c.office_id AND e.charge_id=c.id AND e.created_at<p_until),0) paid,
 EXISTS(SELECT FROM private.charge_events e WHERE e.office_id=c.office_id AND e.charge_id=c.id AND e.kind='cancelled' AND e.created_at<p_until) cancelled
 FROM private.charges c JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id LEFT JOIN public.profiles p ON p.id=c.created_by WHERE c.office_id=p_office AND c.created_at>=p_from AND c.created_at<p_until AND(f->>'scope'='all' OR c.created_by=actor) AND(opid IS NULL OR c.created_by=opid) AND(custid IS NULL OR r.customer_id=custid) AND(svcid IS NULL OR EXISTS(SELECT FROM private.charge_items i WHERE i.office_id=c.office_id AND i.charge_id=c.id AND(i.snapshot->>'service_id')::uuid=svcid))),rows AS(SELECT *,CASE WHEN cancelled THEN 'cancelled' WHEN due=0 THEN 'zero' WHEN due-paid<=0 THEN 'paid' ELSE 'open' END status FROM candidates)
 SELECT private.finance19_row(id,'obligation',created_at,protocol,coalesce(description,'Servico'),operator_name,NULL,NULL,NULL,CASE WHEN customer_id IS NULL THEN 'Sem cadastro' ELSE 'Cliente vinculado' END,status,due,paid,due-paid),NULL::numeric,false FROM rows WHERE f->>'status'='all' OR rows.status=f->>'status';
 ELSIF f->>'view'='movements' THEN RETURN QUERY
 SELECT private.finance19_row(e.id,projection.kind,e.created_at,coalesce(r.protocol,'MOV-'||substr(e.id::text,1,8)),
 CASE WHEN e.kind='expense_paid' THEN coalesce(x.category,'Despesa') WHEN e.kind IN('transfer_in','transfer_out') THEN 'Transferencia interna' ELSE coalesce((SELECT string_agg(DISTINCT i.snapshot->'definition'->>'name',', ' ORDER BY i.snapshot->'definition'->>'name') FROM private.charge_items i WHERE i.office_id=e.office_id AND i.charge_id=e.charge_id),'Servico') END,
 coalesce(private.customer_relation_display_label(p.display_name),'Operador'),s.unit_name,e.payment_method_name,e.account_name,CASE WHEN e.charge_id IS NULL THEN NULL WHEN r.customer_id IS NULL THEN 'Sem cadastro' ELSE 'Cliente vinculado' END,'confirmed',e.amount_cents),NULL::numeric,false
 FROM private.cash_entries e
 -- Before16, BOTH refunded/reversed released allocation AND paid funds back.
 -- Project both facts with (kind,id) identity; never mutate or duplicate the received ledger.
 CROSS JOIN LATERAL unnest(CASE WHEN e.kind IN('refunded','reversed') THEN ARRAY['reversal','refund'] ELSE ARRAY[CASE e.kind WHEN 'allocation_reversed' THEN 'reversal' WHEN 'refund_paid' THEN 'refund' WHEN 'expense_paid' THEN 'expense' ELSE e.kind END] END)projection(kind)
 JOIN private.cash_sessions s ON s.office_id=e.office_id AND s.id=e.session_id LEFT JOIN public.requests r ON r.office_id=e.office_id AND r.id=e.request_id LEFT JOIN public.profiles p ON p.id=e.actor_id LEFT JOIN private.expenses x ON x.office_id=e.office_id AND x.entry_id=e.id
 WHERE e.office_id=p_office AND e.kind IN('received','allocation_reversed','refund_paid','refunded','reversed','expense_paid','transfer_in','transfer_out') AND e.created_at>=p_from AND e.created_at<p_until AND(f->>'scope'='all' OR e.actor_id=actor) AND(opid IS NULL OR e.actor_id=opid) AND(uid IS NULL OR e.unit_id=uid) AND(accid IS NULL OR e.account_id=accid) AND(f->>'payment_type'='all' OR e.payment_type=f->>'payment_type') AND(custid IS NULL OR r.customer_id=custid) AND(svcid IS NULL OR EXISTS(SELECT FROM private.charge_items i WHERE i.office_id=e.office_id AND i.charge_id=e.charge_id AND(i.snapshot->>'service_id')::uuid=svcid))
 UNION ALL
 SELECT private.finance19_row(p.id,'fee',d.created_at,'TAX-'||substr(p.id::text,1,8),'Taxa de cartao',coalesce(private.customer_relation_display_label(pr.display_name),'Operador'),s.unit_name,p.method_name,p.account_name,NULL,'confirmed',p.fee_cents),p.fee_cents,p.fee_cents IS NULL
 FROM private.payments p JOIN private.payment_decisions d ON d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed' JOIN private.cash_sessions s ON s.office_id=p.office_id AND s.id=p.session_id LEFT JOIN public.profiles pr ON pr.id=d.actor_id
 WHERE p.office_id=p_office AND p.payment_type='card' AND d.created_at>=p_from AND d.created_at<p_until AND(f->>'scope'='all' OR d.actor_id=actor) AND(opid IS NULL OR d.actor_id=opid) AND(uid IS NULL OR p.unit_id=uid) AND(accid IS NULL OR p.account_id=accid) AND(f->>'payment_type' IN('all','card')) AND svcid IS NULL AND custid IS NULL;
 ELSE RETURN QUERY
 WITH candidates AS(SELECT s.*,s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.created_at<p_until),0) expected,
 CASE WHEN s.closed_at<p_until THEN 'closed' ELSE 'open' END asof_status,
 CASE WHEN s.closed_at<p_until THEN coalesce((SELECT(g->>'counted_cents')::bigint FROM private.cash_closures c CROSS JOIN LATERAL jsonb_array_elements(c.groups)g WHERE c.office_id=s.office_id AND c.session_id=s.id AND c.kind='close' AND c.created_at<p_until AND g->>'payment_type'='cash' ORDER BY c.created_at,c.id LIMIT 1),(SELECT e.counted_cents FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.kind='closed' AND e.created_at<p_until ORDER BY e.created_at,e.id LIMIT 1)) END counted
 FROM private.cash_sessions s WHERE s.office_id=p_office AND s.opened_at>=p_from AND s.opened_at<p_until AND(f->>'scope'='all' OR s.operator_id=actor) AND(opid IS NULL OR s.operator_id=opid) AND(uid IS NULL OR s.unit_id=uid) AND(accid IS NULL OR s.cash_account_id=accid))
 SELECT private.finance19_row(id,'cash',opened_at,'CX-'||substr(id::text,1,8),'Posicao de especie',operator_name,unit_name,NULL,account_name,NULL,asof_status,NULL,NULL,NULL,expected,counted,counted-expected),NULL::numeric,false FROM candidates WHERE f->>'status'='all' OR asof_status=f->>'status';
 END IF;
END $$;
CREATE FUNCTION private.finance19_build(p_office uuid,f jsonb,p_limit integer DEFAULT 1001,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE zone text;begin_at timestamptz;end_at timestamptz;out_result jsonb;BEGIN
 zone:=private.finance19_settings(p_office)->>'timezone';begin_at:=(f->>'from_date')::date::timestamp AT TIME ZONE zone;end_at:=(f->>'until_date')::date::timestamp AT TIME ZONE zone;
 -- Summaries inspect the complete cohort, but only the requested row window is aggregated into an array.
 WITH rows AS MATERIALIZED(SELECT * FROM private.finance19_rows(p_office,f,begin_at,end_at)),totals AS(SELECT count(*) total,

 sum((data->>'amount_cents')::numeric) FILTER(WHERE data->>'kind'='obligation') contracted,
 sum((data->>'amount_cents')::numeric) FILTER(WHERE data->>'kind'='received') received,
 sum((data->>'balance_cents')::numeric) balance,
 sum((data->>'amount_cents')::numeric) FILTER(WHERE data->>'kind'='expense') expense,
 sum((data->>'amount_cents')::numeric) FILTER(WHERE data->>'kind'='reversal') reversed,
 sum((data->>'amount_cents')::numeric) FILTER(WHERE data->>'kind'='refund') refund,
 sum(fee) fees,count(*) FILTER(WHERE unknown_fee) unknown,
 sum((data->>'expected_cents')::numeric) expected,sum((data->>'counted_cents')::numeric) counted,
 count(*) FILTER(WHERE (data->>'difference_cents')::numeric<>0) divergence
 FROM rows)
 SELECT jsonb_build_object('filters',f,'timezone',zone,'from_utc',begin_at,'until_utc',end_at,'generated_at',statement_timestamp(),'total',total,'items',coalesce((SELECT jsonb_agg(data ORDER BY (data->>'occurred_at')::timestamptz DESC,data->>'id',data->>'kind') FROM(SELECT data FROM rows ORDER BY (data->>'occurred_at')::timestamptz DESC,data->>'id',data->>'kind' LIMIT p_limit OFFSET p_offset)limited),'[]'),
 'summary',jsonb_build_object('contracted_cents',CASE WHEN f->>'view'='obligations' THEN private.finance19_safe(coalesce(contracted,0)) END,
 'received_cents',CASE WHEN f->>'view'='movements' THEN private.finance19_safe(coalesce(received,0)) END,
 'allocated_cents',CASE WHEN f->>'view'='obligations' THEN private.finance19_safe(coalesce(contracted-balance,0)) END,
 'balance_cents',CASE WHEN f->>'view'='obligations' THEN private.finance19_safe(coalesce(balance,0)) END,
 'expense_cents',CASE WHEN f->>'view'='movements' THEN private.finance19_safe(coalesce(expense,0)) END,
 'reversed_cents',CASE WHEN f->>'view'='movements' THEN private.finance19_safe(coalesce(reversed,0)) END,
 'refund_cents',CASE WHEN f->>'view'='movements' THEN private.finance19_safe(coalesce(refund,0)) END,
 'fee_cents',CASE WHEN f->>'view'='movements' AND f->>'service_id' IS NULL AND f->>'customer_id' IS NULL AND unknown=0 THEN private.finance19_safe(coalesce(fees,0)) END,
 'cash_expected_cents',CASE WHEN f->>'view'='cash' THEN private.finance19_safe(coalesce(expected,0)) END,
 'cash_counted_cents',CASE WHEN f->>'view'='cash' AND NOT EXISTS(SELECT FROM rows WHERE data->>'counted_cents' IS NULL) THEN private.finance19_safe(coalesce(counted,0)) END,
 'divergence_count',CASE WHEN f->>'view'='cash' THEN divergence END,'unknown_fee_count',unknown)) INTO out_result FROM totals;
 RETURN out_result;
END $$;
CREATE FUNCTION private.finance_report_page(p_office_id uuid,p_filters jsonb,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f jsonb;out_result jsonb;BEGIN
 f:=private.finance19_filters(p_office_id,p_filters);IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 out_result:=private.finance19_build(p_office_id,f,5,(p_page-1)*5);
 RETURN out_result||jsonb_build_object('page',p_page,'page_size',5);
END $$;
CREATE FUNCTION private.finance_report_begin(p_office_id uuid,p_filters jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;f jsonb;cmd private.cash_commands;digest text;report jsonb;out_result jsonb;id uuid:=gen_random_uuid();office_name text;operator_name text;BEGIN
 actor:=private.finance19_actor(p_office_id,true,false,true);f:=private.finance19_filters(p_office_id,p_filters,true);
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(f::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='report_begin' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.actor_id<>actor OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 -- One STABLE query captures rows, totals and timezone in one MVCC view.
 report:=private.finance19_build(p_office_id,f,1001,0);IF(report->>'total')::bigint>1000 THEN RAISE EXCEPTION 'FINANCE19_LIMIT' USING ERRCODE='PT422';END IF;
 SELECT name INTO office_name FROM public.offices WHERE offices.id=p_office_id;SELECT coalesce(private.customer_relation_display_label(display_name),'Operador') INTO operator_name FROM public.profiles WHERE profiles.id=actor;
 out_result:=(report-ARRAY['generated_at','items'])||jsonb_build_object('id',id,'protocol','FIN-'||upper(replace(id::text,'-','')),'contract_version',1,'created_at',report->'generated_at','office_name',office_name,'operator_name',coalesce(operator_name,'Operador'));
 actor:=private.finance19_actor(p_office_id,true,false,true);PERFORM private.finance19_filters(p_office_id,f,true);
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'report_begin',p_idempotency_key,actor,digest);
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 INSERT INTO private.finance_report_snapshots(id,office_id,actor_id,command_key,snapshot,rows)VALUES(id,p_office_id,actor,p_idempotency_key,out_result,report->'items');
 PERFORM private.emit_business_event(p_office_id,'finance.report_prepared','office',p_office_id,p_idempotency_key,jsonb_build_object('report_id',id,'count',report->'total'));
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);UPDATE private.cash_commands SET result=out_result WHERE office_id=p_office_id AND kind='report_begin' AND idempotency_key=p_idempotency_key;PERFORM set_config('jn.cash_command','',true);RETURN out_result;
END $$;
CREATE FUNCTION private.finance19_snapshot(p_office uuid,p_report uuid) RETURNS private.finance_report_snapshots LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid;r private.finance_report_snapshots;BEGIN
 actor:=private.finance19_actor(p_office,false,false,true);SELECT * INTO r FROM private.finance_report_snapshots WHERE office_id=p_office AND id=p_report FOR SHARE;
 actor:=private.finance19_actor(p_office,false,false,true);
 IF r.id IS NULL OR r.actor_id<>actor THEN RAISE EXCEPTION 'FINANCE19_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.finance19_filters(p_office,r.snapshot->'filters',true);RETURN r;
END $$;
CREATE FUNCTION private.finance_report_chunk(p_office_id uuid,p_report_id uuid,p_offset integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.finance_report_snapshots;BEGIN
 r:=private.finance19_snapshot(p_office_id,p_report_id);
 IF p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000 OR p_offset%500<>0 OR p_offset>jsonb_array_length(r.rows) THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(x ORDER BY n) FROM jsonb_array_elements(r.rows)WITH ORDINALITY a(x,n) WHERE n>p_offset AND n<=p_offset+500),'[]'),'offset',p_offset,'total',jsonb_array_length(r.rows));
END $$;
CREATE FUNCTION private.finance_report_authorize(p_office_id uuid,p_report_id uuid,p_format text,p_download_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;r private.finance_report_snapshots;cmd private.cash_commands;digest text;BEGIN
 actor:=private.finance19_actor(p_office_id,true,false,true);r:=private.finance19_snapshot(p_office_id,p_report_id);
 IF p_format IS NULL OR p_format NOT IN('csv','pdf') OR p_download_key IS NULL THEN RAISE EXCEPTION 'FINANCE19_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('report_id',p_report_id,'format',p_format)::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='report_authorize' AND idempotency_key=p_download_key;
 IF FOUND THEN IF cmd.actor_id<>actor OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'FINANCE19_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'report_authorize',p_download_key,actor,digest);
 PERFORM private.emit_business_event(p_office_id,'finance.report_exported','office',p_office_id,p_download_key,jsonb_build_object('report_id',p_report_id,'format',p_format,'count',jsonb_array_length(r.rows)));
 PERFORM set_config('jn.cash_command',p_download_key::text,true);UPDATE private.cash_commands SET result='{"authorized":true}' WHERE office_id=p_office_id AND kind='report_authorize' AND idempotency_key=p_download_key;PERFORM set_config('jn.cash_command','',true);RETURN '{"authorized":true}'::jsonb;
END $$;
CREATE FUNCTION public.quick_context(p_office_id uuid,p_session_id uuid,p_query text,p_page integer,p_session_page integer,p_method_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.quick_context(p_office_id,p_session_id,p_query,p_page,p_session_page,p_method_page);$$;
CREATE FUNCTION public.quick_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.quick_operate(p_office_id,p_operation);$$;
CREATE FUNCTION public.finance_report_context(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_context(p_office_id);$$;
CREATE FUNCTION public.finance_report_options(p_office_id uuid,p_kind text,p_query text,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_options(p_office_id,p_kind,p_query,p_page);$$;
CREATE FUNCTION public.finance_report_page(p_office_id uuid,p_filters jsonb,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_page(p_office_id,p_filters,p_page);$$;
CREATE FUNCTION public.finance_report_settings(p_office_id uuid,p_timezone text,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_settings(p_office_id,p_timezone,p_expected_version,p_reason,p_idempotency_key);$$;
CREATE FUNCTION public.finance_report_begin(p_office_id uuid,p_filters jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_begin(p_office_id,p_filters,p_idempotency_key);$$;
CREATE FUNCTION public.finance_report_chunk(p_office_id uuid,p_report_id uuid,p_offset integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_chunk(p_office_id,p_report_id,p_offset);$$;
CREATE FUNCTION public.finance_report_authorize(p_office_id uuid,p_report_id uuid,p_format text,p_download_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance_report_authorize(p_office_id,p_report_id,p_format,p_download_key);$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND(proname LIKE 'finance19_%' OR proname LIKE 'quick_%' OR proname LIKE 'finance_report_%') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN('quick_context','quick_operate','finance_report_context','finance_report_options','finance_report_page','finance_report_settings','finance_report_begin','finance_report_chunk','finance_report_authorize') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;END LOOP;END $$;
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2,3,4,5,6));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 6;
NOTIFY pgrst,'reload schema';
