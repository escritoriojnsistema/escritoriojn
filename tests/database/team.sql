-- Real RPC/ACL/transaction behavior, on disposable PostgreSQL 17 only.
SELECT test.assert_true((SELECT array_agg(role_code ORDER BY role_code) FROM public.role_permissions
  WHERE permission_code='users.manage')=ARRAY['owner'] AND
  (SELECT array_agg(role_code ORDER BY role_code) FROM public.role_permissions
  WHERE permission_code='users.owners.create')=ARRAY['owner'], 'seed concede gestao e criar owner somente a owner');
SELECT test.assert_true((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'team_%' AND NOT p.prosecdef)=11,
  'onze RPCs publicas sao invoker');
SELECT test.assert_true(NOT EXISTS (SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='private' AND c.relkind='r' AND c.relname LIKE 'team_%'
    AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE'))),
  'dados privados tem RLS e nenhum GRANT de tabela para API ou servico');
SELECT test.assert_true(NOT EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private') AND p.proname LIKE 'team_%'
    AND has_function_privilege('anon',p.oid,'EXECUTE')),
  'anon nao executa helpers nem RPCs de equipe');
SELECT test.assert_true(has_function_privilege('service_role','public.team_finish_delivery(uuid,uuid,boolean)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.team_finish_delivery(uuid,uuid,boolean)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.team_dashboard(uuid,text,integer,text,text)','EXECUTE'),
  'service_role recebe somente finalizacao de delivery');
SELECT test.assert_true(NOT EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname LIKE 'team_%' AND p.prosecdef
    AND NOT coalesce(p.proconfig @> ARRAY['search_path=""'],false)), 'definers de equipe fixam search_path vazio');

SET ROLE migrator;
SELECT private.configure_client_registration((SELECT id FROM public.offices WHERE name='Escritorio Ficticio A'),false);
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('00000000-0000-4000-a000-000000000011','owner-team@example.test',now(),'provider-password'),
 ('00000000-0000-4000-a000-000000000012','admin-team@example.test',now(),'provider-password'),
 ('00000000-0000-4000-a000-000000000013','employee-team@example.test',now(),'provider-password'),
 ('00000000-0000-4000-a000-000000000014','recipient-team@example.test',now(),NULL),
 ('00000000-0000-4000-a000-000000000015','second-admin@example.test',now(),'provider-password');
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
 WHERE id IN ('00000000-0000-4000-a000-000000000011','00000000-0000-4000-a000-000000000012',
 '00000000-0000-4000-a000-000000000013','00000000-0000-4000-a000-000000000014','00000000-0000-4000-a000-000000000015');
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000011','Equipe SQL Ficticia');
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa Ficticia' FROM auth.users WHERE id IN
 ('00000000-0000-4000-a000-000000000011','00000000-0000-4000-a000-000000000012',
 '00000000-0000-4000-a000-000000000013','00000000-0000-4000-a000-000000000015');
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES
 ('00000000-0000-4000-b000-000000000011','00000000-0000-4000-e000-000000000011','00000000-0000-4000-a000-000000000011','owner'),
 ('00000000-0000-4000-b000-000000000012','00000000-0000-4000-e000-000000000011','00000000-0000-4000-a000-000000000012','admin'),
 ('00000000-0000-4000-b000-000000000013','00000000-0000-4000-e000-000000000011','00000000-0000-4000-a000-000000000013','employee'),
 ('00000000-0000-4000-b000-000000000015','00000000-0000-4000-e000-000000000011','00000000-0000-4000-a000-000000000015','admin');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000013","session_id":"00000000-0000-4000-c000-000000000013","app_metadata":{"role":"owner"}}';
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')$q$,'PT403','funcionario nao gerencia com metadata forjada');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')$q$,'PT403','admin sem delegacao nao gerencia');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT test.assert_true((public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')->>'total')::int=4,
  'owner lista equipe com pagina de cinco');
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000099','members',1,'','all')$q$,'PT403','owner nao cruza escritorio');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000011','employee',false,ARRAY['foundation.access'],gen_random_uuid())$q$,
  'PT409','ultimo owner ativo nao pode ser desativado ou rebaixado');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000013','owner',true,ARRAY['foundation.access'],gen_random_uuid())$q$,
  'PT403','novo owner exige convite explicito');
SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000012',
 ARRAY['employee','admin'],ARRAY['foundation.access','audit.read'],false,now()+interval '30 days',gen_random_uuid())->>'id' AS delegation_id \gset
SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000015',
 ARRAY['employee'],ARRAY['foundation.access'],false,now()+interval '30 days',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT test.assert_true((SELECT permissions FROM public.access_context('00000000-0000-4000-e000-000000000011')) @> ARRAY['users.manage','audit.read'],
  'delegacao concede gestao e capacidades selecionadas no contexto');
SELECT test.assert_true((public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')->>'total')::int=3,
  'admin ve somente papeis dentro do escopo');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000012','admin',true,ARRAY['foundation.access','audit.read'],gen_random_uuid())$q$,'PT403','admin nao altera proprio poder');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000011','employee',true,ARRAY['foundation.access'],gen_random_uuid())$q$,'PT403','admin nao altera owner');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000015','employee',true,ARRAY['foundation.access'],gen_random_uuid())$q$,'PT403','admin nao altera outro gestor delegado');
SELECT test.expect_error($q$SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000013',ARRAY['employee'],ARRAY['foundation.access'],false,now()+interval '1 day',gen_random_uuid())$q$,'PT403','admin nao delega em cadeia');
SELECT test.expect_error($q$SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','newowner@example.test','Novo Owner','52998224725','owner',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())$q$,'PT403','users.manage nao permite criar owner');
SELECT test.expect_error($q$SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','badcpf@example.test','Nome Ficticio','11111111111','employee',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())$q$,'PT422','CPF invalido recusado no banco');
SELECT test.expect_error($q$SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','escalation@example.test','Nome Ficticio','52998224725','employee',ARRAY['foundation.access','users.manage'],now()+interval '1 day',gen_random_uuid())$q$,'PT422','capacidade gerencial nao pode ser concedida como modulo');
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','recipient-team@example.test','Pessoa Convidada','529.982.247-25','employee',ARRAY['foundation.access','audit.read'],now()+interval '1 day',gen_random_uuid())->>'id' AS invitation_id \gset
SELECT test.assert_true(NOT (public.team_dashboard('00000000-0000-4000-e000-000000000011','invitations',1,'','all')::text LIKE '%52998224725%')
 AND NOT (public.team_dashboard('00000000-0000-4000-e000-000000000011','invitations',1,'','all')::text LIKE '%$2%'),
 'dashboard nao expoe CPF integral nem hash');
SELECT public.team_claim_delivery('00000000-0000-4000-e000-000000000011',:'invitation_id',gen_random_uuid())->>'lease_id' AS lease_id \gset
SELECT test.expect_error(format('SELECT public.team_claim_delivery(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000011',:'invitation_id'),'PT429','reenvio tem lease e intervalo minimo');
SELECT test.expect_error(format('SELECT public.team_finish_delivery(%L,%L,true)',:'invitation_id',:'lease_id'),'42501','authenticated nao finaliza SMTP');
RESET ROLE;
SET ROLE service_role;
SELECT test.assert_true((public.team_finish_delivery(:'invitation_id',:'lease_id',true)->>'recorded')::boolean,'servico finaliza apenas lease valido');
SELECT test.assert_true(NOT (public.team_finish_delivery(:'invitation_id',:'lease_id',true)->>'recorded')::boolean,'lease SMTP nao pode ser reutilizado');
RESET ROLE;
SELECT test.assert_true((SELECT actor_id FROM public.audit_events WHERE action='team.invitation_sent' AND target_id=:'invitation_id')='00000000-0000-4000-a000-000000000012',
 'auditoria SMTP deriva ator do lease');
SELECT test.assert_true((SELECT cpf_hash FROM private.team_invitations WHERE id=:'invitation_id') LIKE '$2%'
 AND NOT EXISTS(SELECT FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000000014'),
 'CPF so bcrypt e conta existente ainda sem vinculo automatico');
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.team_invitation_state(%L)',:'invitation_id'),'PT410','outro usuario nao inspeciona convite');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000014","session_id":"00000000-0000-4000-c000-000000000014"}';
SELECT test.assert_true(NOT (public.team_invitation_state(:'invitation_id')->>'verified')::boolean,'destinatario inicia sem conferencia');
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'invitation_id'),'PT403','aceite direto sem conferencia negado');
SELECT test.assert_true((public.team_verify_invitation(:'invitation_id','Pessoa Errada','52998224725','employee',gen_random_uuid())->>'code')='IDENTITY_MISMATCH','identidade incorreta retorna JSON generico');
SELECT test.assert_true((public.team_verify_invitation(:'invitation_id','Pessoa Convidada','52998224725','admin',gen_random_uuid())->>'code')='IDENTITY_MISMATCH','funcao esperada e conferida');
SELECT public.team_verify_invitation(:'invitation_id','errado','11111111111','employee',gen_random_uuid());
SELECT public.team_verify_invitation(:'invitation_id','errado','11111111111','employee',gen_random_uuid());
SELECT public.team_verify_invitation(:'invitation_id','errado','11111111111','employee',gen_random_uuid());
SELECT test.assert_true((public.team_verify_invitation(:'invitation_id','Pessoa Convidada','52998224725','employee',gen_random_uuid())->>'code')='TEAM_RATE_LIMIT','cinco erros persistem e bloqueiam por quinze minutos');
RESET ROLE;
UPDATE private.team_invitations SET attempts_started_at=now()-interval '16 minutes' WHERE id=:'invitation_id';
SET ROLE authenticated;
SELECT test.assert_true((public.team_verify_invitation(:'invitation_id','  Pessoa   Convidada ','52998224725','employee',gen_random_uuid())->>'verified')::boolean,'nome normalizado e CPF correto conferem');
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'invitation_id'),'PT403','aceite exige credencial de senha real no Auth');
RESET ROLE;
UPDATE auth.users SET encrypted_password='provider-password' WHERE id='00000000-0000-4000-a000-000000000014';
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000114','00000000-0000-4000-a000-000000000014');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000014","session_id":"00000000-0000-4000-c000-000000000114"}';
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'invitation_id'),'PT403','conferencia nao migra para outra sessao');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000014","session_id":"00000000-0000-4000-c000-000000000014"}';
SELECT test.assert_true((public.team_accept_invitation(:'invitation_id',gen_random_uuid())->>'role_code')='employee','aceite conferido cria somente vinculo explicitamente convidado');
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'invitation_id'),'PT410','convite aceito nao e reutilizavel');
SELECT test.assert_true((SELECT permissions FROM public.access_context('00000000-0000-4000-e000-000000000011')) @> ARRAY['foundation.access','audit.read'],
 'permissao explicita fica no vinculo aceito');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS (SELECT FROM public.audit_events WHERE changes::text LIKE '%52998224725%'
 OR changes::text LIKE '%example.test%' OR changes::text LIKE '%provider-password%' OR changes::text LIKE '%$2%'),
 'auditoria nao expoe CPF email senha ou hash');

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','blocked-team@example.test','Bloqueado Ficticio','52998224725','employee',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS blocked_invitation \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT public.team_revoke_delegation('00000000-0000-4000-e000-000000000011',:'delegation_id',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')$q$,'PT403','revogacao de delegacao vale com JWT antigo');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000012',
 ARRAY['employee','admin','owner'],ARRAY['foundation.access'],true,now()+interval '30 days',gen_random_uuid())->>'id' AS new_delegation \gset
