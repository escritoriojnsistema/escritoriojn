-- Fictitious catalogue09 fixtures, disposable database only.
SELECT test.assert_true(to_regclass('public.services') IS NOT NULL AND to_regclass('public.service_versions') IS NOT NULL,'servicos: tabelas versionadas existem');
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'services.%')=8
 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'services.%'),'servicos: capacidades somente owner por padrao');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'catalog-'||n||'@example.test',now(),'fixture' FROM generate_series(91,96) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000091' AND '00000000-0000-4000-a000-000000000096';
INSERT INTO public.profiles(id,display_name) SELECT id,'Catalogo Ficticio' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000091' AND '00000000-0000-4000-a000-000000000096';
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000091','Catalogo Ficticio A'),('00000000-0000-4000-e000-000000000092','Catalogo Ficticio B');
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT
 ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=93 THEN '00000000-0000-4000-e000-000000000092' ELSE '00000000-0000-4000-e000-000000000091' END::uuid,
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n IN(91,93) THEN 'owner' WHEN n=95 THEN 'client' ELSE 'employee' END FROM generate_series(91,96) n;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT
 ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p FROM generate_series(92,96) n
 CROSS JOIN unnest(ARRAY['services.read','services.perform']) p WHERE n IN(92,95) OR (n=94 AND p='services.read');
SELECT jsonb_build_object('code','XEROX-TESTE','name','Xerox de Teste','category','Copias','unit','pagina','price_cents',50,'effective_from',NULL,
 'person_required',false,'participants_min',0,'approval_required',false,'signature_required',false,'settlement_required',true,
 'required_capabilities',jsonb_build_array('services.perform'),'fields','[]'::jsonb,'checklist','[]'::jsonb,'quantity_min',1,'quantity_max',1000,
 'max_discount_bps',1000,'max_surcharge_bps',5000,'allow_courtesy',true,'allow_price_override',true) AS xerox09 \gset
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('public.services'::regclass,'public.service_versions'::regclass))
 AND NOT has_table_privilege('authenticated','public.services','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.service_versions','SELECT,INSERT,UPDATE,DELETE'),'servicos: RLS e ACL sem acesso bruto');
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.services_page('00000000-0000-4000-e000-000000000091','',1,3)$q$,'42501','servicos: anon negado');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.services_page('00000000-0000-4000-e000-000000000091','',1,3)$q$,'PT401','servicos: sessao real obrigatoria');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT test.expect_error($q$SELECT public.services_page('00000000-0000-4000-e000-000000000091','',1,3)$q$,'PT403','servicos: cliente nao ve catalogo interno');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.services_page('00000000-0000-4000-e000-000000000091','',1,3)->>'total'='0','servicos: instalacao vazia navegavel');
SELECT public.service_create('00000000-0000-4000-e000-000000000091',:'xerox09','Cadastro ficticio',gen_random_uuid())->>'id' AS xerox09_id \gset
SELECT test.assert_true(public.service_detail('00000000-0000-4000-e000-000000000091',:'xerox09_id',1)->'current'->>'price_cents'='50','servicos: Xerox de Teste R$0,50');
SELECT public.service_quote('00000000-0000-4000-e000-000000000091',:'xerox09_id',3,'{"kind":"none","value":0,"reason":""}') AS old09_quote \gset
SELECT test.assert_true(:'old09_quote'::jsonb->>'total_cents'='150' AND (:'old09_quote'::jsonb->'definition'->>'person_required')::boolean=false,'servicos: xerox sem pessoa/CPF e calculo inteiro');
SELECT public.service_publish('00000000-0000-4000-e000-000000000091',:'xerox09_id',(:'xerox09'::jsonb||'{"price_cents":75}'::jsonb),1,'Reajuste ficticio',gen_random_uuid());
SELECT test.assert_true(public.service_quote('00000000-0000-4000-e000-000000000091',:'xerox09_id',3,'{"kind":"none","value":0,"reason":""}')->>'total_cents'='225'
 AND :'old09_quote'::jsonb->>'total_cents'='150'
 AND public.service_detail('00000000-0000-4000-e000-000000000091',:'xerox09_id',1)->>'history_total'='2','servicos: novo preco afeta novo item e conserva snapshot/historico');
