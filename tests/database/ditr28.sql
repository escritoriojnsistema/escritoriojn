-- All fixtures stay inside the disposable PostgreSQL container.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.ditr_state28(uuid,uuid,integer,uuid,integer)') IS NOT NULL,'28: state RPC exists');
SELECT test.assert_true(to_regprocedure('public.ditr_command28(uuid,uuid,jsonb,uuid)') IS NOT NULL,'28: command RPC exists');
BEGIN;
INSERT INTO public.customers(id,office_id,kind,name,created_by) VALUES('28000000-0000-4000-8000-000000000001','00000000-0000-4000-e000-000000000201','person','Contribuinte DITR fictício','00000000-0000-4000-a000-000000000201');
INSERT INTO public.requests(id,office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,idempotency_key,payload_digest,triaged_at)
SELECT ('28000000-0000-4000-8000-'||lpad((100000+n)::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000201','AT-DITR28-'||n,'DITR de teste '||n,'presencial','00000000-0000-4000-a000-000000000201','00000000-0000-4000-b000-000000000201','28000000-0000-4000-8000-000000000001','normal',gen_random_uuid(),'fixture',clock_timestamp() FROM generate_series(1,9)n;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,'{"kind":"create","customer_id":"28000000-0000-4000-8000-000000000001","name":"Imóvel DITR A","municipality":"Cidade teste","state":"MG","location":"Rural","identifiers":{}}',gen_random_uuid())->>'id' AS p28 \gset
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,'{"kind":"create","customer_id":"28000000-0000-4000-8000-000000000001","name":"Imóvel DITR B","municipality":"Cidade teste","state":"MG","location":"Rural","identifiers":{}}',gen_random_uuid())->>'id' AS b28 \gset
RESET ROLE;
INSERT INTO private.property_records27(office_id,property_id,request_id,exercise,created_by)
SELECT '00000000-0000-4000-e000-000000000201',CASE WHEN n=2 THEN :'b28' ELSE :'p28' END::uuid,('28000000-0000-4000-8000-'||lpad((100000+n)::text,12,'0'))::uuid,2025,'00000000-0000-4000-a000-000000000201' FROM generate_series(1,9)n;
INSERT INTO private.property_parties(office_id,property_id,customer_id,role,valid_from,created_by) VALUES('00000000-0000-4000-e000-000000000201',:'p28','28000000-0000-4000-8000-000000000001','holder','2020-01-01','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SELECT jsonb_build_object('kind','create','exercise',2025,'request_id','28000000-0000-4000-8000-000000100001','modality','original','previous_case_id',NULL) AS c28,gen_random_uuid() AS k28 \gset
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,%L)','00000000-0000-4000-e000-000000000201',:'p28',:'c28',:'k28'),'PT422','28: holder alone does not infer taxpayer');
RESET ROLE;
INSERT INTO private.property_parties(office_id,property_id,customer_id,role,valid_from,valid_until,created_by)
SELECT '00000000-0000-4000-e000-000000000201',v::uuid,'28000000-0000-4000-8000-000000000001','taxpayer','2025-01-01','2025-12-31','00000000-0000-4000-a000-000000000201' FROM unnest(ARRAY[:'p28',:'b28'])v;
SET ROLE authenticated;
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',:'c28',:'k28')->>'id' AS a28 \gset
SELECT test.assert_true(public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',:'c28',:'k28')->>'id'=:'a28','28: same key returns exact original');
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,%L)','00000000-0000-4000-e000-000000000201',:'p28',(:'c28'::jsonb||'{"exercise":2024}')::text,:'k28'),'PT409','28: changed payload with same key conflicts');
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'b28',(:'c28'::jsonb||'{"request_id":"28000000-0000-4000-8000-000000100002"}'),gen_random_uuid())->>'id' AS caseb28 \gset
SELECT test.assert_true(:'a28'<>:'caseb28','28: two properties same taxpayer and year stay separate');
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',(:'c28'::jsonb||'{"request_id":"28000000-0000-4000-8000-000000100003"}')::text),'PT409','28: duplicate equivalent original rejected independently of key/request');
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'b28',jsonb_build_object('kind','create','exercise',2025,'request_id','28000000-0000-4000-8000-000000100002','modality','rectifying','previous_case_id',:'a28')::text),'PT422','28: predecessor cannot belong to other property');
SELECT jsonb_build_object('kind','create','exercise',2025,'request_id','28000000-0000-4000-8000-000000100004','modality','rectifying','previous_case_id',:'a28') AS rect28 \gset
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',:'rect28',gen_random_uuid())->>'id' AS r28 \gset
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',(:'rect28'::jsonb||'{"request_id":"28000000-0000-4000-8000-000000100005"}')::text),'PT409','28: only one successor preserves linear correction chain');
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',(:'rect28'::jsonb||jsonb_build_object('request_id','28000000-0000-4000-8000-000000100006','previous_case_id',:'r28')),gen_random_uuid())->>'id' AS rr28 \gset
SELECT public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,:'rr28',1) AS st28 \gset
SELECT test.assert_true(:'st28'::jsonb#>>'{selected,root_case_id}'=:'a28' AND :'st28'::jsonb#>>'{selected,previous_case_id}'=:'r28' AND :'st28'::jsonb#>>'{selected,revision}'='3' AND :'st28'::jsonb->>'total'='3','28: original and entire chain retained');
SELECT test.assert_true(:'st28'::jsonb#>>'{selected,internal_protocol}'='AT-DITR28-6' AND NOT(:'st28'::jsonb->'selected' ? 'accepted') AND :'st28'::jsonb->>'calendar' IS NULL AND :'st28'::jsonb->>'evidence_total'='0','28: internal protocol is not external acceptance; no invented calendar or tax payment');
SELECT test.assert_true(jsonb_array_length(:'st28'::jsonb->'requests')<=5 AND :'st28'::jsonb->>'requests_total'='5','28: candidate list bounded with explicit total');
SELECT test.expect_error(format('SELECT public.ditr_state28(%L,%L,2025,%L,1)','00000000-0000-4000-e000-000000000201',:'b28',:'a28'),'PT404','28: selected case must belong to property/year');
SELECT test.expect_error(format('SELECT public.ditr_state28(%L,%L,2024,%L,1)','00000000-0000-4000-e000-000000000201',:'p28',:'a28'),'PT404','28: selected case must belong to exercise');
RESET ROLE;
INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by) VALUES('28000000-0000-4000-8000-000000200001','00000000-0000-4000-e000-000000000201','28000000-0000-4000-8000-000000100001','recibo-ficticio.pdf','application/pdf',100,repeat('a',64),'comprovante','quarentena','00000000-0000-4000-a000-000000000201'),('28000000-0000-4000-8000-000000200002','00000000-0000-4000-e000-000000000201','28000000-0000-4000-8000-000000100002','outro-imovel.pdf','application/pdf',100,repeat('b',64),'comprovante','quarentena','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SELECT jsonb_build_object('kind','evidence','case_id',:'a28','expected_version',1,'evidence_kind','receipt','file_id','28000000-0000-4000-8000-000000200001','external_reference','RECIBO-EXTERNO-INFORMADO','amount_cents',NULL,'external_date','2025-09-01') AS ev28,gen_random_uuid() AS ek28 \gset
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',(:'ev28'::jsonb||'{"file_id":"28000000-0000-4000-8000-000000200002"}')::text),'PT403','28: external evidence must come from same request/property');
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',:'ev28',:'ek28');
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',:'ev28',:'ek28');
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',:'ev28'),'PT409','28: stale evidence version conflicts');
SELECT public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,:'a28',1) AS se28 \gset
SELECT test.assert_true(:'se28'::jsonb->>'evidence_total'='1' AND :'se28'::jsonb#>>'{evidence,0,external_reference}'='RECIBO-EXTERNO-INFORMADO' AND :'se28'::jsonb#>>'{selected,version}'='2','28: receipt append-only, retry adds no duplicate');
RESET ROLE;
DELETE FROM public.role_permissions WHERE role_code='owner' AND permission_code='files.read';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,%L)','00000000-0000-4000-e000-000000000201',:'p28',:'ev28',:'ek28'),'PT403','28: evidence retry rechecks revoked files.read');
SELECT test.assert_true(public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,:'a28',1)->>'evidence_total'='0','28: lost files.read hides stored evidence');
RESET ROLE;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES('owner','files.read');
INSERT INTO auth.sessions(id,user_id) VALUES('28000000-0000-4000-8000-000000300001','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"28000000-0000-4000-8000-000000300001"}';
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,%L)','00000000-0000-4000-e000-000000000201',:'p28',:'c28',:'k28'),'PT403','28: committed command cannot replay in another session of same actor');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',(:'ev28'::jsonb||'{"expected_version":2,"evidence_kind":"tax_guide","external_reference":"GUIA-EXTERNA","amount_cents":12000}'),gen_random_uuid());
SELECT test.assert_true(public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,:'a28',1)->>'evidence_total'='2','28: guide preserves original receipt separately');
SELECT jsonb_build_object('kind','calendar','exercise',2025,'starts_on','2025-08-01','due_on','2025-09-30','source_url','https://www.gov.br/receitafederal/pt-br/assuntos/itr','checked_on',current_date::text,'expected_calendar_id',NULL) AS cal28 \gset
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',(:'cal28'::jsonb||'{"source_url":"https://gov.br.attacker.example/itr"}')::text),'PT422','28: calendar rejects misleading official hostname');
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',(:'cal28'::jsonb||jsonb_build_object('checked_on',(current_date+1)::text))::text),'PT422','28: calendar cannot claim future verification');
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',:'cal28',gen_random_uuid());
SELECT public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,NULL,1)#>>'{calendar,id}' AS calid28 \gset
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',:'cal28'),'PT409','28: concurrent calendar revision conflicts');
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',(:'cal28'::jsonb||jsonb_build_object('expected_calendar_id',:'calid28','due_on','2025-10-01')),gen_random_uuid());
SELECT test.assert_true(public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,NULL,1)#>>'{calendar,due_on}'='2025-10-01','28: latest human-verified calendar revision is used');
RESET ROLE;
SELECT r.id AS paidrq28,r.customer_id AS paidcustomer28,a.allocated_cents AS paidamount28 FROM public.requests r JOIN private.charges ch ON ch.office_id=r.office_id AND ch.request_id=r.id CROSS JOIN LATERAL private.charges_amounts(ch.office_id,ch.id)a WHERE r.office_id='00000000-0000-4000-e000-000000000201' AND a.allocated_cents>0 LIMIT 1 \gset
INSERT INTO private.property_records27(office_id,property_id,request_id,exercise,created_by)VALUES('00000000-0000-4000-e000-000000000201',:'p28',:'paidrq28',2025,'00000000-0000-4000-a000-000000000201');
INSERT INTO private.property_parties(office_id,property_id,customer_id,role,valid_from,created_by)VALUES('00000000-0000-4000-e000-000000000201',:'p28',:'paidcustomer28','taxpayer','2025-01-01','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SELECT public.ditr_command28('00000000-0000-4000-e000-000000000201',:'p28',jsonb_build_object('kind','create','exercise',2025,'request_id',:'paidrq28','modality','original','previous_case_id',NULL),gen_random_uuid())->>'id' AS paidcase28 \gset
SELECT public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,:'paidcase28',1) AS paidstate28 \gset
SELECT test.assert_true((:'paidstate28'::jsonb#>>'{selected,service,paid_cents}')::bigint=:'paidamount28'::bigint AND :'paidstate28'::jsonb->>'evidence_total'='0' AND NOT(:'paidstate28'::jsonb->'selected' ? 'tax_paid'),'28: real honorarium allocation never creates tax payment evidence/status');
RESET ROLE;
DELETE FROM public.role_permissions WHERE role_code='owner' AND permission_code='charges.read';
SET ROLE authenticated;
SELECT test.assert_true(public.ditr_state28('00000000-0000-4000-e000-000000000201',:'p28',2025,:'paidcase28',1)#>'{selected,service}'='null'::jsonb,'28: charge amounts require independent charges.read');
RESET ROLE;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES('owner','charges.read');
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.ditr_state28(%L,%L,2025,NULL,0)','00000000-0000-4000-e000-000000000201',:'p28'),'PT422','28: pagination validation blocks invalid offset');
SELECT test.expect_error(format('SELECT public.ditr_command28(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'p28',(:'cal28'::jsonb||'{"source_url":"https://www.gov.br@attacker.example/fonte"}')::text),'PT422','28: official-looking URL credentials rejected');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.ditr_state28(%L,%L,2025,NULL,1)','00000000-0000-4000-e000-000000000201',:'p28'),'PT403','28: portal customer never gains access through rural taxpayer link');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000203","session_id":"00000000-0000-4000-c000-000000000203"}';
SELECT test.expect_error(format('SELECT public.ditr_state28(%L,%L,2025,NULL,1)','00000000-0000-4000-e000-000000000201',:'p28'),'PT403','28: foreign office denied');
RESET ROLE;
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.ditr_cases28'::regclass,'private.ditr_evidence28'::regclass,'private.ditr_calendars28'::regclass,'private.ditr_commands28'::regclass)) AND NOT has_table_privilege('authenticated','private.ditr_cases28','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.ditr_command28(uuid,uuid,jsonb,uuid)','EXECUTE'),'28: raw tables and anonymous RPC closed');
SELECT test.assert_true((SELECT count(*)=2 FROM private.ditr_calendars28 WHERE office_id='00000000-0000-4000-e000-000000000201' AND exercise=2025) AND (SELECT count(*)=1 FROM private.file_references WHERE file_id='28000000-0000-4000-8000-000000200001' AND reference_kind='ditr28'),'28: calendar history and protected evidence references preserved');
SELECT test.expect_error(format('DELETE FROM private.ditr_cases28 WHERE id=%L',:'a28'),'PT409','28: original cannot be deleted');
SELECT test.expect_error(format('UPDATE private.ditr_cases28 SET exercise=2024 WHERE id=%L',:'a28'),'PT409','28: case identity immutable');
SELECT test.expect_error('DELETE FROM private.ditr_evidence28','PT409','28: receipts and evidence cannot be erased');
ROLLBACK;
