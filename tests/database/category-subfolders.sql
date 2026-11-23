-- Final-schema fixture: category hierarchy, service mapping and exact form dispatch.
BEGIN;
\set office '00000000-0000-4000-e000-000000001941'
\set foreign_office '00000000-0000-4000-e000-000000001942'
INSERT INTO public.offices(id,name) VALUES (:'office','Escritório fictício de subpastas'),(:'foreign_office','Outro escritório fictício');
INSERT INTO auth.users(id,email_confirmed_at)
VALUES ('00000000-0000-4000-a000-000000001941',now()),('00000000-0000-4000-a000-000000001942',now());
INSERT INTO auth.sessions(id,user_id)
SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
WHERE id IN ('00000000-0000-4000-a000-000000001941','00000000-0000-4000-a000-000000001942');
INSERT INTO public.profiles(id,display_name)
SELECT id,'Pessoa fictícia' FROM auth.users
WHERE id IN ('00000000-0000-4000-a000-000000001941','00000000-0000-4000-a000-000000001942');
INSERT INTO public.memberships(office_id,user_id,role_code) VALUES
  (:'office','00000000-0000-4000-a000-000000001941','owner'),
  (:'office','00000000-0000-4000-a000-000000001942','client');
SELECT id AS rural FROM private.service_categories WHERE office_id=:'office' AND name='Rural' \gset
SELECT id AS legal FROM private.service_categories WHERE office_id=:'office' AND name='Jurídico' \gset
SELECT id AS docs FROM private.service_categories WHERE office_id=:'office' AND name='Documentos' \gset
SELECT id AS foreign_parent FROM private.service_categories WHERE office_id=:'foreign_office' AND name='Rural' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001941","session_id":"00000000-0000-4000-c000-000000001941"}';

SELECT jsonb_build_object('kind','create','name','Regularização','parent_id',:'rural','execution_level',2,'reason','Subpasta fictícia') AS create_folder,gen_random_uuid() AS create_key \gset
SELECT public.service_categories_command(:'office',:'create_folder',:'create_key') AS created \gset
SELECT x->>'id' AS folder FROM jsonb_array_elements(:'created'::jsonb->'items') x
WHERE x->>'parent_id'=:'rural' AND x->>'parent_name'='Rural' AND x->>'execution_level'='2' \gset
SELECT test.assert_true(public.service_categories_command(:'office',:'create_folder',:'create_key')=:'created'::jsonb,
  'subfolders: creation replay keeps identity');
SELECT test.expect_error(format('SELECT public.service_categories_command(%L,%L,gen_random_uuid())',:'office',
  (:'create_folder'::jsonb||jsonb_build_object('parent_id',:'folder'))::text),'PT422','subfolders: no third level');
SELECT test.expect_error(format('SELECT public.service_categories_command(%L,%L,gen_random_uuid())',:'office',
  (:'create_folder'::jsonb||jsonb_build_object('parent_id',:'foreign_parent'))::text),'PT422','subfolders: foreign parent rejected');
SELECT test.expect_error(format('SELECT public.service_categories_command(%L,%L,gen_random_uuid())',:'office',
  jsonb_build_object('kind','delete','category_id',:'rural','expected_revision',1,'reason','Fixture')::text),
  'PT409','subfolders: parent with active children cannot be archived');

SELECT public.service_categories_command(:'office',:'create_folder'::jsonb||jsonb_build_object('parent_id',:'legal'),gen_random_uuid()) AS second \gset
SELECT x->>'id' AS legal_folder FROM jsonb_array_elements(:'second'::jsonb->'items') x WHERE x->>'parent_id'=:'legal' \gset
SELECT public.service_categories_command(:'office',:'create_folder'::jsonb||jsonb_build_object('parent_id',:'docs'),gen_random_uuid()) AS doc_category \gset
SELECT test.assert_true(EXISTS(SELECT FROM jsonb_array_elements(:'doc_category'::jsonb->'items') x
 WHERE x->>'parent_id'=:'docs' AND x->>'is_documents'='true'),'subfolders: Documentos behavior is inherited');

