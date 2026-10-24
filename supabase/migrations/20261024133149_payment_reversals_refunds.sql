-- Etapa16. Explicit logical reversals and actual refunds. No business fixtures/grants.
ALTER TABLE private.cash_commands DROP CONSTRAINT cash_commands_kind_check;
ALTER TABLE private.cash_commands ADD CONSTRAINT cash_commands_kind_check CHECK(kind IN('configure','open','operate','payment','correction'));
-- Replace only the four movement-shape checks, keeping all previous rows unchanged.
DO $$DECLARE c record;BEGIN FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='private.cash_entries'::regclass AND contype='c' AND (conname='cash_entries_kind_check' OR pg_get_constraintdef(oid) LIKE '%CASE%') LOOP EXECUTE format('ALTER TABLE private.cash_entries DROP CONSTRAINT %I',c.conname);END LOOP;END $$;
ALTER TABLE private.cash_entries ADD CONSTRAINT cash_entries_kind_check CHECK(kind IN('received','refunded','reversed','reconciled','closed','allocation_reversed','refund_paid')),
 ADD CONSTRAINT cash_entries_shape16 CHECK(CASE WHEN kind IN('received','refunded','reversed','allocation_reversed','refund_paid') THEN charge_id IS NOT NULL AND request_id IS NOT NULL AND payment_method_id IS NOT NULL AND account_id IS NOT NULL AND payment_type IS NOT NULL AND payment_method_name IS NOT NULL AND account_name IS NOT NULL AND amount_cents>0 AND counted_cents IS NULL AND expected_cents IS NULL ELSE charge_id IS NULL AND request_id IS NULL AND payment_method_id IS NULL AND account_id IS NULL AND payment_type IS NULL AND payment_method_name IS NULL AND account_name IS NULL AND original_entry_id IS NULL AND counted_cents IS NOT NULL AND expected_cents IS NOT NULL AND amount_cents=counted_cents AND cash_cents=0 AND applied_cents=0 END),
 ADD CONSTRAINT cash_entries_effect16 CHECK(CASE WHEN kind='received' THEN original_entry_id IS NULL AND applied_cents=amount_cents WHEN kind IN('refunded','reversed','allocation_reversed') THEN original_entry_id IS NOT NULL AND applied_cents=-amount_cents WHEN kind='refund_paid' THEN original_entry_id IS NOT NULL AND applied_cents=0 ELSE true END),
 ADD CONSTRAINT cash_entries_cash16 CHECK(cash_cents=CASE WHEN payment_type='cash' AND kind='received' THEN amount_cents WHEN payment_type='cash' AND kind IN('refunded','reversed','refund_paid') THEN -amount_cents ELSE 0 END);
CREATE TABLE private.payment_reversals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,payment_id uuid NOT NULL,allocation_id uuid NOT NULL,unit_id uuid NOT NULL,session_id uuid NOT NULL,entry_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000000),reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 evidence text,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),command_key uuid NOT NULL,legacy boolean NOT NULL DEFAULT false,
 UNIQUE(office_id,id),UNIQUE(office_id,entry_id),UNIQUE(office_id,command_key),
 FOREIGN KEY(office_id,payment_id) REFERENCES private.payments(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,allocation_id) REFERENCES private.payment_allocations(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,session_id) REFERENCES private.cash_sessions(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,entry_id) REFERENCES private.cash_entries(office_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(legacy OR(evidence IS NOT NULL AND char_length(evidence) BETWEEN 5 AND 500 AND evidence=btrim(evidence) AND evidence !~ '[[:cntrl:]]'))
);
CREATE INDEX payment_reversals_allocation_idx ON private.payment_reversals(office_id,allocation_id);
CREATE INDEX payment_reversals_payment_idx ON private.payment_reversals(office_id,payment_id);
CREATE INDEX payment_reversals_session_idx ON private.payment_reversals(office_id,session_id);
CREATE INDEX payment_reversals_actor_idx ON private.payment_reversals(actor_id);
CREATE TABLE private.payment_refunds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,reversal_id uuid NOT NULL,unit_id uuid NOT NULL,session_id uuid NOT NULL,entry_id uuid NOT NULL,
 amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 1 AND 1000000000000),reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 evidence text,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),command_key uuid NOT NULL,legacy boolean NOT NULL DEFAULT false,
 UNIQUE(office_id,id),UNIQUE(office_id,entry_id),UNIQUE(office_id,command_key),
 FOREIGN KEY(office_id,reversal_id) REFERENCES private.payment_reversals(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,session_id) REFERENCES private.cash_sessions(office_id,unit_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,entry_id) REFERENCES private.cash_entries(office_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(legacy OR(evidence IS NOT NULL AND char_length(evidence) BETWEEN 5 AND 500 AND evidence=btrim(evidence) AND evidence !~ '[[:cntrl:]]'))
);
CREATE INDEX payment_refunds_reversal_idx ON private.payment_refunds(office_id,reversal_id);
CREATE INDEX payment_refunds_session_idx ON private.payment_refunds(office_id,session_id);
CREATE INDEX payment_refunds_actor_idx ON private.payment_refunds(actor_id);
-- Both older kinds already changed allocation AND funds. Preserve the exact old effects.
INSERT INTO private.payment_reversals(id,office_id,payment_id,allocation_id,unit_id,session_id,entry_id,amount_cents,reason,actor_id,created_at,command_key,legacy)
 SELECT e.id,e.office_id,a.payment_id,a.id,e.unit_id,e.session_id,e.id,e.amount_cents,e.reason,e.actor_id,e.created_at,e.command_key,true FROM private.cash_entries e JOIN private.payment_ledger_links l ON l.office_id=e.office_id AND l.entry_id=e.id JOIN private.payment_allocations a ON a.office_id=l.office_id AND a.id=l.allocation_id WHERE e.kind IN('refunded','reversed');
