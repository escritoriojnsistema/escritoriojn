BEGIN;
\set office '00000000-0000-4000-e000-000000001981'
\set other '00000000-0000-4000-e000-000000001982'
INSERT INTO public.offices(id,name) VALUES (:'office','Painel fictício'),(:'other','Outro escritório fictício');
INSERT INTO auth.users(id,email,email_confirmed_at)
SELECT format('00000000-0000-4000-a000-00000000198%s',n)::uuid,format('fixture198%s@example.test',n),now()
FROM generate_series(1,5) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
WHERE id::text LIKE '00000000-0000-4000-a000-00000000198_';
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa fictícia' FROM auth.users
WHERE id::text LIKE '00000000-0000-4000-a000-00000000198_';
INSERT INTO public.memberships(id,office_id,user_id,role_code)
SELECT replace(u.id::text,'a000','b000')::uuid,CASE WHEN right(u.id::text,1)='5' THEN :'other'::uuid ELSE :'office'::uuid END,
 u.id,(ARRAY['owner','admin','employee','client','owner'])[right(u.id::text,1)::int]
FROM auth.users u WHERE u.id::text LIKE '00000000-0000-4000-a000-00000000198_';

SELECT id AS rural FROM private.service_categories WHERE office_id=:'office' AND name='Rural' \gset
UPDATE private.service_categories SET execution_level=3 WHERE id=:'rural';
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,priority,status,idempotency_key,payload_digest)
VALUES
 (:'office','AT-19801','Pedido interno fictício','presencial','00000000-0000-4000-a000-000000001983','normal','aberto',gen_random_uuid(),'fixture'),
 (:'office','AT-19802','Pedido portal fictício','portal','00000000-0000-4000-a000-000000001984','normal','em_atendimento',gen_random_uuid(),'fixture'),
 (:'other','AT-19803','Pedido externo fictício','presencial','00000000-0000-4000-a000-000000001985','normal','aberto',gen_random_uuid(),'fixture');
INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256)
SELECT r.office_id,r.id,:'rural','Rural','00000000-0000-4000-a000-000000001981',gen_random_uuid(),repeat('a',64)
FROM public.requests r WHERE r.office_id=:'office';

INSERT INTO private.team_member_permissions(membership_id,permission_code)
SELECT '00000000-0000-4000-b000-000000001982',code FROM public.permissions
WHERE code IN ('foundation.access','settings.access','requests.read','requests.read_all','requests.level3')
ON CONFLICT DO NOTHING;
INSERT INTO private.team_member_permissions(membership_id,permission_code)
SELECT '00000000-0000-4000-b000-000000001983',code FROM public.permissions
WHERE code IN ('foundation.access','requests.read','requests.level3')
ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001981","session_id":"00000000-0000-4000-c000-000000001981"}';
SELECT test.assert_true(public.office_copyright_save(:'office',0,'© Escritório fictício')->>'revision'='1','legal: owner publishes the copyright notice');
SELECT test.expect_error(format('SELECT public.office_copyright_save(%L,0,%L)',:'office','Texto antigo'),'PT409','legal: stale revision rejected');
SELECT test.assert_true(public.requests_home_counts(:'office')='{"aberto":1,"em_atendimento":1}','painel: owner counts both office requests only');
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001982","session_id":"00000000-0000-4000-c000-000000001982"}';
SELECT test.assert_true(public.office_copyright_save(:'office',1,'© Escritório fictício em revisão')->>'revision'='2','legal: authorized administrator publishes');
SELECT test.assert_true(public.requests_home_counts(:'office')='{"aberto":1,"em_atendimento":1}','painel: administrator with read-all sees both requests');
SELECT test.expect_error(format('SELECT public.requests_home_counts(%L)',:'other'),'PT403','painel: another office is denied');

SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001983","session_id":"00000000-0000-4000-c000-000000001983"}';
SELECT test.assert_true(public.requests_home_counts(:'office')='{"aberto":1}','painel: employee only sees own eligible request');
SELECT test.expect_error(format('SELECT public.office_copyright_save(%L,2,%L)',:'office','Texto indevido'),'PT403','legal: employee cannot write');

SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000001984","session_id":"00000000-0000-4000-c000-000000001984"}';
SELECT test.assert_true(public.requests_home_counts(:'office')='{"em_analise":1}','painel: client sees own requests using public status');
SELECT test.assert_true(public.office_copyright_state(:'office')->>'notice'='© Escritório fictício em revisão','legal: client reads published copyright');
SELECT test.expect_error(format('SELECT public.office_copyright_state(%L)',:'other'),'PT403','legal: arbitrary office is denied');
SET LOCAL ROLE anon;
SELECT test.assert_true(public.office_copyright_public() ? 'notice','legal: anonymous login can read public notice');
SELECT test.expect_error(format('SELECT public.requests_home_counts(%L)',:'office'),'42501','painel: anonymous access denied');
ROLLBACK;
