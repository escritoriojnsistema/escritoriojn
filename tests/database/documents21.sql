-- Etapa 21: tested only against disposable databases.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.document_create(uuid,uuid,uuid,uuid,jsonb,uuid)') IS NOT NULL,'21: document create RPC exists');
SELECT test.assert_true((SELECT count(*)=5 AND bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('documents_page','document_options','document_create','document_detail','document_operate')),'21: five invoker wrappers');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_class WHERE oid IN('public.documents'::regclass,'public.document_participants'::regclass,'private.document_revisions'::regclass,'private.document_preparations'::regclass,'private.document_commands'::regclass) AND(NOT relrowsecurity OR has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE'))),'21: five tables RLS and ACL closed');
SELECT test.assert_true((SELECT count(*)=3 FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'documents.%') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'documents.%'),'21: owner-only capability seeds');
SELECT test.assert_true(private.documents_words21(0)='zero reais' AND private.documents_words21(1)='um centavo' AND private.documents_words21(100)='um real' AND private.documents_words21(10000)='cem reais' AND private.documents_words21(10100)='cento e um reais' AND private.documents_words21(100000)='mil reais' AND private.documents_words21(100000000)='um milhão de reais' AND private.documents_words21(210100001)='dois milhões cento e um mil reais e um centavo' AND private.documents_words21(99999999999)='novecentos e noventa e nove milhões novecentos e noventa e nove mil novecentos e noventa e nove reais e noventa e nove centavos','21: exact deterministic BR words bounds');
CREATE TABLE test.documents_before21 AS SELECT 'requests' kind,id,to_jsonb(r) snapshot FROM public.requests r UNION ALL SELECT 'audit',id,to_jsonb(a) FROM public.audit_events a UNION ALL SELECT 'reports',id,to_jsonb(p) FROM private.audit_reports p;
SELECT '00000000-0000-4000-e000-000000000201' AS office21 \gset
SELECT id AS template21 FROM public.template_versions WHERE office_id=:'office21' AND number=1 ORDER BY created_at LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error(format('SELECT public.documents_page(%L,%L,1,3)',:'office21',''),'PT401','21: real session required');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.customer_create(:'office21','{"kind":"person","name":"Álvaro Comprador","identifier":"52998224725","contacts":[]}',gen_random_uuid())->>'id' AS buyer21 \gset
SELECT public.customer_create(:'office21','{"kind":"person","name":"João Vendedor","contacts":[]}',gen_random_uuid())->>'id' AS seller21 \gset
SELECT public.customer_create(:'office21','{"kind":"company","name":"Empresa Fictícia","contacts":[]}',gen_random_uuid())->>'id' AS company21 \gset
SELECT public.service_create(:'office21','{"code":"DOC21","name":"Serviço de documentos","category":"Documentos","unit":"unidade","price_cents":10050,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false,"settlement_required":false,"required_capabilities":["services.perform"],"fields":[],"checklist":[],"quantity_min":1,"quantity_max":1000,"max_discount_bps":0,"max_surcharge_bps":0,"allow_courtesy":false,"allow_price_override":false}','Cadastro teste21',gen_random_uuid())->>'id' AS service21 \gset
SELECT public.request_create(:'office21',jsonb_build_object('origin','presencial','title','Documento de homologação','customer_id',:'buyer21','assignee_id','00000000-0000-4000-b000-000000000201','priority','normal','priority_reason','','items',jsonb_build_array(jsonb_build_object('service_id',:'service21','quantity',2,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb)),'internal_note',''),gen_random_uuid(),gen_random_uuid()) AS req21 \gset
SELECT :'req21'::jsonb->>'id' AS rid21,:'req21'::jsonb->'items'->0->>'id' AS item21 \gset
SELECT jsonb_build_array(jsonb_build_object('role','buyer','customer_id',upper(:'buyer21'),'label','Comprador'),jsonb_build_object('role','seller','customer_id',:'seller21','label','Vendedor')) AS parties21,gen_random_uuid() AS key21 \gset
SELECT public.document_create(:'office21',:'rid21',:'item21',:'template21',:'parties21',:'key21') AS doc21 \gset
SELECT :'doc21'::jsonb->>'id' AS did21 \gset
SELECT test.assert_true(:'doc21'::jsonb->'participants'->0->>'customer_id'=:'buyer21','21: UUID snapshot transport is canonical after uppercase input');
SELECT test.assert_true(:'doc21'::jsonb @> '{"current_revision":1,"revision":1,"status":"draft","can_edit":true,"can_prepare":true,"source":{"customer":{"name":"Álvaro Comprador","identifier":null},"service":{"quantity":2,"total_cents":20100}},"issues":[]}' AND :'doc21'::jsonb->'participants'->0->>'name'='Álvaro Comprador' AND :'doc21'::jsonb->'participants'->1->>'name'='João Vendedor','21: source09/10 and named participants captured without undeclared CPF');
SELECT test.assert_true(public.document_create(:'office21',:'rid21',:'item21',:'template21',:'parties21',:'key21')->>'id'=:'did21','21: create retry returns same document');
SELECT test.expect_error(format('SELECT public.document_create(%L,%L,%L,%L,%L,%L)',:'office21',:'rid21',:'item21',:'template21','[]',:'key21'),'PT409','21: idempotency mismatched payload conflicts');
SELECT test.assert_true(public.documents_page(:'office21','',1,3)->>'total'='1' AND public.document_options(:'office21','items',:'rid21','',1)->'items'->0->>'id'=:'item21' AND(public.document_options(:'office21','templates',NULL,'',1)->>'total')::integer>=1 AND public.document_options(:'office21','customers',NULL,'Álvaro',1)->'items'->0->>'id'=:'buyer21','21: all option kinds and document page official');
SELECT gen_random_uuid() AS prepkey21 \gset
SELECT public.document_operate(:'office21',:'did21',jsonb_build_object('kind','prepare','expected_revision',1,'idempotency_key',:'prepkey21')) AS prepared21 \gset
SELECT test.assert_true(:'prepared21'::jsonb @> '{"revision":1,"status":"prepared","can_prepare":false,"history":[{"revision":1,"prepared":true}]}','21: prepare preserves revision and appends decision');
SELECT jsonb_build_object('content','<script>alert(1)</script> {{cliente.nome}} {{datas.emissao}}','overrides','{"cliente.nome":"Nome local"}'::jsonb,'money_in_words',true) AS input21,gen_random_uuid() AS savekey21 \gset
SELECT public.document_operate(:'office21',:'did21',jsonb_build_object('kind','save','expected_revision',1,'input',:'input21'::jsonb,'idempotency_key',:'savekey21')) AS saved21 \gset
SELECT test.assert_true(:'saved21'::jsonb @> '{"revision":2,"status":"draft","values":{"cliente.nome":"Nome local"}}' AND :'saved21'::jsonb->>'rendered_content' LIKE '<script>alert(1)</script> Nome local %' AND public.document_detail(:'office21',:'did21',1,1)->>'status'='prepared','21: literal HTML retained as plain text and prepared history immutable');
SELECT test.assert_true(public.document_operate(:'office21',:'did21',jsonb_build_object('kind','prepare','expected_revision',1,'idempotency_key',:'prepkey21'))->>'revision'='2','21: replay returns current authorized revision');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','save','expected_revision',1,'input',:'input21'::jsonb,'idempotency_key',gen_random_uuid())),'PT409','21: stale optimistic revision fails');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','save','expected_revision',2,'input',(:'input21'::jsonb||'{"overrides":{"valores.total":"1"}}'),'idempotency_key',gen_random_uuid())),'PT422','21: override must belong to exact template');
SELECT public.document_operate(:'office21',:'did21',jsonb_build_object('kind','save','expected_revision',2,'input',(:'input21'::jsonb||'{"content":"{{cliente.nome}} {{datas.emissao","overrides":{"datas.emissao":"2026-02-30"}}'),'idempotency_key',gen_random_uuid())) AS incomplete21 \gset
SELECT test.assert_true(:'incomplete21'::jsonb->'issues' @> '[{"key":"datas.emissao","code":"invalid_value"},{"key":"datas.emissao","code":"missing_placeholder"},{"key":"content","code":"invalid_placeholder"}]','21: invalid partial typing is saved with issues');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','prepare','expected_revision',3,'idempotency_key',gen_random_uuid())),'PT422','21: incomplete preparation rejects transaction');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.document_preparations WHERE document_id=:'did21') AND (SELECT name='Álvaro Comprador' FROM public.customers WHERE id=:'buyer21'),'21: no partial decision and local edit never changes registry');
UPDATE public.customers SET name='Nome central alterado',version=version+1 WHERE id=:'buyer21';
SET ROLE authenticated;
SELECT test.assert_true(public.document_detail(:'office21',:'did21',NULL,1)->'source'->'customer'->>'name'='Álvaro Comprador','21: registry update does not silently refresh source');
SELECT public.document_operate(:'office21',:'did21',jsonb_build_object('kind','participants','expected_revision',3,'participants',jsonb_build_array(jsonb_build_object('role','buyer','customer_id',:'company21','label','Nova compradora')),'idempotency_key',gen_random_uuid())) AS changed21 \gset
SELECT test.assert_true(:'changed21'::jsonb->'participants'->0->>'name'='Empresa Fictícia' AND public.document_detail(:'office21',:'did21',1,1)->'participants'->0->>'name'='Álvaro Comprador','21: explicit party replacement captures new source and preserves prior');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_detail(%L,%L,NULL,1)',:'office21',:'did21'),'PT403','21: portal client excluded');
RESET ROLE;
CREATE TABLE test.documents_fixture21 AS SELECT :'office21'::uuid office_id,:'rid21'::uuid request_id,:'did21'::uuid document_id,:'buyer21'::uuid buyer_id,:'seller21'::uuid seller_id,:'company21'::uuid company_id,:'key21'::uuid create_key,:'savekey21'::uuid save_key,:'input21'::jsonb saved_input;
GRANT SELECT ON test.documents_fixture21 TO authenticated;
SELECT test.assert_true(NOT EXISTS(SELECT FROM test.documents_before21 b JOIN public.requests r USING(id) WHERE b.kind='requests' AND to_jsonb(r)<>b.snapshot) AND NOT EXISTS(SELECT FROM test.documents_before21 b JOIN public.audit_events a USING(id) WHERE b.kind='audit' AND to_jsonb(a)<>b.snapshot) AND NOT EXISTS(SELECT FROM test.documents_before21 b JOIN private.audit_reports p USING(id) WHERE b.kind='reports' AND to_jsonb(p)<>b.snapshot),'21: preexisting requests audit and PDF snapshots untouched');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'documents.%' AND changes<>'{}'),'21: audit no content or PII');
-- Resolver exercises all declared types without inventing address or CPF sources.
DO $$DECLARE d jsonb;i jsonb;s jsonb;p jsonb;x jsonb;z jsonb;bad text;BEGIN
 d:='{"variables":[{"key":"cliente.cpf","label":"CPF","type":"text","required":true},{"key":"cliente.endereco","label":"Endereço","type":"text","required":true},{"key":"participante.comprador.nome","label":"Comprador","type":"text","required":true},{"key":"participante.vendedor.nome","label":"Vendedor","type":"text","required":true},{"key":"datas.inicio","label":"Início","type":"date","required":true},{"key":"datas.fim","label":"Fim","type":"date","required":true},{"key":"valores.total","label":"Total","type":"money","required":true},{"key":"valores.parcela","label":"Parcela","type":"money","required":false},{"key":"servico.quantidade","label":"Quantidade","type":"number","required":true}]}';
 i:='{"content":"{{cliente.cpf}} {{cliente.endereco}} {{participante.comprador.nome}} {{participante.vendedor.nome}} {{datas.inicio}} {{datas.fim}} {{valores.total}} {{valores.parcela}} {{servico.quantidade}}","overrides":{"datas.inicio":"0001-01-01","datas.fim":"9999-12-31","valores.parcela":"0.01"},"money_in_words":true}';
 s:='{"customer":{"kind":"company","name":"Empresa","identifier":"52998224725"},"service":{"quantity":2,"total_cents":100000000},"emitted_on":"2026-10-27"}';
 x:=private.documents_resolve21(d,i,s,'[]');
 PERFORM test.assert_true(x->'issues' @> '[{"key":"cliente.cpf","code":"required"},{"key":"cliente.endereco","code":"required"},{"key":"participante.comprador.nome","code":"participant_required"},{"key":"participante.vendedor.nome","code":"participant_required"}]' AND x->'values'->'cliente.cpf'='null' AND x->'words'->>'valores.total'='um milhão de reais' AND x->'words'->>'valores.parcela'='um centavo' AND x->'formatted'->>'datas.inicio'='01/01/0001' AND x->'formatted'->>'datas.fim'='31/12/9999','21: missing parties address CPF and exact money/date limits');
 i:=jsonb_set(i,'{overrides}',(i->'overrides')||'{"cliente.cpf":"529.982.247-25","cliente.endereco":"Rua local","participante.comprador.nome":"Nome local","participante.vendedor.nome":"Nome local","datas.inicio":"2026-03-01","datas.fim":"2026-02-28","servico.quantidade":"100000.000"}');
 x:=private.documents_resolve21(d,i,s,'[]');
 PERFORM test.assert_true(x->'issues' @> '[{"code":"date_order"},{"code":"participant_required"}]' AND x->'values'->>'cliente.cpf'='52998224725' AND x->'values'->>'servico.quantidade'='100000','21: valid local CPF/date ordering/numeric canonical and required role cannot be bypassed');
 FOREACH bad IN ARRAY ARRAY['-1','1000000000','1e2','01','NaN','1.999'] LOOP x:=private.documents_resolve21(d,jsonb_set(i,'{overrides,valores.total}',to_jsonb(bad)),s,'[]');PERFORM test.assert_true(x->'issues' @> '[{"key":"valores.total","code":"invalid_value"}]','21: invalid money stays draft');END LOOP;
 FOREACH bad IN ARRAY ARRAY['0000-01-01','2025-02-29','2026-04-31','2026-1-01','infinity'] LOOP x:=private.documents_resolve21(d,jsonb_set(i,'{overrides,datas.inicio}',to_jsonb(bad)),s,'[]');PERFORM test.assert_true(x->'issues' @> '[{"key":"datas.inicio","code":"invalid_value"}]','21: invalid date stays draft');END LOOP;
 x:=private.documents_resolve21(d,jsonb_set(i,'{content}','"{{unknown.key}} {{datas.inicio"'),s,'[]');PERFORM test.assert_true(x->'issues' @> '[{"code":"unknown_variable"},{"code":"invalid_placeholder"},{"code":"missing_placeholder"}]' AND x->>'rendered_content'='{{unknown.key}} {{datas.inicio','21: unknown and partial placeholders stay literal with explicit issues');
 x:=private.documents_resolve21('{"variables":[{"key":"cliente.endereco","label":"Endereço","type":"text","required":true}]}',jsonb_build_object('content',repeat('{{cliente.endereco}}',1000),'overrides',jsonb_build_object('cliente.endereco',repeat('a',500)),'money_in_words',true),s,'[]');PERFORM test.assert_true(x->'issues' @> '[{"key":"content","code":"invalid_value"}]' AND char_length(x->>'rendered_content')=20000,'21: expansion overflow preserves input and blocks prepare without truncation');
 x:=private.documents_resolve21(d,jsonb_set(i,'{overrides,cliente.cpf}','"11111111111"'),s,'[]');PERFORM test.assert_true(x->'issues' @> '[{"key":"cliente.cpf","code":"invalid_value"}]','21: invalid CPF digits stay pending');
