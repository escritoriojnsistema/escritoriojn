-- Run only in disposable fixtures; no hosted Auth accounts or data.
SELECT test.assert_true(to_regprocedure('public.document_workflow_state(uuid,uuid)') IS NOT NULL,'workflow RPC installed');
SELECT test.assert_true(to_regprocedure('public.document_workflow_command(uuid,uuid,jsonb,uuid)') IS NOT NULL,'workflow command installed');
SELECT test.assert_true(NOT has_function_privilege('anon','public.portal_documents_page(uuid,integer)','EXECUTE'),'portal anonymous denied');
SELECT test.assert_true(NOT has_function_privilege('authenticated','public.document_artifact_complete(uuid,uuid,text,bigint,text)','EXECUTE'),'artifact completion service-only');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.document_publications'::regclass,'private.document_publication_events'::regclass,'private.document_artifact_jobs'::regclass,'private.document_cash_tasks'::regclass)),'workflow tables RLS');

-- Reuse an actual intake-backed document created by document-commercial.sql.
-- Discover fixture by its persisted intake, since the runner uses separate sessions.
RESET ROLE;
SELECT d.id AS wf_doc FROM public.documents d JOIN private.document_intakes i ON i.office_id=d.office_id AND i.request_item_id=d.request_item_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id='00000000-0000-4000-e000-000000000201' AND d.status='draft' AND r.status NOT IN('cancelado','concluido') ORDER BY d.created_at LIMIT 1 \gset
SELECT revision AS wf_revision FROM public.documents WHERE id=:'wf_doc' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','freeze','expected_revision',:'wf_revision'::integer,'reason','Teste')::text),'PT422','workflow: draft cannot be frozen');
SELECT public.document_operate('00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','save','expected_revision',:'wf_revision'::integer,'input',jsonb_build_object('content','Declaração {{cliente.nome}} em {{datas.emissao}}','overrides',jsonb_build_object('cliente.nome','Pessoa fictícia'),'money_in_words',true),'idempotency_key',gen_random_uuid())) AS wf_saved \gset
SELECT (:'wf_saved'::jsonb->>'revision')::integer AS wf_revision \gset
SELECT public.document_operate('00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','prepare','expected_revision',:'wf_revision'::integer,'idempotency_key',gen_random_uuid()));
SELECT gen_random_uuid() AS wf_freeze_key \gset
SELECT public.document_workflow_command('00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','freeze','expected_revision',:'wf_revision'::integer,'reason','Revisão de teste'),:'wf_freeze_key') AS wf_frozen \gset
SELECT :'wf_frozen'::jsonb->'publications'->0->>'id' AS wf_publication \gset
SELECT test.assert_true(:'wf_publication' IS NOT NULL,'workflow: prepared revision frozen');
SELECT test.assert_true(public.document_workflow_command('00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','freeze','expected_revision',:'wf_revision'::integer,'reason','Revisão de teste'),:'wf_freeze_key')->'publications'->0->>'id'=:'wf_publication','workflow: freeze replay preserves publication');
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','approve','expected_revision',:'wf_revision'::integer,'reason','Aprovação','publication_id',:'wf_publication')::text),'PT403','workflow: self approval denied by intake policy');
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','handoff','expected_revision',:'wf_revision'::integer,'reason','Entrega','publication_id',:'wf_publication')::text),'PT422','workflow: handoff requires approval');
RESET ROLE;
-- Explicit fixture capabilities: no production grants are changed.
INSERT INTO private.team_member_permissions(membership_id,permission_code)
SELECT '00000000-0000-4000-b000-000000000206',p FROM unnest(ARRAY['documents.read','documents.update','requests.read','requests.read_all','customers.read','customers.read_all']) p ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','approve','expected_revision',:'wf_revision'::integer+1,'reason','Revisão','publication_id',:'wf_publication')::text),'PT409','workflow: approval requires exact revision');
SELECT public.document_workflow_command('00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','approve','expected_revision',:'wf_revision'::integer,'reason','Revisão','publication_id',:'wf_publication'),gen_random_uuid());
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','handoff','expected_revision',:'wf_revision'::integer,'reason','Entrega','publication_id',:'wf_publication')::text),'PT422','workflow: handoff requires preserved final artifact');
SELECT public.document_artifact_begin('00000000-0000-4000-e000-000000000201',:'wf_publication') AS wf_job \gset
RESET ROLE;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='00000000-0000-4000-c000-000000000201';
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.document_artifact_complete(%L,%L,%L,100,%L)',:'wf_job'::jsonb->>'job_id',:'wf_job'::jsonb->>'lease_token',repeat('a',64),'jn-document-v1'),'PT403','workflow: revoked session cannot complete artifact lease');
RESET ROLE;
UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000201';
UPDATE public.customers SET blocked_at=clock_timestamp() WHERE id=(SELECT r.customer_id FROM public.requests r JOIN public.documents d ON d.request_id=r.id WHERE d.id=:'wf_doc');
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.document_artifact_complete(%L,%L,%L,100,%L)',:'wf_job'::jsonb->>'job_id',:'wf_job'::jsonb->>'lease_token',repeat('a',64),'jn-document-v1'),'PT403','workflow: restricted source cannot complete artifact lease');
RESET ROLE;
UPDATE public.customers SET blocked_at=NULL WHERE id=(SELECT r.customer_id FROM public.requests r JOIN public.documents d ON d.request_id=r.id WHERE d.id=:'wf_doc');
SET ROLE service_role;
SELECT test.assert_true(public.document_artifact_complete((:'wf_job'::jsonb->>'job_id')::uuid,(:'wf_job'::jsonb->>'lease_token')::uuid,repeat('a',64),100,'jn-document-v1')->>'ready'='true','workflow: valid service completes artifact metadata');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_workflow_command('00000000-0000-4000-e000-000000000201',:'wf_doc',jsonb_build_object('kind','handoff','expected_revision',:'wf_revision'::integer,'reason','Envio ao caixa','publication_id',:'wf_publication'),gen_random_uuid());
RESET ROLE;
SELECT test.assert_true((SELECT 'payment'=ANY(private.wf_gate(p)) FROM private.document_publications p WHERE p.id=:'wf_publication'),'workflow: unpaid publication remains blocked');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT gen_random_uuid() AS wf_claim_key \gset
SELECT public.document_cash_claim('00000000-0000-4000-e000-000000000201',:'wf_publication',:'wf_claim_key');
SELECT public.document_cash_claim('00000000-0000-4000-e000-000000000201',:'wf_publication',:'wf_claim_key');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.charges c JOIN public.documents d ON d.office_id=c.office_id AND d.request_id=c.request_id WHERE d.id=:'wf_doc'),'workflow: cash claim and replay retain exactly one charge');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)','00000000-0000-4000-e000-000000000201',:'wf_publication'),'PT403','workflow: unpaid or unlinked client cannot download');
RESET ROLE;

