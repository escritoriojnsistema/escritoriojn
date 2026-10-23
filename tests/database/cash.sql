-- Fixtures14 belong exclusively to the disposable local database harness.
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'cash.%')=4 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'cash.%'),'caixa14: capacidades seed somente owner');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.cash_units'::regclass,'private.financial_accounts'::regclass,'private.payment_methods'::regclass,'private.cash_sessions'::regclass,'private.cash_movements'::regclass,'private.cash_commands'::regclass)) AND NOT has_table_privilege('authenticated','private.cash_sessions','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.cash_movements','SELECT,INSERT,UPDATE,DELETE'),'caixa14: RLS ACL fechadas');
SELECT test.assert_true((SELECT count(*)=4 AND bool_and(NOT prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('cash_dashboard','cash_configuration','cash_configure','cash_open')),'caixa14: wrappers invoker');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'cash-'||n||'@example.test',now(),'fixture' FROM generate_series(141,145)n;
INSERT INTO auth.sessions(id,user_id)SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE email LIKE 'cash-%';
INSERT INTO public.profiles(id,display_name)SELECT id,'Operador '||right(id::text,3) FROM auth.users WHERE email LIKE 'cash-%';
INSERT INTO public.offices(id,name)VALUES('00000000-0000-4000-e000-000000000141','Financeiro14 A'),('00000000-0000-4000-e000-000000000142','Financeiro14 B');
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=143 THEN '00000000-0000-4000-e000-000000000142' ELSE '00000000-0000-4000-e000-000000000141' END::uuid,('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n IN(141,143)THEN 'owner' WHEN n=145 THEN 'client' ELSE 'employee' END FROM generate_series(141,145)n;
INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p FROM generate_series(142,145)n CROSS JOIN unnest(ARRAY['cash.read','cash.open'])p;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000141","session_id":"00000000-0000-4000-c000-000000000141"}';
SELECT test.assert_true(public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5) @> '{"sessions":[],"total":0,"can_open":true}','caixa14: vazio conectado independente de requests');
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141','{"kind":"unit","id":null,"expected_version":null,"name":"Unidade14","active":true}','00000000-0000-4000-f000-000000000141') AS unit14_result \gset
SELECT :'unit14_result'::jsonb->'resource'->>'id' AS unit14 \gset
SELECT test.assert_true(public.cash_configure('00000000-0000-4000-e000-000000000141','{"kind":"unit","id":null,"expected_version":null,"name":"Unidade14","active":true}','00000000-0000-4000-f000-000000000141')=:'unit14_result'::jsonb,'caixa14: configuracao idempotente persistida');
SELECT test.expect_error($q$SELECT public.cash_configure('00000000-0000-4000-e000-000000000141','{"kind":"unit","id":null,"expected_version":null,"name":"Outro nome","active":true}','00000000-0000-4000-f000-000000000141')$q$,'PT409','caixa14: chave configuracao com outro payload conflita');
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Especie14','active',true,'type','cash','unit_id',:'unit14'),gen_random_uuid())->'resource'->>'id' AS account14 \gset
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Digital14','active',true,'type','digital','unit_id',:'unit14'),gen_random_uuid())->'resource'->>'id' AS digital14 \gset
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Dinheiro invalido','active',true,'type','cash','unit_id',:'unit14','destination_account_id',:'digital14')),'PT409','caixa14: dinheiro nao destina digital');
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Pix invalido','active',true,'type','pix','unit_id',:'unit14','destination_account_id',:'account14')),'PT409','caixa14: pix nao destina especie');
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Pix14','active',true,'type','pix','unit_id',:'unit14','destination_account_id',:'digital14'),gen_random_uuid())->'resource'->>'id' AS method14 \gset
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,10000,gen_random_uuid())','00000000-0000-4000-e000-000000000141',:'unit14',:'digital14'),'PT409','caixa14: conta digital nao abre especie');
SELECT public.cash_open('00000000-0000-4000-e000-000000000141',:'unit14',:'account14',10000,'00000000-0000-4000-f000-000000000142') AS opened14 \gset
SELECT :'opened14'::jsonb->'sessions'->0->>'id' AS session14 \gset
SELECT test.assert_true(:'opened14'::jsonb->'sessions'->0 @> '{"opening_cents":10000,"numerario_cents":10000,"received_cents":0,"is_self":true,"status":"open"}','caixa14: fundo100 numerario100 recebido0');
SELECT test.assert_true(public.cash_open('00000000-0000-4000-e000-000000000141',:'unit14',:'account14',10000,'00000000-0000-4000-f000-000000000142')=:'opened14'::jsonb,'caixa14: retry abertura retorna resultado oficial');
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,0,%L)','00000000-0000-4000-e000-000000000141',:'unit14',:'account14','00000000-0000-4000-f000-000000000142'),'PT409','caixa14: retry outro fundo conflita');
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,10000,gen_random_uuid())','00000000-0000-4000-e000-000000000141',:'unit14',:'account14'),'PT409','caixa14: outra chave nao duplica sessao aberta');
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','account','id',:'account14','expected_version',1,'name','Mudanca indevida','active',true,'type','bank','unit_id',:'unit14')),'PT409','caixa14: conta usada nao muda tipo');
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','unit','id',:'unit14','expected_version',1,'name','Unidade14','active',false)),'PT409','caixa14: nao desativar unidade com sessao aberta');
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','account','id',:'account14','expected_version',1,'name','Nome novo','active',true,'type','cash','unit_id',:'unit14'),gen_random_uuid());
SELECT test.assert_true(public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)->'sessions'->0->>'account_name'='Especie14','caixa14: snapshot historico preserva nome');
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','account','id',:'account14','expected_version',1,'name','Nome obsoleto','active',true,'type','cash','unit_id',:'unit14')),'PT409','caixa14: versao obsoleta conflita');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000142","session_id":"00000000-0000-4000-c000-000000000142"}';
SELECT test.assert_true(public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)->>'total'='0' AND NOT(public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)::text LIKE '%Especie14%'),'caixa14: proprio sem conta nem valores de colega');
SELECT test.expect_error($q$SELECT public.cash_dashboard('00000000-0000-4000-e000-000000000141','all',1,5)$q$,'PT403','caixa14: consolidacao requer capacidade');
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,10000,%L)','00000000-0000-4000-e000-000000000141',:'unit14',:'account14','00000000-0000-4000-f000-000000000142'),'PT409','caixa14: chave de colega nao reutilizavel');
SELECT public.cash_open('00000000-0000-4000-e000-000000000141',:'unit14',:'account14',0,gen_random_uuid());
SELECT test.assert_true(public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)->'sessions'->0 @> '{"opening_cents":0,"numerario_cents":0,"received_cents":0}','caixa14: zero permitido e sem receita');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000141","session_id":"00000000-0000-4000-c000-000000000141"}';
SELECT test.assert_true(public.cash_dashboard('00000000-0000-4000-e000-000000000141','all',1,3)->>'total'='2','caixa14: consolidacao autorizada');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000143","session_id":"00000000-0000-4000-c000-000000000143"}';
SELECT test.expect_error($q$SELECT public.cash_dashboard('00000000-0000-4000-e000-000000000141','all',1,5)$q$,'PT403','caixa14: outro escritorio nao acessa');
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,10000,gen_random_uuid())','00000000-0000-4000-e000-000000000142',:'unit14',:'account14'),'PT404','caixa14: FKs de outro escritorio nao abrem');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000145","session_id":"00000000-0000-4000-c000-000000000145"}';
SELECT test.expect_error($q$SELECT public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)$q$,'PT403','caixa14: cliente negado com capacidades forjadas');
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)$q$,'PT401','caixa14: sessao real obrigatoria');
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.cash_dashboard('00000000-0000-4000-e000-000000000141','own',1,5)$q$,'42501','caixa14: anon sem execute');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.cash_movements WHERE office_id='00000000-0000-4000-e000-000000000141')=2 AND (SELECT sum(amount_cents)=10000 AND sum(applied_cents)=0 FROM private.cash_movements WHERE office_id='00000000-0000-4000-e000-000000000141'),'caixa14: abertura conta uma vez zero aplicado');
SELECT test.expect_error(format('UPDATE private.cash_sessions SET opening_cents=0 WHERE id=%L',:'session14'),'PT403','caixa14: fundo imutavel');
SELECT test.expect_error(format('DELETE FROM private.cash_movements WHERE session_id=%L',:'session14'),'PT403','caixa14: movimento imutavel');
SELECT test.expect_error(format('INSERT INTO private.cash_movements(office_id,unit_id,session_id,cash_account_id,kind,amount_cents,actor_id)VALUES(%L,%L,%L,%L,%L,1,%L)','00000000-0000-4000-e000-000000000141',:'unit14',:'session14',:'account14','opening','00000000-0000-4000-a000-000000000141'),'PT403','caixa14: movimento direto sem fluxo negado');
SELECT test.expect_error(format('UPDATE private.cash_units SET name=%L WHERE id=%L','Invasao',:'unit14'),'PT403','caixa14: configuracao direta negada');
SELECT test.assert_true(EXISTS(SELECT FROM pg_index WHERE indexrelid='private.cash_sessions_one_open_idx'::regclass AND indisunique AND indpred IS NOT NULL),'caixa14: indice unico parcial oficial');
CREATE FUNCTION test.cash_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'INJECTED_ATOMIC_FAILURE' USING ERRCODE='PT409';END $$;
CREATE TRIGGER test_cash_atomic_failure BEFORE INSERT ON private.cash_movements FOR EACH ROW WHEN(NEW.amount_cents=9876) EXECUTE FUNCTION test.cash_failure();
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000144","session_id":"00000000-0000-4000-c000-000000000144"}';
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,9876,%L)','00000000-0000-4000-e000-000000000141',:'unit14',:'account14','00000000-0000-4000-f000-000000000144'),'PT409','caixa14: falha apos sessao aborta movimento e comando');
RESET ROLE;
DROP TRIGGER test_cash_atomic_failure ON private.cash_movements;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_sessions WHERE operator_id='00000000-0000-4000-a000-000000000144') AND NOT EXISTS(SELECT FROM private.cash_commands WHERE idempotency_key='00000000-0000-4000-f000-000000000144'),'caixa14: rollback completo apos falha tardia');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000141","session_id":"00000000-0000-4000-c000-000000000141"}';
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141','{"kind":"unit","id":null,"expected_version":null,"name":"Inativa14","active":false}',gen_random_uuid())->'resource'->>'id' AS inactive14 \gset
SELECT public.cash_configure('00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Conta inativa','active',false,'type','cash','unit_id',:'inactive14'),gen_random_uuid())->'resource'->>'id' AS inactive_account14 \gset
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,0,gen_random_uuid())','00000000-0000-4000-e000-000000000141',:'inactive14',:'inactive_account14'),'PT409','caixa14: unidade e conta inativas nao abrem');
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,%L,0,gen_random_uuid())','00000000-0000-4000-e000-000000000141',:'inactive14',:'account14'),'PT404','caixa14: conta de outra unidade nao abre');
DO $$BEGIN FOR n IN 1..51 LOOP PERFORM public.cash_configure('00000000-0000-4000-e000-000000000141',jsonb_build_object('kind','unit','id',NULL,'expected_version',NULL,'name','Paginacao14 '||n,'active',true),gen_random_uuid());END LOOP;END $$;
SELECT test.assert_true(public.cash_configuration('00000000-0000-4000-e000-000000000141',NULL,1,50)->>'units_total'='53' AND jsonb_array_length(public.cash_configuration('00000000-0000-4000-e000-000000000141',NULL,1,50)->'units')=50 AND jsonb_array_length(public.cash_configuration('00000000-0000-4000-e000-000000000141',NULL,2,50)->'units')=3,'caixa14: configuracao acima50 recuperavel sem truncar silenciosamente');
RESET ROLE;