INSERT INTO private.payment_refunds(id,office_id,reversal_id,unit_id,session_id,entry_id,amount_cents,reason,actor_id,created_at,command_key,legacy)
 SELECT id,office_id,id,unit_id,session_id,entry_id,amount_cents,reason,actor_id,created_at,command_key,true FROM private.payment_reversals;
SET CONSTRAINTS ALL IMMEDIATE;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['payment_reversals','payment_refunds'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t||'_immutable',t);END LOOP;END $$;
CREATE FUNCTION private.correction_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM private.cash_commands c JOIN private.cash_sessions s ON s.office_id=c.office_id AND s.id=NEW.session_id AND s.unit_id=NEW.unit_id WHERE c.office_id=NEW.office_id AND c.kind='correction' AND c.idempotency_key=NEW.command_key AND c.idempotency_key::text=current_setting('jn.cash_command',true) AND c.actor_id=auth.uid() AND c.actor_id=NEW.actor_id AND s.operator_id=c.actor_id AND s.status='open' AND c.result IS NULL) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN NEW;
END $$;
CREATE TRIGGER payment_reversals_insert_guard BEFORE INSERT ON private.payment_reversals FOR EACH ROW EXECUTE FUNCTION private.correction_insert_guard();
CREATE TRIGGER payment_refunds_insert_guard BEFORE INSERT ON private.payment_refunds FOR EACH ROW EXECUTE FUNCTION private.correction_insert_guard();
CREATE OR REPLACE FUNCTION private.cash_entry_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM private.cash_commands c JOIN private.cash_sessions s ON s.office_id=c.office_id AND s.id=NEW.session_id AND s.unit_id=NEW.unit_id WHERE c.office_id=NEW.office_id AND ((c.kind='operate' AND NEW.kind NOT IN('allocation_reversed','refund_paid')) OR(c.kind='correction' AND NEW.kind IN('allocation_reversed','refund_paid'))) AND c.idempotency_key=NEW.command_key AND c.idempotency_key::text=current_setting('jn.cash_command',true) AND c.actor_id=auth.uid() AND c.actor_id=NEW.actor_id AND s.operator_id=c.actor_id AND s.status='open' AND c.result IS NULL) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.cash_session_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF OLD.status<>'open' OR NEW.version<>OLD.version+1 OR (to_jsonb(NEW)-ARRAY['version','status','closed_at'])<>(to_jsonb(OLD)-ARRAY['version','status','closed_at']) OR NOT EXISTS(SELECT FROM private.cash_entries e JOIN private.cash_commands c ON c.office_id=e.office_id AND c.kind IN('operate','correction') AND c.idempotency_key=e.command_key WHERE e.office_id=OLD.office_id AND e.session_id=OLD.id AND c.idempotency_key::text=current_setting('jn.cash_command',true) AND c.result IS NULL AND c.actor_id=auth.uid() AND OLD.operator_id=c.actor_id AND ((e.kind='closed' AND NEW.status='closed' AND NEW.closed_at=e.created_at) OR(e.kind<>'closed' AND NEW.status='open' AND NEW.closed_at IS NULL))) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION private.cash_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.cash_actor(p_office_id,true,'cash.open');
 IF (p_operation->>'kind' IN('refund','reverse') OR(p_operation->>'kind'='receive' AND nullif(current_setting('jn.payment',true),'') IS NULL)) AND NOT EXISTS(SELECT FROM private.cash_commands WHERE office_id=p_office_id AND kind='operate' AND idempotency_key::text=p_operation->>'idempotency_key') THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN private.cash_operate_before15(p_office_id,p_operation);
