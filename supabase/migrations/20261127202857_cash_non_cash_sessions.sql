-- A cash session may receive only non-cash payments, with zero opening float.
ALTER TABLE private.cash_sessions
  ALTER COLUMN cash_account_id DROP NOT NULL,
  ADD CONSTRAINT cash_sessions_unit_fkey FOREIGN KEY (office_id,unit_id)
    REFERENCES private.cash_units(office_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT cash_sessions_float_requires_account CHECK (cash_account_id IS NOT NULL OR opening_cents = 0);

ALTER TABLE private.cash_closures
  DROP CONSTRAINT cash_closures_groups_check,
  ADD CONSTRAINT cash_closures_groups_check CHECK (jsonb_typeof(groups)='array' AND jsonb_array_length(groups) <= 100);

CREATE OR REPLACE FUNCTION private.cash_open(p_office_id uuid,p_unit_id uuid,p_cash_account_id uuid,p_opening_cents bigint,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<cash_open>>
DECLARE caller uuid;c private.cash_commands;digest text;u private.cash_units;a private.financial_accounts;s private.cash_sessions;result jsonb;operator_name text;BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF p_unit_id IS NULL OR (p_cash_account_id IS NULL AND p_opening_cents IS DISTINCT FROM 0) OR p_opening_cents IS NULL OR p_opening_cents NOT BETWEEN 0 AND 1000000000000 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('unit_id',p_unit_id,'cash_account_id',p_cash_account_id,'opening_cents',p_opening_cents)::text,'sha256'),'hex');
 SELECT * INTO u FROM private.cash_units WHERE office_id=p_office_id AND id=p_unit_id FOR UPDATE;
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 SELECT * INTO c FROM private.cash_commands WHERE office_id=p_office_id AND kind='open' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF c.actor_id<>caller OR c.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.cash_dashboard_record(p_office_id,caller,'own',1,5);END IF;
 SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=p_unit_id AND id=p_cash_account_id FOR UPDATE;
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF u.id IS NULL OR (p_cash_account_id IS NOT NULL AND a.id IS NULL) THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF NOT u.active
    OR (p_cash_account_id IS NOT NULL AND (NOT a.active OR a.type<>'cash'))
    OR (p_cash_account_id IS NULL AND NOT EXISTS (
      SELECT FROM private.payment_methods m
      JOIN private.financial_accounts dest ON dest.office_id=m.office_id AND dest.unit_id=m.unit_id AND dest.id=m.destination_account_id
      WHERE m.office_id=p_office_id AND m.unit_id=p_unit_id AND m.active AND dest.active
        AND ((m.type='boleto' AND dest.type='bank') OR (m.type IN ('pix','card','transfer') AND dest.type IN ('bank','digital')))
    ))
    OR EXISTS(SELECT FROM private.cash_sessions WHERE office_id=p_office_id AND unit_id=p_unit_id AND operator_id=caller AND status='open') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Operador') INTO operator_name FROM public.profiles WHERE id=caller;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'open',p_idempotency_key,caller,digest);
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 INSERT INTO private.cash_sessions(office_id,unit_id,cash_account_id,operator_id,operator_name,unit_name,account_name,opening_cents,command_key)VALUES(p_office_id,p_unit_id,p_cash_account_id,caller,operator_name,u.name,coalesce(a.name,'Caixa sem espécie'),p_opening_cents,p_idempotency_key)RETURNING * INTO s;
 IF p_cash_account_id IS NOT NULL THEN
  INSERT INTO private.cash_movements(office_id,unit_id,session_id,cash_account_id,kind,amount_cents,actor_id,created_at)VALUES(p_office_id,p_unit_id,s.id,p_cash_account_id,'opening',p_opening_cents,caller,s.opened_at);
 END IF;
 PERFORM private.emit_business_event(p_office_id,'cash.opened','cash_session',s.id,p_idempotency_key,'{}');
 result:=private.cash_dashboard_record(p_office_id,caller,'own',1,5);
 UPDATE private.cash_commands SET result=cash_open.result WHERE office_id=p_office_id AND kind='open' AND idempotency_key=p_idempotency_key;
 PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;

