RESET ROLE;
BEGIN;
SELECT test.assert_true((SELECT permission_code=ANY(ARRAY['rural.records.manage']) FROM private.team_member_permissions WHERE membership_id='29100000-0000-4000-8000-000000000001' AND permission_code='rural.records.manage'),'permissions: direct source retains rural record flag');
SELECT test.assert_true((SELECT allowed_permissions @> ARRAY['rural.records.manage'] FROM private.team_delegations WHERE membership_id='29100000-0000-4000-8000-000000000002' AND revoked_at IS NULL),'permissions: delegated source retains rural record flag');
SELECT private.team_validate_assignment(jsonb_build_object('allowed_roles',ARRAY['admin'],'allowed_permissions',ARRAY(SELECT code FROM public.permissions)),'admin',ARRAY(SELECT permission_code FROM private.team_member_permissions WHERE membership_id='29100000-0000-4000-8000-000000000001'));
SELECT test.assert_true(true,'permissions: saving direct grants does not require materializing temporary prerequisites');
SELECT test.assert_true(private.team_permissions_for_member('29100000-0000-4000-8000-000000000001') @> ARRAY['customers.read','customers.update','requests.read','files.read','rural.read','rural.records.manage'] AND private.team_permissions_for_member('29100000-0000-4000-8000-000000000002') @> ARRAY['customers.read','customers.update','requests.read','files.read','rural.read','rural.records.manage'],'permissions: both split-source arrangements preserve effective rural authority');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.team_dashboard('00000000-0000-4000-e000-000000000201','members',1,'Administrador divisão','all') AS splitdashboard \gset
SELECT test.assert_true((SELECT bool_and(v ? 'direct_permissions') FROM jsonb_array_elements(:'splitdashboard'::jsonb->'items')v),'permissions: dashboard separates direct and effective grants');
RESET ROLE;
UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id IN('29100000-0000-4000-8000-000000000001','29100000-0000-4000-8000-000000000002');
SELECT test.assert_true(NOT private.team_permissions_for_member('29100000-0000-4000-8000-000000000001') @> ARRAY['customers.read','customers.update','requests.read','files.read','rural.read','rural.records.manage'] AND NOT private.team_permissions_for_member('29100000-0000-4000-8000-000000000002') @> ARRAY['customers.read','customers.update','requests.read','files.read','rural.read','rural.records.manage'],'permissions: revoking delegation removes effective rural authority in both split arrangements');


SELECT test.assert_true((SELECT permissions @> ARRAY['rural.read','rural.parties.manage'] AND permissions @> ARRAY['rural.records.manage'] FROM private.team_invitations WHERE email='permission-edit-migration@example.test'),'permissions: legacy edit invite preserves dormant flags without invalidating acceptance');
SELECT test.assert_true((SELECT permissions @> ARRAY['rural.create'] FROM private.team_invitations WHERE email='permission-create-migration@example.test'),'permissions: incomplete legacy create invite remains usable');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.team_claim_delivery('00000000-0000-4000-e000-000000000201',(SELECT (v->>'id')::uuid FROM jsonb_array_elements(public.team_dashboard('00000000-0000-4000-e000-000000000201','invitations',1,'permission-edit-migration','all')->'items')v LIMIT 1),gen_random_uuid());
RESET ROLE;

INSERT INTO public.customers(id,office_id,kind,name,created_by)VALUES('28000000-0000-4000-8000-000000000001','00000000-0000-4000-e000-000000000201','person','Cliente do funcionário','00000000-0000-4000-a000-000000000202'),('28000000-0000-4000-8000-000000000002','00000000-0000-4000-e000-000000000201','person','Cliente de outro responsável','00000000-0000-4000-a000-000000000201');
INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000202',p FROM unnest(ARRAY['foundation.access','customers.read','customers.create','customers.update','customers.read_all'])p ON CONFLICT DO NOTHING;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code LIKE 'rural.%';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.expect_error($q$SELECT public.rural_state27('00000000-0000-4000-e000-000000000201',NULL,1)$q$,'PT403','permissions: employee cannot inherit rural access from customers');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','rural.read');
SET ROLE authenticated;
SELECT jsonb_build_object('kind','create','customer_id','28000000-0000-4000-8000-000000000001','name','Imóvel autorizado','municipality','Teste','state','MG','location','','identifiers','{}'::jsonb) AS pcmd \gset
SELECT test.expect_error(format('SELECT public.rural_command27(%L,NULL,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'pcmd'),'PT403','permissions: read cannot create rural property');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','rural.create');
SET ROLE authenticated;
SELECT public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,:'pcmd',gen_random_uuid())->>'id' AS ruralp \gset
SELECT test.assert_true(public.rural_state27('00000000-0000-4000-e000-000000000201',:'ruralp',1)#>>'{property,id}'=:'ruralp','permissions: authorized employee can create and read own rural property');
RESET ROLE;
UPDATE public.memberships SET role_code='admin' WHERE id='00000000-0000-4000-b000-000000000202';
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='rural.create';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.rural_command27(%L,NULL,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'pcmd'),'PT403','permissions: administrator title does not grant rural creation');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','rural.create');
SET ROLE authenticated;
SELECT test.assert_true(public.rural_command27('00000000-0000-4000-e000-000000000201',NULL,:'pcmd',gen_random_uuid())->>'id' IS NOT NULL,'permissions: authorized administrator can create rural property');
RESET ROLE;
INSERT INTO private.rural_properties(office_id,customer_id,name,municipality,state,location,created_by)VALUES('00000000-0000-4000-e000-000000000201','28000000-0000-4000-8000-000000000002','Imóvel de outro escopo','Teste','MG','','00000000-0000-4000-a000-000000000201') RETURNING id AS outsidep \gset
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.rural_state27(%L,%L,1)','00000000-0000-4000-e000-000000000201',:'outsidep'),'PT404','permissions: customers read_all alone does not widen rural scope');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','rural.read_all');
SET ROLE authenticated;
SELECT test.assert_true(public.rural_state27('00000000-0000-4000-e000-000000000201',:'outsidep',1)#>>'{property,id}'=:'outsidep','permissions: explicit rural read_all and customer scope allow office property');
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='rural.read';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.rural_state27('00000000-0000-4000-e000-000000000201',NULL,1)$q$,'PT403','permissions: revocation takes effect with same session JWT');
RESET ROLE;
SELECT test.assert_true(private.team_permissions_for_member('00000000-0000-4000-b000-000000000201') @> ARRAY['rural.read','rural.read_all','rural.create','rural.parties.manage','rural.records.manage'],'permissions: owner retains all rural rights');
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000202','rural.read');
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000202' AND permission_code='customers.create';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.rural_command27(%L,NULL,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'pcmd'),'PT403','permissions: rural flag cannot bypass customer prerequisites');
RESET ROLE;

ROLLBACK;
