-- Disposable PostgreSQL only, after all Etapa18 regressions have passed.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.quick_operate(uuid,jsonb)') IS NOT NULL,'19: quick RPC exists');
SELECT test.assert_true((SELECT count(*)=5 FROM public.role_permissions WHERE role_code='owner' AND permission_code IN('quick.perform','finance.reports.read','finance.reports.read_all','finance.reports.export','finance.reports.manage')) AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'finance.reports.%'),'19: five capabilities seed owner only');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.quick_operations','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.finance_report_snapshots','SELECT,INSERT,UPDATE,DELETE') AND(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.quick_operations'::regclass,'private.finance_report_settings'::regclass,'private.finance_report_snapshots'::regclass)),'19: private ACL and RLS closed');
SELECT test.assert_true(NOT has_function_privilege('anon','public.quick_context(uuid,uuid,text,integer,integer,integer)','EXECUTE') AND NOT has_function_privilege('service_role','public.finance_report_page(uuid,jsonb,integer)','EXECUTE') AND NOT has_function_privilege('authenticated','private.finance19_rows(uuid,jsonb,timestamptz,timestamptz)','EXECUTE') AND NOT EXISTS(SELECT FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'quick_%' OR proname LIKE 'finance_report_%') AND prosecdef),'19: public INVOKER authenticated wrappers, closed helpers');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_constraint c WHERE c.contype='f' AND c.conrelid IN('private.quick_operations'::regclass,'private.finance_report_settings'::regclass,'private.finance_report_snapshots'::regclass) AND NOT EXISTS(SELECT FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indnkeyatts>=cardinality(c.conkey) AND NOT EXISTS(SELECT FROM unnest(c.conkey)WITH ORDINALITY k(att,n) WHERE i.indkey[(n-1)::integer] IS DISTINCT FROM k.att))),'19 P3: every new foreign key has a valid nonpartial supporting index prefix');
CREATE TABLE test.finance19_saved(f jsonb,op jsonb,result jsonb,snapshot jsonb);GRANT SELECT ON test.finance19_saved TO authenticated;
CREATE FUNCTION test.quick_fixture19() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f jsonb;svc uuid;BEGIN
 f:=test.payment_fixture();SELECT id INTO svc FROM public.services WHERE office_id=(f->>'office')::uuid AND code='QUICK19';RETURN f||jsonb_build_object('service',svc);
