-- New behavior, only on synthetic local fixtures.
SELECT test.assert_true((SELECT count(*)=2 AND bool_and(role_code='owner') FROM public.role_permissions WHERE permission_code LIKE 'accounts.%'),'conta: capacidades novas seed somente owner');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.account_data'::regclass,'private.account_corrections'::regclass,'private.account_email_intents'::regclass)) AND NOT has_table_privilege('authenticated','private.account_data','SELECT,UPDATE') AND NOT has_table_privilege('service_role','private.account_corrections','SELECT,UPDATE'),'conta: campos pessoais e propostas sem acesso bruto');
SELECT test.assert_true((SELECT count(*)=4 AND bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""'] AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('account_read','account_save','account_correction_create','account_correction_apply')),'conta: quatro wrappers invoker sem acesso anonimo');
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.account_read('00000000-0000-4000-e000-000000000091')$q$,'42501','conta: anonimo negado');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT public.account_read('00000000-0000-4000-e000-000000000091') AS own_account \gset

SELECT test.assert_true(:'own_account'::jsonb->>'can_edit'='true' AND length(:'own_account'::jsonb->>'version')=64 AND :'own_account'::jsonb->>'email' IS NOT NULL,'conta: funcionario consulta os dados reais da propria conta');
SELECT (:'own_account'::jsonb - ARRAY['version','can_edit','cpf_masked','pending_email','correction_request_id'])||'{"name":"Funcionario Editado","cpf":"11144477735"}'::jsonb AS own_values \gset
SELECT public.account_save('00000000-0000-4000-e000-000000000091',:'own_account'::jsonb->>'version',:'own_values',gen_random_uuid()) AS own_saved \gset
SELECT test.assert_true(:'own_saved'::jsonb @> '{"name":"Funcionario Editado","cpf":"11144477735"}' AND :'own_saved'::jsonb->>'version'<>:'own_account'::jsonb->>'version','conta: funcionario edita nome e CPF sem gestao de equipe');
SELECT test.expect_error(format('SELECT public.account_save(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'own_account'::jsonb->>'version',:'own_values'),'PT409','conta: versao antiga nao sobrescreve cadastro');
SELECT test.expect_error(format('SELECT public.account_save(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'own_saved'::jsonb->>'version',(:'own_values'::jsonb||'{"role_code":"owner"}')::text),'PT422','conta: campo de autoridade recusado no banco');
SELECT test.expect_error(format('SELECT public.account_save(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'own_saved'::jsonb->>'version',(:'own_values'::jsonb||'{"cpf":"11144477734"}')::text),'PT422','conta: CPF invalido recusado no banco');
SELECT test.expect_error($q$SELECT public.account_read('00000000-0000-4000-e000-000000000092')$q$,'PT403','conta: outro escritorio recusado');
RESET ROLE;
SELECT test.assert_true((SELECT display_name='Funcionario Editado' FROM public.profiles WHERE id='00000000-0000-4000-a000-000000000092') AND NOT EXISTS(SELECT FROM private.team_member_identities i JOIN public.memberships m ON m.id=i.membership_id WHERE m.user_id='00000000-0000-4000-a000-000000000092' AND i.full_name<>'Funcionario Editado'),'conta: nome conectado sincronizado por UID');
-- Explicit source FK only; this is not an inferred identity association.
INSERT INTO public.customers(id,office_id,kind,name,created_by) VALUES('00000000-0000-4000-d555-000000000111','00000000-0000-4000-e000-000000000091','person','Origem cadastral ficticia','00000000-0000-4000-a000-000000000095');
INSERT INTO private.customer_registrations(office_id,membership_id,name,email,materialized_customer_id) SELECT '00000000-0000-4000-e000-000000000091','00000000-0000-4000-b000-000000000095','Origem cadastral ficticia',email,'00000000-0000-4000-d555-000000000111' FROM auth.users WHERE id='00000000-0000-4000-a000-000000000095';
INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value) SELECT '00000000-0000-4000-e000-000000000091','00000000-0000-4000-d555-000000000111',0,'email',email FROM auth.users WHERE id='00000000-0000-4000-a000-000000000095';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT public.account_read('00000000-0000-4000-e000-000000000091') AS client_account \gset
SELECT (:'client_account'::jsonb - ARRAY['version','can_edit','cpf_masked','pending_email','correction_request_id'])||'{"name":"Cliente Corrigido","cpf":"12345678909"}'::jsonb AS client_values \gset
SELECT test.expect_error(format('SELECT public.account_save(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'client_account'::jsonb->>'version',:'client_values'),'PT403','conta: cliente nao altera diretamente o cadastro');
SELECT gen_random_uuid() AS correction_key \gset
SELECT public.account_correction_create('00000000-0000-4000-e000-000000000091',:'client_account'::jsonb->>'version',:'client_values',gen_random_uuid(),:'correction_key') AS correction_opened \gset
SELECT :'correction_opened'::jsonb->>'id' AS correction_id \gset
SELECT test.assert_true(:'correction_opened'::jsonb->>'protocol' ~ '^AT-[0-9]{6,}$' AND :'correction_opened'::jsonb->'correction' @> '{"status":"pending","can_apply":false}' AND (public.account_read('00000000-0000-4000-e000-000000000091')->>'name')=(:'client_account'::jsonb->>'name'),'conta: proposta tem protocolo e nao aplica dados');
SELECT test.assert_true(public.account_correction_create('00000000-0000-4000-e000-000000000091',:'client_account'::jsonb->>'version',:'client_values',gen_random_uuid(),:'correction_key')->>'id'=:'correction_id','conta: reenvio da mesma tentativa nao duplica protocolo');
SELECT test.expect_error(format('SELECT public.account_correction_create(%L,%L,%L,gen_random_uuid(),%L)','00000000-0000-4000-e000-000000000091',:'client_account'::jsonb->>'version',(:'client_values'::jsonb||'{"name":"Outro Nome"}')::text,:'correction_key'),'PT409','conta: mesma chave com outra proposta conflita');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)','00000000-0000-4000-e000-000000000091',:'correction_id'),'PT404','conta: requests.read sozinho nao le proposta pessoal');
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000000091','Correção dos dados','queue','',1,3)->>'total'='0','conta: fila nao mostra correcao sem permissao especifica');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000092','accounts.corrections.read');
SET ROLE authenticated;
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'correction_id',1)->'correction'->>'can_apply'='false','conta: consulta nao concede aplicacao');
SELECT test.expect_error(format('SELECT public.account_correction_apply(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'correction_id',:'client_values'),'PT403','conta: aplicar exige capacidade separada');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'correction_id',1)->'correction'->>'can_apply'='true','conta: owner consulta e aplica sem concessao individual');
SELECT test.assert_true(public.notifications_page('00000000-0000-4000-e000-000000000091','','all','account_correction',1,3)->>'total'='1','conta: owner recebe aviso da proposta sem dados pessoais');
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'correction_id',1,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000092","reason":"Conferencia autorizada"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.account_correction_apply(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'correction_id',:'client_values'),'PT403','conta: owner delegado acompanha mas nao aplica antes de retomar');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000092','accounts.corrections.apply');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT public.account_correction_apply('00000000-0000-4000-e000-000000000091',:'correction_id',2,:'client_values',gen_random_uuid()) AS correction_applied \gset
SELECT test.assert_true(:'correction_applied'::jsonb @> '{"status":"concluido","correction":{"status":"applied","can_apply":false}}','conta: funcionario com ambas capacidades e responsabilidade aplica proposta');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT test.assert_true(public.account_read('00000000-0000-4000-e000-000000000091') @> '{"name":"Cliente Corrigido","cpf":"12345678909"}' AND public.notifications_page('00000000-0000-4000-e000-000000000091','','all','account_updated',1,3)->>'total'='1','conta: titular ve dados aplicados e recebe aviso');
SELECT test.expect_error(format('SELECT public.account_correction_apply(%L,%L,3,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'correction_id',:'client_values'),'PT403','conta: titular nao se torna gestor ao consultar resultado');
RESET ROLE;
SELECT test.expect_error($q$UPDATE auth.users SET email_change='bypass@example.test' WHERE id='00000000-0000-4000-a000-000000000095'$q$,'PT403','conta: fluxo Auth direto nao ignora aprovacao');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT public.account_read('00000000-0000-4000-e000-000000000091') AS client_before_email \gset
SELECT (:'client_values'::jsonb||'{"email":"corrigido@example.test"}') AS email_proposal \gset
SELECT public.account_correction_create('00000000-0000-4000-e000-000000000091',:'client_before_email'::jsonb->>'version',:'email_proposal',gen_random_uuid(),gen_random_uuid())->>'id' AS email_correction_id \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.account_correction_apply('00000000-0000-4000-e000-000000000091',:'email_correction_id',1,:'email_proposal',gen_random_uuid()) AS email_applied \gset
SELECT test.assert_true(:'email_applied'::jsonb @> '{"status":"aguardando_cliente","correction":{"email_pending":true}}','conta: email aprovado aguarda confirmacao e nao finge credencial trocada');
RESET ROLE;
INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value) VALUES('00000000-0000-4000-e000-000000000091','00000000-0000-4000-d555-000000000111',1,'email','corrigido@example.test');
UPDATE auth.users SET email_change='corrigido@example.test' WHERE id='00000000-0000-4000-a000-000000000095';
UPDATE auth.users SET email='corrigido@example.test',email_change='' WHERE id='00000000-0000-4000-a000-000000000095';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT test.assert_true(public.account_read('00000000-0000-4000-e000-000000000091')->>'email'='corrigido@example.test' AND public.account_read('00000000-0000-4000-e000-000000000091')->'pending_email'='null' AND public.request_detail('00000000-0000-4000-e000-000000000091',:'email_correction_id',1)->>'public_status'='concluido','conta: confirmacao Auth sincroniza e encerra pedido');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 AND bool_and(value='corrigido@example.test') FROM public.customer_contacts WHERE customer_id='00000000-0000-4000-d555-000000000111'),'conta: confirmar email ja existente em contato secundario consolida sem duplicar');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'accounts.%' AND changes::text ~ 'example.test|11144477735|12345678909|Corrigido|Editado'),'conta: auditoria sem valores pessoais');

SELECT test.assert_true((SELECT name='Cliente Corrigido' AND identifier='12345678909' AND version>=3 FROM public.customers WHERE id='00000000-0000-4000-d555-000000000111') AND (SELECT value='corrigido@example.test' FROM public.customer_contacts WHERE customer_id='00000000-0000-4000-d555-000000000111') AND (SELECT name='Cliente Corrigido' AND email='corrigido@example.test' AND association_status='pending' FROM private.customer_registrations WHERE membership_id='00000000-0000-4000-b000-000000000095'),'conta: fontes ligadas sincronizam sem aprovar identidade automaticamente');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true((SELECT count(*)=1 AND bool_and(item->>'id'='00000000-0000-4000-b000-000000000091' AND item->>'eligible'='true') FROM jsonb_array_elements(public.request_options('00000000-0000-4000-e000-000000000091','assignees','',1,5)->'items') item WHERE item->>'is_self'='true'),'conta: servidor marca somente o proprio responsavel, elegivel e no topo');
SELECT public.account_read('00000000-0000-4000-e000-000000000091') AS owner_account \gset
SELECT (:'owner_account'::jsonb - ARRAY['version','can_edit','cpf_masked','pending_email','correction_request_id'])||'{"name":"Dono Editado"}'::jsonb AS owner_values \gset
SELECT test.assert_true(public.account_save('00000000-0000-4000-e000-000000000091',:'owner_account'::jsonb->>'version',:'owner_values',gen_random_uuid())->>'name'='Dono Editado','conta: owner edita os proprios dados');
RESET ROLE;
UPDATE public.memberships SET role_code='admin' WHERE id='00000000-0000-4000-b000-000000000094';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000094","session_id":"00000000-0000-4000-c000-000000000094"}';
SELECT public.account_read('00000000-0000-4000-e000-000000000091') AS admin_account \gset
SELECT (:'admin_account'::jsonb - ARRAY['version','can_edit','cpf_masked','pending_email','correction_request_id'])||'{"name":"Administrador Editado"}'::jsonb AS admin_values \gset
SELECT test.assert_true(public.account_save('00000000-0000-4000-e000-000000000091',:'admin_account'::jsonb->>'version',:'admin_values',gen_random_uuid())->>'name'='Administrador Editado','conta: administrador edita a propria conta sem permissao de corrigir cliente');
RESET ROLE;
UPDATE public.memberships SET role_code='employee' WHERE id='00000000-0000-4000-b000-000000000094';

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.account_read('00000000-0000-4000-e000-000000000091') AS owner_before_email \gset
SELECT (:'owner_before_email'::jsonb - ARRAY['version','can_edit','cpf_masked','pending_email','correction_request_id'])||'{"email":"owner-first@example.test"}'::jsonb AS owner_email_values \gset
SELECT public.account_save('00000000-0000-4000-e000-000000000091',:'owner_before_email'::jsonb->>'version',:'owner_email_values',gen_random_uuid()) AS owner_first_email \gset
SELECT test.assert_true(:'owner_first_email'::jsonb->>'version'<>:'owner_before_email'::jsonb->>'version','conta: somente email pendente tambem altera versao');
SELECT test.expect_error(format('SELECT public.account_save(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'owner_before_email'::jsonb->>'version',(:'owner_email_values'::jsonb||'{"email":"owner-second@example.test"}')::text),'PT409','conta: segunda aba nao substitui intencao de email com versao antiga');
SELECT public.account_save('00000000-0000-4000-e000-000000000091',:'owner_first_email'::jsonb->>'version',(:'owner_before_email'::jsonb - ARRAY['version','can_edit','cpf_masked','pending_email','correction_request_id']),gen_random_uuid());
RESET ROLE;
