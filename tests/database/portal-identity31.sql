RESET ROLE;
BEGIN;
SELECT test.assert_true(to_regprocedure('public.portal_command31(uuid,uuid,jsonb,uuid)') IS NOT NULL,'31: secure identity command exists');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'portal31-'||n||'@example.test',now(),'fixture' FROM generate_series(311,314)n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000311' AND '00000000-0000-4000-a000-000000000314';
INSERT INTO public.profiles(id,display_name) SELECT id,'Maria de Teste' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000311' AND '00000000-0000-4000-a000-000000000314';
INSERT INTO public.offices(id,name) VALUES('00000000-0000-4000-e000-000000000311','Portal31 fictício');
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000311',('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=311 THEN 'owner' WHEN n=314 THEN 'employee' ELSE 'client' END FROM generate_series(311,314)n;
INSERT INTO public.customers(id,office_id,kind,name,created_by) SELECT ('00000000-0000-4000-f000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000311','person','Maria de Teste','00000000-0000-4000-a000-000000000311' FROM generate_series(311,313)n;
\set o31 '00000000-0000-4000-e000-000000000311'
\set c31 '00000000-0000-4000-f000-000000000311'
\set rep31 '00000000-0000-4000-f000-000000000312'
\set member31 '00000000-0000-4000-b000-000000000312'
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.portal_invites31','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.portal_invites31','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.portal_command31(uuid,uuid,jsonb,uuid)','EXECUTE'),'31: token and decision tables inaccessible to app roles');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code='client' AND permission_code='foundation.access'),'31: client has no internal foundation permission');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000312","session_id":"00000000-0000-4000-c000-000000000312"}';
SELECT test.assert_true(public.portal_state31(:'o31',NULL)->'identity'='null'::jsonb AND public.portal_state31(:'o31',NULL)->'representations'='[]'::jsonb,'31: same name does not link any existing person');
SELECT test.assert_true((SELECT permissions FROM public.my_access_context())='{}'::text[],'31: client context remains visible without internal permissions');
SELECT test.expect_error(format('SELECT public.portal_state31(%L,%L)',:'o31',:'c31'),'PT403','31: client cannot select a customer by UUID');
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'o31',:'c31'),'PT403','31: client cannot access internal customer panel');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000311","session_id":"00000000-0000-4000-c000-000000000311"}';
RESET ROLE;
SELECT version AS v31 FROM public.customers WHERE id=:'c31' \gset
SET ROLE authenticated;
SELECT jsonb_build_object('kind','issue','membership_id',:'member31','token',repeat('a',64),'evidence','Conferência administrativa31','expected_version',:'v31'::integer) AS issue31,gen_random_uuid() AS key31 \gset
SELECT public.portal_command31(:'o31',:'c31',:'issue31',:'key31')->>'id' AS invite31 \gset
SELECT test.assert_true(public.portal_command31(:'o31',:'c31',:'issue31',:'key31')->>'id'=:'invite31','31: issue retry preserves single invitation');
SELECT test.assert_true(public.portal_state31(:'o31',:'c31')->'invitations'->0->>'status'='pending','31: authorized issuer can track pending invitation');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000313","session_id":"00000000-0000-4000-c000-000000000313"}';
SELECT test.expect_error(format('SELECT public.portal_command31(%L,NULL,%L,gen_random_uuid())',:'o31',jsonb_build_object('kind','accept','token',repeat('a',64))),'PT422','31: known token cannot be consumed by another confirmed client');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000312","session_id":"00000000-0000-4000-c000-000000000312"}';
SELECT public.portal_command31(:'o31',NULL,jsonb_build_object('kind','accept','token',repeat('a',64)),gen_random_uuid());
SELECT test.assert_true(public.portal_state31(:'o31',NULL)#>>'{identity,name}'='Maria de Teste','31: invitation creates canonical identity08');
SELECT test.expect_error(format('SELECT public.portal_command31(%L,NULL,%L,gen_random_uuid())',:'o31',jsonb_build_object('kind','accept','token',repeat('a',64))),'PT422','31: consumed token fails even from same account');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.customer_relations WHERE office_id=:'o31' AND relation_type='identity')=1 AND NOT EXISTS(SELECT FROM private.portal_invites31 WHERE token_hash=repeat('a',64)),'31: no parallel identity and no raw token persisted');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE office_id=:'o31' AND (changes::text LIKE '%Conferência%' OR changes::text LIKE '%'||repeat('a',64)||'%')),'31: audit does not contain token, contact or evidence');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000311","session_id":"00000000-0000-4000-c000-000000000311"}';
SELECT test.expect_error(format('SELECT public.portal_command31(%L,%L,%L,gen_random_uuid())',:'o31',:'rep31',jsonb_build_object('kind','issue','membership_id',:'member31','token',repeat('b',64),'evidence','Conferência administrativa31','expected_version',1)),'PT409','31: one account cannot silently move to another person');
RESET ROLE;
SELECT version AS v31 FROM public.customers WHERE id=:'c31' \gset
SET ROLE authenticated;
SELECT public.portal_command31(:'o31',:'c31',jsonb_build_object('kind','issue','membership_id',:'member31','token',repeat('c',64),'evidence','Conferência administrativa31','expected_version',:'v31'::integer),gen_random_uuid())->>'id' AS expire31 \gset
RESET ROLE;
UPDATE private.portal_invites31 SET expires_at=clock_timestamp()-interval '1 minute' WHERE id=:'expire31';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000312","session_id":"00000000-0000-4000-c000-000000000312"}';
SELECT test.expect_error(format('SELECT public.portal_command31(%L,NULL,%L,gen_random_uuid())',:'o31',jsonb_build_object('kind','accept','token',repeat('c',64))),'PT422','31: expired token fails');
RESET ROLE;
UPDATE private.portal_invites31 SET expires_at=clock_timestamp()+interval '1 hour',contact_hash='changed-contact' WHERE id=:'expire31';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.portal_command31(%L,NULL,%L,gen_random_uuid())',:'o31',jsonb_build_object('kind','accept','token',repeat('c',64))),'PT422','31: contact change invalidates pending link');
RESET ROLE;
SELECT test.assert_true((SELECT customer_id FROM private.customer_relations WHERE office_id=:'o31' AND membership_id=:'member31' AND relation_type='identity' AND revoked_at IS NULL)=:'c31'::uuid,'31: recovery/contact mismatch never rebinds the person');
-- Separate representative: identity to own customer, existing08 representation to principal.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000311","session_id":"00000000-0000-4000-c000-000000000311"}';
SELECT public.customer_relation_command(:'o31',:'rep31','identity.verify',jsonb_build_object('membership_id','00000000-0000-4000-b000-000000000313','evidence','Conferência representante31'),gen_random_uuid());
SELECT public.customer_relation_command(:'o31',:'c31','representation.grant',jsonb_build_object('representative_customer_id',:'rep31','kind','representative','evidence','Instrumento conferido31','valid_from',clock_timestamp(),'valid_until',clock_timestamp()+interval '10 days'),gen_random_uuid());
RESET ROLE;
SELECT id AS relation31 FROM private.customer_relations WHERE office_id=:'o31' AND customer_id=:'c31' AND relation_type='representation' \gset
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,idempotency_key,payload_digest)VALUES(:'o31','AT-REP31','Nota interna secreta31','presencial','00000000-0000-4000-a000-000000000311','00000000-0000-4000-b000-000000000311',:'c31','normal',gen_random_uuid(),'fixture') RETURNING id AS request31 \gset
SET ROLE authenticated;
SELECT public.portal_command31(:'o31',:'c31',jsonb_build_object('kind','represent','relation_id',:'relation31','request_id',:'request31','valid_until',clock_timestamp()+interval '1 day','evidence','Escopo conferido31'),gen_random_uuid())->>'id' AS grant31 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000313","session_id":"00000000-0000-4000-c000-000000000313"}';
SELECT test.assert_true(public.portal_state31(:'o31',NULL)#>>'{representations,0,protocol}'='AT-REP31' AND public.portal_state31(:'o31',NULL)::text NOT LIKE '%Nota interna secreta31%','31: representative sees only scoped public status, never internal title');
RESET ROLE;
SELECT test.assert_true(NOT private.finance_client_request((SELECT r FROM public.requests r WHERE id=:'request31'),(SELECT m FROM public.memberships m WHERE id='00000000-0000-4000-b000-000000000313')) AND NOT private.wf_recipient((SELECT r FROM public.requests r WHERE id=:'request31'),(SELECT m FROM public.memberships m WHERE id='00000000-0000-4000-b000-000000000313')),'31: representation does not grant finance or document authority');
UPDATE private.portal_representations31 SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=:'grant31';
SET ROLE authenticated;
SELECT test.assert_true(public.portal_state31(:'o31',NULL)->'representations'='[]'::jsonb,'31: expired representative access disappears immediately');
RESET ROLE;
UPDATE private.portal_representations31 SET valid_until=clock_timestamp()+interval '1 day' WHERE id=:'grant31';
UPDATE private.customer_relations SET revoked_at=clock_timestamp(),revoked_by='00000000-0000-4000-a000-000000000311',version=version+1 WHERE id=:'relation31';
SET ROLE authenticated;
SELECT test.assert_true(public.portal_state31(:'o31',NULL)->'representations'='[]'::jsonb,'31: revoking underlying representation immediately blocks scope');
RESET ROLE;
DO $$DECLARE n integer;t timestamptz;durations double precision[]:='{}';p95 double precision;BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000312","session_id":"00000000-0000-4000-c000-000000000312"}',true);
 FOR n IN 1..100 LOOP t:=clock_timestamp();PERFORM public.portal_state31('00000000-0000-4000-e000-000000000311',NULL);durations:=array_append(durations,extract(epoch FROM clock_timestamp()-t)*1000);END LOOP;
 SELECT percentile_cont(0.95)WITHIN GROUP(ORDER BY v)INTO p95 FROM unnest(durations)v;
 RAISE NOTICE 'PORTAL31_LOCAL_STATE_P95_MS=%',round(p95::numeric,3);
 PERFORM test.assert_true(p95<2000,'31: local status projection p95 below 2 seconds');
END$$;
ROLLBACK;
