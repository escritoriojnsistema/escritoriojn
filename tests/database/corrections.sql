RESET ROLE;
SELECT test.assert_true((SELECT entries FROM test.corrections_snapshot)=(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM private.cash_entries e) AND(SELECT commands FROM test.corrections_snapshot)=(SELECT jsonb_agg(to_jsonb(c) ORDER BY office_id,kind,idempotency_key) FROM private.cash_commands c) AND(SELECT payments FROM test.corrections_snapshot)=(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM private.payments p) AND(SELECT events FROM test.corrections_snapshot)=(SELECT count(*) FROM public.audit_events) AND(SELECT notices FROM test.corrections_snapshot)=(SELECT count(*) FROM private.internal_notifications),'16: backfill preserva originais ledger comandos resultados pagamentos eventos avisos');
SELECT test.assert_true((SELECT count(*) FROM private.payment_reversals)=(SELECT count(*) FROM private.cash_entries WHERE kind IN('refunded','reversed')) AND(SELECT count(*) FROM private.payment_refunds)=(SELECT count(*) FROM private.payment_reversals) AND NOT EXISTS(SELECT FROM private.payment_reversals WHERE NOT legacy OR evidence IS NOT NULL),'16: backfill deterministico reflete duas intencoes antigas sem metadata inventada');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.payment_reversals','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.payment_refunds','SELECT,INSERT,UPDATE,DELETE') AND(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.payment_reversals'::regclass,'private.payment_refunds'::regclass)) AND NOT has_function_privilege('anon','public.correction_operate(uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','private.cash_operate_before15(uuid,jsonb)','EXECUTE'),'16: RLS ACL RPC e alias privados fechados');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS f16 \gset
SELECT :'f16'::jsonb->>'office' AS office16,:'f16'::jsonb->>'session' AS session16 \gset
SELECT public.payment_operate(:'office16',test.payment_op(:'f16',6000)) AS paid16 \gset
SELECT public.correction_sources(:'office16',:'session16','reverse','',1)->'items'->0 AS source16 \gset
SELECT jsonb_build_object('kind','reverse','session_id',:'session16','expected_version',2,'idempotency_key',gen_random_uuid(),'allocation_id',:'source16'::jsonb->'allocation_id','refund_now',false,'amount_cents',2000,'reason','Motivo privado estorno16','evidence','Evidencia privada de correcao16') AS op16 \gset
SELECT public.correction_operate(:'office16',:'op16') AS rev16 \gset
SELECT test.assert_true((SELECT e->>'refundable_cents'='6000' FROM jsonb_array_elements(:'rev16'::jsonb->'entries')e WHERE e->>'kind'='received'),'16: original devolvivel nao trata estorno logico como saida de fundos');
SELECT test.assert_true(:'rev16'::jsonb->'session' @> '{"cash_cents":16000,"refunded_cents":0,"received_cents":6000,"version":3}' AND :'rev16'::jsonb->'payments'->'items'->0 @> '{"amount_cents":6000,"reversed_cents":2000,"refunded_cents":0,"pending_refund_cents":2000,"status":"partially_reversed"}','16: estorno20de60 reduz alocacao e conserva dinheiro original passivo explicito');
SELECT test.assert_true(public.charges_view(:'office16',(:'f16'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge' @> '{"allocated_cents":4000,"balance_cents":6000}' AND public.correction_operate(:'office16',:'op16')=:'rev16'::jsonb,'16: saldo4000 idempotencia resultado persistido sem segundo efeito');
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'op16'::jsonb||'{"amount_cents":2001}')::text),'PT409','16: chave mesmo conteudo diferente recusada');
SELECT public.correction_sources(:'office16',:'session16','refund','',1)->'items'->0 AS refundsource16 \gset
SELECT jsonb_build_object('kind','refund','session_id',:'session16','expected_version',3,'idempotency_key',gen_random_uuid(),'reversal_id',:'refundsource16'::jsonb->'reversal_id','amount_cents',2000,'reason','Devolucao efetivada fora do sistema','evidence','Conferencia privada devolucao16') AS refundop16 \gset
SELECT public.correction_operate(:'office16',:'refundop16') AS refund16 \gset
SELECT test.assert_true(:'refund16'::jsonb->'session' @> '{"cash_cents":14000,"refunded_cents":2000,"version":4}' AND :'refund16'::jsonb->'payments'->'items'->0 @> '{"amount_cents":6000,"reversed_cents":2000,"refunded_cents":2000,"pending_refund_cents":0}' AND public.charges_view(:'office16',(:'f16'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge'->>'allocated_cents'='4000','16: devolver depois sai dinheiro uma vez nao altera alocacao novamente');
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'refundop16'::jsonb||jsonb_build_object('expected_version',4,'idempotency_key',gen_random_uuid(),'amount_cents',1))::text),'PT409','16: excesso de devolucao nao ultrapassa reversao');
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'op16'::jsonb||jsonb_build_object('expected_version',4,'idempotency_key',gen_random_uuid(),'amount_cents',4001))::text),'PT409','16: excesso de reversao nao ultrapassa original liquido');
SELECT public.correction_operate(:'office16',:'op16'::jsonb||jsonb_build_object('expected_version',4,'idempotency_key',gen_random_uuid(),'amount_cents',4000,'refund_now',true)) AS rest16 \gset
SELECT test.assert_true(:'rest16'::jsonb->'session' @> '{"cash_cents":10000,"refunded_cents":6000,"version":5}' AND :'rest16'::jsonb->'payments'->'items'->0 @> '{"status":"reversed","reversed_cents":6000,"refunded_cents":6000,"pending_refund_cents":0}','16: estorno e devolucao conjunto atomico integral preserva original');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office16',jsonb_build_object('kind','refund','session_id',:'session16','expected_version',5,'idempotency_key',gen_random_uuid(),'entry_id',:'source16'::jsonb->'original_entry_id','amount_cents',1,'reason','Bypass legado invalido')::text),'PT422','16: RPC autenticada legada nao desvia correcao explicita');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action IN('payments.allocation_reversed','payments.refund_paid') AND changes::text ~ 'privad|Motivo|Evidencia') AND(SELECT count(*) FROM public.audit_events WHERE action='payments.allocation_reversed' AND target_id=:'session16')=2 AND(SELECT count(*) FROM public.audit_events WHERE action='payments.refund_paid' AND target_id=:'session16')=2,'16: auditoria real atomica sem notas livres');
SELECT test.expect_error(format('UPDATE private.payment_reversals SET amount_cents=1 WHERE session_id=%L',:'session16'),'PT403','16: reversao confirmada imutavel');
-- New functions are test fixtures only, no hosted path.
CREATE FUNCTION test.correction_op(f jsonb,amount bigint,refund_now boolean DEFAULT false) RETURNS jsonb LANGUAGE sql VOLATILE AS $$SELECT jsonb_build_object('kind','reverse','session_id',f->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'allocation_id',f->'allocation','refund_now',refund_now,'amount_cents',amount,'reason','Correcao privada de laboratorio','evidence','Evidencia manual de laboratorio');$$;
CREATE FUNCTION test.correction_fixture(method text DEFAULT 'cash') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE f jsonb;result jsonb;BEGIN
 f:=test.payment_fixture();result:=public.payment_operate((f->>'office')::uuid,test.payment_op(f,6000,method)||CASE WHEN method='card' THEN '{"fee_cents":300}'::jsonb ELSE '{}'::jsonb END);
 RETURN f||jsonb_build_object('allocation',result->'payments'->'items'->0->'allocations'->0->'id','payment',result->'payments'->'items'->0->'id','entry',result->'entries'->0->'id');END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.correction_fixture('pix') AS pix16 \gset