-- Keep the existing command bodies, wrappers, locks, grants and audit behavior.
-- The nullable account skips only the physical-account check. Explicit distinct
-- comparisons still reject payment, refund or transfer in cash on such a session.
DO $cash_non_cash$
DECLARE
  patch record;
  source text;
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ('private.cash_operate_before15(uuid,jsonb)',
     'JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND f.id=s.cash_account_id AND u.active AND f.active',
     'LEFT JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id AND f.id=s.cash_account_id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND u.active AND (s.cash_account_id IS NULL OR f.active)'),
    ('private.cash_operate_before15(uuid,jsonb)', 'account.id<>s.cash_account_id', 'account.id IS DISTINCT FROM s.cash_account_id'),
    ('private.cash_operate_before15(uuid,jsonb)', 's.cash_account_id<>original.account_id', 's.cash_account_id IS DISTINCT FROM original.account_id'),
    ('private.payment_operate_authorized(uuid,jsonb)',
     'JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND f.id=s.cash_account_id AND u.active AND f.active',
     'LEFT JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id AND f.id=s.cash_account_id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND u.active AND (s.cash_account_id IS NULL OR f.active)'),
    ('private.payment_operate_authorized(uuid,jsonb)', 'account.id<>s.cash_account_id', 'account.id IS DISTINCT FROM s.cash_account_id'),
    ('private.financial_approval_request_manual_payment(uuid,uuid,integer,uuid,uuid,uuid,uuid,uuid,uuid,bigint,date,text,text,text)',
     'IF pm.id IS NULL THEN', 'IF pm.id IS NULL OR (pm.type=''cash'' AND pm.destination_account_id IS DISTINCT FROM s.cash_account_id) THEN'),
    ('private.correction_operate(uuid,jsonb)',
     'JOIN private.financial_accounts ac ON ac.office_id=u.office_id AND ac.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND u.active AND ac.id=s.cash_account_id AND ac.active',
     'LEFT JOIN private.financial_accounts ac ON ac.office_id=u.office_id AND ac.unit_id=u.id AND ac.id=s.cash_account_id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND u.active AND (s.cash_account_id IS NULL OR ac.active)'),
    ('private.correction_operate(uuid,jsonb)', 'p.account_id<>s.cash_account_id', 'p.account_id IS DISTINCT FROM s.cash_account_id'),
    ('private.quick_operate(uuid,jsonb)',
     'JOIN private.financial_accounts a ON a.office_id=u.office_id AND a.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND a.id=s.cash_account_id AND u.active AND a.active',
     'LEFT JOIN private.financial_accounts a ON a.office_id=u.office_id AND a.unit_id=u.id AND a.id=s.cash_account_id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND u.active AND (s.cash_account_id IS NULL OR a.active)'),
    ('private.expense_operate(uuid,jsonb)', 'a.id<>s.cash_account_id', 'a.id IS DISTINCT FROM s.cash_account_id'),
    ('private.transfer_operate(uuid,jsonb)', 'src.id<>s.cash_account_id', 'src.id IS DISTINCT FROM s.cash_account_id'),
    ('private.transfer_operate(uuid,jsonb)', 'dst.id<>s.cash_account_id', 'dst.id IS DISTINCT FROM s.cash_account_id'),
    ('private.closure_groups18(private.cash_sessions)', '0::numeric settled,0::numeric pending', '0::numeric settled,0::numeric pending WHERE s.cash_account_id IS NOT NULL'),
    ('private.closure_groups18(private.cash_sessions)', 'RETURN result;', 'RETURN coalesce(result,''[]''::jsonb);'),
    ('private.closure_operate(uuid,jsonb)',
     '(SELECT (x->>''counted_cents'')::bigint FROM jsonb_array_elements(lines)x WHERE x->>''payment_type''=''cash'')',
     'coalesce((SELECT (x->>''counted_cents'')::bigint FROM jsonb_array_elements(lines)x WHERE x->>''payment_type''=''cash''),0)')
  ) AS changes(signature, old_text, new_text)
  LOOP
    source := pg_get_functiondef(patch.signature::regprocedure);
    IF strpos(source,patch.old_text)=0 THEN
      RAISE EXCEPTION 'Cash session contract has drifted: %',patch.signature;
    END IF;
    EXECUTE replace(source,patch.old_text,patch.new_text);
  END LOOP;
END $cash_non_cash$;
