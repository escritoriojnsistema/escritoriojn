-- Fictional local fixtures only; all changes are rolled back.
RESET ROLE;
BEGIN;
\set ci_office '00000000-0000-4000-e000-000000000201'
UPDATE auth.sessions SET created_at=clock_timestamp(),not_after=NULL WHERE id='00000000-0000-4000-c000-000000000201';
DELETE FROM private.session_activities WHERE session_id='00000000-0000-4000-c000-000000000201';
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'category-'||n||'@example.test',now(),'fixture' FROM generate_series(361,362)n;
INSERT INTO auth.sessions(id,user_id)SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000361' AND '00000000-0000-4000-a000-000000000362';
INSERT INTO public.profiles(id,display_name)SELECT id,'Pessoa Fictícia Categoria' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000361' AND '00000000-0000-4000-a000-000000000362';
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,:'ci_office',('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'client' FROM generate_series(361,362)n;
INSERT INTO private.service_categories(office_id,name,execution_level,created_by)VALUES(:'ci_office','Formulário FICTÍCIO categoria',3,'00000000-0000-4000-a000-000000000201')RETURNING id AS ci_category \gset
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.category_intakes','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.category_intake_open(uuid,uuid,integer,jsonb,text,uuid)','EXECUTE'),'category: snapshots and anonymous opening closed');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000361","session_id":"00000000-0000-4000-c000-000000000361"}';
SELECT test.assert_true(public.category_intake_form(:'ci_office',:'ci_category',false)->>'enabled'='false','category: unpublished form exposes no invented defaults');
SELECT test.expect_error(format('SELECT public.category_intake_form(%L,%L,true)',:'ci_office',:'ci_category'),'PT403','category: client cannot manage category configuration');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT '{"expected_revision":0,"enabled":true,"instructions":"Orientação específica da categoria","fields":[{"key":"finalidade","label":"Finalidade","type":"text","required":true,"options":[]},{"key":"modalidade","label":"Modalidade","type":"select","required":true,"options":["Primeira","Segunda"]}],"documents":[{"key":"identidade","label":"Documento de identidade","required":true,"max_files":1,"max_bytes":2048,"mime_types":["application/pdf"],"classification":"identificacao"}],"reason":"Teste local de publicação"}'::jsonb AS ci_publish,gen_random_uuid() AS ci_publish_key \gset
SELECT test.assert_true(public.category_intake_publish(:'ci_office',:'ci_category',:'ci_publish',:'ci_publish_key')->>'revision'='1','category: authorized manager publishes category fields and named slots');
SELECT test.assert_true(public.category_intake_publish(:'ci_office',:'ci_category',:'ci_publish',:'ci_publish_key')->>'revision'='1','category: exact publication retry keeps revision');
SELECT test.expect_error(format('SELECT public.category_intake_publish(%L,%L,%L,gen_random_uuid())',:'ci_office',:'ci_category',jsonb_set(:'ci_publish'::jsonb,'{fields,1,key}','"finalidade"')::text),'PT422','category: duplicate keys rejected');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000361","session_id":"00000000-0000-4000-c000-000000000361"}';
SELECT test.assert_true(public.category_intake_form(:'ci_office',:'ci_category',false)->>'has_services'='false','category: empty service chooser is explicitly unavailable');
SELECT gen_random_uuid() AS ci_open_key \gset
SELECT public.category_intake_open(:'ci_office',:'ci_category',1,'{}','',:'ci_open_key') AS ci_open \gset
SELECT :'ci_open'::jsonb->>'request_id' AS ci_request \gset
SELECT test.assert_true(:'ci_open'::jsonb->>'draft'='true' AND :'ci_open'::jsonb->>'category_form'='true','category: preparation returns single protocol and category marker');
SELECT test.assert_true(public.category_intake_open(:'ci_office',:'ci_category',1,'{}','',:'ci_open_key')=:'ci_open'::jsonb,'category: exact opening retry reuses protocol');
SELECT test.assert_true(public.portal_request_resume33(:'ci_office',:'ci_open_key')->>'category_form'='true','category: existing nonce resume includes category marker');
SELECT test.expect_error(format('SELECT public.category_intake_command(%L,%L,1,%L,gen_random_uuid())',:'ci_office',:'ci_request','{"kind":"submit"}'),'PT422','category: required values block submit');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,1,%L,gen_random_uuid())',:'ci_office',:'ci_request','{"kind":"resubmit"}'),'PT422','category: legacy submit cannot bypass category fields');
SELECT public.category_intake_command(:'ci_office',:'ci_request',1,'{"kind":"save","answers":{"finalidade":"Teste local","modalidade":"Primeira"},"message":""}',gen_random_uuid()) AS ci_saved \gset
SELECT test.expect_error(format('SELECT public.category_intake_command(%L,%L,2,%L,gen_random_uuid())',:'ci_office',:'ci_request','{"kind":"submit"}'),'PT422','category: required named attachment blocks submit');
RESET ROLE;
INSERT INTO public.files(office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by)VALUES(:'ci_office',:'ci_request','identidade.pdf','application/pdf',1024,repeat('a',64),'identificacao','quarentena','00000000-0000-4000-a000-000000000361')RETURNING id AS ci_file \gset
SET ROLE authenticated;
SELECT public.category_intake_command(:'ci_office',:'ci_request',2,jsonb_build_object('kind','bind_file','slot_key','identidade','file_id',:'ci_file'),gen_random_uuid()) AS ci_bound \gset
SELECT test.assert_true(:'ci_bound'::jsonb#>>'{files,0,status}'='quarentena','category: binding preserves quarantine status');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000362","session_id":"00000000-0000-4000-c000-000000000362"}';
SELECT test.expect_error(format('SELECT public.category_intake_state(%L,%L)',:'ci_office',:'ci_request'),'PT404','category: other client cannot read answers or files by UUID');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.request_detail(:'ci_office',:'ci_request',1)#>>'{category_intake,answers,finalidade}'='Teste local','category: authorized staff detail reads effective category answers');
RESET ROLE;
SAVEPOINT ci_withdraw;
UPDATE private.category_intake_forms SET revision=2,enabled=false WHERE office_id=:'ci_office' AND category_id=:'ci_category';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000361","session_id":"00000000-0000-4000-c000-000000000361"}';
SELECT test.assert_true(public.category_intake_state(:'ci_office',:'ci_request')->>'can_submit'='false','category: withdrawn publication blocks old first send while preserving answers');
SELECT test.expect_error(format('SELECT public.category_intake_command(%L,%L,3,%L,gen_random_uuid())',:'ci_office',:'ci_request','{"kind":"submit"}'),'PT409','category: withdrawn first submission rejected');
RESET ROLE;
ROLLBACK TO ci_withdraw;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000361","session_id":"00000000-0000-4000-c000-000000000361"}';
SELECT gen_random_uuid() AS ci_send_key \gset
SELECT public.category_intake_command(:'ci_office',:'ci_request',3,'{"kind":"submit"}',:'ci_send_key') AS ci_sent \gset
SELECT test.assert_true(:'ci_sent'::jsonb->>'draft'='false','category: send dispatches same protocol through existing workflow');
SELECT test.assert_true(public.category_intake_command(:'ci_office',:'ci_request',3,'{"kind":"submit"}',:'ci_send_key')=:'ci_sent'::jsonb,'category: exact send retry does not duplicate dispatch');
RESET ROLE;
SELECT test.assert_true((SELECT status='quarentena' AND scanner_status='not_configured' FROM public.files WHERE id=:'ci_file'),'category: submission never marks attachment clean');
SELECT test.assert_true((SELECT count(*) FROM public.requests WHERE id=:'ci_request')=1 AND(SELECT count(*) FROM private.category_intake_revisions WHERE request_id=:'ci_request')=1,'category: one request and append-only answers revision retained');
ROLLBACK;
