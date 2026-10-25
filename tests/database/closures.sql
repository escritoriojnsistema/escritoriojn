-- Disposable PostgreSQL only; 1–17 have already run, then migration18 activates.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.closure_state(uuid,uuid,integer,integer)') IS NOT NULL,'18: closure RPC exists');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.cash_closures','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.cash_closure_reviews','SELECT,INSERT,UPDATE,DELETE') AND(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.cash_closures'::regclass,'private.cash_closure_reviews'::regclass)),'18: closed private ACL and RLS');
SELECT test.assert_true(NOT has_function_privilege('anon','public.closure_state(uuid,uuid,integer,integer)','EXECUTE') AND NOT has_function_privilege('service_role','public.closure_operate(uuid,jsonb)','EXECUTE') AND NOT has_function_privilege('authenticated','private.closure_groups18(private.cash_sessions)','EXECUTE') AND NOT has_function_privilege('authenticated','private.cash_operate_before18(uuid,jsonb)','EXECUTE') AND NOT EXISTS(SELECT FROM pg_proc WHERE oid IN('public.closure_state(uuid,uuid,integer,integer)'::regprocedure,'public.closure_record(uuid,uuid)'::regprocedure,'public.closure_operate(uuid,jsonb)'::regprocedure) AND prosecdef),'18: public invoker wrappers authenticated only and helpers closed');
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE permission_code IN('cash.closure.approve','cash.closure.adjust') AND role_code='owner')=2 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE permission_code IN('cash.closure.approve','cash.closure.adjust') AND role_code<>'owner'),'18: independent capabilities seed owner only');
CREATE FUNCTION test.closure_op(f jsonb,k text DEFAULT 'close',delta_cash bigint DEFAULT 0,delta_digital bigint DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE st jsonb;BEGIN
 st:=public.closure_state((f->>'office')::uuid,(f->>'session')::uuid,1,1);
 RETURN jsonb_build_object('kind',k,'session_id',f->'session','expected_version',st->'session_version','idempotency_key',gen_random_uuid(),'reason','Conferencia privada sintetica18','counts',(SELECT jsonb_agg(jsonb_build_object('key',g->>'key','counted_cents',(g->>'expected_cents')::bigint+CASE WHEN g->>'payment_type'='cash' THEN delta_cash ELSE delta_digital END)) FROM jsonb_array_elements(st->'groups')g));
END $$;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS f18 \gset
SELECT :'f18'::jsonb->>'office' AS office18,:'f18'::jsonb->>'session' AS session18 \gset
SELECT test.assert_true(public.cash_statement(:'office18',:'session18',1)->>'closures_enabled'='true' AND public.closure_state(:'office18',:'session18',1,1) @> '{"can_record":true,"can_adjust":true,"records":[],"total":0,"groups":[{"payment_type":"cash","expected_cents":10000}]}','18: feature active own empty session cash group always present');
SELECT public.payment_operate(:'office18',test.payment_op(:'f18',3000)||'{"presented_cents":5000}');
SELECT public.payment_operate(:'office18',test.payment_op(:'f18',4000,'pix')||'{"expected_version":2}');
SELECT public.closure_state(:'office18',:'session18',1,1) AS state18 \gset
SELECT test.assert_true(jsonb_array_length(:'state18'::jsonb->'groups')=2 AND :'state18'::jsonb->'groups' @> '[{"payment_type":"cash","expected_cents":13000,"received_cents":3000,"returned_cents":0},{"payment_type":"pix","expected_cents":4000,"fee_cents":0,"net_cents":4000}]','18: fundo100 servico30 apresentado50 troco20 equals130 and PIX40 separate');
SELECT test.closure_op(:'f18','close',100,-100) AS close18 \gset
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||'{"extra":true}')::text),'PT422','18: extra operation properties denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||'{"counts":[]}')::text),'PT422','18: exhaustive groups required');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||jsonb_build_object('counts',jsonb_build_array(:'close18'::jsonb->'counts'->0,:'close18'::jsonb->'counts'->0)))::text),'PT422','18: duplicate group keys denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||jsonb_build_object('counts',jsonb_build_array(jsonb_build_object('key','cash:ffffffff-ffff-4fff-afff-ffffffffffff','counted_cents',1),:'close18'::jsonb->'counts'->1)))::text),'PT422','18: foreign group key denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',jsonb_set(:'close18'::jsonb,'{counts,0,counted_cents}','-1')::text),'PT422','18: physical negative count denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',jsonb_set(:'close18'::jsonb,'{counts,0,counted_cents}','1.5')::text),'PT422','18: fractional count denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||'{"expected_version":1}')::text),'PT409','18: expected session version under lock');
SELECT test.expect_error(format('SELECT public.cash_operate(%L,%L)',:'office18',jsonb_build_object('kind','close','session_id',:'session18','expected_version',3,'idempotency_key',gen_random_uuid(),'counted_cents',13000,'reason','Tentativa sem grupos digitais')::text),'PT409','18: new legacy close cannot bypass digital counts');
SELECT public.closure_operate(:'office18',:'close18') AS result18 \gset
SELECT :'result18'::jsonb->'record'->>'id' AS record18 \gset
SELECT test.assert_true(:'result18'::jsonb->'statement'->'session' @> '{"status":"closed","version":4,"cash_cents":13000,"digital_cents":4000}' AND :'result18'::jsonb->'record' @> '{"kind":"close","version":1,"has_difference":true,"differences_count":2,"absolute_difference_cents":200,"review":null,"can_review":true}','18: compensated differences remain two pending lines absolute200');
SELECT test.assert_true((SELECT sum((g->>'difference_cents')::bigint)=0 FROM jsonb_array_elements(:'result18'::jsonb->'record'->'groups')g) AND public.closure_operate(:'office18',:'close18')=:'result18'::jsonb,'18: zero sum never hides differences and replay after close is stable');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||'{"reason":"Outra razao da mesma chave"}')::text),'PT409','18: key payload collision denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'close18'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'expected_version',4))::text),'PT409','18: new command after close denied');
SELECT test.payment_op(:'f18',1)||'{"expected_version":4}' AS closedpayment18 \gset
SELECT test.expect_error(format('SELECT public.payment_operate(%L,%L)',:'office18',:'closedpayment18'),'PT409','18: close prevents future payment');
SELECT jsonb_build_object('kind','review','session_id',:'session18','expected_version',4,'idempotency_key',gen_random_uuid(),'record_id',:'record18','expected_record_version',1,'decision','approve','reason','Revisao privada conferida18') AS review18 \gset
SELECT public.team_set_member(:'office18','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.read_all','cash.open'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.assert_true(public.closure_record(:'office18',:'record18')->>'can_review'='false' AND public.closure_state(:'office18',:'session18',1,1) @> '{"can_record":false,"can_adjust":false,"sources":[]}','18: read_all reads colleague only without operation authority');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',:'review18'),'PT403','18: admin without explicit review capability denied');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',:'close18'),'PT403','18: read_all cannot replay colleagues own operation');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.closure_operate(:'office18',:'review18') AS reviewed18 \gset
SELECT test.assert_true(:'reviewed18'::jsonb->'record' @> '{"version":2,"has_difference":true,"differences_count":2,"absolute_difference_cents":200,"can_review":false,"review":{"decision":"approve","reason":"Revisao privada conferida18"}}' AND :'reviewed18'::jsonb->'record'->'groups'=:'result18'::jsonb->'record'->'groups' AND public.closure_operate(:'office18',:'review18')=:'reviewed18'::jsonb,'18: append-only review1 to2 preserves original counts and replay');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'review18'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'decision','reject'))::text),'PT409','18: second review decision denied');
SELECT public.cash_open(:'office18',(:'f18'::jsonb->>'unit')::uuid,(:'f18'::jsonb->>'cashaccount')::uuid,1000,gen_random_uuid())->'sessions'->0->>'id' AS target18 \gset
SELECT test.assert_true(public.closure_state(:'office18',:'target18',1,1)->'sources' @> jsonb_build_array(jsonb_build_object('id',:'record18')),'18: own prior close same unit is explicit adjustment source');
SELECT jsonb_build_object('kind','adjust','session_id',:'target18','expected_version',1,'idempotency_key',gen_random_uuid(),'reason','Ajuste privado de conferencia18','source_id',:'record18','counts',(SELECT jsonb_agg(jsonb_build_object('key',g->>'key','counted_cents',g->'expected_cents')) FROM jsonb_array_elements(:'result18'::jsonb->'record'->'groups')g)) AS adjust18 \gset
SELECT public.closure_operate(:'office18',:'adjust18') AS adjusted18 \gset
SELECT test.assert_true(:'adjusted18'::jsonb->'record' @> '{"kind":"adjust","has_difference":false,"differences_count":0,"absolute_difference_cents":0}' AND :'adjusted18'::jsonb->'record'->>'source_id'=:'record18' AND :'adjusted18'::jsonb->'statement'->'session' @> '{"status":"open","version":1,"cash_cents":1000}' AND public.closure_operate(:'office18',:'adjust18')=:'adjusted18'::jsonb,'18: adjustment links original snapshot no target funds or version change');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'adjust18'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'session_id',:'session18','expected_version',4))::text),'PT409','18: adjustment cannot reopen original session');
SELECT test.payment_fixture() AS differentunit18 \gset
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'adjust18'::jsonb||jsonb_build_object('idempotency_key',gen_random_uuid(),'session_id',:'differentunit18'::jsonb->'session'))::text),'PT409','18: adjustment requires original financial unit');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM private.cash_entries WHERE session_id=:'target18')=0 AND(SELECT status='closed' AND version=4 FROM private.cash_sessions WHERE id=:'session18') AND(SELECT groups=(:'result18'::jsonb->'record'->'groups') FROM private.cash_closures WHERE id=:'record18'),'18: original closure and ledger unchanged after adjustment');
SELECT test.expect_error(format('UPDATE private.cash_closures SET reason=%L WHERE id=%L','Alteracao proibida',:'record18'),'PT403','18: closure snapshot immutable');
SELECT test.expect_error(format('DELETE FROM private.cash_closure_reviews WHERE record_id=%L',:'record18'),'PT403','18: review decision immutable');
SELECT test.expect_error(format('INSERT INTO private.cash_closures SELECT * FROM private.cash_closures WHERE id=%L',:'record18'),'PT403','18: raw insertion without unfinished command denied');
SELECT test.expect_error('SELECT private.closure_safe18(9007199254740992)','PT409','18: unsafe monetary aggregate explicitly rejected');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'cash.closure_%' AND changes::text ~ 'privad|Conferencia|counts|reason') AND EXISTS(SELECT FROM public.audit_events WHERE action='cash.closure_adjusted') AND EXISTS(SELECT FROM public.audit_events WHERE action='cash.closure_reviewed'),'18: new real audit producers exclude reasons counts and PII');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
-- One existing ledger only: cash expense/sangria/refund affect cash once; digital movements transfer group.
SELECT test.correction_fixture('cash') AS money18 \gset
SELECT public.correction_operate(:'office18',test.correction_op(:'money18',1000,false));
SELECT test.assert_true(public.closure_state(:'office18',(:'money18'::jsonb->>'session')::uuid,1,1)->'groups' @> '[{"payment_type":"cash","expected_cents":16000,"returned_cents":0}]','18: logical reversal has zero funds effect');
SELECT public.correction_sources(:'office18',(:'money18'::jsonb->>'session')::uuid,'refund','',1)->'items'->0->>'reversal_id' AS reversal18 \gset
SELECT public.correction_operate(:'office18',jsonb_build_object('kind','refund','session_id',:'money18'::jsonb->'session','expected_version',3,'idempotency_key',gen_random_uuid(),'reversal_id',:'reversal18','amount_cents',1000,'reason','Devolucao manual conferida18','evidence','Comprovante manual sintetico18'));
SELECT public.transfer_operate(:'office18',jsonb_build_object('kind','sangria','session_id',:'money18'::jsonb->'session','expected_session_version',4,'idempotency_key',gen_random_uuid(),'source_account_id',:'money18'::jsonb->'cashaccount','destination_account_id',:'money18'::jsonb->'bank','amount_cents',2000,'reason','Sangria manual conferida18','evidence','Comprovante manual sintetico18'));
SELECT public.expense_operate(:'office18',jsonb_build_object('kind','create','idempotency_key',gen_random_uuid(),'category','Material','payee','Fornecedor local18','description','Descricao da despesa18','due_date','2026-11-01','amount_cents',500,'evidence','Comprovante de despesa18'))->'expense'->>'id' AS expense18 \gset
SELECT public.expense_operate(:'office18',jsonb_build_object('kind','approve','idempotency_key',gen_random_uuid(),'expense_id',:'expense18','expected_version',1,'evidence','Aprovacao manual conferida18'));
SELECT public.expense_operate(:'office18',jsonb_build_object('kind','pay','idempotency_key',gen_random_uuid(),'expense_id',:'expense18','expected_version',2,'session_id',:'money18'::jsonb->'session','expected_session_version',5,'account_id',:'money18'::jsonb->'bank','evidence','Pagamento manual conferido18'));
SELECT test.assert_true(public.closure_state(:'office18',(:'money18'::jsonb->>'session')::uuid,1,1)->'groups' @> '[{"payment_type":"cash","expected_cents":13000,"returned_cents":3000},{"payment_type":"transfer","expected_cents":1500,"received_cents":2000,"returned_cents":500}]','18: refunds sangria and digital expenses exactly once separated from revenue');
SELECT test.correction_fixture('card') AS card18 \gset
SELECT public.correction_operate(:'office18',test.correction_op(:'card18',1000,true));
SELECT test.assert_true(public.closure_state(:'office18',(:'card18'::jsonb->>'session')::uuid,1,1)->'groups' @> '[{"payment_type":"card","expected_cents":5000,"received_cents":6000,"returned_cents":1000,"fee_cents":300,"net_cents":4700,"settled_cents":0,"pending_cents":5700}]','18: card expected gross less actual refunds fee separate pending credit ignores refund');
SELECT public.payment_operate(:'office18',jsonb_build_object('kind','settle','session_id',:'card18'::jsonb->'session','expected_version',3,'idempotency_key',gen_random_uuid(),'payment_id',:'card18'::jsonb->'payment','evidence','Liquidacao manual sintetica18','settled_on','2026-10-25'));
SELECT test.assert_true(public.closure_state(:'office18',(:'card18'::jsonb->>'session')::uuid,1,1)->'groups' @> '[{"payment_type":"card","expected_cents":5000,"fee_cents":300,"net_cents":4700,"settled_cents":5700,"pending_cents":0}]','18: settled card credits informative no second deduction');
-- Pagination: exhaustive totals, snapshots remain fetchable after dropping off the first page.
SELECT set_config('test.office18',:'office18',false),set_config('test.target18',:'target18',false);
DO $$DECLARE n int;f jsonb:=jsonb_build_object('office',current_setting('test.office18'),'session',current_setting('test.target18'));BEGIN FOR n IN 1..6 LOOP PERFORM public.closure_operate((f->>'office')::uuid,test.closure_op(f,'reconcile'));END LOOP;END $$;
SELECT test.assert_true(public.closure_state(:'office18',:'target18',1,1) @> '{"total":7,"page_size":5,"page":1}' AND jsonb_array_length(public.closure_state(:'office18',:'target18',1,1)->'records')=5 AND jsonb_array_length(public.closure_state(:'office18',:'target18',2,1)->'records')=2 AND public.closure_record(:'office18',(:'adjusted18'::jsonb->'record'->>'id')::uuid)->>'kind'='adjust','18: paginated full snapshots and direct historical detail');
SELECT test.assert_true(public.closure_operate(:'office18',:'adjust18')->'statement'->'session' @> '{"version":7,"status":"open"}', '18: replay returns current statement after later session mutations');
SELECT public.closure_operate(:'office18',test.closure_op(jsonb_build_object('office',:'office18','session',:'target18')));
SELECT test.assert_true(public.closure_operate(:'office18',:'adjust18')->'statement'->'session' @> '{"version":8,"status":"closed","can_operate":false}', '18: retry after another close cannot show target open or old version');
SELECT test.expect_error(format('SELECT public.closure_state(%L,%L,0,1)',:'office18',:'target18'),'PT422','18: invalid pagination rejected');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000154","session_id":"00000000-0000-4000-c000-000000000154"}';
SELECT test.expect_error(format('SELECT public.closure_state(%L,%L,1,1)',:'office18',:'session18'),'PT403','18: client excluded from closure state');
SELECT test.expect_error(format('SELECT public.closure_record(%L,%L)',:'office18',:'record18'),'PT403','18: client excluded from closure detail');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000156","session_id":"00000000-0000-4000-c000-000000000156"}';
SELECT test.expect_error(format('SELECT public.closure_state(%L,%L,1,1)','00000000-0000-4000-e000-000000000156',:'session18'),'PT404','18: another office cannot see closure session');
SELECT test.expect_error(format('SELECT public.closure_record(%L,%L)','00000000-0000-4000-e000-000000000156',:'record18'),'PT404','18: another office cannot retrieve known closure');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.audit_report_begin(:'office18','',NULL,NULL,NULL,'recent',gen_random_uuid()) AS audit18 \gset
SELECT test.assert_true(:'audit18'::jsonb->>'renderer_version'='5','18: new audit report default renderer5');
RESET ROLE;
-- Historical result and aliases preserved, including reports already rendered as1–4.
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM test.closure_aliases_before18 b JOIN pg_proc p ON p.oid=b.oid WHERE md5(p.prosrc)<>b.hash),'18: all frozen aliases and wrapped17 bodies byte equal');
SELECT test.assert_true(NOT EXISTS(SELECT FROM test.closure_reports_before18 b LEFT JOIN private.audit_reports r USING(id) WHERE r.id IS NULL OR to_jsonb(r)<>b.snapshot),'18: audit reports1 through4 immutable after default5');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true((SELECT public.cash_operate('00000000-0000-4000-e000-000000000151',op)=result FROM test.closure_saved18),'18: authorized saved legacy close replay exact result');
SELECT test.assert_true((SELECT public.closure_state('00000000-0000-4000-e000-000000000151',(op->>'session_id')::uuid,1,1) @> '{"status":"closed","records":[],"total":0}' FROM test.closure_saved18),'18: pre18 session has empty closure history no invented snapshot');
RESET ROLE;
-- Simulate one unknown legacy header only inside a rolled-back disposable transaction.
BEGIN;
ALTER TABLE private.payments DISABLE TRIGGER payments_immutable;
UPDATE private.payments SET legacy=true,fee_cents=NULL,settlement='unknown',settled_on=NULL WHERE id=(:'card18'::jsonb->>'payment')::uuid;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.assert_true(public.closure_state(:'office18',(:'card18'::jsonb->>'session')::uuid,1,1)->'groups' @> '[{"payment_type":"card","expected_cents":5000,"fee_cents":null,"net_cents":null,"settled_cents":null,"pending_cents":null}]','18: legacy unknown fee and credits remain null never zero');
ROLLBACK;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS rejectedf18 \gset
SELECT public.closure_operate(:'office18',test.closure_op(:'rejectedf18','close',1)) AS rejectedr18 \gset
SELECT jsonb_build_object('kind','review','session_id',:'rejectedf18'::jsonb->'session','expected_version',2,'idempotency_key',gen_random_uuid(),'record_id',:'rejectedr18'::jsonb->'record'->'id','expected_record_version',1,'decision','reject','reason','Revisao rejeitada com evidencia18') AS reject18 \gset
SELECT public.team_set_member(:'office18','00000000-0000-4000-b000-000000000153','employee',true,ARRAY['foundation.access','cash.read','cash.read_all','cash.closure.approve','cash.closure.adjust','cash.open'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',:'reject18'),'PT403','18: employee with capability still cannot review');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office18','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.closure.approve'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',:'reject18'),'PT403','18: administrator review of colleague additionally needs read_all');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office18','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.read_all','cash.closure.approve'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.assert_true(public.closure_operate(:'office18',:'reject18')->'record' @> '{"version":2,"has_difference":true,"review":{"decision":"reject"}}','18: authorized admin reject preserved divergence');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office18','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read','cash.read_all'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',:'reject18'),'PT403','18: saved review replay rechecks current revoked capability');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.team_set_member(:'office18','00000000-0000-4000-b000-000000000153','admin',true,ARRAY['foundation.access','cash.read_all','cash.closure.approve'],gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';
SELECT test.expect_error(format('SELECT public.closure_record(%L,%L)',:'office18',:'record18'),'PT403','18: cash.read remains mandatory despite read_all and review');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT test.payment_fixture() AS pagesf18 \gset
SELECT set_config('test.pagesf18',:'pagesf18',false);
DO $$DECLARE n int;f jsonb:=current_setting('test.pagesf18')::jsonb;sid uuid;BEGIN FOR n IN 1..6 LOOP
 PERFORM public.closure_operate((f->>'office')::uuid,test.closure_op(f));
 sid:=(public.cash_open((f->>'office')::uuid,(f->>'unit')::uuid,(f->>'cashaccount')::uuid,10000,gen_random_uuid())->'sessions'->0->>'id')::uuid;
 f:=f||jsonb_build_object('session',sid);
 END LOOP;PERFORM set_config('test.pagesf18',f::text,false);END $$;
SELECT test.assert_true(public.closure_state(:'office18',(current_setting('test.pagesf18')::jsonb->>'session')::uuid,1,1) @> '{"sources_total":6,"source_page":1}' AND jsonb_array_length(public.closure_state(:'office18',(current_setting('test.pagesf18')::jsonb->>'session')::uuid,1,2)->'sources')=1,'18: prior close sources have exhaustive independent pagination');
-- 100 groups accepted;101 explicitly rejected. All movements use the real transfer RPC.
SELECT test.payment_fixture() AS limitf18 \gset
SELECT set_config('test.limitf18',:'limitf18',false);
DO $$DECLARE n int;f jsonb:=current_setting('test.limitf18')::jsonb;aid uuid;BEGIN FOR n IN 1..99 LOOP
 aid:=(public.cash_configure((f->>'office')::uuid,jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Destino local limite18 '||n,'active',true,'unit_id',f->'unit','type','bank'),gen_random_uuid())->'resource'->>'id')::uuid;
 PERFORM public.transfer_operate((f->>'office')::uuid,jsonb_build_object('kind','sangria','session_id',f->'session','expected_session_version',n,'idempotency_key',gen_random_uuid(),'source_account_id',f->'cashaccount','destination_account_id',aid,'amount_cents',1,'reason','Movimento local limite de grupos18','evidence','Conferencia sintetica manual18'));
 END LOOP;END $$;
SELECT test.assert_true(jsonb_array_length(public.closure_state(:'office18',(:'limitf18'::jsonb->>'session')::uuid,1,1)->'groups')=100,'18:100 groups returned without truncation');
SELECT test.closure_op(:'limitf18') AS limitclose18 \gset
SELECT public.transfer_operate(:'office18',jsonb_build_object('kind','sangria','session_id',:'limitf18'::jsonb->'session','expected_session_version',100,'idempotency_key',gen_random_uuid(),'source_account_id',:'limitf18'::jsonb->'cashaccount','destination_account_id',:'limitf18'::jsonb->'bank','amount_cents',1,'reason','Movimento alem do limite de grupos18','evidence','Conferencia sintetica manual18'));
SELECT test.expect_error(format('SELECT public.closure_state(%L,%L,1,1)',:'office18',:'limitf18'::jsonb->>'session'),'PT409','18:101 groups state rejects explicitly no partial export');
SELECT test.expect_error(format('SELECT public.closure_operate(%L,%L)',:'office18',(:'limitclose18'::jsonb||'{"expected_version":101}')::text),'PT409','18:101 groups close rejects before writing snapshot');
RESET ROLE;
SELECT test.assert_true((SELECT result->'statement'->'session'->>'version'='1' FROM private.cash_commands WHERE office_id=:'office18' AND kind='closure' AND idempotency_key=(:'adjust18'::jsonb->>'idempotency_key')::uuid),'18: replay refresh does not rewrite stored command result');

SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
SELECT public.payment_operate(:'office18',test.payment_op(:'money18',4000,'pix')||'{"expected_version":6}');
SELECT public.expense_operate(:'office18',jsonb_build_object('kind','create','idempotency_key',gen_random_uuid(),'category','Material','payee','Fornecedor local18','description','Descricao da despesa assinada18','due_date','2026-11-01','amount_cents',2000,'evidence','Comprovante de despesa18'))->'expense'->>'id' AS negativeexpense18 \gset
SELECT public.expense_operate(:'office18',jsonb_build_object('kind','approve','idempotency_key',gen_random_uuid(),'expense_id',:'negativeexpense18','expected_version',1,'evidence','Aprovacao manual conferida18'));
SELECT public.expense_operate(:'office18',jsonb_build_object('kind','pay','idempotency_key',gen_random_uuid(),'expense_id',:'negativeexpense18','expected_version',2,'session_id',:'money18'::jsonb->'session','expected_session_version',7,'account_id',:'money18'::jsonb->'bank','evidence','Pagamento manual conferido18'));
SELECT test.assert_true(public.closure_operate(:'office18',test.closure_op(:'money18'))->'record'->'groups' @> '[{"payment_type":"transfer","expected_cents":-500,"counted_cents":-500,"difference_cents":0},{"payment_type":"pix","expected_cents":4000}]','18: signed negative digital group counted separately from PIX revenue');
RESET ROLE;
