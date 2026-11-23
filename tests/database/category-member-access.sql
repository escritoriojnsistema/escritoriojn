BEGIN;
\set office '00000000-0000-4000-e000-000000001951'
\set other_office '00000000-0000-4000-e000-000000001952'
\set owner_member '00000000-0000-4000-b000-000000001951'
\set edit_member '00000000-0000-4000-b000-000000001952'
\set read_member '00000000-0000-4000-b000-000000001953'
\set other_member '00000000-0000-4000-b000-000000001954'
INSERT INTO public.offices(id,name) VALUES (:'office','Escritório fictício'),(:'other_office','Segundo escritório fictício');
INSERT INTO auth.users(id,email,email_confirmed_at)
SELECT format('00000000-0000-4000-a000-00000000195%s',n)::uuid,format('fixture195%s@example.test',n),now()
FROM generate_series(1,4) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
WHERE id::text LIKE '00000000-0000-4000-a000-00000000195_';
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa fictícia' FROM auth.users
WHERE id::text LIKE '00000000-0000-4000-a000-00000000195_';
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES
  (:'owner_member',:'office','00000000-0000-4000-a000-000000001951','owner'),
  (:'edit_member',:'office','00000000-0000-4000-a000-000000001952','employee'),
  (:'read_member',:'office','00000000-0000-4000-a000-000000001953','admin'),
  (:'other_member',:'other_office','00000000-0000-4000-a000-000000001954','owner');
SELECT id AS legal FROM private.service_categories WHERE office_id=:'office' AND name='Jurídico' \gset
SELECT id AS rural FROM private.service_categories WHERE office_id=:'office' AND name='Rural' \gset
SELECT id AS foreign_category FROM private.service_categories WHERE office_id=:'other_office' AND name='Rural' \gset
UPDATE private.service_categories SET execution_level=1 WHERE id=:'legal';
UPDATE private.service_categories SET execution_level=3 WHERE id=:'rural';

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001951","session_id":"00000000-0000-4000-c000-000000001951"}';
SELECT jsonb_build_object('origin','presencial','category_id',:'legal','title','Atendimento jurídico fictício','message','',
  'customer_id',null,'assignee_id',null,'priority','normal','priority_reason','','internal_note','','items','[]'::jsonb) AS opening \gset
SELECT public.staff_category_request_create(:'office',:'opening',gen_random_uuid())->>'id' AS team_request \gset
SELECT public.staff_category_request_create(:'office',(:'opening'::jsonb||jsonb_build_object('category_id',:'rural')),gen_random_uuid())->>'id' AS rural_request \gset
SELECT jsonb_build_object(:'legal','edit',:'rural','denied') AS editor_grants,jsonb_build_object(:'legal','read') AS reader_grants \gset
SELECT test.assert_true(public.team_set_member_category_access(:'office',:'edit_member','employee',true,ARRAY['foundation.access'],:'editor_grants','{}',gen_random_uuid())->>'ok'='true','category access: owner grants scoped editing');
SELECT test.assert_true(public.team_set_member_category_access(:'office',:'read_member','admin',true,ARRAY['foundation.access','requests.read','requests.create','requests.update','requests.level1','requests.delete'],:'reader_grants','{}',gen_random_uuid())->>'ok'='true','category access: owner grants read even with global execution');
SELECT test.assert_true((public.team_dashboard(:'office','members',1,'','all')->'category_catalog') @> jsonb_build_array(jsonb_build_object('id',:'legal'))
  AND EXISTS(SELECT FROM jsonb_array_elements(public.team_dashboard(:'office','members',1,'','all')->'items') m
    WHERE m->>'id'=:'edit_member' AND m->'category_access'=:'editor_grants'::jsonb),'category access: roster includes catalog and grants');
SELECT test.expect_error(format('SELECT public.team_set_member_category_access(%L,%L,''employee'',true,ARRAY[''foundation.access''],%L,%L,gen_random_uuid())',:'office',:'edit_member','{}','{}'),'PT409','category access: stale writer cannot replace newer grants');
SELECT test.expect_error(format('SELECT public.team_set_member_category_access(%L,%L,''employee'',true,ARRAY[''foundation.access''],%L,%L,gen_random_uuid())',:'office',:'edit_member',jsonb_build_object(:'foreign_category','edit')::text,:'editor_grants'),'PT422','category access: other-office category rejected');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001953","session_id":"00000000-0000-4000-c000-000000001953"}';
SELECT test.assert_true(public.request_detail(:'office',:'team_request',1)->>'category_access_mode'='read'
  AND public.request_detail(:'office',:'team_request',1)->>'can_update'='false','category access: reader sees another member request without read_all');
