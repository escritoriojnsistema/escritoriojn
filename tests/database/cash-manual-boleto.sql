BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';

SELECT test.payment_fixture() AS fixture \gset
SELECT jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,
  'name','Boleto manual fictício','active',true,'type','boleto','unit_id',(:'fixture'::jsonb)->'unit',
  'destination_account_id',(:'fixture'::jsonb)->'bank') AS method, gen_random_uuid() AS key \gset
SELECT public.cash_configure((:'fixture'::jsonb->>'office')::uuid,:'method',:'key') AS configured \gset
SELECT test.assert_true(public.cash_configure((:'fixture'::jsonb->>'office')::uuid,:'method',:'key')=:'configured'::jsonb,
  'boleto manual: retry não duplica cadastro');
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())',:'fixture'::jsonb->>'office',
  (:'method'::jsonb||jsonb_build_object('destination_account_id',:'fixture'::jsonb->'cashaccount'))),'PT409',
  'boleto manual: destino em espécie recusado');
SELECT public.cash_configure((:'fixture'::jsonb->>'office')::uuid,jsonb_build_object('kind','account','id',NULL,
  'expected_version',NULL,'name','Carteira para teste de boleto','active',true,'type','digital',
  'unit_id',:'fixture'::jsonb->'unit'),gen_random_uuid())->'resource'->>'id' AS wallet \gset
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())',:'fixture'::jsonb->>'office',
  (:'method'::jsonb||jsonb_build_object('destination_account_id',:'wallet'))),'PT409',
  'boleto manual: carteira digital recusada');
SELECT test.assert_true(public.cash_configuration((:'fixture'::jsonb->>'office')::uuid,
  (:'fixture'::jsonb->>'unit')::uuid,1,50)->'payment_methods' @> jsonb_build_array(:'configured'::jsonb->'resource'),
  'boleto manual: a configuração da unidade expõe o novo meio');
SELECT test.payment_op(:'fixture'::jsonb||jsonb_build_object('boleto',:'configured'::jsonb->'resource'->'id'),3000,'boleto')
  ||'{"external_reference":"boleto-teste"}' AS operation \gset
SELECT public.payment_operate((:'fixture'::jsonb->>'office')::uuid,:'operation') AS paid \gset
SELECT test.assert_true(:'paid'::jsonb->'session' @> '{"cash_cents":10000,"digital_cents":3000,"received_cents":3000}'
  AND :'paid'::jsonb->'payments'->'items' @> '[{"payment_type":"boleto","status":"confirmed","amount_cents":3000}]',
  'boleto manual: crédito confirmado fica separado do fundo em espécie');
SELECT test.assert_true(public.payment_operate((:'fixture'::jsonb->>'office')::uuid,:'operation')=:'paid'::jsonb
  AND public.charges_view((:'fixture'::jsonb->>'office')::uuid,(:'fixture'::jsonb->'charges'->0->>'request_id')::uuid,1)
    ->'charge' @> '{"allocated_cents":3000,"balance_cents":7000}',
  'boleto manual: retry conserva alocação única e saldo da cobrança');
SELECT test.assert_true(public.closure_state((:'fixture'::jsonb->>'office')::uuid,
  (:'fixture'::jsonb->>'session')::uuid,1,1)->'groups' @> '[{"payment_type":"boleto","expected_cents":3000}]',
  'boleto manual: fechamento identifica o crédito bancário');
SELECT test.assert_true(public.finance_report_page((:'fixture'::jsonb->>'office')::uuid,
  test.report_filter19()||jsonb_build_object('payment_type','boleto','unit_id',:'fixture'::jsonb->'unit'),1)
  ->'summary' @> '{"received_cents":3000}',
  'boleto manual: filtro do relatório encontra somente o recebimento da unidade');
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS fixture \gset
SELECT :'fixture'::jsonb->>'office' AS office, :'fixture'::jsonb->>'unit' AS unit,
  :'fixture'::jsonb->>'session' AS physical \gset
SELECT public.closure_operate(:'office',jsonb_build_object(
  'kind','close','session_id',:'physical','expected_version',1,'idempotency_key',gen_random_uuid(),
  'reason','Fechar sessão em espécie para o teste',
  'counts',jsonb_build_array(jsonb_build_object('key','cash:'||(:'fixture'::jsonb->>'cashaccount'),'counted_cents',10000))))
  ->'statement'->'session'->>'status' AS physical_closed \gset
