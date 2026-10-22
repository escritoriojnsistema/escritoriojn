-- Etapa13 runs only inside the disposable local replay.
SELECT test.assert_true(to_regclass('private.charges') IS NOT NULL,'cobrancas13: obrigacoes existem sem recebimentos');
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'charges.%')=4 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'charges.%'),'cobrancas13: seed somente owner');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.charges'::regclass,'private.charge_items'::regclass,'private.charge_events'::regclass,'private.charge_installments'::regclass,'private.charge_commands'::regclass)) AND NOT has_table_privilege('authenticated','private.charges','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.charge_events','SELECT,INSERT,UPDATE,DELETE'),'cobrancas13: RLS e ACL sem acesso bruto');
SELECT test.assert_true((SELECT count(*)=3 AND bool_and(NOT prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'charges_%'),'cobrancas13: wrappers invoker');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'charges-'||n||'@example.test',now(),'fixture' FROM generate_series(131,135) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE email LIKE 'charges-%';
INSERT INTO public.profiles(id,display_name) SELECT id,'Financeiro Ficticio' FROM auth.users WHERE email LIKE 'charges-%';
INSERT INTO public.offices(id,name)VALUES('00000000-0000-4000-e000-000000000131','Financeiro Ficticio A'),('00000000-0000-4000-e000-000000000132','Financeiro Ficticio B');
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n=133 THEN '00000000-0000-4000-e000-000000000132' ELSE '00000000-0000-4000-e000-000000000131' END::uuid,('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n IN(131,133) THEN 'owner' WHEN n=135 THEN 'client' ELSE 'employee' END FROM generate_series(131,135)n;
INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p FROM generate_series(132,135)n CROSS JOIN unnest(ARRAY['requests.read','requests.create','requests.update','requests.transfer','charges.read','charges.create','charges.adjust','charges.cancel','services.read','services.perform'])p;
SELECT definition||'{"code":"CHARGE60","name":"Servico60","price_cents":6000,"effective_from":null}'::jsonb AS service13 FROM public.service_versions v JOIN public.services s ON s.id=v.service_id WHERE s.code='XEROX-TESTE' AND v.number=2 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000131","session_id":"00000000-0000-4000-c000-000000000131"}';
SELECT public.service_create('00000000-0000-4000-e000-000000000131',:'service13','Financeiro ficticio',gen_random_uuid())->>'id' AS service60 \gset
SELECT public.service_create('00000000-0000-4000-e000-000000000131',:'service13'::jsonb||'{"code":"CHARGE40","name":"Servico40","price_cents":4000}','Financeiro ficticio',gen_random_uuid())->>'id' AS service40 \gset
SELECT jsonb_build_object('origin','presencial','title','Obrigacao ficticia','customer_id',NULL,'assignee_id','00000000-0000-4000-b000-000000000131','priority','normal','priority_reason','','items',jsonb_build_array(jsonb_build_object('service_id',:'service60','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb),jsonb_build_object('service_id',:'service40','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb)),'internal_note','Nota nao financeira')AS request13 \gset
SELECT public.request_create('00000000-0000-4000-e000-000000000131',:'request13',gen_random_uuid(),gen_random_uuid())->>'id' AS request13_id \gset
SELECT test.assert_true(public.charges_view('00000000-0000-4000-e000-000000000131',:'request13_id',1) @> '{"charge":null,"can_create":true}','cobrancas13: vazio conectado ao atendimento');
SELECT public.charges_create('00000000-0000-4000-e000-000000000131',:'request13_id','[{"due_date":"2026-11-01","amount_cents":6000},{"due_date":"2026-12-01","amount_cents":4000}]','00000000-0000-4000-f000-000000000131')AS charge13 \gset
SELECT :'charge13'::jsonb->'charge'->>'id' AS charge13_id \gset
SELECT test.assert_true(:'charge13'::jsonb->'charge' @> '{"currency":"BRL","status":"aberta","original_cents":10000,"due_cents":10000,"allocated_cents":0,"balance_cents":10000,"version":1,"history_total":1}' AND jsonb_array_length(:'charge13'::jsonb->'items')=2 AND jsonb_array_length(:'charge13'::jsonb->'charge'->'installments')=2,'cobrancas13:60+40=100 em aberto zero recebido');
SELECT test.assert_true(public.charges_create('00000000-0000-4000-e000-000000000131',:'request13_id','[{"due_date":"2026-11-01","amount_cents":6000},{"due_date":"2026-12-01","amount_cents":4000}]','00000000-0000-4000-f000-000000000131')=:'charge13'::jsonb,'cobrancas13: retry identico conserva resposta');
SELECT test.expect_error(format('SELECT public.charges_create(%L,%L,%L,%L)','00000000-0000-4000-e000-000000000131',:'request13_id','[{"due_date":"2026-11-01","amount_cents":10000}]','00000000-0000-4000-f000-000000000131'),'PT409','cobrancas13: chave com outro payload conflita');
SELECT test.expect_error(format('SELECT public.charges_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'request13_id','[{"due_date":"2026-11-01","amount_cents":10000}]'),'PT409','cobrancas13: outra chave nao duplica obrigacao');
SELECT public.service_publish('00000000-0000-4000-e000-000000000131',:'service60',:'service13'::jsonb||'{"price_cents":7000}',1,'Reajuste ficticio posterior',gen_random_uuid());
SELECT test.assert_true(public.charges_view('00000000-0000-4000-e000-000000000131',:'request13_id',1)->'charge'->>'due_cents'='10000','cobrancas13: catalogo posterior nao altera divida');
SELECT test.assert_true(NOT (public.charges_view('00000000-0000-4000-e000-000000000131',:'request13_id',1)::text ~ 'Nota nao financeira|fields|participant_ids'),'cobrancas13: DTO sem conteudo restrito nao financeiro');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'request13_id','{"kind":"status","status":"cancelado","reason":"Cancelar ficticio","cancellation_review":{"charges_reviewed":true,"refunds_reviewed":true,"deliveries_reviewed":true,"external_reviewed":true}}'),'PT409','cobrancas13: pedido com divida nao cancela por revisao declarada');
SELECT public.request_mutate('00000000-0000-4000-e000-000000000131',:'request13_id',1,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000132","reason":"Responsabilidade ficticia"}',gen_random_uuid());
SELECT test.assert_true(public.charges_view('00000000-0000-4000-e000-000000000131',:'request13_id',1)->>'following_only'='true','cobrancas13: criador acompanha sem escrever apos transferencia');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"cancel","reason":"Cancelamento ficticio"}'),'PT403','cobrancas13: owner read_all nao substitui responsavel');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000132","session_id":"00000000-0000-4000-c000-000000000132"}';
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"adjust","delta_cents":-1000,"reason":"Desconto ficticio","installments":[{"due_date":"2026-11-01","amount_cents":9000}]}'),'PT403','cobrancas13: desconto sem capacidade negado');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"adjust","delta_cents":1000,"reason":"Acrescimo ficticio","installments":[{"due_date":"2026-11-01","amount_cents":11000}]}'),'PT403','cobrancas13: acrescimo sem capacidade negado');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000132','services.discount'),('00000000-0000-4000-b000-000000000132','services.surcharge');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000132","session_id":"00000000-0000-4000-c000-000000000132"}';
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"adjust","delta_cents":-1000,"reason":"Desconto ficticio","installments":[{"due_date":"2026-11-01","amount_cents":9001}]}'),'PT422','cobrancas13: soma de parcelas tem de ser exata');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"adjust","delta_cents":-1000.1,"reason":"Desconto ficticio","installments":[{"due_date":"2026-11-01","amount_cents":9000}]}'),'PT422','cobrancas13: centavo fracionario negado');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"adjust","delta_cents":-1000,"reason":"Desconto ficticio","balance_cents":0,"installments":[{"due_date":"2026-11-01","amount_cents":9000}]}'),'PT422','cobrancas13: saldo nao e editavel');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"cancel","reason":""}'),'PT422','cobrancas13: motivo obrigatorio');
SELECT public.charges_mutate('00000000-0000-4000-e000-000000000131',:'charge13_id',1,'{"kind":"adjust","delta_cents":-1000,"reason":"Desconto ficticio","installments":[{"due_date":"2026-11-01","amount_cents":9000}]}','00000000-0000-4000-f000-000000000132')AS adjusted13 \gset
SELECT test.assert_true(:'adjusted13'::jsonb->'charge' @> '{"original_cents":10000,"due_cents":9000,"balance_cents":9000,"version":2,"history_total":2}','cobrancas13: ajuste conserva original e historico');
SELECT test.assert_true(public.charges_mutate('00000000-0000-4000-e000-000000000131',:'charge13_id',1,'{"kind":"adjust","delta_cents":-1000,"reason":"Desconto ficticio","installments":[{"due_date":"2026-11-01","amount_cents":9000}]}','00000000-0000-4000-f000-000000000132')=:'adjusted13'::jsonb,'cobrancas13: resposta perdida nao repete ajuste');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"cancel","reason":"Cancelamento ficticio"}'),'PT409','cobrancas13: versao obsoleta negada');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"adjust","delta_cents":-10000,"reason":"Desconto excessivo","installments":[{"due_date":"2026-11-01","amount_cents":0}]}'),'PT422','cobrancas13: obrigacao nao pode ficar negativa');
SELECT public.charges_mutate('00000000-0000-4000-e000-000000000131',:'charge13_id',2,'{"kind":"cancel","reason":"Cancelamento ficticio"}','00000000-0000-4000-f000-000000000133')AS cancelled13 \gset
SELECT test.assert_true(:'cancelled13'::jsonb->'charge' @> '{"status":"cancelada","original_cents":10000,"due_cents":0,"balance_cents":0,"allocated_cents":0,"version":3,"history_total":3}','cobrancas13: cancelamento nao representa pagamento');
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,3,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'charge13_id','{"kind":"cancel","reason":"Cancelar novamente"}'),'PT409','cobrancas13: cancelada imutavel');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000134","session_id":"00000000-0000-4000-c000-000000000134"}';
SELECT test.expect_error(format('SELECT public.charges_view(%L,%L,1)','00000000-0000-4000-e000-000000000131',:'request13_id'),'PT404','cobrancas13: conhecido UUID nao concede escopo');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000133","session_id":"00000000-0000-4000-c000-000000000133"}';
SELECT test.expect_error(format('SELECT public.charges_view(%L,%L,1)','00000000-0000-4000-e000-000000000131',:'request13_id'),'PT403','cobrancas13: outro escritorio negado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000135","session_id":"00000000-0000-4000-c000-000000000135"}';
SELECT test.expect_error(format('SELECT public.charges_view(%L,%L,1)','00000000-0000-4000-e000-000000000131',:'request13_id'),'PT403','cobrancas13: portal negado com capacidades forjadas');
SET request.jwt.claims='{}';
SELECT test.expect_error(format('SELECT public.charges_view(%L,%L,1)','00000000-0000-4000-e000-000000000131',:'request13_id'),'PT401','cobrancas13: sessao real obrigatoria');
SET ROLE anon;
SELECT test.expect_error(format('SELECT public.charges_view(%L,%L,1)','00000000-0000-4000-e000-000000000131',:'request13_id'),'42501','cobrancas13: anon sem execute');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=2 FROM private.charge_items WHERE charge_id=:'charge13_id') AND (SELECT count(*)=3 FROM private.charge_installments WHERE charge_id=:'charge13_id'),'cobrancas13: itens e planos anteriores preservados');
SELECT test.expect_error(format('DELETE FROM private.charge_events WHERE charge_id=%L',:'charge13_id'),'PT403','cobrancas13: eventos imutaveis');
SELECT test.expect_error(format('UPDATE private.charge_items SET total_cents=0 WHERE charge_id=%L',:'charge13_id'),'PT403','cobrancas13: snapshot imutavel');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'charges.%' AND changes::text ~ 'Financeiro|Desconto|Cancelamento|Nota'),'cobrancas13: auditoria sem motivo sensivel');
-- Validation is also enforced in PostgreSQL for callers bypassing Express.
SELECT test.expect_error($q$SELECT private.charges_plan('[{"due_date":"2026-02-30","amount_cents":100}]',100)$q$,'PT422','cobrancas13: data inexistente negada');
SELECT test.expect_error($q$SELECT private.charges_plan('[{"due_date":"2026-11-01","amount_cents":50},{"due_date":"2026-11-01","amount_cents":50}]',100)$q$,'PT422','cobrancas13: vencimentos ordenados estritamente');
SELECT test.expect_error($q$SELECT private.charges_plan('[{"due_date":"2026-11-01","amount_cents":0},{"due_date":"2026-12-01","amount_cents":100}]',100)$q$,'PT422','cobrancas13: parcela zero em divida positiva negada');
SELECT private.charges_plan('[{"due_date":"2026-11-01","amount_cents":0}]',0);
SELECT test.assert_true(true,'cobrancas13: plano sem valor usa parcela unica zero');
-- A zero obligation is not a payment and cannot be revived after request cancellation.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000131","session_id":"00000000-0000-4000-c000-000000000131"}';
SELECT public.request_create('00000000-0000-4000-e000-000000000131',:'request13',gen_random_uuid(),gen_random_uuid())->>'id' AS zero_request13 \gset
SELECT public.charges_create('00000000-0000-4000-e000-000000000131',:'zero_request13','[{"due_date":"2026-11-01","amount_cents":11000}]',gen_random_uuid())->'charge'->>'id' AS zero_charge13 \gset
SELECT public.charges_mutate('00000000-0000-4000-e000-000000000131',:'zero_charge13',1,'{"kind":"adjust","delta_cents":-11000,"reason":"Dispensa financeira ficticia","installments":[{"due_date":"2026-11-01","amount_cents":0}]}',gen_random_uuid());
SELECT public.request_mutate('00000000-0000-4000-e000-000000000131',:'zero_request13',1,'{"kind":"status","status":"cancelado","reason":"Cancelamento apos divida zero","cancellation_review":{"charges_reviewed":true,"refunds_reviewed":true,"deliveries_reviewed":true,"external_reviewed":true}}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'zero_charge13','{"kind":"adjust","delta_cents":100,"reason":"Reativacao apos cancelamento","installments":[{"due_date":"2026-11-01","amount_cents":100}]}'),'PT409','cobrancas13: pedido cancelado nao recebe divida nova');
SELECT test.assert_true(public.charges_view('00000000-0000-4000-e000-000000000131',:'zero_request13',1)->'charge' @> '{"status":"sem_valor","due_cents":0,"allocated_cents":0,"can_adjust":false,"can_cancel":false}','cobrancas13: pedido cancelado bloqueia decisoes financeiras');
RESET ROLE;
-- Audit and command persistence share the same transaction as the debt.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000131","session_id":"00000000-0000-4000-c000-000000000131"}';
SELECT public.request_create('00000000-0000-4000-e000-000000000131',:'request13',gen_random_uuid(),gen_random_uuid())->>'id' AS rollback_request13 \gset
RESET ROLE;
ALTER TABLE public.audit_events ADD CONSTRAINT test_charge_audit_failure CHECK(action<>'charges.created') NOT VALID;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000131","session_id":"00000000-0000-4000-c000-000000000131"}';
SELECT test.expect_error(format('SELECT public.charges_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000131',:'rollback_request13','[{"due_date":"2026-11-01","amount_cents":11000}]'),'23514','cobrancas13: falha de auditoria reverte criacao');
SELECT test.assert_true(public.charges_view('00000000-0000-4000-e000-000000000131',:'rollback_request13',1)->'charge'='null'::jsonb,'cobrancas13: rollback nao deixa divida fantasma');
RESET ROLE;
ALTER TABLE public.audit_events DROP CONSTRAINT test_charge_audit_failure;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.charges WHERE request_id=:'rollback_request13'),'cobrancas13: rollback sem header itens parcelas ou chave');
SELECT test.assert_true((SELECT count(*)=1 FROM pg_indexes WHERE schemaname='private' AND indexname='charge_items_charge_idx') AND (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='private' AND indexname='charge_events_office_id_charge_id_version_key'),'cobrancas13: saldo usa indices por escritorio e cobranca');