SELECT test.expect_error(format('SELECT public.team_claim_delivery(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000011',:'blocked_invitation'),'PT410','nova delegacao nao revive convite da antiga');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','specific-owner@example.test','Owner Ficticio','52998224725','owner',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS owner_invitation \gset
SELECT test.assert_true(:'owner_invitation' IS NOT NULL,'admin com delegacao especifica cria convite owner');
RESET ROLE;
UPDATE private.team_delegations SET expires_at=now()-interval '1 second' WHERE id=:'new_delegation';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')$q$,'PT403','delegacao expirada perde capacidade imediatamente');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT test.expect_error(format('SELECT public.team_claim_delivery(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000011',:'owner_invitation'),'PT410','convite depende da autoridade original ainda vigente');
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','expiry-team@example.test','Expirado Ficticio','52998224725','employee',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS expiry_invitation \gset
RESET ROLE;
UPDATE private.team_invitations SET expires_at=now()-interval '1 second' WHERE id=:'expiry_invitation';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.team_claim_delivery(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000011',:'expiry_invitation'),'PT410','convite expirado nao envia');
SELECT public.team_set_member('00000000-0000-4000-e000-000000000011',
 (public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'recipient-team','all')->'items'->0->>'id')::uuid,
 'employee',false,ARRAY['foundation.access'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000014","session_id":"00000000-0000-4000-c000-000000000014"}';
SELECT test.assert_true((SELECT count(*) FROM public.my_access_context())=0,'desativacao comercial bloqueia token antigo sem apagar historico');
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM public.profiles WHERE id='00000000-0000-4000-a000-000000000014')
 AND EXISTS(SELECT FROM public.audit_events WHERE actor_id='00000000-0000-4000-a000-000000000014'), 'historico e perfil conservados apos desligamento');
ALTER TABLE public.audit_events ADD CONSTRAINT team_test_audit_failure CHECK (action <> 'team.invitation_created') NOT VALID;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT test.expect_error($q$SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','rollback-team@example.test','Rollback Ficticio','52998224725','employee',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())$q$,'23514','falha de auditoria aborta convite');
RESET ROLE;
ALTER TABLE public.audit_events DROP CONSTRAINT team_test_audit_failure;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.team_invitations WHERE email='rollback-team@example.test'), 'convite nao persiste quando auditoria falha');
SET ROLE authenticated;
SELECT test.expect_error($q$UPDATE private.team_invitations SET role_code='owner'$q$,'42501','API nao muda dados privados diretamente');
SELECT test.expect_error($q$INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000013','users.manage')$q$,'42501','API nao concede capacidade diretamente');
RESET ROLE;
DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000011';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')$q$,'PT401','sessao revogada nega RPC com JWT antigo');
RESET ROLE;

