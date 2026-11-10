-- Disposable local fixtures only. No hosted users, grants or business data.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.rural_workflow_command29(uuid,uuid,jsonb,uuid)') IS NOT NULL,'29: workflow RPC exists');
BEGIN;
SELECT '00000000-0000-4000-e000-000000000201' AS o29 \gset
SELECT i.id AS source_i29,i.service_id AS s29 FROM public.request_items i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.office_id=:'o29' AND r.status NOT IN('concluido','cancelado') AND r.assignee_id='00000000-0000-4000-b000-000000000201' ORDER BY i.created_at,i.id LIMIT 1 \gset
INSERT INTO public.customers(id,office_id,kind,name,created_by)VALUES('29000000-0000-4000-8000-000000000001',:'o29','person','Cliente CAR fictício','00000000-0000-4000-a000-000000000201');
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,idempotency_key,payload_digest,triaged_at)
VALUES(:'o29','AT-CAR29','CAR fictício29','portal','00000000-0000-4000-a000-000000000205','00000000-0000-4000-b000-000000000201','29000000-0000-4000-8000-000000000001','normal',gen_random_uuid(),'fixture',clock_timestamp()) RETURNING id AS r29 \gset
INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)SELECT office_id,:'r29',service_id,version_id,snapshot,fields,participant_ids,checklist FROM public.request_items WHERE id=:'source_i29' RETURNING id AS i29 \gset
UPDATE private.service_categories SET execution_level=3 WHERE office_id=:'o29' AND id IN(SELECT category_id FROM private.service_version_categories WHERE office_id=:'o29' AND service_id=:'s29');

INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000202',code FROM public.permissions WHERE code IN('foundation.access','rural.read','rural.read_all','rural.create','rural.parties.manage','rural.records.manage','customers.read','customers.update','customers.read_all','requests.read','requests.read_all','requests.create','requests.update','requests.transfer','files.read','files.upload','checklists.read','checklists.update','checklists.waive','checklists.manage','services.manage') ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.rural_command27(:'o29',NULL,'{"kind":"create","customer_id":"29000000-0000-4000-8000-000000000001","name":"Imóvel CAR29","municipality":"Cidade teste","state":"MG","location":"Zona rural","identifiers":{}}',gen_random_uuid())->>'id' AS p29 \gset
RESET ROLE;
INSERT INTO private.property_records27(office_id,property_id,request_id,created_by)VALUES(:'o29',:'p29',:'r29','00000000-0000-4000-a000-000000000201');
SELECT coalesce(max(version),0) AS cv29 FROM private.checklist_model_versions WHERE office_id=:'o29' AND service_id=:'s29' AND scope='internal' \gset
SET ROLE authenticated;
SELECT public.checklists_publish(:'o29',:'s29',:'cv29','{"name":"Checklist CAR fictício","items":[{"key":"documento","label":"Documento de identificação","requirement":"required","condition":null}]}','Modelo fictício29',gen_random_uuid(),'internal');
SELECT public.rural_workflow_command29(:'o29',:'r29',jsonb_build_object('kind','configure','item_id',:'i29','service_kind','CAR','expected_version',0),gen_random_uuid());
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='rural.read_all';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.assert_true(jsonb_array_length(public.rural_workflow_state29(:'o29',:'r29',1)->'properties')=0 AND public.rural_workflow_state29(:'o29',:'r29',1)->>'can_open'='false','29: customers.read_all alone never widens rural scope; reader cannot open');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000202','rural.read_all');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.rural_workflow_command29(:'o29',:'r29',jsonb_build_object('kind','open','item_id',:'i29','property_id',:'p29'),gen_random_uuid())->>'id' AS c29 \gset
SELECT test.assert_true(public.rural_workflow_state29(:'o29',:'r29',1)#>>'{case,stage}'='recebido','29: open uses existing request and checklist');
SELECT public.rural_workflow_command29(:'o29',:'r29',jsonb_build_object('kind','configure','item_id',:'i29','service_kind','CCIR','expected_version',1),gen_random_uuid());
SELECT test.assert_true(public.rural_workflow_state29(:'o29',:'r29',1)#>>'{case,kind}'='CAR','29: later service configuration never rewrites captured CAR case');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,(SELECT version FROM public.requests WHERE id=%L),%L,gen_random_uuid())',:'o29',:'r29',:'r29','{"kind":"status","status":"concluido","reason":"Tentativa de desvio"}'),'42501','29: raw request not exposed');
RESET ROLE;
SELECT version AS rv29 FROM public.requests WHERE id=:'r29' \gset
SELECT id AS ci29 FROM private.checklist_instances WHERE office_id=:'o29' AND item_id=:'i29' \gset
SELECT id AS ce29 FROM private.checklist_entries WHERE office_id=:'o29' AND instance_id=:'ci29' ORDER BY position LIMIT 1 \gset
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,%L,%L,gen_random_uuid())',:'o29',:'r29',:'rv29','{"kind":"status","status":"concluido","reason":"Tentativa de desvio"}'),'PT403','29: generic endpoint cannot skip owner result');
SELECT public.request_mutate(:'o29',:'r29',:'rv29','{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000202","reason":"Funcionário organiza"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,gen_random_uuid())',:'o29',:'r29','{"kind":"advance","expected_version":1,"stage":"em_analise"}'),'PT403','29: employee with ALL capabilities cannot execute owner reserved action');
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,gen_random_uuid())',:'o29',:'r29',jsonb_build_object('kind','configure','item_id',:'i29','service_kind','CCIR','expected_version',1)::text),'PT403','29: employee cannot reconfigure service');
SELECT jsonb_build_object('kind','handoff','expected_version',1,'owner_id','00000000-0000-4000-b000-000000000201') AS hand29,gen_random_uuid() AS hk29 \gset
SELECT public.rural_workflow_command29(:'o29',:'r29',:'hand29',:'hk29');
SELECT test.assert_true(public.rural_workflow_command29(:'o29',:'r29',:'hand29',:'hk29')->>'id'=:'c29','29: handoff retry works for former responsible without double transfer');
SELECT test.assert_true(public.rural_workflow_state29(:'o29',:'r29',1)#>>'{case,can_reserved}'='false','29: following employee cannot execute reserved actions');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.rural_workflow_command29(:'o29',:'r29','{"kind":"advance","expected_version":2,"stage":"em_analise"}',gen_random_uuid());
SELECT public.rural_workflow_command29(:'o29',:'r29','{"kind":"complement","expected_version":3,"pending":"Enviar documento legível; pendência compartilhada"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.request_detail(:'o29',:'r29',1) AS portal29 \gset
SELECT test.assert_true(public.requests_page(:'o29','','mine','',1,3)#>>'{items,0,rural_progress,stage}'='complementacao','29: portal list also shows actual workflow progress');
SELECT test.assert_true(:'portal29'::jsonb#>>'{rural_progress,pending}'='Enviar documento legível; pendência compartilhada' AND NOT(:'portal29'::jsonb->'rural_progress' ? 'result_file_id') AND NOT(:'portal29'::jsonb->'rural_progress' ? 'property_name') AND NOT(:'portal29'::jsonb ? 'items'),'29: own portal receives only factual progress and shared pending');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.rural_workflow_command29(:'o29',:'r29','{"kind":"handoff","expected_version":4,"owner_id":"00000000-0000-4000-b000-000000000201"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.rural_workflow_command29(:'o29',:'r29','{"kind":"advance","expected_version":5,"stage":"em_analise"}',gen_random_uuid());
SELECT public.rural_workflow_command29(:'o29',:'r29','{"kind":"advance","expected_version":6,"stage":"em_preparacao"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,gen_random_uuid())',:'o29',:'r29','{"kind":"complete","expected_version":7,"external_reference":"Resultado externo informado","file_id":"29000000-0000-4000-8000-000000000002"}'),'PT409','29: pending required checklist blocks internal completion');
RESET ROLE;
INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by)VALUES('29000000-0000-4000-8000-000000000002',:'o29',:'r29','resultado-ficticio29.pdf','application/pdf',100,repeat('a',64),'documento','quarentena','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
-- Use official waiver with justification, never mark quarantine clean.
SELECT public.checklists_update(:'o29',:'ce29',1,'dispensado',NULL,'Dispensa fictícia justificada no laboratório',gen_random_uuid());
SELECT jsonb_build_object('kind','complete','expected_version',7,'external_reference','Resultado externo informado','file_id','29000000-0000-4000-8000-000000000002') AS done29,gen_random_uuid() AS dk29 \gset
RESET ROLE;
INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by)SELECT '29000000-0000-4000-8000-000000000003',:'o29',request_id,'outro-pedido29.pdf','application/pdf',100,repeat('b',64),'documento','quarentena','00000000-0000-4000-a000-000000000201' FROM public.request_items WHERE id=:'source_i29';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,gen_random_uuid())',:'o29',:'r29',(:'done29'::jsonb||'{"file_id":"29000000-0000-4000-8000-000000000003"}')::text),'PT403','29: external result cannot use another request file');
SELECT public.rural_workflow_command29(:'o29',:'r29',:'done29',:'dk29');
SELECT test.assert_true(public.rural_workflow_state29(:'o29',:'r29',1)#>>'{case,stage}'='concluido','29: owner concludes only after evidence and required checklist');
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,%L)',:'o29',:'r29',(:'done29'::jsonb||'{"external_reference":"Outra referência"}')::text,:'dk29'),'PT409','29: retry cannot change body');
RESET ROLE;
INSERT INTO auth.sessions(id,user_id)VALUES('29000000-0000-4000-8000-000000000099','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"29000000-0000-4000-8000-000000000099"}';
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,%L)',:'o29',:'r29',:'done29',:'dk29'),'PT403','29: retry cannot move to another session');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.rural_workflow_state29(%L,%L,1)',:'o29',:'r29'),'PT403','29: portal cannot call staff workflow');
RESET ROLE;
SELECT test.assert_true((SELECT status='quarentena' FROM public.files WHERE id='29000000-0000-4000-8000-000000000002') AND EXISTS(SELECT FROM private.file_references WHERE file_id='29000000-0000-4000-8000-000000000002' AND reference_kind='rural29'),'29: result is protected but never releases quarantine');
SELECT test.assert_true((SELECT status<>'concluido' FROM public.requests WHERE id=:'r29'),'29: completion does not pay, approve or deliver');
DELETE FROM public.role_permissions WHERE role_code='owner' AND permission_code='files.read';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.rural_workflow_command29(%L,%L,%L,%L)',:'o29',:'r29',:'done29',:'dk29'),'PT403','29: committed result retry rechecks revoked capability');
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.rural_cases29','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.rural_workflow_command29(uuid,uuid,jsonb,uuid)','EXECUTE'),'29: RLS ACL and anonymous barrier closed');
ROLLBACK;
SELECT 'SCHEMA29:'||jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('rural_request29','rural_workflow_state29','rural_workflow_command29','rural_close_guard29','rural_case_guard29','rural_progress29','request_summary');
