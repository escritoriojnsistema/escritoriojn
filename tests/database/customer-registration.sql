-- Public signup becomes a reusable office record without proving identity or granting portal data.
SET ROLE migrator;
SELECT private.configure_client_registration('00000000-0000-4000-e000-000000000041',true);
RESET ROLE;
SELECT id AS owner07_id FROM public.customers WHERE office_id='00000000-0000-4000-e000-000000000041' AND identifier='52998224725' \gset
SELECT id AS company07_id FROM public.customers WHERE office_id='00000000-0000-4000-e000-000000000041' AND kind='company' \gset
SELECT id AS other07_id FROM public.customers WHERE office_id='00000000-0000-4000-e000-000000000042' AND identifier='52998224725' \gset
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000061','signup-unique@example.test',NULL,'{"display_name":"Cadastro Portal Unico","role":"owner","office_id":"forged"}');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Unico',1,3)->>'total'='0',
 'cadastro integrado: conta nao confirmada nao aparece na lista operacional');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id='00000000-0000-4000-a000-000000000061';
SET ROLE authenticated;
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Unico',1,3)->>'total'='1',
 'cadastro integrado: confirmacao cria ficha reutilizavel automaticamente');
RESET ROLE;
SELECT id AS signup_customer_id FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000061' \gset
SELECT test.assert_true((SELECT count(*) FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id
 WHERE m.user_id='00000000-0000-4000-a000-000000000061' AND r.materialized_customer_id=:'signup_customer_id' AND r.association_status='pending')=1
 AND (SELECT count(*) FROM public.customer_contacts WHERE customer_id=:'signup_customer_id' AND kind='email' AND value='signup-unique@example.test')=1,
 'cadastro integrado: origem pendente e contato guardados sem identidade documental aprovada');
SET ROLE authenticated;
SELECT test.assert_true(public.customer_detail('00000000-0000-4000-e000-000000000041',:'signup_customer_id')->>'source'='client_registration'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'signup_customer_id')->>'association_status'='pending'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'signup_customer_id')->>'materialized'='true'
 AND (public.customer_detail('00000000-0000-4000-e000-000000000041',:'signup_customer_id')->>'can_update')::boolean,
 'cadastro integrado: owner pode reutilizar e editar ficha sem conferir identidade');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000042","session_id":"00000000-0000-4000-c000-000000000042"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Unico',1,3)->>'total'='0',
 'cadastro integrado: read sem read_all conserva escopo do criador');
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)','00000000-0000-4000-e000-000000000041',:'signup_customer_id'),'PT404',
 'cadastro integrado: read nao amplia detalhe pelo id do cadastro');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000044","session_id":"00000000-0000-4000-c000-000000000044"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Unico',1,3)->>'total'='1'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'signup_customer_id')->>'can_update'='false',
 'cadastro integrado: employee com read_all ve cadastro sem ganhar update');
RESET ROLE;
-- Shared contacts are only duplicate hints: no candidate identity or internal data is assigned.
INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value) VALUES
 ('00000000-0000-4000-e000-000000000041',:'owner07_id',2,'email','signup-shared@example.test'),
 ('00000000-0000-4000-e000-000000000041',:'company07_id',0,'email','signup-shared@example.test');
SELECT count(*) AS before_shared_count FROM public.customers WHERE office_id='00000000-0000-4000-e000-000000000041' \gset
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000062','SIGNUP-SHARED@example.test',clock_timestamp(),'{"display_name":"Cadastro Portal Compartilhado"}');
SELECT r.id AS shared_registration_id FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id
 WHERE m.user_id='00000000-0000-4000-a000-000000000062' \gset
SELECT test.assert_true((SELECT count(*) FROM public.customers WHERE office_id='00000000-0000-4000-e000-000000000041')=:'before_shared_count'::integer
 AND (SELECT materialized_customer_id IS NULL AND association_status='pending' FROM private.customer_registrations WHERE id=:'shared_registration_id'),
 'cadastro integrado: contato compartilhado nao duplica ficha nem combina pessoas');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Compartilhado',1,3)->>'total'='1'
 AND NOT ((public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Compartilhado',1,3)->'items'->0) ?| ARRAY['email','contacts','identifier','materialized_customer_id'])
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'shared_registration_id')->>'materialized'='false'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'shared_registration_id')->>'can_update'='false'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'shared_registration_id')->'contacts'='[{"kind":"email","value":"signup-shared@example.test"}]'
 AND NOT (public.customer_detail('00000000-0000-4000-e000-000000000041',:'shared_registration_id') ?| ARRAY['candidate_id','customer_id','materialized_customer_id','user_id','membership_id']),
 'cadastro integrado: entrada pendente revela so dados declarados sem expor candidatos');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'shared_registration_id','{"kind":"person","name":"Tentativa","contacts":[]}'),'PT404',
 'cadastro integrado: entrada pendente nao vira ficha por update');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000043","session_id":"00000000-0000-4000-c000-000000000043"}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)','00000000-0000-4000-e000-000000000042',:'shared_registration_id'),'PT404',
 'cadastro integrado: entrada nao atravessa tenant pelo id');
RESET ROLE;
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000062','00000000-0000-4000-a000-000000000062');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000062","session_id":"00000000-0000-4000-c000-000000000062","user_metadata":{"role":"owner"}}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)','00000000-0000-4000-e000-000000000041',:'owner07_id'),'PT403',
 'cadastro integrado: mesmo email nao permite ao cliente ler ficha interna');
