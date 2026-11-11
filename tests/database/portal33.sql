-- Exclusively local fictional users/catalog. No hosted data or approvals are invented.
RESET ROLE;
BEGIN;
SELECT test.assert_true(to_regprocedure('public.portal_service_open33(uuid,jsonb,uuid)') IS NOT NULL,'33: digital service intake is connected to the database API');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.service_intakes33','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.portal_service_open33(uuid,jsonb,uuid)','EXECUTE'),'33: private snapshots and anonymous RPC closed');
UPDATE auth.sessions SET created_at=clock_timestamp(),not_after=NULL WHERE id='00000000-0000-4000-c000-000000000201';
DELETE FROM private.session_activities WHERE session_id='00000000-0000-4000-c000-000000000201';
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'portal33-'||n||'@example.test',now(),'fixture' FROM generate_series(331,332)n;
INSERT INTO auth.sessions(id,user_id)SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000331' AND '00000000-0000-4000-a000-000000000332';
INSERT INTO public.profiles(id,display_name)SELECT id,'Pessoa Fictícia33' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000331' AND '00000000-0000-4000-a000-000000000332';
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000201',('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'client' FROM generate_series(331,332)n;
\set o33 '00000000-0000-4000-e000-000000000201'
INSERT INTO private.service_categories(office_id,name,execution_level,created_by)VALUES(:'o33','Categoria FICTÍCIA33',3,'00000000-0000-4000-a000-000000000201')RETURNING id AS cat33 \gset
INSERT INTO public.services(office_id,code,created_by)VALUES(:'o33','FICTICIO33','00000000-0000-4000-a000-000000000201')RETURNING id AS service33 \gset
INSERT INTO public.service_versions(office_id,service_id,number,definition,effective_from,created_by,reason)
 SELECT :'o33',:'service33',1,private.services_normalize_input(definition||jsonb_build_object('code','FICTICIO33','name','Serviço FICTÍCIO33','category','Categoria FICTÍCIA33','price_cents',500,'person_required',true,'participants_min',0,'signature_required',false,'fields','[{"key":"finalidade","label":"Finalidade","type":"text","required":true},{"key":"emissao","label":"Emissão","type":"date","required":true}]'::jsonb,'checklist','["Documento legível33"]'::jsonb,'quantity_min',1,'quantity_max',3,'effective_from',NULL)),clock_timestamp()-interval '1 day','00000000-0000-4000-a000-000000000201','Fixture exclusivamente local33'
 FROM public.service_versions WHERE office_id=:'o33' ORDER BY created_at LIMIT 1 RETURNING id AS version33 \gset
