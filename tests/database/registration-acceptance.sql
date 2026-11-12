-- Fictional identities only; this suite restores registration settings and every fixture.
BEGIN;
SET ROLE migrator;
UPDATE private.client_registration_settings SET enabled=false WHERE singleton;
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-4000-a000-000000009801','acceptance-owner@example.test',clock_timestamp());
INSERT INTO public.offices(id,name) VALUES
 ('00000000-0000-4000-e000-000000009801','Aceites Ficticios');
INSERT INTO public.profiles(id,display_name) VALUES
 ('00000000-0000-4000-a000-000000009801','Owner Ficticio');
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES
 ('00000000-0000-4000-b000-000000009801','00000000-0000-4000-e000-000000009801','00000000-0000-4000-a000-000000009801','owner');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('00000000-0000-4000-c000-000000009801','00000000-0000-4000-a000-000000009801');
SET ROLE migrator;
SELECT private.configure_client_registration('00000000-0000-4000-e000-000000009801',true);
RESET ROLE;

CREATE TEMP TABLE acceptance_rejections(id uuid DEFAULT gen_random_uuid(),label text,metadata jsonb);
INSERT INTO acceptance_rejections(label,metadata) VALUES
 ('absent','{}'),
 ('null','{"jn_client_acceptance":null}'),
 ('array','{"jn_client_acceptance":[]}'),
 ('string','{"jn_client_acceptance":"accepted"}'),
 ('empty','{"jn_client_acceptance":{}}'),
 ('missing terms','{"jn_client_acceptance":{"version":"2026-11-12.1","privacy":true,"cookies":true,"optional_cookies":false}}'),
 ('missing optional preference','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true}}'),
 ('false terms','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":false,"privacy":true,"cookies":true,"optional_cookies":false}}'),
 ('false privacy','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":false,"cookies":true,"optional_cookies":false}}'),
 ('false cookies','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":false,"optional_cookies":false}}'),
 ('string boolean','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":"true","privacy":true,"cookies":true,"optional_cookies":false}}'),
 ('null boolean','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":null,"cookies":true,"optional_cookies":false}}'),
 ('wrong version','{"jn_client_acceptance":{"version":"2026-11-11.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":false}}'),
 ('extra property','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":false,"role":"owner"}}'),
 ('optional tracking true','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":true}}'),
 ('optional tracking string','{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":"false"}}');
SELECT test.expect_error(format('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES(%L,%L,%L::jsonb)',id,
 'acceptance-rejected-'||id||'@example.test',metadata),'PT422','aceites: rejeita '||label) FROM acceptance_rejections;
SELECT test.assert_true(NOT EXISTS(SELECT FROM auth.users WHERE id IN(SELECT id FROM acceptance_rejections))
 AND NOT EXISTS(SELECT FROM public.profiles WHERE id IN(SELECT id FROM acceptance_rejections))
 AND NOT EXISTS(SELECT FROM public.memberships WHERE user_id IN(SELECT id FROM acceptance_rejections)),
 'aceites: rejeicao reverte Auth perfil e vinculo atomicamente');
DO $$ DECLARE actual_message text; BEGIN
 BEGIN
  INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'acceptance-safe-error@example.test');
 EXCEPTION WHEN SQLSTATE 'PT422' THEN GET STACKED DIAGNOSTICS actual_message=MESSAGE_TEXT;
 END;
 PERFORM test.assert_true(actual_message='REGISTRATION_ACCEPTANCE_REQUIRED','aceites: erro seguro e estavel');
END $$;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.client_registration_acceptances WHERE user_id='00000000-0000-4000-a000-000000009801'),
 'aceites: nenhuma evidencia fabricada para conta bootstrap existente');
CREATE TEMP TABLE acceptance_clock(started_at timestamptz);
INSERT INTO acceptance_clock VALUES(clock_timestamp());
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('00000000-0000-4000-a000-000000009802','acceptance-valid@example.test',
 '{"display_name":"Cliente Ficticio","role":"owner","office_id":"forged","jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":false}}');
SELECT test.assert_true((SELECT count(*) FROM private.client_registration_acceptances WHERE user_id='00000000-0000-4000-a000-000000009802'
 AND office_id='00000000-0000-4000-e000-000000009801' AND policy_version='2026-11-12.1'
 AND terms_accepted AND privacy_accepted AND necessary_cookies_acknowledged AND NOT optional_cookies
 AND accepted_at>=(SELECT started_at FROM acceptance_clock) AND accepted_at<=clock_timestamp())=1,
 'aceites: tres reconhecimentos e cookies opcionais recusados com versao e horario do servidor');