END $$;
CREATE OR REPLACE FUNCTION private.payment_link_entry() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE allocation uuid;BEGIN
 IF NEW.kind='received' THEN
  SELECT a.id INTO allocation FROM private.payment_allocations a JOIN private.payments p ON p.office_id=a.office_id AND p.id=a.payment_id
  WHERE a.office_id=NEW.office_id AND p.id::text=current_setting('jn.payment',true) AND a.charge_id=NEW.charge_id AND a.amount_cents=NEW.amount_cents AND p.session_id=NEW.session_id AND p.actor_id=NEW.actor_id AND p.payment_method_id=NEW.payment_method_id AND p.account_id=NEW.account_id AND p.payment_type=NEW.payment_type
  AND EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed')
  AND NOT EXISTS(SELECT FROM private.payment_ledger_links l JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id WHERE l.office_id=a.office_id AND l.allocation_id=a.id AND e.kind='received');
 ELSIF NEW.kind IN('allocation_reversed','refund_paid') THEN
  SELECT a.id INTO allocation FROM private.payment_allocations a JOIN private.payments p ON p.office_id=a.office_id AND p.id=a.payment_id JOIN private.payment_ledger_links l ON l.office_id=a.office_id AND l.allocation_id=a.id JOIN private.cash_entries original ON original.office_id=l.office_id AND original.id=l.entry_id AND original.kind='received'
  WHERE a.office_id=NEW.office_id AND a.charge_id=NEW.charge_id AND original.id=NEW.original_entry_id AND original.request_id=NEW.request_id AND p.payment_method_id=NEW.payment_method_id AND p.account_id=NEW.account_id AND p.payment_type=NEW.payment_type AND p.unit_id=NEW.unit_id AND ((NEW.kind='allocation_reversed' AND EXISTS(SELECT FROM private.payment_reversals v WHERE v.office_id=a.office_id AND v.allocation_id=a.id AND v.payment_id=p.id AND v.entry_id=NEW.id AND v.amount_cents=NEW.amount_cents AND v.session_id=NEW.session_id AND v.actor_id=NEW.actor_id AND v.command_key=NEW.command_key)) OR(NEW.kind='refund_paid' AND EXISTS(SELECT FROM private.payment_refunds f JOIN private.payment_reversals v ON v.office_id=f.office_id AND v.id=f.reversal_id WHERE f.office_id=a.office_id AND v.allocation_id=a.id AND f.entry_id=NEW.id AND f.amount_cents=NEW.amount_cents AND f.session_id=NEW.session_id AND f.actor_id=NEW.actor_id AND f.command_key=NEW.command_key)));
 ELSIF NEW.kind IN('refunded','reversed') THEN SELECT allocation_id INTO allocation FROM private.payment_ledger_links WHERE office_id=NEW.office_id AND entry_id=NEW.original_entry_id;
 ELSE RETURN NEW;END IF;
 IF allocation IS NULL THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.payment_ledger_links VALUES(NEW.office_id,NEW.id,allocation);RETURN NEW;