END $$;
CREATE FUNCTION test.quick_op19(f jsonb,qty integer DEFAULT 10) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('session_id',f->'session','expected_session_version',1,'service_id',f->'service','expected_service_version',1,'quantity',qty,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'quoted_total_cents',qty*50,'payment_method_id',f->'cash','presented_cents',qty*50,'fee_cents',0,'settlement','not_applicable','settled_on',NULL,'external_reference',NULL,'evidence','Conferencia sintetica local19','idempotency_key',gen_random_uuid());
$$;
CREATE FUNCTION test.report_filter19(v text DEFAULT 'movements',sc text DEFAULT 'own') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('view',v,'scope',sc,'from_date',(current_date-1)::text,'until_date',(current_date+1)::text,'unit_id',NULL,'operator_id',NULL,'service_id',NULL,'payment_type','all','account_id',NULL,'status','all','customer_id',NULL);
$$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
RESET ROLE;
SELECT definition||'{"code":"QUICK19","name":"Xerox19","price_cents":50,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false,"fields":[],"checklist":[],"required_capabilities":[],"allow_courtesy":true,"max_discount_bps":10000}' AS def19 FROM public.services s JOIN public.service_versions v ON v.service_id=s.id WHERE s.code='FINANCE15' ORDER BY v.number DESC LIMIT 1 \gset
SET ROLE authenticated;
SELECT public.service_create('00000000-0000-4000-e000-000000000151',:'def19','Servico sintetico19 sem pessoa',gen_random_uuid());
SELECT test.quick_fixture19() AS f19 \gset
SELECT test.quick_op19(:'f19') AS op19 \gset
SELECT test.assert_true(public.quick_context((:'f19'::jsonb->>'office')::uuid,(:'f19'::jsonb->>'session')::uuid,'QUICK19',1,1,1) @> '{"enabled":true,"services_total":1,"page_size":5,"methods_total":4}' AND public.finance_report_context((:'f19'::jsonb->>'office')::uuid) @> '{"enabled":true,"settings":{"timezone":"UTC","version":0,"configured":false,"can_manage":true},"can_read_all":true,"can_export":true}','19: paginated context selects authorized own session and explicit UTC default');
-- P2: JSONB @> [] does not mean an array is empty. Test each policy dimension independently and together.
SELECT public.service_create('00000000-0000-4000-e000-000000000151',:'def19'::jsonb||'{"code":"POLICY-FIELD19","name":"Campo opcional19","fields":[{"key":"optional_detail","label":"Detalhe opcional","type":"text","required":false}]}','Politica com campo opcional19',gen_random_uuid())->>'id' AS fieldpolicy19 \gset
SELECT public.service_create('00000000-0000-4000-e000-000000000151',:'def19'::jsonb||'{"code":"POLICY-CHECK19","name":"Checklist obrigatorio19","checklist":["Conferir requisito19"]}','Politica com checklist19',gen_random_uuid())->>'id' AS checkpolicy19 \gset
SELECT public.service_create('00000000-0000-4000-e000-000000000151',:'def19'::jsonb||'{"code":"POLICY-BOTH19","name":"Campo e checklist19","fields":[{"key":"optional_detail","label":"Detalhe opcional","type":"text","required":false}],"checklist":["Conferir requisito19"]}','Politica com campo e checklist19',gen_random_uuid())->>'id' AS bothpolicy19 \gset
RESET ROLE;
CREATE TABLE test.quick_policy_before19 AS SELECT jsonb_build_object('requests',(SELECT count(*) FROM public.requests WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'charges',(SELECT count(*) FROM private.charges WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'payments',(SELECT count(*) FROM private.payments WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'allocations',(SELECT count(*) FROM private.payment_allocations WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'entries',(SELECT count(*) FROM private.cash_entries WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'operations',(SELECT count(*) FROM private.quick_operations WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'commands',(SELECT count(*) FROM private.cash_commands WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'audits',(SELECT count(*) FROM public.audit_events WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'notifications',(SELECT count(*) FROM private.internal_notifications WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'session',(SELECT to_jsonb(cs) FROM private.cash_sessions cs WHERE cs.id=(:'f19'::jsonb->>'session')::uuid)) state;
SET ROLE authenticated;
SELECT test.assert_true(public.quick_context((:'f19'::jsonb->>'office')::uuid,(:'f19'::jsonb->>'session')::uuid,'POLICY-FIELD19',1,1,1) @> '{"services_total":0,"services":[]}','19 P2: optional field policy excluded from quick context');
SELECT test.assert_true(public.quick_context((:'f19'::jsonb->>'office')::uuid,(:'f19'::jsonb->>'session')::uuid,'POLICY-CHECK19',1,1,1) @> '{"services_total":0,"services":[]}','19 P2: nonempty checklist excluded from quick context');
SELECT test.assert_true(public.quick_context((:'f19'::jsonb->>'office')::uuid,(:'f19'::jsonb->>'session')::uuid,'POLICY-BOTH19',1,1,1) @> '{"services_total":0,"services":[]}','19 P2: optional field and checklist policy excluded from quick context');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||jsonb_build_object('service_id',:'fieldpolicy19'))::text),'PT409','19 P2: quick rejects optional field before creating any operation');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||jsonb_build_object('service_id',:'checkpolicy19'))::text),'PT409','19 P2: quick rejects nonempty checklist at eligibility gate');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||jsonb_build_object('service_id',:'bothpolicy19'))::text),'PT409','19 P2: quick rejects optional field and checklist at eligibility gate');
RESET ROLE;
SELECT test.assert_true((SELECT state FROM test.quick_policy_before19)=jsonb_build_object('requests',(SELECT count(*) FROM public.requests WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'charges',(SELECT count(*) FROM private.charges WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'payments',(SELECT count(*) FROM private.payments WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'allocations',(SELECT count(*) FROM private.payment_allocations WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'entries',(SELECT count(*) FROM private.cash_entries WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'operations',(SELECT count(*) FROM private.quick_operations WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'commands',(SELECT count(*) FROM private.cash_commands WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'audits',(SELECT count(*) FROM public.audit_events WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'notifications',(SELECT count(*) FROM private.internal_notifications WHERE office_id=(:'f19'::jsonb->>'office')::uuid),'session',(SELECT to_jsonb(cs) FROM private.cash_sessions cs WHERE cs.id=(:'f19'::jsonb->>'session')::uuid)),'19 P2: rejected policies preserve requests charges payments allocations ledger commands audits notifications and session');
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||'{"title":"browser title"}')::text),'PT422','19: quick closed input rejects injected title');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||'{"expected_service_version":99}')::text),'PT409','19: catalog99 rejected');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||'{"quoted_total_cents":499}')::text),'PT409','19: quoted price server checked');
SELECT public.quick_operate((:'f19'::jsonb->>'office')::uuid,:'op19') AS result19 \gset
SELECT test.assert_true(:'result19'::jsonb @> '{"total_cents":500,"statement":{"session":{"cash_cents":10500,"version":2}}}' AND :'result19'::jsonb->>'payment_id' IS NOT NULL,'19: 10x50 creates 500 confirmed payment and completes');
SELECT test.assert_true(public.quick_operate((:'f19'::jsonb->>'office')::uuid,:'op19')=:'result19'::jsonb,'19: stable retry no duplicates');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||'{"evidence":"Outra evidencia sintetica"}')::text),'PT409','19: reused key changed payload rejected');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.quick_operations WHERE request_id=(:'result19'::jsonb->>'request_id')::uuid)=1 AND(SELECT count(*) FROM public.requests WHERE id=(:'result19'::jsonb->>'request_id')::uuid AND status='concluido' AND customer_id IS NULL)=1 AND(SELECT count(*) FROM private.payment_allocations WHERE payment_id=(:'result19'::jsonb->>'payment_id')::uuid)=1,'19: one existing request/charge/payment/allocation, no anonymous customer');
INSERT INTO test.finance19_saved(f,op,result)VALUES(:'f19',:'op19',:'result19');
SET ROLE authenticated;
SELECT test.quick_fixture19() AS zf19 \gset
SELECT test.quick_op19(:'zf19')||'{"adjustment":{"kind":"courtesy","value":0,"reason":"Cortesia autorizada19"},"quoted_total_cents":0,"payment_method_id":null,"presented_cents":null}' AS zop19 \gset
SELECT public.quick_operate((:'zf19'::jsonb->>'office')::uuid,:'zop19') AS zr19 \gset
SELECT test.assert_true(:'zr19'::jsonb @> '{"total_cents":0,"payment_id":null,"statement":{"session":{"version":1,"cash_cents":10000}}}','19: zero courtesy creates no fictitious payment');
SELECT test.quick_fixture19() AS rf19 \gset
SELECT test.quick_op19(:'rf19')||'{"fee_cents":1}' AS rop19 \gset
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'rf19'::jsonb->>'office',:'rop19'),'PT422','19: downstream failure rolls back request and charge');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_commands WHERE kind='quick' AND idempotency_key=(:'rop19'::jsonb->>'idempotency_key')::uuid),'19: failed command leaves no reservation');
SET ROLE authenticated;
SELECT test.report_filter19('movements')||jsonb_build_object('unit_id',:'f19'::jsonb->'unit') AS mf19 \gset
SELECT public.finance_report_page((:'f19'::jsonb->>'office')::uuid,:'mf19',1) AS mp19 \gset
SELECT test.assert_true(:'mp19'::jsonb @> '{"timezone":"UTC","summary":{"received_cents":500,"reversed_cents":0,"refund_cents":0,"expense_cents":0,"fee_cents":0},"total":1,"page_size":5}' AND :'mp19'::jsonb->'items'->0 @> '{"kind":"received","customer_label":"Sem cadastro","amount_cents":500,"description":"Xerox19"}','19: report ledger gross receipt and masked snapshot description');
SELECT test.expect_error(format('SELECT public.finance_report_page(%L,%L,1)',:'f19'::jsonb->>'office',(test.report_filter19('obligations')||jsonb_build_object('unit_id',:'f19'::jsonb->'unit'))::text),'PT422','19: incompatible obligation unit refused');
SELECT test.expect_error(format('SELECT public.finance_report_page(%L,%L,1)',:'f19'::jsonb->>'office',(test.report_filter19('cash')||jsonb_build_object('service_id',:'f19'::jsonb->'service'))::text),'PT422','19: incompatible cash service refused');
SELECT test.expect_error(format('SELECT public.finance_report_page(%L,%L,1)',:'f19'::jsonb->>'office',(test.report_filter19()||'{"from_date":"2024-01-01","until_date":"2026-01-01"}')::text),'PT422','19: maximum 366 local days');
SELECT test.expect_error(format('SELECT public.finance_report_settings(%L,%L,0,%L,gen_random_uuid())',:'f19'::jsonb->>'office','No/Such_Zone','Configuracao local invalida'),'PT422','19: IANA timezone checked in database');
SELECT public.finance_report_begin((:'f19'::jsonb->>'office')::uuid,:'mf19',gen_random_uuid()) AS snap19 \gset
SELECT test.assert_true(public.finance_report_chunk((:'f19'::jsonb->>'office')::uuid,(:'snap19'::jsonb->>'id')::uuid,0)->'items'=:'mp19'::jsonb->'items' AND :'snap19'::jsonb->>'contract_version'='1','19: snapshot captures same filters, totals and rows');
SELECT public.finance_report_settings((:'f19'::jsonb->>'office')::uuid,'America/New_York',0,'Configuracao local de fuso19',gen_random_uuid());
SELECT test.assert_true(public.finance_report_chunk((:'f19'::jsonb->>'office')::uuid,(:'snap19'::jsonb->>'id')::uuid,0)->'items'=:'mp19'::jsonb->'items','19: timezone change cannot rewrite snapshot');
SELECT public.finance_report_page((:'f19'::jsonb->>'office')::uuid,test.report_filter19()||'{"from_date":"2026-03-08","until_date":"2026-03-09"}',1) AS dst19 \gset
SELECT test.assert_true((:'dst19'::jsonb->>'until_utc')::timestamptz-(:'dst19'::jsonb->>'from_utc')::timestamptz=interval '23 hours','19: local IANA DST bounds inclusive/exclusive');
SELECT public.finance_report_authorize((:'f19'::jsonb->>'office')::uuid,(:'snap19'::jsonb->>'id')::uuid,'csv',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.finance_report_chunk(%L,%L,1)',:'f19'::jsonb->>'office',:'snap19'::jsonb->>'id'),'PT422','19: chunks offsets multiple of500');
RESET ROLE;
UPDATE test.finance19_saved SET snapshot=:'snap19';
SELECT test.assert_true((SELECT pg_get_expr(adbin,adrelid) FROM pg_attrdef WHERE adrelid='private.audit_reports'::regclass AND adnum=(SELECT attnum FROM pg_attribute WHERE attrelid='private.audit_reports'::regclass AND attname='renderer_version'))='6','19: renderer6 default only');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.audit_reports r JOIN test.closure_reports_before18 b ON b.id=r.id WHERE to_jsonb(r)<>b.snapshot),'19: PDF1-5 snapshots unchanged');
-- Historical event criteria: one card header, multiple ledger allocations, distinct reversals/refunds.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.quick_fixture19() AS cf19 \gset
SELECT test.payment_op(:'cf19',3000,'card','pending')||jsonb_build_object('fee_cents',100,'allocations',jsonb_build_array(jsonb_build_object('charge_id',:'cf19'::jsonb->'charges'->0->'id','expected_charge_version',1,'amount_cents',3000),jsonb_build_object('charge_id',:'cf19'::jsonb->'charges'->1->'id','expected_charge_version',1,'amount_cents',2000))) AS cop19 \gset
SELECT public.payment_operate((:'cf19'::jsonb->>'office')::uuid,:'cop19') AS cpending19 \gset
SELECT test.assert_true(public.finance_report_page((:'cf19'::jsonb->>'office')::uuid,test.report_filter19()||jsonb_build_object('unit_id',:'cf19'::jsonb->'unit'),1) @> '{"total":0,"summary":{"received_cents":0,"fee_cents":0}}','19: pending card is neither received nor fee');
SELECT public.payment_operate((:'cf19'::jsonb->>'office')::uuid,jsonb_build_object('kind','confirm','session_id',:'cf19'::jsonb->'session','expected_version',1,'idempotency_key',gen_random_uuid(),'payment_id',:'cpending19'::jsonb->'payments'->'items'->0->'id','evidence','Confirmacao posterior sintetica19')) AS cpaid19 \gset
SELECT test.assert_true(public.finance_report_page((:'cf19'::jsonb->>'office')::uuid,test.report_filter19()||jsonb_build_object('unit_id',:'cf19'::jsonb->'unit'),1) @> '{"total":3,"summary":{"received_cents":5000,"fee_cents":100,"unknown_fee_count":0}}','19: two allocations yield gross5000 and one card fee100 at confirmation');
RESET ROLE;
SELECT id AS finance_service19 FROM public.services WHERE office_id=(:'cf19'::jsonb->>'office')::uuid AND code='FINANCE15' \gset
SET ROLE authenticated;
SELECT test.assert_true(public.finance_report_page((:'cf19'::jsonb->>'office')::uuid,test.report_filter19()||jsonb_build_object('unit_id',:'cf19'::jsonb->'unit','service_id',:'finance_service19'),1) @> '{"total":2,"summary":{"received_cents":5000,"fee_cents":null}}','19: service uses allocation rows and excludes unallocated fee without invented zero');
SELECT jsonb_build_object('kind','reverse','session_id',:'cf19'::jsonb->'session','expected_version',3,'idempotency_key',gen_random_uuid(),'allocation_id',:'cpaid19'::jsonb->'payments'->'items'->0->'allocations'->0->'id','refund_now',false,'amount_cents',500,'reason','Reversao logica sintetica19','evidence','Sem devolucao fisica ainda19') AS crevop19 \gset
SELECT public.correction_operate((:'cf19'::jsonb->>'office')::uuid,:'crevop19');
SELECT public.correction_sources((:'cf19'::jsonb->>'office')::uuid,(:'cf19'::jsonb->>'session')::uuid,'refund','',1)->'items'->0 AS crsrc19 \gset
SELECT public.correction_operate((:'cf19'::jsonb->>'office')::uuid,jsonb_build_object('kind','refund','session_id',:'cf19'::jsonb->'session','expected_version',4,'idempotency_key',gen_random_uuid(),'reversal_id',:'crsrc19'::jsonb->'reversal_id','amount_cents',500,'reason','Devolucao efetiva sintetica19','evidence','Conferencia privada sintetica19'));
SELECT test.assert_true(public.finance_report_page((:'cf19'::jsonb->>'office')::uuid,test.report_filter19()||jsonb_build_object('unit_id',:'cf19'::jsonb->'unit'),1) @> '{"total":5,"summary":{"received_cents":5000,"reversed_cents":500,"refund_cents":500,"fee_cents":100}}','19: gross receipt, logical reversal, actual refund and original fee remain separate');
SELECT public.transfer_operate((:'cf19'::jsonb->>'office')::uuid,jsonb_build_object('kind','sangria','session_id',:'cf19'::jsonb->'session','expected_session_version',5,'idempotency_key',gen_random_uuid(),'source_account_id',:'cf19'::jsonb->'cashaccount','destination_account_id',:'cf19'::jsonb->'bank','amount_cents',1000,'reason','Transferencia sintetica19','evidence','Conferencia privada sintetica19'));
SELECT test.assert_true(public.finance_report_page((:'cf19'::jsonb->>'office')::uuid,test.report_filter19()||jsonb_build_object('unit_id',:'cf19'::jsonb->'unit'),1) @> '{"total":7,"summary":{"received_cents":5000,"expense_cents":0}}' AND public.finance_report_page((:'cf19'::jsonb->>'office')::uuid,test.report_filter19()||jsonb_build_object('unit_id',:'cf19'::jsonb->'unit','service_id',:'finance_service19'),1)->>'total'='4','19: transfer pairs stay outside receipt and service cohort');
-- A closed18 cash position retains the original physical discrepancy, not a documentary adjustment.
SELECT public.closure_operate((:'f19'::jsonb->>'office')::uuid,test.closure_op(:'f19','close',7));
SELECT test.assert_true(public.quick_operate((:'f19'::jsonb->>'office')::uuid,:'op19') @> '{"total_cents":500,"statement":{"session":{"status":"closed"}}}','19: old quick replay cannot reopen current closed18 statement');
SELECT test.assert_true(public.finance_report_page((:'f19'::jsonb->>'office')::uuid,test.report_filter19('cash')||jsonb_build_object('unit_id',:'f19'::jsonb->'unit'),1) @> '{"total":1,"summary":{"cash_expected_cents":10500,"cash_counted_cents":10507,"divergence_count":1},"items":[{"status":"closed","expected_cents":10500,"counted_cents":10507,"difference_cents":7}]}','19: cash report preserves original close counted difference');
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'f19'::jsonb->>'office',(:'op19'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_session_version',3))::text),'PT409','19: closed18 session denies new quick');
-- Own scope, all needs two independent capabilities, actor UID options, snapshot revocation.
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','finance.reports.read','finance.reports.export'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.assert_true(public.finance_report_page('00000000-0000-4000-e000-000000000151',test.report_filter19('obligations')||jsonb_build_object('service_id',:'f19'::jsonb->'service'),1)->>'total'='0','19: own report excludes another actor operations');
SELECT test.assert_true(public.finance_report_options('00000000-0000-4000-e000-000000000151','operators','',1) @> '{"total":1,"items":[{"id":"00000000-0000-4000-a000-000000000152"}]}','19: operators options use own UID');
SELECT test.expect_error($q$SELECT public.finance_report_page('00000000-0000-4000-e000-000000000151',test.report_filter19('movements','all'),1)$q$,'PT403','19: all needs report.read_all and cash.read_all');
SELECT test.expect_error($q$SELECT public.finance_report_page('00000000-0000-4000-e000-000000000151',test.report_filter19()||'{"operator_id":"00000000-0000-4000-a000-000000000151"}',1)$q$,'PT403','19: own cannot filter another operator');
SELECT test.expect_error(format('SELECT public.quick_context(%L,%L,%L,1,1,1)',:'f19'::jsonb->>'office',:'f19'::jsonb->>'session',''),'PT403','19: reports permission never grants quick');
SELECT public.finance_report_begin('00000000-0000-4000-e000-000000000151',test.report_filter19(),gen_random_uuid()) AS employee_snap19 \gset
SELECT test.expect_error(format('SELECT public.finance_report_chunk(%L,%L,0)',:'f19'::jsonb->>'office',:'snap19'::jsonb->>'id'),'PT404','19: another actor cannot read saved report');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','finance.reports.read'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.finance_report_chunk(%L,%L,0)',:'f19'::jsonb->>'office',:'employee_snap19'::jsonb->>'id'),'PT403','19: export revoked between chunks');
SELECT test.expect_error(format('SELECT public.finance_report_authorize(%L,%L,%L,gen_random_uuid())',:'f19'::jsonb->>'office',:'employee_snap19'::jsonb->>'id','pdf'),'PT403','19: final authorize repeats export authority');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT test.expect_error($q$SELECT public.finance_report_context('00000000-0000-4000-e000-000000000151')$q$,'PT403','19: client excluded reports');
SELECT test.expect_error($q$SELECT public.quick_context('00000000-0000-4000-e000-000000000151',NULL,'',1,1,1)$q$,'PT403','19: client excluded quick');
RESET ROLE;
-- Hard limit is explicit; chunks are immutable and never partial.
CREATE FUNCTION test.report_mass19(p_service uuid,p_count integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE rid uuid;rq jsonb;BEGIN
 FOR n IN 1..p_count LOOP
 rq:=public.request_create('00000000-0000-4000-e000-000000000151',jsonb_build_object('origin','presencial','title','Obrigacao sintetica limite19','customer_id',NULL,'assignee_id','00000000-0000-4000-b000-000000000151','priority','normal','priority_reason','','internal_note','','items',jsonb_build_array(jsonb_build_object('service_id',p_service,'quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))),gen_random_uuid(),gen_random_uuid());
 rid:=(rq->>'id')::uuid;PERFORM public.charges_create('00000000-0000-4000-e000-000000000151',rid,'[{"due_date":"2027-01-01","amount_cents":0}]',gen_random_uuid());
 END LOOP;
END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.service_create('00000000-0000-4000-e000-000000000151',:'def19'::jsonb||'{"code":"LIMIT19","name":"Limite sintetico19","price_cents":0}','Servico para limite local19',gen_random_uuid())->>'id' AS limitservice19 \gset
SELECT test.report_mass19(:'limitservice19',1000);
SELECT test.report_filter19('obligations')||jsonb_build_object('service_id',:'limitservice19') AS limitfilter19 \gset
SELECT gen_random_uuid() AS limitkey19 \gset
SELECT public.finance_report_begin('00000000-0000-4000-e000-000000000151',:'limitfilter19',:'limitkey19') AS limitsnap19 \gset
SELECT test.assert_true(:'limitsnap19'::jsonb->>'total'='1000' AND jsonb_array_length(public.finance_report_chunk('00000000-0000-4000-e000-000000000151',(:'limitsnap19'::jsonb->>'id')::uuid,0)->'items')=500 AND jsonb_array_length(public.finance_report_chunk('00000000-0000-4000-e000-000000000151',(:'limitsnap19'::jsonb->>'id')::uuid,500)->'items')=500,'19: exactly1000 accepted in two500 chunks');
SELECT test.assert_true(public.finance_report_page('00000000-0000-4000-e000-000000000151',:'limitfilter19',2)->'items'=(SELECT jsonb_agg(x ORDER BY n) FROM jsonb_array_elements(public.finance_report_chunk('00000000-0000-4000-e000-000000000151',(:'limitsnap19'::jsonb->>'id')::uuid,0)->'items')WITH ORDINALITY a(x,n) WHERE n BETWEEN 6 AND 10),'19: page2 is the same ordered window as immutable chunk, without serializing all rows');
SELECT test.report_mass19(:'limitservice19',1);
SELECT test.expect_error(format('SELECT public.finance_report_begin(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000151',:'limitfilter19'),'PT422','19: 1001 explicitly denied, no partial export');
SELECT test.assert_true(public.finance_report_begin('00000000-0000-4000-e000-000000000151',:'limitfilter19',:'limitkey19')=:'limitsnap19'::jsonb AND public.finance_report_chunk('00000000-0000-4000-e000-000000000151',(:'limitsnap19'::jsonb->>'id')::uuid,500)->>'total'='1000','19: old1000 snapshot stable after new1001st obligation');
SELECT test.expect_error(format('SELECT public.finance_report_begin(%L,%L,%L)','00000000-0000-4000-e000-000000000151',(:'limitfilter19'::jsonb||'{"status":"zero"}')::text,:'limitkey19'),'PT409','19: snapshot key different filters rejected');
SELECT gen_random_uuid() AS downloadkey19 \gset
SELECT public.finance_report_authorize('00000000-0000-4000-e000-000000000151',(:'limitsnap19'::jsonb->>'id')::uuid,'pdf',:'downloadkey19');
SELECT test.assert_true(public.finance_report_authorize('00000000-0000-4000-e000-000000000151',(:'limitsnap19'::jsonb->>'id')::uuid,'pdf',:'downloadkey19')='{"authorized":true}','19: export authorization idempotent');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.audit_events WHERE request_id=:'downloadkey19')=1 AND(SELECT changes->>'format' FROM public.audit_events WHERE request_id=:'downloadkey19')='pdf' AND NOT EXISTS(SELECT FROM public.audit_events WHERE action IN('quick.completed','finance.report_prepared','finance.report_exported','finance.report_timezone_changed') AND changes::text ~ 'Evidencia|Motivo|Conferencia|@|529982'),'19: prepare/delivery audited once with enum format and no free personal data');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.quick_fixture19() AS af19 \gset
SELECT public.service_create('00000000-0000-4000-e000-000000000151',:'def19'::jsonb||'{"code":"COMPLEX19","name":"Contrato complexo19","person_required":true,"approval_required":true}','Politica complexa preservada19',gen_random_uuid())->>'id' AS complexservice19 \gset
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'af19'::jsonb->>'office',(test.quick_op19(:'af19')||jsonb_build_object('service_id',:'complexservice19'))::text),'PT409','19: anonymous complex policy denied without changing catalog');
SELECT test.assert_true(public.quick_context('00000000-0000-4000-e000-000000000151',(:'af19'::jsonb->>'session')::uuid,'COMPLEX19',1,1,1)->>'services_total'='0','19: context excludes services requiring person or approval');
SELECT test.quick_fixture19() AS bf19 \gset
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'af19'::jsonb->>'office',(test.quick_op19(:'af19')||jsonb_build_object('payment_method_id',:'bf19'::jsonb->'cash'))::text),'PT409','19: method from another unit denied atomically');
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','cash.open','quick.perform','services.read','services.perform','requests.read','requests.create','requests.update','charges.read','charges.create','finance.reports.read','finance.reports.export'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.quick_context(%L,%L,%L,1,1,1)',:'af19'::jsonb->>'office',:'af19'::jsonb->>'session',''),'PT404','19: quick capability cannot select colleague session');
SELECT public.cash_open('00000000-0000-4000-e000-000000000151',(:'af19'::jsonb->>'unit')::uuid,(:'af19'::jsonb->>'cashaccount')::uuid,10000,gen_random_uuid())->'sessions'->0->>'id' AS employeesession19 \gset
SELECT test.quick_op19(:'af19')||jsonb_build_object('session_id',:'employeesession19','adjustment','{"kind":"discount","value":1000,"reason":"Desconto autorizado19"}'::jsonb,'quoted_total_cents',450,'presented_cents',450) AS discountop19 \gset
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'af19'::jsonb->>'office',:'discountop19'),'PT403','19: discount needs independent services.discount');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','cash.open','quick.perform','services.read','services.perform','services.discount','requests.read','requests.create','requests.update','charges.read','charges.create','finance.reports.read','finance.reports.export'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.assert_true(public.quick_operate('00000000-0000-4000-e000-000000000151',:'discountop19')->>'total_cents'='450','19: authorized discount computes server price450');
SELECT test.assert_true(public.finance_report_page('00000000-0000-4000-e000-000000000151',test.report_filter19()||jsonb_build_object('unit_id',:'af19'::jsonb->'unit'),1) @> '{"total":1,"summary":{"received_cents":450}}','19: own movement uses actual event actor');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','cash.open','quick.perform','services.read','services.perform','requests.read','requests.create','requests.update','charges.read','charges.create','finance.reports.read','finance.reports.export'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.quick_operate(%L,%L)',:'af19'::jsonb->>'office',:'discountop19'),'PT403','19: successful replay revalidates revoked historical adjustment permission');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true(public.finance_report_page('00000000-0000-4000-e000-000000000151',test.report_filter19('obligations')||jsonb_build_object('service_id',:'f19'::jsonb->'service'),1) @> '{"summary":{"contracted_cents":500,"received_cents":null,"allocated_cents":500,"balance_cents":0}}','19: obligation allocated net is explicit and never called gross receipt');
SELECT test.expect_error(format('SELECT public.finance_report_page(%L,%L,1)',:'af19'::jsonb->>'office',(test.report_filter19('cash')||jsonb_build_object('account_id',:'af19'::jsonb->'bank'))::text),'PT422','19: cash view rejects a bank account instead of silently matching nothing');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.customer_create('00000000-0000-4000-e000-000000000151','{"kind":"person","name":"Nome pessoal fora do relatorio19","contacts":[]}',gen_random_uuid())->>'id' AS scopecustomer19 \gset
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','finance.reports.read','finance.reports.export','customers.read','cash.read_all','finance.reports.read_all'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.finance_report_page(%L,%L,1)','00000000-0000-4000-e000-000000000151',(test.report_filter19()||jsonb_build_object('customer_id',:'scopecustomer19'))::text),'PT404','19: customer filter requires current scope08 even with reports all');
SELECT public.finance_report_begin('00000000-0000-4000-e000-000000000151',test.report_filter19('obligations','all')||jsonb_build_object('service_id',:'f19'::jsonb->'service'),gen_random_uuid()) AS allsnap19 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.customer_relation_command('00000000-0000-4000-e000-000000000151',:'scopecustomer19','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000152","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())->'assignments'->0->>'id' AS customerassignment19 \gset
SELECT public.team_set_member('00000000-0000-4000-e000-000000000151','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','finance.reports.read','finance.reports.export','customers.read','finance.reports.read_all'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.finance_report_chunk(%L,%L,0)','00000000-0000-4000-e000-000000000151',:'allsnap19'::jsonb->>'id'),'PT403','19: losing cash.read_all invalidates saved all snapshot despite reports.read_all');
SELECT public.finance_report_begin('00000000-0000-4000-e000-000000000151',test.report_filter19()||jsonb_build_object('customer_id',:'scopecustomer19'),gen_random_uuid()) AS customersnap19 \gset
SELECT test.assert_true(public.finance_report_chunk('00000000-0000-4000-e000-000000000151',(:'customersnap19'::jsonb->>'id')::uuid,0)->>'total'='0','19: assigned customer filter may produce a known empty report');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.customer_relation_command('00000000-0000-4000-e000-000000000151',:'scopecustomer19','assignment.revoke',jsonb_build_object('id',:'customerassignment19','version',1),gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.finance_report_chunk(%L,%L,0)','00000000-0000-4000-e000-000000000151',:'customersnap19'::jsonb->>'id'),'PT404','19: scope08 revoked between chunks invalidates report');
SELECT test.expect_error(format('SELECT public.finance_report_authorize(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000151',:'customersnap19'::jsonb->>'id','csv'),'PT404','19: final authorization rechecks customer scope08');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true(public.finance_report_page('00000000-0000-4000-e000-000000000151',test.report_filter19()||'{"from_date":"0001-01-01","until_date":"0001-01-02"}',1)->>'total'='0','19: ISO date range has no invented1900 floor, still one local day');
RESET ROLE;
