-- Real RPCs under authenticated; only these synthetic fixtures live in disposable PG.
RESET ROLE;
CREATE FUNCTION test.payment_fixture() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE office uuid:='00000000-0000-4000-e000-000000000151';unit uuid;cashaccount uuid;bank uuid;cashmethod uuid;pix uuid;card uuid;transfer uuid;session uuid;service uuid;rq uuid;charges jsonb:='[]';items jsonb;BEGIN
 unit:=(public.cash_configure(office,jsonb_build_object('kind','unit','id',NULL,'expected_version',NULL,'name','Pagamento15 '||gen_random_uuid(),'active',true),gen_random_uuid())->'resource'->>'id')::uuid;
 cashaccount:=(public.cash_configure(office,jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Especie15','active',true,'unit_id',unit,'type','cash'),gen_random_uuid())->'resource'->>'id')::uuid;
 bank:=(public.cash_configure(office,jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Banco15','active',true,'unit_id',unit,'type','bank'),gen_random_uuid())->'resource'->>'id')::uuid;
 cashmethod:=(public.cash_configure(office,jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Dinheiro15','active',true,'unit_id',unit,'type','cash','destination_account_id',cashaccount),gen_random_uuid())->'resource'->>'id')::uuid;
 pix:=(public.cash_configure(office,jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','PIX15','active',true,'unit_id',unit,'type','pix','destination_account_id',bank),gen_random_uuid())->'resource'->>'id')::uuid;
 card:=(public.cash_configure(office,jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Cartao15','active',true,'unit_id',unit,'type','card','destination_account_id',bank),gen_random_uuid())->'resource'->>'id')::uuid;
 transfer:=(public.cash_configure(office,jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Transferencia15','active',true,'unit_id',unit,'type','transfer','destination_account_id',bank),gen_random_uuid())->'resource'->>'id')::uuid;
 SELECT id INTO service FROM public.services WHERE office_id=office AND code='FINANCE15';
 items:=jsonb_build_array(jsonb_build_object('service_id',service,'quantity',1,'adjustment',jsonb_build_object('kind','none','value',0,'reason',''),'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb));
 FOR n IN 1..2 LOOP
 rq:=(public.request_create(office,jsonb_build_object('origin','presencial','title','Pagamento15 '||gen_random_uuid(),'customer_id',NULL,'assignee_id','00000000-0000-4000-b000-000000000151','priority','normal','priority_reason','','internal_note','','items',items),gen_random_uuid(),gen_random_uuid())->>'id')::uuid;
 charges:=charges||jsonb_build_array((public.charges_create(office,rq,'[{"due_date":"2027-01-01","amount_cents":10000}]',gen_random_uuid())->'charge')||jsonb_build_object('request_id',rq));
 END LOOP;
 session:=(public.cash_open(office,unit,cashaccount,10000,gen_random_uuid())->'sessions'->0->>'id')::uuid;
 RETURN jsonb_build_object('office',office,'unit',unit,'cashaccount',cashaccount,'bank',bank,'cash',cashmethod,'pix',pix,'card',card,'transfer',transfer,'session',session,'charges',charges);
END $$;
CREATE FUNCTION test.payment_op(f jsonb,amount bigint,method text DEFAULT 'cash',status text DEFAULT 'confirmed') RETURNS jsonb LANGUAGE sql VOLATILE AS $$
 SELECT jsonb_build_object('kind','record','session_id',f->'session','expected_version',1,'idempotency_key',gen_random_uuid(),'evidence','Conferencia privada15 com comprovante ficticio','payment_method_id',f->method,'status',status,'allocations',jsonb_build_array(jsonb_build_object('charge_id',f->'charges'->0->'id','expected_charge_version',1,'amount_cents',amount)),'presented_cents',CASE WHEN method='cash' THEN amount ELSE NULL END,'fee_cents',0,'settlement',CASE WHEN method='card' THEN 'pending' ELSE 'not_applicable' END,'settled_on',NULL,'external_reference',NULL);
$$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS f \gset
SELECT (test.payment_op(:'f',3000)||'{"presented_cents":5000}') AS cashop \gset
SELECT public.payment_operate((:'f'::jsonb->>'office')::uuid,:'cashop') AS cashresult \gset
SELECT test.assert_true(:'cashresult'::jsonb->'session' @> '{"cash_cents":13000,"received_cents":3000,"version":2}' AND :'cashresult'::jsonb->'payments'->'items'->0 @> '{"amount_cents":3000,"presented_cents":5000,"change_cents":2000,"status":"confirmed","net_cents":3000}','15: aplicado30 apresentado50 troco20 fundo100 resulta130');
SELECT test.assert_true(public.payment_operate((:'f'::jsonb->>'office')::uuid,:'cashop')=:'cashresult'::jsonb,'15: resposta perdida reenvia resultado oficial identico');
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'f'::jsonb->>'office',(:'cashop'::jsonb||'{"presented_cents":5100}')::text),'PT409','15: mesma chave outro payload conflita sem efeito');
SELECT public.payment_operate((:'f'::jsonb->>'office')::uuid,test.payment_op(:'f',4000,'pix')||'{"expected_version":2}') AS pixresult \gset
SELECT test.assert_true(:'pixresult'::jsonb->'session' @> '{"cash_cents":13000,"digital_cents":4000,"version":3}' AND public.charges_view((:'f'::jsonb->>'office')::uuid,(:'f'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge'->>'balance_cents'='3000','15: PIX40 nao altera especie130 nem soma duas fontes');
SELECT test.payment_fixture() AS f2 \gset
SELECT public.payment_operate((:'f2'::jsonb->>'office')::uuid,test.payment_op(:'f2',6000)) AS r60 \gset
SELECT test.assert_true(public.charges_view((:'f2'::jsonb->>'office')::uuid,(:'f2'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge' @> '{"allocated_cents":6000,"balance_cents":4000}','15: pagamento60 fica parcial');
SELECT public.payment_operate((:'f2'::jsonb->>'office')::uuid,test.payment_op(:'f2',4000,'transfer')||'{"expected_version":2}') AS r40 \gset
SELECT test.assert_true(public.charges_view((:'f2'::jsonb->>'office')::uuid,(:'f2'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge' @> '{"allocated_cents":10000,"balance_cents":0}','15: segundo40 quita100 com transferencia manual');
SELECT test.payment_fixture() AS f3 \gset
SELECT public.payment_operate((:'f3'::jsonb->>'office')::uuid,test.payment_op(:'f3',3000,'pix','pending')) AS pending \gset
SELECT :'pending'::jsonb->'payments'->'items'->0->>'id' AS pendingid \gset
SELECT test.assert_true(:'pending'::jsonb->'session' @> '{"cash_cents":10000,"received_cents":0,"version":1}' AND :'pending'::jsonb->'payments'->'items'->0->>'status'='pending' AND public.charges_view((:'f3'::jsonb->>'office')::uuid,(:'f3'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge'->>'allocated_cents'='0','15: comprovante pendente nao confirma ou reserva saldo');
SELECT jsonb_build_object('kind','confirm','session_id',:'f3'::jsonb->'session','expected_version',1,'idempotency_key',gen_random_uuid(),'payment_id',:'pendingid','evidence','Conferencia manual de PIX ficticio') AS confirmop \gset
SELECT public.payment_operate((:'f3'::jsonb->>'office')::uuid,:'confirmop') AS confirmed \gset
SELECT test.assert_true(:'confirmed'::jsonb->'session' @> '{"cash_cents":10000,"digital_cents":3000,"version":2}' AND :'confirmed'::jsonb->'payments'->'items'->0->>'status'='confirmed','15: confirmacao autorizada gera alocacao ledger juntos');
SELECT test.assert_true(public.payment_operate((:'f3'::jsonb->>'office')::uuid,:'confirmop')=:'confirmed'::jsonb,'15: retry de confirmacao nao duplica');
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'f3'::jsonb->>'office',(:'confirmop'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_version',2))::text),'PT409','15: segunda confirmacao distinta impedida');
SELECT public.cash_operate((:'f3'::jsonb->>'office')::uuid,jsonb_build_object('kind','refund','session_id',:'f3'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'entry_id',:'confirmed'::jsonb->'entries'->0->'id','amount_cents',1000,'reason','Reembolso parcial de laboratorio')) AS partial \gset
SELECT test.assert_true(:'partial'::jsonb->'payments'->'items'->0->>'status'='partially_reversed' AND public.charges_view((:'f3'::jsonb->>'office')::uuid,(:'f3'::jsonb->'charges'->0->>'request_id')::uuid,1)->'charge'->>'allocated_cents'='2000','15: reembolso antigo reflete saldo alocado sem dupla receita');
SELECT test.payment_fixture() AS f4 \gset
SELECT test.payment_op(:'f4',3000,'card')||'{"fee_cents":150}' AS cardop \gset
SELECT public.payment_operate((:'f4'::jsonb->>'office')::uuid,:'cardop') AS card \gset
SELECT test.assert_true(:'card'::jsonb->'payments'->'items'->0 @> '{"fee_cents":150,"net_cents":2850,"amount_cents":3000,"settlement":"pending"}' AND :'card'::jsonb->'session' @> '{"cash_cents":10000,"digital_cents":3000}','15: taxa150 separada do bruto3000 sem desconto comercial');
SELECT public.payment_operate((:'f4'::jsonb->>'office')::uuid,jsonb_build_object('kind','settle','session_id',:'f4'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'payment_id',:'card'::jsonb->'payments'->'items'->0->'id','evidence','Liquidacao manual local comprovada','settled_on','2026-10-24')) AS settled \gset
SELECT test.assert_true(:'settled'::jsonb->'payments'->'items'->0 @> '{"settlement":"settled","settled_on":"2026-10-24"}' AND :'settled'::jsonb->'session' @> '{"digital_cents":3000,"version":2}','15: liquidacao nao gera nova receita nem movimento');
SELECT test.payment_fixture() AS f5 \gset
SELECT test.payment_op(:'f5',6000)||jsonb_build_object('presented_cents',10000,'allocations',jsonb_build_array(jsonb_build_object('charge_id',:'f5'::jsonb->'charges'->0->'id','expected_charge_version',1,'amount_cents',6000),jsonb_build_object('charge_id',:'f5'::jsonb->'charges'->1->'id','expected_charge_version',1,'amount_cents',4000))) AS multiop \gset
SELECT public.payment_operate((:'f5'::jsonb->>'office')::uuid,:'multiop') AS multi \gset
SELECT test.assert_true(:'multi'::jsonb->'session' @> '{"received_cents":10000,"cash_cents":20000,"version":3}' AND jsonb_array_length(:'multi'::jsonb->'payments'->'items'->0->'allocations')=2 AND :'multi'::jsonb->'payments'->>'total'='1','15: um pagamento quita duas cobrancas com um total');
SELECT test.payment_fixture() AS f6 \gset
SELECT test.payment_op(:'f6',3000,'pix','pending') AS pendingop6 \gset
SELECT public.payment_operate((:'f6'::jsonb->>'office')::uuid,:'pendingop6') AS pending6 \gset
SELECT public.cash_operate((:'f6'::jsonb->>'office')::uuid,jsonb_build_object('kind','close','session_id',:'f6'::jsonb->'session','expected_version',1,'idempotency_key',gen_random_uuid(),'counted_cents',10000,'reason','Fecho com comprovante pendente'));
SELECT jsonb_build_object('kind','confirm','session_id',:'f6'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'payment_id',:'pending6'::jsonb->'payments'->'items'->0->'id','evidence','Confirmacao apos fecho impedida') AS closedop \gset
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'f6'::jsonb->>'office',:'closedop'),'PT409','15: caixa fechado nunca aceita confirmacao pendente');
SELECT public.payment_operate((:'f6'::jsonb->>'office')::uuid,:'closedop'::jsonb||jsonb_build_object('kind','reject','idempotency_key',gen_random_uuid())) AS rejected \gset
SELECT test.assert_true(:'rejected'::jsonb->'payments'->'items'->0->>'status'='rejected' AND :'rejected'::jsonb->'session'->>'received_cents'='0','15: rejeicao apos fecho nao altera numerario ou receita');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'f6'::jsonb->>'office',jsonb_build_object('kind','receive','session_id',:'f6'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'charge_id',:'f6'::jsonb->'charges'->0->'id','expected_charge_version',1,'amount_cents',100,'payment_method_id',:'f6'::jsonb->'cash')::text),'PT422','15: RPC legado nao cria ledger sem pagamento');
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.payments','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('anon','private.payment_allocations','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('authenticated','private.cash_operate_before15(uuid,jsonb)','EXECUTE'),'15: ACL impede bypass privado');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.payments'::regclass,'private.payment_allocations'::regclass,'private.payment_decisions'::regclass,'private.payment_ledger_links'::regclass)) AND NOT has_function_privilege('anon','public.payment_operate(uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('service_role','public.payment_operate(uuid,jsonb)','EXECUTE'),'15: RLS e RPC invoker autenticada somente');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_entries e WHERE e.kind IN('received','refunded','reversed') AND NOT EXISTS(SELECT FROM private.payment_ledger_links l WHERE l.office_id=e.office_id AND l.entry_id=e.id)),'15: todo ledger financeiro ligado a alocacao unica');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'payments.%' AND changes::text ~ 'privada15|comprovante|evidence|reference'),'15: trilha nao vaza evidencia livre ou referencia externa');
SELECT test.expect_error(format('UPDATE private.payments SET amount_cents=1 WHERE id=%L',:'pendingid'),'PT403','15: pagamento imutavel');
-- Failure after the first allocation inserts a ledger entry: the entire command rolls back.
CREATE FUNCTION test.fail_payment_second() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.charge_id::text=current_setting('test.fail_payment_charge',true) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END $$;
CREATE TRIGGER fail_payment_second AFTER INSERT ON private.cash_entries FOR EACH ROW EXECUTE FUNCTION test.fail_payment_second();
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS rollbackf \gset
SELECT test.payment_op(:'rollbackf',1000)||jsonb_build_object('presented_cents',2000,'allocations',(SELECT jsonb_agg(jsonb_build_object('charge_id',c->'id','expected_charge_version',1,'amount_cents',1000)) FROM jsonb_array_elements(:'rollbackf'::jsonb->'charges')c)) AS rollbackop \gset
-- Function15 locks/iterates UUID order, fail at the second UUID to exercise a real intermediate effect.
SELECT set_config('test.fail_payment_charge',(SELECT max(c->>'id') FROM jsonb_array_elements(:'rollbackf'::jsonb->'charges')c),false);
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'rollbackf'::jsonb->>'office',:'rollbackop'),'PT409','15: falha na segunda alocacao retorna conflito');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_entries WHERE session_id=(:'rollbackf'::jsonb->>'session')::uuid) AND NOT EXISTS(SELECT FROM private.payments WHERE session_id=(:'rollbackf'::jsonb->>'session')::uuid) AND NOT EXISTS(SELECT FROM private.cash_commands WHERE kind='payment' AND idempotency_key=(:'rollbackop'::jsonb->>'idempotency_key')::uuid) AND NOT EXISTS(SELECT FROM public.audit_events WHERE target_id=(:'rollbackf'::jsonb->>'session')::uuid AND action='cash.payment_received'),'15: rollback remove pagamento alocacoes ledger comando e auditoria');
SELECT set_config('test.fail_payment_charge','',false);
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true(public.payment_operate((:'rollbackf'::jsonb->>'office')::uuid,:'rollbackop')->'session'->>'received_cents'='2000','15: mesma chave apos rollback pode concluir exatamente uma vez');
-- Capability/scope boundaries on all selected charges, and customer/other-office exclusion.
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'f'::jsonb->>'office',:'cashop'),'PT403','15: cliente excluido da operacao mesmo com IDs conhecidos');
SELECT test.expect_error(format('SELECT public.cash_payments_page(%L,%L,1)',:'f'::jsonb->>'office',:'f'::jsonb->>'session'),'PT403','15: cliente nao recebe destinos taxas evidencias internas');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000156","session_id":"00000000-0000-4000-c000-000000000156"}';
SELECT test.expect_error(format('SELECT public.cash_payments_page(%L,%L,1)',:'f'::jsonb->>'office',:'f'::jsonb->>'session'),'PT403','15: dono de outro escritorio nao atravessa isolamento');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'f'::jsonb->>'office',(:'cashop'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_version',3,'allocations',jsonb_build_array(jsonb_build_object('charge_id','00000000-0000-4000-9000-000000000999','expected_charge_version',1,'amount_cents',1))))::text),'PT404','15: uma cobranca inexistente desfaz todo pagamento');
RESET ROLE;
DROP TRIGGER fail_payment_second ON private.cash_entries;
-- Independent review P2: snapshot type/destination must survive pending confirmation.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS typef \gset
SELECT public.payment_operate((:'typef'::jsonb->>'office')::uuid,test.payment_op(:'typef',3000,'pix','pending')) AS typepending \gset
SELECT public.cash_configure((:'typef'::jsonb->>'office')::uuid,jsonb_build_object('kind','payment_method','id',:'typef'::jsonb->'pix','expected_version',1,'name','PIX passou a cartao','active',true,'unit_id',:'typef'::jsonb->'unit','type','card','destination_account_id',:'typef'::jsonb->'bank'),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'typef'::jsonb->>'office',jsonb_build_object('kind','confirm','session_id',:'typef'::jsonb->'session','expected_version',1,'idempotency_key',gen_random_uuid(),'payment_id',:'typepending'::jsonb->'payments'->'items'->0->'id','evidence','Confirmacao de snapshot alterado')::text),'PT409','15 P2: metodo PIX mudado para cartao nao confirma snapshot antigo');
SELECT test.assert_true(public.cash_statement((:'typef'::jsonb->>'office')::uuid,(:'typef'::jsonb->>'session')::uuid,1)->'session'->>'received_cents'='0' AND public.cash_payments_page((:'typef'::jsonb->>'office')::uuid,(:'typef'::jsonb->>'session')::uuid,1)->'items'->0 @> '{"status":"pending","payment_type":"pix"}','15 P2: conflito preserva pendencia PIX sem ledger ou reescrita');
-- Independent review P2: raw authenticated RPC dates have the same contract as API/DTO.
SELECT test.payment_fixture() AS datef \gset
SELECT test.payment_op(:'datef',3000,'card')||jsonb_build_object('settlement','settled','settled_on','2026-10-24') AS dateop \gset
RESET ROLE;
CREATE FUNCTION test.payment_bad_dates(f jsonb,op jsonb) RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$DECLARE bad jsonb;out text:='';BEGIN
 FOR bad IN SELECT value FROM jsonb_array_elements('["10000-01-01","infinity","-infinity","0000-01-01","2026-2-01","2026-02-30","24/10/2026","2026-10-24T00:00:00Z",20261024,true,{},[]]') LOOP
 out:=out||test.expect_error(format('SELECT public.payment_operate(%L,%L)',f->>'office',(op||jsonb_build_object('idempotency_key',gen_random_uuid(),'settled_on',bad))::text),'PT422','15 P2: data RPC nao canonica recusada '||bad::text)||E'\n';
 END LOOP;RETURN out;END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_bad_dates(:'datef',:'dateop');
SELECT test.assert_true(public.cash_payments_page((:'datef'::jsonb->>'office')::uuid,(:'datef'::jsonb->>'session')::uuid,1)->>'total'='0','15 P2: datas invalidas nao envenenam pagina posterior');
SELECT public.payment_operate((:'datef'::jsonb->>'office')::uuid,test.payment_op(:'datef',3000,'card')) AS datecard \gset
SELECT jsonb_build_object('kind','settle','session_id',:'datef'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'payment_id',:'datecard'::jsonb->'payments'->'items'->0->'id','evidence','Liquidacao com data canonica') AS settleop \gset
SELECT test.payment_bad_dates(:'datef',:'settleop');
SELECT test.assert_true(public.cash_payments_page((:'datef'::jsonb->>'office')::uuid,(:'datef'::jsonb->>'session')::uuid,1)->'items'->0->>'settlement'='pending','15 P2: settle invalido faz rollback e pagina segue valida');
SELECT test.assert_true(public.payment_operate((:'datef'::jsonb->>'office')::uuid,:'settleop'::jsonb||'{"settled_on":"2026-10-24"}')->'payments'->'items'->0 @> '{"settlement":"settled","settled_on":"2026-10-24"}','15 P2: settle canonico conclui depois de falhas');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true(public.cash_payments_page((:'f'::jsonb->>'office')::uuid,(:'f'::jsonb->>'session')::uuid,3)->'destinations' @> '[{"payment_type":"cash","received_cents":3000,"returned_cents":0,"fee_cents":0,"net_cents":3000},{"payment_type":"pix","received_cents":4000,"returned_cents":0,"fee_cents":0,"net_cents":4000}]','15: totais por destino nao dependem da pagina de pagamentos');
SELECT test.assert_true(public.cash_payments_page((:'f4'::jsonb->>'office')::uuid,(:'f4'::jsonb->>'session')::uuid,1)->'destinations' @> '[{"payment_type":"card","received_cents":3000,"fee_cents":150,"net_cents":2850,"settled_cents":2850}]','15: conciliacao por destino separa bruto taxa liquido liquidado');
RESET ROLE;
