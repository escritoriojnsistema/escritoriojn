-- Only disposable local PostgreSQL fixtures; never run against the hosted project.
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'finance-'||n||'@example.test',now(),'fixture' FROM generate_series(151,156)n;
INSERT INTO auth.sessions(id,user_id)SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE email LIKE 'finance-%';
INSERT INTO public.profiles(id,display_name)SELECT id,'Operador financeiro ficticio' FROM auth.users WHERE email LIKE 'finance-%';
INSERT INTO public.offices(id,name)VALUES('00000000-0000-4000-e000-000000000151','Financeiro teste integrado'),('00000000-0000-4000-e000-000000000156','Outro escritorio financeiro');
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=156 THEN '00000000-0000-4000-e000-000000000156' ELSE '00000000-0000-4000-e000-000000000151' END::uuid,('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n IN(151,156) THEN 'owner' WHEN n IN(154,155) THEN 'client' WHEN n=153 THEN 'admin' ELSE 'employee' END FROM generate_series(151,156)n;
\set office15 '00000000-0000-4000-e000-000000000151'
SELECT definition||'{"code":"FINANCE15","name":"Servico financeiro","price_cents":10000,"effective_from":null}'::jsonb AS definition15 FROM public.service_versions v JOIN public.services s ON s.id=v.service_id WHERE s.code='XEROX-TESTE' AND v.number=2 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT public.request_create(:'office15','{"origin":"portal","title":"Servico para cliente A","message":"Pedido financeiro proprio"}',gen_random_uuid(),gen_random_uuid())->>'id' AS request15 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.service_create(:'office15',:'definition15','Servico financeiro ficticio',gen_random_uuid())->>'id' AS service15 \gset
SELECT jsonb_build_array(jsonb_build_object('service_id',:'service15','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb)) AS items15 \gset
SELECT public.request_mutate(:'office15',:'request15',1,jsonb_build_object('kind','triage','customer_id',NULL,'items',:'items15'::jsonb,'reason','Triagem financeira ficticia'),gen_random_uuid());
SELECT public.charges_create(:'office15',:'request15','[{"due_date":"2026-12-01","amount_cents":10000}]',gen_random_uuid())->'charge'->>'id' AS charge15 \gset
SELECT test.assert_true(public.cash_configuration(:'office15',NULL,1,50)->>'units_total'='0','financeiro: ausencia real de unidade nao vira bloqueio de owner');
SELECT public.cash_configure(:'office15','{"kind":"unit","id":null,"expected_version":null,"name":"Unidade financeira teste","active":true}',gen_random_uuid())->'resource'->>'id' AS unit15 \gset
SELECT public.cash_configure(:'office15',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Especie financeira','active',true,'unit_id',:'unit15','type','cash'),gen_random_uuid())->'resource'->>'id' AS account15 \gset
SELECT public.cash_configure(:'office15',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Destino bancario privado','active',true,'unit_id',:'unit15','type','bank'),gen_random_uuid())->'resource'->>'id' AS bank15 \gset
SELECT public.cash_configure(:'office15',jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Dinheiro','active',true,'unit_id',:'unit15','type','cash','destination_account_id',:'account15'),gen_random_uuid())->'resource'->>'id' AS cashmethod15 \gset
SELECT public.cash_configure(:'office15',jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','PIX','active',true,'unit_id',:'unit15','type','pix','destination_account_id',:'bank15'),gen_random_uuid())->'resource'->>'id' AS pix15 \gset
SELECT public.cash_open(:'office15',:'unit15',:'account15',10000,gen_random_uuid())->'sessions'->0->>'id' AS session15 \gset
SELECT jsonb_build_object('kind','receive','session_id',:'session15','expected_version',1,'idempotency_key',gen_random_uuid(),'charge_id',:'charge15','expected_charge_version',1,'payment_method_id',:'cashmethod15','amount_cents',3000) AS receive15 \gset
SELECT public.cash_operate(:'office15',:'receive15') AS received15 \gset
SELECT :'received15'::jsonb->'entries'->0->>'id' AS cashentry15 \gset
SELECT test.assert_true(:'received15'::jsonb->'session' @> '{"opening_cents":10000,"cash_cents":13000,"received_cents":3000,"digital_cents":0,"version":2}','financeiro: fundo separado do recebimento real');
SELECT test.assert_true(public.cash_operate(:'office15',:'receive15')=:'received15'::jsonb,'financeiro: retry identico nao duplica dinheiro');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office15',(:'receive15'::jsonb||'{"amount_cents":3001}')::text),'PT409','financeiro: chave com outro valor conflita');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office15',(:'receive15'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_version',2,'amount_cents',8000))::text),'PT409','financeiro: recebimento excessivo negado');
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','receive','session_id',:'session15','expected_version',2,'idempotency_key',gen_random_uuid(),'charge_id',:'charge15','expected_charge_version',1,'payment_method_id',:'pix15','amount_cents',2000)) AS digital15 \gset
SELECT :'digital15'::jsonb->'entries'->0->>'id' AS digitalentry15 \gset
SELECT test.assert_true(:'digital15'::jsonb->'session' @> '{"cash_cents":13000,"received_cents":5000,"digital_cents":2000,"version":3}' AND public.charges_view(:'office15',:'request15',1)->'charge' @> '{"due_cents":10000,"allocated_cents":5000,"balance_cents":5000}','financeiro: PIX nao entra em especie e saldo13 usa fonte unica');
SELECT public.cash_configure(:'office15',jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Outro destino bancario','active',true,'unit_id',:'unit15','type','bank'),gen_random_uuid())->'resource'->>'id' AS bank_b15 \gset
SELECT public.cash_configure(:'office15',jsonb_build_object('kind','payment_method','id',:'pix15','expected_version',1,'name','PIX','active',true,'unit_id',:'unit15','type','pix','destination_account_id',:'bank_b15'),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())',:'office15',jsonb_build_object('kind','account','id',:'bank15','expected_version',1,'name','Conversao indevida','active',true,'unit_id',:'unit15','type','cash')::text),'PT409','financeiro: conta historica nao muda natureza depois de remapear forma');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())',:'office15',:'charge15','{"kind":"cancel","reason":"Cancelar com pagamento"}'),'PT409','financeiro: cancelar obrigacao paga exige devolver primeiro');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT public.cash_client_finance(:'office15',1,1) AS client15 \gset
SELECT test.assert_true(:'client15'::jsonb->'summary' @> '{"paid_cents":5000,"balance_cents":5000}' AND :'client15'::jsonb->>'history_total'='2' AND :'client15'::jsonb::text !~ 'Destino bancario privado|reason|actor_id|account_name|cash_cents','financeiro: cliente ve pagamentos proprios sem notas ou contas internas');
SELECT public.notifications_page(:'office15','','all','payment_received',1,5) AS notices15 \gset
SELECT :'notices15'::jsonb->'items'->0->>'id' AS notice15 \gset
SELECT public.notifications_summary(:'office15')->>'unread' AS before_read15 \gset
SELECT test.assert_true(:'notices15'::jsonb->>'total'='2' AND (:'before_read15')::integer>=3,'financeiro: lista e resumo dos avisos de recebimento');
SELECT test.assert_true(public.notifications_read(:'office15',:'notice15')->>'ok'='true' AND public.notifications_read(:'office15',:'notice15')->>'ok'='true' AND (public.notifications_summary(:'office15')->>'unread')::integer=(:'before_read15')::integer-1,'financeiro: leitura financeira autorizada idempotente');
SELECT test.expect_error(format('SELECT public.cash_statement(%L,%L,1)',:'office15',:'session15'),'PT403','financeiro: cliente nunca acessa caixa interno');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000155","session_id":"00000000-0000-4000-c000-000000000155"}';
SELECT test.assert_true(public.cash_client_finance(:'office15',1,1)->>'total'='0' AND public.cash_client_finance(:'office15',1,1)->>'history_total'='0' AND public.notifications_summary(:'office15')->>'unread'='0' AND public.notifications_page(:'office15','','all','payment_received',1,5)->>'total'='0','financeiro: outro cliente nao recebe saldo historico nem avisos');
SELECT test.expect_error(format('SELECT public.notifications_read(%L,%L)',:'office15',:'notice15'),'PT404','financeiro: terceiro nao marca aviso alheio');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','refund','session_id',:'session15','expected_version',3,'idempotency_key',gen_random_uuid(),'entry_id',:'cashentry15','amount_cents',500,'reason','Devolucao parcial privada')) AS refunded15 \gset
SELECT test.assert_true(:'refunded15'::jsonb->'session' @> '{"cash_cents":12500,"refunded_cents":500,"version":4}','financeiro: reembolso parcial preserva recebimento');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office15',jsonb_build_object('kind','reverse','session_id',:'session15','expected_version',4,'idempotency_key',gen_random_uuid(),'entry_id',:'cashentry15','amount_cents',500,'reason','Estorno parcial invalido')::text),'PT409','financeiro: estorno exige restante integral');
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','reverse','session_id',:'session15','expected_version',4,'idempotency_key',gen_random_uuid(),'entry_id',:'cashentry15','amount_cents',2500,'reason','Estorno do saldo recebido'));
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','reverse','session_id',:'session15','expected_version',5,'idempotency_key',gen_random_uuid(),'entry_id',:'digitalentry15','amount_cents',2000,'reason','Estorno digital confirmado'));
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','reconcile','session_id',:'session15','expected_version',6,'idempotency_key',gen_random_uuid(),'counted_cents',9900,'reason','Diferenca registrada sem ajuste')) AS reconciled15 \gset
SELECT test.assert_true(:'reconciled15'::jsonb->'session' @> '{"cash_cents":10000,"digital_cents":0,"refunded_cents":5000}' AND :'reconciled15'::jsonb->'entries'->0 @> '{"kind":"reconciled","counted_cents":9900,"expected_cents":10000,"cash_cents":0,"applied_cents":0}','financeiro: conciliacao conserva saldo e registra divergencia');
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','close','session_id',:'session15','expected_version',7,'idempotency_key',gen_random_uuid(),'counted_cents',10000,'reason','Fecho conferido pelo operador')) AS closed15 \gset
SELECT test.assert_true(:'closed15'::jsonb->'session' @> '{"status":"closed","version":8,"can_operate":false}' AND :'closed15'::jsonb->'session'->>'closed_at' IS NOT NULL,'financeiro: fecho oficial versionado');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office15',jsonb_build_object('kind','reconcile','session_id',:'session15','expected_version',8,'idempotency_key',gen_random_uuid(),'counted_cents',10000,'reason','Operacao apos fecho')::text),'PT409','financeiro: caixa fechado nao recebe movimentos');
SELECT public.team_set_member(:'office15','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','cash.open'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.assert_true(public.cash_dashboard(:'office15','own',1,5)->>'can_open'='true','financeiro: concessao explicita permite leitura e abertura');
SELECT test.expect_error(format('SELECT public.cash_statement(%L,%L,1)',:'office15',:'session15'),'PT404','financeiro: permissao propria nao abre extrato alheio');
SELECT test.expect_error(format('SELECT public.cash_client_finance(%L,1,1)',:'office15'),'PT403','financeiro: equipe nao finge portal de cliente');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office15','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT test.expect_error(format('SELECT public.cash_dashboard(%L,%L,1,5)',:'office15','own'),'PT403','financeiro: revogacao corta leitura no servidor imediatamente');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT test.assert_true(public.notifications_page(:'office15','','all','payment_refunded',1,5)->>'total'='1' AND public.notifications_page(:'office15','','all','payment_reversed',1,5)->>'total'='2' AND public.cash_client_finance(:'office15',1,1)->'summary' @> '{"paid_cents":0,"balance_cents":10000}','financeiro: portal conserva reembolsos e estornos sem alterar divida original');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000156","session_id":"00000000-0000-4000-c000-000000000156"}';
SELECT test.expect_error(format('SELECT public.cash_statement(%L,%L,1)',:'office15',:'session15'),'PT403','financeiro: nem owner de outro escritorio atravessa isolamento');
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.cash_entries','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.cash_entries','SELECT,INSERT,UPDATE,DELETE') AND(SELECT relrowsecurity FROM pg_class WHERE oid='private.cash_entries'::regclass),'financeiro: ledger privado RLS e ACL fechadas');
SELECT test.expect_error(format('DELETE FROM private.cash_entries WHERE id=%L',:'cashentry15'),'PT403','financeiro: lancamentos imutaveis mesmo apos estorno');
SELECT test.assert_true((SELECT count(*) FROM private.cash_entries WHERE office_id=:'office15')=7 AND NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'cash.%' AND changes::text ~ 'privada|bancario'),'financeiro: trilha financeira completa sem motivo privado em auditoria');

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.charges_mutate(:'office15',:'charge15',1,'{"kind":"adjust","delta_cents":-1000,"reason":"Ajuste de divida propria","installments":[{"due_date":"2026-12-01","amount_cents":9000}]}',gen_random_uuid());
SELECT public.charges_mutate(:'office15',:'charge15',2,'{"kind":"cancel","reason":"Cancelamento de divida propria"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT test.assert_true(public.notifications_page(:'office15','','all','charge_created',1,5)->>'total'='1' AND public.notifications_page(:'office15','','all','charge_adjusted',1,5)->>'total'='1' AND public.notifications_page(:'office15','','all','charge_cancelled',1,5)->>'total'='1' AND public.cash_client_finance(:'office15',1,1)->'items'->0->>'status'='cancelled','financeiro: criacao ajuste cancelamento de divida geram avisos proprios');
SELECT (public.notifications_page(:'office15','','all','charge_cancelled',1,5)->'items'->0->>'id') AS cancelled_notice15 \gset
SELECT test.assert_true(public.notifications_read(:'office15',:'cancelled_notice15')->>'ok'='true','financeiro: aviso de divida tambem permite leitura');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.customer_create(:'office15','{"kind":"person","name":"Cliente financeiro interno","contacts":[]}',gen_random_uuid())->>'id' AS customer15 \gset
SELECT public.customer_relation_command(:'office15',:'customer15','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000155","evidence":"Conferencia financeira presencial"}',gen_random_uuid())->'identities'->0->>'id' AS identity15 \gset
SELECT jsonb_build_object('origin','presencial','title','Servico interno vinculado','customer_id',:'customer15','assignee_id','00000000-0000-4000-b000-000000000151','priority','normal','priority_reason','','items',:'items15'::jsonb,'internal_note','Nota nao deve chegar ao cliente') AS internal15 \gset
SELECT public.request_create(:'office15',:'internal15',gen_random_uuid(),gen_random_uuid())->>'id' AS internal_request15 \gset
SELECT public.charges_create(:'office15',:'internal_request15','[{"due_date":"2026-12-01","amount_cents":10000}]',gen_random_uuid())->'charge'->>'id' AS internal_charge15 \gset
SELECT public.cash_open(:'office15',:'unit15',:'account15',0,gen_random_uuid())->'sessions'->0->>'id' AS next_session15 \gset
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','receive','session_id',:'next_session15','expected_version',1,'idempotency_key',gen_random_uuid(),'charge_id',:'internal_charge15','expected_charge_version',1,'payment_method_id',:'pix15','amount_cents',1000));
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000155","session_id":"00000000-0000-4000-c000-000000000155"}';
SELECT test.assert_true(public.cash_client_finance(:'office15',1,1)->>'total'='1' AND public.cash_client_finance(:'office15',1,1)->>'history_total'='1' AND public.cash_client_finance(:'office15',1,1)->'summary' @> '{"paid_cents":1000,"balance_cents":9000}' AND public.notifications_page(:'office15','','all','payment_received',1,5)->>'total'='1','financeiro: identidade08 vigente liga atendimento interno ao cliente correto');
SELECT public.notifications_page(:'office15','','all','payment_received',1,5)->'items'->0->>'id' AS identity_notice15 \gset
SELECT test.assert_true(public.notifications_read(:'office15',:'identity_notice15')->>'ok'='true','financeiro: aviso interno vinculado permite leitura financeira sem liberar pedido interno');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.customer_relation_command(:'office15',:'customer15','identity.revoke',jsonb_build_object('id',:'identity15','version',1),gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000155","session_id":"00000000-0000-4000-c000-000000000155"}';
SELECT test.assert_true(public.cash_client_finance(:'office15',1,1)->>'total'='0' AND public.cash_client_finance(:'office15',1,1)->>'history_total'='0' AND public.notifications_page(:'office15','','all','payment_received',1,5)->>'total'='0','financeiro: revogar identidade corta cobrancas historico e avisos vinculados');
SELECT test.expect_error(format('SELECT public.notifications_read(%L,%L)',:'office15',:'identity_notice15'),'PT404','financeiro: aviso revogado nao permite nova leitura');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office15','00000000-0000-4000-b000-000000000152','employee',true,ARRAY['foundation.access','cash.read','cash.open','requests.read','charges.read'],gen_random_uuid());
SELECT public.team_set_member(:'office15','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.open','cash.read_all','requests.read','charges.read'],gen_random_uuid());
SELECT public.request_create(:'office15',(:'internal15'::jsonb||'{"customer_id":null,"assignee_id":"00000000-0000-4000-b000-000000000152"}'),gen_random_uuid(),gen_random_uuid())->>'id' AS employee_request15 \gset
RESET ROLE;
-- Charge fixture uses official creation under the assigned employee with an explicit creation grant.
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000152','charges.create');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000152","session_id":"00000000-0000-4000-c000-000000000152"}';
SELECT public.charges_create(:'office15',:'employee_request15','[{"due_date":"2026-12-01","amount_cents":10000}]',gen_random_uuid())->'charge'->>'id' AS employee_charge15 \gset
SELECT public.cash_open(:'office15',:'unit15',:'account15',0,gen_random_uuid())->'sessions'->0->>'id' AS employee_session15 \gset
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','receive','session_id',:'employee_session15','expected_version',1,'idempotency_key',gen_random_uuid(),'charge_id',:'employee_charge15','expected_charge_version',1,'payment_method_id',:'cashmethod15','amount_cents',1000))->'entries'->0->>'id' AS employee_entry15 \gset
SELECT test.assert_true(public.cash_statement(:'office15',:'employee_session15',1)->'session'->>'received_cents'='1000','financeiro: funcionario autorizado recebe no proprio caixa');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office15',jsonb_build_object('kind','reverse','session_id',:'employee_session15','expected_version',2,'idempotency_key',gen_random_uuid(),'entry_id',:'employee_entry15','amount_cents',1000,'reason','Estorno sem autorizacao')::text),'PT403','financeiro: estorno requer charges.adjust atual');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.assert_true(public.cash_statement(:'office15',:'employee_session15',1)->'session' @> '{"is_self":false,"can_operate":false}','financeiro: read_all consulta extrato de colega sem operar');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office15',jsonb_build_object('kind','close','session_id',:'employee_session15','expected_version',2,'idempotency_key',gen_random_uuid(),'counted_cents',1000,'reason','Fechar caixa de colega')::text),'PT404','financeiro: read_all nao permite fechar caixa alheio');
RESET ROLE;
-- Cumulative movement totals are distinct from the maximum amount of one operation.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.charges_mutate(:'office15',:'internal_charge15',1,'{"kind":"adjust","delta_cents":999999990000,"reason":"Obrigacao limite para laboratorio","installments":[{"due_date":"2026-12-01","amount_cents":1000000000000}]}',gen_random_uuid());
-- Existing receipt1000 is returned before testing a full maximum receipt.
SELECT public.cash_statement(:'office15',:'next_session15',1)->'entries'->0->>'id' AS existing_limit15 \gset
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','reverse','session_id',:'next_session15','expected_version',2,'idempotency_key',gen_random_uuid(),'entry_id',:'existing_limit15','amount_cents',1000,'reason','Reverter recebimento antes do limite'));
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','receive','session_id',:'next_session15','expected_version',3,'idempotency_key',gen_random_uuid(),'charge_id',:'internal_charge15','expected_charge_version',2,'payment_method_id',:'pix15','amount_cents',1000000000000))->'entries'->0->>'id' AS max_entry15 \gset
SELECT public.cash_operate(:'office15',jsonb_build_object('kind','refund','session_id',:'next_session15','expected_version',4,'idempotency_key',gen_random_uuid(),'entry_id',:'max_entry15','amount_cents',1000000000000,'reason','Devolucao integral de laboratorio'));
SELECT jsonb_build_object('kind','receive','session_id',:'next_session15','expected_version',5,'idempotency_key',gen_random_uuid(),'charge_id',:'internal_charge15','expected_charge_version',2,'payment_method_id',:'pix15','amount_cents',1) AS plus_one15 \gset
SELECT public.cash_operate(:'office15',:'plus_one15') AS large_total15 \gset
SELECT test.assert_true(:'large_total15'::jsonb->'session' @> '{"received_cents":1000000001001,"refunded_cents":1000000001000,"digital_cents":1}' AND public.cash_operate(:'office15',:'plus_one15')=:'large_total15'::jsonb,'financeiro: limitePIX devolucao e mais1centavo retornam acumulados seguros e replay');
SELECT test.assert_true(public.cash_dashboard_filtered(:'office15','all',1,5,:'unit15','open','')->'summary'->>'open'='2' AND public.cash_dashboard_filtered(:'office15','all',1,5,:'unit15','closed','')->'summary'->>'closed'='1','financeiro: filtros e indicadores consultam todos os caixas por unidade e situacao');
SET ROLE anon;
SELECT test.expect_error(format('SELECT public.cash_client_finance(%L,1,1)',:'office15'),'42501','financeiro: anon nao executa financeiro do cliente');
RESET ROLE;
