-- Separate fixture: two owners, each trying to deactivate its own membership.
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('00000000-0000-4000-a000-000000000021','race-a@example.test',now(),'provider-password'),
 ('00000000-0000-4000-a000-000000000022','race-b@example.test',now(),'provider-password');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('00000000-0000-4000-c000-000000000021','00000000-0000-4000-a000-000000000021'),
 ('00000000-0000-4000-c000-000000000022','00000000-0000-4000-a000-000000000022');
INSERT INTO public.profiles(id) VALUES
 ('00000000-0000-4000-a000-000000000021'),('00000000-0000-4000-a000-000000000022');
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000021','Corrida de owners ficticios');
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES
 ('00000000-0000-4000-b000-000000000021','00000000-0000-4000-e000-000000000021','00000000-0000-4000-a000-000000000021','owner'),
 ('00000000-0000-4000-b000-000000000022','00000000-0000-4000-e000-000000000021','00000000-0000-4000-a000-000000000022','owner');
SELECT test.assert_true((SELECT count(*) FROM public.memberships WHERE office_id='00000000-0000-4000-e000-000000000021' AND active AND role_code='owner')=2,
 'corrida inicia com dois proprietarios ativos');