SELECT test.assert_true(:'physical_closed'='closed','sessão em espécie preserva fechamento');
SELECT test.expect_error(format('SELECT public.cash_open(%L,%L,NULL,1,gen_random_uuid())',:'office',:'unit'),
 'PT422','sessão sem espécie recusa fundo inicial positivo');
SELECT gen_random_uuid() AS opening_key \gset
SELECT public.cash_open(:'office',:'unit',NULL,0,:'opening_key') AS opening \gset
SELECT :'opening'::jsonb->'sessions'->0->>'id' AS digital \gset
SELECT test.assert_true(:'opening'::jsonb->'sessions'->0 @> '{"status":"open","cash_account_id":null,"opening_cents":0}'
  AND public.cash_open(:'office',:'unit',NULL,0,:'opening_key')=:'opening'::jsonb,
  'sessão sem espécie abre sem fundo e repete a mesma operação');
SELECT test.assert_true(public.closure_state(:'office',:'digital',1,1)->'groups'='[]'::jsonb,
  'sessão sem movimentação tem conferência vazia');
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'office',
  test.payment_op(:'fixture'::jsonb||jsonb_build_object('session',:'digital'),1000,'cash')),
  'PT409','sessão sem espécie recusa pagamento em espécie');
SELECT public.payment_operate(:'office',
  test.payment_op(:'fixture'::jsonb||jsonb_build_object('session',:'digital'),3000,'pix')) AS paid \gset
SELECT test.assert_true(:'paid'::jsonb->'session' @> '{"cash_account_id":null,"cash_cents":0,"digital_cents":3000,"received_cents":3000}',
  'Pix manual na sessão sem espécie reduz a cobrança e mantém fundo zero');
SELECT public.payment_operate(:'office',
  test.payment_op(:'fixture'::jsonb||jsonb_build_object('session',:'digital'),2000,'card')
  ||'{"expected_version":2,"fee_cents":90,"external_reference":"NSU-teste"}') AS card_paid \gset
SELECT test.assert_true(:'card_paid'::jsonb->'payments'->'items' @>
  '[{"payment_type":"card","status":"confirmed","amount_cents":2000,"fee_cents":90}]',
  'cartão avulso registra o valor bruto e a taxa na sessão sem espécie');
SELECT public.cash_configure(:'office',jsonb_build_object('kind','payment_method','id',NULL,
  'expected_version',NULL,'name','Boleto para caixa digital','active',true,'type','boleto','unit_id',:'unit',
  'destination_account_id',:'fixture'::jsonb->'bank'),gen_random_uuid())->'resource'->>'id' AS boleto \gset
SELECT public.payment_operate(:'office',
  test.payment_op(:'fixture'::jsonb||jsonb_build_object('session',:'digital','boleto',:'boleto'),5000,'boleto')
  ||'{"expected_version":3,"external_reference":"boleto-teste"}') AS boleto_paid \gset
SELECT test.assert_true(:'boleto_paid'::jsonb->'session' @> '{"cash_cents":0,"digital_cents":10000,"received_cents":10000}',
  'boleto manual completa a cobrança na sessão sem espécie');
SELECT public.closure_state(:'office',:'digital',1,1)->'groups' AS groups \gset
SELECT test.assert_true(jsonb_array_length(:'groups'::jsonb)=3 AND :'groups'::jsonb @>
  '[{"payment_type":"pix","expected_cents":3000},{"payment_type":"card","expected_cents":2000},{"payment_type":"boleto","expected_cents":5000}]',
  'fechamento da sessão sem espécie confere apenas os três meios usados');
SELECT test.assert_true(public.closure_operate(:'office',jsonb_build_object(
  'kind','close','session_id',:'digital','expected_version',4,'idempotency_key',gen_random_uuid(),
  'reason','Meios digitais conferidos',
  'counts',(SELECT jsonb_agg(jsonb_build_object('key',g->'key','counted_cents',g->'expected_cents')) FROM jsonb_array_elements(:'groups'::jsonb) g)))
  ->'statement'->'session' @> '{"status":"closed","cash_cents":0}',
  'sessão sem espécie fecha normalmente após conferência digital');
SELECT public.cash_open(:'office',:'unit',NULL,0,gen_random_uuid())->'sessions'->0->>'id' AS empty_digital \gset
SELECT test.assert_true(public.closure_operate(:'office',jsonb_build_object(
  'kind','close','session_id',:'empty_digital','expected_version',1,'idempotency_key',gen_random_uuid(),
  'reason','Encerrar caixa sem recebimentos','counts','[]'::jsonb))->'statement'->'session'->>'status'='closed',
  'sessão sem espécie pode fechar sem recebimentos');
ROLLBACK;
