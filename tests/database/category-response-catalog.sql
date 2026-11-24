BEGIN;
\set office '00000000-0000-4000-e000-000000001971'
INSERT INTO public.offices(id,name) VALUES (:'office','Escritório fictício de catálogo');
INSERT INTO auth.users(id,email_confirmed_at)
VALUES ('00000000-0000-4000-a000-000000001971',now()),('00000000-0000-4000-a000-000000001972',now());
INSERT INTO auth.sessions(id,user_id)
SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
WHERE id IN ('00000000-0000-4000-a000-000000001971','00000000-0000-4000-a000-000000001972');
INSERT INTO public.profiles(id,display_name)
SELECT id,'Pessoa fictícia' FROM auth.users
WHERE id IN ('00000000-0000-4000-a000-000000001971','00000000-0000-4000-a000-000000001972');
INSERT INTO public.memberships(office_id,user_id,role_code) VALUES
  (:'office','00000000-0000-4000-a000-000000001971','owner'),
  (:'office','00000000-0000-4000-a000-000000001972','client');
SELECT id AS rural FROM private.service_categories WHERE office_id=:'office' AND name='Rural' \gset
SELECT id AS legal FROM private.service_categories WHERE office_id=:'office' AND name='Jurídico' \gset
SELECT gen_random_uuid() AS key, '{"kind":"model","option":{"name":"Registro fictício","mask":"AAAA/000"},"previous":null}' AS model \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001971","session_id":"00000000-0000-4000-c000-000000001971"}';
SELECT test.assert_true(public.category_response_option_save(:'office',:'rural',:'model',:'key')#>>'{models,0,mask}'='AAAA/000',
  'response catalog: model saved without a form');
SELECT test.assert_true(public.category_response_option_save(:'office',:'rural',:'model',:'key')#>>'{models,0,mask}'='AAAA/000',
  'response catalog: identical retry is idempotent');
SELECT test.assert_true(public.category_response_option_save(:'office',:'rural','{"kind":"type","option":{"name":"Identificação rural","type":"text"},"previous":null}',gen_random_uuid())#>>'{types,0,name}'='Identificação rural',
  'response catalog: type saved without a form');
SELECT test.assert_true(public.category_response_option_save(:'office',:'rural','{"kind":"model","option":{"name":"Registro atualizado","mask":"000-00"},"previous":{"name":"Registro fictício","mask":"AAAA/000"}}',gen_random_uuid())#>>'{models,0,name}'='Registro atualizado',
  'response catalog: edit updates the category definition');
SELECT test.expect_error(format('SELECT public.category_response_option_save(%L,%L,%L,gen_random_uuid())',:'office',:'rural',
  '{"kind":"model","option":{"name":"Registro atualizado","mask":"000-00"},"previous":{"name":"Registro fictício","mask":"AAAA/000"}}'),
  'PT409','response catalog: stale edit rejected');
SELECT test.assert_true(public.category_intake_form(:'office',:'legal',true)#>'{response_options,models}'='[]'::jsonb,
  'response catalog: other category cannot see saved options');

SELECT public.category_intake_publish(:'office',:'rural',jsonb_build_object('expected_revision',0,'enabled',true,'instructions','','fields',
  '[{"key":"registro","label":"Registro","type":"text","options":[],"required":true,"response_name":"Identificação rural","model":{"name":"Registro atualizado","mask":"000-00"}}]'::jsonb,
  'documents','[]'::jsonb,'reason','Fixture'),gen_random_uuid()) AS saved \gset
SELECT test.assert_true(:'saved'::jsonb->>'enabled'='true','response catalog: form published with associated model');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001972","session_id":"00000000-0000-4000-c000-000000001972"}';
SELECT test.assert_true(public.category_intake_form(:'office',:'rural',false)->>'enabled'='true'
  AND public.category_intake_form(:'office',:'rural',false)#>>'{fields,0,model,mask}'='000-00'
  AND NOT(public.category_intake_form(:'office',:'rural',false)?'response_options'),
  'response catalog: customer sees published fields only, not administrative catalog');
SELECT test.expect_error(format('SELECT public.category_response_option_save(%L,%L,%L,gen_random_uuid())',:'office',:'rural',:'model'),
  'PT403','response catalog: customer cannot save a type or model');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001971","session_id":"00000000-0000-4000-c000-000000001971"}';
SELECT public.category_intake_publish(:'office',:'rural','{"expected_revision":1,"enabled":false,"instructions":"","fields":[],"documents":[],"reason":"Fixture"}',gen_random_uuid()) AS nofields \gset
SELECT test.assert_true(:'nofields'::jsonb#>>'{response_options,models,0,name}'='Registro atualizado'
 AND :'nofields'::jsonb#>>'{response_options,types,0,name}'='Identificação rural',
 'response catalog: deleting source field does not remove model or type');
RESET ROLE;
ROLLBACK;
