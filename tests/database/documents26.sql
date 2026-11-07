RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.document_delivery_state(uuid,uuid,integer)') IS NOT NULL,'26: delivery RPC exists');
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

SELECT public.document_delivery_state(:'o25',:'p25',1) AS ds26 \gset
SELECT test.assert_true(:'ds26'::jsonb->>'ready'='true' AND :'ds26'::jsonb->>'can_deliver'='true','26: state uses gate25 and current capability');
SELECT jsonb_build_object('kind','begin','channel','print','expected_revision',:'r25'::int,'recipient_customer_id',:'ds26'::jsonb#>>'{recipient,id}','contact_position',NULL,'expected_phone',NULL,'recipient_checked',true) AS dc26,gen_random_uuid() AS dk26 \gset
SELECT public.document_delivery_command(:'o25',:'p25',:'dc26',:'dk26') AS started26 \gset
SELECT test.assert_true(:'started26'::jsonb#>>'{items,0,status}'='attempt','26: opening print is only attempt');
SELECT :'started26'::jsonb#>>'{items,0,id}' AS delivery26 \gset
SELECT test.assert_true(public.document_delivery_command(:'o25',:'p25',:'dc26',:'dk26')#>>'{items,0,id}'=:'delivery26','26: retry begin preserves delivery');
SAVEPOINT review26;
RESET ROLE;
INSERT INTO auth.sessions(id,user_id) VALUES('00000000-0000-4000-c000-000000009926','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000009926"}';
SELECT test.expect_error(format('SELECT public.document_delivery_access(%L,%L,%L)',:'o25',:'p25',:'delivery26'),'PT409','26 review: another session cannot access original attempt');
ROLLBACK TO SAVEPOINT review26;
SELECT public.document_delivery_command(:'o25',:'p25',:'dc26',gen_random_uuid()) FROM generate_series(1,6);
SELECT public.document_delivery_command(:'o25',:'p25',:'dc26',:'dk26') AS replay26 \gset
SELECT test.assert_true(:'replay26'::jsonb->>'result_delivery_id'=:'delivery26' AND (:'replay26'::jsonb->>'page')::integer>1 AND EXISTS(SELECT FROM jsonb_array_elements(:'replay26'::jsonb->'items')v WHERE v->>'id'=:'delivery26'),'26 review: replay locates original delivery beyond first page');
ROLLBACK TO SAVEPOINT review26;

SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,%L)',:'o25',:'p25',(:'dc26'::jsonb||jsonb_build_object('channel','whatsapp'))::text,:'dk26'),'PT409','26: changed retry denied');
SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',(:'dc26'::jsonb||jsonb_build_object('recipient_customer_id','00000000-0000-4000-a000-000000000999'))::text),'PT403','26: arbitrary recipient denied');
SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',(:'dc26'::jsonb||jsonb_build_object('recipient_checked',false))::text),'PT422','26: recipient check mandatory');
SAVEPOINT whatsapp26;
RESET ROLE;
DELETE FROM public.customer_contacts WHERE office_id=:'o25' AND customer_id=(:'ds26'::jsonb#>>'{recipient,id}')::uuid;
INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value)VALUES(:'o25',(:'ds26'::jsonb#>>'{recipient,id}')::uuid,0,'phone','11999999999');
SET ROLE authenticated;
SELECT public.document_delivery_command(:'o25',:'p25',(:'dc26'::jsonb||jsonb_build_object('channel','whatsapp','contact_position',0,'expected_phone','5511999999999')),gen_random_uuid()) AS ws26 \gset
SELECT test.assert_true(:'ws26'::jsonb#>>'{items,0,phone}'='5511999999999' AND :'ws26'::jsonb#>>'{items,0,status}'='attempt','26: WhatsApp binds verified canonical contact and never confirms on begin');
RESET ROLE;
UPDATE public.customer_contacts SET value='11888888888' WHERE office_id=:'o25' AND customer_id=(:'ds26'::jsonb#>>'{recipient,id}')::uuid AND position=0;
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.document_delivery_access(%L,%L,%L)',:'o25',:'p25',:'ws26'::jsonb#>>'{items,0,id}'),'PT409','26: changed official phone invalidates previous WhatsApp attempt');
ROLLBACK TO SAVEPOINT whatsapp26;
SAVEPOINT finance26;
RESET ROLE;
SELECT a.version AS cv26 FROM private.charges_amounts(:'o25',:'charge25')a \gset
SET ROLE authenticated;
SELECT public.charges_mutate(:'o25',:'charge25',:'cv26'::int,jsonb_build_object('kind','adjust','delta_cents',1,'reason','Nova obrigação antes da entrega','installments',jsonb_build_array(jsonb_build_object('due_date',current_date::text,'amount_cents',10001))),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.document_delivery_access(%L,%L,%L)',:'o25',:'p25',:'delivery26'),'PT409','26: financial change invalidates an earlier print attempt');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,true)',:'o25',:'p25'),'PT403','26: alternate download cannot bypass financial change');
ROLLBACK TO SAVEPOINT finance26;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',:'dc26'),'PT403','26: cash capability never grants document delivery');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_delivery_state(%L,%L,1)',:'o25',:'p25'),'PT403','26: client cannot read internal recipient/contact history');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000203","session_id":"00000000-0000-4000-c000-000000000203"}';
SELECT test.expect_error(format('SELECT public.document_delivery_state(%L,%L,1)',:'o25',:'p25'),'PT403','26: foreign office cannot read delivery history');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT :'started26'::jsonb#>>'{items,0,last_event_id}' AS event26 \gset
SELECT jsonb_build_object('kind','confirm','delivery_id',:'delivery26','expected_event_id',:'event26','reason','Cliente confirmou por canal de teste') AS next26 \gset
SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',:'next26'),'PT409','26: attempt cannot become confirmed without availability');
SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',jsonb_build_object('kind','available','delivery_id',:'delivery26','expected_event_id',:'event26','reason','Tentativa sem obter arquivo')::text),'PT409','26: cannot claim availability before private file authorization');
SELECT public.document_artifact_authorize(:'o25',:'p25',true);
SELECT public.document_delivery_command(:'o25',:'p25',jsonb_build_object('kind','available','delivery_id',:'delivery26','expected_event_id',:'event26','reason','Impressão disponibilizada para retirada'),gen_random_uuid()) AS available26 \gset
SELECT test.assert_true((SELECT x->>'status' FROM jsonb_array_elements(:'available26'::jsonb->'items')x WHERE x->>'id'=:'delivery26')='available' AND (SELECT x->>'sha256' FROM jsonb_array_elements(:'available26'::jsonb->'items')x WHERE x->>'id'=:'delivery26') IS NOT NULL,'26: available is distinct and includes exact hash');
SELECT public.document_delivery_command(:'o25',:'p25',(:'next26'::jsonb||jsonb_build_object('expected_event_id',(SELECT x->>'last_event_id' FROM jsonb_array_elements(:'available26'::jsonb->'items')x WHERE x->>'id'=:'delivery26'))),gen_random_uuid()) AS confirmed26 \gset
SELECT test.assert_true((SELECT x->>'status' FROM jsonb_array_elements(:'confirmed26'::jsonb->'items')x WHERE x->>'id'=:'delivery26')='confirmed','26: receipt requires separate explicit event');
SAVEPOINT closed26;
RESET ROLE;
UPDATE public.requests SET status='concluido' WHERE office_id=:'o25' AND id=:'q25';
SET ROLE authenticated;
SELECT test.assert_true(public.document_delivery_command(:'o25',:'p25',:'dc26',gen_random_uuid())->>'publication_id'=:'p25','26: completion does not strand eligible final delivery');
ROLLBACK TO SAVEPOINT closed26;
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.deliveries','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.document_delivery_command(uuid,uuid,jsonb,uuid)','EXECUTE'),'26: no raw or anonymous access');
SELECT test.expect_error(format('UPDATE private.deliveries SET channel=''whatsapp'' WHERE id=%L',:'delivery26'),'PT409','26: deliveries immutable');
SET ROLE authenticated;
SELECT public.document_delivery_command(:'o25',:'p25',jsonb_build_object('kind','revoke','delivery_id',:'delivery26','expected_event_id',(SELECT x->>'last_event_id' FROM jsonb_array_elements(:'confirmed26'::jsonb->'items')x WHERE x->>'id'=:'delivery26'),'reason','Revogar acesso final futuro da publicação'),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,true)',:'o25',:'p25'),'PT403','26: known publication cannot bypass revocation');
SELECT test.expect_error(format('SELECT public.document_delivery_command(%L,%L,%L,gen_random_uuid())',:'o25',:'p25',:'dc26'),'PT403','26: revoked publication cannot be printed via new attempt');
SELECT test.assert_true(public.document_delivery_state(:'o25',:'p25',1)->>'ready'='false','26: revoked history remains readable without granting bytes');
ROLLBACK;