END $$;
CREATE FUNCTION private.allocation_corrections(p_office uuid,p_allocation uuid) RETURNS TABLE(reversed_cents bigint,refunded_cents bigint) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT sum(amount_cents) FROM private.payment_reversals WHERE office_id=p_office AND allocation_id=p_allocation),0)::bigint,coalesce((SELECT sum(f.amount_cents) FROM private.payment_refunds f JOIN private.payment_reversals v ON v.office_id=f.office_id AND v.id=f.reversal_id WHERE v.office_id=p_office AND v.allocation_id=p_allocation),0)::bigint;
$$;
CREATE OR REPLACE FUNCTION private.payment_json(p private.payments) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p.id,'reference','JN-PAG-'||p.id,'created_at',p.created_at,'amount_cents',p.amount_cents,'presented_cents',p.presented_cents,'change_cents',p.change_cents,'fee_cents',p.fee_cents,'net_cents',p.amount_cents-p.fee_cents,'payment_type',p.payment_type,'method_name',p.method_name,'account_name',p.account_name,'legacy',p.legacy,
 'status',CASE WHEN EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='rejected') THEN 'rejected' WHEN NOT EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed') THEN 'pending' WHEN totals.remaining=0 THEN 'reversed' WHEN totals.remaining<p.amount_cents THEN 'partially_reversed' ELSE 'confirmed' END,
 'settlement',CASE WHEN EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled') THEN 'settled' ELSE p.settlement END,
 'settled_on',coalesce((SELECT to_char(d.settled_on,'YYYY-MM-DD') FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled'),to_char(p.settled_on,'YYYY-MM-DD')),
 'evidence',coalesce((SELECT d.evidence FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id ORDER BY d.created_at DESC,d.kind LIMIT 1),p.evidence),'external_reference',p.external_reference,'reversed_cents',totals.reversed,'refunded_cents',totals.refunded,'pending_refund_cents',totals.reversed-totals.refunded,'allocations',coalesce((SELECT jsonb_agg(jsonb_build_object('charge_id',a.charge_id,'protocol',r.protocol,'amount_cents',a.amount_cents,'id',a.id,'reversed_cents',v.reversed_cents,'refunded_cents',v.refunded_cents,'pending_refund_cents',v.reversed_cents-v.refunded_cents) ORDER BY a.charge_id) FROM private.payment_allocations a JOIN private.charges c ON c.office_id=a.office_id AND c.id=a.charge_id JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id CROSS JOIN LATERAL private.allocation_corrections(a.office_id,a.id)v WHERE a.office_id=p.office_id AND a.payment_id=p.id),'[]'::jsonb))
 FROM(SELECT coalesce(sum(e.applied_cents),0) remaining,(SELECT coalesce(sum(amount_cents),0) FROM private.payment_reversals WHERE office_id=p.office_id AND payment_id=p.id) reversed,(SELECT coalesce(sum(f.amount_cents),0) FROM private.payment_refunds f JOIN private.payment_reversals v ON v.office_id=f.office_id AND v.id=f.reversal_id WHERE v.office_id=p.office_id AND v.payment_id=p.id) refunded FROM private.payment_allocations a JOIN private.payment_ledger_links l ON l.office_id=a.office_id AND l.allocation_id=a.id JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id WHERE a.office_id=p.office_id AND a.payment_id=p.id) totals;
$$;
CREATE OR REPLACE FUNCTION private.payment_destinations(p_office_id uuid,p_session_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH ledger AS(SELECT account_id,max(account_name) account_name,payment_type,coalesce(sum(amount_cents) FILTER(WHERE kind='received'),0) received,coalesce(sum(amount_cents) FILTER(WHERE kind IN('refunded','reversed','refund_paid')),0) returned FROM private.cash_entries WHERE office_id=p_office_id AND session_id=p_session_id AND kind IN('received','refunded','reversed','refund_paid') GROUP BY account_id,payment_type),
 headers AS(SELECT p.account_id,p.payment_type,CASE WHEN bool_or(p.fee_cents IS NULL) THEN NULL ELSE sum(p.fee_cents) END fees,CASE WHEN bool_or(p.settlement='unknown') THEN NULL ELSE sum(CASE WHEN p.payment_type='card' AND(p.settlement='settled' OR EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='settled')) THEN p.amount_cents-p.fee_cents ELSE 0 END) END settled FROM private.payments p WHERE p.office_id=p_office_id AND p.session_id=p_session_id AND EXISTS(SELECT FROM private.payment_decisions d WHERE d.office_id=p.office_id AND d.payment_id=p.id AND d.kind='confirmed') GROUP BY p.account_id,p.payment_type)
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_name',l.account_name,'payment_type',l.payment_type,'received_cents',l.received,'returned_cents',l.returned,'fee_cents',CASE WHEN h.account_id IS NULL THEN 0 ELSE h.fees END,'net_cents',l.received-l.returned-CASE WHEN h.account_id IS NULL THEN 0 ELSE h.fees END,'settled_cents',CASE WHEN h.account_id IS NULL THEN 0 ELSE h.settled END) ORDER BY l.account_name,l.payment_type),'[]'::jsonb) FROM ledger l LEFT JOIN headers h ON h.account_id=l.account_id AND h.payment_type=l.payment_type;
$$;
CREATE FUNCTION private.cash_statement_finance16(s private.cash_sessions,p_actor uuid,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('session',jsonb_build_object('id',s.id,'cash_account_id',s.cash_account_id,'unit_id',s.unit_id,'unit_name',s.unit_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'version',s.version,'opened_at',s.opened_at,'closed_at',s.closed_at,'opening_cents',s.opening_cents,
 'cash_cents',s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0),
 'received_cents',coalesce((SELECT sum(e.amount_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.kind='received'),0),
 'refunded_cents',coalesce((SELECT sum(e.amount_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.kind IN('refunded','reversed','refund_paid')),0),
 'digital_cents',coalesce((SELECT sum(CASE WHEN e.kind='allocation_reversed' THEN 0 WHEN e.kind='refund_paid' THEN -e.amount_cents ELSE e.applied_cents END) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id AND e.payment_type<>'cash'),0),
 'can_operate',s.operator_id=p_actor AND s.status='open' AND private.current_permissions(s.office_id) @> ARRAY['cash.open'],
 'can_refund',s.operator_id=p_actor AND s.status='open' AND private.current_permissions(s.office_id) @> ARRAY['cash.open','charges.read','requests.read','charges.adjust']),
 'can_receive',s.operator_id=p_actor AND s.status='open' AND private.current_permissions(s.office_id) @> ARRAY['cash.open','charges.read','requests.read'],
 'entries',coalesce((SELECT jsonb_agg(private.finance_entry_json(e,false) ORDER BY e.created_at DESC,e.id DESC) FROM(SELECT * FROM private.cash_entries WHERE office_id=s.office_id AND session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)e),'[]'::jsonb),
 'total',(SELECT count(*) FROM private.cash_entries WHERE office_id=s.office_id AND session_id=s.id),'page',p_page,'page_size',5);
$$;
CREATE OR REPLACE FUNCTION private.cash_dashboard_record(p_office_id uuid,p_actor uuid,p_scope text,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('scope',p_scope,'page',p_page,'page_size',p_page_size,
 'can_open',private.current_permissions(p_office_id) @> ARRAY['cash.open'],'can_manage',private.current_permissions(p_office_id) @> ARRAY['cash.manage'],'can_read_all',private.current_permissions(p_office_id) @> ARRAY['cash.read_all'],
 'total',(SELECT count(*) FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor)),
 'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'cash_account_id',s.cash_account_id,'account_name',s.account_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'opened_at',s.opened_at,'opening_cents',s.opening_cents,'numerario_cents',s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0),'received_cents',coalesce((SELECT sum(CASE WHEN e.kind='allocation_reversed' THEN 0 WHEN e.kind='refund_paid' THEN -e.amount_cents ELSE e.applied_cents END) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)) ORDER BY opened_at DESC,id DESC) FROM(SELECT * FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) ORDER BY opened_at DESC,id DESC LIMIT p_page_size OFFSET(p_page-1)*p_page_size)s),'[]'::jsonb));
$$;
CREATE OR REPLACE FUNCTION private.cash_dashboard_filtered_record(p_office_id uuid,p_actor uuid,p_scope text,p_page integer,p_page_size integer,p_unit_id uuid,p_status text,p_query text) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('scope',p_scope,'page',p_page,'page_size',p_page_size,
 'can_open',private.current_permissions(p_office_id) @> ARRAY['cash.open'],'can_manage',private.current_permissions(p_office_id) @> ARRAY['cash.manage'],'can_read_all',private.current_permissions(p_office_id) @> ARRAY['cash.read_all'],
 'summary',(SELECT jsonb_build_object('open',count(*) FILTER(WHERE status='open'),'closed',count(*) FILTER(WHERE status='closed'),'numerario_cents',coalesce(sum(opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)),0),'received_cents',coalesce(sum(coalesce((SELECT sum(CASE WHEN e.kind='allocation_reversed' THEN 0 WHEN e.kind='refund_paid' THEN -e.amount_cents ELSE e.applied_cents END) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)),0)) FROM private.cash_sessions s WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) AND(p_unit_id IS NULL OR unit_id=p_unit_id) AND(p_status='all' OR status=p_status) AND(p_query='' OR strpos(lower(operator_name||' '||unit_name||' '||account_name),lower(p_query))>0)),
 'total',(SELECT count(*) FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) AND(p_unit_id IS NULL OR unit_id=p_unit_id) AND(p_status='all' OR status=p_status) AND(p_query='' OR strpos(lower(operator_name||' '||unit_name||' '||account_name),lower(p_query))>0)),
 'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'cash_account_id',s.cash_account_id,'account_name',s.account_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'opened_at',s.opened_at,'opening_cents',s.opening_cents,'numerario_cents',s.opening_cents+coalesce((SELECT sum(e.cash_cents) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0),'received_cents',coalesce((SELECT sum(CASE WHEN e.kind='allocation_reversed' THEN 0 WHEN e.kind='refund_paid' THEN -e.amount_cents ELSE e.applied_cents END) FROM private.cash_entries e WHERE e.office_id=s.office_id AND e.session_id=s.id),0)) ORDER BY opened_at DESC,id DESC) FROM(SELECT * FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) AND(p_unit_id IS NULL OR unit_id=p_unit_id) AND(p_status='all' OR status=p_status) AND(p_query='' OR strpos(lower(operator_name||' '||unit_name||' '||account_name),lower(p_query))>0) ORDER BY opened_at DESC,id DESC LIMIT p_page_size OFFSET(p_page-1)*p_page_size)s),'[]'::jsonb));
$$;
CREATE OR REPLACE FUNCTION private.finance_entry_json(e private.cash_entries,p_client boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',e.id,'kind',e.kind,'created_at',e.created_at,'amount_cents',e.amount_cents,'protocol',(SELECT r.protocol FROM public.requests r WHERE r.office_id=e.office_id AND r.id=e.request_id),'request_id',e.request_id,'charge_id',e.charge_id,'payment_method_name',e.payment_method_name)
 ||CASE WHEN p_client THEN '{}'::jsonb ELSE jsonb_build_object('cash_cents',e.cash_cents,'applied_cents',e.applied_cents,'account_name',e.account_name,'reason',e.reason,'original_entry_id',e.original_entry_id,'refundable_cents',CASE WHEN e.kind='received' THEN e.amount_cents-coalesce((SELECT v.refunded_cents FROM private.payment_ledger_links l CROSS JOIN LATERAL private.allocation_corrections(l.office_id,l.allocation_id)v WHERE l.office_id=e.office_id AND l.entry_id=e.id),0) ELSE 0 END,'counted_cents',e.counted_cents,'expected_cents',e.expected_cents) END;
$$;
CREATE OR REPLACE FUNCTION private.finance_charge_json(c private.charges,r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',c.id,'request_id',r.id,'protocol',r.protocol,'version',a.version,'due_cents',a.due_cents,'paid_cents',a.allocated_cents,'balance_cents',a.balance_cents,'status',CASE WHEN a.cancelled THEN 'cancelled' WHEN a.due_cents=0 THEN 'zero' WHEN a.balance_cents=0 THEN 'paid' ELSE 'open' END,
 'financial_condition',jsonb_build_object('settlement_required',coalesce((SELECT bool_or((i.snapshot->'definition'->>'settlement_required')::boolean) FROM private.charge_items i WHERE i.office_id=c.office_id AND i.charge_id=c.id),false),'blocked',a.balance_cents>0 AND NOT a.cancelled AND coalesce((SELECT bool_or((i.snapshot->'definition'->>'settlement_required')::boolean) FROM private.charge_items i WHERE i.office_id=c.office_id AND i.charge_id=c.id),false)),'pending_refund_cents',(SELECT coalesce(sum(v.reversed_cents-v.refunded_cents),0) FROM private.payment_allocations al CROSS JOIN LATERAL private.allocation_corrections(al.office_id,al.id)v WHERE al.office_id=c.office_id AND al.charge_id=c.id),
 'services',coalesce((SELECT jsonb_agg(i.snapshot->'definition'->>'name' ORDER BY i.id) FROM private.charge_items i WHERE i.office_id=c.office_id AND i.charge_id=c.id),'[]'::jsonb),
 'installments',coalesce((SELECT jsonb_agg(jsonb_build_object('number',i.number,'due_date',to_char(i.due_date,'YYYY-MM-DD'),'amount_cents',i.amount_cents) ORDER BY i.number) FROM private.charge_installments i WHERE i.office_id=c.office_id AND i.charge_id=c.id AND i.version=a.version),'[]'::jsonb)) FROM private.charges_amounts(c.office_id,c.id)a;
$$;
-- A correction may record both intentions in one atomic command, once per movement kind.
ALTER TABLE private.cash_entries DROP CONSTRAINT cash_entries_office_id_command_key_key;
CREATE UNIQUE INDEX cash_entries_legacy_command_idx ON private.cash_entries(office_id,command_key) WHERE kind NOT IN('allocation_reversed','refund_paid');
CREATE UNIQUE INDEX cash_entries_correction_command_idx ON private.cash_entries(office_id,command_key,kind) WHERE kind IN('allocation_reversed','refund_paid');
CREATE FUNCTION private.correction_sources(p_office_id uuid,p_session_id uuid,p_kind text,p_query text,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;m public.memberships;s private.cash_sessions;result jsonb;BEGIN
 caller:=private.cash_actor(p_office_id);m:=private.charges_actor(p_office_id,false,'charges.adjust');
 IF p_kind IS NULL OR p_kind NOT IN('reverse','refund') OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=p_session_id FOR SHARE;
 caller:=private.cash_actor(p_office_id,false,'cash.open');m:=private.charges_actor(p_office_id,false,'charges.adjust');
 IF s.id IS NULL OR s.operator_id<>caller THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF s.status<>'open' THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 WITH candidates AS(
 SELECT a.id allocation_id,v.id reversal_id,p.id payment_id,'JN-PAG-'||p.id reference,e.id original_entry_id,r.id request_id,r.protocol,coalesce(v.created_at,p.created_at) created_at,p.payment_type,p.method_name,p.account_name,a.amount_cents original_cents,t.reversed_cents,t.refunded_cents,t.reversed_cents-t.refunded_cents pending_refund_cents,CASE WHEN p_kind='reverse' THEN a.amount_cents-t.reversed_cents ELSE v.amount_cents-coalesce((SELECT sum(f.amount_cents) FROM private.payment_refunds f WHERE f.office_id=v.office_id AND f.reversal_id=v.id),0) END available_cents,v.amount_cents reversal_cents,coalesce(v.legacy,p.legacy) legacy
 FROM private.payment_allocations a JOIN private.payments p ON p.office_id=a.office_id AND p.id=a.payment_id JOIN private.charges c ON c.office_id=a.office_id AND c.id=a.charge_id JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id JOIN private.payment_ledger_links l ON l.office_id=a.office_id AND l.allocation_id=a.id JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id AND e.kind='received' CROSS JOIN LATERAL private.allocation_corrections(a.office_id,a.id)t LEFT JOIN private.payment_reversals v ON p_kind='refund' AND v.office_id=a.office_id AND v.allocation_id=a.id
 WHERE a.office_id=p_office_id AND p.unit_id=s.unit_id AND private.request_can_work(r,m) IS TRUE AND (btrim(p_query)='' OR strpos(lower(r.protocol),lower(btrim(p_query)))>0 OR strpos(lower('JN-PAG-'||p.id),lower(btrim(p_query)))>0)
 ),eligible AS(SELECT * FROM candidates WHERE available_cents>0),paged AS(SELECT * FROM eligible ORDER BY created_at DESC,allocation_id,reversal_id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,allocation_id,reversal_id) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM eligible),'page',p_page,'page_size',5,'kind',p_kind) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION private.correction_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE caller uuid;m public.memberships;s private.cash_sessions;p private.payments;a private.payment_allocations;r public.requests;v private.payment_reversals;f private.payment_refunds;original private.cash_entries;account private.financial_accounts;cmd private.cash_commands;
 k text;key uuid;sid uuid;expected integer;amount bigint;physical bigint;reversed bigint;refunded bigint;keys text[];digest text;eid uuid;operation_result jsonb;refund_now boolean;reason text;evidence text;
BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,'charges.adjust');
 IF jsonb_typeof(p_operation) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_operation->>'kind';keys:=ARRAY['kind','session_id','expected_version','idempotency_key','amount_cents','reason','evidence'];
 IF k='reverse' THEN keys:=keys||ARRAY['allocation_id','refund_now'];ELSIF k='refund' THEN keys:=keys||ARRAY['reversal_id'];ELSE RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT p_operation ?& keys OR(SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 FOREACH reason IN ARRAY ARRAY['session_id','idempotency_key',CASE WHEN k='reverse' THEN 'allocation_id' ELSE 'reversal_id' END] LOOP
  IF jsonb_typeof(p_operation->reason) IS DISTINCT FROM 'string' OR p_operation->>reason !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
 FOREACH reason IN ARRAY ARRAY['reason','evidence'] LOOP
  IF jsonb_typeof(p_operation->reason) IS DISTINCT FROM 'string' OR char_length(p_operation->>reason) NOT BETWEEN 5 AND 500 OR p_operation->>reason<>btrim(p_operation->>reason) OR p_operation->>reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
 IF jsonb_typeof(p_operation->'expected_version') IS DISTINCT FROM 'number' OR(p_operation->>'expected_version')::numeric NOT BETWEEN 1 AND 2147483645 OR trunc((p_operation->>'expected_version')::numeric)<>(p_operation->>'expected_version')::numeric OR jsonb_typeof(p_operation->'amount_cents') IS DISTINCT FROM 'number' OR(p_operation->>'amount_cents')::numeric NOT BETWEEN 1 AND 1000000000000 OR trunc((p_operation->>'amount_cents')::numeric)<>(p_operation->>'amount_cents')::numeric OR(k='reverse' AND jsonb_typeof(p_operation->'refund_now') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 sid:=(p_operation->>'session_id')::uuid;key:=(p_operation->>'idempotency_key')::uuid;expected:=(p_operation->>'expected_version')::integer;amount:=(p_operation->>'amount_cents')::bigint;reason:=p_operation->>'reason';evidence:=p_operation->>'evidence';refund_now:=k='refund' OR(p_operation->>'refund_now')::boolean;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 IF k='reverse' THEN SELECT * INTO a FROM private.payment_allocations WHERE office_id=p_office_id AND id=(p_operation->>'allocation_id')::uuid;
 ELSE SELECT * INTO v FROM private.payment_reversals WHERE office_id=p_office_id AND id=(p_operation->>'reversal_id')::uuid;SELECT * INTO a FROM private.payment_allocations WHERE office_id=p_office_id AND id=v.allocation_id;END IF;
 SELECT * INTO p FROM private.payments WHERE office_id=p_office_id AND id=a.payment_id FOR UPDATE;
 SELECT rq.* INTO r FROM private.charges c JOIN public.requests rq ON rq.office_id=c.office_id AND rq.id=c.request_id WHERE c.office_id=p_office_id AND c.id=a.charge_id FOR UPDATE OF rq;
 SELECT e.* INTO original FROM private.payment_ledger_links l JOIN private.cash_entries e ON e.office_id=l.office_id AND e.id=l.entry_id WHERE l.office_id=p_office_id AND l.allocation_id=a.id AND e.kind='received';
 -- Scope and identity after all locks, including historical command replays.
 caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,'charges.adjust');
 IF s.id IS NULL OR s.operator_id<>caller OR a.id IS NULL OR p.id IS NULL OR p.unit_id<>s.unit_id OR original.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='correction' AND idempotency_key=key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 IF s.status<>'open' OR s.version<>expected OR NOT EXISTS(SELECT FROM private.cash_units u JOIN private.financial_accounts ac ON ac.office_id=u.office_id AND ac.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND u.active AND ac.id=s.cash_account_id AND ac.active) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT t.reversed_cents,t.refunded_cents INTO reversed,refunded FROM private.allocation_corrections(p_office_id,a.id)t;
 IF(k='reverse' AND amount>a.amount_cents-reversed) OR(k='refund' AND amount>v.amount_cents-coalesce((SELECT sum(amount_cents) FROM private.payment_refunds WHERE office_id=p_office_id AND reversal_id=v.id),0)) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='reverse' AND NOT refund_now AND(SELECT coalesce(sum(t.reversed_cents-t.refunded_cents),0)+amount FROM private.payment_allocations al CROSS JOIN LATERAL private.allocation_corrections(al.office_id,al.id)t WHERE al.office_id=p_office_id AND al.charge_id=a.charge_id)>9007199254740991 THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF refund_now THEN
  SELECT * INTO account FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=p.account_id FOR SHARE;
  caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,'charges.adjust');
  SELECT s.opening_cents+coalesce(sum(cash_cents),0) INTO physical FROM private.cash_entries WHERE office_id=p_office_id AND session_id=s.id;
  IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF account.id IS NULL OR NOT account.active OR(p.payment_type='cash')<>(account.type='cash') OR(p.payment_type='cash' AND(p.account_id<>s.cash_account_id OR amount>physical)) OR(SELECT coalesce(sum(amount_cents),0)+amount FROM private.cash_entries WHERE office_id=p_office_id AND session_id=s.id AND kind IN('refunded','reversed','refund_paid'))>9007199254740991 THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'correction',key,caller,digest);
 PERFORM set_config('jn.cash_command',key::text,true);
 IF k='reverse' THEN
  eid:=gen_random_uuid();
  INSERT INTO private.payment_reversals(office_id,payment_id,allocation_id,unit_id,session_id,entry_id,amount_cents,reason,evidence,actor_id,command_key)VALUES(p_office_id,p.id,a.id,s.unit_id,s.id,eid,amount,reason,evidence,caller,key)RETURNING * INTO v;
  INSERT INTO private.cash_entries(id,office_id,unit_id,session_id,kind,charge_id,request_id,payment_method_id,account_id,original_entry_id,payment_method_name,account_name,payment_type,amount_cents,cash_cents,applied_cents,reason,actor_id,command_key)
  VALUES(eid,p_office_id,s.unit_id,s.id,'allocation_reversed',a.charge_id,r.id,p.payment_method_id,p.account_id,original.id,p.method_name,p.account_name,p.payment_type,amount,0,-amount,reason,caller,key);
  PERFORM private.emit_business_event(p_office_id,'payments.allocation_reversed','cash_session',s.id,key,jsonb_build_object('payment_id',p.id,'entry_id',v.entry_id,'reversal_id',v.id,'amount_cents',amount,'charge_id',a.charge_id,'session_id',s.id));
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)SELECT p_office_id,r.id,recipient.id,'payment_reversed',v.id FROM public.memberships recipient WHERE recipient.office_id=p_office_id AND recipient.role_code='client' AND recipient.active AND private.finance_client_request(r,recipient)ON CONFLICT(office_id,recipient_id,kind,event_id)DO NOTHING;
 END IF;
 IF refund_now THEN
  eid:=gen_random_uuid();
  INSERT INTO private.payment_refunds(office_id,reversal_id,unit_id,session_id,entry_id,amount_cents,reason,evidence,actor_id,command_key)VALUES(p_office_id,v.id,s.unit_id,s.id,eid,amount,reason,evidence,caller,key)RETURNING * INTO f;
  INSERT INTO private.cash_entries(id,office_id,unit_id,session_id,kind,charge_id,request_id,payment_method_id,account_id,original_entry_id,payment_method_name,account_name,payment_type,amount_cents,cash_cents,applied_cents,reason,actor_id,command_key)
  VALUES(eid,p_office_id,s.unit_id,s.id,'refund_paid',a.charge_id,r.id,p.payment_method_id,p.account_id,original.id,p.method_name,p.account_name,p.payment_type,amount,CASE WHEN p.payment_type='cash' THEN -amount ELSE 0 END,0,reason,caller,key);
  PERFORM private.emit_business_event(p_office_id,'payments.refund_paid','cash_session',s.id,key,jsonb_build_object('payment_id',p.id,'entry_id',f.entry_id,'refund_id',f.id,'reversal_id',v.id,'amount_cents',amount,'charge_id',a.charge_id,'session_id',s.id));
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)SELECT p_office_id,r.id,recipient.id,'payment_refunded',f.id FROM public.memberships recipient WHERE recipient.office_id=p_office_id AND recipient.role_code='client' AND recipient.active AND private.finance_client_request(r,recipient)ON CONFLICT(office_id,recipient_id,kind,event_id)DO NOTHING;
 END IF;
 UPDATE private.cash_sessions SET version=version+1 WHERE office_id=p_office_id AND id=s.id RETURNING * INTO s;
 operation_result:=private.cash_statement_record(s,caller,1);
 UPDATE private.cash_commands SET result=operation_result WHERE office_id=p_office_id AND kind='correction' AND idempotency_key=key;
 PERFORM set_config('jn.cash_command','',true);RETURN operation_result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';
