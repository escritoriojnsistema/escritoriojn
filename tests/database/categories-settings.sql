-- Categories fixtures are local to the disposable runner, never hosted accounts.
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)
 SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'category-'||n||'@example.test',now(),'fixture' FROM generate_series(731,736)n;
INSERT INTO auth.sessions(id,user_id)
 SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000731' AND '00000000-0000-4000-a000-000000000736';
INSERT INTO public.profiles(id,display_name)
 SELECT id,'Pessoa de teste categorias' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000731' AND '00000000-0000-4000-a000-000000000736';
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000731','Categorias A'),('00000000-0000-4000-e000-000000000732','Categorias B');
INSERT INTO public.memberships(id,office_id,user_id,role_code)
 SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=736 THEN '00000000-0000-4000-e000-000000000732' ELSE '00000000-0000-4000-e000-000000000731' END::uuid,
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n IN(731,736) THEN 'owner' WHEN n=732 THEN 'admin' WHEN n=734 THEN 'client' ELSE 'employee' END FROM generate_series(731,736)n;
INSERT INTO private.team_member_permissions(membership_id,permission_code)
 VALUES ('00000000-0000-4000-b000-000000000732','categories.manage'),('00000000-0000-4000-b000-000000000733','categories.manage');
SELECT test.assert_true((SELECT count(*) FROM private.service_categories WHERE office_id='00000000-0000-4000-e000-000000000731' AND name IN('Documentos','Cópias e impressões','Digitação','Plastificação','Certidões','Registros','Consultoria','Contabilidade','Fiscal','Trabalhista','Rural','Previdenciário','Jurídico','Atendimento','Outros'))=15
 AND NOT EXISTS(SELECT FROM public.services WHERE office_id='00000000-0000-4000-e000-000000000731'),'categorias: manual abrangido sem semear servicos ou precos');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.service_categories'::regclass,'private.service_category_commands'::regclass,'private.service_version_categories'::regclass))
 AND NOT has_table_privilege('authenticated','private.service_categories','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','private.service_version_categories','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('service_role','private.service_category_commands','SELECT,INSERT,UPDATE,DELETE'),'categorias: RLS e ACL fechadas inclusive associacoes e motivos');
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.service_categories_state('00000000-0000-4000-e000-000000000731')$q$,'42501','categorias: leitura anonima negada');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.service_categories_state('00000000-0000-4000-e000-000000000731')$q$,'PT401','categorias: sessao real obrigatoria');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000734","session_id":"00000000-0000-4000-c000-000000000734"}';
SELECT test.assert_true((SELECT bool_and(NOT(item ? 'services') AND NOT(item ? 'created_at') AND item ?& ARRAY['id','name','revision','is_documents']) FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items')item)
 AND public.service_categories_state('00000000-0000-4000-e000-000000000731')->>'can_manage'='false','categorias: cliente ve apenas metadados necessarios');
SELECT test.expect_error($q$SELECT public.service_categories_state('00000000-0000-4000-e000-000000000732')$q$,'PT403','categorias: isolamento por escritorio');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000733","session_id":"00000000-0000-4000-c000-000000000733"}';
SELECT test.assert_true(public.service_categories_state('00000000-0000-4000-e000-000000000731')->>'can_manage'='false','categorias: capacidade isolada nao transforma funcionario em gestor');
SELECT test.expect_error($q$SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Negada","reason":"Teste"}',gen_random_uuid())$q$,'PT403','categorias: funcionario nao gerencia mesmo com capacidade');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000735","session_id":"00000000-0000-4000-c000-000000000735"}';
SELECT test.expect_error($q$SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Negada","reason":"Teste"}',gen_random_uuid())$q$,'PT403','categorias: sem concessao nao gerencia');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000732","session_id":"00000000-0000-4000-c000-000000000732"}';
SELECT test.assert_true(public.service_categories_state('00000000-0000-4000-e000-000000000731')->>'can_manage'='true','categorias: admin com concessao pode gerenciar');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000731","session_id":"00000000-0000-4000-c000-000000000731"}';
SELECT gen_random_uuid() AS category_create_key \gset
SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Categoria preservada","reason":"Organizar exemplo local"}',:'category_create_key');
SELECT item->>'id' AS category_id FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items')item WHERE item->>'name'='Categoria preservada' \gset
SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Categoria preservada","reason":"Organizar exemplo local"}',:'category_create_key');
SELECT test.expect_error(format('SELECT public.service_categories_command(%L,%L,%L)','00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Outra categoria","reason":"Chave ja usada"}',:'category_create_key'),'PT409','categorias: chave nao pode representar outro comando');
SELECT test.expect_error($q$SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"categoria preservada","reason":"Duplicada"}',gen_random_uuid())$q$,'PT409','categorias: nomes nao duplicam por caixa');
SELECT test.expect_error($q$SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Sem motivo"}',gen_random_uuid())$q$,'PT422','categorias: motivo obrigatorio no banco');
SELECT test.expect_error($q$SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Teste","reason":"Teste","actor_id":"00000000-0000-4000-a000-000000000731"}',gen_random_uuid())$q$,'PT422','categorias: autoridade extra rejeitada no banco');
SELECT '{"code":"CATEGORIA-TESTE","name":"Servico preservado","category":"Categoria preservada","unit":"unidade","price_cents":1234,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false,"settlement_required":true,"required_capabilities":[],"fields":[],"checklist":[],"quantity_min":1,"quantity_max":1000,"max_discount_bps":0,"max_surcharge_bps":0,"allow_courtesy":false,"allow_price_override":false}' AS category_service \gset
SELECT public.service_create('00000000-0000-4000-e000-000000000731',:'category_service','Teste local categorias',gen_random_uuid())->>'id' AS category_service_id \gset
SELECT public.service_quote('00000000-0000-4000-e000-000000000731',:'category_service_id',1,'{"kind":"none","value":0,"reason":""}') AS category_snapshot \gset
SELECT gen_random_uuid() AS category_rename_key \gset
SELECT jsonb_build_object('kind','rename','category_id',:'category_id','expected_revision',1,'name','Categoria renomeada','reason','Ajustar nome local') AS category_rename \gset
SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731',:'category_rename',:'category_rename_key');
SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731',:'category_rename',:'category_rename_key');
SELECT test.assert_true(public.service_detail('00000000-0000-4000-e000-000000000731',:'category_service_id',1)->'current'->>'category'='Categoria preservada'
 AND public.service_detail('00000000-0000-4000-e000-000000000731',:'category_service_id',1)->'current'->>'category_name'='Categoria renomeada'
 AND public.service_detail('00000000-0000-4000-e000-000000000731',:'category_service_id',1)->'current'->>'category_id'=:'category_id'
 AND public.service_quote('00000000-0000-4000-e000-000000000731',:'category_service_id',1,'{"kind":"none","value":0,"reason":""}')->'definition'=:'category_snapshot'::jsonb->'definition'
 AND public.services_page('00000000-0000-4000-e000-000000000731','Categoria renomeada',1,3)->>'total'='1','categorias: renomear preserva ID texto historico snapshot e preco, pesquisa segue nome oficial');
SELECT test.expect_error(format('SELECT public.service_categories_command(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'category_rename'),'PT409','categorias: revisao antiga impede sobrescrita');
SELECT test.expect_error(format('SELECT public.service_categories_command(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',jsonb_build_object('kind','delete','category_id',:'category_id','expected_revision',2,'reason','Teste de protecao')::text),'PT409','categorias: categoria com qualquer versao historica nao pode ser excluida');
SELECT test.expect_error(format('SELECT public.service_publish(%L,%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'category_service_id',:'category_service','Nome antigo'),'PT422','categorias: novas publicacoes devem usar categoria vigente');
SELECT public.service_publish('00000000-0000-4000-e000-000000000731',:'category_service_id',:'category_service'::jsonb||'{"category":"Categoria renomeada","price_cents":2345}',1,'Atualizar com categoria oficial',gen_random_uuid());
SELECT test.assert_true(public.service_detail('00000000-0000-4000-e000-000000000731',:'category_service_id',1)->'current'->>'category_id'=:'category_id'
 AND :'category_snapshot'::jsonb->>'total_cents'='1234','categorias: nova versao segue ID canonico e nao recalcula snapshot anterior');
SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Sem uso","reason":"Teste local de exclusao"}',gen_random_uuid());
SELECT item->>'id' AS category_unused_id FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items')item WHERE item->>'name'='Sem uso' \gset
SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731',jsonb_build_object('kind','delete','category_id',:'category_unused_id','expected_revision',1,'reason','Nao utilizada'),gen_random_uuid());
SELECT test.assert_true(NOT EXISTS(SELECT FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items')item WHERE item->>'id'=:'category_unused_id'),'categorias: exclusao de categoria sem uso confirmada no estado oficial');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.service_category_commands WHERE office_id='00000000-0000-4000-e000-000000000731')=4
 AND (SELECT count(*) FROM public.audit_events WHERE office_id='00000000-0000-4000-e000-000000000731' AND action LIKE 'categories.%')=4
 AND (SELECT command->>'reason' FROM private.service_category_commands WHERE office_id='00000000-0000-4000-e000-000000000731' AND idempotency_key=:'category_rename_key')='Ajustar nome local','categorias: repeticoes nao duplicam comandos ou auditoria e motivo preservado');
SELECT test.expect_error(format('DELETE FROM private.service_version_categories WHERE service_id=%L',:'category_service_id'),'PT409','categorias: associacoes historicas imutaveis');
ALTER TABLE public.audit_events ADD CONSTRAINT test_category_audit_failure CHECK(action<>'categories.created') NOT VALID;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000731","session_id":"00000000-0000-4000-c000-000000000731"}';
SELECT test.expect_error($q$SELECT public.service_categories_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Rollback categoria","reason":"Auditoria indisponivel"}',gen_random_uuid())$q$,'23514','categorias: falha de auditoria reverte a mutacao');
SELECT test.assert_true(NOT EXISTS(SELECT FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items')item WHERE item->>'name'='Rollback categoria'),'categorias: rollback nao deixa categoria parcial');
RESET ROLE;
ALTER TABLE public.audit_events DROP CONSTRAINT test_category_audit_failure;