SELECT test.expect_error($q$SELECT * FROM private.customer_registrations$q$,'42501','cadastro integrado: origem privada nao e tabela da API');
SELECT test.expect_error($q$SELECT private.sync_customer_registration(auth.uid())$q$,'42501','cadastro integrado: cliente nao executa sincronizador');
SELECT test.assert_true((SELECT permissions FROM public.my_access_context())=ARRAY['foundation.access'],
 'cadastro integrado: cadastro nao concede capacidades documentais ou de clientes');
RESET ROLE;
SET ROLE migrator;
SELECT private.sync_customer_registration('00000000-0000-4000-a000-000000000061');
SELECT private.sync_customer_registration('00000000-0000-4000-a000-000000000061');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000061')=1
 AND (SELECT count(*) FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id WHERE m.user_id='00000000-0000-4000-a000-000000000061')=1,
 'cadastro integrado: backfill repetido e confirmacao repetida sao idempotentes');
-- Another email is a distinct Auth account; there is deliberately no identity merge by name.
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000063','signup-other-email@example.test',clock_timestamp(),'{"display_name":"Cadastro Portal Unico"}'),
 ('00000000-0000-4000-a000-000000000064','signup-no-name@example.test',clock_timestamp(),'{"display_name":"\u0001"}');
SELECT test.assert_true((SELECT count(*) FROM public.customers WHERE name='Cadastro Portal Unico' AND office_id='00000000-0000-4000-e000-000000000041')=2
 AND (SELECT count(*) FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id WHERE m.user_id='00000000-0000-4000-a000-000000000064')=1,
 'cadastro integrado: emails distintos nao combinam identidades e nome invalido tem fallback seguro');
INSERT INTO auth.users(id,email,email_confirmed_at,invited_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000065','signup-invited@example.test',clock_timestamp(),clock_timestamp(),'{"display_name":"Convite Equipe"}');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id WHERE m.user_id='00000000-0000-4000-a000-000000000065'),
 'cadastro integrado: conta criada por convite Auth nao vira cliente operacional');
-- Backfill accepts only the historical bootstrap event, never an arbitrary client membership.
ALTER TABLE auth.users DISABLE TRIGGER jn_sync_customer_registration;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000066','signup-backfill@example.test',clock_timestamp(),'{"display_name":"Cadastro Portal Historico"}');
ALTER TABLE auth.users ENABLE TRIGGER jn_sync_customer_registration;
SET ROLE migrator;
SELECT private.sync_customer_registration('00000000-0000-4000-a000-000000000066');
SELECT private.sync_customer_registration('00000000-0000-4000-a000-000000000045');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000066')=1
 AND NOT EXISTS(SELECT FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id WHERE m.user_id='00000000-0000-4000-a000-000000000045'),
 'cadastro integrado: backfill usa origem registrada sem associar membro arbitrario');
SELECT test.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid='private.customer_registrations'::regclass)
 AND NOT has_table_privilege('authenticated','private.customer_registrations','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('service_role','private.customer_registrations','SELECT,INSERT,UPDATE,DELETE')
 AND NOT EXISTS(SELECT FROM public.audit_events WHERE action='auth.customer_registration_received' AND changes<>'{}'),
 'cadastro integrado: RLS ACL e auditoria sem dados pessoais preservadas');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000041','signup-team-invitation@example.test','Pessoa Equipe Ficticia','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid());
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000067','signup-team-invitation@example.test',clock_timestamp(),'{"display_name":"Pessoa Equipe Ficticia"}');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000000067')
 AND NOT EXISTS(SELECT FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000067'),
 'cadastro integrado: convite de equipe preserva supressao do bootstrap e da ficha');
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000068','signup-inactive@example.test',NULL,'{"display_name":"Cadastro Portal Inativo"}');
UPDATE public.memberships SET active=false WHERE user_id='00000000-0000-4000-a000-000000000068';
UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id='00000000-0000-4000-a000-000000000068';
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id WHERE m.user_id='00000000-0000-4000-a000-000000000068'),
 'cadastro integrado: confirmar email nao reativa vinculo de negocio inativo');
UPDATE public.memberships SET active=false WHERE user_id='00000000-0000-4000-a000-000000000062';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','Cadastro Portal Compartilhado',1,3)->>'total'='0',
 'cadastro integrado: origem pendente revalida estado atual do vinculo');
RESET ROLE;
UPDATE public.memberships SET active=true WHERE user_id='00000000-0000-4000-a000-000000000062';
SELECT test.expect_error(format('UPDATE private.customer_registrations SET association_status=%L WHERE id=%L','approved',:'shared_registration_id'),'23514',
 'cadastro integrado: estado aprovado nao existe nesta correcao');
SELECT test.expect_error(format('UPDATE private.customer_registrations SET materialized_customer_id=%L WHERE id=%L',:'other07_id',:'shared_registration_id'),'23503',
 'cadastro integrado: referencia de origem exige ficha no mesmo tenant');
SET ROLE migrator;
SELECT private.configure_client_registration('00000000-0000-4000-e000-000000000042',true);
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000000069','signup-shared@example.test',clock_timestamp(),'{"display_name":"Cadastro Portal Outro Escritorio"}');
SELECT test.assert_true((SELECT count(*) FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000069' AND office_id='00000000-0000-4000-e000-000000000042')=1,
 'cadastro integrado: email em outro tenant nao bloqueia nem associa a ficha');
SET ROLE migrator;
SELECT private.configure_client_registration('00000000-0000-4000-e000-000000000041',false);
RESET ROLE;
RESET request.jwt.claims;
