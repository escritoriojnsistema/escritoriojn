-- Run after all migrations in the disposable database. No provider sessions are modified.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('a1000000-0000-4000-a000-000000000001','idle-owner@example.test',clock_timestamp()),
 ('a1000000-0000-4000-a000-000000000002','idle-client@example.test',clock_timestamp());
SET ROLE migrator;
INSERT INTO public.offices(id,name) VALUES('a1000000-0000-4000-b000-000000000001','Inatividade descartável');
INSERT INTO public.profiles(id) VALUES('a1000000-0000-4000-a000-000000000001'),('a1000000-0000-4000-a000-000000000002') ON CONFLICT DO NOTHING;
DELETE FROM public.memberships WHERE user_id IN('a1000000-0000-4000-a000-000000000001','a1000000-0000-4000-a000-000000000002');
INSERT INTO public.memberships(office_id,user_id,role_code) VALUES
 ('a1000000-0000-4000-b000-000000000001','a1000000-0000-4000-a000-000000000001','owner'),
 ('a1000000-0000-4000-b000-000000000001','a1000000-0000-4000-a000-000000000002','client');
RESET ROLE;
INSERT INTO auth.sessions(id,user_id) VALUES
 ('a1000000-0000-4000-c000-000000000001','a1000000-0000-4000-a000-000000000001'),
 ('a1000000-0000-4000-c000-000000000002','a1000000-0000-4000-a000-000000000002');
SET request.jwt.claims='{"sub":"a1000000-0000-4000-a000-000000000001","session_id":"a1000000-0000-4000-c000-000000000001","role":"authenticated"}';
SET ROLE authenticated;
SELECT test.assert_true((public.session_activity(false)->>'idle_minutes')::int=30,'leitura inicial usa prazo oficial padrão');
SELECT public.session_activity(false) AS first_activity \gset
SELECT test.assert_true((public.session_activity(false)->>'expires_at')=(:'first_activity'::jsonb->>'expires_at'),'leituras repetidas não renovam');
SELECT test.assert_true((public.access_policies_state('a1000000-0000-4000-b000-000000000001')->>'can_manage')::boolean,'owner com access.manage pode gerir');
SELECT public.access_policies_set('a1000000-0000-4000-b000-000000000001','client',60,1,'a1000000-0000-4000-d000-000000000001');
RESET ROLE;
SET ROLE migrator;
UPDATE private.session_activities SET last_activity_at=clock_timestamp()-interval '40 minutes',expires_at=clock_timestamp()-interval '10 minutes' WHERE user_id='a1000000-0000-4000-a000-000000000001';
RESET ROLE;
SET ROLE authenticated;
SELECT test.expect_error('SELECT public.session_activity(true)','PT401','interação tardia não ressuscita JWT válido');
SELECT test.expect_error('SELECT public.access_policies_state(''a1000000-0000-4000-b000-000000000001'')','PT401','RPC de negócio rejeita sessão expirada');
SELECT test.assert_true(cardinality(private.current_permissions('a1000000-0000-4000-b000-000000000001'))=0,'RLS remove todas as permissões depois do prazo');
RESET ROLE;
SET ROLE migrator;
UPDATE private.access_policies SET idle_minutes=180,revision=revision+1 WHERE office_id='a1000000-0000-4000-b000-000000000001' AND audience='team';
RESET ROLE;
SET ROLE authenticated;
SELECT test.expect_error('SELECT public.session_activity(false)','PT401','aumento da política não reativa sessão vencida');
RESET ROLE;
SET request.jwt.claims='{"sub":"a1000000-0000-4000-a000-000000000002","session_id":"a1000000-0000-4000-c000-000000000002","role":"authenticated"}';
SET ROLE authenticated;
SELECT test.assert_true((public.session_activity(false)->>'idle_minutes')::int=60,'política cliente independente da equipe');
SELECT test.expect_error('SELECT public.access_policies_state(''a1000000-0000-4000-b000-000000000001'')','PT403','cliente não acessa gestão');
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.session_activities','UPDATE') AND NOT has_function_privilege('anon','public.session_activity(boolean)','EXECUTE') AND NOT has_function_privilege('service_role','public.session_activity(boolean)','EXECUTE'),'atividade não aceita escrita direta ou service JWT');
ROLLBACK;