-- Additional boundaries use a fresh live session for the same owner.
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000011','00000000-0000-4000-a000-000000000011');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SET ROLE authenticated;
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','scoped-team@example.test','Escopo Ficticio','52998224725','employee',ARRAY['foundation.access','audit.read'],now()+interval '1 day',gen_random_uuid())->>'id' AS scoped_invitation \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000015","session_id":"00000000-0000-4000-c000-000000000015"}';
SELECT test.expect_error(format('SELECT public.team_claim_delivery(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000011',:'scoped_invitation'),'PT403','gestor nao envia capacidades acima da delegacao');
SELECT test.expect_error(format('SELECT public.team_revoke_invitation(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000011',:'scoped_invitation'),'PT403','gestor nao modifica convite acima da delegacao');
RESET ROLE;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT private.team_scope_for_member('00000000-0000-4000-b000-000000000011')$q$,'42501','helper interno nao pode ser chamado pela API');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000011',(SELECT id FROM public.memberships WHERE office_id<>(('00000000-0000-4000-e000-000000000011')::uuid) LIMIT 1),'employee',true,ARRAY['foundation.access'],gen_random_uuid())$q$,'PT403','mutacao nega vinculo de outro tenant');
SELECT test.expect_error($q$SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','deadline@example.test','Prazo Ficticio','52998224725','employee',ARRAY['foundation.access'],now()+interval '8 days',gen_random_uuid())$q$,'PT422','prazo do convite limitado a sete dias');
SELECT test.expect_error($q$SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000012',ARRAY['employee'],ARRAY['foundation.access'],false,now()+interval '91 days',gen_random_uuid())$q$,'PT422','prazo da delegacao limitado a noventa dias');
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','trigger-team@example.test','Trigger Ficticio','52998224725','employee',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS trigger_invitation \gset
RESET ROLE;
SET ROLE migrator;
SELECT private.configure_client_registration((SELECT id FROM public.offices WHERE name='Escritorio Ficticio A'),true);
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000016','trigger-team@example.test',now(),'provider-password','{"display_name":"Forjado","role":"owner"}');
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000016','00000000-0000-4000-a000-000000000016');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000000016')
 AND NOT EXISTS(SELECT FROM public.profiles WHERE id='00000000-0000-4000-a000-000000000016'),
 'trigger de cliente pula Auth novo com convite confiavel sem confiar em metadata');
