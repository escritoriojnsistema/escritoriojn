RESET ROLE;
BEGIN;
INSERT INTO public.customers(id,office_id,kind,name,created_by)VALUES('27000000-0000-4000-8000-000000000001','00000000-0000-4000-e000-000000000201','person','Maria rural de teste','00000000-0000-4000-a000-000000000201'),('27000000-0000-4000-8000-000000000002','00000000-0000-4000-e000-000000000201','person','Coproprietário de teste','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT jsonb_build_object('kind','create','customer_id','27000000-0000-4000-8000-000000000001','name','Fazenda A','municipality','Cidade de teste','state','MG','location','Zona rural','identifiers','{}'::jsonb) AS c27, gen_random_uuid() AS k27 \gset
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,:'c27',:'k27')->>'id' AS p27 \gset
SELECT test.assert_true(public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,:'c27',:'k27')->>'id'=:'p27','27: replay preserves property');
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,(:'c27'::jsonb||'{"name":"Fazenda B"}'),gen_random_uuid())->>'id' AS b27 \gset
SELECT test.assert_true(:'p27'<>:'b27','27: one customer can have two separate properties');
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',:'p27','{"kind":"party","expected_version":1,"customer_id":"27000000-0000-4000-8000-000000000001","role":"holder","valid_from":"2020-01-01","valid_until":null}',gen_random_uuid());
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',:'p27','{"kind":"party","expected_version":2,"customer_id":"27000000-0000-4000-8000-000000000002","role":"holder","valid_from":"2021-01-01","valid_until":null}',gen_random_uuid());
SELECT public.rural_state27('00000000-0000-4000-e000-000000000201',:'p27',1) AS s27 \gset
SELECT test.assert_true(jsonb_array_length(:'s27'::jsonb->'parties')=2,'27: multiple explicit holders preserved');
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',:'p27',jsonb_build_object('kind','end_party','expected_version',3,'party_id',:'s27'::jsonb#>>'{parties,0,id}','valid_until','2025-01-01'),gen_random_uuid());
SELECT test.assert_true(jsonb_array_length(public.rural_state27('00000000-0000-4000-e000-000000000201',:'p27',1)->'parties')=2,'27: ending holder preserves previous period');
RESET ROLE;
SELECT r.id AS q27 FROM public.requests r WHERE r.office_id='00000000-0000-4000-e000-000000000201' AND private.request_can_work(r,(SELECT m FROM public.memberships m WHERE m.office_id=r.office_id AND m.user_id='00000000-0000-4000-a000-000000000201')) LIMIT 1 \gset
UPDATE public.requests SET customer_id='27000000-0000-4000-8000-000000000001' WHERE id=:'q27';
SET ROLE authenticated;
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',:'p27',jsonb_build_object('kind','link','expected_version',4,'request_id',:'q27','file_id',NULL,'exercise',2025),gen_random_uuid());
SELECT test.assert_true(jsonb_array_length(public.rural_state27('00000000-0000-4000-e000-000000000201',:'p27',1)->'records')=1,'27: request and exercise linked to correct property');
SELECT test.expect_error(format('SELECT public.rural_command27(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'b27',jsonb_build_object('kind','link','expected_version',1,'request_id',:'q27','file_id',NULL,'exercise',2025)::text),'PT409','27: same request cannot move to another property');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000203","session_id":"00000000-0000-4000-c000-000000000203"}';
SELECT test.expect_error(format('SELECT public.rural_state27(%L,%L,1)','00000000-0000-4000-e000-000000000201',:'p27'),'PT403','27: foreign office denied');
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.rural_properties','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.rural_command27(uuid,uuid,jsonb,uuid)','EXECUTE'),'27: closed raw and anonymous access');
ROLLBACK;
