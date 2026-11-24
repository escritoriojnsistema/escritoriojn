BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';

SELECT test.payment_fixture() AS fixture \\gset
SELECT jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,
  'name','Boleto manual fictício','active',true,'type','boleto','unit_id',(:'fixture'::jsonb)->'unit',
  'destination_account_id',(:'fixture'::jsonb)->'bank') AS method, gen_random_uuid() AS key \\gset
SELECT public.cash_configure((:'fixture'::jsonb->>'office')::uuid,:'method',:'key') AS configured \\gset
SELECT test.assert_true(public.cash_configure((:'fixture'::jsonb->>'office')::uuid,:'method',:'key')=:'configured'::jsonb,
  'boleto manual: retry não duplica cadastro');
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())',:'fixture'::jsonb->>'office',
  (:'method'::jsonb||jsonb_build_object('destination_account_id',:'fixture'::jsonb->'cashaccount'))),'PT409',
  'boleto manual: destino em espécie recusado');
SELECT public.cash_configure((:'fixture'::jsonb->>'office')::uuid,jsonb_build_object('kind','account','id',NULL,
  'expected_version',NULL,'name','Carteira para teste de boleto','active',true,'type','digital',
  'unit_id',:'fixture'::jsonb->'unit'),gen_random_uuid())->'resource'->>'id' AS wallet \\gset
SELECT test.expect_error(format('SELECT public.cash_configure(%L,%L,gen_random_uuid())',:'fixture'::jsonb->>'office',
  (:'method'::jsonb||jsonb_build_object('destination_account_id',:'wallet'))),'PT409',
  'boleto manual: carteira digital recusada');
SELECT test.assert_true(public.cash_configuration((:'fixture'::jsonb->>'office')::uuid,
  (:'fixture'::jsonb->>'unit')::uuid,1,50)->'payment_methods' @> jsonb_build_array(:'configured'::jsonb->'resource'),
  'boleto manual: a configuração da unidade expõe o novo meio');
SELECT test.payment_op(:'fixture'::jsonb||jsonb_build_object('boleto',:'configured'::jsonb->'resource'->'id'),3000,'boleto')
  ||'{"external_reference":"boleto-teste"}' AS operation \\gset
SELECT public.payment_operate((:'fixture'::jsonb->>'office')::uuid,:'operation') AS paid \\gset
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
