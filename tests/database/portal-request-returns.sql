-- Run after base fixtures + 20261105150001 + 20261105150002, only in disposable local DB.
BEGIN;
SELECT test.assert_true(has_function_privilege('authenticated','private.files_storage_allowed(text,text,text,jsonb)','EXECUTE'),'portal files: authenticated Storage policy can execute checked helper');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname IN('attachments_insert','attachments_select','attachments_insert_gate','attachments_select_gate') AND (coalesce(pg_get_expr(polqual,polrelid),'')||coalesce(pg_get_expr(polwithcheck,polrelid),'')) LIKE '%files_storage_allowed_before_portal_returns%'),'portal files: Storage policies bind to current status and hidden-file guard');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000734","session_id":"00000000-0000-4000-c000-000000000734"}';
-- Returned historical requests remain supported even when originally unclassified.
SELECT private.request_create('00000000-0000-4000-e000-000000000731','{"origin":"portal","title":"Retorno local","message":"Mensagem própria"}',gen_random_uuid(),gen_random_uuid())->>'id' AS return_id \gset
SELECT test.assert_true(public.portal_request_state('00000000-0000-4000-e000-000000000731',:'return_id')->>'can_edit'='false','retorno: aberto não permite edição');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'return_id','{"kind":"hide"}'),'PT409','retorno: aberto não pode ser ocultado');
RESET ROLE;
UPDATE public.requests SET status='aguardando_cliente',version=2 WHERE id=:'return_id';
INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status)VALUES('00000000-0000-4000-e000-000000000731',:'return_id','status','00000000-0000-4000-a000-000000000731','Complete as informações','aberto','aguardando_cliente');
INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason)VALUES('00000000-0000-4000-e000-000000000731',:'return_id','note','00000000-0000-4000-a000-000000000731','NOTA INTERNA NUNCA VAZAR');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000734","session_id":"00000000-0000-4000-c000-000000000734"}';
SELECT public.portal_request_state('00000000-0000-4000-e000-000000000731',:'return_id') AS return_state \gset
SELECT test.assert_true(:'return_state'::jsonb->>'reason'='Complete as informações' AND :'return_state'::jsonb->>'can_edit'='true' AND strpos(:'return_state','INTERNA')=0 AND NOT(:'return_state'::jsonb ?|ARRAY['history','created_by','customer_id','assignee_id']),'retorno: motivo público não seleciona nota interna');
SELECT test.assert_true(public.notifications_page('00000000-0000-4000-e000-000000000731','','all','request_returned',1,3)->>'total'='1','retorno: aviso próprio deduplicado de devolução');
SELECT gen_random_uuid() AS return_key \gset
SELECT public.portal_request_command('00000000-0000-4000-e000-000000000731',:'return_id',2,'{"kind":"save","title":"Corrigido","message":"Mensagem corrigida","inputs":[]}',:'return_key') AS saved_return \gset
SELECT test.assert_true(:'saved_return'::jsonb->>'version'='3' AND :'saved_return'::jsonb->>'title'='Corrigido','retorno: edição completa de título/mensagem');
SELECT test.assert_true(public.portal_request_command('00000000-0000-4000-e000-000000000731',:'return_id',2,'{"kind":"save","title":"Corrigido","message":"Mensagem corrigida","inputs":[]}',:'return_key')->>'version'='3','retorno: retry idempotente não incrementa versão');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,2,%L,%L)','00000000-0000-4000-e000-000000000731',:'return_id','{"kind":"hide"}',:'return_key'),'PT409','retorno: mesma chave não muda comando');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'return_id','{"kind":"resubmit"}'),'PT409','retorno: versão obsoleta perde corrida');
SELECT test.assert_true(public.portal_request_command('00000000-0000-4000-e000-000000000731',:'return_id',3,'{"kind":"resubmit"}',gen_random_uuid())->>'can_edit'='false','retorno: reenvio encerra edição e redistribui');
RESET ROLE;
UPDATE public.requests SET status='em_atendimento',version=10 WHERE id=:'return_id';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,10,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'return_id','{"kind":"hide"}'),'PT409','retorno: atendimento nunca ocultável');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,10,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'return_id','{"kind":"save","title":"Bypass","message":"x","inputs":[]}'),'PT409','retorno: atendimento nunca editável por RPC');
SELECT test.expect_error(format('SELECT private.files_request(%L,%L,(SELECT m FROM public.memberships m LIMIT 1),true)','00000000-0000-4000-e000-000000000731',:'return_id'),'42501','retorno: helper privado sem execute direto');
RESET ROLE;
UPDATE public.requests SET status='cancelado',version=11 WHERE id=:'return_id';
INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status)VALUES('00000000-0000-4000-e000-000000000731',:'return_id','status','00000000-0000-4000-a000-000000000731','Cancelamento informado','em_atendimento','cancelado');
SET ROLE authenticated;
SELECT test.assert_true(public.portal_request_state('00000000-0000-4000-e000-000000000731',:'return_id') @> '{"can_edit":false,"can_resubmit":false,"can_hide":true,"reason":"Cancelamento informado"}','retorno: cancelado somente ocultação');
SELECT test.assert_true(public.notifications_page('00000000-0000-4000-e000-000000000731','','all','request_cancelled',1,3)->>'total'='1','retorno: cancelamento com aviso próprio');
SELECT test.expect_error(format('SELECT public.portal_request_command(%L,%L,11,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',:'return_id','{"kind":"resubmit"}'),'PT409','retorno: cancelado não reenvia');
SELECT public.portal_request_command('00000000-0000-4000-e000-000000000731',:'return_id',11,'{"kind":"hide"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)','00000000-0000-4000-e000-000000000731',:'return_id'),'PT404','retorno: oculto não reaparece por UUID no detalhe comum');
SELECT test.assert_true(NOT EXISTS(SELECT FROM jsonb_array_elements(public.requests_page('00000000-0000-4000-e000-000000000731','','mine','',1,5)->'items') x WHERE x->>'id'=:'return_id'),'retorno: oculto sai da lista própria');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000731","session_id":"00000000-0000-4000-c000-000000000731"}';
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000731',:'return_id',1)->>'status'='cancelado','retorno: arquivo interno conservado após ocultação');
SELECT test.expect_error(format('SELECT public.portal_request_state(%L,%L)','00000000-0000-4000-e000-000000000731',:'return_id'),'PT404','retorno: endpoint cliente rejeita login da equipe');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM public.requests WHERE id=:'return_id') AND(SELECT count(*)>=4 FROM private.request_history WHERE request_id=:'return_id'),'retorno: nenhuma exclusão de pedido ou histórico');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.portal_intake_revisions','SELECT,INSERT,UPDATE,DELETE'),'retorno: revisão privada RLS/ACL');
ROLLBACK;
