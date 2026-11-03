-- Fixtures only in the disposable runner, after all current migrations.
BEGIN;
RESET ROLE;
CREATE FUNCTION test.repair_extend(tid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer;BEGIN FOR n IN 3..7 LOOP PERFORM public.template_save('00000000-0000-4000-e000-000000000201',tid,test.template_definition20()||'{"code":"REPAIR-TEST"}',n,'Versão local',gen_random_uuid());END LOOP;END $$;
CREATE FUNCTION test.repair_delete(tid uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer;value jsonb;BEGIN FOR n IN 3..7 LOOP
 value:=public.template_detail_version('00000000-0000-4000-e000-000000000201',tid,n);
 PERFORM public.model_version_command('00000000-0000-4000-e000-000000000201',tid,jsonb_build_object('kind','delete','version_id',(SELECT v->>'id' FROM jsonb_array_elements(value->'versions')v WHERE v->>'number'=n::text),'reason','Exclusão local'),8,gen_random_uuid());
 END LOOP;END $$;
SELECT test.assert_true((SELECT bool_and(private.template_version20(v)->>'source_import_id' IS NOT DISTINCT FROM v.source_import_id::text) FROM public.template_versions v WHERE source_import_id IS NOT NULL),'library: imported draft and approved projections preserve provenance required by API');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||'{"code":"REPAIR-TEST"}',0,'Teste local',gen_random_uuid()) AS repair_first \gset
SELECT :'repair_first'::jsonb->>'id' AS repair_tid,:'repair_first'::jsonb#>>'{versions,0,id}' AS repair_vid \gset
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',:'repair_tid',:'repair_vid',1,'Aprovação local',gen_random_uuid());
SELECT public.template_save('00000000-0000-4000-e000-000000000201',:'repair_tid',test.template_definition20()||'{"code":"REPAIR-TEST"}',1,'Segunda versão local',gen_random_uuid()) AS repair_second \gset
SELECT public.model_version_command('00000000-0000-4000-e000-000000000201',:'repair_tid',jsonb_build_object('kind','edit','version_id',:'repair_vid','definition',test.template_definition20()||'{"code":"REPAIR-TEST","name":"Aprovado editado"}','reason','Edição anterior'),2,gen_random_uuid()) AS repair_edited \gset
SELECT test.assert_true(:'repair_edited'::jsonb->>'latest_version'='2' AND :'repair_edited'::jsonb#>>'{versions,1,name}'='Aprovado editado' AND :'repair_edited'::jsonb#>>'{versions,1,approved_at}' IS NOT NULL,'library: older approved version edited in place with approval retained');
SELECT public.model_version_command('00000000-0000-4000-e000-000000000201',:'repair_tid',jsonb_build_object('kind','delete','version_id',:'repair_second'::jsonb#>>'{versions,0,id}','reason','Excluir rascunho'),2,gen_random_uuid());
SELECT public.template_save('00000000-0000-4000-e000-000000000201',:'repair_tid',test.template_definition20()||'{"code":"REPAIR-TEST"}',1,'Após exclusão',gen_random_uuid()) AS repair_third \gset
SELECT test.assert_true(:'repair_third'::jsonb->>'latest_version'='3','library: new version never reuses deleted version number');
SELECT test.expect_error(format('SELECT public.model_version_command(%L,%L,%L,3,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'repair_tid',jsonb_build_object('kind','edit','version_id',:'repair_vid','definition',test.template_definition20()||'{"code":"REPAIR-TEST"}','reason','Edição concorrente','expected_edited_at',NULL)::text),'PT409','library: stale in-place edit is rejected');
SELECT test.expect_error(format('SELECT public.model_version_command(%L,%L,%L,3,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'repair_tid',jsonb_build_object('kind','delete','version_id',:'repair_vid','reason','Exclusão concorrente','expected_edited_at',NULL)::text),'PT409','library: stale deletion cannot hide newly edited content');
SELECT test.repair_extend(:'repair_tid');
SELECT public.template_detail_version('00000000-0000-4000-e000-000000000201',:'repair_tid',1) AS repair_old_page \gset
SELECT test.assert_true(:'repair_old_page'::jsonb->>'history_page'='2','library: selected version located by actual visible rank');
SELECT public.model_version_command('00000000-0000-4000-e000-000000000201',:'repair_tid',jsonb_build_object('kind','edit','version_id',:'repair_vid','definition',test.template_definition20()||'{"code":"REPAIR-TEST","name":"Edição na página antiga"}','reason','Correção de histórico','expected_edited_at',:'repair_edited'::jsonb#>>'{versions,1,edited_at}'),8,gen_random_uuid()) AS repair_old_edit \gset
SELECT test.assert_true(:'repair_old_edit'::jsonb->>'history_page'='2' AND :'repair_old_edit'::jsonb#>>'{versions,1,id}'=:'repair_vid','library: in-place save returns page containing the edited version');
SELECT test.repair_delete(:'repair_tid');
SELECT test.assert_true(public.template_detail_version('00000000-0000-4000-e000-000000000201',:'repair_tid',1)->>'history_page'='1','library: deleted version gaps never cause empty page when opening approved');
-- Same version deletion preserves the original private rows and approvals.
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=8 FROM public.template_versions WHERE template_id=:'repair_tid') AND (SELECT count(*)=1 FROM private.template_approvals WHERE template_id=:'repair_tid'),'library: deleted rows and approval evidence remain stored');
SELECT s.id AS archive_sid,s.latest_version AS archive_version,v.definition AS archive_definition FROM public.services s JOIN public.service_versions v ON v.office_id=s.office_id AND v.service_id=s.id AND v.number=s.latest_version WHERE s.office_id='00000000-0000-4000-e000-000000000201' AND s.code='OFERTA-TESTE' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000204","session_id":"00000000-0000-4000-c000-000000000204"}';
SELECT test.expect_error(format('SELECT public.service_archive(%L,%L,%s,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'archive_sid',:archive_version,'Sem permissão'),'PT403','services: employee without permission cannot remove');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT value->>'id' AS entry_documents_category FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000201')->'items') WHERE value->>'is_documents'='true' \gset
SELECT test.assert_true((public.document_offers_page('00000000-0000-4000-e000-000000000201',NULL,false,'',1,5,:'entry_documents_category')->>'total')::int>0,'catalog: document entry includes approved offers linked to other service categories');
SELECT gen_random_uuid() AS archive_key \gset
SELECT public.service_archive('00000000-0000-4000-e000-000000000201',:'archive_sid',:archive_version,'Serviço encerrado',:'archive_key');
SELECT public.service_archive('00000000-0000-4000-e000-000000000201',:'archive_sid',:archive_version,'Serviço encerrado',:'archive_key');
SELECT test.assert_true(public.services_page('00000000-0000-4000-e000-000000000201','OFERTA-TESTE',1,5)->>'total'='0' AND public.request_options('00000000-0000-4000-e000-000000000201','services','OFERTA-TESTE',1,5)->>'total'='0','services: removed service absent from catalog and request picker');
SELECT test.expect_error(format('SELECT public.service_quote(%L,%L,1,%L)','00000000-0000-4000-e000-000000000201',:'archive_sid','{"kind":"none","value":0,"reason":""}'),'PT404','services: excluded service cannot be quoted directly');
SELECT test.expect_error(format('SELECT public.service_publish(%L,%L,%L,%s,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'archive_sid',:'archive_definition',:archive_version,'Republicar'),'PT404','services: excluded service cannot be republished');
SELECT test.expect_error(format('SELECT public.service_archive(%L,%L,%s,%L,%L)','00000000-0000-4000-e000-000000000201',:'archive_sid',:archive_version,'Outro motivo',:'archive_key'),'PT409','services: replay with different payload rejected');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.service_archive_commands WHERE service_id=:'archive_sid') AND NOT EXISTS(SELECT FROM private.document_offerings o WHERE service_id=:'archive_sid' AND (private.document_offer_projection(o,clock_timestamp()) IS NOT NULL OR private.document_staff_offer_projection(o,clock_timestamp()) IS NOT NULL)),'services: removal recorded once and hides portal and staff offers');
SELECT test.assert_true((SELECT count(*)>0 FROM public.service_versions WHERE service_id=:'archive_sid') AND NOT has_table_privilege('authenticated','private.service_archive_commands','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.service_archive(uuid,uuid,integer,text,uuid)','EXECUTE'),'services: history preserved and raw command access closed');

-- Folder actions use the explicit capability for employees as well as owners.
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000000204','templates.manage'),('00000000-0000-4000-b000-000000000204','templates.read') ON CONFLICT DO NOTHING;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000204","session_id":"00000000-0000-4000-c000-000000000204"}';
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201','{"kind":"create","name":"Pasta vazia de regressão"}',gen_random_uuid()) AS repair_folders \gset
SELECT value->>'id' AS repair_folder FROM jsonb_array_elements(:'repair_folders'::jsonb->'folders') WHERE value->>'name'='Pasta vazia de regressão' \gset
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','rename','folder_id',:'repair_folder','name','Pasta renomeada','expected_revision',1),gen_random_uuid()) AS repair_renamed_folder \gset
SELECT test.assert_true(:'repair_renamed_folder'::jsonb->'folders' @> jsonb_build_array(jsonb_build_object('id',:'repair_folder','name','Pasta renomeada','revision',2)),'folders: employee with permission renames empty folder');
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'repair_tid','folder_id',:'repair_folder','expected_revision',0),gen_random_uuid());
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'repair_tid','folder_id',NULL,'expected_revision',1),gen_random_uuid());
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','delete','folder_id',:'repair_folder','expected_revision',2),gen_random_uuid()) AS repair_deleted_folder \gset
SELECT test.assert_true(NOT(:'repair_deleted_folder'::jsonb->'folders' @> jsonb_build_array(jsonb_build_object('id',:'repair_folder'))),'folders: movement and empty folder deletion succeed with delegated permission');
RESET ROLE;
ROLLBACK;