END $$;
CREATE FUNCTION public.correction_sources(p_office_id uuid,p_session_id uuid,p_kind text,p_query text,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.correction_sources(p_office_id,p_session_id,p_kind,p_query,p_page);$$;
CREATE FUNCTION public.correction_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.correction_operate(p_office_id,p_operation);$$;
DO $$DECLARE signature text;BEGIN FOREACH signature IN ARRAY ARRAY['private.correction_insert_guard()','private.allocation_corrections(uuid,uuid)','private.correction_sources(uuid,uuid,text,text,integer)','private.correction_operate(uuid,jsonb)','public.correction_sources(uuid,uuid,text,text,integer)','public.correction_operate(uuid,jsonb)'] LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||signature||' FROM PUBLIC,anon,authenticated,service_role';IF signature NOT IN('private.correction_insert_guard()','private.allocation_corrections(uuid,uuid)') THEN EXECUTE 'GRANT EXECUTE ON FUNCTION '||signature||' TO authenticated';END IF;END LOOP;END $$;
ALTER TABLE private.audit_reports DROP CONSTRAINT audit_reports_renderer_version_check;
ALTER TABLE private.audit_reports ADD CONSTRAINT audit_reports_renderer_version_check CHECK(renderer_version IN(1,2,3));
ALTER TABLE private.audit_reports ALTER COLUMN renderer_version SET DEFAULT 3;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION private.cash_statement_record(s private.cash_sessions,p_actor uuid,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.cash_statement_finance16(s,p_actor,p_page)||jsonb_build_object('payments',jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.payment_json(p) ORDER BY p.created_at DESC,p.id DESC) FROM(SELECT * FROM private.payments WHERE office_id=s.office_id AND session_id=s.id ORDER BY created_at DESC,id DESC LIMIT 5)p),'[]'::jsonb),'total',(SELECT count(*) FROM private.payments WHERE office_id=s.office_id AND session_id=s.id),'page',1,'destinations',private.payment_destinations(s.office_id,s.id)));$$;
REVOKE ALL ON FUNCTION private.cash_statement_finance16(private.cash_sessions,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.safe_audit_changes(p_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v jsonb; result jsonb:='{}'; safe boolean;
BEGIN
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RETURN result; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_changes) LOOP
  safe:=false;
  IF k IN ('active','can_create_owner') THEN safe:=jsonb_typeof(v)='boolean';
  ELSIF k='role_code' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}'=ANY(ARRAY['owner','admin','employee','client']);
  ELSIF k IN ('reversal_id','refund_id','payment_id','membership_id','archive_id','customer_id','source_id','target_id','relation_id','merge_id','report_id','notification_id','entry_id','unit_id','session_id','charge_id','request_id','file_id','item_id','model_id') THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
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