INSERT INTO private.checklist_model_versions(office_id,service_id,scope,version,definition,reason,actor_id)VALUES
(:'o33',:'service33','client',1,'{"name":"Documentos cliente33","items":[{"key":"comprovante","label":"Comprovante cliente33","requirement":"required","condition":null}]}','Fixture local33','00000000-0000-4000-a000-000000000201'),
(:'o33',:'service33','internal',1,'{"name":"INTERNO SECRETO33","items":[{"key":"strategia","label":"SEGREDO INTERNO33","requirement":"required","condition":null}]}','Fixture local33','00000000-0000-4000-a000-000000000201');
UPDATE private.document_presence SET last_seen=clock_timestamp()-interval '1 day' WHERE office_id=:'o33';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000331","session_id":"00000000-0000-4000-c000-000000000331"}';
SELECT test.assert_true(public.portal_services33(:'o33',:'cat33','',1,3)->>'total'='0','33: internal service is not exposed without explicit publication');
SELECT test.expect_error(format('SELECT public.portal_service_manage33(%L,%L)',:'o33',:'service33'),'PT403','33: client does not manage public forms');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT jsonb_build_object('expected_revision',0,'version_id',:'version33','enabled',true,'instructions','Instrução pública33','reason','Publicação FICTÍCIA local33') AS publish33,gen_random_uuid() AS publishkey33 \gset
SELECT test.assert_true(public.portal_service_publish33(:'o33',:'service33',:'publish33',:'publishkey33')->>'enabled'='true','33: authorized service manager publishes exact reviewed version');
SELECT test.assert_true(public.portal_service_publish33(:'o33',:'service33',:'publish33',:'publishkey33')->>'revision'='1','33: publish retry does not create another revision');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000331","session_id":"00000000-0000-4000-c000-000000000331"}';
SELECT public.portal_service_form33(:'o33',:'service33') AS form33 \gset
SELECT test.assert_true(:'form33' NOT LIKE '%SEGREDO%' AND :'form33' LIKE '%Comprovante cliente33%' AND :'form33' NOT LIKE '%required_capabilities%','33: only customer checklist and public fields cross API boundary');
SELECT jsonb_build_object('service_id',:'service33','version_id',:'version33','revision',1,'quantity',2,'message','','checklist_version',1,'answers',jsonb_build_object('finalidade','Finalidade FICTÍCIA33','emissao','2026-11-11')) AS open33,gen_random_uuid() AS key33 \gset
SELECT test.expect_error(format('SELECT public.portal_service_open33(%L,%L,gen_random_uuid())',:'o33',(:'open33'::jsonb||'{"price_cents":1}'::jsonb)::text),'PT422','33: arbitrary price is refused');
SELECT test.expect_error(format('SELECT public.portal_service_open33(%L,%L,gen_random_uuid())',:'o33',(:'open33'::jsonb||'{"assignee_id":"00000000-0000-4000-b000-000000000201"}'::jsonb)::text),'PT422','33: reserved assignee is refused');
SELECT public.portal_service_open33(:'o33',:'open33',:'key33') AS opened33 \gset
SELECT :'opened33'::jsonb->>'request_id' AS r33 \gset
SELECT test.assert_true(:'opened33'::jsonb->>'draft'='true' AND :'opened33'::jsonb->>'waiting'='false','33: preparation is not announced as queued or returned');
SELECT test.assert_true(public.portal_service_open33(:'o33',:'open33',:'key33')=:'opened33'::jsonb,'33: exact opening retry returns the same protocol');
SELECT test.expect_error(format('SELECT public.portal_service_open33(%L,%L,gen_random_uuid())',:'o33',:'open33'),'PT409','33: different nonce cannot duplicate equivalent recent opening');
SELECT test.assert_true(public.portal_request_resume33(:'o33',:'key33')->>'request_id'=:'r33','33: refresh resumes own protocol from nonce only');
RESET ROLE;
SAVEPOINT withdrawn33;
UPDATE private.portal_service_forms33 SET enabled=false,revision=revision+1 WHERE office_id=:'o33' AND service_id=:'service33';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.portal_service_open33(%L,%L,%L)',:'o33',:'open33',:'key33'),'PT409','33: draft open retry cannot bypass publication withdrawal');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,1,%L,gen_random_uuid())',:'o33',:'r33','{"kind":"resubmit"}'),'PT409','33: withdrawn publication blocks first submission without repricing old item');
SELECT test.assert_true(public.portal_request_state(:'o33',:'r33')->>'can_resubmit'='false','33: unavailable draft does not offer send');
RESET ROLE;
ROLLBACK TO withdrawn33;
SET ROLE authenticated;
SELECT public.portal_request_state(:'o33',:'r33') AS state33 \gset
SELECT test.assert_true(:'state33'::jsonb#>>'{inputs,0,total_cents}'='1000' AND :'state33'::jsonb#>>'{inputs,0,answers,_s33.finalidade}'='Finalidade FICTÍCIA33','33: server captures catalog price and typed service answers');
SELECT :'state33'::jsonb#>>'{inputs,0,item_id}' AS item33 \gset
SELECT jsonb_build_object('kind','save','title','Serviço FICTÍCIO33','message','','inputs',jsonb_build_array(jsonb_build_object('item_id',:'item33','answers',jsonb_build_object('_s33.finalidade','Corrigido33','_s33.emissao','2026-11-12')))) AS save33,gen_random_uuid() AS savekey33 \gset
SELECT public.portal_request_command(:'o33',:'r33',(:'state33'::jsonb->>'version')::integer,:'save33',:'savekey33') AS saved33 \gset
SELECT test.assert_true(public.portal_request_command(:'o33',:'r33',(:'state33'::jsonb->>'version')::integer,:'save33',:'savekey33')=:'saved33'::jsonb,'33: exact complement retry is reconciled without another edit');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,%s,%L,%L)',:'o33',:'r33',(:'state33'::jsonb->>'version')::integer,jsonb_set(:'save33'::jsonb,'{inputs,0,answers,_s33.finalidade}','"forjado33"')::text,:'savekey33'),'PT409','33: same command key cannot alter service answers hidden from legacy payload');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,%s,%L,gen_random_uuid())',:'o33',:'r33',(:'saved33'::jsonb->>'version')::integer,jsonb_set(:'save33'::jsonb,'{inputs,0,answers,_s33.emissao}','"2026-02-30"')::text),'PT422','33: complement refuses impossible date');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000332","session_id":"00000000-0000-4000-c000-000000000332"}';
SELECT test.assert_true(public.portal_request_resume33(:'o33',:'key33')='null'::jsonb OR public.portal_request_resume33(:'o33',:'key33') IS NULL,'33: another account with nonce does not infer another protocol');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)',:'o33',:'r33'),'PT404','33: another client UUID cannot read the draft');
RESET ROLE;
SELECT test.assert_true((SELECT assignee_id IS NULL AND status='aguardando_cliente' FROM public.requests WHERE id=:'r33') AND NOT EXISTS(SELECT FROM private.request_history WHERE request_id=:'r33' AND kind='transfer'),'33: preparation never dispatches early');
SELECT test.assert_true((SELECT fields->>'finalidade' FROM public.request_items WHERE id=:'item33')='Finalidade FICTÍCIA33','33: original item snapshot remains immutable after complement');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.request_detail(:'o33',:'r33',1)#>>'{items,0,fields,finalidade}'='Corrigido33','33: authorized office reads effective complemented values in original attendance detail');
SELECT test.assert_true(public.requests_page(:'o33','Serviço FICTÍCIO33','queue','',1,3)->>'total'='0','33: preparation is absent from operational queue until client sends');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000331","session_id":"00000000-0000-4000-c000-000000000331"}';
SELECT gen_random_uuid() AS sendkey33 \gset
SELECT public.portal_request_command(:'o33',:'r33',(:'saved33'::jsonb->>'version')::integer,'{"kind":"resubmit"}',:'sendkey33') AS sent33 \gset
SELECT test.assert_true(:'sent33'::jsonb->>'draft'='false','33: confirmation sends the same protocol to existing queue');
SELECT test.assert_true(public.portal_request_command(:'o33',:'r33',(:'saved33'::jsonb->>'version')::integer,'{"kind":"resubmit"}',:'sendkey33')=:'sent33'::jsonb,'33: send retry does not duplicate dispatch');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.request_history WHERE request_id=:'r33' AND kind='status' AND reason='Enviado pelo cliente')=1,'33: first submission has one explicit send event');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.checklist_entries e JOIN private.checklist_instances i ON i.id=e.instance_id WHERE i.request_id=:'r33' AND e.status<>'pendente'),'33: neither form nor upload declaration approves checklist');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000332","session_id":"00000000-0000-4000-c000-000000000332"}';
SELECT public.categorized_request_create(:'o33',jsonb_build_object('origin','portal','title','Limite FICTÍCIO33 '||n,'message','Pedido exclusivo do teste de abuso '||n,'category_id',:'cat33'),gen_random_uuid()) FROM generate_series(1,20)n;
SELECT test.expect_error(format('SELECT public.categorized_request_create(%L,%L,gen_random_uuid())',:'o33',jsonb_build_object('origin','portal','title','Excesso33','message','Acima do limite local33','category_id',:'cat33')::text),'PT429','33: legacy category RPC cannot bypass transactional opening limit');
SELECT test.expect_error(format('SELECT public.portal_service_open33(%L,%L,gen_random_uuid())',:'o33',:'open33'),'PT429','33: new service RPC shares the same opening quota');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.portal_request_limits33 WHERE office_id=:'o33' AND actor_id='00000000-0000-4000-a000-000000000332')=20,'33: denied openings do not consume or invent another request');
ROLLBACK;