SELECT test.assert_true(public.specialized_state30(:'office',:'team_request',1)->>'can_open'='false','category access: reader can see specialized workflow');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,1,%L,gen_random_uuid())',:'office',:'team_request','{"kind":"note","note":"Impedida"}'),'PT403','category access: reader cannot mutate');
SELECT public.staff_category_request_create(:'office',:'opening',gen_random_uuid()) AS collected \gset
SELECT test.assert_true(:'collected'::jsonb->>'preintake'='true' AND :'collected'::jsonb->>'can_collect'='true' AND :'collected'::jsonb->>'assignee_id' IS NULL,'category access: read overrides level 1 when opening');
SELECT test.assert_true(public.request_preintake_handoff(:'office',(:'collected'::jsonb->>'id')::uuid,(:'collected'::jsonb->>'version')::int,'Encaminhamento fictício')->>'can_collect'='false','category access: reader can hand off, but cannot keep collecting');
SELECT test.expect_error(format('SELECT public.team_set_member_category_access(%L,%L,''employee'',true,ARRAY[''foundation.access''],%L,%L,gen_random_uuid())',:'office',:'edit_member','{}',:'editor_grants'),'PT403','category access: regular administrator cannot write grants');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001952","session_id":"00000000-0000-4000-c000-000000001952"}';
SELECT test.assert_true(public.request_detail(:'office',:'team_request',1)->>'category_access_mode'='edit' AND public.request_detail(:'office',:'team_request',1)->>'can_update'='false','category access: edit does not steal a current assignment');
SELECT public.staff_category_request_create(:'office',:'opening',gen_random_uuid()) AS edited \gset
SELECT test.assert_true(:'edited'::jsonb->>'preintake'='false' AND :'edited'::jsonb->>'assignee_id'=:'edit_member' AND :'edited'::jsonb->>'can_update'='true'
  AND :'edited'::jsonb->>'specialized_category_access'='true','category access: employee with scoped edit executes level 1');
SELECT test.assert_true(public.request_mutate(:'office',(:'edited'::jsonb->>'id')::uuid,(:'edited'::jsonb->>'version')::int,
  '{"kind":"status","status":"em_atendimento","reason":"Fixture assumida"}',gen_random_uuid())->>'status'='em_atendimento','category access: edit works without global requests.update');
SELECT test.expect_error(format('SELECT public.staff_category_request_create(%L,%L,gen_random_uuid())',:'office',
  (:'opening'::jsonb||jsonb_build_object('category_id',:'rural'))::text),'PT403','category access: denied prevents opening even at level 3');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)',:'office',:'rural_request'),'PT404','category access: denied prevents reading');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)',:'other_office',:'team_request'),'PT403','category access: other office denied');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001951","session_id":"00000000-0000-4000-c000-000000001951"}';
SELECT public.team_set_member_category_access(:'office',:'edit_member','employee',true,ARRAY['foundation.access'],
  jsonb_build_object(:'legal','read',:'rural','denied'),:'editor_grants',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001952","session_id":"00000000-0000-4000-c000-000000001952"}';
SELECT test.assert_true(public.request_detail(:'office',(:'edited'::jsonb->>'id')::uuid,1)->>'can_update'='false','category access: revoked edit stops existing assignee');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,2,%L,gen_random_uuid())',:'office',:'edited'::jsonb->>'id',
  '{"kind":"status","status":"aguardando_cliente","reason":"Sem autorização"}'),'PT403','category access: revoked actor cannot write directly');
SELECT public.staff_category_request_create(:'office',:'opening',gen_random_uuid()) AS scoped_preintake \gset
SELECT test.assert_true(:'scoped_preintake'::jsonb->>'can_collect'='true','category access: scoped reader opens without global requests.create');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.member_category_access','SELECT')
  AND NOT has_function_privilege('anon','public.team_set_member_category_access(uuid,uuid,text,boolean,text[],jsonb,jsonb,uuid)','EXECUTE'),
  'category access: no direct table grant and no anonymous mutation');
RESET ROLE;
ROLLBACK;