SELECT test.expect_error(format('SELECT public.service_publish(%L,%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'xerox09_id',:'xerox09','Concorrente'),'PT409','servicos: versao esperada impede sobreescrita');
SELECT test.expect_error(format('SELECT public.service_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'xerox09','Duplicado'),'PT409','servicos: codigo unico por escritorio');
SELECT public.service_create('00000000-0000-4000-e000-000000000091',(:'xerox09'::jsonb||'{"code":"CONTRATO-TESTE","name":"Contrato de Teste","price_cents":10000,"person_required":true,"participants_min":2,"approval_required":true,"signature_required":true,"fields":[{"key":"objeto","label":"Objeto","type":"text","required":true}],"checklist":["Conferir participantes"]}'::jsonb),'Cadastro ficticio',gen_random_uuid())->>'id' AS contract09_id \gset
SELECT test.assert_true(public.service_detail('00000000-0000-4000-e000-000000000091',:'contract09_id',1)->'current'->>'price_cents'='10000'
 AND public.service_detail('00000000-0000-4000-e000-000000000091',:'contract09_id',1)->'current'->>'participants_min'='2','servicos: Contrato de Teste R$100 exige pessoa/participantes/campos');
SELECT test.assert_true(public.service_quote('00000000-0000-4000-e000-000000000091',:'xerox09_id',1,'{"kind":"discount","value":1000,"reason":"Ajuste ficticio"}')->>'total_cents'='67','servicos: desconto percentual arredonda meio centavo para cima no desconto');
SELECT test.assert_true(public.service_quote('00000000-0000-4000-e000-000000000091',:'xerox09_id',2,'{"kind":"surcharge","value":1000,"reason":"Ajuste ficticio"}')->>'total_cents'='165','servicos: acrescimo limitado e inteiro');
SELECT test.assert_true(public.service_quote('00000000-0000-4000-e000-000000000091',:'xerox09_id',1,'{"kind":"courtesy","value":0,"reason":"Cortesia ficticia"}')->>'total_cents'='0','servicos: cortesia explicitamente autorizada');
SELECT test.expect_error(format('SELECT public.service_quote(%L,%L,1001,%L)','00000000-0000-4000-e000-000000000091',:'xerox09_id','{"kind":"none","value":0,"reason":""}'),'PT422','servicos: quantidade maxima respeitada');
SELECT test.expect_error(format('SELECT public.service_quote(%L,%L,1,%L)','00000000-0000-4000-e000-000000000091',:'xerox09_id','{"kind":"discount","value":1100,"reason":"Acima do limite"}'),'PT422','servicos: desconto acima da politica negado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.assert_true(public.services_page('00000000-0000-4000-e000-000000000091','',1,3)->>'total'='2','servicos: funcionario autorizado consulta');
SELECT test.expect_error(format('SELECT public.service_publish(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'xerox09_id',:'xerox09','Tentativa'),'PT403','servicos: funcionario sem manage nao muda preco/politica');
SELECT test.expect_error(format('SELECT public.service_quote(%L,%L,1,%L)','00000000-0000-4000-e000-000000000091',:'xerox09_id','{"kind":"courtesy","value":0,"reason":"Tentativa"}'),'PT403','servicos: funcionario sem capacidade nao aplica cortesia');
SELECT test.expect_error($q$SELECT public.services_page('00000000-0000-4000-e000-000000000092','',1,3)$q$,'PT403','servicos: outro escritorio negado');
RESET ROLE;
SELECT test.expect_error(format('UPDATE public.service_versions SET definition=definition||%L::jsonb WHERE service_id=%L','{"price_cents":1}',:'xerox09_id'),'PT409','servicos: versoes imutaveis inclusive para dono SQL');
SELECT test.expect_error(format('DELETE FROM public.service_versions WHERE service_id=%L',:'xerox09_id'),'PT409','servicos: historico nao pode ser apagado');
SELECT test.assert_true((SELECT count(*) FROM public.audit_events WHERE office_id='00000000-0000-4000-e000-000000000091' AND action LIKE 'services.%')=3,'servicos: apenas publicacoes confirmadas auditadas');
-- Validate the database contract even when the HTTP validator is bypassed.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.expect_error(format('SELECT public.service_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'xerox09'::jsonb||'{"code":"INVALID-TESTE","price_cents":0.5}')::text,'Invalido'),'PT422','servicos: fracao de centavo negada no SQL');
SELECT test.expect_error(format('SELECT public.service_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'xerox09'::jsonb||'{"code":"INVALID-TESTE","signature_required":true}')::text,'Invalido'),'PT422','servicos: assinatura exige pessoa no SQL');
SELECT test.expect_error(format('SELECT public.service_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'xerox09'::jsonb||'{"code":"INVALID-TESTE","fields":[{"key":"a","label":"A","type":"text","required":true},{"key":"a","label":"B","type":"text","required":false}]}')::text,'Invalido'),'PT422','servicos: chave duplicada negada no SQL');
SELECT test.expect_error(format('SELECT public.service_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'xerox09'::jsonb||'{"code":"INVALID-TESTE","effective_from":"2020-01-01T00:00:00.000Z"}')::text,'Invalido'),'PT422','servicos: vigencia retroativa negada');
SELECT public.service_create('00000000-0000-4000-e000-000000000091',(:'xerox09'::jsonb||jsonb_build_object('code','FUTURO-TESTE','effective_from',to_char((clock_timestamp()+interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),'Agendamento ficticio',gen_random_uuid())->>'id' AS future09_id \gset
SELECT test.assert_true(public.service_detail('00000000-0000-4000-e000-000000000091',:'future09_id',1)->'current'='null'::jsonb,'servicos: versao futura nao e vigente');
SELECT test.expect_error(format('SELECT public.service_quote(%L,%L,1,%L)','00000000-0000-4000-e000-000000000091',:'future09_id','{"kind":"none","value":0,"reason":""}'),'PT409','servicos: versao futura nao entra em item atual');
SELECT public.service_publish('00000000-0000-4000-e000-000000000091',:'contract09_id',(:'xerox09'::jsonb||'{"code":"CONTRATO-TESTE","name":"Contrato de Teste","price_cents":20000,"person_required":true,"participants_min":2,"approval_required":true,"signature_required":true}'||jsonb_build_object('effective_from',to_char((clock_timestamp()+interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),1,'Agendamento ficticio',gen_random_uuid());
SELECT test.assert_true(public.service_quote('00000000-0000-4000-e000-000000000091',:'contract09_id',1,'{"kind":"none","value":0,"reason":""}')->>'total_cents'='10000','servicos: nova versao futura nao antecipa preco');
RESET ROLE;
ALTER TABLE public.audit_events ADD CONSTRAINT test_services_audit_failure CHECK(action<>'services.version_published') NOT VALID;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.expect_error(format('SELECT public.service_publish(%L,%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'xerox09_id',:'xerox09','Rollback ficticio'),'23514','servicos: falha de auditoria reverte publicacao');
SELECT test.assert_true(public.service_detail('00000000-0000-4000-e000-000000000091',:'xerox09_id',1)->>'latest_version'='2','servicos: rollback conserva numero/preco/versoes');
RESET ROLE;
ALTER TABLE public.audit_events DROP CONSTRAINT test_services_audit_failure;
INSERT INTO private.team_member_permissions(membership_id,permission_code) VALUES
 ('00000000-0000-4000-b000-000000000092','services.manage'),
 ('00000000-0000-4000-b000-000000000096','services.read'),('00000000-0000-4000-b000-000000000096','services.manage');
