BEGIN;
\set office '00000000-0000-4000-e000-000000003001'
\set other '00000000-0000-4000-e000-000000003002'
\set owner '00000000-0000-4000-a000-000000003001'
\set target '00000000-0000-4000-a000-000000003002'
\set member '00000000-0000-4000-b000-000000003002'
\set placeholder '00000000-0000-4000-a000-000000003006'
INSERT INTO public.offices(id,name) VALUES (:'office','Equipe fictícia de desligamento'),(:'other','Equipe externa fictícia');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)
SELECT format('00000000-0000-4000-a000-00000000300%s',n)::uuid,format('fixture300%s@example.test',n),now(),'fixture-credential'
FROM generate_series(1,4) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users
WHERE id::text LIKE '00000000-0000-4000-a000-00000000300_';
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa fictícia' FROM auth.users
WHERE id::text LIKE '00000000-0000-4000-a000-00000000300_' ON CONFLICT(id) DO NOTHING;
INSERT INTO public.memberships(id,office_id,user_id,role_code)
SELECT replace(u.id::text,'a000','b000')::uuid,CASE WHEN right(u.id::text,1)='4' THEN :'other'::uuid ELSE :'office'::uuid END,
 u.id,(ARRAY['owner','owner','admin','owner'])[right(u.id::text,1)::int]
FROM auth.users u WHERE u.id::text LIKE '00000000-0000-4000-a000-00000000300_';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000003001","session_id":"00000000-0000-4000-c000-000000003001"}';
SELECT public.team_create_invitation(:'office','placeholder@example.test','Pessoa Convidada','52998224725','admin',
 ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS expired_invite \gset
SELECT public.team_claim_delivery(:'office',:'expired_invite',gen_random_uuid())->>'lease_id' AS lease_id \gset
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES (:'placeholder','placeholder@example.test');
UPDATE auth.users SET invited_at=clock_timestamp() WHERE id=:'placeholder';
SELECT test.assert_true(EXISTS(SELECT FROM private.team_invite_credentials WHERE user_id=:'placeholder' AND invitation_id=:'expired_invite'),
 'convites: emissão do provedor fica vinculada ao convite delegado');
UPDATE private.team_invitations SET expires_at=clock_timestamp()-interval '1 second',delivery_lease_until=clock_timestamp()-interval '1 second' WHERE id=:'expired_invite';
SELECT test.expect_error(format('UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=%L',:'placeholder'),'PT410',
 'convites: confirmação expirada é negada no Auth');
SET LOCAL ROLE service_role;
SELECT test.assert_true(public.team_login_guidance('placeholder@example.test',NULL)='invitation_expired',
 'login: conta pendente sem convite válido recebe aviso de expiração');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT test.assert_true(public.team_lifecycle_archives(:'office','expired',1)->>'total'='1' AND
 public.team_dashboard(:'office','invitations',1,'','all')->>'total'='0','convites: vencido aparece somente no arquivo e filtro histórico');
SELECT test.expect_error(format('SELECT public.team_lifecycle_archives(%L,%L,1)',:'other','expired'),'PT403','arquivo: isolamento entre escritórios');
RESET ROLE;
SELECT test.assert_true(private.team_purge_expired_auth()=1,'convites: manutenção elimina somente a conta provisória vencida');
SELECT test.assert_true(NOT EXISTS(SELECT FROM auth.users WHERE id=:'placeholder'),'convites: e-mail livre no Auth');
SET LOCAL ROLE service_role;
SELECT test.assert_true(public.team_login_guidance('placeholder@example.test',:'expired_invite')='invitation_expired',
 'login: o link correto identifica o vencimento mesmo depois da limpeza');
SELECT test.assert_true(public.team_login_guidance('different@example.test',:'expired_invite')='unavailable'
 AND public.team_login_guidance('placeholder@example.test',NULL)='unavailable',
 'login: link de outro e-mail e conta removida sem prova não revelam convite');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT test.expect_error($q$SELECT public.team_login_guidance('placeholder@example.test',NULL)$q$,'42501',
 'login: anônimo não consegue consultar e-mail na RPC');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT public.team_create_invitation(:'office','placeholder@example.test','Pessoa Convidada','52998224725','admin',
 ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS fresh_invite \gset
SELECT public.team_claim_delivery(:'office',:'fresh_invite',gen_random_uuid());
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES (:'placeholder','placeholder@example.test');
UPDATE auth.users SET invited_at=clock_timestamp() WHERE id=:'placeholder';
SET LOCAL ROLE service_role;
SELECT test.assert_true(public.team_login_guidance('placeholder@example.test',NULL)='confirm_email'
 AND public.team_login_guidance('placeholder@example.test',:'fresh_invite')='confirm_email',
 'login: um novo convite válido prevalece sobre o anterior');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id=:'placeholder';
UPDATE private.team_invitations SET status='accepted',accepted_at=clock_timestamp(),accepted_user_id=:'placeholder' WHERE id=:'fresh_invite';
SET LOCAL ROLE authenticated;
SELECT test.assert_true(public.team_archive_invitation(:'office',:'fresh_invite')->>'ok'='true','convites: aceito pode ser arquivado');
SELECT test.assert_true(public.team_lifecycle_archives(:'office','accepted',1)->>'total'='1','convites: arquivo exibe aceito arquivado');
SELECT test.expect_error(format('SELECT public.team_depart_member(%L,%L)',:'office','00000000-0000-4000-b000-000000003001'),'PT403',
 'desligamento: impede autoexclusão');
SELECT test.expect_error(format('SELECT public.team_depart_member(%L,%L)',:'office','00000000-0000-4000-b000-000000003004'),'PT403',
 'desligamento: impede desligar outro escritório');
RESET ROLE;

INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,priority,status,idempotency_key,payload_digest)
VALUES
 (:'office','AT-30001','Atendimento encerrado','presencial',:'target',:'member','normal','concluido',gen_random_uuid(),'fixture'),
 (:'office','AT-30002','Atendimento ativo','presencial',:'owner',:'member','normal','em_atendimento',gen_random_uuid(),'fixture');
INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)
SELECT office_id,id,:'member',:'owner' FROM public.requests WHERE office_id=:'office';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000003003","session_id":"00000000-0000-4000-c000-000000003003"}';
SELECT test.expect_error(format('SELECT public.team_depart_member(%L,%L)',:'office',:'member'),'PT403','desligamento: só proprietário');
SELECT test.expect_error('SELECT public.team_departure_notices_claim()','42501','desligamento: usuário não consulta e-mail do aviso');
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000003001","session_id":"00000000-0000-4000-c000-000000003001"}';
SELECT test.assert_true(public.team_depart_member(:'office',:'member')='{"ok":true,"archived_requests":1,"returned_requests":1}',
 'desligamento: proprietário desliga outro proprietário e preserva os trabalhos');