END$$;
SELECT test.expect_error(format('UPDATE private.document_revisions SET input=%L WHERE document_id=%L','{}',:'did21'),'PT409','21: revisions immutable');
SELECT test.expect_error(format('DELETE FROM public.document_participants WHERE document_id=%L',:'did21'),'PT409','21: participants immutable');
SELECT test.expect_error(format('DELETE FROM private.document_preparations WHERE document_id=%L',:'did21'),'PT409','21: decisions immutable');
SELECT test.expect_error(format('DELETE FROM private.document_commands WHERE document_id=%L',:'did21'),'PT409','21: commands immutable');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_constraint fk WHERE fk.contype='f' AND fk.conrelid IN('public.documents'::regclass,'public.document_participants'::regclass,'private.document_revisions'::regclass,'private.document_preparations'::regclass,'private.document_commands'::regclass) AND NOT EXISTS(SELECT FROM pg_index ix WHERE ix.indrelid=fk.conrelid AND ix.indisvalid AND ix.indpred IS NULL AND ix.indexprs IS NULL AND (ix.indkey::smallint[])[0:cardinality(fk.conkey)-1] @> fk.conkey)),'21: every new FK has covering index');
SELECT test.assert_true(NOT has_function_privilege('anon','public.document_create(uuid,uuid,uuid,uuid,jsonb,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','private.documents_access21(uuid,uuid,text,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','private.documents_resolve21(jsonb,jsonb,jsonb,jsonb)','EXECUTE'),'21: helper and anonymous RPC ACL closed');
-- Historical merge keeps exact source; no automatic target following. Broader read is required.
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT '00000000-0000-4000-b000-000000000202',p FROM unnest(ARRAY['documents.read','documents.update','documents.create','requests.read','requests.read_all','customers.read'])p ON CONFLICT DO NOTHING;
INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,created_by) VALUES(:'office21',:'buyer21','assignment','00000000-0000-4000-b000-000000000202','00000000-0000-4000-a000-000000000201'),(:'office21',:'seller21','assignment','00000000-0000-4000-b000-000000000202','00000000-0000-4000-a000-000000000201'),(:'office21',:'company21','assignment','00000000-0000-4000-b000-000000000202','00000000-0000-4000-a000-000000000201');
UPDATE public.customers SET merged_into_id=:'company21' WHERE id=:'buyer21';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.expect_error(format('SELECT public.document_detail(%L,%L,NULL,1)',:'office21',:'did21'),'PT403','21: merged historical source requires read_all even previously assigned');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','customers.read_all');
SET ROLE authenticated;
SELECT test.assert_true(public.document_detail(:'office21',:'did21',1,1)->'source'->'customer'->>'customer_id'=:'buyer21','21: read_all historical merged source retains exact original');
SELECT test.assert_true(NOT(public.document_detail(:'office21',:'did21',NULL,1)->>'can_edit')::boolean,'21: historical/read_all does not confer work authority');
RESET ROLE;
UPDATE public.customers SET merged_into_id=NULL,blocked_at=clock_timestamp() WHERE id=:'buyer21';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.document_detail(%L,%L,NULL,1)',:'office21',:'did21'),'PT403','21: blocked source denies even read_all');
RESET ROLE;
UPDATE public.customers SET blocked_at=NULL WHERE id=:'buyer21';
BEGIN;
UPDATE public.requests SET status='concluido' WHERE id=:'rid21';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(NOT(public.document_detail(:'office21',:'did21',NULL,1)->>'can_edit')::boolean,'21: completed request permits read only');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','prepare','expected_revision',4,'idempotency_key',gen_random_uuid())),'PT403','21: completed request blocks prepare');
RESET ROLE;
ROLLBACK;
SELECT test.assert_true(NOT EXISTS(SELECT FROM test.documents_functions_before21 b JOIN pg_proc p ON p.oid=b.oid WHERE pg_get_functiondef(p.oid)<>b.body),'21: all preexisting function bodies preserved except explicit team allowlists');
SELECT test.assert_true((SELECT column_default='8' FROM information_schema.columns WHERE table_schema='private' AND table_name='audit_reports' AND column_name='renderer_version'),'21: new audit presentation8 default');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.document_create(%L,%L,%L,%L,%L,gen_random_uuid())',:'office21',:'rid21',:'item21',:'template21',jsonb_build_array(jsonb_build_object('role','buyer','customer_id',:'buyer21','label','Comprador'),jsonb_build_object('role','seller','customer_id',:'buyer21','label','Vendedor'))),'PT422','21: buyer seller cannot reference same customer');
SELECT test.expect_error(format('SELECT public.document_create(%L,%L,%L,%L,%L,gen_random_uuid())',:'office21',:'rid21',:'item21',:'template21',jsonb_build_array(jsonb_build_object('role','buyer','customer_id',:'buyer21','label',U&'\00a0\2000\feff'))),'PT422','21: whitespace-only Unicode participant labels rejected');
SELECT test.expect_error(format('SELECT public.document_create(%L,%L,%L,%L,%L,gen_random_uuid())',:'office21',:'rid21',:'item21',:'template21',jsonb_build_array(jsonb_build_object('role','buyer','customer_id',:'buyer21','label','Comprador','extra',true))),'PT422','21: participant objects closed');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','save','expected_revision',4,'input',jsonb_build_object('content',repeat('🙂',30001),'overrides','{}'::jsonb,'money_in_words',true),'idempotency_key',gen_random_uuid())),'PT422','21: Unicode draft limit no truncation');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','save','expected_revision',4,'input',jsonb_build_object('content',chr(1),'overrides','{}'::jsonb,'money_in_words',true),'idempotency_key',gen_random_uuid())),'PT422','21: control characters rejected');
SELECT test.expect_error(format('SELECT public.document_operate(%L,%L,%L)',:'office21',:'did21',jsonb_build_object('kind','prepare','expected_revision',4,'extra',true,'idempotency_key',gen_random_uuid())),'PT422','21: operation object closed');
SELECT test.expect_error(format('SELECT public.documents_page(%L,%L,1,50)',:'office21',''),'PT422','21: fixed3/5 document pages');
SELECT test.expect_error(format('SELECT public.document_detail(%L,gen_random_uuid(),NULL,1)',:'office21'),'PT404','21: missing document404');
SELECT test.expect_error(format('SELECT public.document_detail(%L,%L,99,1)',:'office21',:'did21'),'PT404','21: missing revision404');
SELECT test.assert_true(public.document_options(:'office21','requests',NULL,'homologação',1)->>'total'='1','21: writable request selector scoped');
RESET ROLE;
UPDATE public.customers SET blocked_at=clock_timestamp() WHERE id=:'seller21';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.document_detail(%L,%L,1,1)',:'office21',:'did21'),'PT403','21: removed old seller blocked denies historical revision1');
SELECT test.assert_true(public.documents_page(:'office21','',1,3)->>'total'='0','21: inaccessible source filters document page without exposing summary');
RESET ROLE;
UPDATE public.customers SET blocked_at=NULL WHERE id=:'seller21';
BEGIN;
UPDATE public.profiles SET display_name=U&'\00a0\2000\feff' WHERE id='00000000-0000-4000-a000-000000000201';
SET ROLE authenticated;
SELECT test.assert_true(public.document_create(:'office21',:'rid21',:'item21',:'template21','[]',gen_random_uuid())->>'author_name'='Nome não informado','21: legacy whitespace author sanitized via existing08 helper');
RESET ROLE;
ROLLBACK;
SELECT test.expect_error(format('SELECT public.document_create(%L,%L,%L,%L,%L,gen_random_uuid())',:'office21',:'rid21',:'item21',:'template21',jsonb_build_array(jsonb_build_object('role','buyer','customer_id','abcdefab-1234-4abc-8abc-abcdefabcdef','label','Comprador'),jsonb_build_object('role','seller','customer_id','ABCDEFAB-1234-4ABC-8ABC-ABCDEFABCDEF','label','Vendedor'))),'PT422','21: buyer and seller UUID identity ignores case');
SELECT test.expect_error(format('SELECT public.document_create(%L,%L,%L,%L,%L,gen_random_uuid())',:'office21',:'rid21',:'item21',:'template21',jsonb_build_array(jsonb_build_object('role','other','customer_id','abcdefab-1234-4abc-8abc-abcdefabcdef','label','Outro'),jsonb_build_object('role','other','customer_id','ABCDEFAB-1234-4ABC-8ABC-ABCDEFABCDEF','label','Outro'))),'PT422','21: duplicate role UUID identity ignores case');
