SELECT test.assert_true((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r')=14, 'quatorze tabelas instaladas');
SELECT test.assert_true((SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname='migrator'),
  'migrador sem superusuario e sem BYPASSRLS');
SELECT test.assert_true((SELECT bool_and(c.relowner='migrator'::regrole AND c.relrowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
  'tabelas do migrador com RLS');
SELECT test.assert_true(NOT EXISTS (SELECT p.polrelid FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND p.polpermissive
    AND p.polcmd IN ('*','r') AND 'authenticated'::regrole=ANY(p.polroles)
  GROUP BY p.polrelid HAVING count(*)>1), 'SELECT sem policies permissivas redundantes');
SELECT test.assert_true((SELECT count(*) FROM public.roles)=4 AND (SELECT count(*) FROM public.permissions)=42
  AND (SELECT count(*) FROM public.role_permissions)=45, 'seed minimo completo sem cadastro posterior');
SELECT test.assert_true((SELECT array_agg(role_code ORDER BY role_code) FROM public.role_permissions
  WHERE permission_code='foundation.access')=ARRAY['admin','client','employee','owner']
  AND (SELECT array_agg(role_code) FROM public.role_permissions WHERE permission_code='audit.read')=ARRAY['owner'],
  'seed concede somente capacidades previstas a cada papel');
SELECT test.assert_true((SELECT count(*) FROM public.offices)=0 AND (SELECT count(*) FROM public.profiles)=0
  AND (SELECT count(*) FROM auth.users)=0, 'instalacao nao cria contas nem senhas');
SELECT test.assert_true(NOT has_function_privilege('anon','public.access_context(uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated','private.provision_owner(uuid,text,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','private.provision_owner(uuid,text,uuid)','EXECUTE'),
  'ACL de RPC e bootstrap restrita');
SELECT test.assert_true(NOT has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE'),
  'funcao interna preexistente nao pode ser executada pelos clientes');
SELECT test.assert_true(NOT EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND
    (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),
  'nenhum SECURITY DEFINER publico executavel pela API');

INSERT INTO auth.users(id,email_confirmed_at) VALUES
  ('00000000-0000-4000-a000-000000000001',now()),
  ('00000000-0000-4000-a000-000000000002',now()),
  ('00000000-0000-4000-a000-000000000003',now()),
  ('00000000-0000-4000-a000-000000000004',NULL);
INSERT INTO auth.sessions(id,user_id) VALUES
  ('00000000-0000-4000-c000-000000000001','00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-c000-000000000002','00000000-0000-4000-a000-000000000002');
SET ROLE migrator;
DO $$ BEGIN
  BEGIN
    PERFORM private.provision_owner('00000000-0000-4000-a000-000000000004','Teste',gen_random_uuid());
    RAISE EXCEPTION 'bootstrap aceitou identidade nao confirmada';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ALTER TABLE public.audit_events ADD CONSTRAINT test_audit_failure CHECK (action <> 'foundation.owner_provisioned');
DO $$ BEGIN
  BEGIN
    PERFORM private.provision_owner('00000000-0000-4000-a000-000000000001','Teste',gen_random_uuid());
    RAISE EXCEPTION 'provisionamento ignorou falha de auditoria';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT test.assert_true((SELECT count(*) FROM public.offices)=0 AND (SELECT count(*) FROM public.profiles)=0
  AND (SELECT count(*) FROM public.memberships)=0, 'falha de auditoria reverte todo provisionamento');
ALTER TABLE public.audit_events DROP CONSTRAINT test_audit_failure;
SELECT private.provision_owner('00000000-0000-4000-a000-000000000001','Escritorio Ficticio A',
  '00000000-0000-4000-b000-000000000001') AS office_a \gset
DO $$ BEGIN
  BEGIN
    PERFORM private.provision_owner('00000000-0000-4000-a000-000000000002','Outro',gen_random_uuid());
    RAISE EXCEPTION 'bootstrap permitiu nova atribuicao depois da instalacao';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;
INSERT INTO public.offices(name) VALUES ('Escritorio Ficticio B') RETURNING id AS office_b \gset
INSERT INTO public.profiles(id) VALUES ('00000000-0000-4000-a000-000000000002');
INSERT INTO public.memberships(office_id,user_id,role_code) VALUES
  (:'office_b','00000000-0000-4000-a000-000000000002','owner');
INSERT INTO public.audit_events(office_id,action,target_type,target_id,actor_kind,actor_db_role)
  VALUES (:'office_b','test.fixture','office',:'office_b','operator',current_user);
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.audit_events WHERE action='foundation.owner_provisioned')=1,
  'bootstrap produz auditoria transacional');
DO $$ BEGIN
  BEGIN UPDATE public.audit_events SET action='forged'; RAISE EXCEPTION 'auditoria alterada pelo operador';
  EXCEPTION WHEN SQLSTATE '55000' THEN NULL; END;
END $$;
SELECT 'PASS: trigger preserva auditoria inclusive contra UPDATE comum do operador';

SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.offices; RAISE EXCEPTION 'anon leu dados';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.access_context(gen_random_uuid()); RAISE EXCEPTION 'anon executou RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: anon sem acesso a dados ou RPC';

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000003","session_id":"00000000-0000-4000-c000-000000000003","user_metadata":{"role":"owner"}}';
SELECT test.assert_true((SELECT count(*) FROM public.offices)=0 AND (SELECT count(*) FROM public.profiles)=0
  AND (SELECT count(*) FROM public.memberships)=0,
  'sem vinculo nao le dados mesmo com metadata forjada');
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0,
  'RPC nega usuario sem vinculo');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000001","session_id":"00000000-0000-4000-c000-000000000001"}';
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=1
  AND (SELECT permissions FROM public.access_context(:'office_a')) @> ARRAY['foundation.access','audit.read'],
  'A acessa contexto e capacidades do proprio escritorio');
