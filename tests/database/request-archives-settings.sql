-- Fictitious, disposable database only. Never run against hosted customer data.
SELECT test.assert_true(EXISTS(SELECT FROM public.role_permissions WHERE role_code='owner' AND permission_code='requests.archives.manage') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code='requests.archives.manage'),'arquivos solicitações: seed somente owner');
INSERT INTO auth.users(id,email_confirmed_at) SELECT ('00000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,clock_timestamp() FROM generate_series(7101,7105)i;
INSERT INTO auth.sessions(id,user_id) SELECT ('00000000-0000-4000-c000-'||lpad(i::text,12,'0'))::uuid,('00000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(7101,7105)i;
INSERT INTO public.profiles(id,display_name) SELECT ('00000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,'Pessoa fictícia arquivo '||i FROM generate_series(7101,7105)i;
INSERT INTO public.offices(id,name) VALUES('00000000-0000-4000-e000-000000007101','Arquivo fictício A'),('00000000-0000-4000-e000-000000007102','Arquivo fictício B');
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT ('00000000-0000-4000-b000-'||lpad(i::text,12,'0'))::uuid,('00000000-0000-4000-e000-'||CASE WHEN i=7105 THEN '000000007102' ELSE '000000007101' END)::uuid,('00000000-0000-4000-a000-'||lpad(i::text,12,'0'))::uuid,CASE i WHEN 7101 THEN 'owner' WHEN 7102 THEN 'admin' WHEN 7103 THEN 'employee' WHEN 7104 THEN 'client' ELSE 'owner' END FROM generate_series(7101,7105)i;
INSERT INTO public.requests(id,office_id,protocol,title,origin,status,created_by,assignee_id,priority,idempotency_key,payload_digest,updated_at,category)
SELECT ('00000000-0000-4000-d000-'||lpad(i::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000007101','JN-ARQ-'||i,'Solicitação fictícia '||i,
 CASE WHEN i IN(7106,7107) THEN 'presencial' ELSE 'portal' END,
 CASE WHEN i IN(7105,7107,7108) THEN 'aberto' ELSE 'concluido' END,
 ('00000000-0000-4000-a000-'||CASE WHEN i IN(7106,7107) THEN '000000007105' ELSE '000000007104' END)::uuid,
 ('00000000-0000-4000-b000-'||CASE i WHEN 7105 THEN '000000007103' WHEN 7106 THEN '000000007102' ELSE '000000007101' END)::uuid,
 'normal',gen_random_uuid(),repeat('a',64),clock_timestamp()-make_interval(days=>CASE i WHEN 7101 THEN 91 WHEN 7102 THEN 61 WHEN 7103 THEN 31 ELSE 1 END),
 CASE WHEN i IN(7108,7109) THEN 'account_correction' ELSE 'general' END FROM generate_series(7101,7109)i;
INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id,ended_at) VALUES('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007107','00000000-0000-4000-b000-000000007103','00000000-0000-4000-a000-000000007101',clock_timestamp());
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES('00000000-0000-4000-b000-000000007103','requests.read'),('00000000-0000-4000-b000-000000007103','requests.archives.manage');
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.request_archives_policy_get('00000000-0000-4000-e000-000000007101')$q$,'42501','arquivos solicitações: anônimo sem RPC');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000007101","session_id":"00000000-0000-4000-c000-000000007101"}';
SELECT test.assert_true(public.request_archives_policy_get('00000000-0000-4000-e000-000000007101')->>'days'='90','arquivos solicitações: prazo90 persistido');
SELECT test.assert_true(public.request_archives_page('00000000-0000-4000-e000-000000007101','all','archived','',NULL,NULL,1,5)->>'total'='1','arquivos solicitações: prazo usa apenas fechados antigos');
SELECT test.expect_error($q$SELECT public.request_archives_archive('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007105',1,'Não fechado',gen_random_uuid())$q$,'PT409','arquivos solicitações: aberto não arquiva');
SELECT test.expect_error($q$SELECT public.request_archives_archive('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007104',2,'Versão obsoleta',gen_random_uuid())$q$,'PT409','arquivos solicitações: exige versão atual');
SELECT public.request_archives_archive('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007104',1,'Arquivo fictício','00000000-0000-4000-f000-000000007101');
SELECT test.assert_true(public.request_archives_archive('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007104',1,'Arquivo fictício','00000000-0000-4000-f000-000000007101')->>'archived'='true','arquivos solicitações: repetição exata idempotente');
SELECT test.expect_error($q$SELECT public.request_archives_archive('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007104',1,'Outro motivo fictício','00000000-0000-4000-f000-000000007101')$q$,'PT409','arquivos solicitações: mesma chave compara motivo');
SELECT test.expect_error($q$SELECT public.request_archive_command('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007104','restore','Não restaura',gen_random_uuid())$q$,'42501','arquivos solicitações: legado inseguro de restore revogado');
SELECT public.request_archives_policy_set('00000000-0000-4000-e000-000000007101',60,1,'00000000-0000-4000-f000-000000007102');
SELECT public.request_archives_policy_set('00000000-0000-4000-e000-000000007101',90,2,'00000000-0000-4000-f000-000000007103');
SELECT test.assert_true(public.request_archives_page('00000000-0000-4000-e000-000000007101','all','archived','',NULL,NULL,1,5)->>'total'='3','arquivos solicitações: aumentar prazo não ressuscita antigos ou manuais');
SELECT test.assert_true(public.request_archives_policy_set('00000000-0000-4000-e000-000000007101',90,2,'00000000-0000-4000-f000-000000007103')->>'version'='3','arquivos solicitações: retry da política não cria versão extra');
SELECT test.expect_error($q$SELECT public.request_archives_policy_set('00000000-0000-4000-e000-000000007101',30,2,'00000000-0000-4000-f000-000000007103')$q$,'PT409','arquivos solicitações: política com chave diferente conflita');
SELECT test.expect_error($q$SELECT public.request_archives_policy_set('00000000-0000-4000-e000-000000007101',45,3,gen_random_uuid())$q$,'PT422','arquivos solicitações: prazo só30/60/90');
SELECT test.expect_error($q$SELECT public.request_archives_report_begin('00000000-0000-4000-e000-000000007101','all','archived','',NULL,'2026-11-02T12:00:00Z',gen_random_uuid())$q$,'PT422','arquivos solicitações: datas diretas exigem UTC meia-noite');
SELECT public.request_archives_report_begin('00000000-0000-4000-e000-000000007101','all','archived','',NULL,NULL,'00000000-0000-4000-f000-000000007104')->>'id' AS request_archive_report_id \gset
SELECT test.assert_true(public.request_archives_report_get('00000000-0000-4000-e000-000000007101',:'request_archive_report_id')->>'count'='3' AND NOT (public.request_archives_report_get('00000000-0000-4000-e000-000000007101',:'request_archive_report_id')->'items'->0 ?| ARRAY['message','reason','customer_id','customer_name','assignee_id','created_by','items']),'arquivos solicitações: snapshot contém só metadados autorizados');
SELECT public.request_archives_policy_set('00000000-0000-4000-e000-000000007101',30,3,gen_random_uuid());
SELECT test.assert_true(public.request_archives_report_get('00000000-0000-4000-e000-000000007101',:'request_archive_report_id')->>'count'='3','arquivos solicitações: nova política não altera snapshot');
SELECT test.expect_error(format('SELECT public.request_archives_report_get(%L,%L)','00000000-0000-4000-e000-000000007102',:'request_archive_report_id'),'PT403','arquivos solicitações: relatório não cruza escritório');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000007104","session_id":"00000000-0000-4000-c000-000000007104"}';
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000007101','','mine','',1,5)->>'total'='7' AND NOT (public.requests_page('00000000-0000-4000-e000-000000007101','','mine','',1,5)->'items'->0 ?| ARRAY['archived','archived_at','reason']),'arquivos solicitações: cliente acompanha os sete pedidos próprios após arquivo sem flags internas');
SELECT test.expect_error($q$SELECT public.request_archives_policy_get('00000000-0000-4000-e000-000000007101')$q$,'PT403','arquivos solicitações: cliente sem gestão');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000007103","session_id":"00000000-0000-4000-c000-000000007103"}';
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000007101','','mine','',1,5)->>'total'='2','arquivos solicitações: ex-responsável conserva acompanhamento e não vê correções sem capacidade');
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000007101','7108','queue','',1,5)->>'total'='0','arquivos solicitações: correção cadastral não vaza título/protocolo');
SELECT test.expect_error($q$SELECT public.request_archives_policy_get('00000000-0000-4000-e000-000000007101')$q$,'PT403','arquivos solicitações: funcionário não gerencia mesmo com grant');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000007102","session_id":"00000000-0000-4000-c000-000000007102"}';
SELECT test.expect_error($q$SELECT public.request_archives_policy_get('00000000-0000-4000-e000-000000007101')$q$,'PT403','arquivos solicitações: admin não ganha gestão automaticamente');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT '00000000-0000-4000-b000-000000007102',p FROM unnest(ARRAY['requests.read','requests.archives.manage'])p;
SET ROLE authenticated;
SELECT test.assert_true(public.request_archives_page('00000000-0000-4000-e000-000000007101','mine','recent','',NULL,NULL,1,5)->>'total'='1','arquivos solicitações: admin autorizado consulta seu escopo');
SELECT test.expect_error($q$SELECT public.request_archives_page('00000000-0000-4000-e000-000000007101','all','recent','',NULL,NULL,1,5)$q$,'PT403','arquivos solicitações: todos requer read_all');
SELECT test.expect_error($q$SELECT public.request_archives_archive('00000000-0000-4000-e000-000000007101','00000000-0000-4000-d000-000000007109',1,'Correção sem capacidade',gen_random_uuid())$q$,'PT404','arquivos solicitações: arquivo não contorna escopo de correção');
SELECT public.request_archives_report_begin('00000000-0000-4000-e000-000000007101','mine','recent','',NULL,NULL,gen_random_uuid())->>'id' AS request_archive_admin_report_id \gset
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000007102' AND permission_code='requests.archives.manage';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.request_archives_report_get(%L,%L)','00000000-0000-4000-e000-000000007101',:'request_archive_admin_report_id'),'PT403','arquivos solicitações: revogação bloqueia snapshot existente');
RESET ROLE;
SELECT test.expect_error($q$DELETE FROM private.request_archives WHERE office_id='00000000-0000-4000-e000-000000007101'$q$,'PT403','arquivos solicitações: arquivo manual imutável inclusive proprietário da tabela');
SELECT test.expect_error($q$UPDATE private.request_archive_reports SET snapshot='{}' WHERE office_id='00000000-0000-4000-e000-000000007101'$q$,'PT403','arquivos solicitações: snapshot imutável');
SELECT test.assert_true((SELECT count(*) FROM public.requests WHERE office_id='00000000-0000-4000-e000-000000007101')=9 AND NOT EXISTS(SELECT FROM private.archived_records WHERE office_id='00000000-0000-4000-e000-000000007101'),'arquivos solicitações: pedidos preservados e arquivo genérico intacto');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.request_archive_reports','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.request_archives_report_get(uuid,uuid)','EXECUTE') AND (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.request_archive_policies'::regclass,'private.request_archive_reports'::regclass,'private.request_archives'::regclass)),'arquivos solicitações: RLS/ACL privadas e wrappers fechados ao anônimo');
DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000007101';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000007101","session_id":"00000000-0000-4000-c000-000000007101"}';
SELECT test.expect_error(format('SELECT public.request_archives_report_get(%L,%L)','00000000-0000-4000-e000-000000007101',:'request_archive_report_id'),'PT401','arquivos solicitações: sessão revogada bloqueia relatório');
RESET ROLE;