SELECT public.correction_operate(:'office16',test.correction_op(:'pix16',2000,true)) AS pixrefund16 \gset
SELECT test.assert_true(:'pixrefund16'::jsonb->'session' @> '{"cash_cents":10000,"digital_cents":4000,"refunded_cents":2000}' AND :'pixrefund16'::jsonb->'payments'->'destinations'->0 @> '{"received_cents":6000,"returned_cents":2000,"net_cents":4000}','16: PIX devolvido nao altera especie e destino conta devolucao unica');
SELECT test.correction_fixture('card') AS card16 \gset
SELECT public.correction_operate(:'office16',test.correction_op(:'card16',6000,true)) AS cardrefund16 \gset
SELECT test.assert_true(:'cardrefund16'::jsonb->'payments'->'items'->0 @> '{"amount_cents":6000,"fee_cents":300,"net_cents":5700,"refunded_cents":6000,"status":"reversed"}' AND :'cardrefund16'::jsonb->'payments'->'destinations'->0 @> '{"returned_cents":6000,"net_cents":-300}','16: taxa cartao nao reduz limite de devolucao do cliente');
-- Close original, then correct it from a newly opened session. Old cash totals frozen.
SELECT test.correction_fixture() AS closedf16 \gset
SELECT public.cash_operate(:'office16',jsonb_build_object('kind','close','session_id',:'closedf16'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'counted_cents',16000,'reason','Fecho do original antes de corrigir')) AS closedresult16 \gset
SELECT public.cash_open(:'office16',(:'closedf16'::jsonb->>'unit')::uuid,(:'closedf16'::jsonb->>'cashaccount')::uuid,10000,gen_random_uuid())->'sessions'->0->>'id' AS currentsession16 \gset
SELECT test.correction_op(:'closedf16',6000)||jsonb_build_object('session_id',:'currentsession16','expected_version',1) AS closedop16 \gset
SELECT public.correction_operate(:'office16',:'closedop16') AS closedrev16 \gset
SELECT test.assert_true(public.cash_statement(:'office16',(:'closedf16'::jsonb->>'session')::uuid,1)->'session'=:'closedresult16'::jsonb->'session' AND :'closedrev16'::jsonb->'session' @> '{"cash_cents":10000,"received_cents":0,"refunded_cents":0,"version":2}','16: correcao no caixa atual nao reescreve totais encerrados');
SELECT public.correction_sources(:'office16',:'currentsession16','refund','',1)->'items'->0 AS closedsrc16 \gset
SELECT public.charges_mutate(:'office16',(:'closedf16'::jsonb->'charges'->0->>'id')::uuid,1,'{"kind":"cancel","reason":"Cancelar obrigacao apos estorno logico"}',gen_random_uuid());
SELECT public.request_mutate(:'office16',(:'closedf16'::jsonb->'charges'->0->>'request_id')::uuid,1,'{"kind":"status","status":"cancelado","reason":"Cancelamento nao prova devolucao","cancellation_review":{"charges_reviewed":true,"refunds_reviewed":true,"deliveries_reviewed":true,"external_reviewed":true}}',gen_random_uuid());
SELECT test.assert_true(public.correction_sources(:'office16',:'currentsession16','refund','',1)->'items'->0->>'pending_refund_cents'='6000','16: cancelar pedido nao comprova reembolso e conserva passivo');
SELECT public.correction_operate(:'office16',jsonb_build_object('kind','refund','session_id',:'currentsession16','expected_version',2,'idempotency_key',gen_random_uuid(),'reversal_id',:'closedsrc16'::jsonb->'reversal_id','amount_cents',6000,'reason','Devolucao apos cancelamento explicito','evidence','Dinheiro devolvido manualmente'));
SELECT test.assert_true(public.charges_view(:'office16',(:'closedf16'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge' @> '{"allocated_cents":0,"due_cents":0,"balance_cents":0,"status":"cancelada"}','16: devolver apos cancelar nao reativa obrigacao nem apaga recibo');
SELECT test.correction_fixture() AS guardf16 \gset
SELECT test.expect_error(format('SELECT public.charges_mutate(%L,%L,1,%L,gen_random_uuid())',:'office16',:'guardf16'::jsonb->'charges'->0->>'id','{"kind":"adjust","delta_cents":-5000,"reason":"Abaixo do aplicado deve falhar","installments":[{"due_date":"2027-01-01","amount_cents":5000}]}'),'PT409','16: ajuste nunca reduz obrigacao abaixo do aplicado');
SELECT test.correction_op(:'guardf16',2000) AS validop16 \gset
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'validop16'::jsonb||'{"refund_now":null}')::text),'PT422','16: RPC direto boolean null rejeitado');
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'validop16'::jsonb||'{"amount_cents":"2000"}')::text),'PT422','16: RPC direto valor string rejeitado');
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'validop16'::jsonb||'{"expected_version":null}')::text),'PT422','16: RPC direto versao null rejeitada');
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'validop16'::jsonb||'{"reason":null}')::text),'PT422','16: RPC direto motivo null rejeitado');
-- Deliberate second movement failure proves reversal, cash, commands, notices and audit rollback.
RESET ROLE;
CREATE FUNCTION test.fail_refund16() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.kind='refund_paid' THEN RAISE EXCEPTION 'INJECTED_REFUND_FAILURE' USING ERRCODE='P0001';END IF;RETURN NEW;END $$;
CREATE TRIGGER z_test_fail_refund16 BEFORE INSERT ON private.cash_entries FOR EACH ROW EXECUTE FUNCTION test.fail_refund16();
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.correction_operate(%L,%L)',:'office16',(:'validop16'::jsonb||'{"refund_now":true}')::text),'P0001','16: falha intermediaria provocada na devolucao');
RESET ROLE;
DROP TRIGGER z_test_fail_refund16 ON private.cash_entries;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.payment_reversals WHERE allocation_id=(:'guardf16'::jsonb->>'allocation')::uuid) AND NOT EXISTS(SELECT FROM private.cash_commands WHERE kind='correction' AND idempotency_key=(:'validop16'::jsonb->>'idempotency_key')::uuid) AND NOT EXISTS(SELECT FROM public.audit_events WHERE request_id=(:'validop16'::jsonb->>'idempotency_key')::uuid),'16: rollback nao deixa reversao comando ou auditoria parcial');
-- Settlement-required snapshot governs financial flag; current catalog changes cannot change it.
SET ROLE authenticated;
SELECT public.cash_eligible_charges(:'office16','',1) AS guardpage16 \gset
RESET ROLE;
SELECT test.assert_true((SELECT private.finance_charge_json(c,r)->'financial_condition' @> '{"settlement_required":true,"blocked":true}' FROM private.charges c JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id WHERE c.id=(:'guardf16'::jsonb->'charges'->0->>'id')::uuid),'16: saldo positivo bloqueia apenas segundo snapshot de quitacao');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true((SELECT public.cash_operate(office_id,operation)=result FROM test.correction_legacy_commands),'16: replay legado de devolucao apos backfill retorna mesmo JSON sem novo efeito');
RESET ROLE;
-- Create a service without settlement requirement; publish a changed current catalog after capture.
SELECT (snapshot->'definition')||jsonb_build_object('code','NREQ16','name','Sem quitacao previa16','settlement_required',false,'effective_from',NULL) AS no_required16 FROM private.charge_items WHERE charge_id=(:'guardf16'::jsonb->'charges'->0->>'id')::uuid LIMIT 1 \gset
SET ROLE authenticated;
SELECT public.service_create(:'office16',:'no_required16','Regra ficticia sem quitacao',gen_random_uuid())->>'id' AS no_service16 \gset
SELECT public.request_create(:'office16',jsonb_build_object('origin','presencial','title','Sem bloqueio financeiro16','customer_id',NULL,'assignee_id',NULL,'priority','normal','priority_reason','','internal_note','','items',jsonb_build_array(jsonb_build_object('service_id',:'no_service16','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))),gen_random_uuid(),gen_random_uuid())->>'id' AS no_request16 \gset
SELECT public.charges_create(:'office16',:'no_request16','[{"due_date":"2027-01-01","amount_cents":10000}]',gen_random_uuid())->'charge'->>'id' AS no_charge16 \gset
SELECT public.service_publish(:'office16',:'no_service16',:'no_required16'::jsonb||'{"settlement_required":true}',1,'Catalogo novo nao reescreve snapshot',gen_random_uuid());
RESET ROLE;
SELECT test.assert_true((SELECT private.finance_charge_json(c,r)->'financial_condition' @> '{"settlement_required":false,"blocked":false}' FROM private.charges c JOIN public.requests r ON r.office_id=c.office_id AND r.id=c.request_id WHERE c.id=:'no_charge16'),'16: divida sem exigencia no snapshot nao bloqueia mesmo apos catalogo exigir');

SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events e LEFT JOIN private.payment_reversals v ON v.office_id=e.office_id AND v.id::text=e.changes->>'reversal_id' LEFT JOIN private.cash_entries l ON l.office_id=e.office_id AND l.id::text=e.changes->>'entry_id' WHERE e.action='payments.allocation_reversed' AND(v.id IS NULL OR l.id IS NULL OR l.id<>v.entry_id OR l.kind<>'allocation_reversed')) AND NOT EXISTS(SELECT FROM public.audit_events e LEFT JOIN private.payment_refunds f ON f.office_id=e.office_id AND f.id::text=e.changes->>'refund_id' LEFT JOIN private.cash_entries l ON l.office_id=e.office_id AND l.id::text=e.changes->>'entry_id' WHERE e.action='payments.refund_paid' AND(f.id IS NULL OR l.id IS NULL OR l.id<>f.entry_id OR l.kind<>'refund_paid')),'16 P3: referencia de lancamento audita ledger e IDs proprios ficam separados');
