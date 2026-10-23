-- Fixtures are fictitious and restricted to the disposable database runner.
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE permission_code IN ('audit.export','archives.manage') AND role_code='owner')=2
 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE permission_code IN ('audit.export','archives.manage') AND role_code<>'owner'),'novas capacidades somente owner por padrao');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES
 ('00000000-0000-4000-a000-000000000031','audit-owner@example.test',now(),'fixture'),
 ('00000000-0000-4000-a000-000000000032','audit-worker@example.test',now(),'fixture'),
 ('00000000-0000-4000-a000-000000000033','audit-b@example.test',now(),'fixture'),
 ('00000000-0000-4000-a000-000000000034','audit-reader@example.test',now(),'fixture'),
 ('00000000-0000-4000-a000-000000000035','audit-client@example.test',now(),'fixture');
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text LIKE '00000000-0000-4000-a000-00000000003%';
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000031','Auditoria Ficticia A'),('00000000-0000-4000-e000-000000000032','Auditoria Ficticia B');
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa Auditoria Ficticia' FROM auth.users WHERE id::text LIKE '00000000-0000-4000-a000-00000000003%';
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES
 ('00000000-0000-4000-b000-000000000031','00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000031','owner'),
 ('00000000-0000-4000-b000-000000000032','00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000032','employee'),
 ('00000000-0000-4000-b000-000000000033','00000000-0000-4000-e000-000000000032','00000000-0000-4000-a000-000000000033','owner'),
 ('00000000-0000-4000-b000-000000000034','00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000034','employee'),
 ('00000000-0000-4000-b000-000000000035','00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000035','client');
INSERT INTO private.team_member_permissions VALUES ('00000000-0000-4000-b000-000000000034','audit.read');
INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type,target_id,changes)
 SELECT '00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000031','user','team.member_updated','membership','00000000-0000-4000-b000-000000000032','{"active":false,"cpf":"sensitive-fixture","role_code":"employee","password":"secret-fixture"}'::jsonb FROM generate_series(1,7);
INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type) VALUES
 ('00000000-0000-4000-e000-000000000032','00000000-0000-4000-a000-000000000033','user','private.other_office','membership');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000031","session_id":"00000000-0000-4000-c000-000000000031"}';
SELECT test.assert_true((public.audit_page('00000000-0000-4000-e000-000000000031',1,3,'',NULL,NULL,NULL)->>'total')::int=7
 AND jsonb_array_length(public.audit_page('00000000-0000-4000-e000-000000000031',2,3,'',NULL,NULL,NULL)->'items')=3,'auditoria paginada 3 com total e segunda pagina');
SELECT test.assert_true((public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'missing',NULL,NULL,NULL)->>'total')::int=0
 AND (public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'team.member_updated','00000000-0000-4000-a000-000000000031',now()-interval '1 day',now()+interval '1 day')->>'total')::int=7,'filtros acao ator e intervalo');
SELECT test.assert_true(public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'',NULL,NULL,NULL)::text NOT LIKE '%sensitive-fixture%'
 AND public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'',NULL,NULL,NULL)::text NOT LIKE '%secret-fixture%','DTO seguro nao exporta conteudo sensivel desconhecido');