SELECT test.assert_true((SELECT role_code='client' AND office_id='00000000-0000-4000-e000-000000009801' FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000009802')
 AND (SELECT display_name='Cliente Ficticio' FROM public.profiles WHERE id='00000000-0000-4000-a000-000000009802'),
 'aceites: dados declarados nao concedem papel nem escritorio');
CREATE TEMP TABLE acceptance_snapshot AS SELECT * FROM private.client_registration_acceptances WHERE user_id='00000000-0000-4000-a000-000000009802';
UPDATE auth.users SET raw_user_meta_data='{"jn_client_acceptance":{"version":"forged","terms":false}}' WHERE id='00000000-0000-4000-a000-000000009802';
SELECT test.assert_true((SELECT to_jsonb(a)=to_jsonb(s) FROM private.client_registration_acceptances a CROSS JOIN acceptance_snapshot s WHERE a.user_id=s.user_id),
 'aceites: alteracao posterior de metadata nao reescreve evidencia');
UPDATE public.memberships SET active=false WHERE user_id='00000000-0000-4000-a000-000000009802';
UPDATE auth.users SET raw_user_meta_data='{"role":"owner","jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":false}}' WHERE id='00000000-0000-4000-a000-000000009802';
SELECT test.assert_true((SELECT NOT active AND role_code='client' FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000009802')
 AND (SELECT to_jsonb(a)=to_jsonb(s) FROM private.client_registration_acceptances a CROSS JOIN acceptance_snapshot s WHERE a.user_id=s.user_id),
 'aceites: metadata valida nao ressuscita vinculo revogado nem regrava evidencia');
SELECT test.expect_error($q$UPDATE private.client_registration_acceptances SET accepted_at=clock_timestamp() WHERE user_id='00000000-0000-4000-a000-000000009802'$q$,'55000','aceites: registro imutavel em UPDATE');
SELECT test.expect_error($q$DELETE FROM private.client_registration_acceptances WHERE user_id='00000000-0000-4000-a000-000000009802'$q$,'55000','aceites: registro imutavel em DELETE');
SELECT test.expect_error('TRUNCATE private.client_registration_acceptances','55000','aceites: registro imutavel em TRUNCATE');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000009801","session_id":"00000000-0000-4000-c000-000000009801"}';
SET ROLE authenticated;
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000009801','acceptance-team@example.test','Equipe Ficticia','52998224725','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 day',gen_random_uuid());
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-a000-000000009803','acceptance-team@example.test');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000009803')
 AND NOT EXISTS(SELECT FROM public.profiles WHERE id='00000000-0000-4000-a000-000000009803')
 AND NOT EXISTS(SELECT FROM private.client_registration_acceptances WHERE user_id='00000000-0000-4000-a000-000000009803'),
 'aceites: convite pendente com autoridade preserva bypass sem fabricar aceite');
-- A raw Auth invited_at field or forged metadata is not authoritative team invitation state.
SELECT test.expect_error($q$INSERT INTO auth.users(id,email,invited_at,raw_user_meta_data) VALUES(gen_random_uuid(),'acceptance-fake-invite@example.test',clock_timestamp(),'{"role":"owner","invited":true}')$q$,
 'PT422','aceites: invited_at e metadata nao contornam exigencia');
UPDATE public.memberships SET active=false WHERE id='00000000-0000-4000-b000-000000009801';
SELECT test.expect_error($q$INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),'acceptance-team@example.test')$q$,'PT422',
 'aceites: convite sem autoridade atual nao contorna exigencia');
UPDATE public.memberships SET active=true WHERE id='00000000-0000-4000-b000-000000009801';

INSERT INTO auth.users(id,email,is_anonymous) VALUES
 ('00000000-0000-4000-a000-000000009804','acceptance-anonymous@example.test',true),
 ('00000000-0000-4000-a000-000000009805',NULL,false);
SET ROLE migrator;
SELECT private.configure_client_registration('00000000-0000-4000-e000-000000009801',false);
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-a000-000000009806','acceptance-disabled@example.test');
SET ROLE migrator;
UPDATE private.client_registration_settings SET office_id=NULL,enabled=false WHERE singleton;
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-4000-a000-000000009807','acceptance-unconfigured@example.test');
SET ROLE migrator;
SELECT private.configure_client_registration('00000000-0000-4000-e000-000000009801',true);
RESET ROLE;
UPDATE auth.users SET raw_user_meta_data='{"jn_client_acceptance":{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":false}}' WHERE id='00000000-0000-4000-a000-000000009806';
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.memberships WHERE user_id BETWEEN '00000000-0000-4000-a000-000000009804' AND '00000000-0000-4000-a000-000000009807')
 AND NOT EXISTS(SELECT FROM public.profiles WHERE id BETWEEN '00000000-0000-4000-a000-000000009804' AND '00000000-0000-4000-a000-000000009807')
 AND NOT EXISTS(SELECT FROM private.client_registration_acceptances WHERE user_id BETWEEN '00000000-0000-4000-a000-000000009804' AND '00000000-0000-4000-a000-000000009807'),
 'aceites: bootstrap desabilitado nao ganha vinculo ou evidencia por update de metadata');
SELECT test.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid='private.client_registration_acceptances'::regclass)
 AND NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='private.client_registration_acceptances'::regclass)
 AND NOT EXISTS(SELECT FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE
 has_table_privilege(r,'private.client_registration_acceptances','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
 OR has_function_privilege(r,'private.register_new_client()','EXECUTE')
 OR has_function_privilege(r,'private.guard_client_registration_acceptance()','EXECUTE')),
 'aceites: RLS sem policies e ACL de tabela e helpers fechadas');
SET ROLE authenticated;
SELECT test.expect_error('SELECT * FROM private.client_registration_acceptances','42501','aceites: cliente nao le evidencia privada');
SELECT test.expect_error('SELECT private.guard_client_registration_acceptance()','42501','aceites: cliente nao executa helper interno');
RESET ROLE;
ROLLBACK;
