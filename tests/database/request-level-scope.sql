BEGIN;
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000733','requests.read'),('00000000-0000-4000-b000-000000000733','requests.read_all') ON CONFLICT DO NOTHING;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000734","session_id":"00000000-0000-4000-c000-000000000734"}';
-- Internal fixture represents a legacy unclassified request, not a public opening.
SELECT private.request_create('00000000-0000-4000-e000-000000000731','{"origin":"portal","title":"Scope fixture","message":"Coleta"}',gen_random_uuid(),gen_random_uuid())->>'id' AS scoped_id \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000733","session_id":"00000000-0000-4000-c000-000000000733"}';
SELECT test.assert_true(NOT private.request_execution_allowed(r,m) AND NOT private.request_in_scope(r,m),'levels: read_all never opens an unclassified/restricted request') FROM public.requests r CROSS JOIN public.memberships m WHERE r.id=:'scoped_id' AND m.id='00000000-0000-4000-b000-000000000733' LIMIT 1;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.service_versions v WHERE NOT EXISTS(SELECT FROM private.service_version_categories c WHERE c.office_id=v.office_id AND c.version_id=v.id)),'categories: every existing service version has one canonical reference');
SELECT test.assert_true(NOT EXISTS(SELECT office_id,lower(btrim(name)) FROM private.service_categories GROUP BY office_id,lower(btrim(name)) HAVING count(*)>1),'categories: no normalized duplicate category names introduced');

ROLLBACK;
