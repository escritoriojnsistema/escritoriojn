-- Etapa17: expenses, internal transfers and immutable payment receipts. No hosted fixtures.
INSERT INTO public.permissions(code,name) VALUES ('expenses.read','Consultar despesas'),('expenses.create','Registrar despesas'),('expenses.approve','Aprovar despesas'),('expenses.pay','Pagar despesas'),('cash.transfer','Transferir valores'),('receipts.issue','Emitir recibos'),('receipts.read','Consultar recibos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('expenses.read','expenses.create','expenses.approve','expenses.pay','cash.transfer','receipts.issue','receipts.read') ON CONFLICT DO NOTHING;
-- Extend existing permission validation without replacing unrelated prior capabilities.
DO $migration$ DECLARE r record; d text; extra text := ', ''expenses.read'', ''expenses.create'', ''expenses.approve'', ''expenses.pay'', ''cash.transfer'', ''receipts.issue'', ''receipts.read'''; BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%cash.read%' LOOP
 d:=replace(r.def,'''cash.read''::text','''cash.read''::text'||replace(extra,', ', '::text, ')||'::text');
 EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname); EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP
 d:=pg_get_functiondef(r.oid);d:=replace(d,'''cash.read''','''cash.read'''||extra);EXECUTE d;
 END LOOP;
END $migration$;
ALTER TABLE private.cash_commands DROP CONSTRAINT cash_commands_kind_check;
ALTER TABLE private.cash_commands ADD CONSTRAINT cash_commands_kind_check CHECK(kind IN('configure','open','operate','payment','correction','expense','transfer','receipt'));
CREATE TABLE private.expenses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),
 category text NOT NULL CHECK(char_length(category) BETWEEN 2 AND 120),payee text NOT NULL CHECK(char_length(payee) BETWEEN 2 AND 120),description text NOT NULL CHECK(char_length(description) BETWEEN 5 AND 300),
 due_date date NOT NULL CHECK(due_date BETWEEN DATE '1900-01-01' AND DATE '9999-12-31'),amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000000),
 evidence text NOT NULL,status text NOT NULL CHECK(status IN('pending','approved','paid')),version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by uuid REFERENCES auth.users(id),approved_at timestamptz,approval_evidence text,paid_at timestamptz,payment_evidence text,session_id uuid,account_id uuid,entry_id uuid,
 UNIQUE(office_id,id),FOREIGN KEY(office_id,entry_id) REFERENCES private.cash_entries(office_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((status='pending')=(approved_at IS NULL)),CHECK((status='paid')=(paid_at IS NOT NULL))
);
CREATE INDEX expenses_page_idx ON private.expenses(office_id,created_at DESC,id DESC);
CREATE TABLE private.expense_history(office_id uuid NOT NULL,expense_id uuid NOT NULL,version integer NOT NULL,snapshot jsonb NOT NULL,command_key uuid NOT NULL,PRIMARY KEY(office_id,expense_id,version),FOREIGN KEY(office_id,expense_id) REFERENCES private.expenses(office_id,id));
CREATE TABLE private.financial_transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,session_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('transfer','sangria','reforco')),
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000000),source_account_id uuid NOT NULL,destination_account_id uuid NOT NULL,source_account_name text NOT NULL,destination_account_name text NOT NULL,
 reason text NOT NULL,evidence text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),command_key uuid NOT NULL,
 UNIQUE(office_id,id),UNIQUE(office_id,command_key),CHECK(source_account_id<>destination_account_id)
);
CREATE INDEX financial_transfers_session_idx ON private.financial_transfers(office_id,session_id,created_at DESC,id DESC);
CREATE TABLE private.payment_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,payment_id uuid NOT NULL,number bigint NOT NULL CHECK(number>0),version integer NOT NULL CHECK(version=1),issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),snapshot jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command_key uuid NOT NULL,UNIQUE(office_id,number),UNIQUE(office_id,payment_id),FOREIGN KEY(office_id,payment_id) REFERENCES private.payments(office_id,id)
);
-- Immutable snapshots and closed direct ACL/RLS on every new relation.
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['expenses','expense_history','financial_transfers','payment_receipts'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 IF t<>'expenses' THEN EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t);END IF;
END LOOP;END $$;
CREATE FUNCTION private.finance17_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE k text;BEGIN
 k:=CASE TG_TABLE_NAME WHEN 'expenses' THEN 'expense' WHEN 'expense_history' THEN 'expense' WHEN 'financial_transfers' THEN 'transfer' ELSE 'receipt' END;
 IF TG_OP='DELETE' OR NOT EXISTS(SELECT FROM private.cash_commands c WHERE c.office_id=NEW.office_id AND c.kind=k AND c.actor_id=auth.uid() AND c.result IS NULL AND c.idempotency_key::text=current_setting('jn.cash_command',true)) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF TG_TABLE_NAME='expenses' AND TG_OP='UPDATE' THEN
 IF OLD.status='paid' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['status','version','approved_by','approved_at','approval_evidence','paid_at','payment_evidence','session_id','account_id','entry_id'])<>(to_jsonb(OLD)-ARRAY['status','version','approved_by','approved_at','approval_evidence','paid_at','payment_evidence','session_id','account_id','entry_id']) OR NOT ((OLD.status='pending' AND NEW.status='approved') OR(OLD.status='approved' AND NEW.status='paid')) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER expenses_guard BEFORE INSERT OR UPDATE OR DELETE ON private.expenses FOR EACH ROW EXECUTE FUNCTION private.finance17_guard();
