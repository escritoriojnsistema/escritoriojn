-- Etapa20 contract; run only in the runner's disposable PostgreSQL17.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.template_save(uuid,uuid,jsonb,integer,text,uuid)') IS NOT NULL,'20: save RPC exists');
SELECT test.assert_true((SELECT count(*)=3 FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'templates.%') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'templates.%'),'20: capabilities seed owner only');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_class WHERE oid IN('public.templates'::regclass,'public.template_versions'::regclass,'private.template_approvals'::regclass,'private.template_commands'::regclass) AND(NOT relrowsecurity OR has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('service_role',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE'))),'20: RLS and table ACL closed');
SELECT test.assert_true((SELECT count(*)=4 AND bool_and(NOT prosecdef) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('templates_page','template_detail','template_save','template_approve')) AND NOT has_function_privilege('authenticated','private.templates_validate20(jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.templates_page(uuid,text,integer,integer)','EXECUTE'),'20: public invoker wrappers and helpers ACL');
SELECT test.assert_true(EXISTS(SELECT FROM pg_index i WHERE i.indrelid='private.template_commands'::regclass AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indkey[0]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='office_id') AND i.indkey[1]=(SELECT attnum FROM pg_attribute WHERE attrelid=i.indrelid AND attname='template_id')),'20: commands template foreign key has covering index');
CREATE TABLE test.templates_pdf_before AS SELECT id,to_jsonb(r) snapshot FROM private.audit_reports r;
CREATE TABLE test.templates_audit_before AS SELECT id,to_jsonb(e) snapshot FROM public.audit_events e;
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'templates-'||n||'@example.test',now(),'fixture' FROM generate_series(201,206)n;
INSERT INTO auth.sessions(id,user_id)SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000201' AND '00000000-0000-4000-a000-000000000206';
INSERT INTO public.profiles(id,display_name)SELECT id,'Autor Modelo Teste' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000201' AND '00000000-0000-4000-a000-000000000206';
INSERT INTO public.offices(id,name)VALUES('00000000-0000-4000-e000-000000000201','Modelos Ficticio A'),('00000000-0000-4000-e000-000000000202','Modelos Ficticio B');
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=203 THEN '00000000-0000-4000-e000-000000000202' ELSE '00000000-0000-4000-e000-000000000201' END::uuid,('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n IN(201,203)THEN 'owner' WHEN n=205 THEN 'client' WHEN n=206 THEN 'admin' ELSE 'employee' END FROM generate_series(201,206)n;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p FROM generate_series(202,206)n CROSS JOIN unnest(ARRAY['templates.read','templates.manage','templates.approve'])p WHERE n IN(202,205,206);
CREATE FUNCTION test.template_definition20() RETURNS jsonb LANGUAGE sql AS $$SELECT '{"code":"DECLARACAO-TESTE","name":"Declaracao de Teste","kind":"declaration","content":"Declaramos {{cliente.nome}} em {{datas.emissao}}.","demonstration":true,"effective_from":null,"effective_until":null,"variables":[{"key":"cliente.nome","label":"Nome","type":"text","required":true},{"key":"datas.emissao","label":"Emissao","type":"date","required":true}],"signature_policy":"none","review_required":true}'::jsonb;$$;
GRANT EXECUTE ON FUNCTION test.template_definition20() TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.templates_page('00000000-0000-4000-e000-000000000201','',1,3)$q$,'PT401','20: missing real session denied');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000204","session_id":"00000000-0000-4000-c000-000000000204"}';
SELECT test.expect_error($q$SELECT public.templates_page('00000000-0000-4000-e000-000000000201','',1,3)$q$,'PT403','20: employee without capability denied');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error($q$SELECT public.templates_page('00000000-0000-4000-e000-000000000201','',1,3)$q$,'PT403','20: client denied even with capabilities');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.templates_page('00000000-0000-4000-e000-000000000201','',1,3) @> '{"items":[],"total":0,"page":1,"page_size":3}','20: library initially empty');
SELECT test.expect_error($q$SELECT public.templates_page('00000000-0000-4000-e000-000000000202','',1,3)$q$,'PT403','20: other office denied');
SELECT gen_random_uuid() AS savekey20 \gset
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20(),0,'Cadastro demonstracao',:'savekey20') AS first20 \gset
SELECT :'first20'::jsonb->>'id' AS tid20,:'first20'::jsonb->'versions'->0->>'id' AS vid20 \gset
SELECT test.assert_true(:'first20'::jsonb @> '{"latest_version":1,"can_manage":true,"can_approve":true,"history_total":1,"history_page":1,"versions":[{"approved_at":null,"created_by_name":"Autor Modelo Teste","demonstration":true}]}','20: typed demonstration draft created with author snapshot');
SELECT test.assert_true(public.templates_page('00000000-0000-4000-e000-000000000201','DECLARACAO',1,5)->'items'->0->'current_version'='null'::jsonb,'20: unapproved draft never current');
SELECT gen_random_uuid() AS approvekey20 \gset
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',:'tid20',:'vid20',1,'Homologacao demonstracao',:'approvekey20') AS approved20 \gset
SELECT test.assert_true(:'approved20'::jsonb->'versions'->0->>'approved_by_name'='Autor Modelo Teste' AND (:'approved20'::jsonb->'versions'->0->>'approved_at')::timestamptz >= (:'first20'::jsonb->'versions'->0->>'created_at')::timestamptz,'20: explicit approval exact version no retroactive time');
SELECT public.template_save('00000000-0000-4000-e000-000000000201',:'tid20',test.template_definition20()||'{"content":"Nova declaracao {{cliente.nome}} em {{datas.emissao}}."}',1,'Edicao apos aprovacao',gen_random_uuid()) AS second20 \gset
SELECT test.assert_true(:'second20'::jsonb @> '{"latest_version":2,"versions":[{"number":2,"approved_at":null},{"number":1,"content":"Declaramos {{cliente.nome}} em {{datas.emissao}}."}]}' AND public.templates_page('00000000-0000-4000-e000-000000000201','',1,3)->'items'->0->>'current_version'='1','20: immutable v1 remains current while v2 is draft');
SELECT test.assert_true(public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20(),0,'Cadastro demonstracao',:'savekey20')->>'latest_version'='2' AND public.template_approve('00000000-0000-4000-e000-000000000201',:'tid20',:'vid20',1,'Homologacao demonstracao',:'approvekey20')->>'latest_version'='2','20: idempotent retries return current authorized DTO');
SELECT test.expect_error(format('SELECT public.template_save(%L,NULL,test.template_definition20(),0,%L,%L)','00000000-0000-4000-e000-000000000201','Payload diferente',:'savekey20'),'PT409','20: same key different payload conflicts');
SELECT test.expect_error($q$SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20(),0,'Duplicado',gen_random_uuid())$q$,'PT409','20: duplicate code conflicts');
SELECT test.expect_error(format('SELECT public.template_approve(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'tid20',:'vid20','Versao incorreta'),'PT409','20: approval cannot approve a stale version');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.assert_true(NOT(public.template_detail('00000000-0000-4000-e000-000000000201',:'tid20',1)->>'can_approve')::boolean,'20: employee approve capability never implies role approval');
SELECT test.expect_error(format('SELECT public.template_approve(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'tid20',:'second20'::jsonb->'versions'->0->>'id','Tentativa funcionario'),'PT403','20: employee cannot approve');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',:'tid20',(:'second20'::jsonb->'versions'->0->>'id')::uuid,2,'Aprovacao administrativa',gen_random_uuid());
SELECT test.assert_true(public.templates_page('00000000-0000-4000-e000-000000000201','',1,3)->'items'->0->>'current_version'='2','20: admin explicit approval makes v2 current');
RESET ROLE;
UPDATE public.profiles SET display_name='Nome novo nao retroativo' WHERE id IN('00000000-0000-4000-a000-000000000201','00000000-0000-4000-a000-000000000206');
SELECT test.assert_true((SELECT bool_and(created_by_name='Autor Modelo Teste') FROM public.template_versions WHERE template_id=:'tid20') AND(SELECT bool_and(approved_by_name='Autor Modelo Teste') FROM private.template_approvals WHERE template_id=:'tid20'),'20: author and approver names immutable snapshots');
SELECT test.expect_error(format('UPDATE public.template_versions SET reason=%L WHERE template_id=%L','Reescrever',:'tid20'),'PT409','20: draft and approved versions append-only');
SELECT test.expect_error(format('DELETE FROM private.template_approvals WHERE template_id=%L',:'tid20'),'PT409','20: approval decisions append-only');
SELECT test.expect_error(format('DELETE FROM private.template_commands WHERE template_id=%L',:'tid20'),'PT409','20: idempotency evidence append-only');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.audit_reports r JOIN test.templates_pdf_before b USING(id) WHERE to_jsonb(r)<>b.snapshot) AND NOT EXISTS(SELECT FROM public.audit_events e JOIN test.templates_audit_before b USING(id) WHERE to_jsonb(e)<>b.snapshot),'20: historical PDFs1-6 and audit unchanged');
SELECT test.assert_true((SELECT count(*)=4 AND bool_and(changes='{}') FROM public.audit_events WHERE target_id=:'tid20' AND action LIKE 'templates.%'),'20: transactional audit refs only without text or PII');
CREATE FUNCTION test.templates_invalid20() RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE patch jsonb;BEGIN
 FOR patch IN SELECT x FROM jsonb_array_elements('[{"code":"lower"},{"name":""},{"content":""},{"content":"{{desconhecido}}"},{"content":"{{cliente.nome}"},{"content":"{{cliente.nome}} {{datas.emissao}} {{outro.campo}}"},{"variables":[]},{"variables":[{"key":"cliente.nome","label":"Nome","type":"date","required":true}]},{"effective_from":"2026-02-30T00:00:00.000Z"},{"effective_from":"2027-01-02T00:00:00.000Z","effective_until":"2027-01-01T00:00:00.000Z"},{"effective_from":"2027-01-01T00:00:00Z"},{"signature_policy":"script"},{"demonstration":"true"},{"extra":true}]'::jsonb)x LOOP
 PERFORM test.expect_error(format('SELECT public.template_save(%L,NULL,%L,0,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',(test.template_definition20()||patch)::text,'Invalido'),'PT422','invalid direct SQL input');END LOOP;
 RETURN 'PASS: 20: malformed definition, placeholders, types and UTC dates rejected directly by SQL';END $$;
GRANT EXECUTE ON FUNCTION test.templates_invalid20() TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.templates_invalid20();
SELECT test.expect_error(format('SELECT public.template_save(%L,NULL,%L,0,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',(test.template_definition20()||jsonb_build_object('content',repeat('🙂',30001)))::text,'Longo'),'PT422','20: content unicode point upper bound');
SELECT test.expect_error($q$SELECT public.templates_page('00000000-0000-4000-e000-000000000201','',1,50)$q$,'PT422','20: list sizes exactly3 or5');
SELECT test.expect_error($q$SELECT public.template_detail('00000000-0000-4000-e000-000000000201',gen_random_uuid(),1)$q$,'PT404','20: missing template404');
RESET ROLE;
CREATE TABLE test.templates_saved20(id uuid,definition jsonb);
GRANT SELECT ON test.templates_saved20 TO authenticated;
INSERT INTO test.templates_saved20 VALUES(:'tid20',test.template_definition20());
-- Approval requires read independently, including an authorized retry.
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000206' AND permission_code IN('templates.read','templates.manage');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.expect_error(format('SELECT public.template_approve(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'tid20',:'second20'::jsonb->'versions'->0->>'id','Sem leitura'),'PT403','20: approval always requires read');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000206','templates.read');
SET ROLE authenticated;
SELECT test.assert_true(public.template_detail('00000000-0000-4000-e000-000000000201',:'tid20',1) @> '{"can_manage":false,"can_approve":true}','20: admin approval independent from manage');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.template_save(%L,NULL,%L,0,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',(test.template_definition20()||jsonb_build_object('variables',test.template_definition20()->'variables'||jsonb_build_array(test.template_definition20()->'variables'->0)))::text,'Duplicada'),'PT422','20: duplicate variable definition denied');
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||jsonb_build_object('code','FUTURO-TESTE','effective_from',to_char(clock_timestamp()+interval '1 day','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'effective_until',to_char(clock_timestamp()+interval '2 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),0,'Vigencia futura demonstracao',gen_random_uuid()) AS future20 \gset
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',(:'future20'::jsonb->>'id')::uuid,(:'future20'::jsonb->'versions'->0->>'id')::uuid,1,'Aprovacao antecipada demonstracao',gen_random_uuid());
SELECT test.assert_true(public.templates_page('00000000-0000-4000-e000-000000000201','FUTURO-TESTE',1,3)->'items'->0->'current_version'='null'::jsonb,'20: future approved version waits for effective_from');
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||jsonb_build_object('code','EXPIRADO-TESTE','effective_until','2020-01-01T00:00:00.000Z'),0,'Modelo antigo demonstracao',gen_random_uuid()) AS expired20 \gset
SELECT test.expect_error(format('SELECT public.template_approve(%L,%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'expired20'::jsonb->>'id',:'expired20'::jsonb->'versions'->0->>'id','Impedir aprovacao retroativa'),'PT409','20: expired validity cannot be approved retroactively');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.expect_error(format('SELECT public.template_save(%L,NULL,%L,0,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',(test.template_definition20()||jsonb_build_object('content','Declaracao '||chr(1)||' {{cliente.nome}} em {{datas.emissao}}'))::text,'Controle invalido'),'PT422','20: SQL rejects content controls outside tab CR LF');
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||jsonb_build_object('code','LITERAL-TESTE','content',E'Literal {texto}\n\t{{cliente.nome}} em {{datas.emissao}}\r'),0,'Texto literal multilinha',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.template_save(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'tid20',(test.template_definition20()||'{"code":"CODIGO-MUDADO"}')::text,'Codigo estavel'),'PT409','20: code stable through every version');
RESET ROLE;
SELECT test.assert_true((SELECT pg_get_expr(adbin,adrelid) FROM pg_attrdef WHERE adrelid='private.audit_reports'::regclass AND adnum=(SELECT attnum FROM pg_attribute WHERE attrelid='private.audit_reports'::regclass AND attname='renderer_version'))='7','20: only new audit reports use renderer7');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.audit_report_begin('00000000-0000-4000-e000-000000000201','templates.saved',NULL,NULL,NULL,'recent',gen_random_uuid())->>'renderer_version'='7','20: unchanged audit_report_begin selects presentation7 through default');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.audit_reports r JOIN test.templates_pdf_before b USING(id) WHERE to_jsonb(r)<>b.snapshot),'20: preparing renderer7 leaves every historical PDF snapshot1-6 intact');
-- Same ECMAScript trim set as shared/templateText: direct SDK/RPC must not create unreadable DTOs.
CREATE FUNCTION test.templates_unicode20(p_template uuid,p_version uuid) RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE ws text;d jsonb;field text;BEGIN
 FOREACH ws IN ARRAY ARRAY[U&'\00A0',U&'\FEFF',U&'\1680',U&'\2000',U&'\2001',U&'\2002',U&'\2003',U&'\2004',U&'\2005',U&'\2006',U&'\2007',U&'\2008',U&'\2009',U&'\200A',U&'\2028',U&'\2029',U&'\202F',U&'\205F',U&'\3000',U&'\0020\00A0\FEFF'] LOOP
  FOREACH field IN ARRAY ARRAY['name','content','label'] LOOP
   d:=CASE WHEN field='label' THEN jsonb_set(test.template_definition20(),'{variables,0,label}',to_jsonb(ws)) WHEN field='content' THEN test.template_definition20()||jsonb_build_object('content',ws,'variables','[]'::jsonb) ELSE test.template_definition20()||jsonb_build_object(field,ws) END;
   PERFORM test.expect_error(format('SELECT public.template_save(%L,NULL,%L,0,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',d::text,'Invalido Unicode'),'PT422','20: Unicode-only definition denied');
  END LOOP;
  PERFORM test.expect_error(format('SELECT public.template_save(%L,NULL,test.template_definition20(),0,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',ws),'PT422','20: Unicode-only save reason denied');
  PERFORM test.expect_error(format('SELECT public.template_approve(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000201',p_template,p_version,ws),'PT422','20: Unicode-only approval reason denied');
 END LOOP;
 RETURN 'PASS: 20: all ECMAScript Unicode whitespace-only names labels content save and approval reasons denied by SQL';
END $$;
GRANT EXECUTE ON FUNCTION test.templates_unicode20(uuid,uuid) TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.templates_unicode20(:'tid20',(:'second20'::jsonb->'versions'->0->>'id')::uuid);
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||jsonb_build_object('code','UNICODE-TESTE','name',U&'\00A0Nome\FEFF','content',U&'\00A0Texto {{cliente.nome}} em {{datas.emissao}}.\FEFF'),0,U&'\00A0Motivo com texto\FEFF',gen_random_uuid()) AS unicode20 \gset
SELECT test.assert_true(:'unicode20'::jsonb->'versions'->0->>'name'=U&'\00A0Nome\FEFF' AND :'unicode20'::jsonb->'versions'->0->>'reason'=U&'\00A0Motivo com texto\FEFF','20: Unicode around nonblank literal text preserved without normalization');
RESET ROLE;
