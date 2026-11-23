BEGIN;
SELECT '[{"key":"doc","label":"Identificação","type":"cpf_cnpj","required":true,"options":[]},
 {"key":"cib","label":"Imóvel","type":"text","required":true,"options":[],"response_name":"Registro de imóvel","model":{"name":"CIB","mask":"*******-0"}}]' AS fields \gset
SELECT private.category_intake_validate(:'fields','[]');
SELECT test.assert_true(private.category_intake_answers(:'fields','{"doc":"52998224725","cib":"AB12CD3-0"}',true)->>'doc'='52998224725',
 'response models: CPF accepted in the same field');
SELECT test.assert_true(private.category_intake_answers(:'fields','{"doc":"11.222.333/0001-81","cib":"AB12CD3-0"}',true)->>'doc'='11.222.333/0001-81',
 'response models: legacy CNPJ accepted in the same field');
SELECT test.assert_true(private.category_intake_answers(:'fields','{"doc":"12.ABC.345/01DE-35","cib":"AB12CD3-0"}',true)->>'doc'='12.ABC.345/01DE-35',
 'response models: official alphanumeric CNPJ fixture accepted');
SELECT test.expect_error(format('SELECT private.category_intake_answers(%L,%L,true)',:'fields','{"doc":"12ABC34501DE36","cib":"AB12CD3-0"}'),
 'PT422','response models: invalid alphanumeric checksum blocked');
SELECT test.expect_error(format('SELECT private.category_intake_answers(%L,%L,true)',:'fields','{"doc":"52998224725,11222333000181","cib":"AB12CD3-0"}'),
 'PT422','response models: two identifiers in one answer rejected');
SELECT test.expect_error(format('SELECT private.category_intake_answers(%L,%L,true)',:'fields','{"doc":"52998224725","cib":"AB12CD3/0"}'),
 'PT422','response models: server enforces saved separator');
SELECT test.expect_error($query$ SELECT private.category_intake_validate('[{"key":"gov","label":"Senha gov.br","type":"text","required":false,"options":[]}]','[]') $query$,
 'PT422','response models: gov.br password field blocked');
SELECT test.expect_error($query$ SELECT private.category_intake_validate('[{"key":"doc","label":"Documento","type":"text","required":false,"options":[],"model":{"name":"Escritura","mask":"(.*)+"}}]','[]') $query$,
 'PT422','response models: arbitrary regex blocked');
SELECT test.assert_true(NOT has_function_privilege('authenticated','private.category_intake_answers_base(jsonb,jsonb,boolean)','EXECUTE'),
 'response models: historical validator inaccessible to API roles');
\set office '00000000-0000-4000-e000-000000001961'
INSERT INTO public.offices(id,name) VALUES (:'office','Escritório fictício de modelos');
INSERT INTO auth.users(id,email_confirmed_at)
VALUES ('00000000-0000-4000-a000-000000001961',now()),('00000000-0000-4000-a000-000000001962',now());
INSERT INTO auth.sessions(id,user_id)
SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
WHERE id IN ('00000000-0000-4000-a000-000000001961','00000000-0000-4000-a000-000000001962');
INSERT INTO public.profiles(id,display_name)
SELECT id,'Pessoa fictícia' FROM auth.users
WHERE id IN ('00000000-0000-4000-a000-000000001961','00000000-0000-4000-a000-000000001962');
INSERT INTO public.memberships(office_id,user_id,role_code) VALUES
  (:'office','00000000-0000-4000-a000-000000001961','owner'),
  (:'office','00000000-0000-4000-a000-000000001962','client');
SELECT id AS category FROM private.service_categories WHERE office_id=:'office' AND name='Rural' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001961","session_id":"00000000-0000-4000-c000-000000001961"}';
SELECT public.category_intake_publish(:'office',:'category',
  jsonb_build_object('expected_revision',0,'enabled',true,'instructions','','fields',:'fields'::jsonb,'documents','[]'::jsonb,'reason','Fixture'),
  gen_random_uuid()) AS saved \gset
SELECT test.assert_true(:'saved'::jsonb#>>'{fields,1,model,mask}'='*******-0','response models: published snapshot carries model');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001962","session_id":"00000000-0000-4000-c000-000000001962"}';
SELECT public.category_intake_open(:'office',:'category',1,'{"doc":"12ABC34501DE35","cib":"AB12CD3-0"}','',gen_random_uuid()) AS opened \gset
SELECT test.assert_true(
  public.category_intake_state(:'office',(:'opened'::jsonb->>'request_id')::uuid)#>'{answers}'='{"doc":"12ABC34501DE35","cib":"AB12CD3-0"}'::jsonb,
  'response models: client opened request and stored a single identifier');
RESET ROLE;
ROLLBACK;