SET ROLE migrator;
SELECT private.configure_client_registration((SELECT id FROM public.offices WHERE name='Escritorio Ficticio A'),false);
RESET ROLE;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000016","session_id":"00000000-0000-4000-c000-000000000016"}';
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='00000000-0000-4000-a000-000000000016';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.team_invitation_state(%L)',:'trigger_invitation'),'PT401','destinatario nao confirmado nao confere convite');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now(),email='other-recipient@example.test' WHERE id='00000000-0000-4000-a000-000000000016';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.team_invitation_state(%L)',:'trigger_invitation'),'PT410','email atual divergente nao revela convite');
SELECT test.expect_error($q$SELECT public.team_invitation_state('00000000-0000-4000-f000-000000000099')$q$,'PT410','UUID desconhecido retorna mesma falha do nao destinatario');
RESET ROLE;
UPDATE auth.users SET email='trigger-team@example.test' WHERE id='00000000-0000-4000-a000-000000000016';
SET ROLE authenticated;
SELECT public.team_verify_invitation(:'trigger_invitation','Trigger Ficticio','52998224725','employee',gen_random_uuid());
RESET ROLE;
UPDATE private.team_invitations SET verified_until=now()-interval '1 second' WHERE id=:'trigger_invitation';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'trigger_invitation'),'PT403','conferencia expirada nao aceita convite');
SELECT public.team_verify_invitation(:'trigger_invitation','Trigger Ficticio','52998224725','employee',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT public.team_revoke_invitation('00000000-0000-4000-e000-000000000011',:'trigger_invitation',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000016","session_id":"00000000-0000-4000-c000-000000000016"}';
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'trigger_invitation'),'PT410','revogar convite invalida conferencia ja feita');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000012',
 ARRAY['employee','admin','owner'],ARRAY['foundation.access'],true,now()+interval '1 day',gen_random_uuid())->>'id' AS accept_delegation \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','employee-team@example.test','Owner Novo Ficticio','52998224725','owner',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS verify_owner_invitation \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000013","session_id":"00000000-0000-4000-c000-000000000013"}';
SELECT public.team_verify_invitation(:'verify_owner_invitation','Owner Novo Ficticio','52998224725','owner',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT public.team_revoke_delegation('00000000-0000-4000-e000-000000000011',:'accept_delegation',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000013","session_id":"00000000-0000-4000-c000-000000000013"}';
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'verify_owner_invitation'),'PT410','revogacao da delegacao bloqueia aceite mesmo apos conferencia');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000011','00000000-0000-4000-b000-000000000012',
 ARRAY['employee','admin','owner'],ARRAY['foundation.access'],true,now()+interval '1 day',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','employee-team@example.test','Owner Novo Ficticio','52998224725','owner',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS accepted_owner_invitation \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000013","session_id":"00000000-0000-4000-c000-000000000013"}';
SELECT public.team_verify_invitation(:'accepted_owner_invitation','Owner Novo Ficticio','52998224725','owner',gen_random_uuid());
SELECT test.assert_true((public.team_accept_invitation(:'accepted_owner_invitation',gen_random_uuid())->>'role_code')='owner',
 'delegacao especifica vigente permite aceite explicito como owner');
RESET ROLE;

-- Even an accidental table grant cannot bypass private-table RLS as authenticated.
GRANT SELECT,INSERT,UPDATE,DELETE ON private.team_invitations,private.team_member_permissions TO authenticated;
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM private.team_invitations)=0,'RLS privada bloqueia leitura mesmo com GRANT acidental');
WITH changed AS (UPDATE private.team_invitations SET role_code='owner' RETURNING *)
 SELECT test.assert_true((SELECT count(*) FROM changed)=0,'RLS privada bloqueia mutacao mesmo com GRANT acidental');
