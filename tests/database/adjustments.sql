-- Disposable fixtures: follow-up remains read-only across modules10–12.
SELECT test.assert_true((SELECT count(*)=1 FROM public.role_permissions WHERE permission_code='requests.reclaim' AND role_code='owner') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE permission_code='requests.reclaim' AND role_code<>'owner'),'ajustes: retomada seed somente owner');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT public.request_create('00000000-0000-4000-e000-000000000091','{"origin":"portal","title":"Acompanhamento ficticio","message":"Mensagem privada ficticia"}',gen_random_uuid(),gen_random_uuid())->>'id' AS adjust_request \gset
SELECT public.request_detail('00000000-0000-4000-e000-000000000091',:'adjust_request',1)->>'protocol' AS adjust_protocol \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'adjust_request',1,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000092","reason":"Delegacao ficticia"}',gen_random_uuid());
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'adjust_request',1) @> '{"following_only":true,"can_update":false,"can_transfer":false,"can_cancel":false,"can_reclaim":true}','ajustes: gestor acompanha e pode retomar, sem editar enquanto delegado');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'adjust_request','{"kind":"note","note":"Bypass do gestor"}'),'PT403','ajustes: criador/gestor nao edita atendimento delegado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'adjust_request',2,'{"kind":"note","note":"Responsavel atual atende"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,3,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'adjust_request','{"kind":"reclaim","reason":"Sem autoridade"}'),'PT403','ajustes: funcionario nao retoma mesmo com acesso ao pedido');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'adjust_request',3,'{"kind":"reclaim","reason":"Retomada ficticia"}',gen_random_uuid()) AS reclaimed \gset
SELECT test.assert_true(:'reclaimed'::jsonb @> '{"assignee_id":"00000000-0000-4000-b000-000000000091","can_update":true,"following_only":false}' AND :'reclaimed'::jsonb->>'created_by'='00000000-0000-4000-a000-000000000095','ajustes: retoma para si preservando criador');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,3,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'adjust_request','{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000092","reason":"Versao antiga"}'),'PT409','ajustes: versao impede retomada/transferencia obsoleta');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'adjust_request',1) @> '{"following_only":true,"can_update":false,"can_transfer":false,"can_cancel":false,"can_reclaim":false}','ajustes: ex-responsavel continua somente acompanhando');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,4,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'adjust_request','{"kind":"status","status":"em_atendimento","reason":"Bypass do anterior"}'),'PT403','ajustes: ex-responsavel nao altera status');
SELECT test.expect_error(format('SELECT public.checklists_apply(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'adjust_request'),'PT403','ajustes: ex-responsavel nao aplica checklist');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT public.notifications_page('00000000-0000-4000-e000-000000000091',:'adjust_protocol','all','assignee_changed',1,3) AS client_notices \gset
SELECT test.assert_true(:'client_notices'::jsonb->>'total'='2' AND jsonb_array_length(:'client_notices'::jsonb->'items')=2 AND NOT (:'client_notices'::jsonb::text ~ 'reason|role_code|actor_id|Mensagem|Delegacao|Retomada'),'ajustes: cliente ve todas as trocas com whitelist minima');
SELECT test.assert_true((SELECT count(*)=8 FROM jsonb_object_keys(:'client_notices'::jsonb->'items'->0)) AND :'client_notices'::jsonb->'items'->0->>'attendant_name' IS NOT NULL,'ajustes: aviso inclui somente campos publicos e nome');
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'adjust_request',1)->>'assignee_name' IS NOT NULL,'ajustes: portal mostra nome atual');
SELECT public.notifications_read('00000000-0000-4000-e000-000000000091',(:'client_notices'::jsonb->'items'->0->>'id')::uuid);
SELECT public.notifications_read('00000000-0000-4000-e000-000000000091',(:'client_notices'::jsonb->'items'->0->>'id')::uuid);
SELECT test.assert_true(public.notifications_page('00000000-0000-4000-e000-000000000091',:'adjust_protocol','read','assignee_changed',1,3)->>'total'='1' AND (public.notifications_summary('00000000-0000-4000-e000-000000000091')->>'unread')::integer>=1,'ajustes: leitura idempotente e filtro persistido');
SELECT test.assert_true(public.notifications_page('00000000-0000-4000-e000-000000000091','','all','pending',1,3)->>'total'='0','ajustes: cliente nunca recebe avisos internos');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.expect_error(format('SELECT public.notifications_read(%L,%L)','00000000-0000-4000-e000-000000000091',(:'client_notices'::jsonb->'items'->0->>'id')),'PT404','ajustes: destinatario alheio nao marca aviso');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM private.request_assignments WHERE request_id=:'adjust_request' AND ended_at IS NULL),'ajustes: exatamente uma atribuicao atual');
-- Even a capability grant cannot turn a former employee into a manager.
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','requests.reclaim');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,4,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'adjust_request','{"kind":"reclaim","reason":"Funcionario com capacidade"}'),'PT403','ajustes: funcao administrativa obrigatoria alem da capacidade');
RESET ROLE;
UPDATE public.memberships SET role_code='admin' WHERE id='00000000-0000-4000-b000-000000000092';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.assert_true(public.request_mutate('00000000-0000-4000-e000-000000000091',:'adjust_request',4,'{"kind":"reclaim","reason":"Administrador explicitamente autorizado"}',gen_random_uuid())->>'assignee_id'='00000000-0000-4000-b000-000000000092','ajustes: administrador com permissao explicita retoma para si');
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='requests.reclaim';
UPDATE public.memberships SET role_code='employee' WHERE id='00000000-0000-4000-b000-000000000092';