-- Financial and portal journey: real canonical receipts/allocations and reversals.
RESET ROLE;
SELECT p.id AS wf_publication,p.document_id AS wf_doc,d.revision AS wf_revision,d.request_id AS wf_request,r.customer_id AS wf_customer FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE p.office_id='00000000-0000-4000-e000-000000000201' ORDER BY p.created_at LIMIT 1 \gset
SELECT '00000000-0000-4000-e000-000000000201' AS wf_office \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.customer_relation_command(:'wf_office',:'wf_customer','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000205","evidence":"Conferência presencial de fixture local"}',gen_random_uuid());
SELECT public.cash_configure(:'wf_office','{"kind":"unit","id":null,"expected_version":null,"name":"Caixa workflow","active":true}',gen_random_uuid())->'resource'->>'id' AS wf_unit \gset
SELECT public.cash_configure(:'wf_office',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Espécie workflow','active',true,'unit_id',:'wf_unit','type','cash'),gen_random_uuid())->'resource'->>'id' AS wf_account \gset
SELECT public.cash_configure(:'wf_office',jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Dinheiro workflow','active',true,'unit_id',:'wf_unit','type','cash','destination_account_id',:'wf_account'),gen_random_uuid())->'resource'->>'id' AS wf_method \gset
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000206',p FROM unnest(ARRAY['cash.read','cash.open','charges.read','charges.create','charges.adjust'])p ON CONFLICT DO NOTHING;
-- Stage a new unclaimed financial task, without altering document responsibility.
UPDATE private.document_cash_tasks SET claimed_by=NULL WHERE publication_id=:'wf_publication';
SELECT c.id AS wf_charge,a.balance_cents AS wf_due,a.version AS wf_charge_version FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE c.office_id=:'wf_office' AND c.request_id=:'wf_request' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_cash_claim(:'wf_office',:'wf_publication',gen_random_uuid());
SELECT public.cash_open(:'wf_office',:'wf_unit',:'wf_account',0,gen_random_uuid())->'sessions'->0->>'id' AS wf_session \gset
SELECT public.charges_view(:'wf_office',:'wf_request',1) AS wf_view \gset
SELECT test.assert_true(:'wf_view'::jsonb->'charge'->>'id'=:'wf_charge','workflow: delegated cashier can read canonical charge');
SELECT jsonb_build_object('kind','record','session_id',:'wf_session','expected_version',1,'idempotency_key',gen_random_uuid(),'evidence','Recebimento parcial conferido localmente','payment_method_id',:'wf_method','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',:'wf_charge','expected_charge_version',:'wf_charge_version'::integer,'amount_cents',1)),'presented_cents',1,'fee_cents',0,'settlement','not_applicable','settled_on',NULL,'external_reference',NULL) AS wf_payment_one \gset
SELECT public.payment_operate(:'wf_office',:'wf_payment_one');
SELECT public.payment_operate(:'wf_office',:'wf_payment_one');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.payment_allocations WHERE charge_id=:'wf_charge') AND(SELECT assignee_id='00000000-0000-4000-b000-000000000201' FROM public.requests WHERE id=:'wf_request'),'workflow: payment replay creates one allocation and preserves document responsible');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.assert_true(public.portal_documents_page(:'wf_office',1)->'items'->0->>'ready'='false','workflow: partial payment does not release portal');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'wf_office',:'wf_publication'),'PT403','workflow: partial payment blocks download');
RESET ROLE;
SELECT a.balance_cents AS wf_remaining,a.version AS wf_charge_version FROM private.charges_amounts(:'wf_office',:'wf_charge')a \gset
SELECT version AS wf_cash_version FROM private.cash_sessions WHERE id=:'wf_session' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.payment_operate(:'wf_office',jsonb_build_object('kind','record','session_id',:'wf_session','expected_version',:'wf_cash_version'::integer,'idempotency_key',gen_random_uuid(),'evidence','Quitação integral conferida localmente','payment_method_id',:'wf_method','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',:'wf_charge','expected_charge_version',:'wf_charge_version'::integer,'amount_cents',:'wf_remaining'::bigint)),'presented_cents',:'wf_remaining'::bigint,'fee_cents',0,'settlement','not_applicable','settled_on',NULL,'external_reference',NULL));
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.assert_true(public.portal_documents_page(:'wf_office',1)->'items'->0->>'ready'='true','workflow: full confirmed payment automatically releases portal');
SELECT test.assert_true(public.document_artifact_authorize(:'wf_office',:'wf_publication',false)->>'sha256'=repeat('a',64),'workflow: linked client authorized for exact preserved artifact');
RESET ROLE;
SELECT id AS wf_identity,version AS wf_identity_version FROM private.customer_relations WHERE office_id=:'wf_office' AND customer_id=:'wf_customer' AND membership_id='00000000-0000-4000-b000-000000000205' AND relation_type='identity' AND revoked_at IS NULL \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.customer_relation_command(:'wf_office',:'wf_customer','identity.revoke',jsonb_build_object('id',:'wf_identity','version',:'wf_identity_version'::integer),gen_random_uuid());
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.assert_true(public.portal_documents_page(:'wf_office',1)->>'total'='0','workflow: revoked identity hides even fully paid document');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'wf_office',:'wf_publication'),'PT403','workflow: revoked identity denies download');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.customer_relation_command(:'wf_office',:'wf_customer','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000205","evidence":"Nova conferência de fixture local"}',gen_random_uuid());
RESET ROLE;

RESET ROLE;
SELECT id AS wf_allocation FROM private.payment_allocations WHERE charge_id=:'wf_charge' AND amount_cents=1 ORDER BY id LIMIT 1 \gset
SELECT version AS wf_cash_version FROM private.cash_sessions WHERE id=:'wf_session' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.correction_operate(:'wf_office',jsonb_build_object('kind','reverse','session_id',:'wf_session','expected_version',:'wf_cash_version'::integer,'idempotency_key',gen_random_uuid(),'allocation_id',:'wf_allocation','refund_now',false,'amount_cents',1,'reason','Estorno de fixture local','evidence','Conferência do estorno local'));
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.assert_true(public.portal_documents_page(:'wf_office',1)->'items'->0->>'ready'='false','workflow: reversal automatically blocks portal again');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'wf_office',:'wf_publication'),'PT403','workflow: reversal blocks new artifact access');
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L::jsonb)',:'wf_office',:'wf_doc',jsonb_build_object('kind','prepare','expected_revision',:'wf_revision'::integer,'idempotency_key',gen_random_uuid())::text),'PT403','workflow: financial delegation does not grant document editing');
RESET ROLE;