SELECT '{"code":"RURAL-PASTA","name":"Serviço fictício","category":"Regularização","unit":"unidade","price_cents":100,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false,"settlement_required":false,"required_capabilities":["services.perform"],"fields":[],"checklist":[],"quantity_min":1,"quantity_max":100,"max_discount_bps":0,"max_surcharge_bps":0,"allow_courtesy":false,"allow_price_override":false}'::jsonb||jsonb_build_object('category_id',:'folder') AS definition \gset
SELECT public.service_create(:'office',:'definition','Fixture',gen_random_uuid()) AS service \gset
SELECT :'service'::jsonb->>'id' AS service_id \gset
SELECT test.assert_true(:'service'::jsonb#>>'{current,category_id}'=:'folder'
 AND :'service'::jsonb#>>'{current,category_parent_name}'='Rural','subfolders: explicit service identity despite duplicate label');
SELECT test.assert_true(public.request_service_options_by_category(:'office',:'folder','',1,5)->>'total'='1'
 AND public.request_service_options_by_category(:'office',:'legal_folder','',1,5)->>'total'='0',
 'subfolders: request service chooser filters before pagination');
SELECT jsonb_build_object('origin','presencial','category_id',:'folder','title','Manifestação fictícia','message','',
  'customer_id',null,'assignee_id',null,'priority','normal','priority_reason','','internal_note','',
  'items',jsonb_build_array(jsonb_build_object('service_id',:'service_id','quantity',1,'adjustment',
  '{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))) AS staff \gset
SELECT public.staff_category_request_create(:'office',:'staff',gen_random_uuid()) AS staff_request \gset
SELECT test.assert_true(:'staff_request'::jsonb->>'category_id'=:'folder' AND :'staff_request'::jsonb->>'execution_level'='2',
  'subfolders: staff opening uses leaf and its execution level');
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L,gen_random_uuid())',:'office',
  (:'staff'::jsonb||jsonb_build_object('category_id',:'legal_folder'))::text),'PT422','subfolders: same-name mismatched service rejected');
SELECT '{"expected_revision":0,"enabled":false,"instructions":"Orientação rural","fields":[{"key":"imovel","label":"Imóvel","type":"text","required":true,"options":[]}],"documents":[{"key":"matricula","label":"Matrícula","required":true,"max_files":1,"max_bytes":2048,"mime_types":["application/pdf"],"classification":"documento"}],"reason":"Fixture"}'::jsonb AS form \gset
SELECT public.category_intake_publish(:'office',:'folder',:'form',gen_random_uuid()) AS saved \gset
SELECT test.assert_true(:'saved'::jsonb->>'enabled'='false' AND :'saved'::jsonb#>>'{documents,0,key}'='matricula',
  'subfolders: fields and attachments can be saved without publishing');
SELECT public.category_intake_publish(:'office',:'folder',:'form'::jsonb||'{"expected_revision":1,"enabled":true}',gen_random_uuid()) AS published \gset
SELECT public.portal_service_publish33(:'office',:'service_id',jsonb_build_object('expected_revision',0,
  'version_id',:'service'::jsonb#>>'{current,id}','enabled',true,'instructions','','reason','Fixture'),gen_random_uuid()) AS service_publication \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001942","session_id":"00000000-0000-4000-c000-000000001942"}';
SELECT test.assert_true(public.category_intake_form(:'office',:'folder',false)#>>'{fields,0,key}'='imovel'
 AND public.category_intake_form(:'office',:'legal_folder',false)->>'enabled'='false',
 'subfolders: publication is independent across same-name folders');
SELECT public.category_intake_open(:'office',:'folder',2,'{"imovel":"Fictício"}','',gen_random_uuid()) AS portal_request \gset
SELECT test.assert_true(public.category_intake_state(:'office',(:'portal_request'::jsonb->>'request_id')::uuid)#>>'{documents,0,key}'='matricula',
  'subfolders: portal captures the selected attachment rules');
SELECT public.portal_service_form33(:'office',:'service_id') AS portal_service \gset
SELECT test.assert_true(:'portal_service'::jsonb->>'category_id'=:'folder'
  AND public.portal_services33(:'office',:'legal_folder','',1,5)->>'total'='0',
  'subfolders: public service follows the category ID');
SELECT public.portal_service_open33(:'office',jsonb_build_object('service_id',:'service_id',
 'version_id',:'portal_service'::jsonb->>'version_id','revision',:'portal_service'::jsonb->'revision',
 'answers','{}'::jsonb,'quantity',1,'message','','checklist_version',:'portal_service'::jsonb->'checklist_version'),
 gen_random_uuid()) AS booked_service \gset
SELECT test.assert_true(public.category_intake_state(:'office',(:'booked_service'::jsonb->>'request_id')::uuid)#>>'{documents,0,key}'='matricula',
  'subfolders: service booking loads the same form and required attachments');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001941","session_id":"00000000-0000-4000-c000-000000001941"}';
SELECT public.service_publish(:'office',:'service_id',:'definition'::jsonb||jsonb_build_object('category_id',:'legal_folder'),
  1,'Reclassificação fictícia',gen_random_uuid()) AS moved \gset
SELECT test.assert_true(:'moved'::jsonb#>>'{current,category_id}'=:'legal_folder'
  AND :'moved'::jsonb#>>'{versions,1,category_id}'=:'folder',
  'subfolders: editing a service changes its new version and preserves the previous one');
SELECT test.assert_true(public.request_detail(:'office',(:'staff_request'::jsonb->>'id')::uuid,1)->>'category_id'=:'folder',
  'subfolders: older request stays linked to its recorded category after service edit');
RESET ROLE;
ROLLBACK;
