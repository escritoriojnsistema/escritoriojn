-- Etapa15. Preserve ledger/commands/history; no hosted fixtures or capability grants.
CREATE TABLE private.payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,unit_id uuid NOT NULL,session_id uuid NOT NULL,
 payment_method_id uuid NOT NULL,account_id uuid NOT NULL,payment_type text NOT NULL CHECK(payment_type IN('cash','pix','card','transfer')),
 method_name text NOT NULL,account_name text NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000000),
 presented_cents bigint CHECK(presented_cents BETWEEN 1 AND 1000000000000),change_cents bigint CHECK(change_cents BETWEEN 0 AND 1000000000000),
 fee_cents bigint CHECK(fee_cents BETWEEN 0 AND amount_cents),settlement text NOT NULL CHECK(settlement IN('not_applicable','pending','settled','unknown')),
 settled_on date,evidence text,external_reference text,legacy boolean NOT NULL DEFAULT false,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),FOREIGN KEY(office_id,unit_id,session_id) REFERENCES private.cash_sessions(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,payment_method_id) REFERENCES private.payment_methods(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,account_id) REFERENCES private.financial_accounts(office_id,unit_id,id) ON DELETE RESTRICT,
 CHECK(legacy OR (evidence IS NOT NULL AND char_length(evidence) BETWEEN 5 AND 500 AND evidence=btrim(evidence) AND evidence !~ '[[:cntrl:]]' AND fee_cents IS NOT NULL)),
 CHECK((presented_cents IS NULL AND change_cents IS NULL AND (legacy OR payment_type<>'cash')) OR(payment_type='cash' AND presented_cents=amount_cents+change_cents)),
 CHECK(payment_type='card' OR (coalesce(fee_cents,0)=0 AND settlement='not_applicable' AND settled_on IS NULL)),
 CHECK(legacy OR(payment_type<>'card' OR (settlement IN('pending','settled') AND (settlement='settled')=(settled_on IS NOT NULL)))),
 CHECK(external_reference IS NULL OR(char_length(external_reference) BETWEEN 1 AND 120 AND external_reference=btrim(external_reference) AND external_reference !~ '[[:cntrl:]]'))
);
CREATE INDEX payments_session_idx ON private.payments(office_id,session_id,created_at DESC,id DESC);
CREATE INDEX payments_actor_idx ON private.payments(actor_id);
CREATE INDEX payments_method_idx ON private.payments(office_id,unit_id,payment_method_id);
CREATE INDEX payments_account_idx ON private.payments(office_id,unit_id,account_id);
CREATE TABLE private.payment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,payment_id uuid NOT NULL,charge_id uuid NOT NULL,expected_charge_version integer NOT NULL CHECK(expected_charge_version BETWEEN 1 AND 2147483646),
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000000),UNIQUE(office_id,id),UNIQUE(office_id,payment_id,charge_id),
 FOREIGN KEY(office_id,payment_id) REFERENCES private.payments(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,charge_id) REFERENCES private.charges(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX payment_allocations_charge_idx ON private.payment_allocations(office_id,charge_id);
CREATE TABLE private.payment_decisions (
 office_id uuid NOT NULL,payment_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('confirmed','rejected','settled')),evidence text,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),settled_on date,
 PRIMARY KEY(office_id,payment_id,kind),FOREIGN KEY(office_id,payment_id) REFERENCES private.payments(office_id,id) ON DELETE RESTRICT,
 CHECK(evidence IS NULL OR(char_length(evidence) BETWEEN 5 AND 500 AND evidence=btrim(evidence) AND evidence !~ '[[:cntrl:]]')),
 CHECK((kind='settled')=(settled_on IS NOT NULL))
);
CREATE UNIQUE INDEX payment_decisions_terminal_idx ON private.payment_decisions(office_id,payment_id) WHERE kind IN('confirmed','rejected');
CREATE INDEX payment_decisions_actor_idx ON private.payment_decisions(actor_id);
CREATE TABLE private.payment_ledger_links (
 office_id uuid NOT NULL,entry_id uuid NOT NULL,allocation_id uuid NOT NULL,PRIMARY KEY(office_id,entry_id),
 FOREIGN KEY(office_id,entry_id) REFERENCES private.cash_entries(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,allocation_id) REFERENCES private.payment_allocations(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX payment_ledger_allocation_idx ON private.payment_ledger_links(office_id,allocation_id);
ALTER TABLE private.cash_commands DROP CONSTRAINT cash_commands_kind_check;
ALTER TABLE private.cash_commands ADD CONSTRAINT cash_commands_kind_check CHECK(kind IN('configure','open','operate','payment'));
-- Deterministic historical mapping. Unknown tender/fee/settlement remains unknown.
INSERT INTO private.payments(id,office_id,unit_id,session_id,payment_method_id,account_id,payment_type,method_name,account_name,amount_cents,settlement,actor_id,created_at,legacy)
 SELECT id,office_id,unit_id,session_id,payment_method_id,account_id,payment_type,payment_method_name,account_name,amount_cents,CASE WHEN payment_type='card' THEN 'unknown' ELSE 'not_applicable' END,actor_id,created_at,true FROM private.cash_entries WHERE kind='received';
INSERT INTO private.payment_allocations(id,office_id,payment_id,charge_id,expected_charge_version,amount_cents)
 SELECT id,office_id,id,charge_id,coalesce((SELECT max(version) FROM private.charge_events v WHERE v.office_id=e.office_id AND v.charge_id=e.charge_id AND v.created_at<=e.created_at),1),amount_cents FROM private.cash_entries e WHERE kind='received';
INSERT INTO private.payment_decisions(office_id,payment_id,kind,actor_id,created_at) SELECT office_id,id,'confirmed',actor_id,created_at FROM private.cash_entries WHERE kind='received';
INSERT INTO private.payment_ledger_links(office_id,entry_id,allocation_id) SELECT office_id,id,CASE WHEN kind='received' THEN id ELSE original_entry_id END FROM private.cash_entries WHERE kind IN('received','refunded','reversed');
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['payments','payment_allocations','payment_decisions','payment_ledger_links'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t||'_immutable',t);
END LOOP;END $$;
-- Old public entry point still returns persisted historical responses. New receipt needs15.
ALTER FUNCTION private.cash_operate(uuid,jsonb) RENAME TO cash_operate_before15;
REVOKE ALL ON FUNCTION private.cash_operate_before15(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.cash_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.cash_actor(p_office_id,true,'cash.open');
 IF p_operation->>'kind'='receive' AND nullif(current_setting('jn.payment',true),'') IS NULL AND NOT EXISTS(SELECT FROM private.cash_commands WHERE office_id=p_office_id AND kind='operate' AND idempotency_key::text=p_operation->>'idempotency_key') THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN private.cash_operate_before15(p_office_id,p_operation);
END $$;
REVOKE ALL ON FUNCTION private.cash_operate(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.cash_operate(uuid,jsonb) TO authenticated;
CREATE FUNCTION private.payment_link_entry() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allocation uuid;BEGIN
 IF NEW.kind='received' THEN
  SELECT a.id INTO allocation FROM private.payment_allocations a JOIN private.payments p ON p.office_id=a.office_id AND p.id=a.payment_id
  WHERE a.office_id=NEW.office_id AND p.id::text=current_setting('jn.payment',true) AND a.charge_id=NEW.charge_id AND a.amount_cents=NEW.amount_cents AND p.session_id=NEW.session_id AND p.actor_id=NEW.actor_id AND p.payment_method_id=NEW.payment_method_id AND p.account_id=NEW.account_id AND p.payment_type=NEW.payment_type
  AND EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed')
  AND NOT EXISTS(SELECT FROM private.payment_ledger_links l JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id WHERE l.office_id=a.office_id AND l.allocation_id=a.id AND e.kind='received');
 ELSIF NEW.kind IN('refunded','reversed') THEN SELECT allocation_id INTO allocation FROM private.payment_ledger_links WHERE office_id=NEW.office_id AND entry_id=NEW.original_entry_id;
 ELSE RETURN NEW;END IF;
 IF allocation IS NULL THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.payment_ledger_links VALUES(NEW.office_id,NEW.id,allocation);RETURN NEW;
END $$;
CREATE TRIGGER payment_link_entry AFTER INSERT ON private.cash_entries FOR EACH ROW EXECUTE FUNCTION private.payment_link_entry();
CREATE OR REPLACE FUNCTION private.charges_amounts(p_office_id uuid,p_charge_id uuid) RETURNS TABLE(original_cents bigint,due_cents bigint,allocated_cents bigint,balance_cents bigint,version integer,cancelled boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH paid AS(SELECT coalesce(sum(e.applied_cents),0)::bigint total FROM private.payment_allocations a JOIN private.payment_ledger_links l ON l.office_id=a.office_id AND l.allocation_id=a.id JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id WHERE a.office_id=p_office_id AND a.charge_id=p_charge_id)
 SELECT (SELECT sum(i.total_cents)::bigint FROM private.charge_items i WHERE i.office_id=p_office_id AND i.charge_id=p_charge_id),sum(e.delta_cents)::bigint,(SELECT total FROM paid),sum(e.delta_cents)::bigint-(SELECT total FROM paid),max(e.version),bool_or(e.kind='cancelled') FROM private.charge_events e WHERE e.office_id=p_office_id AND e.charge_id=p_charge_id;
$$;
CREATE FUNCTION private.payment_json(p private.payments) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'reference','JN-PAG-'||p.id,'created_at',p.created_at,'amount_cents',p.amount_cents,'presented_cents',p.presented_cents,'change_cents',p.change_cents,'fee_cents',p.fee_cents,'net_cents',p.amount_cents-p.fee_cents,'payment_type',p.payment_type,'method_name',p.method_name,'account_name',p.account_name,'legacy',p.legacy,
 'status',CASE WHEN EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='rejected') THEN 'rejected' WHEN NOT EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed') THEN 'pending' WHEN totals.remaining=0 THEN 'reversed' WHEN totals.remaining<p.amount_cents THEN 'partially_reversed' ELSE 'confirmed' END,
 'settlement',CASE WHEN EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled') THEN 'settled' ELSE p.settlement END,
 'settled_on',coalesce((SELECT to_char(d.settled_on,'YYYY-MM-DD') FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled'),to_char(p.settled_on,'YYYY-MM-DD')),
 'evidence',coalesce((SELECT d.evidence FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id ORDER BY d.created_at DESC,d.kind LIMIT 1),p.evidence),'external_reference',p.external_reference,'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('charge_id',a.charge_id,'protocol',r.protocol,'amount_cents',a.amount_cents) ORDER BY a.charge_id) FROM private.payment_allocations a JOIN private.charges c ON c.office_id=a.office_id AND c.id=a.charge_id JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id WHERE a.office_id=p.office_id AND a.payment_id=p.id),'[]'::jsonb))
 FROM(SELECT coalesce(sum(e.applied_cents),0) remaining FROM private.payment_allocations a JOIN private.payment_ledger_links l ON l.office_id=a.office_id AND l.allocation_id=a.id JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id WHERE a.office_id=p.office_id AND a.payment_id=p.id) totals;
$$;
CREATE FUNCTION private.payment_destinations(p_office_id uuid,p_session_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH ledger AS(SELECT account_id,max(account_name) account_name,payment_type,coalesce(sum(amount_cents) FILTER(WHERE kind='received'),0) received,coalesce(sum(amount_cents) FILTER(WHERE kind IN('refunded','reversed')),0) returned FROM private.cash_entries WHERE office_id=p_office_id AND session_id=p_session_id AND kind IN('received','refunded','reversed') GROUP BY account_id,payment_type),
 headers AS(SELECT p.account_id,p.payment_type,CASE WHEN bool_or(p.fee_cents IS NULL) THEN NULL ELSE sum(p.fee_cents) END fees,CASE WHEN bool_or(p.settlement='unknown') THEN NULL ELSE sum(CASE WHEN p.payment_type='card' AND(p.settlement='settled' OR EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled')) THEN p.amount_cents-p.fee_cents ELSE 0 END) END settled FROM private.payments p WHERE p.office_id=p_office_id AND p.session_id=p_session_id AND EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed') GROUP BY p.account_id,p.payment_type)
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_name',l.account_name,'payment_type',l.payment_type,'received_cents',l.received,'returned_cents',l.returned,'fee_cents',CASE WHEN h.account_id IS NULL THEN 0 ELSE h.fees END,'net_cents',l.received-l.returned-CASE WHEN h.account_id IS NULL THEN 0 ELSE h.fees END,'settled_cents',CASE WHEN h.account_id IS NULL THEN 0 ELSE h.settled END) ORDER BY l.account_name,l.payment_type),'[]'::jsonb) FROM ledger l LEFT JOIN headers h ON h.account_id=l.account_id AND h.payment_type=l.payment_type;
$$;
REVOKE ALL ON FUNCTION private.payment_destinations(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.cash_payments_page(p_office_id uuid,p_session_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s private.cash_sessions;caller uuid;BEGIN
 caller:=private.cash_actor(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p_session_id FOR SHARE;caller:=private.cash_actor(p_office_id);
 IF s.id IS NULL OR(s.operator_id<>caller AND NOT private.current_permissions(p_office_id) @> ARRAY['cash.read_all']) THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.payment_json(p) ORDER BY p.created_at DESC,p.id DESC) FROM(SELECT * FROM private.payments WHERE office_id=p_office_id AND session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)p),'[]'::jsonb),'total',(SELECT count(*) FROM private.payments WHERE office_id=p_office_id AND session_id=s.id),'page',p_page,'destinations',private.payment_destinations(p_office_id,s.id));
END $$;
CREATE FUNCTION private.payment_date(v jsonb,p_nullable boolean DEFAULT true) RETURNS date LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' SET datestyle='ISO,YMD' AS $$
DECLARE d date;BEGIN
 IF v='null'::jsonb AND p_nullable THEN RETURN NULL;END IF;
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR(v#>>'{}') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN d:=(v#>>'{}')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 IF NOT isfinite(d) OR d<date '0001-01-01' OR d>date '9999-12-31' OR to_char(d,'YYYY-MM-DD')<>v#>>'{}' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN d;
END $$;
REVOKE ALL ON FUNCTION private.payment_date(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.payment_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE caller uuid;m public.memberships;s private.cash_sessions;p private.payments;method private.payment_methods;account private.financial_accounts;cmd private.cash_commands;r public.requests;a record;item jsonb;alloc private.payment_allocations;
 k text;key uuid;sid uuid;expected integer;digest text;keys text[];total bigint;presented bigint;fee bigint;physical bigint;expected_charge integer;operation_result jsonb;internal_key uuid;confirmed boolean;decision text;
BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,NULL);
 IF jsonb_typeof(p_operation) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_operation->>'kind';keys:=ARRAY['kind','session_id','expected_version','idempotency_key','evidence'];
 IF k='record' THEN keys:=keys||ARRAY['payment_method_id','status','allocations','presented_cents','fee_cents','settlement','settled_on','external_reference'];
 ELSIF k IN('confirm','reject') THEN keys:=keys||ARRAY['payment_id'];ELSIF k='settle' THEN keys:=keys||ARRAY['payment_id','settled_on'];ELSE RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT p_operation ?& keys OR(SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) OR jsonb_typeof(p_operation->'evidence') IS DISTINCT FROM 'string' OR char_length(p_operation->>'evidence') NOT BETWEEN 5 AND 500 OR p_operation->>'evidence'<>btrim(p_operation->>'evidence') OR p_operation->>'evidence' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 sid:=(p_operation->>'session_id')::uuid;key:=(p_operation->>'idempotency_key')::uuid;expected:=(p_operation->>'expected_version')::integer;
 IF sid IS NULL OR key IS NULL OR jsonb_typeof(p_operation->'expected_version') IS DISTINCT FROM 'number' OR (p_operation->>'expected_version')::numeric<>expected OR expected NOT BETWEEN 1 AND 2147483645 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,NULL);
 IF s.id IS NULL OR s.operator_id<>caller THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF k='record' THEN
  IF jsonb_typeof(p_operation->'allocations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_operation->'allocations') NOT BETWEEN 1 AND 10 OR jsonb_typeof(p_operation->'status') IS DISTINCT FROM 'string' OR p_operation->>'status' NOT IN('pending','confirmed') THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
  total:=0;
  FOR item IN SELECT value FROM jsonb_array_elements(p_operation->'allocations') LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR NOT item ?& ARRAY['charge_id','expected_charge_version','amount_cents'] OR(SELECT count(*) FROM jsonb_object_keys(item))<>3 OR jsonb_typeof(item->'amount_cents') IS DISTINCT FROM 'number' OR(item->>'amount_cents')::numeric<>trunc((item->>'amount_cents')::numeric) OR(item->>'amount_cents')::numeric NOT BETWEEN 1 AND 1000000000000 OR jsonb_typeof(item->'expected_charge_version') IS DISTINCT FROM 'number' OR(item->>'expected_charge_version')::numeric NOT BETWEEN 1 AND 2147483646 OR(item->>'expected_charge_version')::numeric<>trunc((item->>'expected_charge_version')::numeric) OR(item->>'charge_id')::uuid IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;total:=total+(item->>'amount_cents')::bigint;
  END LOOP;
  IF total>1000000000000 OR(SELECT count(DISTINCT (x->>'charge_id')::uuid) FROM jsonb_array_elements(p_operation->'allocations')x)<>jsonb_array_length(p_operation->'allocations') THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 ELSE
  SELECT * INTO p FROM private.payments WHERE office_id=p_office_id AND id=(p_operation->>'payment_id')::uuid FOR UPDATE;
  IF p.id IS NULL OR p.session_id<>s.id OR p.actor_id<>caller THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 END IF;
 -- Deterministic request locks protect every allocation and serialize adjustments/transfers.
 FOR r IN SELECT rq.* FROM public.requests rq JOIN private.charges c ON c.office_id=rq.office_id AND c.request_id=rq.id WHERE c.office_id=p_office_id AND c.id IN(SELECT (x->>'charge_id')::uuid FROM jsonb_array_elements(CASE WHEN k='record' THEN p_operation->'allocations' ELSE(SELECT jsonb_agg(jsonb_build_object('charge_id',charge_id)) FROM private.payment_allocations WHERE office_id=p_office_id AND payment_id=p.id) END)x) ORDER BY rq.id FOR UPDATE OF rq LOOP
  caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,NULL);IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END LOOP;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='payment' AND idempotency_key=key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 IF k IN('record','confirm') AND NOT EXISTS(SELECT FROM private.cash_units u JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND f.id=s.cash_account_id AND u.active AND f.active) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF expected<>s.version OR(s.status<>'open' AND(k='record' OR k='confirm')) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='record' THEN
  SELECT * INTO method FROM private.payment_methods WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=(p_operation->>'payment_method_id')::uuid FOR SHARE;
  SELECT * INTO account FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=method.destination_account_id FOR SHARE;
  IF method.id IS NULL OR account.id IS NULL OR NOT method.active OR NOT account.active OR(method.type='cash')<>(account.type='cash') OR(method.type='cash' AND account.id<>s.cash_account_id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
  presented:=(p_operation->>'presented_cents')::bigint;fee:=(p_operation->>'fee_cents')::bigint;
  IF jsonb_typeof(p_operation->'fee_cents') IS DISTINCT FROM 'number' OR(p_operation->>'fee_cents')::numeric<>fee OR fee NOT BETWEEN 0 AND total OR(method.type<>'card' AND fee<>0) OR(method.type='cash' AND(jsonb_typeof(p_operation->'presented_cents') IS DISTINCT FROM 'number' OR(p_operation->>'presented_cents')::numeric<>presented OR presented NOT BETWEEN total AND 1000000000000)) OR(method.type<>'cash' AND p_operation->'presented_cents'<>'null') OR(p_operation->>'external_reference' IS NOT NULL AND(jsonb_typeof(p_operation->'external_reference') IS DISTINCT FROM 'string' OR char_length(p_operation->>'external_reference') NOT BETWEEN 1 AND 120 OR p_operation->>'external_reference'<>btrim(p_operation->>'external_reference') OR p_operation->>'external_reference' ~ '[[:cntrl:]]')) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
  INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest) VALUES(p_office_id,'payment',key,caller,digest);
  PERFORM set_config('jn.payment_command',key::text,true);
  INSERT INTO private.payments(office_id,unit_id,session_id,payment_method_id,account_id,payment_type,method_name,account_name,amount_cents,presented_cents,change_cents,fee_cents,settlement,settled_on,evidence,external_reference,actor_id)
  VALUES(p_office_id,s.unit_id,s.id,method.id,account.id,method.type,method.name,account.name,total,presented,CASE WHEN method.type='cash' THEN presented-total END,fee,p_operation->>'settlement',private.payment_date(p_operation->'settled_on',k='record'),p_operation->>'evidence',p_operation->>'external_reference',caller) RETURNING * INTO p;
  FOR item IN SELECT value FROM jsonb_array_elements(p_operation->'allocations') LOOP
   INSERT INTO private.payment_allocations(office_id,payment_id,charge_id,expected_charge_version,amount_cents)VALUES(p_office_id,p.id,(item->>'charge_id')::uuid,(item->>'expected_charge_version')::integer,(item->>'amount_cents')::bigint);
  END LOOP;
 ELSE
  INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'payment',key,caller,digest);
 END IF;
 PERFORM set_config('jn.payment_command',key::text,true);
 confirmed:=EXISTS(SELECT FROM private.payment_decisions WHERE office_id=p_office_id AND payment_id=p.id AND kind='confirmed');
 IF k IN('confirm','reject') AND EXISTS(SELECT FROM private.payment_decisions WHERE office_id=p_office_id AND payment_id=p.id AND kind IN('confirmed','rejected')) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='settle' AND (NOT confirmed OR p.payment_type<>'card' OR p.settlement<>'pending' OR EXISTS(SELECT FROM private.payment_decisions WHERE office_id=p_office_id AND payment_id=p.id AND kind='settled')) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 -- Revalidate after every lock, including current membership/scope on replays.
 caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,NULL);
 FOR alloc IN SELECT * FROM private.payment_allocations WHERE office_id=p_office_id AND payment_id=p.id ORDER BY charge_id LOOP
  SELECT rq.* INTO r FROM public.requests rq JOIN private.charges c ON c.office_id=rq.office_id AND c.request_id=rq.id WHERE c.office_id=p_office_id AND c.id=alloc.charge_id;
  IF r.id IS NULL OR private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT * INTO a FROM private.charges_amounts(p_office_id,alloc.charge_id);
  IF(k='record' OR k='confirm') AND(a.cancelled OR r.status='cancelado' OR a.version<>alloc.expected_charge_version OR a.balance_cents<alloc.amount_cents) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END LOOP;
 IF k='confirm' OR(k='record' AND p_operation->>'status'='confirmed') THEN
  SELECT * INTO method FROM private.payment_methods WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=p.payment_method_id FOR SHARE;
  SELECT * INTO account FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=p.account_id FOR SHARE;
  caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,NULL);
  IF method.id IS NULL OR account.id IS NULL OR NOT method.active OR NOT account.active OR method.type<>p.payment_type OR method.destination_account_id<>p.account_id OR(method.type='cash')<>(account.type='cash') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT s.opening_cents+coalesce(sum(cash_cents),0) INTO physical FROM private.cash_entries WHERE office_id=p_office_id AND session_id=s.id;
  IF p.payment_type='cash' AND p.change_cents>physical THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
  INSERT INTO private.payment_decisions(office_id,payment_id,kind,evidence,actor_id)VALUES(p_office_id,p.id,'confirmed',p_operation->>'evidence',caller);
  PERFORM set_config('jn.payment',p.id::text,true);
  FOR alloc IN SELECT * FROM private.payment_allocations WHERE office_id=p_office_id AND payment_id=p.id ORDER BY charge_id LOOP
   internal_key:=md5('jn15:'||p.id::text||':'||alloc.id::text)::uuid;
   PERFORM private.cash_operate_before15(p_office_id,jsonb_build_object('kind','receive','session_id',s.id,'expected_version',s.version,'idempotency_key',internal_key,'charge_id',alloc.charge_id,'expected_charge_version',alloc.expected_charge_version,'payment_method_id',p.payment_method_id,'amount_cents',alloc.amount_cents));
   SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=s.id;
  END LOOP;
  PERFORM set_config('jn.payment','',true);
 ELSIF k='reject' THEN INSERT INTO private.payment_decisions(office_id,payment_id,kind,evidence,actor_id)VALUES(p_office_id,p.id,'rejected',p_operation->>'evidence',caller);
 ELSIF k='settle' THEN INSERT INTO private.payment_decisions(office_id,payment_id,kind,evidence,actor_id,settled_on)VALUES(p_office_id,p.id,'settled',p_operation->>'evidence',caller,private.payment_date(p_operation->'settled_on',k='record'));
 END IF;
 IF k<>'confirm' AND NOT(k='record' AND p_operation->>'status'='confirmed') THEN
  PERFORM private.emit_business_event(p_office_id,CASE k WHEN 'reject' THEN 'payments.rejected' WHEN 'settle' THEN 'payments.settled' ELSE 'payments.pending' END,'cash_session',s.id,key,jsonb_build_object('amount_cents',p.amount_cents,'session_id',s.id,'payment_id',p.id));
 END IF;
 operation_result:=private.cash_statement_record(s,caller,1);
 PERFORM set_config('jn.cash_command',key::text,true);
 UPDATE private.cash_commands c SET result=operation_result WHERE c.office_id=p_office_id AND c.kind='payment' AND c.idempotency_key=key;
 PERFORM set_config('jn.cash_command','',true);
 PERFORM set_config('jn.payment_command','',true);
 RETURN operation_result;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation OR invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';WHEN foreign_key_violation THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';
 END;
END $$;
CREATE FUNCTION public.cash_payments_page(p_office_id uuid,p_session_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_payments_page(p_office_id,p_session_id,p_page);$$;
CREATE FUNCTION public.payment_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.payment_operate(p_office_id,p_operation);$$;
DO $$DECLARE signature text;BEGIN FOREACH signature IN ARRAY ARRAY['private.payment_link_entry()','private.payment_json(private.payments)','private.cash_payments_page(uuid,uuid,integer)','private.payment_operate(uuid,jsonb)','public.cash_payments_page(uuid,uuid,integer)','public.payment_operate(uuid,jsonb)'] LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,anon,authenticated,service_role';IF signature NOT IN('private.payment_link_entry()','private.payment_json(private.payments)') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO authenticated';END IF;END LOOP;END $$;
-- Enrich the existing statement; keep old command results byte-for-byte as JSONB.
ALTER FUNCTION private.cash_statement_record(private.cash_sessions,uuid,integer) RENAME TO cash_statement_record_before15;
CREATE FUNCTION private.cash_statement_record(s private.cash_sessions,p_actor uuid,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.cash_statement_record_before15(s,p_actor,p_page)||jsonb_build_object('payments',jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.payment_json(p) ORDER BY p.created_at DESC,p.id DESC) FROM(SELECT * FROM private.payments WHERE office_id=s.office_id AND session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 5)p),'[]'::jsonb),'total',(SELECT count(*) FROM private.payments WHERE office_id=s.office_id AND session_id=s.id),'page',1,'destinations',private.payment_destinations(s.office_id,s.id)));$$;
REVOKE ALL ON FUNCTION private.cash_statement_record(private.cash_sessions,uuid,integer),private.cash_statement_record_before15(private.cash_sessions,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
-- Presentation2 adds labels only. Presentation1 and every old PDF producer stay frozen.
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 2;
CREATE FUNCTION private.payment_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cmd private.cash_commands;owner_id uuid;BEGIN
 SELECT * INTO cmd FROM private.cash_commands WHERE office_id=NEW.office_id AND kind='payment' AND idempotency_key::text=current_setting('jn.payment_command',true) AND actor_id=auth.uid() AND result IS NULL;
 IF cmd.idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF TG_TABLE_NAME='payments' THEN owner_id:=NEW.actor_id;ELSE SELECT actor_id INTO owner_id FROM private.payments WHERE office_id=NEW.office_id AND id=NEW.payment_id;END IF;
 IF owner_id IS DISTINCT FROM cmd.actor_id OR(TG_TABLE_NAME='payment_decisions' AND (to_jsonb(NEW)->>'actor_id')::uuid IS DISTINCT FROM cmd.actor_id) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payments_insert_guard BEFORE INSERT ON private.payments FOR EACH ROW EXECUTE FUNCTION private.payment_insert_guard();
CREATE TRIGGER payment_allocations_insert_guard BEFORE INSERT ON private.payment_allocations FOR EACH ROW EXECUTE FUNCTION private.payment_insert_guard();
CREATE TRIGGER payment_decisions_insert_guard BEFORE INSERT ON private.payment_decisions FOR EACH ROW EXECUTE FUNCTION private.payment_insert_guard();
REVOKE ALL ON FUNCTION private.payment_insert_guard() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.safe_audit_changes(p_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v jsonb; result jsonb:='{}'; safe boolean;
BEGIN
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RETURN result; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_changes) LOOP
  safe:=false;
  IF k IN ('active','can_create_owner') THEN safe:=jsonb_typeof(v)='boolean';
  ELSIF k='role_code' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}'=ANY(ARRAY['owner','admin','employee','client']);
  ELSIF k IN ('payment_id','membership_id','archive_id','customer_id','source_id','target_id','relation_id','merge_id','report_id','notification_id','entry_id','unit_id','session_id','charge_id','request_id','file_id','item_id','model_id') THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ELSIF k='expires_at' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9TZ:+. -]{20,35}$';
  ELSIF k='count' AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN 0 AND 10000;
  ELSIF k IN ('amount_cents','due_cents','delta_cents','counted_cents','expected_cents','version') AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN -9007199254740991 AND 9007199254740991 AND trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric;
  ELSIF k IN ('days','previous_days') THEN safe:=v IN ('30'::jsonb,'60'::jsonb,'90'::jsonb);
  ELSIF k='view' THEN safe:=v IN ('"recent"'::jsonb,'"archived"'::jsonb);
  ELSIF k IN ('permissions','allowed_permissions') AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;
