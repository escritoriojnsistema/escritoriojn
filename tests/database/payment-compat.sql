-- Test-only adapter: old regression scenarios now exercise the real15 contract.
CREATE FUNCTION test.cash_operate(p_office_id uuid,op jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE method text;BEGIN
 IF op->>'kind'<>'receive' THEN RETURN public.cash_operate(p_office_id,op);END IF;
 SELECT type INTO method FROM private.payment_methods WHERE office_id=p_office_id AND id=(op->>'payment_method_id')::uuid;
 RETURN public.payment_operate(p_office_id,jsonb_build_object('kind','record','session_id',op->'session_id','expected_version',op->'expected_version','idempotency_key',op->'idempotency_key','evidence','Conferencia ficticia de laboratorio','payment_method_id',op->'payment_method_id','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',op->'charge_id','expected_charge_version',op->'expected_charge_version','amount_cents',op->'amount_cents')),'presented_cents',CASE WHEN method='cash' THEN op->'amount_cents' ELSE 'null'::jsonb END,'fee_cents',0,'settlement',CASE WHEN method='card' THEN 'pending' ELSE 'not_applicable' END,'settled_on',NULL,'external_reference',NULL));
END $$;