CREATE TRIGGER expense_history_guard BEFORE INSERT ON private.expense_history FOR EACH ROW EXECUTE FUNCTION private.finance17_guard();
CREATE TRIGGER transfers_guard BEFORE INSERT ON private.financial_transfers FOR EACH ROW EXECUTE FUNCTION private.finance17_guard();
CREATE TRIGGER receipts_guard BEFORE INSERT ON private.payment_receipts FOR EACH ROW EXECUTE FUNCTION private.finance17_guard();
-- Preserve16 constraint semantics verbatim; additional kinds never allocate revenue.
DO $$DECLARE r record;d text;BEGIN
 FOR r IN SELECT conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='private.cash_entries'::regclass AND conname IN('cash_entries_shape16','cash_entries_effect16','cash_entries_cash16') LOOP
 EXECUTE format('ALTER TABLE private.cash_entries DROP CONSTRAINT %I',r.conname);
 d:=substring(r.def FROM 8 FOR char_length(r.def)-8);
 EXECUTE format('ALTER TABLE private.cash_entries ADD CONSTRAINT %I CHECK ((kind NOT IN(''expense_paid'',''transfer_out'',''transfer_in'') AND (%s)) OR (kind IN(''expense_paid'',''transfer_out'',''transfer_in'') AND charge_id IS NULL AND request_id IS NULL AND payment_method_id IS NULL AND original_entry_id IS NULL AND account_id IS NOT NULL AND account_name IS NOT NULL AND payment_type IN(''cash'',''transfer'') AND payment_method_name IS NULL AND amount_cents>0 AND applied_cents=0 AND counted_cents IS NULL AND expected_cents IS NULL AND cash_cents=CASE WHEN payment_type=''cash'' THEN CASE WHEN kind=''transfer_in'' THEN amount_cents ELSE -amount_cents END ELSE 0 END))',replace(r.conname,'16','17'),d);
 END LOOP;
END $$;
ALTER TABLE private.cash_entries DROP CONSTRAINT cash_entries_kind_check;
ALTER TABLE private.cash_entries ADD CONSTRAINT cash_entries_kind_check CHECK(kind IN('received','refunded','reversed','reconciled','closed','allocation_reversed','refund_paid','expense_paid','transfer_out','transfer_in'));
DROP INDEX private.cash_entries_legacy_command_idx;
CREATE UNIQUE INDEX cash_entries_legacy_command_idx ON private.cash_entries(office_id,command_key) WHERE kind NOT IN('allocation_reversed','refund_paid','expense_paid','transfer_out','transfer_in');
CREATE UNIQUE INDEX cash_entries_finance17_command_idx ON private.cash_entries(office_id,command_key,kind) WHERE kind IN('expense_paid','transfer_out','transfer_in');
DO $$DECLARE d text;BEGIN
 d:=pg_get_functiondef('private.cash_entry_guard()'::regprocedure);
 d:=replace(d,'((c.kind=''operate'' AND NEW.kind NOT IN(''allocation_reversed'',''refund_paid'')) OR(c.kind=''correction'' AND NEW.kind IN(''allocation_reversed'',''refund_paid'')))','((c.kind=''operate'' AND NEW.kind NOT IN(''allocation_reversed'',''refund_paid'',''expense_paid'',''transfer_out'',''transfer_in'')) OR(c.kind=''correction'' AND NEW.kind IN(''allocation_reversed'',''refund_paid'')) OR(c.kind=''expense'' AND NEW.kind=''expense_paid'') OR(c.kind=''transfer'' AND NEW.kind IN(''transfer_out'',''transfer_in'')))');EXECUTE d;
 d:=pg_get_functiondef('private.cash_session_guard()'::regprocedure);d:=replace(d,'c.kind IN(''operate'',''correction'')','c.kind IN(''operate'',''correction'',''expense'',''transfer'')');EXECUTE d;
