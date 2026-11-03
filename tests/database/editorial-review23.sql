-- Disposable database only, after all earlier stages and regression suites.
SELECT test.assert_true(to_regprocedure('public.document_review_queue(uuid,text,text,integer,integer)') IS NOT NULL,'23: review queue installed without parallel approvals');
SELECT test.assert_true(to_regprocedure('public.document_review_history(uuid,uuid,integer)') IS NOT NULL,'23: decision history installed');
BEGIN;
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM public.role_permissions WHERE permission_code='documents.review' AND role_code='owner') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE permission_code='documents.review' AND role_code<>'owner'),'23: reviewer capability seed only owner');
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT '00000000-0000-4000-b000-000000000206',p FROM unnest(ARRAY['documents.read','requests.read','requests.read_all','customers.read'])p ON CONFLICT DO NOTHING;
UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id='00000000-0000-4000-b000-000000000206' AND revoked_at IS NULL;
INSERT INTO private.team_delegations(office_id,membership_id,allowed_roles,allowed_permissions,expires_at,created_by) VALUES('00000000-0000-4000-e000-000000000201','00000000-0000-4000-b000-000000000206',ARRAY['employee'],ARRAY['foundation.access','documents.review'],clock_timestamp()+interval '1 day','00000000-0000-4000-a000-000000000201');
SELECT '00000000-0000-4000-e000-000000000201' AS o23 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.template_save(:'o23',NULL,test.template_definition20()||'{"code":"EDITORIAL23","name":"Declaração editorial local","content":"CONTEÚDO PRIVADO EDITORIAL23","variables":[],"demonstration":false,"review_required":true}',0,'Modelo local23',gen_random_uuid()) AS t23 \gset
SELECT :'t23'::jsonb->>'id' AS tid23,:'t23'::jsonb#>>'{versions,0,id}' AS tv23 \gset
SELECT public.template_approve(:'o23',:'tid23',:'tv23',1,'Revisão humana local',gen_random_uuid());
SELECT public.service_create(:'o23','{"code":"EDITORIAL23","name":"Serviço editorial local","category":"Documentos","unit":"unidade","price_cents":5000,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":true,"signature_required":false,"settlement_required":true,"required_capabilities":[],"fields":[],"checklist":[],"quantity_min":1,"quantity_max":1,"max_discount_bps":0,"max_surcharge_bps":0,"allow_courtesy":false,"allow_price_override":false}','Serviço local23',gen_random_uuid())->>'id' AS sid23 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.request_create(:'o23','{"origin":"portal","title":"Solicitação editorial local23","message":"Pedido fictício local"}',gen_random_uuid(),gen_random_uuid()) AS r23 \gset
SELECT :'r23'::jsonb->>'id' AS rid23 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.request_mutate(:'o23',:'rid23',1,jsonb_build_object('kind','triage','reason','Triagem local23','customer_id',NULL,'items',jsonb_build_array(jsonb_build_object('service_id',:'sid23','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))),gen_random_uuid()) AS triage23 \gset
SELECT :'triage23'::jsonb#>>'{items,0,id}' AS item23 \gset
SELECT public.request_mutate(:'o23',:'rid23',2,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000202","reason":"Preenchimento por funcionário"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.document_create(:'o23',:'rid23',:'item23',:'tv23','[]',gen_random_uuid()) AS d23 \gset
SELECT :'d23'::jsonb->>'id' AS did23 \gset
SELECT public.document_operate(:'o23',:'did23','{"kind":"prepare","expected_revision":1,"idempotency_key":"00000000-0000-4000-9000-000000000231"}');
SELECT gen_random_uuid() AS submitkey23 \gset
SELECT jsonb_build_object('kind','freeze','expected_revision',1,'reason','MOTIVO INTERNO SECRET23','reviewer_id','00000000-0000-4000-b000-000000000206','due_at',clock_timestamp()+interval '1 day','expected_event_id',NULL) AS submit23 \gset
SELECT public.document_workflow_command(:'o23',:'did23',:'submit23',:'submitkey23') AS submitted23 \gset
SELECT :'submitted23'::jsonb#>>'{publications,0,id}' AS pub23,:'submitted23'::jsonb#>>'{publications,0,review,last_event_id}' AS event23 \gset
SELECT test.assert_true(:'submitted23'::jsonb#>>'{publications,0,review,status}'='in_review' AND :'submitted23'::jsonb#>>'{publications,0,review,reviewer_id}'='00000000-0000-4000-b000-000000000206','23: prepared revision submitted with reviewer and due date');
SELECT public.document_workflow_command(:'o23',:'did23',:'submit23',:'submitkey23');
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o23',:'did23',jsonb_build_object('kind','approve','expected_revision',1,'reason','Aprovar próprio','publication_id',:'pub23','expected_event_id',:'event23')::text),'PT403','23: employee without capability cannot approve own document');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.assert_true(public.document_review_queue(:'o23','editorial local','in_review',1,3)->>'total'='1','23: authorized reviewer queue is connected');
SELECT test.assert_true(public.document_workflow_state(:'o23',:'did23')#>>'{publications,0,review,can_decide}'='true','23: delegation grants review without granting document editing');
SELECT gen_random_uuid() AS returnkey23 \gset
SELECT jsonb_build_object('kind','return','publication_id',:'pub23','expected_revision',1,'expected_event_id',:'event23','reason','MOTIVO INTERNO SECRET23: corrigir texto') AS return23 \gset
SELECT public.document_workflow_command(:'o23',:'did23',:'return23',:'returnkey23') AS returned23 \gset
SELECT public.document_workflow_command(:'o23',:'did23',:'return23',:'returnkey23');
SELECT test.assert_true(:'returned23'::jsonb#>>'{publications,0,review,status}'='returned' AND :'returned23'::jsonb#>>'{publications,0,approved}'='false','23: return is distinct from rejection and blocks approval gate');
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o23',:'did23',jsonb_build_object('kind','approve','expected_revision',1,'reason','Decisão concorrente','publication_id',:'pub23','expected_event_id',:'event23')::text),'PT409','23: conflicting decision refuses stale event');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.request_document_reviews(:'o23',:'rid23',1,3) AS public23 \gset
SELECT test.assert_true(:'public23'::jsonb#>>'{items,0,status}'='returned' AND strpos(:'public23','SECRET23')=0 AND strpos(:'public23','actor')=0,'23: client request shows result without internal observation or actor');
SELECT test.assert_true(public.notifications_page(:'o23','','all','document_returned',1,3)->>'total'='1','23: client receives one result notification after replay');
SELECT test.expect_error(format('SELECT public.document_review_queue(%L,%L,%L,1,3)',:'o23','',''),'PT403','23: client cannot read internal review queue');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.document_operate(:'o23',:'did23','{"kind":"save","expected_revision":1,"input":{"content":"CONTEÚDO PRIVADO CORRIGIDO23","overrides":{},"money_in_words":false},"idempotency_key":"00000000-0000-4000-9000-000000000232"}');
SELECT public.document_operate(:'o23',:'did23','{"kind":"prepare","expected_revision":2,"idempotency_key":"00000000-0000-4000-9000-000000000233"}');
SELECT public.document_workflow_command(:'o23',:'did23','{"kind":"freeze","expected_revision":2,"reason":"Nova análise após correção","reviewer_id":"00000000-0000-4000-b000-000000000206","due_at":null,"expected_event_id":null}',gen_random_uuid()) AS second23 \gset
SELECT :'second23'::jsonb#>>'{publications,0,id}' AS pubsecond23,:'second23'::jsonb#>>'{publications,0,review,last_event_id}' AS eventsecond23 \gset
SELECT test.assert_true(:'second23'::jsonb#>>'{publications,0,approved}'='false' AND :'second23'::jsonb#>>'{publications,1,review,status}'='superseded','23: new revision needs new analysis and old decision remains historical');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT gen_random_uuid() AS approvekey23 \gset
SELECT jsonb_build_object('kind','approve','publication_id',:'pubsecond23','expected_revision',2,'expected_event_id',:'eventsecond23','reason','Conteúdo corrigido e conferido') AS approve23 \gset
SELECT public.document_workflow_command(:'o23',:'did23',:'approve23',:'approvekey23') AS approved23 \gset
SELECT public.document_workflow_command(:'o23',:'did23',:'approve23',:'approvekey23');
SELECT test.assert_true(:'approved23'::jsonb#>>'{publications,0,review,status}'='approved' AND :'approved23'::jsonb#>>'{publications,0,ready}'='false','23: approval does not imply payment, signature, artifact or delivery');
SET CONSTRAINTS private.document_version_capture IMMEDIATE;
SET CONSTRAINTS private.document_version_capture DEFERRED;
SELECT test.assert_true(public.document_versions_page(:'o23',:'did23',1)#>>'{items,0,status}'='approved','23: version22 status follows the same approval authority');
SELECT test.assert_true(public.document_review_history(:'o23',:'did23',1)->>'total'='4','23: replay never duplicates submit or decision history');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.document_operate(:'o23',:'did23','{"kind":"save","expected_revision":2,"input":{"content":"TERCEIRA REVISÃO LOCAL23","overrides":{},"money_in_words":false},"idempotency_key":"00000000-0000-4000-9000-000000000234"}');
SELECT public.document_operate(:'o23',:'did23','{"kind":"prepare","expected_revision":3,"idempotency_key":"00000000-0000-4000-9000-000000000235"}');
SELECT public.document_workflow_command(:'o23',:'did23','{"kind":"freeze","expected_revision":3,"reason":"Análise local23","reviewer_id":null,"due_at":null,"expected_event_id":null}',gen_random_uuid()) AS third23 \gset
SELECT :'third23'::jsonb#>>'{publications,0,id}' AS pubthird23,:'third23'::jsonb#>>'{publications,0,review,last_event_id}' AS eventthird23 \gset
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000202','documents.review') ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o23',:'did23',jsonb_build_object('kind','approve','publication_id',:'pubthird23','expected_revision',3,'expected_event_id',:'eventthird23','reason','Autor com permissão ainda precisa segregação')::text),'PT403','23: author with review capability cannot approve own shared-queue revision');
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='documents.review';
SET ROLE authenticated;
SELECT public.document_workflow_command(:'o23',:'did23',jsonb_build_object('kind','withdraw','publication_id',:'pubthird23','expected_revision',3,'expected_event_id',:'eventthird23','reason','Retirada para reorganização'),gen_random_uuid()) AS withdrawn23 \gset
SELECT test.assert_true(:'withdrawn23'::jsonb#>>'{publications,0,review,status}'='withdrawn','23: author withdraws pending analysis with audit reason');
-- The immutable publication creator is A; the latest submitter after transfer is B.
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT '00000000-0000-4000-b000-000000000206',permission FROM unnest(ARRAY['documents.update','documents.create','templates.read'])permission ON CONFLICT DO NOTHING;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000202','requests.transfer') ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.request_mutate(:'o23',:'rid23',3,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000206","reason":"Reencaminhamento por outro integrante"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_workflow_command(:'o23',:'did23',jsonb_build_object('kind','freeze','expected_revision',3,'expected_event_id',:'withdrawn23'::jsonb#>>'{publications,0,review,last_event_id}','reviewer_id',NULL,'due_at',NULL,'reason','Reencaminhamento explícito'),gen_random_uuid()) AS resent23 \gset
SELECT test.assert_true(:'resent23'::jsonb#>>'{publications,0,review,can_decide}'='false','23: latest submitter B is ineligible despite original author and creator A');
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o23',:'did23',jsonb_build_object('kind','approve','publication_id',:'pubthird23','expected_revision',3,'expected_event_id',:'resent23'::jsonb#>>'{publications,0,review,last_event_id}','reason','B tenta aprovar seu reencaminhamento')::text),'PT403','23: transfer and resubmit cannot bypass sender self approval guard');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o23',:'did23',jsonb_build_object('kind','approve','publication_id',:'pubthird23','expected_revision',3,'expected_event_id',:'eventthird23','reason','Evento de análise anterior')::text),'PT409','23: withdraw/resubmit invalidates the old expected event');
SELECT public.document_workflow_command(:'o23',:'did23',jsonb_build_object('kind','reject','publication_id',:'pubthird23','expected_revision',3,'expected_event_id',:'resent23'::jsonb#>>'{publications,0,review,last_event_id}','reason','Rejeição humana motivada'),gen_random_uuid()) AS rejected23 \gset
SET CONSTRAINTS private.document_version_capture IMMEDIATE;
SET CONSTRAINTS private.document_version_capture DEFERRED;
SELECT test.assert_true(:'rejected23'::jsonb#>>'{publications,0,review,status}'='rejected' AND public.document_versions_page(:'o23',:'did23',1)#>>'{items,0,last_decision}'='reject','23: rejection is a final distinct decision for this revision');
-- Explicit waived submissions remain editable editorial reviews while their approval gate is waived.
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.template_save(:'o23',NULL,test.template_definition20()||'{"code":"WAIVED23","name":"Dispensado local23","content":"TEXTO DISPENSADO23","variables":[],"demonstration":false,"review_required":false}',0,'Modelo dispensado local',gen_random_uuid()) AS waivedtemplate23 \gset
SELECT :'waivedtemplate23'::jsonb->>'id' AS waivedtid23,:'waivedtemplate23'::jsonb#>>'{versions,0,id}' AS waivedtv23 \gset
SELECT public.template_approve(:'o23',:'waivedtid23',:'waivedtv23',1,'Modelo conferido',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_create(:'o23',:'rid23',:'item23',:'waivedtv23','[]',gen_random_uuid())->>'id' AS waiveddid23 \gset
SELECT public.document_operate(:'o23',:'waiveddid23',jsonb_build_object('kind','prepare','expected_revision',1,'idempotency_key',gen_random_uuid()));
SELECT public.document_workflow_command(:'o23',:'waiveddid23','{"kind":"freeze","expected_revision":1,"reason":"Análise explícita dispensada","reviewer_id":null,"due_at":null,"expected_event_id":null}',gen_random_uuid()) AS waivedsubmit23 \gset
SELECT :'waivedsubmit23'::jsonb#>>'{publications,0,id}' AS waivedpub23,:'waivedsubmit23'::jsonb#>>'{publications,0,review,last_event_id}' AS waivedevent23 \gset
SELECT test.assert_true(:'waivedsubmit23'::jsonb#>>'{publications,0,review,status}'='in_review' AND :'waivedsubmit23'::jsonb#>>'{publications,0,approved}'='true' AND NOT (:'waivedsubmit23'::jsonb#>'{publications,0,blockers}') ? 'review' AND :'waivedsubmit23'::jsonb#>>'{publications,0,review,can_withdraw}'='true','23: waived submit retains approval gate and human withdrawal');
SAVEPOINT waiveddecision23;
SELECT public.document_workflow_command(:'o23',:'waiveddid23',jsonb_build_object('kind','withdraw','publication_id',:'waivedpub23','expected_revision',1,'expected_event_id',:'waivedevent23','reason','Veto humano de dispensa'),gen_random_uuid()) AS waivednegative23 \gset
SELECT test.assert_true(:'waivednegative23'::jsonb#>>'{publications,0,approved}'='false' AND :'waivednegative23'::jsonb#>>'{publications,0,ready}'='false' AND (:'waivednegative23'::jsonb#>'{publications,0,blockers}') ? 'review','23: waived withdraw command vetoes final artifact gate');
ROLLBACK TO SAVEPOINT waiveddecision23;
RELEASE SAVEPOINT waiveddecision23;
SAVEPOINT waiveddecision23;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_workflow_command(:'o23',:'waiveddid23',jsonb_build_object('kind','return','publication_id',:'waivedpub23','expected_revision',1,'expected_event_id',:'waivedevent23','reason','Veto humano de dispensa'),gen_random_uuid()) AS waivednegative23 \gset
SELECT test.assert_true(:'waivednegative23'::jsonb#>>'{publications,0,approved}'='false' AND :'waivednegative23'::jsonb#>>'{publications,0,ready}'='false' AND (:'waivednegative23'::jsonb#>'{publications,0,blockers}') ? 'review','23: waived return command vetoes final artifact gate');
ROLLBACK TO SAVEPOINT waiveddecision23;
RELEASE SAVEPOINT waiveddecision23;
SAVEPOINT waiveddecision23;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_workflow_command(:'o23',:'waiveddid23',jsonb_build_object('kind','reject','publication_id',:'waivedpub23','expected_revision',1,'expected_event_id',:'waivedevent23','reason','Veto humano de dispensa'),gen_random_uuid()) AS waivednegative23 \gset
SELECT test.assert_true(:'waivednegative23'::jsonb#>>'{publications,0,approved}'='false' AND :'waivednegative23'::jsonb#>>'{publications,0,ready}'='false' AND (:'waivednegative23'::jsonb#>'{publications,0,blockers}') ? 'review','23: waived reject command vetoes final artifact gate');
ROLLBACK TO SAVEPOINT waiveddecision23;
RELEASE SAVEPOINT waiveddecision23;
RESET ROLE;
UPDATE private.team_delegations SET expires_at=clock_timestamp()-interval '1 second' WHERE membership_id='00000000-0000-4000-b000-000000000206' AND revoked_at IS NULL;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.assert_true(public.document_workflow_state(:'o23',:'did23')->>'can_review'='false','23: expired delegation immediately removes review authority');
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o23',:'did23',jsonb_build_object('kind','approve','publication_id',:'pubthird23','expected_revision',3,'expected_event_id',:'resent23'::jsonb#>>'{publications,0,review,last_event_id}','reason','Tentativa sem delegação vigente')::text),'PT403','23: expired reviewer cannot decide with a fresh command');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000203","session_id":"00000000-0000-4000-c000-000000000203"}';
SELECT test.expect_error(format('SELECT public.document_review_history(%L,%L,1)',:'o23',:'did23'),'PT403','23: other office cannot read decision observations');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.document_publication_events WHERE publication_id=:'pubsecond23' AND kind='approve') AND NOT EXISTS(SELECT FROM private.document_cash_tasks WHERE publication_id IN(:'pub23',:'pubsecond23',:'pubthird23')),'23: editorial decisions neither duplicate nor create financial handoff');
SELECT test.assert_true(NOT has_function_privilege('anon','public.document_review_queue(uuid,text,text,integer,integer)','EXECUTE') AND NOT has_table_privilege('authenticated','private.document_publication_events','INSERT,UPDATE,DELETE'),'23: direct event forgery and anonymous queue forbidden');
ROLLBACK;
