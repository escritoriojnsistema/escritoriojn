-- Etapa18. Immutable reconciliation snapshots; reuse the existing cash ledger and locks.
INSERT INTO public.permissions(code,name) VALUES('cash.closure.approve','Revisar divergencias de caixa'),('cash.closure.adjust','Ajustar conferencia de caixa') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('cash.closure.approve','cash.closure.adjust') ON CONFLICT DO NOTHING;
DO $migration$ DECLARE r record;d text;extra text:=', ''cash.closure.approve'', ''cash.closure.adjust''';BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cash.read%' LOOP
 d:=replace(r.def,'''cash.read''::text','''cash.read''::text'||replace(extra,', ','::text, ')||'::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP d:=pg_get_functiondef(r.oid);d:=replace(d,'''cash.read''','''cash.read'''||extra);EXECUTE d;END LOOP;
END $migration$;
ALTER TABLE private.cash_commands DROP CONSTRAINT cash_commands_kind_check;
ALTER TABLE private.cash_commands ADD CONSTRAINT cash_commands_kind_check CHECK(kind IN('configure','open','operate','payment','correction','expense','transfer','receipt','closure'));
CREATE TABLE private.cash_closures(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,session_id uuid NOT NULL,source_id uuid,
 kind text NOT NULL CHECK(kind IN('reconcile','close','adjust')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor_id uuid NOT NULL REFERENCES auth.users(id),actor_name text NOT NULL CHECK(private.finance17_text(actor_name,1,120)),
 reason text NOT NULL CHECK(private.finance17_text(reason,5,500)),groups jsonb NOT NULL CHECK(jsonb_typeof(groups)='array' AND jsonb_array_length(groups) BETWEEN 1 AND 100),
 has_difference boolean NOT NULL,differences_count integer NOT NULL CHECK(differences_count BETWEEN 0 AND 100),absolute_difference_cents bigint NOT NULL CHECK(absolute_difference_cents BETWEEN 0 AND 9007199254740991),
 command_key uuid NOT NULL,UNIQUE(office_id,id),UNIQUE(office_id,command_key),
 FOREIGN KEY(office_id,session_id) REFERENCES private.cash_sessions(office_id,id),FOREIGN KEY(office_id,source_id) REFERENCES private.cash_closures(office_id,id),
 CHECK((kind='adjust')=(source_id IS NOT NULL)),CHECK(has_difference=(differences_count>0)),CHECK(has_difference=(absolute_difference_cents>0))
);
CREATE INDEX cash_closures_session_idx ON private.cash_closures(office_id,session_id,created_at DESC,id DESC);
CREATE INDEX cash_closures_sources_idx ON private.cash_closures(office_id,actor_id,created_at DESC,id DESC) WHERE kind='close';
CREATE INDEX cash_closures_source_idx ON private.cash_closures(office_id,source_id);
CREATE INDEX cash_closures_actor_idx ON private.cash_closures(actor_id);
CREATE TABLE private.cash_closure_reviews(
 office_id uuid NOT NULL,record_id uuid NOT NULL,decision text NOT NULL CHECK(decision IN('approve','reject')),
 reason text NOT NULL CHECK(private.finance17_text(reason,5,500)),actor_id uuid NOT NULL REFERENCES auth.users(id),actor_name text NOT NULL CHECK(private.finance17_text(actor_name,1,120)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),command_key uuid NOT NULL,PRIMARY KEY(office_id,record_id),FOREIGN KEY(office_id,record_id) REFERENCES private.cash_closures(office_id,id)
);
CREATE INDEX cash_closure_reviews_actor_idx ON private.cash_closure_reviews(actor_id);
CREATE FUNCTION private.closure_guard18() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM private.cash_commands c WHERE c.office_id=NEW.office_id AND c.kind='closure' AND c.actor_id=auth.uid() AND c.result IS NULL AND c.idempotency_key=NEW.command_key AND c.idempotency_key::text=current_setting('jn.cash_command',true)) OR NEW.actor_id<>auth.uid() THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN NEW;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['cash_closures','cash_closure_reviews'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t);
 EXECUTE format('CREATE TRIGGER command_guard BEFORE INSERT ON private.%I FOR EACH ROW EXECUTE FUNCTION private.closure_guard18()',t);
END LOOP;END $$;
-- No truncation: reject unsafe aggregates before a JSON projection can reach a JS client.
CREATE FUNCTION private.closure_safe18(v numeric) RETURNS bigint LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN IF v IS NULL THEN RETURN NULL;END IF;IF abs(v)>9007199254740991 OR trunc(v)<>v THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN v::bigint;END $$;
CREATE FUNCTION private.closure_groups18(s private.cash_sessions) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 WITH movements AS(
 SELECT e.* FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.kind IN('received','refunded','reversed','refund_paid','expense_paid','transfer_in','transfer_out')
 ),digital AS(
 SELECT payment_type,account_id,(array_agg(account_name ORDER BY created_at DESC,id DESC))[1] account_name,
 sum(CASE WHEN kind IN('received','transfer_in') THEN amount_cents ELSE -amount_cents END) expected,
 sum(CASE WHEN kind IN('received','transfer_in') THEN amount_cents ELSE 0 END) received,
 sum(CASE WHEN kind IN('received','transfer_in') THEN 0 ELSE amount_cents END) returned
 FROM movements WHERE payment_type<>'cash' GROUP BY payment_type,account_id
 ),cards AS(
 SELECT p.account_id,
 CASE WHEN bool_or(p.fee_cents IS NULL) THEN NULL ELSE sum(p.fee_cents) END fee,
 CASE WHEN bool_or(p.fee_cents IS NULL OR p.settlement='unknown') THEN NULL ELSE sum(CASE WHEN p.settlement='settled' OR EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled') THEN p.amount_cents-p.fee_cents ELSE 0 END) END settled,
 CASE WHEN bool_or(p.fee_cents IS NULL OR p.settlement='unknown') THEN NULL ELSE sum(CASE WHEN p.settlement='settled' OR EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled') THEN 0 ELSE p.amount_cents-p.fee_cents END) END pending
 FROM private.payments p WHERE p.office_id=s.office_id AND p.session_id=s.id AND p.payment_type='card' AND EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed') GROUP BY p.account_id
 ),rows AS(
 SELECT 'cash'::text payment_type,s.cash_account_id account_id,s.account_name account_name,s.opening_cents+coalesce((SELECT sum(cash_cents) FROM movements),0) expected,
 coalesce((SELECT sum(greatest(cash_cents,0)) FROM movements),0) received,coalesce((SELECT sum(greatest(-cash_cents,0)) FROM movements),0) returned,0::numeric fee,s.opening_cents+coalesce((SELECT sum(cash_cents) FROM movements),0) net,0::numeric settled,0::numeric pending
 UNION ALL SELECT d.payment_type,d.account_id,d.account_name,d.expected,d.received,d.returned,CASE WHEN d.payment_type='card' THEN c.fee ELSE 0 END,CASE WHEN d.payment_type='card' THEN d.expected-c.fee ELSE d.expected END,CASE WHEN d.payment_type='card' THEN c.settled ELSE 0 END,CASE WHEN d.payment_type='card' THEN c.pending ELSE 0 END FROM digital d LEFT JOIN cards c USING(account_id)
 ) SELECT jsonb_agg(jsonb_build_object('key',payment_type||':'||account_id,'payment_type',payment_type,'account_id',account_id,'account_name',account_name,
 'expected_cents',private.closure_safe18(expected),'received_cents',private.closure_safe18(received),'returned_cents',private.closure_safe18(returned),'fee_cents',private.closure_safe18(fee),'net_cents',private.closure_safe18(net),'settled_cents',private.closure_safe18(settled),'pending_cents',private.closure_safe18(pending)) ORDER BY CASE WHEN payment_type='cash' THEN 0 ELSE 1 END,payment_type,account_id) INTO result FROM rows;
 IF jsonb_array_length(result)>100 THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN result;
END $$;
CREATE FUNCTION private.closure_can18(p_office uuid,p_cap text) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.current_permissions(p_office) @> ARRAY['cash.read',p_cap] AND EXISTS(SELECT FROM public.memberships WHERE office_id=p_office AND user_id=auth.uid() AND active AND role_code IN('owner','admin'));
$$;
CREATE FUNCTION private.closure_json18(r private.cash_closures,p_actor uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (to_jsonb(r)-ARRAY['office_id','actor_id','command_key'])||jsonb_build_object('version',CASE WHEN v.record_id IS NULL THEN 1 ELSE 2 END,'review',CASE WHEN v.record_id IS NULL THEN NULL ELSE jsonb_build_object('decision',v.decision,'reason',v.reason,'actor_name',v.actor_name,'created_at',v.created_at) END,
 'can_review',r.has_difference AND v.record_id IS NULL AND private.closure_can18(r.office_id,'cash.closure.approve') AND(s.operator_id=p_actor OR private.current_permissions(r.office_id) @> ARRAY['cash.read_all']))
 FROM private.cash_sessions s LEFT JOIN private.cash_closure_reviews v ON v.office_id=r.office_id AND v.record_id=r.id WHERE s.office_id=r.office_id AND s.id=r.session_id;
$$;
CREATE FUNCTION private.closure_record(p_office_id uuid,p_record_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;r private.cash_closures;s private.cash_sessions;BEGIN
 caller:=private.cash_actor(p_office_id);SELECT * INTO r FROM private.cash_closures WHERE office_id=p_office_id AND id=p_record_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=r.session_id;
 IF s.operator_id<>caller AND NOT private.current_permissions(p_office_id) @> ARRAY['cash.read_all'] THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN private.closure_json18(r,caller);
END $$;
CREATE FUNCTION private.closure_state(p_office_id uuid,p_session_id uuid,p_page integer,p_source_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;s private.cash_sessions;own boolean;caps text[];BEGIN
 caller:=private.cash_actor(p_office_id);caps:=private.current_permissions(p_office_id);
 IF p_page IS NULL OR p_source_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_source_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p_session_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;own:=s.operator_id=caller;
 IF NOT own AND NOT caps @> ARRAY['cash.read_all'] THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN jsonb_build_object('session_id',s.id,'session_version',s.version,'status',s.status,'can_record',own AND s.status='open' AND caps @> ARRAY['cash.open'],
 'can_adjust',own AND s.status='open' AND caps @> ARRAY['cash.open'] AND private.closure_can18(p_office_id,'cash.closure.adjust'),'groups',private.closure_groups18(s),
 'records',coalesce((SELECT jsonb_agg(private.closure_json18(r,caller) ORDER BY r.created_at DESC,r.id DESC) FROM(SELECT * FROM private.cash_closures WHERE office_id=p_office_id AND session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)r),'[]'::jsonb),
 'total',(SELECT count(*) FROM private.cash_closures WHERE office_id=p_office_id AND session_id=s.id),'page',p_page,'page_size',5,
 'sources',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'session_id',r.session_id,'created_at',r.created_at,'actor_name',r.actor_name,'has_difference',r.has_difference,'absolute_difference_cents',r.absolute_difference_cents) ORDER BY r.created_at DESC,r.id DESC) FROM(SELECT c.* FROM private.cash_closures c JOIN private.cash_sessions x ON x.office_id=c.office_id AND x.id=c.session_id WHERE c.office_id=p_office_id AND c.kind='close' AND c.actor_id=caller AND x.operator_id=caller AND x.status='closed' AND x.unit_id=s.unit_id AND x.id<>s.id AND own ORDER BY c.created_at DESC,c.id DESC LIMIT 5 OFFSET(p_source_page-1)*5)r),'[]'::jsonb),
 'sources_total',(SELECT count(*) FROM private.cash_closures c JOIN private.cash_sessions x ON x.office_id=c.office_id AND x.id=c.session_id WHERE c.office_id=p_office_id AND c.kind='close' AND c.actor_id=caller AND x.operator_id=caller AND x.status='closed' AND x.unit_id=s.unit_id AND x.id<>s.id AND own),'source_page',p_source_page);
END $$;
CREATE FUNCTION private.closure_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<op>>
DECLARE caller uuid;k text;keys text[];key uuid;sid uuid;sourceid uuid;rid uuid;ver integer;rv integer;cmd private.cash_commands;s private.cash_sessions;src private.cash_closures;r private.cash_closures;oldsession private.cash_sessions;digest text;groups jsonb;lines jsonb;line jsonb;cnt jsonb;value bigint;diff bigint;differences integer:=0;absolute numeric:=0;actorname text;result jsonb;internalkey uuid;recordid uuid;BEGIN
 caller:=private.cash_actor(p_office_id,true);k:=p_operation->>'kind';
 keys:=CASE WHEN k IN('reconcile','close') THEN ARRAY['kind','session_id','expected_version','idempotency_key','reason','counts'] WHEN k='adjust' THEN ARRAY['kind','session_id','expected_version','idempotency_key','reason','counts','source_id'] WHEN k='review' THEN ARRAY['kind','session_id','expected_version','idempotency_key','reason','record_id','expected_record_version','decision'] END;
 IF keys IS NULL OR jsonb_typeof(p_operation) IS DISTINCT FROM 'object' OR NOT p_operation ?& keys OR(SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) OR jsonb_typeof(p_operation->'reason') IS DISTINCT FROM 'string' OR NOT private.finance17_text(p_operation->>'reason',5,500) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 key:=(p_operation->>'idempotency_key')::uuid;sid:=(p_operation->>'session_id')::uuid;ver:=(p_operation->>'expected_version')::integer;
 IF key IS NULL OR sid IS NULL OR ver IS NULL OR ver NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(p_operation->'expected_version') IS DISTINCT FROM 'number' OR(p_operation->>'expected_version')::numeric<>ver THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF k='adjust' THEN sourceid:=(p_operation->>'source_id')::uuid;IF sourceid IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 IF k='review' THEN rid:=(p_operation->>'record_id')::uuid;rv:=(p_operation->>'expected_record_version')::integer;IF rid IS NULL OR rv IS DISTINCT FROM 1 OR jsonb_typeof(p_operation->'expected_record_version') IS DISTINCT FROM 'number' OR(p_operation->>'expected_record_version')::numeric<>rv OR p_operation->>'decision' IS NULL OR p_operation->>'decision' NOT IN('approve','reject') THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 IF k='adjust' THEN SELECT * INTO src FROM private.cash_closures WHERE office_id=p_office_id AND id=sourceid FOR SHARE;SELECT * INTO oldsession FROM private.cash_sessions WHERE office_id=p_office_id AND id=src.session_id FOR SHARE;END IF;
 IF k='review' THEN SELECT * INTO r FROM private.cash_closures WHERE office_id=p_office_id AND id=rid FOR UPDATE;END IF;
 caller:=private.cash_actor(p_office_id,true,CASE WHEN k='review' THEN 'cash.closure.approve' WHEN k='adjust' THEN 'cash.closure.adjust' ELSE 'cash.open' END);
 IF s.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF k IN('adjust','review') AND NOT private.closure_can18(p_office_id,CASE WHEN k='review' THEN 'cash.closure.approve' ELSE 'cash.closure.adjust' END) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF k<>'review' THEN PERFORM private.cash_actor(p_office_id,true,'cash.open');END IF;
 IF s.operator_id<>caller AND(k<>'review' OR NOT private.current_permissions(p_office_id) @> ARRAY['cash.read_all']) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF k='adjust' AND(src.id IS NULL OR oldsession.id IS NULL) OR k='review' AND r.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF k='adjust' AND(oldsession.operator_id<>caller OR src.actor_id<>caller) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF k='review' AND r.session_id<>s.id THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='closure' AND idempotency_key=key;
 IF FOUND THEN
 IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN jsonb_build_object('statement',private.cash_statement_record(s,caller,1),'record',private.closure_record(p_office_id,(cmd.result->'record'->>'id')::uuid));
 END IF;
 IF s.version<>ver THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='review' THEN
 IF NOT r.has_difference OR EXISTS(SELECT FROM private.cash_closure_reviews WHERE office_id=p_office_id AND record_id=r.id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE
 IF s.status<>'open' THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='adjust' THEN
 IF src.kind<>'close' OR oldsession.status<>'closed' OR s.id=oldsession.id OR s.unit_id<>oldsession.unit_id THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;groups:=src.groups;
 ELSE groups:=private.closure_groups18(s);END IF;
 IF jsonb_typeof(p_operation->'counts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(p_operation->'counts')<>jsonb_array_length(groups) OR(SELECT count(DISTINCT x->>'key') FROM jsonb_array_elements(p_operation->'counts')x)<>jsonb_array_length(groups) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 lines:='[]';
 FOR line IN SELECT x FROM jsonb_array_elements(groups)x LOOP
 SELECT x INTO cnt FROM jsonb_array_elements(p_operation->'counts')x WHERE x->>'key'=line->>'key';
 IF cnt IS NULL OR jsonb_typeof(cnt) IS DISTINCT FROM 'object' OR NOT cnt ?& ARRAY['key','counted_cents'] OR(SELECT count(*) FROM jsonb_object_keys(cnt))<>2 OR jsonb_typeof(cnt->'key') IS DISTINCT FROM 'string' OR jsonb_typeof(cnt->'counted_cents') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN value:=(cnt->>'counted_cents')::bigint;IF value IS NULL OR (cnt->>'counted_cents')::numeric<>value OR value NOT BETWEEN (CASE WHEN line->>'payment_type'='cash' THEN 0 ELSE -1000000000000 END) AND 1000000000000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;EXCEPTION WHEN numeric_value_out_of_range OR invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 diff:=private.closure_safe18(value::numeric-(line->>'expected_cents')::numeric);IF diff<>0 THEN differences:=differences+1;absolute:=absolute+abs(diff::numeric);END IF;
 lines:=lines||jsonb_build_array((line-ARRAY['counted_cents','difference_cents'])||jsonb_build_object('counted_cents',value,'difference_cents',diff));
 END LOOP;
 PERFORM private.closure_safe18(absolute);
 END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest) VALUES(p_office_id,'closure',key,caller,digest);PERFORM set_config('jn.cash_command',key::text,true);
 SELECT coalesce(private.customer_relation_display_label(display_name),'Operador') INTO actorname FROM public.profiles WHERE id=caller;actorname:=coalesce(actorname,'Operador');
 IF k='review' THEN
 INSERT INTO private.cash_closure_reviews(office_id,record_id,decision,reason,actor_id,actor_name,command_key) VALUES(p_office_id,r.id,p_operation->>'decision',p_operation->>'reason',caller,actorname,key);recordid:=r.id;
 ELSE
 IF k IN('reconcile','close') THEN
 -- Stable command namespace for the unchanged physical legacy operation, in the same transaction.
 internalkey:=md5('closure18:'||p_office_id::text||':'||key::text)::uuid;
 PERFORM private.cash_operate_before15(p_office_id,jsonb_build_object('kind',k,'session_id',s.id,'expected_version',ver,'idempotency_key',internalkey,'reason',p_operation->>'reason','counted_cents',(SELECT (x->>'counted_cents')::bigint FROM jsonb_array_elements(lines)x WHERE x->>'payment_type'='cash')));
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=s.id;PERFORM set_config('jn.cash_command',key::text,true);
 END IF;
 INSERT INTO private.cash_closures(office_id,session_id,source_id,kind,actor_id,actor_name,reason,groups,has_difference,differences_count,absolute_difference_cents,command_key)VALUES(p_office_id,s.id,sourceid,k,caller,actorname,p_operation->>'reason',lines,differences>0,differences,absolute::bigint,key)RETURNING * INTO r;recordid:=r.id;
 END IF;
 PERFORM private.emit_business_event(p_office_id,CASE k WHEN 'review' THEN 'cash.closure_reviewed' WHEN 'adjust' THEN 'cash.closure_adjusted' ELSE 'cash.closure_recorded' END,'cash_session',s.id,key,'{}');
 result:=jsonb_build_object('statement',private.cash_statement_record(s,caller,1),'record',private.closure_record(p_office_id,recordid));UPDATE private.cash_commands SET result=op.result WHERE office_id=p_office_id AND kind='closure' AND idempotency_key=key;PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;
-- Keep all pre18 bodies untouched and prohibit new legacy reconciliation/closure commands.
ALTER FUNCTION private.cash_operate(uuid,jsonb) RENAME TO cash_operate_before18;
CREATE FUNCTION private.cash_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.cash_actor(p_office_id,true,'cash.open');
 IF p_operation->>'kind' IN('reconcile','close') AND NOT EXISTS(SELECT FROM private.cash_commands WHERE office_id=p_office_id AND kind='operate' AND idempotency_key::text=p_operation->>'idempotency_key') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN private.cash_operate_before18(p_office_id,p_operation);
END $$;
ALTER FUNCTION private.cash_statement_record(private.cash_sessions,uuid,integer) RENAME TO cash_statement_before18;
CREATE FUNCTION private.cash_statement_record(s private.cash_sessions,p_actor uuid,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_statement_before18(s,p_actor,p_page)||jsonb_build_object('closures_enabled',true);$$;
CREATE FUNCTION public.closure_state(p_office_id uuid,p_session_id uuid,p_page integer,p_source_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.closure_state(p_office_id,p_session_id,p_page,p_source_page);$$;
CREATE FUNCTION public.closure_record(p_office_id uuid,p_record_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.closure_record(p_office_id,p_record_id);$$;
CREATE FUNCTION public.closure_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.closure_operate(p_office_id,p_operation);$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND(proname LIKE 'closure_%' OR proname IN('cash_operate','cash_operate_before18','cash_statement_record','cash_statement_before18')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN('closure_state','closure_record','closure_operate','cash_operate') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;END LOOP;END $$;
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2,3,4,5));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 5;
NOTIFY pgrst,'reload schema';