SELECT test.expect_error($q$SELECT public.audit_page('00000000-0000-4000-e000-000000000032',1,5,'',NULL,NULL,NULL)$q$,'PT403','auditor A nao consulta B');
SELECT test.expect_error($q$SELECT public.audit_page('00000000-0000-4000-e000-000000000031',1,500,'',NULL,NULL,NULL)$q$,'PT422','limite invalido recusado na RPC');
SELECT test.expect_error($q$SELECT private.emit_business_event('00000000-0000-4000-e000-000000000031','fake.event','membership',NULL,gen_random_uuid(),'{}')$q$,'42501','cliente nao emite evento com ator inventado');
SELECT test.expect_error($q$INSERT INTO public.audit_events(office_id,actor_kind,actor_id,action,target_type) VALUES ('00000000-0000-4000-e000-000000000031','user',auth.uid(),'fake.event','membership')$q$,'42501','usuario nao insere eventos diretamente');
SELECT test.expect_error($q$UPDATE public.audit_events SET action='fake.event'$q$,'42501','usuario nao altera evento');
SELECT test.expect_error($q$DELETE FROM public.audit_events$q$,'42501','usuario nao apaga evento');
SELECT public.audit_report_begin('00000000-0000-4000-e000-000000000031','team.member_updated',NULL,NULL,NULL,'recent',gen_random_uuid())->>'id' AS report06_id \gset
SELECT test.assert_true((public.audit_report_reference('00000000-0000-4000-e000-000000000031',:'report06_id')->>'count')::int=7,'snapshot completo usa mesmos filtros');
SELECT public.audit_report_seal('00000000-0000-4000-e000-000000000031',:'report06_id',repeat('a',64),123);
SELECT test.assert_true((public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'audit.exported',NULL,NULL,NULL)->>'total')::int=1,'exportacao registrada no historico');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000034","session_id":"00000000-0000-4000-c000-000000000034"}';
SELECT test.assert_true((public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'',NULL,NULL,NULL)->>'total')::int=9,'auditor explicito pode consultar');
SELECT test.expect_error($q$SELECT public.audit_report_begin('00000000-0000-4000-e000-000000000031','',NULL,NULL,NULL,'recent',gen_random_uuid())$q$,'PT403','audit.read nao permite exportar');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000032","session_id":"00000000-0000-4000-c000-000000000032","user_metadata":{"role":"owner"}}';
SELECT test.expect_error($q$SELECT public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'',NULL,NULL,NULL)$q$,'PT403','funcionario sem capacidade negado apesar metadata');
SELECT test.expect_error($q$SELECT public.archives_page('00000000-0000-4000-e000-000000000031',1,3,'archived')$q$,'PT403','funcionario sem archives.manage negado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000035","session_id":"00000000-0000-4000-c000-000000000035"}';
SELECT test.expect_error($q$SELECT public.audit_page('00000000-0000-4000-e000-000000000031',1,5,'',NULL,NULL,NULL)$q$,'PT403','cliente nao acessa auditoria');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000031","session_id":"00000000-0000-4000-c000-000000000031"}';
SELECT test.expect_error($q$SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000031',gen_random_uuid())$q$,'PT409','ultimo owner nao pode ser arquivado');
SELECT test.expect_error($q$SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000033',gen_random_uuid())$q$,'PT403','arquivo nao cruza escritorio');
RESET ROLE;
ALTER TABLE public.audit_events ADD CONSTRAINT audit06_fault CHECK (action NOT IN ('archives.archived','audit.exported','audit.report_started')) NOT VALID;
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000032',gen_random_uuid())$q$,'23514','falha critica em auditoria reverte arquivo');
SELECT test.expect_error($q$SELECT public.audit_report_begin('00000000-0000-4000-e000-000000000031','',NULL,NULL,NULL,'recent',gen_random_uuid())$q$,'23514','falha critica impede exportacao sem evidencia');
RESET ROLE;
SELECT test.assert_true((SELECT active FROM public.memberships WHERE id='00000000-0000-4000-b000-000000000032') AND NOT EXISTS(SELECT FROM private.archived_records),'rollback manteve vinculo e nenhum arquivo');
ALTER TABLE public.audit_events DROP CONSTRAINT audit06_fault;
SET ROLE authenticated;
SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000032',gen_random_uuid())->>'id' AS archive06_id \gset
SELECT test.assert_true((public.archives_page('00000000-0000-4000-e000-000000000031',1,3,'archived')->>'total')::int=1,'arquivo consta na consulta paginada');
SELECT test.expect_error($q$SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000032',gen_random_uuid())$q$,'PT409','arquivo repetido nao duplica referencia');
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000032','employee',true,ARRAY['foundation.access'],gen_random_uuid())$q$,'PT409','arquivo impede reativacao por fora da restauracao');
SELECT public.restore_archive('00000000-0000-4000-e000-000000000031',:'archive06_id',gen_random_uuid());
SELECT test.assert_true((public.archives_page('00000000-0000-4000-e000-000000000031',1,3,'restored')->>'total')::int=1,'referencia restaurada conservada');
SELECT test.expect_error(format('SELECT public.restore_archive(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000031',:'archive06_id'),'PT409','restauracao repetida nao muda historico');
RESET ROLE;
SELECT test.assert_true(NOT (SELECT active FROM public.memberships WHERE id='00000000-0000-4000-b000-000000000032')
 AND EXISTS(SELECT FROM public.profiles WHERE id='00000000-0000-4000-a000-000000000032')
 AND (SELECT count(*) FROM public.audit_events WHERE office_id='00000000-0000-4000-e000-000000000031' AND action IN ('archives.archived','archives.restored'))=2,'restaurar nao reativa conta nem apaga perfil/auditoria');
SELECT test.assert_true((SELECT actor_id FROM public.audit_events WHERE action='archives.archived' AND target_id='00000000-0000-4000-b000-000000000032')='00000000-0000-4000-a000-000000000031','ator do evento derivado da identidade vigente');
SELECT test.expect_error($q$DELETE FROM auth.users WHERE id='00000000-0000-4000-a000-000000000031'$q$,'23503','exclusao fisica da identidade nao apaga negocio/historico');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.archived_records','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.audit_page(uuid,integer,integer,text,uuid,timestamp with time zone,timestamp with time zone)','EXECUTE'),'arquivo privado e RPCs negadas a anon');
-- Bounds and critical rollback also apply to restoration/export, beyond the happy path.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000031","session_id":"00000000-0000-4000-c000-000000000031"}';
SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000032',gen_random_uuid())->>'id' AS archive06_again \gset
RESET ROLE;
ALTER TABLE public.audit_events ADD CONSTRAINT restore06_fault CHECK(action<>'archives.restored') NOT VALID;
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.restore_archive(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000031',:'archive06_again'),'23514','falha de auditoria de restauro reverte referencia');
RESET ROLE;
SELECT test.assert_true((SELECT restored_at IS NULL FROM private.archived_records WHERE id=:'archive06_again'),'arquivo continua arquivado quando auditoria falha');
ALTER TABLE public.audit_events DROP CONSTRAINT restore06_fault;
INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type)
 SELECT '00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000031','user','test.limit','membership' FROM generate_series(1,1001);
SET ROLE authenticated;
SELECT test.assert_true((public.audit_report_begin('00000000-0000-4000-e000-000000000031','test.limit',NULL,NULL,NULL,'recent',gen_random_uuid())->>'count')::int=1001,'snapshot supera antigo limite1000 sem truncamento');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.audit_events WHERE office_id='00000000-0000-4000-e000-000000000031' AND action='audit.exported')=1,'limite excedido nao registra exportacao falsa');
SET ROLE migrator;
SELECT test.expect_error($q$SELECT private.emit_business_event('00000000-0000-4000-e000-000000000031','test.unsafe','membership',NULL,gen_random_uuid(),'{"cpf":"sensitive"}')$q$,'PT422','contrato recusa texto sensivel em novas emissoes');
SELECT test.assert_true(private.safe_audit_changes('{"permissions":["password-fixture"],"role_code":"sensitive-fixture","active":{"cpf":"sensitive-fixture"}}')='{}','whitelist valida tipos e valores, nao apenas nome de chave');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000033","session_id":"00000000-0000-4000-c000-000000000033"}';
SELECT test.expect_error($q$SELECT public.archives_page('00000000-0000-4000-e000-000000000031',1,3,'archived')$q$,'PT403','owner B nao lista arquivos de A');
SELECT test.expect_error(format('SELECT public.restore_archive(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000032',:'archive06_again'),'PT403','restauro nao cruza referencia de outro escritorio');
RESET ROLE;
-- Regression: an invitation issued before archive must never revive that account after restore.
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) VALUES ('00000000-0000-4000-a000-000000000036','archive-invite@example.test',now(),'fixture');
INSERT INTO auth.sessions(id,user_id) VALUES ('00000000-0000-4000-c000-000000000036','00000000-0000-4000-a000-000000000036');
INSERT INTO public.profiles(id,display_name) VALUES ('00000000-0000-4000-a000-000000000036','Destinatario Arquivo');
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES ('00000000-0000-4000-b000-000000000036','00000000-0000-4000-e000-000000000031','00000000-0000-4000-a000-000000000036','employee');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000031","session_id":"00000000-0000-4000-c000-000000000031"}';
SELECT public.team_create_invitation('00000000-0000-4000-e000-000000000031','archive-invite@example.test','Destinatario Ficticio','52998224725','employee',ARRAY['foundation.access'],now()+interval '1 day',gen_random_uuid())->>'id' AS stale06_invite \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000036","session_id":"00000000-0000-4000-c000-000000000036"}';
SELECT public.team_verify_invitation(:'stale06_invite','Destinatario Ficticio','52998224725','employee',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000031","session_id":"00000000-0000-4000-c000-000000000031"}';
SELECT public.archive_membership('00000000-0000-4000-e000-000000000031','00000000-0000-4000-b000-000000000036',gen_random_uuid())->>'id' AS stale06_archive \gset
SELECT public.restore_archive('00000000-0000-4000-e000-000000000031',:'stale06_archive',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000036","session_id":"00000000-0000-4000-c000-000000000036"}';
SELECT test.expect_error(format('SELECT public.team_accept_invitation(%L,gen_random_uuid())',:'stale06_invite'),'PT410','convite anterior ao arquivo nao reativa conta depois do restauro');
RESET ROLE;
SELECT test.assert_true(NOT (SELECT active FROM public.memberships WHERE id='00000000-0000-4000-b000-000000000036'),'restauro preserva acesso inativo mesmo com convite antigo');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000031","session_id":"00000000-0000-4000-c000-000000000031"}';
SELECT test.assert_true(public.archives_page('00000000-0000-4000-e000-000000000031',1,5,'restored')::text LIKE '%Destinatario Arquivo%','DTO resolve nome autorizado sem copiar cadastro para a tabela de arquivos');
RESET ROLE;
