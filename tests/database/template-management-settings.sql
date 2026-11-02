-- Disposable database only, after templates.sql and the settings migrations.
BEGIN;
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000204','templates.read') ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||'{"code":"MANAGEMENT-SETTINGS","name":"Título inicial"}',0,'Teste isolado de modelos',gen_random_uuid()) AS management_first \gset
SELECT :'management_first'::jsonb->>'id' AS management_tid,:'management_first'::jsonb->'versions'->0->>'id' AS management_vid \gset
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201','{"kind":"create","name":"Pasta de gestão isolada"}',gen_random_uuid()) AS management_folders \gset
SELECT value->>'id' AS management_folder FROM jsonb_array_elements(:'management_folders'::jsonb->'folders') WHERE value->>'name'='Pasta de gestão isolada' \gset
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'management_tid','folder_id',:'management_folder','expected_revision',0),gen_random_uuid());
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',:'management_folder',false,false,'MANAGEMENT-SETTINGS',1,5,'draft')->>'total'='1','management: initial draft is inside its folder');
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',:'management_tid',:'management_vid',1,'Aprovação isolada',gen_random_uuid());
SELECT public.model_commercial_state('00000000-0000-4000-e000-000000000201',:'management_tid')->'metadata'->>'revision' AS management_revision \gset
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'management_tid','{"kind":"rename","name":"Título preservado"}',:management_revision,gen_random_uuid());
SELECT public.template_save('00000000-0000-4000-e000-000000000201',:'management_tid',test.template_definition20()||'{"code":"MANAGEMENT-SETTINGS","name":"Nome da versão nova","content":"Texto novo e ainda não aprovado","variables":[]}',1,'Edição do aprovado',gen_random_uuid()) AS management_second \gset
SELECT test.assert_true(:'management_second'::jsonb @> '{"latest_version":2,"versions":[{"number":2,"approved_at":null},{"number":1}]}','management: editing creates a new unapproved version');
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',:'management_folder',false,false,'MANAGEMENT-SETTINGS',1,5,'draft')->>'total'='1','management: approved model with new draft remains in draft folder');
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',:'management_folder',false,false,'MANAGEMENT-SETTINGS',1,5,'approved')->'items'->0 @> '{"name":"Título preservado","current_version":1}','management: approved tab retains the original approval and renamed title');
SELECT test.assert_true(public.model_commercial_state('00000000-0000-4000-e000-000000000201',:'management_tid')->'metadata'->>'display_name'='Título preservado','management: saving version does not replace renamed title');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000204","session_id":"00000000-0000-4000-c000-000000000204"}';
SELECT public.template_detail('00000000-0000-4000-e000-000000000201',:'management_tid',1) AS management_reader \gset
SELECT test.assert_true(:'management_reader'::jsonb @> '{"latest_version":2,"history_total":1,"can_manage":false,"can_approve":false}' AND jsonb_array_length(:'management_reader'::jsonb->'versions')=1 AND :'management_reader'::jsonb->'versions'->0->>'id'=:'management_vid','management: employee reader receives approved version only');
SELECT test.assert_true(strpos(:'management_reader','Texto novo e ainda não aprovado')=0,'management: draft content never reaches employee detail');
SELECT test.assert_true(public.templates_page('00000000-0000-4000-e000-000000000201','MANAGEMENT-SETTINGS',1,5)->'items'->0->>'current_version'='1','management: legacy search uses approved visibility');
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',:'management_folder',false,false,'MANAGEMENT-SETTINGS',1,5)->>'total'='1','management: legacy folder search retains approved visibility');
SELECT test.expect_error(format('SELECT public.model_templates_page(%L,NULL,false,false,%L,1,5,%L)','00000000-0000-4000-e000-000000000201','MANAGEMENT-SETTINGS','draft'),'PT403','management: read-only employee cannot request draft list');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.model_commercial_state('00000000-0000-4000-e000-000000000201',:'management_tid')->'metadata'->>'revision' AS management_revision \gset
SELECT gen_random_uuid() AS management_archive_key \gset
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'management_tid','{"kind":"archive"}',:management_revision,:'management_archive_key');
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'management_tid','{"kind":"archive"}',:management_revision,:'management_archive_key');
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',:'management_folder',false,false,'MANAGEMENT-SETTINGS',1,5,'draft')->>'total'='0' AND public.model_templates_page('00000000-0000-4000-e000-000000000201',:'management_folder',false,false,'MANAGEMENT-SETTINGS',1,5,'approved')->>'total'='0','management: deletion removes both tabs without deleting history');
SELECT test.assert_true(public.templates_page('00000000-0000-4000-e000-000000000201','MANAGEMENT-SETTINGS',1,5)->>'total'='0','management: deleted template disappears from legacy list too');
SELECT test.assert_true(jsonb_array_length(public.template_detail('00000000-0000-4000-e000-000000000201',:'management_tid',1)->'versions')=2,'management: authorized manager retains historical versions after deletion');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000204","session_id":"00000000-0000-4000-c000-000000000204"}';
SELECT test.expect_error(format('SELECT public.template_detail(%L,%L,1)','00000000-0000-4000-e000-000000000201',:'management_tid'),'PT404','management: deleted model is not available to employee');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=2 FROM public.template_versions WHERE template_id=:'management_tid') AND (SELECT count(*)=1 FROM private.template_approvals WHERE template_id=:'management_tid'),'management: immutable versions and approval remain stored');
SELECT test.assert_true(NOT has_function_privilege('authenticated','private.model_can_read_drafts(uuid)','EXECUTE') AND NOT has_function_privilege('anon','public.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer,text)','EXECUTE'),'management: helper and public RPC ACL remain closed');
ROLLBACK;