SELECT test.assert_true((SELECT count(*) FROM public.offices)=1 AND (SELECT count(*) FROM public.memberships)=1
  AND (SELECT count(*) FROM public.profiles)=1, 'A ve somente linhas proprias');
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_b'))=0,
  'A nao le escritorio nem auditoria de B');
SELECT test.assert_true((SELECT count(*) FROM public.access_context(NULL))=0, 'escopo nulo nega acesso');
DO $$ BEGIN
  BEGIN UPDATE public.memberships SET role_code='owner'; RAISE EXCEPTION 'papel alterado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.profiles(id) VALUES (auth.uid()); RAISE EXCEPTION 'auto cadastro privilegiado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.audit_events SET actor_id=auth.uid(); RAISE EXCEPTION 'ator alterado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.audit_events; RAISE EXCEPTION 'auditoria apagada';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.roles(code,name) VALUES ('forged','Forjado'); RAISE EXCEPTION 'papel criado';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM private.provision_owner(auth.uid(),'Forjado',gen_random_uuid()); RAISE EXCEPTION 'bootstrap publico';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: payload nao altera papel, ator, catalogo ou auditoria';

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000002","session_id":"00000000-0000-4000-c000-000000000002"}';
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0
  AND (SELECT count(*) FROM public.access_context(:'office_b'))=1, 'B isolado de A na direcao inversa');
RESET ROLE;

-- Keep the exact same claims through deactivation and role/capability changes.
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000001","session_id":"00000000-0000-4000-c000-000000000001","app_metadata":{"role":"owner"}}';
UPDATE public.memberships SET active=false WHERE office_id=:'office_a';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0
 , 'vinculo inativo bloqueia claim antigo');
RESET ROLE;
UPDATE public.memberships SET active=true WHERE office_id=:'office_a';
UPDATE public.profiles SET active=false WHERE id='00000000-0000-4000-a000-000000000001';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0
  AND (SELECT count(*) FROM public.profiles)=0, 'perfil inativo bloqueia claim antigo');
RESET ROLE;
UPDATE public.profiles SET active=true WHERE id='00000000-0000-4000-a000-000000000001';
UPDATE public.offices SET active=false WHERE id=:'office_a';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0, 'escritorio inativo bloqueia');
RESET ROLE;
UPDATE public.offices SET active=true WHERE id=:'office_a';
UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id='00000000-0000-4000-a000-000000000001';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0, 'banimento Auth bloqueia claim antigo');
RESET ROLE;
UPDATE auth.users SET banned_until=NULL WHERE id='00000000-0000-4000-a000-000000000001';
UPDATE public.roles SET active=false WHERE code='owner';
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.access_context(:'office_a'))=0, 'papel inativo bloqueia');
RESET ROLE;
UPDATE public.roles SET active=true WHERE code='owner';
UPDATE public.permissions SET active=false WHERE code='audit.read';
SET ROLE authenticated;
SELECT test.assert_true(NOT ((SELECT permissions FROM public.access_context(:'office_a')) @> ARRAY['audit.read'])
 , 'revogacao de capacidade imediata sem renovar claim');
RESET ROLE;
UPDATE public.permissions SET active=true WHERE code='audit.read';
UPDATE public.memberships SET role_code='employee' WHERE office_id=:'office_a';
SET ROLE authenticated;
SELECT test.assert_true((SELECT role_code FROM public.access_context(:'office_a'))='employee'
  AND (SELECT permissions FROM public.access_context(:'office_a'))=ARRAY['foundation.access'],
  'mudanca comercial prevalece sobre metadata antiga de owner');
RESET ROLE;

-- Prove RLS also denies writes even if an operator accidentally broadens table grants.
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
SET ROLE authenticated;
WITH changed AS (UPDATE public.memberships SET role_code='owner',office_id=:'office_b' RETURNING *)
  SELECT test.assert_true((SELECT count(*) FROM changed)=0, 'RLS UPDATE nega troca de papel e escritorio');
WITH changed AS (DELETE FROM public.audit_events RETURNING *)
  SELECT test.assert_true((SELECT count(*) FROM changed)=0, 'RLS DELETE preserva auditoria');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.audit_events(office_id,action,target_type,actor_id,actor_kind)
      VALUES (gen_random_uuid(),'forged','office',auth.uid(),'user');
    RAISE EXCEPTION 'auditoria forjada aceita';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'PASS: RLS INSERT nega auditoria forjada mesmo com GRANT';

REVOKE INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE SELECT ON public.audit_events FROM authenticated;
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT * FROM public.audit_events$q$,'42501','consulta bruta de auditoria substituida pelo DTO/RPC da06');
RESET ROLE;
