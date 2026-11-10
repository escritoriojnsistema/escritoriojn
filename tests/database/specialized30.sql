RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.specialized_command30(uuid,uuid,jsonb,uuid)') IS NOT NULL,'30: specialized command exists');
BEGIN;
SELECT '00000000-0000-4000-e000-000000000201' AS o30 \gset
SELECT i.id AS source_i30,i.service_id AS s30 FROM public.request_items i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.office_id=:'o30' AND r.status NOT IN('concluido','cancelado') AND r.assignee_id='00000000-0000-4000-b000-000000000201' ORDER BY i.created_at,i.id LIMIT 1 \gset
INSERT INTO public.customers(id,office_id,kind,name,created_by)VALUES('30000000-0000-4000-8000-000000000001',:'o30','person','Cliente Especializado fictício','00000000-0000-4000-a000-000000000201');
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,idempotency_key,payload_digest,triaged_at)
VALUES(:'o30','AT-Especializado30','Especializado fictício30','portal','00000000-0000-4000-a000-000000000205','00000000-0000-4000-b000-000000000201','30000000-0000-4000-8000-000000000001','normal',gen_random_uuid(),'fixture',clock_timestamp()) RETURNING id AS r30 \gset
INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)SELECT office_id,:'r30',service_id,version_id,snapshot,fields,participant_ids,checklist FROM public.request_items WHERE id=:'source_i30' RETURNING id AS i30 \gset
UPDATE private.service_categories SET execution_level=3 WHERE office_id=:'o30' AND id IN(SELECT category_id FROM private.service_version_categories WHERE office_id=:'o30' AND service_id=:'s30');

INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000202',code FROM public.permissions WHERE code IN('foundation.access','rural.read','rural.read_all','rural.create','rural.parties.manage','rural.records.manage','customers.read','customers.update','customers.read_all','requests.read','requests.read_all','requests.create','requests.update','requests.transfer','files.read','files.upload','checklists.read','checklists.update','checklists.waive','checklists.manage','services.manage','specialized.read','specialized.manage','specialized.conduct') ON CONFLICT DO NOTHING;
SELECT coalesce(max(version),0) AS cv30 FROM private.checklist_model_versions WHERE office_id=:'o30' AND service_id=:'s30' AND scope='internal' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.checklists_publish(:'o30',:'s30',:'cv30','{"name":"Checklist especializado fictício","items":[{"key":"documento","label":"Documento de identificação","requirement":"required","condition":null}]}','Modelo fictício30',gen_random_uuid(),'internal');
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','configure','item_id',:'i30','service_kind','aposentadoria','expected_version',0),gen_random_uuid());
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','open','item_id',:'i30'),gen_random_uuid())->>'id' AS c30 \gset
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{case,stage}'='recebido','30: case captures existing request and checklist');
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','configure','item_id',:'i30','service_kind','juridico','expected_version',1),gen_random_uuid());
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{case,kind}'='aposentadoria','30: versioned configuration never rewrites existing case');
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"note","expected_version":1,"text":"ESTRATEGIA PRIVADA MEDICA30"}',gen_random_uuid());
SELECT public.files_begin_upload(:'o30',jsonb_build_object('request_id',:'r30','request_item_id',:'i30','name','medico-privado30.pdf','mime_type','application/pdf','size_bytes',100,'sha256',repeat('a',64),'classification','medico','idempotency_key',gen_random_uuid()::text),gen_random_uuid()) AS upload30 \gset
SELECT :'upload30'::jsonb#>>'{file,id}' AS f30,:'upload30'::jsonb->>'object_path' AS path30 \gset
SELECT test.assert_true(public.files_page(:'o30',:'r30',1,5)#>>'{items,0,classification}'='medico','30: explicitly capable owner receives medical metadata');
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.file_references WHERE file_id=:'f30' AND reference_kind='specialized30'),'30: restricted file protected from cleanup immediately');
SELECT test.expect_error(format('INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(%L,%L,%L)',:'o30',:'f30','checklist'),'PT403','30: sensitive file cannot become shared checklist/publication reference');
SELECT version AS rv30 FROM public.requests WHERE id=:'r30' \gset
SELECT id AS ci30 FROM private.checklist_instances WHERE office_id=:'o30' AND item_id=:'i30' \gset
SELECT id AS ce30 FROM private.checklist_entries WHERE office_id=:'o30' AND instance_id=:'ci30' ORDER BY position LIMIT 1 \gset
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,%L,%L,gen_random_uuid())',:'o30',:'r30',:'rv30','{"kind":"status","status":"concluido","reason":"Desvio indevido"}'),'PT403','30: generic request completion cannot skip specialized gates');
SELECT public.request_mutate(:'o30',:'r30',:'rv30','{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000202","reason":"Preparação pelo funcionário"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)->'notes'='[]'::jsonb AND public.specialized_state30(:'o30',:'r30',1)#>>'{case,can_prepare}'='true','30: assigned employee prepares without strategic notes');
SELECT test.assert_true(public.files_page(:'o30',:'r30',1,5)->>'total'='0','30: ordinary files capability never leaks medical metadata');
SELECT test.expect_error(format('SELECT public.files_download(%L,%L,gen_random_uuid())',:'o30',:'f30'),'PT404','30: direct download cannot bypass sensitive capability');
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,gen_random_uuid())',:'o30',:'r30','{"kind":"note","expected_version":2,"text":"forged"}'),'PT403','30: employee with conduct capability cannot perform reserved note action');
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,gen_random_uuid())',:'o30',:'r30','{"kind":"advance","expected_version":2,"stage":"em_analise"}'),'PT403','30: employee cannot conduct analysis before handoff');
SELECT jsonb_build_object('kind','handoff','expected_version',2,'owner_id','00000000-0000-4000-b000-000000000201') AS hand30,gen_random_uuid() AS hk30 \gset
SELECT public.specialized_command30(:'o30',:'r30',:'hand30',:'hk30');
SELECT test.assert_true(public.specialized_command30(:'o30',:'r30',:'hand30',:'hk30')->>'id'=:'c30','30: handoff retry does not repeat transfer');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT gen_random_uuid() AS analysis_key30 \gset
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"advance","expected_version":3,"stage":"em_analise"}',:'analysis_key30');
RESET ROLE;
DELETE FROM public.role_permissions WHERE role_code='owner' AND permission_code='specialized.conduct';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,%L)',:'o30',:'r30','{"kind":"advance","expected_version":3,"stage":"em_analise"}',:'analysis_key30'),'PT403','30: committed analysis retry rechecks revoked conduct authority');
RESET ROLE;
INSERT INTO public.role_permissions(role_code,permission_code)VALUES('owner','specialized.conduct');
SET ROLE authenticated;
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"external","expected_version":4,"reference":"REFERENCIA INTERNA30"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,gen_random_uuid())',:'o30',:'r30','{"kind":"deadline","expected_version":5,"type":"externo","label":"Prazo manual","due_on":"2026-12-10","source":"","responsible_id":"00000000-0000-4000-b000-000000000201","alert_on":"2026-12-09","checked_on":"2026-01-01"}'),'PT422','30: deadline requires source');
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"deadline","expected_version":5,"type":"externo","label":"Prazo conferido manualmente","due_on":"2026-12-10","source":"Documento oficial conferido pelo responsável","responsible_id":"00000000-0000-4000-b000-000000000201","alert_on":"2026-12-09","checked_on":"2026-01-01"}',gen_random_uuid());
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"complement","expected_version":6,"pending":"Enviar documento legível"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.request_detail(:'o30',:'r30',1) AS portal30 \gset
SELECT test.assert_true(:'portal30'::jsonb#>>'{specialized_progress,pending}'='Enviar documento legível' AND :'portal30' NOT LIKE '%ESTRATEGIA%' AND :'portal30' NOT LIKE '%medico-privado%' AND :'portal30' NOT LIKE '%REFERENCIA INTERNA%' AND :'portal30' NOT LIKE '%Documento oficial%','30: portal JSON excludes notes, medical data, references and deadlines');
SELECT test.assert_true(public.requests_page(:'o30','','mine','',1,3)#>>'{items,0,specialized_progress,stage}'='complementacao','30: portal list carries factual progress');
SELECT test.expect_error(format('SELECT public.specialized_state30(%L,%L,1)',:'o30',:'r30'),'PT403','30: client cannot call internal state');
SELECT test.assert_true(public.files_page(:'o30',:'r30',1,5)->>'total'='0','30: client receives no medical metadata');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"handoff","expected_version":7,"owner_id":"00000000-0000-4000-b000-000000000201"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"advance","expected_version":8,"stage":"em_analise"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,gen_random_uuid())',:'o30',:'r30','{"kind":"complete","expected_version":9}'),'PT409','30: pending checklist and deadlines prevent internal completion');
SELECT public.checklists_update(:'o30',:'ce30',1,'dispensado',NULL,'Dispensa fictícia justificada no laboratório30',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,gen_random_uuid())',:'o30',:'r30','{"kind":"complete","expected_version":9}'),'PT409','30: open deadline independently prevents completion');
RESET ROLE;
SELECT id AS deadline30 FROM private.deadlines WHERE office_id=:'o30' AND case_id=:'c30' \gset
SET ROLE authenticated;
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','finish_deadline','expected_version',9,'deadline_id',:'deadline30'),gen_random_uuid());
SELECT public.expense_operate(:'o30',jsonb_build_object('kind','create','idempotency_key',gen_random_uuid(),'category','Externa fictícia','payee','Prestador fictício','description','Despesa externa fictícia30','due_date','2026-12-10','amount_cents',100,'evidence','Evidência fictícia do laboratório30')) AS expense_result30 \gset
SELECT :'expense_result30'::jsonb#>>'{expense,id}' AS expense30 \gset
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{financial,options,0,id}'=:'expense30','30: existing financial expense is an authorized linking option');
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,gen_random_uuid())',:'o30',:'r30',jsonb_build_object('kind','expense','expected_version',10,'expense_id',:'expense30','expected_expense_version',99)::text),'PT409','30: stale expense version cannot link');
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','expense','expected_version',10,'expense_id',:'expense30','expected_expense_version',1),gen_random_uuid());
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{financial,expenses,0,status}'='pending','30: linked expense preserves real pending status without approval/payment');
SELECT '{"kind":"complete","expected_version":11}' AS done30,gen_random_uuid() AS dk30 \gset
SELECT public.specialized_command30(:'o30',:'r30',:'done30',:'dk30');
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{case,stage}'='concluido','30: responsible completes internally after checklist and deadlines');
RESET ROLE;
SELECT test.assert_true((SELECT status<>'concluido' FROM public.requests WHERE id=:'r30') AND(SELECT status='aguardando_upload' FROM public.files WHERE id=:'f30'),'30: no automatic request closure, payment, approval, release or delivery');
INSERT INTO auth.sessions(id,user_id)VALUES('30000000-0000-4000-8000-000000000099','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"30000000-0000-4000-8000-000000000099"}';
SELECT test.expect_error(format('SELECT public.specialized_command30(%L,%L,%L,%L)',:'o30',:'r30',:'done30',:'dk30'),'PT403','30: retry cannot cross sessions');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
RESET ROLE;
DELETE FROM public.role_permissions WHERE role_code='owner' AND permission_code='specialized.sensitive';
SET ROLE authenticated;
SELECT test.assert_true(public.files_page(:'o30',:'r30',1,5)->>'total'='0' AND public.specialized_state30(:'o30',:'r30',1)->'notes'='[]'::jsonb,'30: revoking sensitive capability hides notes and medical metadata immediately');
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.specialized_cases','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.specialized_command30(uuid,uuid,jsonb,uuid)','EXECUTE'),'30: RLS ACL and anonymous barriers closed');
ROLLBACK;
SELECT 'SCHEMA30:'||jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid))) ORDER BY p.oid::regprocedure::text)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND(p.proname LIKE 'specialized_%30' OR p.proname IN('specialized_guard30','request_summary','files_file_json','files_begin_upload','files_download','files_storage_allowed','files_page','files_process_claim'));
