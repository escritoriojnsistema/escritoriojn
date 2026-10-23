-- Complemento financeiro autorizado: registro manual, sem gateway ou movimentação bancária.
-- Nenhuma unidade, conta, pagamento ou concessão individual é criada por esta migration.
ALTER TABLE private.cash_commands DROP CONSTRAINT cash_commands_kind_check;
ALTER TABLE private.cash_commands ADD CONSTRAINT cash_commands_kind_check CHECK(kind IN('configure','open','operate'));
ALTER TABLE private.cash_sessions ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646), ADD COLUMN closed_at timestamptz;
ALTER TABLE private.cash_sessions ADD CONSTRAINT cash_sessions_closed_check CHECK((status='closed')=(closed_at IS NOT NULL));
ALTER TABLE private.payment_methods ADD CONSTRAINT payment_methods_office_unit_id_key UNIQUE(office_id,unit_id,id);
CREATE TABLE private.cash_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL,unit_id uuid NOT NULL,session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('received','refunded','reversed','reconciled','closed')),
 charge_id uuid,request_id uuid,payment_method_id uuid,account_id uuid,original_entry_id uuid,
 payment_method_name text,account_name text,payment_type text CHECK(payment_type IN('cash','pix','card','transfer')),
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 0 AND 1000000000000),cash_cents bigint NOT NULL CHECK(cash_cents BETWEEN -1000000000000 AND 1000000000000),applied_cents bigint NOT NULL CHECK(applied_cents BETWEEN -1000000000000 AND 1000000000000),
 counted_cents bigint CHECK(counted_cents BETWEEN 0 AND 1000000000000),expected_cents bigint CHECK(expected_cents BETWEEN 0 AND 1000000000000),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),command_key uuid NOT NULL,
 UNIQUE(office_id,id),UNIQUE(office_id,command_key),
 FOREIGN KEY(office_id,unit_id,session_id) REFERENCES private.cash_sessions(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,charge_id) REFERENCES private.charges(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,payment_method_id) REFERENCES private.payment_methods(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,account_id) REFERENCES private.financial_accounts(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,original_entry_id) REFERENCES private.cash_entries(office_id,id) ON DELETE RESTRICT,
 CHECK(CASE WHEN kind IN('received','refunded','reversed') THEN charge_id IS NOT NULL AND request_id IS NOT NULL AND payment_method_id IS NOT NULL AND account_id IS NOT NULL AND payment_type IS NOT NULL AND payment_method_name IS NOT NULL AND account_name IS NOT NULL AND amount_cents>0 AND counted_cents IS NULL AND expected_cents IS NULL
 ELSE charge_id IS NULL AND request_id IS NULL AND payment_method_id IS NULL AND account_id IS NULL AND payment_type IS NULL AND payment_method_name IS NULL AND account_name IS NULL AND original_entry_id IS NULL AND counted_cents IS NOT NULL AND expected_cents IS NOT NULL AND amount_cents=counted_cents AND cash_cents=0 AND applied_cents=0 END),
 CHECK(CASE WHEN kind='received' THEN original_entry_id IS NULL AND applied_cents=amount_cents WHEN kind IN('refunded','reversed') THEN original_entry_id IS NOT NULL AND applied_cents=-amount_cents ELSE true END),
 CHECK(CASE WHEN payment_type='cash' THEN cash_cents=applied_cents ELSE cash_cents=0 END)
);
ALTER TABLE private.cash_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cash_entries FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX cash_entries_session_idx ON private.cash_entries(office_id,session_id,created_at DESC,id DESC);
CREATE INDEX cash_entries_charge_idx ON private.cash_entries(office_id,charge_id);
CREATE INDEX cash_entries_request_idx ON private.cash_entries(office_id,request_id);
CREATE INDEX cash_entries_original_idx ON private.cash_entries(office_id,original_entry_id);
CREATE INDEX cash_entries_method_idx ON private.cash_entries(office_id,unit_id,payment_method_id);
CREATE INDEX cash_entries_account_idx ON private.cash_entries(office_id,unit_id,account_id);
CREATE INDEX cash_entries_actor_idx ON private.cash_entries(actor_id);
CREATE TRIGGER cash_entries_immutable BEFORE UPDATE OR DELETE ON private.cash_entries FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.cash_entry_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM private.cash_commands c JOIN private.cash_sessions s ON s.office_id=c.office_id AND s.id=NEW.session_id AND s.unit_id=NEW.unit_id WHERE c.office_id=NEW.office_id AND c.kind='operate' AND c.idempotency_key=NEW.command_key AND c.idempotency_key::text=current_setting('jn.cash_command',true) AND c.actor_id=auth.uid() AND c.actor_id=NEW.actor_id AND s.operator_id=c.actor_id AND s.status='open' AND c.result IS NULL) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_entries_insert_guard BEFORE INSERT ON private.cash_entries FOR EACH ROW EXECUTE FUNCTION private.cash_entry_guard();
DROP TRIGGER cash_sessions_immutable ON private.cash_sessions;
CREATE FUNCTION private.cash_session_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF OLD.status<>'open' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','status','closed_at'])<>(to_jsonb(OLD)-ARRAY['version','status','closed_at']) OR NOT EXISTS(SELECT FROM private.cash_entries e JOIN private.cash_commands c ON c.office_id=e.office_id AND c.kind='operate' AND c.idempotency_key=e.command_key WHERE e.office_id=OLD.office_id AND e.session_id=OLD.id AND c.idempotency_key::text=current_setting('jn.cash_command',true) AND c.result IS NULL AND c.actor_id=auth.uid() AND OLD.operator_id=c.actor_id AND ((e.kind='closed' AND NEW.status='closed' AND NEW.closed_at=e.created_at) OR(e.kind<>'closed' AND NEW.status='open' AND NEW.closed_at IS NULL))) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cash_sessions_immutable BEFORE UPDATE OR DELETE ON private.cash_sessions FOR EACH ROW EXECUTE FUNCTION private.cash_session_guard();
CREATE OR REPLACE FUNCTION private.charges_amounts(p_office_id uuid,p_charge_id uuid) RETURNS TABLE(original_cents bigint,due_cents bigint,allocated_cents bigint,balance_cents bigint,version integer,cancelled boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (SELECT sum(i.total_cents)::bigint FROM private.charge_items i WHERE i.office_id=p_office_id AND i.charge_id=p_charge_id),sum(e.delta_cents)::bigint,
 (SELECT coalesce(sum(x.applied_cents),0)::bigint FROM private.cash_entries x WHERE x.office_id=p_office_id AND x.charge_id=p_charge_id),
 sum(e.delta_cents)::bigint-(SELECT coalesce(sum(x.applied_cents),0)::bigint FROM private.cash_entries x WHERE x.office_id=p_office_id AND x.charge_id=p_charge_id),max(e.version),bool_or(e.kind='cancelled') FROM private.charge_events e WHERE e.office_id=p_office_id AND e.charge_id=p_charge_id;
$$;
-- Never reduce an obligation below money still allocated to it. Refund first.
CREATE FUNCTION private.finance_obligation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE due bigint;paid bigint;BEGIN
 SELECT coalesce(sum(delta_cents),0) INTO due FROM private.charge_events WHERE office_id=NEW.office_id AND charge_id=NEW.charge_id;
 SELECT coalesce(sum(applied_cents),0) INTO paid FROM private.cash_entries WHERE office_id=NEW.office_id AND charge_id=NEW.charge_id;
 IF due+NEW.delta_cents<paid THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END $$;
CREATE TRIGGER finance_obligation_guard BEFORE INSERT ON private.charge_events FOR EACH ROW EXECUTE FUNCTION private.finance_obligation_guard();
CREATE FUNCTION private.finance_client_request(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.office_id=m.office_id AND m.role_code='client' AND m.active AND ((r.origin='portal' AND r.created_by=m.user_id) OR EXISTS(
 SELECT FROM private.customer_relations rel JOIN public.customers customer ON customer.office_id=rel.office_id AND customer.id=rel.customer_id
 WHERE rel.office_id=m.office_id AND rel.membership_id=m.id AND rel.customer_id=r.customer_id AND rel.relation_type='identity' AND rel.revoked_at IS NULL AND rel.valid_from<=clock_timestamp() AND customer.merged_into_id IS NULL AND customer.blocked_at IS NULL));
$$;
CREATE FUNCTION private.finance_charge_json(c private.charges,r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'request_id',r.id,'protocol',r.protocol,'version',a.version,'due_cents',a.due_cents,'paid_cents',a.allocated_cents,'balance_cents',a.balance_cents,'status',CASE WHEN a.cancelled THEN 'cancelled' WHEN a.due_cents=0 THEN 'zero' WHEN a.balance_cents=0 THEN 'paid' ELSE 'open' END,
 'services',coalesce((SELECT jsonb_agg(i.snapshot->'definition'->>'name' ORDER BY i.id) FROM private.charge_items i WHERE i.office_id=c.office_id AND i.charge_id=c.id),'[]'::jsonb),
 'installments',coalesce((SELECT jsonb_agg(jsonb_build_object('number',i.number,'due_date',to_char(i.due_date,'YYYY-MM-DD'),'amount_cents',i.amount_cents) ORDER BY i.number) FROM private.charge_installments i WHERE i.office_id=c.office_id AND i.charge_id=c.id AND i.version=a.version),'[]'::jsonb)) FROM private.charges_amounts(c.office_id,c.id)a;
$$;
CREATE FUNCTION private.finance_entry_json(e private.cash_entries,p_client boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',e.id,'kind',e.kind,'created_at',e.created_at,'amount_cents',e.amount_cents,'protocol',(SELECT r.protocol FROM public.requests r WHERE r.office_id=e.office_id AND r.id=e.request_id),'request_id',e.request_id,'charge_id',e.charge_id,'payment_method_name',e.payment_method_name)
 ||CASE WHEN p_client THEN '{}'::jsonb ELSE jsonb_build_object('cash_cents',e.cash_cents,'applied_cents',e.applied_cents,'account_name',e.account_name,'reason',e.reason,'original_entry_id',e.original_entry_id,'refundable_cents',CASE WHEN e.kind='received' THEN e.amount_cents-coalesce((SELECT sum(x.amount_cents) FROM private.cash_entries x WHERE x.office_id=e.office_id AND x.original_entry_id=e.id),0) ELSE 0 END,'counted_cents',e.counted_cents,'expected_cents',e.expected_cents) END;
$$;
CREATE FUNCTION private.cash_statement_record(s private.cash_sessions,p_actor uuid,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('session',jsonb_build_object('id',s.id,'cash_account_id',s.cash_account_id,'unit_id',s.unit_id,'unit_name',s.unit_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'version',s.version,'opened_at',s.opened_at,'closed_at',s.closed_at,'opening_cents',s.opening_cents,
 'cash_cents',s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0),
 'received_cents',coalesce((SELECT sum(e.amount_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.kind='received'),0),
 'refunded_cents',coalesce((SELECT sum(e.amount_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.kind IN('refunded','reversed')),0),
 'digital_cents',coalesce((SELECT sum(e.applied_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.payment_type<>'cash'),0),
 'can_operate',s.operator_id=p_actor AND s.status='open' AND private.current_permissions(s.office_id) @> ARRAY['cash.open'],
 'can_refund',s.operator_id=p_actor AND s.status='open' AND private.current_permissions(s.office_id) @> ARRAY['cash.open','charges.read','requests.read','charges.adjust']),
 'can_receive',s.operator_id=p_actor AND s.status='open' AND private.current_permissions(s.office_id) @> ARRAY['cash.open','charges.read','requests.read'],
 'entries',coalesce((SELECT jsonb_agg(private.finance_entry_json(e,false) ORDER BY e.created_at DESC,e.id DESC) FROM(SELECT * FROM private.cash_entries WHERE office_id=s.office_id AND session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)e),'[]'::jsonb),
 'total',(SELECT count(*) FROM private.cash_entries WHERE office_id=s.office_id AND session_id=s.id),'page',p_page,'page_size',5);
$$;
CREATE FUNCTION private.cash_statement(p_office_id uuid,p_session_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;s private.cash_sessions;BEGIN
 caller:=private.cash_actor(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p_session_id FOR SHARE;
 caller:=private.cash_actor(p_office_id);
 IF s.id IS NULL OR(s.operator_id<>caller AND NOT private.current_permissions(p_office_id) @> ARRAY['cash.read_all']) THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.cash_statement_record(s,caller,p_page);
END $$;
CREATE FUNCTION private.cash_eligible_charges(p_office_id uuid,p_query text,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;m public.memberships;result jsonb;BEGIN
 caller:=private.cash_actor(p_office_id);m:=private.charges_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS(SELECT private.finance_charge_json(c,r) value FROM private.charges c JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE c.office_id=p_office_id AND private.request_can_work(r,m) IS TRUE AND r.status<>'cancelado' AND NOT a.cancelled AND a.balance_cents>0 AND(btrim(p_query)='' OR strpos(lower(r.protocol),lower(btrim(p_query)))>0 OR strpos(lower(r.title),lower(btrim(p_query)))>0)),paged AS(SELECT value FROM candidates ORDER BY value->>'protocol',value->>'id' LIMIT 5 OFFSET(p_page-1)*5)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(value) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM candidates),'page',p_page,'page_size',5,'summary',(SELECT jsonb_build_object('due_cents',coalesce(sum((value->>'due_cents')::bigint),0),'paid_cents',coalesce(sum((value->>'paid_cents')::bigint),0),'balance_cents',coalesce(sum((value->>'balance_cents')::bigint),0)) FROM candidates)) INTO result;RETURN result;
END $$;
CREATE FUNCTION private.cash_client_finance(p_office_id uuid,p_page integer,p_history_page integer,p_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;BEGIN
 m:=private.notifications_actor(p_office_id);
 IF m.role_code<>'client' THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_history_page IS NULL OR p_history_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS(SELECT c.*,private.finance_charge_json(c,r) value FROM private.charges c JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id WHERE c.office_id=p_office_id AND(p_request_id IS NULL OR r.id=p_request_id) AND private.finance_client_request(r,m)),paged AS(SELECT value FROM candidates ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5),history AS(SELECT e.* FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.charge_id IN(SELECT id FROM candidates)),history_page AS(SELECT * FROM history ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_history_page-1)*5)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(value) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM candidates),'page',p_page,'page_size',5,'summary',(SELECT jsonb_build_object('due_cents',coalesce(sum((value->>'due_cents')::bigint),0),'paid_cents',coalesce(sum((value->>'paid_cents')::bigint),0),'balance_cents',coalesce(sum((value->>'balance_cents')::bigint),0)) FROM candidates),'history',coalesce((SELECT jsonb_agg(private.finance_entry_json(e,true) ORDER BY e.created_at DESC,e.id DESC) FROM history_page e),'[]'::jsonb),'history_total',(SELECT count(*) FROM history),'history_page',p_history_page) INTO result;RETURN result;
END $$;
CREATE FUNCTION private.cash_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;s private.cash_sessions;c private.charges;r public.requests;m public.memberships;method private.payment_methods;account private.financial_accounts;original private.cash_entries;a record;cmd private.cash_commands;entry private.cash_entries;
 k text;key uuid;sid uuid;expected integer;amount bigint;counted bigint;physical bigint;remaining bigint;reason text;digest text;operation_result jsonb;keys text[];
BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF p_operation IS NULL OR jsonb_typeof(p_operation)<>'object' OR NOT p_operation ?& ARRAY['kind','session_id','expected_version','idempotency_key'] THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_operation->>'kind';
 keys:=CASE WHEN k='receive' THEN ARRAY['kind','session_id','expected_version','idempotency_key','charge_id','expected_charge_version','payment_method_id','amount_cents'] WHEN k IN('refund','reverse') THEN ARRAY['kind','session_id','expected_version','idempotency_key','entry_id','amount_cents','reason'] WHEN k IN('reconcile','close') THEN ARRAY['kind','session_id','expected_version','idempotency_key','counted_cents','reason'] END;
 IF keys IS NULL OR NOT p_operation ?& keys OR(SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
  IF jsonb_typeof(p_operation->'expected_version')<>'number' OR (p_operation->>'expected_version')::numeric<>trunc((p_operation->>'expected_version')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
  sid:=(p_operation->>'session_id')::uuid;key:=(p_operation->>'idempotency_key')::uuid;expected:=(p_operation->>'expected_version')::integer;
  IF k IN('receive','refund','reverse') THEN
   IF jsonb_typeof(p_operation->'amount_cents')<>'number' OR(p_operation->>'amount_cents')::numeric<>trunc((p_operation->>'amount_cents')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;amount:=(p_operation->>'amount_cents')::bigint;
  ELSE
   IF jsonb_typeof(p_operation->'counted_cents')<>'number' OR(p_operation->>'counted_cents')::numeric<>trunc((p_operation->>'counted_cents')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;counted:=(p_operation->>'counted_cents')::bigint;
  END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 IF sid IS NULL OR key IS NULL OR expected NOT BETWEEN 1 AND 2147483645 OR(k IN('receive','refund','reverse') AND amount NOT BETWEEN 1 AND 1000000000000) OR(k IN('reconcile','close') AND counted NOT BETWEEN 0 AND 1000000000000) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 reason:=CASE WHEN k='receive' THEN 'Recebimento manual confirmado pelo operador' ELSE p_operation->>'reason' END;
 IF(k<>'receive' AND jsonb_typeof(p_operation->'reason') IS DISTINCT FROM 'string') OR reason IS NULL OR reason<>btrim(reason) OR char_length(reason) NOT BETWEEN 5 AND 500 OR reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF s.id IS NULL OR s.operator_id<>caller THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 -- Current permissions and request scope are checked even before replaying a completed command.
 IF k IN('receive','refund','reverse') THEN
  m:=private.charges_actor(p_office_id,true,CASE WHEN k='receive' THEN NULL ELSE 'charges.adjust' END);
  IF k='receive' THEN
   BEGIN SELECT * INTO c FROM private.charges WHERE office_id=p_office_id AND id=(p_operation->>'charge_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
  ELSE
   BEGIN SELECT * INTO original FROM private.cash_entries WHERE office_id=p_office_id AND id=(p_operation->>'entry_id')::uuid AND kind='received';EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
   IF original.id IS NULL OR original.unit_id<>s.unit_id THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
   SELECT * INTO c FROM private.charges WHERE office_id=p_office_id AND id=original.charge_id;
  END IF;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
  SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=c.request_id FOR UPDATE;
  caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,CASE WHEN k='receive' THEN NULL ELSE 'charges.adjust' END);
  IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='operate' AND idempotency_key=key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 IF s.status<>'open' OR s.version<>expected OR NOT EXISTS(SELECT FROM private.cash_units u JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND f.id=s.cash_account_id AND u.active AND f.active) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT s.opening_cents+coalesce(sum(e.cash_cents),0) INTO physical FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.session_id=s.id;
 IF k='receive' THEN
  IF jsonb_typeof(p_operation->'expected_charge_version') IS DISTINCT FROM 'number' OR(p_operation->>'expected_charge_version')::numeric<>trunc((p_operation->>'expected_charge_version')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO a FROM private.charges_amounts(p_office_id,c.id);
  IF a.cancelled OR r.status='cancelado' OR a.version::numeric<>(p_operation->>'expected_charge_version')::numeric OR amount>a.balance_cents THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
  BEGIN SELECT * INTO method FROM private.payment_methods WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=(p_operation->>'payment_method_id')::uuid FOR SHARE;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
  SELECT * INTO account FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=method.destination_account_id FOR SHARE;
  IF method.id IS NULL OR account.id IS NULL OR NOT method.active OR NOT account.active OR(method.type='cash')<>(account.type='cash') OR(method.type='cash' AND account.id<>s.cash_account_id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSEIF k IN('refund','reverse') THEN
  SELECT original.amount_cents-coalesce(sum(e.amount_cents),0) INTO remaining FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.original_entry_id=original.id;
  IF amount>remaining OR(k='reverse' AND amount<>remaining) OR(original.payment_type='cash' AND (s.cash_account_id<>original.account_id OR amount>physical)) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 IF k='receive' AND method.type='cash' AND physical+amount>1000000000000 THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF (k='receive' AND (SELECT coalesce(sum(e.amount_cents),0)+amount FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.session_id=s.id AND e.kind='received')>9007199254740991) OR(k IN('refund','reverse') AND (SELECT coalesce(sum(e.amount_cents),0)+amount FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.session_id=s.id AND e.kind IN('refunded','reversed'))>9007199254740991) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'operate',key,caller,digest);
 PERFORM set_config('jn.cash_command',key::text,true);
 INSERT INTO private.cash_entries(office_id,unit_id,session_id,kind,charge_id,request_id,payment_method_id,account_id,original_entry_id,payment_method_name,account_name,payment_type,amount_cents,cash_cents,applied_cents,counted_cents,expected_cents,reason,actor_id,command_key)
 VALUES(p_office_id,s.unit_id,s.id,CASE k WHEN 'receive' THEN 'received' WHEN 'refund' THEN 'refunded' WHEN 'reverse' THEN 'reversed' WHEN 'reconcile' THEN 'reconciled' ELSE 'closed' END,
 c.id,r.id,CASE WHEN k='receive' THEN method.id ELSE original.payment_method_id END,CASE WHEN k='receive' THEN account.id ELSE original.account_id END,original.id,
 CASE WHEN k='receive' THEN method.name ELSE original.payment_method_name END,CASE WHEN k='receive' THEN account.name ELSE original.account_name END,CASE WHEN k='receive' THEN method.type ELSE original.payment_type END,
 coalesce(amount,counted),CASE WHEN k='receive' AND method.type='cash' THEN amount WHEN k IN('refund','reverse') AND original.payment_type='cash' THEN -amount ELSE 0 END,CASE WHEN k='receive' THEN amount WHEN k IN('refund','reverse') THEN -amount ELSE 0 END,
 counted,CASE WHEN k IN('reconcile','close') THEN physical END,reason,caller,key)RETURNING * INTO entry;
 UPDATE private.cash_sessions SET version=version+1,status=CASE WHEN k='close' THEN 'closed' ELSE 'open' END,closed_at=CASE WHEN k='close' THEN entry.created_at END WHERE office_id=p_office_id AND id=s.id RETURNING * INTO s;
 PERFORM private.emit_business_event(p_office_id,CASE k WHEN 'receive' THEN 'cash.payment_received' WHEN 'refund' THEN 'cash.payment_refunded' WHEN 'reverse' THEN 'cash.payment_reversed' WHEN 'reconcile' THEN 'cash.reconciliation_recorded' ELSE 'cash.session_closed' END,'cash_session',s.id,key,'{}');
 IF k IN('receive','refund','reverse') THEN
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
  SELECT p_office_id,r.id,recipient.id,CASE k WHEN 'receive' THEN 'payment_received' WHEN 'refund' THEN 'payment_refunded' ELSE 'payment_reversed' END,entry.id FROM public.memberships recipient WHERE recipient.office_id=p_office_id AND recipient.role_code='client' AND recipient.active AND private.finance_client_request(r,recipient)
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 operation_result:=private.cash_statement_record(s,caller,1);
 UPDATE private.cash_commands SET result=operation_result WHERE office_id=p_office_id AND kind='operate' AND idempotency_key=key;
 PERFORM set_config('jn.cash_command','',true);RETURN operation_result;
END $$;
CREATE FUNCTION public.cash_statement(p_office_id uuid,p_session_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_statement(p_office_id,p_session_id,p_page);$$;
CREATE FUNCTION public.cash_eligible_charges(p_office_id uuid,p_query text,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_eligible_charges(p_office_id,p_query,p_page);$$;
CREATE FUNCTION public.cash_client_finance(p_office_id uuid,p_page integer,p_history_page integer,p_request_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_client_finance(p_office_id,p_page,p_history_page,p_request_id);$$;
CREATE FUNCTION public.cash_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_operate(p_office_id,p_operation);$$;

CREATE OR REPLACE FUNCTION private.cash_dashboard_record(p_office_id uuid,p_actor uuid,p_scope text,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('scope',p_scope,'page',p_page,'page_size',p_page_size,
 'can_open',private.current_permissions(p_office_id) @> ARRAY['cash.open'],'can_manage',private.current_permissions(p_office_id) @> ARRAY['cash.manage'],'can_read_all',private.current_permissions(p_office_id) @> ARRAY['cash.read_all'],
 'total',(SELECT count(*) FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor)),
 'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'cash_account_id',s.cash_account_id,'account_name',s.account_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'opened_at',s.opened_at,'opening_cents',s.opening_cents,'numerario_cents',s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0),'received_cents',coalesce((SELECT sum(e.applied_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)) ORDER BY opened_at DESC,id DESC) FROM(SELECT * FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) ORDER BY opened_at DESC,id DESC LIMIT p_page_size OFFSET(p_page-1)*p_page_size)s),'[]'::jsonb));
$$;

ALTER TABLE private.internal_notifications DROP CONSTRAINT internal_notifications_kind_check;
ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check CHECK(kind IN('handoff','pending','assignee_changed','account_correction','account_updated','payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled'));

CREATE OR REPLACE FUNCTION private.notification_visible(n private.internal_notifications,r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT n.office_id=m.office_id AND n.recipient_id=m.id AND CASE WHEN m.role_code='client' THEN ((n.kind IN('assignee_changed','account_updated') AND private.request_in_scope(r,m)) OR(n.kind IN('payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled') AND private.finance_client_request(r,m)))
 ELSE n.kind IN('handoff','pending','account_correction') AND private.current_permissions(m.office_id) @> ARRAY['requests.read'] AND (r.category<>'account_correction' OR private.request_in_scope(r,m)) END;
$$;

CREATE OR REPLACE FUNCTION private.notifications_page(p_office_id uuid,p_query text,p_read text,p_kind text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;q text;caps text[];staff_allowed boolean;read_all boolean;corrections_allowed boolean;
BEGIN
 m:=private.notifications_actor(p_office_id);caps:=private.current_permissions(p_office_id);staff_allowed:=m.role_code<>'client' AND caps @> ARRAY['requests.read'];read_all:=caps @> ARRAY['requests.read_all'];corrections_allowed:=caps @> ARRAY['accounts.corrections.read'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_read IS NULL OR p_read NOT IN('all','unread','read') OR p_kind IS NULL OR p_kind NOT IN('all','handoff','pending','assignee_changed','account_correction','account_updated','payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 q:=lower(btrim(p_query));
 WITH own AS(
  SELECT n.*,CASE WHEN m.role_code='client' OR r.category='account_correction' OR read_all OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) THEN r.id END AS visible_id,
  CASE WHEN m.role_code='client' OR r.category='account_correction' OR read_all OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) THEN r.protocol END AS visible_protocol
  FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id
  WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND CASE WHEN m.role_code='client' THEN ((n.kind IN('assignee_changed','account_updated') AND r.origin='portal' AND r.created_by=m.user_id) OR (n.kind IN('payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled') AND private.finance_client_request(r,m))) ELSE staff_allowed AND n.kind IN('handoff','pending','account_correction') AND (r.category<>'account_correction' OR corrections_allowed) END
 ),filtered AS(
  SELECT * FROM own WHERE (p_read='all' OR (p_read='unread' AND read_at IS NULL) OR (p_read='read' AND read_at IS NOT NULL)) AND (p_kind='all' OR kind=p_kind)
  AND (q='' OR strpos(lower(visible_protocol),q)>0 OR (kind='assignee_changed' AND strpos(lower(attendant_name),q)>0))
 ),paged AS(SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'unread',(SELECT count(*) FROM own WHERE read_at IS NULL),'page',p_page,'page_size',p_size,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'created_at',created_at,'read_at',read_at,'can_open',visible_id IS NOT NULL,'request_id',visible_id,'protocol',visible_protocol,'attendant_name',CASE WHEN kind='assignee_changed' THEN attendant_name END) ORDER BY created_at DESC,id DESC) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;


CREATE OR REPLACE FUNCTION private.notifications_summary(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;caps text[];
BEGIN
 m:=private.notifications_actor(p_office_id);caps:=private.current_permissions(p_office_id);
 IF m.role_code='client' THEN RETURN jsonb_build_object('unread',(SELECT count(*) FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND n.read_at IS NULL AND ((n.kind IN('assignee_changed','account_updated') AND r.origin='portal' AND r.created_by=m.user_id) OR (n.kind IN('payment_received','payment_refunded','payment_reversed','charge_created','charge_adjusted','charge_cancelled') AND private.finance_client_request(r,m)))));END IF;
 IF NOT caps @> ARRAY['requests.read'] THEN RETURN '{"unread":0}'::jsonb;END IF;
 RETURN jsonb_build_object('unread',(SELECT count(*) FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND n.read_at IS NULL AND n.kind IN('handoff','pending','account_correction') AND (r.category<>'account_correction' OR caps @> ARRAY['accounts.corrections.read'])));
END $$;
REVOKE ALL ON FUNCTION private.cash_entry_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.cash_session_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.finance_obligation_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.finance_client_request(public.requests,public.memberships) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.finance_charge_json(private.charges,public.requests) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.finance_entry_json(private.cash_entries,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.cash_statement_record(private.cash_sessions,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.cash_statement(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cash_statement(uuid,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.cash_statement(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cash_statement(uuid,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION private.cash_eligible_charges(uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cash_eligible_charges(uuid,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.cash_eligible_charges(uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cash_eligible_charges(uuid,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION private.cash_client_finance(uuid,integer,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cash_client_finance(uuid,integer,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cash_client_finance(uuid,integer,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cash_client_finance(uuid,integer,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.cash_operate(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cash_operate(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.cash_operate(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cash_operate(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE FUNCTION private.finance_debt_notice() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;BEGIN
 SELECT request.* INTO r FROM private.charges c JOIN public.requests request ON request.office_id=c.office_id AND request.id=c.request_id WHERE c.office_id=NEW.office_id AND c.id=NEW.charge_id;
 INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
 SELECT NEW.office_id,r.id,m.id,CASE NEW.kind WHEN 'created' THEN 'charge_created' WHEN 'adjusted' THEN 'charge_adjusted' ELSE 'charge_cancelled' END,NEW.id FROM public.memberships m WHERE m.office_id=NEW.office_id AND m.role_code='client' AND m.active AND private.finance_client_request(r,m)
 ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;RETURN NEW;
END $$;
CREATE TRIGGER finance_debt_notice AFTER INSERT ON private.charge_events FOR EACH ROW EXECUTE FUNCTION private.finance_debt_notice();
REVOKE ALL ON FUNCTION private.finance_debt_notice() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.cash_dashboard_filtered_record(p_office_id uuid,p_actor uuid,p_scope text,p_page integer,p_page_size integer,p_unit_id uuid,p_status text,p_query text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('scope',p_scope,'page',p_page,'page_size',p_page_size,
 'can_open',private.current_permissions(p_office_id) @> ARRAY['cash.open'],'can_manage',private.current_permissions(p_office_id) @> ARRAY['cash.manage'],'can_read_all',private.current_permissions(p_office_id) @> ARRAY['cash.read_all'],
 'summary',(SELECT jsonb_build_object('open',count(*) FILTER(WHERE status='open'),'closed',count(*) FILTER(WHERE status='closed'),'numerario_cents',coalesce(sum(opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)),0),'received_cents',coalesce(sum(coalesce((SELECT sum(e.applied_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)),0)) FROM private.cash_sessions s WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) AND(p_unit_id IS NULL OR unit_id=p_unit_id) AND(p_status='all' OR status=p_status) AND(p_query='' OR strpos(lower(operator_name||' '||unit_name||' '||account_name),lower(p_query))>0)),
 'total',(SELECT count(*) FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) AND(p_unit_id IS NULL OR unit_id=p_unit_id) AND(p_status='all' OR status=p_status) AND(p_query='' OR strpos(lower(operator_name||' '||unit_name||' '||account_name),lower(p_query))>0)),
 'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'cash_account_id',s.cash_account_id,'account_name',s.account_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'opened_at',s.opened_at,'opening_cents',s.opening_cents,'numerario_cents',s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0),'received_cents',coalesce((SELECT sum(e.applied_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)) ORDER BY opened_at DESC,id DESC) FROM(SELECT * FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) AND(p_unit_id IS NULL OR unit_id=p_unit_id) AND(p_status='all' OR status=p_status) AND(p_query='' OR strpos(lower(operator_name||' '||unit_name||' '||account_name),lower(p_query))>0) ORDER BY opened_at DESC,id DESC LIMIT p_page_size OFFSET(p_page-1)*p_page_size)s),'[]'::jsonb));
$$;
CREATE FUNCTION private.cash_dashboard_filtered(p_office_id uuid,p_scope text,p_page integer,p_page_size integer,p_unit_id uuid,p_status text,p_query text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;BEGIN
 caller:=private.cash_actor(p_office_id);
 IF p_scope IS NULL OR p_scope NOT IN('own','all') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT IN(3,5) OR p_status IS NULL OR p_status NOT IN('all','open','closed') OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_scope='all' AND NOT private.current_permissions(p_office_id) @> ARRAY['cash.read_all'] THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN private.cash_dashboard_filtered_record(p_office_id,caller,p_scope,p_page,p_page_size,p_unit_id,p_status,btrim(p_query));
END $$;
CREATE FUNCTION public.cash_dashboard_filtered(p_office_id uuid,p_scope text,p_page integer,p_page_size integer,p_unit_id uuid,p_status text,p_query text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_dashboard_filtered(p_office_id,p_scope,p_page,p_page_size,p_unit_id,p_status,p_query);$$;
REVOKE ALL ON FUNCTION private.cash_dashboard_filtered_record(uuid,uuid,text,integer,integer,uuid,text,text),private.cash_dashboard_filtered(uuid,text,integer,integer,uuid,text,text),public.cash_dashboard_filtered(uuid,text,integer,integer,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cash_dashboard_filtered(uuid,text,integer,integer,uuid,text,text),public.cash_dashboard_filtered(uuid,text,integer,integer,uuid,text,text) TO authenticated;

-- Financial history, including destinations no longer selected by an active method, fixes account nature.
CREATE FUNCTION private.cash_history_account_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF(NEW.unit_id<>OLD.unit_id OR NEW.type<>OLD.type) AND EXISTS(SELECT FROM private.cash_entries e WHERE e.office_id=OLD.office_id AND e.account_id=OLD.id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END $$;
CREATE TRIGGER cash_history_account_guard BEFORE UPDATE ON private.financial_accounts FOR EACH ROW EXECUTE FUNCTION private.cash_history_account_guard();
REVOKE ALL ON FUNCTION private.cash_history_account_guard() FROM PUBLIC,anon,authenticated,service_role;
