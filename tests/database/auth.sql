-- Same identity and claims, but no longer an active provider session.
UPDATE public.memberships SET role_code='owner' WHERE user_id='00000000-0000-4000-a000-000000000001';
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000001","session_id":"00000000-0000-4000-c000-000000000001"}';
DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000001';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.offices)=0,
  'sessao revogada bloqueia JWT antigo na camada RLS');
RESET ROLE;
INSERT INTO auth.sessions(id,user_id,not_after) VALUES
  ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-a000-000000000001',now()-interval '1 minute');
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.my_access_context())=0,'sessao com not_after expirado bloqueia');
RESET ROLE;
UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000001';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.my_access_context())=1,'RPC descobre apenas contexto proprio vigente');
RESET ROLE;

REVOKE INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
SET ROLE migrator;
SELECT private.configure_client_registration((SELECT id FROM public.offices WHERE name='Escritorio Ficticio A'),true);
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
  ('00000000-0000-4000-a000-000000000005','novo@example.test',NULL,'{"display_name":"Cliente Ficticio","role":"owner","office_id":"forged"}');
SELECT test.assert_true((SELECT role_code FROM public.memberships WHERE user_id='00000000-0000-4000-a000-000000000005')='client'
  AND (SELECT display_name FROM public.profiles WHERE id='00000000-0000-4000-a000-000000000005')='Cliente Ficticio',
  'cadastro cria perfil minimo e somente client, ignorando papel/escritorio forjados');
INSERT INTO auth.sessions(id,user_id) VALUES
  ('00000000-0000-4000-c000-000000000005','00000000-0000-4000-a000-000000000005');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000005","session_id":"00000000-0000-4000-c000-000000000005"}';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.my_access_context())=0,'cliente nao confirmado nao acessa');
DO $$ BEGIN
  BEGIN PERFORM * FROM auth.sessions; RAISE EXCEPTION 'API leu sessoes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM private.configure_client_registration(gen_random_uuid(),true); RAISE EXCEPTION 'API configurou cadastro';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='00000000-0000-4000-a000-000000000005';
SET ROLE authenticated;
SELECT test.assert_true((SELECT permissions FROM public.my_access_context())=ARRAY['foundation.access'],
  'cliente confirmado acessa somente capacidade minima');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.audit_events WHERE action='auth.client_registered')=1,
  'cadastro produz auditoria sem senha nem email no payload');
