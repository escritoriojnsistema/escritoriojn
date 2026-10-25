-- Disposable-only Etapa17 regression. Prior finance/payment fixtures required.
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.expenses','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.financial_transfers','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.finance17_page(uuid,uuid,integer)','EXECUTE'),'17: private ACL and anonymous RPC closed');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS f17 \gset
SELECT :'f17'::jsonb->>'office' AS office17,:'f17'::jsonb->>'session' AS session17 \gset
SELECT jsonb_build_object('kind','create','idempotency_key',gen_random_uuid(),'category','Material','payee','Fornecedor ficticio','description','Material de escritorio','due_date','2026-11-01','amount_cents',1500,'evidence','Documento manual conferido') AS create17 \gset
SELECT public.expense_operate(:'office17',:'create17') AS expense17 \gset
SELECT test.assert_true(:'expense17'::jsonb->'expense' @> '{"status":"pending","version":1,"amount_cents":1500}' AND public.expense_operate(:'office17',:'create17')=:'expense17'::jsonb,'17: expense pending and persistent idempotency');
SELECT test.expect_error(format('SELECT public.expense_operate(%L,%L)',:'office17',(:'create17'::jsonb||'{"amount_cents":1501}')::text),'PT409','17: changed idempotency payload conflicts');
SELECT jsonb_build_object('kind','pay','idempotency_key',gen_random_uuid(),'expense_id',:'expense17'::jsonb->'expense'->'id','expected_version',1,'session_id',:'session17','expected_session_version',1,'account_id',:'f17'::jsonb->'cashaccount','evidence','Pagamento manual conferido') AS pay17 \gset
SELECT test.expect_error(format('SELECT public.expense_operate(%L,%L)',:'office17',:'pay17'),'PT409','17: unapproved payable cannot be paid');
SELECT public.expense_operate(:'office17',jsonb_build_object('kind','approve','idempotency_key',gen_random_uuid(),'expense_id',:'expense17'::jsonb->'expense'->'id','expected_version',1,'evidence','Aprovacao manual de teste')) AS approved17 \gset
SELECT public.expense_operate(:'office17',:'pay17'::jsonb||'{"expected_version":2}') AS paid17 \gset
SELECT test.assert_true(:'paid17'::jsonb->'expense' @> '{"status":"paid","version":3}' AND public.expense_operate(:'office17',:'pay17'::jsonb||'{"expected_version":2}')=:'paid17'::jsonb,'17: approved expense pays exactly once');
SELECT test.assert_true(public.cash_statement(:'office17',:'session17',1)->'session' @> '{"cash_cents":8500,"received_cents":0,"version":2}','17: expense reduces cash and no revenue');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.cash_entries WHERE office_id=:'office17' AND session_id=:'session17' AND kind='expense_paid')=1 AND (SELECT coalesce(sum(applied_cents),0) FROM private.cash_entries WHERE office_id=:'office17' AND session_id=:'session17')=0,'17: one expense ledger side no allocation');
SELECT test.expect_error(format('UPDATE private.expenses SET amount_cents=1 WHERE id=%L',:'expense17'::jsonb->'expense'->>'id'),'PT403','17: paid expense immutable');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT jsonb_build_object('kind','sangria','idempotency_key',gen_random_uuid(),'session_id',:'session17','expected_session_version',2,'source_account_id',:'f17'::jsonb->'cashaccount','destination_account_id',:'f17'::jsonb->'bank','amount_cents',2000,'reason','Sangria para destino proprio','evidence','Conferencia manual do operador') AS transfer17 \gset
SELECT public.transfer_operate(:'office17',:'transfer17') AS moved17 \gset
SELECT test.assert_true(public.transfer_operate(:'office17',:'transfer17')=:'moved17'::jsonb AND public.cash_statement(:'office17',:'session17',1)->'session' @> '{"cash_cents":6500,"received_cents":0,"version":3}','17: paired sangria idempotent no revenue');
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',(:'transfer17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_session_version',3,'amount_cents',6501))::text),'PT409','17: cannot overdraw own cash');
SELECT public.transfer_operate(:'office17',:'transfer17'::jsonb||jsonb_build_object('kind','reforco','idempotency_key',gen_random_uuid(),'expected_session_version',3,'source_account_id',:'f17'::jsonb->'bank','destination_account_id',:'f17'::jsonb->'cashaccount','amount_cents',1000)) AS reinforced17 \gset
SELECT test.assert_true(public.cash_statement(:'office17',:'session17',1)->'session' @> '{"cash_cents":7500,"received_cents":0,"version":4}' AND public.finance17_page(:'office17',:'session17',1)->>'transfers_total'='2','17: reinforcement preserves funds and transfer history');
SELECT test.payment_fixture() AS rf17 \gset
SELECT public.payment_operate(:'office17',test.payment_op(:'rf17',3000)) AS receiptpaid17 \gset
SELECT :'receiptpaid17'::jsonb->'payments'->'items'->0->>'id' AS payment17 \gset
SELECT gen_random_uuid() AS receiptkey17 \gset
SELECT public.payment_receipt(:'office17',:'payment17',:'receiptkey17') AS receipt17 \gset
SELECT test.assert_true(:'receipt17'::jsonb->>'version'='1' AND :'receipt17'::jsonb->'snapshot' @> '{"amount_cents":3000,"payer_name":null,"payment_type":"cash"}' AND public.payment_receipt(:'office17',:'payment17',gen_random_uuid())=:'receipt17'::jsonb AND public.payment_receipt(:'office17',:'payment17',:'receiptkey17')=:'receipt17'::jsonb,'17: immutable numbered receipt and stable reprints');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.cash_entries WHERE office_id=:'office17' AND session_id=:'session17' AND kind IN('transfer_out','transfer_in'))=4 AND(SELECT sum(applied_cents) FROM private.cash_entries WHERE office_id=:'office17' AND session_id=:'session17')=0 AND(SELECT count(*) FROM private.expense_history WHERE expense_id=(:'expense17'::jsonb->'expense'->>'id')::uuid)=3,'17: paired ledger zero revenue and versioned expense history');
SELECT test.expect_error(format('UPDATE private.payment_receipts SET snapshot=%L WHERE payment_id=%L','{}',:'payment17'),'PT403','17: confirmed receipt snapshot immutable');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT test.expect_error(format('SELECT public.finance17_page(%L,NULL,1)',:'office17'),'PT403','17: clients excluded from internal expenses');
SELECT test.expect_error(format('SELECT public.payment_receipt(%L,%L,%L)',:'office17',:'payment17',gen_random_uuid()),'PT403','17: clients cannot read internal receipts');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.expect_error(format('SELECT public.expense_operate(%L,%L)',:'office17',(:'create17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'amount_cents',1.5))::text),'PT422','17: fractional cents rejected');
SELECT test.expect_error(format('SELECT public.expense_operate(%L,%L)',:'office17',(:'create17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'due_date','2026-02-30'))::text),'PT422','17: invalid calendar date rejected');
SELECT test.expect_error(format('SELECT public.expense_operate(%L,%L)',:'office17',(:'create17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'extra',true))::text),'PT422','17: unknown operation properties rejected');
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',(:'transfer17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_session_version',4,'source_account_id',:'f17'::jsonb->'bank','destination_account_id',:'f17'::jsonb->'bank'))::text),'PT422','17: self transfer rejected');
SELECT test.assert_true(public.cash_statement(:'office17',:'session17',1)->'session' @> '{"digital_cents":1000,"cash_cents":7500,"received_cents":0}','17: digital destination reflects internal movement without revenue');
SELECT test.payment_fixture() AS pendingrf17 \gset
SELECT public.payment_operate(:'office17',test.payment_op(:'pendingrf17',1000,'pix','pending')) AS pendingreceipt17 \gset
SELECT test.expect_error(format('SELECT public.payment_receipt(%L,%L,%L)',:'office17',:'pendingreceipt17'::jsonb->'payments'->'items'->0->>'id',gen_random_uuid()),'PT409','17: unconfirmed payment cannot issue receipt');
RESET ROLE;
-- Scope and independent grant semantics; only disposable memberships are changed.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office17','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.read_all','cash.transfer','expenses.read','expenses.pay','receipts.read'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.assert_true(public.finance17_page(:'office17',:'session17',1)->>'can_create'='false' AND public.finance17_page(:'office17',:'session17',1)->>'can_approve'='false','17: expense decisions require independent explicit capabilities');
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',(:'transfer17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_session_version',4,'amount_cents',1))::text),'PT403','17: cash read_all cannot write colleagues session');
SELECT test.assert_true(public.payment_receipt(:'office17',:'payment17',gen_random_uuid())=:'receipt17'::jsonb,'17: read_all and receipt read permit preserved reprint without issue');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office17','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.read_all','cash.transfer'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.assert_true(public.finance17_page(:'office17',:'session17',1) @> '{"total":0,"expenses":[],"can_create":false,"can_approve":false,"can_pay":false,"can_transfer":true}','17: transfer-only membership receives no expense data');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true(public.finance17_page(:'office17',NULL,1)->>'accounts_total'='0','17: no session exposes no account options');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action IN('expenses.create','expenses.approve','expenses.pay','cash.transferred','receipts.issued') AND changes::text ~ 'Fornecedor|Documento|Conferencia|Material') AND(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.expenses'::regclass,'private.expense_history'::regclass,'private.financial_transfers'::regclass,'private.payment_receipts'::regclass)),'17: audit excludes free text and all new relations enforce RLS');
-- Mid-transaction failure must roll back both transfer sides, command, session and audit.
CREATE FUNCTION test.fail_transfer17() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.kind='transfer_in' AND NEW.session_id::text=current_setting('test.fail_transfer17',true) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END $$;
CREATE TRIGGER test_fail_transfer17 BEFORE INSERT ON private.cash_entries FOR EACH ROW EXECUTE FUNCTION test.fail_transfer17();
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT set_config('test.fail_transfer17',:'session17',false);
SELECT :'transfer17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_session_version',4,'amount_cents',1) AS failedtransfer17 \gset
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',:'failedtransfer17'),'PT409','17: failure on second ledger side rolls back operation');
RESET ROLE;
DROP TRIGGER test_fail_transfer17 ON private.cash_entries;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_commands WHERE office_id=:'office17' AND idempotency_key=(:'failedtransfer17'::jsonb->>'idempotency_key')::uuid) AND(SELECT version FROM private.cash_sessions WHERE id=:'session17')=4 AND(SELECT count(*) FROM private.cash_entries WHERE session_id=:'session17' AND kind IN('transfer_in','transfer_out'))=4,'17: failed transfer leaves no command no side and no version increment');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.correction_sources(:'office17',(:'rf17'::jsonb->>'session')::uuid,'reverse','',1)->'items'->0 AS receiptsource17 \gset
SELECT public.correction_operate(:'office17',jsonb_build_object('kind','reverse','session_id',:'rf17'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'allocation_id',:'receiptsource17'::jsonb->'allocation_id','refund_now',false,'amount_cents',1000,'reason','Estorno apos recibo emitido','evidence','Conferencia manual posterior17'));
SELECT test.assert_true(public.payment_receipt(:'office17',:'payment17',gen_random_uuid())=:'receipt17'::jsonb,'17: later reversal preserves original numbered receipt snapshot');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000156","session_id":"00000000-0000-4000-c000-000000000156"}';
SELECT test.expect_error(format('SELECT public.payment_receipt(%L,%L,%L)','00000000-0000-4000-e000-000000000156',:'payment17',gen_random_uuid()),'PT404','17: another office cannot retrieve receipt by known payment ID');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM test.finance17_audit_before b LEFT JOIN private.audit_reports r USING(id) WHERE r.id IS NULL OR r.renderer_version<>b.renderer_version OR r.contract_version<>b.contract_version OR r.created_at<>b.created_at),'17: previous report renderer snapshots unchanged');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.audit_report_begin(:'office17','',NULL,NULL,NULL,'recent',gen_random_uuid()) AS audit17 \gset
SELECT test.assert_true(:'audit17'::jsonb->>'renderer_version'='4' AND public.audit_report_reference(:'office17',(:'audit17'::jsonb->>'id')::uuid)->>'renderer_version'='4','17: new audit report persists presentation4');
RESET ROLE;
-- Card gross is never a spendable balance before settlement; fees remain office cost.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS cardf17 \gset
SELECT public.payment_operate(:'office17',test.payment_op(:'cardf17',1000,'card','confirmed')||'{"fee_cents":100}') AS cardpaid17 \gset
SELECT jsonb_build_object('kind','reforco','idempotency_key',gen_random_uuid(),'session_id',:'cardf17'::jsonb->'session','expected_session_version',2,'source_account_id',:'cardf17'::jsonb->'bank','destination_account_id',:'cardf17'::jsonb->'cashaccount','amount_cents',1,'reason','Reforco apos liquidacao de cartao','evidence','Conferencia de liquidacao local17') AS cardtransfer17 \gset
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',:'cardtransfer17'),'PT409','17: unsettled card gross is not spendable');
SELECT public.payment_operate(:'office17',jsonb_build_object('kind','settle','session_id',:'cardf17'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'payment_id',:'cardpaid17'::jsonb->'payments'->'items'->0->'id','settled_on','2026-10-25','evidence','Liquidacao manual conferida17'));
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',(:'cardtransfer17'::jsonb||'{"expected_session_version":2,"amount_cents":901}')::text),'PT409','17: settled card fee cannot be spent as funds');
SELECT public.transfer_operate(:'office17',:'cardtransfer17'::jsonb||'{"expected_session_version":2,"amount_cents":900}');
SELECT test.assert_true(public.cash_statement(:'office17',(:'cardf17'::jsonb->>'session')::uuid,1)->'session' @> '{"cash_cents":10900,"received_cents":1000,"version":3}','17: only settled net900 can reinforce cash gross revenue preserved');
RESET ROLE;
-- Review17 regression: UI/API require current cash.open even after the session was opened.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS rightsf17 \gset
SELECT public.team_set_member(:'office17','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.open','expenses.read','expenses.pay','cash.transfer'],gen_random_uuid());
SELECT public.expense_operate(:'office17',:'create17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid())) AS rightse17 \gset
SELECT public.expense_operate(:'office17',jsonb_build_object('kind','approve','idempotency_key',gen_random_uuid(),'expense_id',:'rightse17'::jsonb->'expense'->'id','expected_version',1,'evidence','Aprovacao antes da perda de permissao17'));
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT public.cash_open(:'office17',(:'rightsf17'::jsonb->>'unit')::uuid,(:'rightsf17'::jsonb->>'cashaccount')::uuid,10000,gen_random_uuid()) AS rightsopened17 \gset
SELECT x->>'id' AS rightssession17 FROM jsonb_array_elements(:'rightsopened17'::jsonb->'sessions') x WHERE x->>'unit_id'=:'rightsf17'::jsonb->>'unit' \gset
SELECT jsonb_build_object('kind','sangria','idempotency_key',gen_random_uuid(),'session_id',:'rightssession17','expected_session_version',1,'source_account_id',:'rightsf17'::jsonb->'cashaccount','destination_account_id',:'rightsf17'::jsonb->'bank','amount_cents',1,'reason','Movimento antes da revogacao17','evidence','Conferencia autorizada local17') AS rightsop17 \gset
SELECT public.transfer_operate(:'office17',:'rightsop17');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office17','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','expenses.read','expenses.pay','cash.transfer'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',:'rightsop17'),'PT403','17 review: revoked cash.open denies transfer replay');
SELECT test.expect_error(format('SELECT public.transfer_operate(%L,%L)',:'office17',(:'rightsop17'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_session_version',2))::text),'PT403','17 review: revoked cash.open denies new transfer');
SELECT test.expect_error(format('SELECT public.expense_operate(%L,%L)',:'office17',jsonb_build_object('kind','pay','idempotency_key',gen_random_uuid(),'expense_id',:'rightse17'::jsonb->'expense'->'id','expected_version',2,'session_id',:'rightssession17','expected_session_version',2,'account_id',:'rightsf17'::jsonb->'cashaccount','evidence','Pagamento depois da revogacao17')::text),'PT403','17 review: revoked cash.open denies expense payment');
RESET ROLE;