SELECT test.assert_true(public.team_depart_member(:'office',:'member')='{"ok":true,"archived_requests":1,"returned_requests":1}',
 'desligamento: repetição mantém o resultado');
SELECT test.assert_true(public.team_lifecycle_archives(:'office','departed',1)->>'total'='1' AND
 public.team_dashboard(:'office','members',1,'','all')->>'total'='2','desligamento: arquivo separado da equipe ativa');
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000003002","session_id":"00000000-0000-4000-c000-000000003002"}';
SELECT test.expect_error('SELECT public.session_activity(false)','PT401','desligamento: revogação imediata da sessão no aplicativo');
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.account_closures WHERE user_id=:'target')
 AND EXISTS(SELECT FROM private.request_archives WHERE office_id=:'office')
 AND EXISTS(SELECT FROM public.requests WHERE office_id=:'office' AND protocol='AT-30002' AND assignee_id IS NULL AND status='em_atendimento')
 AND EXISTS(SELECT FROM private.request_assignments a JOIN public.requests r ON r.id=a.request_id WHERE r.protocol='AT-30002' AND a.ended_at IS NOT NULL),
 'desligamento: fechamento pendente no Auth, arquivamento e encerramento da atribuição');
SET LOCAL ROLE service_role;
SELECT test.assert_true(jsonb_array_length(public.team_departure_notices_claim())=1,'aviso: serviço obtém somente a fila pendente');
SELECT test.assert_true(jsonb_array_length(public.team_departure_notices_claim())=0,'aviso: lease impede duplicidade');
SELECT test.assert_true(public.team_departure_notice_complete(:'member')->>'recorded'='true','aviso: envio confirmado elimina destino da fila');
RESET ROLE;
ROLLBACK;