SELECT test.expect_error($q$INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000013','audit.read')$q$,'42501','RLS privada bloqueia autoconcessao mesmo com GRANT');
RESET ROLE;
REVOKE SELECT,INSERT,UPDATE,DELETE ON private.team_invitations,private.team_member_permissions FROM authenticated;

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','non-name@example.test','11 22','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid())$q$,'PT422','SQL exige nome e sobrenome com letras');
SELECT test.assert_true((public.team_create_invitation('00000000-0000-4000-e000-000000000011','accent-name@example.test','João D’Ávila','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid())->>'id') IS NOT NULL,
 'SQL preserva nomes com acento e apostrofo');
RESET ROLE;

-- GoTrue signupVerify creates a temporary nonempty password while consuming
-- an invitation. That provider-generated password is not a user choice.
SET ROLE authenticated;
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','temporary-password@example.test','Senha Ficticia','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid())->>'id' AS temporary_password_invitation \gset
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,invited_at) VALUES
 ('00000000-0000-4000-a000-000000000017','temporary-password@example.test',NULL,clock_timestamp());
UPDATE auth.users SET email_confirmed_at=clock_timestamp(),encrypted_password=extensions.crypt('TemporariaProvedorFicticia',extensions.gen_salt('bf',4))
 WHERE id='00000000-0000-4000-a000-000000000017';
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000017','00000000-0000-4000-a000-000000000017');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000017","session_id":"00000000-0000-4000-c000-000000000017"}';
SET ROLE authenticated;
SELECT test.assert_true(NOT (public.team_invitation_state(:'temporary_password_invitation')->>'has_password')::boolean,
 'senha temporaria do provedor nao e senha escolhida antes da conferencia');
SELECT test.assert_true(NOT (public.team_verify_invitation(:'temporary_password_invitation','Senha Ficticia','52998224725','employee',gen_random_uuid())->>'has_password')::boolean,
 'conferencia captura fingerprint depois do hash temporario do provedor');
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'temporary_password_invitation'),'PT403',
 'senha temporaria nao permite aceite conferido');
RESET ROLE;
UPDATE auth.users SET encrypted_password=extensions.crypt('EscolhidaDestinatarioFicticio',extensions.gen_salt('bf',4))
 WHERE id='00000000-0000-4000-a000-000000000017';
SET ROLE authenticated;
SELECT test.assert_true((public.team_invitation_state(:'temporary_password_invitation')->>'has_password')::boolean,
 'senha alterada depois da conferencia e reconhecida sem copiar hash bcrypt');
SELECT test.assert_true((public.team_accept_invitation(:'temporary_password_invitation',gen_random_uuid())->>'role_code')='employee',
 'destinatario novo aceita somente apos definir senha depois da conferencia');
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('00000000-0000-4000-a000-000000000018','existing-password@example.test',clock_timestamp(),'SenhaAnteriorDoProvedor');
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000018','00000000-0000-4000-a000-000000000018');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SET ROLE authenticated;
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','existing-password@example.test','Conta Anterior','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid())->>'id' AS existing_password_invitation \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000018","session_id":"00000000-0000-4000-c000-000000000018"}';
SELECT test.assert_true((public.team_verify_invitation(:'existing_password_invitation','Conta Anterior','52998224725','employee',gen_random_uuid())->>'has_password')::boolean,
 'conta normal preexistente conserva senha sem reescrever credencial');
SELECT test.assert_true((public.team_accept_invitation(:'existing_password_invitation',gen_random_uuid())->>'role_code')='employee',
 'senha preexistente confiavel permite aceite apos conferencia');
RESET ROLE;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000011","session_id":"00000000-0000-4000-c000-000000000011"}';
SET ROLE authenticated;
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000011','lock-email@example.test','Email Ficticio','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid());
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password,invited_at) VALUES
 ('00000000-0000-4000-a000-000000000019','lock-email@example.test',clock_timestamp(),'SenhaTemporariaFicticia',clock_timestamp());
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000019','00000000-0000-4000-a000-000000000019');

-- A transaction that began before expiration must not preserve authority forever.
BEGIN;
UPDATE private.team_delegations SET expires_at=clock_timestamp()+interval '50 milliseconds'
 WHERE membership_id='00000000-0000-4000-b000-000000000012' AND revoked_at IS NULL;
SELECT pg_sleep(0.1);
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000012","session_id":"00000000-0000-4000-c000-000000000012"}';
SELECT test.expect_error($q$SELECT public.team_dashboard('00000000-0000-4000-e000-000000000011','members',1,'','all')$q$,'PT403','prazo usa relogio atual mesmo em transacao iniciada antes da expiracao');
RESET ROLE;
ROLLBACK;
