-- A credential reference and a terminal registration are configuration records.
-- Only an implemented provider integration can establish external readiness.
UPDATE private.payment_providers
   SET status=CASE WHEN status IN ('validated','active') THEN 'configured' ELSE status END,
       last_validated_at=NULL,
       last_error_safe='Aguardando integração oficial com a instituição.',updated_at=clock_timestamp()
 WHERE verified_version IS NULL AND (status IN ('validated','active') OR last_validated_at IS NOT NULL);

UPDATE private.payment_terminals t
   SET status='disconnected',last_heartbeat_at=NULL,
       last_error_safe='Aguardando integração oficial com a maquininha.',updated_at=clock_timestamp()
 WHERE t.status='active' AND NOT EXISTS (
   SELECT FROM private.payment_providers p
   WHERE p.office_id=t.office_id AND p.id=t.provider_id AND private.payment_provider_ready(p)
 );

CREATE OR REPLACE FUNCTION private.payment_provider_validate(p_office_id uuid,p_provider_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.payment_providers_actor(p_office_id);
  IF NOT EXISTS (SELECT FROM private.payment_providers WHERE office_id=p_office_id AND id=p_provider_id) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  RETURN private.payment_providers_build_state(p_office_id);
END $$;

CREATE FUNCTION private.payment_terminal_ready(t private.payment_terminals)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(t.status='active' AND t.last_heartbeat_at > statement_timestamp()-interval '5 minutes'
    AND EXISTS (
      SELECT FROM private.payment_providers p
      WHERE p.office_id=t.office_id AND p.id=t.provider_id AND p.financial_unit_id=t.unit_id
        AND private.payment_provider_ready(p)
    ),false);
$$;
REVOKE ALL ON FUNCTION private.payment_terminal_ready(private.payment_terminals)
FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.payment_terminal_test(p_office_id uuid,p_terminal_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.payment_providers_actor(p_office_id);
  IF NOT EXISTS (SELECT FROM private.payment_terminals WHERE office_id=p_office_id AND id=p_terminal_id) THEN
    RAISE EXCEPTION 'TERMINAL_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  IF NOT EXISTS (
    SELECT FROM private.payment_terminals t
    WHERE t.office_id=p_office_id AND t.id=p_terminal_id AND private.payment_terminal_ready(t)
  ) THEN
    RAISE EXCEPTION 'PROVIDER_NOT_CONFIGURED' USING ERRCODE='PT503';
  END IF;
  RETURN private.payment_providers_build_state(p_office_id);
END $$;

-- Keep historical records readable, but do not replay legacy intents that have
-- neither a verified connection snapshot nor any external transaction reference.
DO $adapter_readiness$
DECLARE
  signature regprocedure;
  source text;
  updated text;
  pending_states constant text := 'IN (''processing'',''pending_reconciliation'',''awaiting_payment'')';
  return_intent constant text := 'RETURN private.payment_intent_json(existing);';
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.payment_checkout_create_intent(uuid,uuid,integer,text,integer,text)'::regprocedure,
    'private.staff_payment_generate_pix(uuid,uuid,integer,bigint,text)'::regprocedure,
    'private.staff_payment_start_terminal(uuid,uuid,integer,uuid,text,integer,bigint,text)'::regprocedure
  ] LOOP
    source := pg_get_functiondef(signature);
    IF strpos(source,return_intent)=0 THEN
      RAISE EXCEPTION 'Payment replay contract has drifted: %',signature;
    END IF;
    updated := replace(source,'pending.state '||pending_states,
      'pending.state '||pending_states||' AND (pending.provider_version IS NOT NULL OR pending.provider_reference IS NOT NULL)');
    IF updated=source THEN RAISE EXCEPTION 'Payment pending contract has drifted: %',signature; END IF;
    updated := replace(updated,'busy.state '||pending_states,
      'busy.state '||pending_states||' AND (busy.provider_version IS NOT NULL OR busy.provider_reference IS NOT NULL)');
    EXECUTE replace(updated,return_intent,
      'IF existing.provider_version IS NULL AND existing.provider_reference IS NULL THEN
         RAISE EXCEPTION ''PROVIDER_NOT_CONFIGURED'' USING ERRCODE=''PT503'';
       END IF;
       '||return_intent);
  END LOOP;

  signature := 'private.client_payment_checkout_summary(uuid,uuid)'::regprocedure;
  source := pg_get_functiondef(signature);
  IF strpos(source,'AND i.state IN (''awaiting_payment'', ''processing'', ''pending_reconciliation'')')=0 THEN
    RAISE EXCEPTION 'Checkout summary contract has drifted';
  END IF;
  EXECUTE replace(source,
    'AND i.state IN (''awaiting_payment'', ''processing'', ''pending_reconciliation'')',
    'AND i.state IN (''awaiting_payment'', ''processing'', ''pending_reconciliation'')
     AND (i.provider_version IS NOT NULL OR i.provider_reference IS NOT NULL)');

  source := pg_get_functiondef('private.payment_providers_build_state(uuid)'::regprocedure);
  updated := replace(source,$status$'status', p.status,$status$,
    $provider$'status', CASE WHEN p.status IN ('active','validated') AND NOT private.payment_provider_ready(p) THEN 'configured' ELSE p.status END,
      'connection_ready', private.payment_provider_ready(p),$provider$);
  updated := replace(updated,$status$'status', t.status,$status$,
    $terminal$'status', CASE WHEN t.status='active' AND NOT private.payment_terminal_ready(t) THEN 'disconnected' ELSE t.status END,$terminal$);
  updated := replace(updated,$state$AND state IN ('processing', 'pending_reconciliation')$state$,
    $state$AND state IN ('processing', 'pending_reconciliation')
    AND (provider_version IS NOT NULL OR provider_reference IS NOT NULL)$state$);
  IF updated=source THEN RAISE EXCEPTION 'Payment settings status contract has drifted'; END IF;
  EXECUTE updated;
END $adapter_readiness$;
