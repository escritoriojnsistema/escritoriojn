RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.document_release_state(uuid,uuid,integer)') IS NOT NULL,'25: central release RPC exists');
BEGIN;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.document_exception_events25','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.document_release_command(uuid,uuid,jsonb,uuid)','EXECUTE'),'25: exception history private; anonymous mutation denied');
SELECT test.assert_true((SELECT count(*)=2 FROM public.role_permissions WHERE permission_code LIKE 'documents.exceptions.%' AND role_code='owner') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE permission_code LIKE 'documents.exceptions.%' AND role_code<>'owner'),'25: seed only owner');
SELECT p.office_id AS o25,p.id AS p25,d.id AS d25,d.revision AS r25,d.request_id AS q25 FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision WHERE p.office_id='00000000-0000-4000-e000-000000000201' AND private.wf_approved(p) ORDER BY p.created_at DESC LIMIT 1 \gset
CREATE FUNCTION test.release25(o uuid,p uuid,k text,why text DEFAULT 'Conferência financeira local',expiry timestamptz DEFAULT clock_timestamp()+interval '1 day') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE s jsonb;c jsonb;BEGIN s:=public.document_release_state(o,p,1);c:=jsonb_build_object('kind',k,'expected_revision',(s->>'revision')::int,'expected_event_id',s->'last_event_id','reason',why);IF k='request' THEN c:=c||jsonb_build_object('expires_at',expiry);END IF;RETURN public.document_release_command(o,p,c,gen_random_uuid());END$$;
GRANT EXECUTE ON FUNCTION test.release25(uuid,uuid,text,text,timestamptz) TO authenticated;
SELECT c.id AS charge25,a.due_cents AS due25,a.allocated_cents AS paid25,a.version AS cv25 FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE c.office_id=:'o25' AND c.request_id=:'q25' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_workflow_command(:'o25',:'d25',jsonb_build_object('kind','handoff','expected_revision',:'r25'::int,'publication_id',:'p25','reason','Cobrança para teste da regra única'),gen_random_uuid());
SELECT public.charges_mutate(:'o25',:'charge25',:'cv25'::int,jsonb_build_object('kind','adjust','delta_cents',10000-:'due25'::bigint,'reason','Cobrança de cem reais no laboratório','installments',jsonb_build_array(jsonb_build_object('due_date',current_date::text,'amount_cents',10000))),gen_random_uuid());
RESET ROLE;
SELECT cs.id AS cash25,cs.version AS cashv25,pm.id AS method25 FROM private.cash_sessions cs JOIN private.payment_methods pm ON pm.office_id=cs.office_id AND pm.unit_id=cs.unit_id AND pm.destination_account_id=cs.cash_account_id WHERE cs.office_id=:'o25' AND cs.operator_id='00000000-0000-4000-a000-000000000206' AND cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1 \gset
SELECT a.version AS cv25 FROM private.charges_amounts(:'o25',:'charge25')a \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_cash_claim(:'o25',:'p25',gen_random_uuid());
SELECT public.payment_operate(:'o25',jsonb_build_object('kind','record','session_id',:'cash25','expected_version',:'cashv25'::int,'idempotency_key',gen_random_uuid(),'evidence','Recebimento parcial de sessenta reais','payment_method_id',:'method25','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',:'charge25','expected_charge_version',:'cv25'::int,'amount_cents',6000-:'paid25'::bigint)),'presented_cents',6000-:'paid25'::bigint,'fee_cents',0,'settlement','not_applicable','settled_on',NULL,'external_reference',NULL));
SELECT test.expect_error(format('SELECT test.release25(%L,%L,''request'')',:'o25',:'p25'),'PT403','25: cash authority alone cannot request financial exceptions');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_release_state(:'o25',:'p25',1) AS s25 \gset
SELECT test.assert_true(:'s25'::jsonb#>>'{financial,due_cents}'='10000' AND :'s25'::jsonb#>>'{financial,allocated_cents}'='6000' AND :'s25'::jsonb#>>'{financial,balance_cents}'='4000' AND :'s25'::jsonb->>'approved'='true' AND(:'s25'::jsonb->'blockers')?'payment','25: approved100 paid60 remains blocked with independent dimensions');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,true)',:'o25',:'p25'),'PT403','25: unpaid final has no release receipt');
SELECT test.expect_error(format('SELECT test.release25(%L,%L,''request'',''Motivo local'',clock_timestamp()-interval ''1 day'')',:'o25',:'p25'),'PT422','25: past validity denied');
SELECT test.expect_error(format('SELECT test.release25(%L,%L,''request'',''Motivo local'',clock_timestamp()+interval ''31 days'')',:'o25',:'p25'),'PT422','25: excessive validity denied');
SELECT jsonb_build_object('kind','request','expected_revision',:'r25'::int,'expected_event_id',NULL,'reason','Solicitação comercial por saldo parcial','expires_at',clock_timestamp()+interval '1 day') AS cmd25,gen_random_uuid() AS key25 \gset
SELECT public.document_release_command(:'o25',:'p25',:'cmd25',:'key25') AS requested25 \gset
SELECT test.assert_true(:'requested25'::jsonb#>>'{exception,status}'='requested' AND :'requested25'::jsonb->>'ready'='false','25: request never authorizes itself');
SELECT test.assert_true(public.document_release_command(:'o25',:'p25',:'cmd25',:'key25')->>'last_event_id'=:'requested25'::jsonb->>'last_event_id','25: request replay preserves event');
SELECT test.expect_error(format('SELECT public.document_release_command(%L,%L,%L,%L)',:'o25',:'p25',(:'cmd25'::jsonb||'{"reason":"Divergente"}')::text,:'key25'),'PT409','25: idempotency key rejects changed payload');
SELECT test.expect_error(format('SELECT public.document_release_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',:'cmd25'),'PT409','25: stale event rejected');
SELECT test.release25(:'o25',:'p25','authorize') AS authorized25 \gset
SELECT test.assert_true(:'authorized25'::jsonb#>>'{exception,status}'='authorized' AND NOT((:'authorized25'::jsonb->'blockers')?'payment') AND :'authorized25'::jsonb#>>'{financial,balance_cents}'='4000','25: authorization bypasses only payment; debt stays4000');
SELECT public.document_artifact_authorize(:'o25',:'p25',true) AS artifact25 \gset
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.document_releases25 WHERE publication_id=:'p25' AND revision=:'r25'::int AND sha256=:'artifact25'::jsonb->>'sha256' AND exception_event_id=(:'authorized25'::jsonb->>'last_event_id')::uuid AND session_id='00000000-0000-4000-c000-000000000201'),'25: release receipt linked to exact revision bytes exception and session');
SELECT test.expect_error(format('UPDATE private.document_releases25 SET revision=2 WHERE publication_id=%L',:'p25'),'PT409','25: release records immutable');
SAVEPOINT authority25;
UPDATE public.memberships SET active=false WHERE id='00000000-0000-4000-b000-000000000201';
SELECT test.assert_true((SELECT NOT private.release_exception_valid25(p) FROM private.document_publications p WHERE id=:'p25'),'25: approver deactivation invalidates exception');
UPDATE public.memberships SET active=true WHERE id='00000000-0000-4000-b000-000000000201';
SELECT test.assert_true((SELECT NOT private.release_exception_valid25(p) FROM private.document_publications p WHERE id=:'p25'),'25: reactivation never revives old authorization');
ROLLBACK TO SAVEPOINT authority25;
SAVEPOINT delegation25;
UPDATE public.memberships SET role_code='admin' WHERE id='00000000-0000-4000-b000-000000000201';
INSERT INTO private.team_delegations(office_id,membership_id,allowed_roles,allowed_permissions,expires_at,created_by)VALUES(:'o25','00000000-0000-4000-b000-000000000201',ARRAY['employee'],ARRAY['foundation.access','documents.read','requests.read','requests.read_all','customers.read','customers.read_all','documents.exceptions.request','documents.exceptions.decide'],clock_timestamp()+interval '1 day','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.release25(:'o25',:'p25','request');
SELECT test.release25(:'o25',:'p25','authorize');
RESET ROLE;
SELECT test.assert_true((SELECT private.release_exception_valid25(p) FROM private.document_publications p WHERE id=:'p25'),'25: delegated administrator explicitly authorizes within own responsibility');
UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id='00000000-0000-4000-b000-000000000201' AND revoked_at IS NULL;
SELECT test.assert_true((SELECT NOT private.release_exception_valid25(p) FROM private.document_publications p WHERE id=:'p25'),'25: revoked delegation invalidates authorization');
INSERT INTO private.team_delegations(office_id,membership_id,allowed_roles,allowed_permissions,expires_at,created_by)VALUES(:'o25','00000000-0000-4000-b000-000000000201',ARRAY['employee'],ARRAY['foundation.access','documents.read','requests.read','requests.read_all','customers.read','customers.read_all','documents.exceptions.request','documents.exceptions.decide'],clock_timestamp()+interval '1 day','00000000-0000-4000-a000-000000000201');
SELECT test.assert_true((SELECT NOT private.release_exception_valid25(p) FROM private.document_publications p WHERE id=:'p25'),'25: a new delegation never resurrects an old exception');
ROLLBACK TO SAVEPOINT delegation25;
SAVEPOINT customer25;
UPDATE public.customers SET blocked_at=clock_timestamp() WHERE id=(SELECT customer_id FROM public.requests WHERE id=:'q25');
SELECT test.assert_true((SELECT 'restriction'=ANY(private.wf_gate(p)) FROM private.document_publications p WHERE id=:'p25'),'25: financial exception never bypasses confidentiality restriction');
ROLLBACK TO SAVEPOINT customer25;
SAVEPOINT identity25;
UPDATE private.customer_relations SET revoked_at=clock_timestamp(),revoked_by='00000000-0000-4000-a000-000000000201' WHERE office_id=:'o25' AND relation_type='identity' AND revoked_at IS NULL;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,true)',:'o25',:'p25'),'PT403','25: exception never bypasses revoked recipient identity');
RESET ROLE;
ROLLBACK TO SAVEPOINT identity25;
SAVEPOINT review25;
INSERT INTO private.document_publication_events(office_id,publication_id,actor_id,kind,reason)VALUES(:'o25',:'p25','00000000-0000-4000-a000-000000000201','reject','Veto editorial no laboratório');
SELECT test.assert_true((SELECT 'review'=ANY(private.wf_gate(p)) FROM private.document_publications p WHERE id=:'p25'),'25: exception never approves rejected content');
ROLLBACK TO SAVEPOINT review25;
SAVEPOINT signature25;
INSERT INTO private.document_signature_events24(office_id,publication_id,actor_id,kind,reason,state)SELECT office_id,id,'00000000-0000-4000-a000-000000000201','revoke','Assinatura revogada em laboratório',jsonb_build_object('mode','external','status','invalid','expected_signers',jsonb_build_array('Pessoa'),'verified_signers','[]'::jsonb,'exit_policy','after_settlement') FROM private.document_publications WHERE id=:'p25';
SELECT test.assert_true((SELECT 'signature'=ANY(private.wf_gate(p)) AND 'payment'=ANY(private.wf_gate(p)) FROM private.document_publications p WHERE id=:'p25'),'25: signature changed invalidates scope and remains mandatory');
ROLLBACK TO SAVEPOINT signature25;
SAVEPOINT file25;
UPDATE private.document_artifact_jobs SET sha256=repeat('f',64) WHERE publication_id=:'p25';
SELECT test.assert_true((SELECT 'payment'=ANY(private.wf_gate(p)) FROM private.document_publications p WHERE id=:'p25'),'25: different file hash invalidates exception');
ROLLBACK TO SAVEPOINT file25;
SAVEPOINT revision25;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_operate(:'o25',:'d25',jsonb_build_object('kind','save','expected_revision',:'r25'::int,'input',jsonb_build_object('content','Nova versão {{cliente.nome}} em {{datas.emissao}}','overrides',jsonb_build_object('cliente.nome','Pessoa fictícia'),'money_in_words',true),'idempotency_key',gen_random_uuid()));
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,true)',:'o25',:'p25'),'PT403','25: new revision blocks historical release');
RESET ROLE;
ROLLBACK TO SAVEPOINT revision25;
SET ROLE authenticated;
SELECT test.release25(:'o25',:'p25','revoke') AS revoked25 \gset
SELECT test.assert_true(:'revoked25'::jsonb#>>'{exception,status}'='revoked' AND(:'revoked25'::jsonb->'blockers')?'payment','25: revocation blocks payment immediately');
SELECT test.release25(:'o25',:'p25','request');
SELECT test.release25(:'o25',:'p25','reject') AS rejected25 \gset
SELECT test.assert_true(:'rejected25'::jsonb#>>'{exception,status}'='rejected' AND(:'rejected25'::jsonb->'blockers')?'payment','25: refusal preserves payment blocker');
SELECT test.release25(:'o25',:'p25','request','Validade curta no laboratório',clock_timestamp()+interval '400 milliseconds');
SELECT test.release25(:'o25',:'p25','authorize');
SELECT pg_sleep(0.5);
SELECT public.document_release_state(:'o25',:'p25',1) AS expired25 \gset
SELECT test.assert_true(:'expired25'::jsonb#>>'{exception,status}'='expired' AND(:'expired25'::jsonb->'blockers')?'payment','25: authorized exception expires without mutation');
SELECT test.release25(:'o25',:'p25','request');
SELECT test.release25(:'o25',:'p25','authorize');
RESET ROLE;
SAVEPOINT balance25;
SELECT version AS cashv25 FROM private.cash_sessions WHERE id=:'cash25' \gset
SELECT id AS allocation25 FROM private.payment_allocations WHERE office_id=:'o25' AND charge_id=:'charge25' ORDER BY amount_cents DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.correction_operate(:'o25',jsonb_build_object('kind','reverse','session_id',:'cash25','expected_version',:'cashv25'::int,'idempotency_key',gen_random_uuid(),'allocation_id',:'allocation25','refund_now',false,'amount_cents',1,'reason','Estorno simultâneo ao escopo','evidence','Conferência em laboratório'));
RESET ROLE;
SELECT test.assert_true((SELECT 'payment'=ANY(private.wf_gate(p)) AND NOT private.release_exception_valid25(p) FROM private.document_publications p WHERE id=:'p25'),'25: real reversal changes ledger and invalidates exception');
ROLLBACK TO SAVEPOINT balance25;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000203","session_id":"00000000-0000-4000-c000-000000000203"}';
SELECT test.expect_error(format('SELECT public.document_release_state(%L,%L,1)',:'o25',:'p25'),'PT403','25: other office denied');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_release_state(%L,%L,1)',:'o25',:'p25'),'PT403','25: client cannot read internal reasons');
RESET ROLE;
SELECT test.expect_error(format('DELETE FROM private.document_exception_events25 WHERE publication_id=%L',:'p25'),'PT409','25: exception events immutable');
ROLLBACK;