END $$;
CREATE FUNCTION private.finance17_text(v text,lo integer,hi integer) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$SELECT v IS NOT NULL AND char_length(v) BETWEEN lo AND hi AND v=btrim(v) AND v !~ '[[:cntrl:]]';$$;
CREATE FUNCTION private.finance17_page(p_office_id uuid,p_session_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;s private.cash_sessions;caps text[];BEGIN
 caller:=private.cash_actor(p_office_id);caps:=private.current_permissions(p_office_id);
 IF NOT (caps @> ARRAY['expenses.read'] OR caps @> ARRAY['cash.transfer']) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_session_id IS NOT NULL THEN SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p_session_id;IF s.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;IF s.operator_id<>caller AND NOT caps @> ARRAY['cash.read_all'] THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;END IF;
 RETURN jsonb_build_object('page',p_page,'page_size',5,'total',(SELECT count(*) FROM private.expenses WHERE office_id=p_office_id AND caps @> ARRAY['expenses.read']),'expenses',coalesce((SELECT jsonb_agg(to_jsonb(e)-'office_id' ORDER BY created_at DESC,id DESC) FROM(SELECT * FROM private.expenses WHERE office_id=p_office_id AND caps @> ARRAY['expenses.read'] ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)e),'[]'::jsonb),
 'transfers',coalesce((SELECT jsonb_agg(to_jsonb(t)-ARRAY['office_id','actor_id','command_key'] ORDER BY created_at DESC,id DESC) FROM(SELECT * FROM private.financial_transfers WHERE office_id=p_office_id AND session_id=p_session_id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)t),'[]'::jsonb),'transfers_total',(SELECT count(*) FROM private.financial_transfers WHERE office_id=p_office_id AND session_id=p_session_id),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'unit_id',a.unit_id,'name',a.name,'type',a.type) ORDER BY a.name,a.id) FROM(SELECT * FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND active ORDER BY name,id LIMIT 100)a),'[]'::jsonb),'accounts_total',(SELECT count(*) FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND active),
 'can_create',caps @> ARRAY['expenses.read','expenses.create'],'can_approve',caps @> ARRAY['expenses.read','expenses.approve'],'can_pay',caps @> ARRAY['expenses.read','expenses.pay'],'can_transfer',caps @> ARRAY['cash.transfer'],'can_issue_receipt',caps @> ARRAY['receipts.issue','receipts.read']);
END $$;
CREATE FUNCTION private.finance17_funds(p_office uuid,p_session uuid,p_account uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT opening_cents FROM private.cash_sessions WHERE office_id=p_office AND id=p_session AND cash_account_id=p_account),0)
 +coalesce((SELECT sum(CASE WHEN kind IN('received','transfer_in') THEN amount_cents WHEN kind IN('refunded','reversed','refund_paid','expense_paid','transfer_out') THEN -amount_cents ELSE 0 END) FROM private.cash_entries WHERE office_id=p_office AND session_id=p_session AND account_id=p_account),0)
 -coalesce((SELECT sum(CASE WHEN p.fee_cents IS NULL OR NOT(p.settlement='settled' OR EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled')) THEN p.amount_cents ELSE p.fee_cents END) FROM private.payments p WHERE p.office_id=p_office AND p.session_id=p_session AND p.account_id=p_account AND p.payment_type='card' AND EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed')),0);
$$;
CREATE FUNCTION private.expense_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<op>>
DECLARE caller uuid;k text;key uuid;digest text;cmd private.cash_commands;e private.expenses;s private.cash_sessions;a private.financial_accounts;keys text[];result jsonb;amount bigint;ver integer;sid uuid;aid uuid;eid uuid;sv integer;entry uuid;BEGIN
 k:=p_operation->>'kind';caller:=private.cash_actor(p_office_id,true,CASE k WHEN 'create' THEN 'expenses.create' WHEN 'approve' THEN 'expenses.approve' WHEN 'pay' THEN 'expenses.pay' ELSE 'expenses.read' END);
 IF NOT private.current_permissions(p_office_id) @> (ARRAY['expenses.read']||CASE WHEN k='pay' THEN ARRAY['cash.open'] ELSE ARRAY[]::text[] END) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 keys:=CASE k WHEN 'create' THEN ARRAY['kind','idempotency_key','category','payee','description','due_date','amount_cents','evidence'] WHEN 'approve' THEN ARRAY['kind','idempotency_key','expense_id','expected_version','evidence'] WHEN 'pay' THEN ARRAY['kind','idempotency_key','expense_id','expected_version','session_id','expected_session_version','account_id','evidence'] ELSE NULL END;
 IF keys IS NULL OR jsonb_typeof(p_operation) IS DISTINCT FROM 'object' OR NOT p_operation ?& keys OR (SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) OR jsonb_typeof(p_operation->'evidence') IS DISTINCT FROM 'string' OR NOT private.finance17_text(p_operation->>'evidence',5,500) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 key:=(p_operation->>'idempotency_key')::uuid;
 IF k='create' THEN
 amount:=(p_operation->>'amount_cents')::bigint;
 IF jsonb_typeof(p_operation->'category') IS DISTINCT FROM 'string' OR jsonb_typeof(p_operation->'payee') IS DISTINCT FROM 'string' OR jsonb_typeof(p_operation->'description') IS DISTINCT FROM 'string' OR jsonb_typeof(p_operation->'due_date') IS DISTINCT FROM 'string' OR amount IS NULL OR jsonb_typeof(p_operation->'amount_cents') IS DISTINCT FROM 'number' OR (p_operation->>'amount_cents')::numeric<>amount OR amount NOT BETWEEN 1 AND 1000000000000 OR NOT private.finance17_text(p_operation->>'category',2,120) OR NOT private.finance17_text(p_operation->>'payee',2,120) OR NOT private.finance17_text(p_operation->>'description',5,300) OR p_operation->>'due_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_operation->>'due_date')::date NOT BETWEEN DATE '1900-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 ELSE
 eid:=(p_operation->>'expense_id')::uuid;ver:=(p_operation->>'expected_version')::integer;
 IF eid IS NULL OR ver IS NULL OR ver NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(p_operation->'expected_version')<>'number' OR (p_operation->>'expected_version')::numeric<>ver THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF k='pay' THEN sid:=(p_operation->>'session_id')::uuid;aid:=(p_operation->>'account_id')::uuid;sv:=(p_operation->>'expected_session_version')::integer;IF sid IS NULL OR aid IS NULL OR sv IS NULL OR sv NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(p_operation->'expected_session_version')<>'number' OR (p_operation->>'expected_session_version')::numeric<>sv THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 END IF;
 IF key IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='expense' AND idempotency_key=key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 IF k<>'create' THEN SELECT * INTO e FROM private.expenses WHERE office_id=p_office_id AND id=eid FOR UPDATE;IF e.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;IF e.version<>ver OR(k='approve' AND e.status<>'pending') OR(k='pay' AND e.status<>'approved') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;END IF;
 IF k='pay' THEN
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=aid FOR UPDATE;
 IF s.id IS NULL OR a.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF s.operator_id<>caller THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF s.status<>'open' OR s.version<>sv OR NOT a.active OR(a.type='cash' AND a.id<>s.cash_account_id) OR e.amount_cents>private.finance17_funds(p_office_id,s.id,a.id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 caller:=private.cash_actor(p_office_id,true,CASE k WHEN 'create' THEN 'expenses.create' WHEN 'approve' THEN 'expenses.approve' ELSE 'expenses.pay' END);
 IF NOT private.current_permissions(p_office_id) @> (ARRAY['expenses.read']||CASE WHEN k='pay' THEN ARRAY['cash.open'] ELSE ARRAY[]::text[] END) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'expense',key,caller,digest);PERFORM set_config('jn.cash_command',key::text,true);
 IF k='create' THEN INSERT INTO private.expenses(office_id,category,payee,description,due_date,amount_cents,evidence,status,version,created_by)VALUES(p_office_id,p_operation->>'category',p_operation->>'payee',p_operation->>'description',(p_operation->>'due_date')::date,amount,p_operation->>'evidence','pending',1,caller)RETURNING * INTO e;
 ELSIF k='approve' THEN UPDATE private.expenses SET status='approved',version=version+1,approved_by=caller,approved_at=clock_timestamp(),approval_evidence=p_operation->>'evidence' WHERE office_id=p_office_id AND id=eid RETURNING * INTO e;
 ELSE
 entry:=gen_random_uuid();
 INSERT INTO private.cash_entries(id,office_id,unit_id,session_id,kind,account_id,account_name,payment_type,amount_cents,cash_cents,applied_cents,reason,actor_id,command_key)VALUES(entry,p_office_id,s.unit_id,s.id,'expense_paid',a.id,a.name,CASE WHEN a.type='cash' THEN 'cash' ELSE 'transfer' END,e.amount_cents,CASE WHEN a.type='cash' THEN -e.amount_cents ELSE 0 END,0,'Pagamento de despesa aprovada',caller,key);
 UPDATE private.expenses SET status='paid',version=version+1,paid_at=clock_timestamp(),payment_evidence=p_operation->>'evidence',session_id=s.id,account_id=a.id,entry_id=entry WHERE office_id=p_office_id AND id=eid RETURNING * INTO e;
 UPDATE private.cash_sessions SET version=version+1 WHERE office_id=p_office_id AND id=s.id;
 END IF;
 INSERT INTO private.expense_history(office_id,expense_id,version,snapshot,command_key)VALUES(p_office_id,e.id,e.version,to_jsonb(e)-'office_id',key);
 PERFORM private.emit_business_event(p_office_id,'expenses.'||k,'expense',e.id,key,jsonb_build_object('amount_cents',e.amount_cents,'version',e.version));
 result:=jsonb_build_object('expense',to_jsonb(e)-'office_id');UPDATE private.cash_commands SET result=op.result WHERE office_id=p_office_id AND kind='expense' AND idempotency_key=key;PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;
CREATE FUNCTION private.transfer_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<op>>
DECLARE caller uuid;k text;key uuid;digest text;cmd private.cash_commands;s private.cash_sessions;src private.financial_accounts;dst private.financial_accounts;t private.financial_transfers;result jsonb;amount bigint;sid uuid;srcid uuid;dstid uuid;sv integer;BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.transfer');PERFORM private.cash_actor(p_office_id,true,'cash.open');k:=p_operation->>'kind';
 IF jsonb_typeof(p_operation) IS DISTINCT FROM 'object' OR k IS NULL OR k NOT IN('transfer','sangria','reforco') OR NOT p_operation ?& ARRAY['kind','idempotency_key','session_id','expected_session_version','source_account_id','destination_account_id','amount_cents','reason','evidence'] OR (SELECT count(*) FROM jsonb_object_keys(p_operation))<>9 OR jsonb_typeof(p_operation->'reason') IS DISTINCT FROM 'string' OR NOT private.finance17_text(p_operation->>'reason',5,500) OR jsonb_typeof(p_operation->'evidence') IS DISTINCT FROM 'string' OR NOT private.finance17_text(p_operation->>'evidence',5,500) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 key:=(p_operation->>'idempotency_key')::uuid;sid:=(p_operation->>'session_id')::uuid;srcid:=(p_operation->>'source_account_id')::uuid;dstid:=(p_operation->>'destination_account_id')::uuid;sv:=(p_operation->>'expected_session_version')::integer;amount:=(p_operation->>'amount_cents')::bigint;
 IF key IS NULL OR sid IS NULL OR srcid IS NULL OR dstid IS NULL OR srcid=dstid OR sv IS NULL OR sv NOT BETWEEN 1 AND 2147483645 OR amount IS NULL OR amount NOT BETWEEN 1 AND 1000000000000 OR jsonb_typeof(p_operation->'amount_cents')<>'number' OR (p_operation->>'amount_cents')::numeric<>amount OR jsonb_typeof(p_operation->'expected_session_version')<>'number' OR(p_operation->>'expected_session_version')::numeric<>sv THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='transfer' AND idempotency_key=key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF s.operator_id<>caller THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM 1 FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id IN(srcid,dstid) ORDER BY id FOR UPDATE;
 SELECT * INTO src FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=srcid;SELECT * INTO dst FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=dstid;
 caller:=private.cash_actor(p_office_id,true,'cash.transfer');PERFORM private.cash_actor(p_office_id,true,'cash.open');
 IF src.id IS NULL OR dst.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF s.status<>'open' OR s.version<>sv OR NOT src.active OR NOT dst.active OR(src.type='cash' AND src.id<>s.cash_account_id) OR(dst.type='cash' AND dst.id<>s.cash_account_id) OR(k='sangria' AND(src.id<>s.cash_account_id OR dst.type='cash')) OR(k='reforco' AND(dst.id<>s.cash_account_id OR src.type='cash')) OR amount>private.finance17_funds(p_office_id,s.id,src.id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'transfer',key,caller,digest);PERFORM set_config('jn.cash_command',key::text,true);
 INSERT INTO private.financial_transfers(office_id,session_id,kind,amount_cents,source_account_id,destination_account_id,source_account_name,destination_account_name,reason,evidence,actor_id,command_key)VALUES(p_office_id,s.id,k,amount,src.id,dst.id,src.name,dst.name,p_operation->>'reason',p_operation->>'evidence',caller,key)RETURNING * INTO t;
 INSERT INTO private.cash_entries(office_id,unit_id,session_id,kind,account_id,account_name,payment_type,amount_cents,cash_cents,applied_cents,reason,actor_id,command_key)VALUES
 (p_office_id,s.unit_id,s.id,'transfer_out',src.id,src.name,CASE WHEN src.type='cash' THEN 'cash' ELSE 'transfer' END,amount,CASE WHEN src.type='cash' THEN -amount ELSE 0 END,0,p_operation->>'reason',caller,key),
 (p_office_id,s.unit_id,s.id,'transfer_in',dst.id,dst.name,CASE WHEN dst.type='cash' THEN 'cash' ELSE 'transfer' END,amount,CASE WHEN dst.type='cash' THEN amount ELSE 0 END,0,p_operation->>'reason',caller,key);
 UPDATE private.cash_sessions SET version=version+1 WHERE office_id=p_office_id AND id=s.id;
 PERFORM private.emit_business_event(p_office_id,'cash.transferred','cash_session',s.id,key,jsonb_build_object('amount_cents',amount));
 result:=jsonb_build_object('transfer',to_jsonb(t)-ARRAY['office_id','actor_id','command_key']);UPDATE private.cash_commands SET result=op.result WHERE office_id=p_office_id AND kind='transfer' AND idempotency_key=key;PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;
CREATE FUNCTION private.payment_receipt(p_office_id uuid,p_payment_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<op>>
DECLARE caller uuid;p private.payments;s private.cash_sessions;r private.payment_receipts;cmd private.cash_commands;digest text;result jsonb;caps text[];snapshot jsonb;BEGIN
 caller:=private.cash_actor(p_office_id,true,'receipts.read');caps:=private.current_permissions(p_office_id);
 IF p_payment_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO p FROM private.payments WHERE office_id=p_office_id AND id=p_payment_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p.session_id FOR SHARE;
 caller:=private.cash_actor(p_office_id,true,'receipts.read');caps:=private.current_permissions(p_office_id);
 IF s.operator_id<>caller AND NOT caps @> ARRAY['cash.read_all'] THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 digest:=encode(extensions.digest(p_payment_id::text,'sha256'),'hex');SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='receipt' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 SELECT * INTO r FROM private.payment_receipts WHERE office_id=p_office_id AND payment_id=p.id;
 IF r.id IS NOT NULL THEN
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'receipt',p_idempotency_key,caller,digest);PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 result:=(to_jsonb(r)-ARRAY['office_id','actor_id','command_key'])||jsonb_build_object('number',r.number::text);UPDATE private.cash_commands SET result=op.result WHERE office_id=p_office_id AND kind='receipt' AND idempotency_key=p_idempotency_key;PERFORM set_config('jn.cash_command','',true);RETURN result;END IF;
 IF NOT caps @> ARRAY['receipts.issue'] THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT EXISTS(SELECT FROM private.payment_decisions WHERE office_id=p_office_id AND payment_id=p.id AND kind='confirmed') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT jsonb_build_object('office_name',o.name,'operator_name',s.operator_name,'payer_name',NULL,'description','Recebimento de servicos','payment_reference','JN-PAG-'||p.id,'amount_cents',p.amount_cents,'payment_type',p.payment_type,'method_name',p.method_name,'confirmed_at',(SELECT created_at FROM private.payment_decisions WHERE office_id=p_office_id AND payment_id=p.id AND kind='confirmed'),'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('protocol',q.protocol,'amount_cents',a.amount_cents) ORDER BY q.protocol,a.id) FROM private.payment_allocations a JOIN private.charges c ON c.office_id=a.office_id AND c.id=a.charge_id JOIN public.requests q ON q.office_id=c.office_id AND q.id=c.request_id WHERE a.office_id=p_office_id AND a.payment_id=p.id),'[]'::jsonb)) INTO snapshot FROM public.offices o WHERE o.id=p_office_id;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'receipt',p_idempotency_key,caller,digest);PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 INSERT INTO private.payment_receipts(office_id,payment_id,number,version,snapshot,actor_id,command_key)SELECT p_office_id,p.id,coalesce(max(number),0)+1,1,op.snapshot,caller,p_idempotency_key FROM private.payment_receipts WHERE office_id=p_office_id RETURNING * INTO r;
 PERFORM private.emit_business_event(p_office_id,'receipts.issued','payment_receipt',r.id,p_idempotency_key,'{}');
 result:=(to_jsonb(r)-ARRAY['office_id','actor_id','command_key'])||jsonb_build_object('number',r.number::text);UPDATE private.cash_commands SET result=op.result WHERE office_id=p_office_id AND kind='receipt' AND idempotency_key=p_idempotency_key;PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;
CREATE FUNCTION public.finance17_page(p_office_id uuid,p_session_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.finance17_page(p_office_id,p_session_id,p_page);$$;
CREATE FUNCTION public.expense_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.expense_operate(p_office_id,p_operation);$$;
CREATE FUNCTION public.transfer_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.transfer_operate(p_office_id,p_operation);$$;
CREATE FUNCTION public.payment_receipt(p_office_id uuid,p_payment_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.payment_receipt(p_office_id,p_payment_id,p_idempotency_key);$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND proname IN('finance17_page','expense_operate','transfer_operate','payment_receipt','finance17_guard','finance17_text','finance17_funds') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN('finance17_page','expense_operate','transfer_operate','payment_receipt') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;END LOOP;END $$;

-- Current projection includes actual digital movements. Historical function bodies remain unchanged.
ALTER FUNCTION private.cash_statement_record(private.cash_sessions,uuid,integer) RENAME TO cash_statement_before17;
CREATE FUNCTION private.cash_statement_record(s private.cash_sessions,p_actor uuid,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH original AS(SELECT private.cash_statement_before17(s,p_actor,p_page) v)
 SELECT v||jsonb_build_object('session',(v->'session')||jsonb_build_object('digital_cents',(v->'session'->>'digital_cents')::bigint+coalesce((SELECT sum(CASE WHEN kind='transfer_in' THEN amount_cents ELSE -amount_cents END) FROM private.cash_entries WHERE office_id=s.office_id AND session_id=s.id AND payment_type<>'cash' AND kind IN('expense_paid','transfer_in','transfer_out')),0))) FROM original;
$$;
REVOKE ALL ON FUNCTION private.cash_statement_before17(private.cash_sessions,uuid,integer),private.cash_statement_record(private.cash_sessions,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE private.financial_accounts ADD CONSTRAINT financial_accounts_office_id_key UNIQUE(office_id,id);
ALTER TABLE private.cash_sessions ADD CONSTRAINT cash_sessions_office_id_key UNIQUE(office_id,id);
ALTER TABLE private.expenses ADD CONSTRAINT expenses_session_fk FOREIGN KEY(office_id,session_id) REFERENCES private.cash_sessions(office_id,id),ADD CONSTRAINT expenses_account_fk FOREIGN KEY(office_id,account_id) REFERENCES private.financial_accounts(office_id,id);
ALTER TABLE private.financial_transfers ADD CONSTRAINT financial_transfers_session_fk FOREIGN KEY(office_id,session_id) REFERENCES private.cash_sessions(office_id,id),ADD CONSTRAINT financial_transfers_source_fk FOREIGN KEY(office_id,source_account_id) REFERENCES private.financial_accounts(office_id,id),ADD CONSTRAINT financial_transfers_destination_fk FOREIGN KEY(office_id,destination_account_id) REFERENCES private.financial_accounts(office_id,id);
-- New reports use presentation4; existing snapshots and renderer1/2/3 remain intact.
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2,3,4));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 4;
-- audit_report_begin omits renderer_version, deliberately consuming this persisted default.
NOTIFY pgrst,'reload schema';
