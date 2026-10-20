-- Disposable Etapa10 fixtures. A missing workflow must fail before any implementation.
SELECT test.assert_true(to_regclass('public.requests') IS NOT NULL,'pedidos: tabelas do fluxo existem');
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'requests.%')=6 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'requests.%'),'pedidos: capacidades independentes seed somente owner');
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('public.requests'::regclass,'public.request_items'::regclass,'private.request_assignments'::regclass,'private.request_history'::regclass)) AND NOT has_table_privilege('authenticated','public.requests','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.request_items','SELECT,INSERT,UPDATE,DELETE'),'pedidos: RLS e ACL negam acesso bruto');
SELECT test.assert_true((SELECT count(*)=5 AND bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('requests_page','request_detail','request_options','request_create','request_mutate')),'pedidos: cinco wrappers invoker com search_path vazio');
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p FROM generate_series(92,96) n CROSS JOIN unnest(ARRAY['requests.read','requests.create','requests.update','requests.transfer','requests.cancel']) p WHERE n<>95;
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.requests_page('00000000-0000-4000-e000-000000000091','','queue','',1,3)$q$,'42501','pedidos: anon negado');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.requests_page('00000000-0000-4000-e000-000000000091','','queue','',1,3)$q$,'PT401','pedidos: sessao real obrigatoria');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
RESET ROLE;
SELECT definition||'{"code":"REQUEST-TESTE","effective_from":null}'::jsonb AS xerox09 FROM public.service_versions v JOIN public.services s ON s.id=v.service_id WHERE s.code='XEROX-TESTE' AND v.number=2 \gset
SELECT id AS contract09_id FROM public.services WHERE code='CONTRATO-TESTE' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.service_create('00000000-0000-4000-e000-000000000091',:'xerox09','Catalogo para pedidos',gen_random_uuid())->>'id' AS xerox09_id \gset
SELECT jsonb_build_object('origin','presencial','title','Copias ficticias','customer_id',NULL,'assignee_id','00000000-0000-4000-b000-000000000092','priority','normal','priority_reason','','items',jsonb_build_array(jsonb_build_object('service_id',:'xerox09_id','quantity',3,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb)),'internal_note','Nota restrita ficticia') AS request10 \gset
SELECT public.request_create('00000000-0000-4000-e000-000000000091',:'request10','00000000-0000-4000-f000-000000000101',gen_random_uuid()) AS opened10 \gset
SELECT :'opened10'::jsonb->>'id' AS request10_id \gset
SELECT test.assert_true(:'opened10'::jsonb->>'status'='aberto' AND :'opened10'::jsonb->>'version'='1' AND :'opened10'::jsonb->>'created_by'='00000000-0000-4000-a000-000000000091' AND :'opened10'::jsonb->'items'->0->'snapshot'->>'total_cents'='225','pedidos: abertura persiste snapshot calculado e criador imutavel');
SELECT test.assert_true(public.request_create('00000000-0000-4000-e000-000000000091',:'request10','00000000-0000-4000-f000-000000000101',gen_random_uuid())->>'id'=:'request10_id','pedidos: repeticao idempotente devolve mesmo pedido');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'request10'::jsonb||'{"title":"Outro"}')::text,'00000000-0000-4000-f000-000000000101'),'PT409','pedidos: mesma chave com outro payload conflita');
SELECT public.service_publish('00000000-0000-4000-e000-000000000091',:'xerox09_id',(:'xerox09'::jsonb||'{"price_cents":90}'),1,'Reajuste posterior ficticio',gen_random_uuid());
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'request10_id',1)->'items'->0->'snapshot'->>'total_cents'='225','pedidos: catalogo posterior nao recalcula snapshot');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'request10','{items,0,quantity}','1.5')::text),'PT422','pedidos: quantidade decimal negada no banco');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'request10','{items,0,fields}','{"inventado":"valor"}')::text),'PT422','pedidos: campo fora da definicao negado');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'request10','{items,0,service_id}',to_jsonb(:'contract09_id'::text))::text),'PT422','pedidos: servico exige pessoa participantes campos checklist');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000094","session_id":"00000000-0000-4000-c000-000000000094"}';
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000000091','','queue','',1,3)->>'total'='0','pedidos: funcionario sem read_all nao ve criacao alheia nao atribuida');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)','00000000-0000-4000-e000-000000000091',:'request10_id'),'PT404','pedidos: UUID conhecido nao concede escopo');
SELECT test.expect_error($q$SELECT public.requests_page('00000000-0000-4000-e000-000000000092','','queue','',1,3)$q$,'PT403','pedidos: outro escritorio negado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000000091','','mine','',1,3)->>'total'='1','pedidos: atribuicao atual concede escopo com read');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'request10','{items,0,adjustment}','{"kind":"courtesy","value":0,"reason":"Tentativa"}')::text),'PT403','pedidos: ajuste requer capacidade independente');
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'request10_id',1,'{"kind":"note","note":"Acompanhamento ficticio"}',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'request10_id','{"kind":"status","status":"em_atendimento","reason":"Inicio"}'),'PT409','pedidos: versao esperada impede escrita obsoleta');
SELECT test.assert_true(public.request_mutate('00000000-0000-4000-e000-000000000091',:'request10_id',2,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000094","reason":"Nova fila"}',gen_random_uuid())='{"access_lost":true}'::jsonb,'pedidos: transferencia encerra detalhe ao perder escopo');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)','00000000-0000-4000-e000-000000000091',:'request10_id'),'PT404','pedidos: antigo responsavel perde leitura');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT public.request_create('00000000-0000-4000-e000-000000000091','{"origin":"portal","title":"Duvida propria","message":"Mensagem propria\nsegunda linha"}','00000000-0000-4000-f000-000000000105',gen_random_uuid()) AS portal10 \gset
SELECT :'portal10'::jsonb->>'id' AS portal10_id \gset
SELECT test.assert_true(:'portal10'::jsonb @> '{"portal":true,"public_status":"recebido","services":[]}' AND (SELECT count(*)=9 FROM jsonb_object_keys(:'portal10'::jsonb)) AND NOT (:'portal10'::jsonb ?| ARRAY['items','history','customer_id','created_by','status','priority']),'pedidos: portal tem whitelist exata sem atores precos notas ou ficha');
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000000091','','queue','',1,3)->>'total'='1','pedidos: portal lista somente UID criador');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)','00000000-0000-4000-e000-000000000091',:'request10_id'),'PT404','pedidos: cliente nao acessa pedido da equipe por UUID');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'request10'),'PT403','pedidos: cliente nao cria itens internos');
SELECT test.expect_error($q$SELECT public.request_options('00000000-0000-4000-e000-000000000091','services','',1,3)$q$,'PT403','pedidos: portal nao acessa seletores internos');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.request_options('00000000-0000-4000-e000-000000000091','assignees','',1,3)->>'page_size'='3','pedidos: seletores paginados');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,1,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'portal10_id','{"kind":"status","status":"concluido","reason":"Sem triagem"}'),'PT409','pedidos: triagem precisa classificar antes de concluir');
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'portal10_id',1,jsonb_build_object('kind','triage','customer_id',NULL,'items',:'request10'::jsonb->'items','reason','Classificacao ficticia'),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'portal10_id',jsonb_build_object('kind','triage','customer_id',NULL,'items',:'request10'::jsonb->'items','reason','Duplicacao')::text),'PT409','pedidos: triagem inclui itens uma unica vez');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'portal10_id','{"kind":"status","status":"cancelado","reason":"Cancelar"}'),'PT422','pedidos: cancelamento exige conferencia manual explicita');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,2,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'portal10_id','{"kind":"status","status":"cancelado","reason":"Cancelar","cancellation_review":{"charges_reviewed":true,"refunds_reviewed":false,"deliveries_reviewed":true,"external_reviewed":true}}'),'PT422','pedidos: conferencia parcial negada');
SELECT public.request_mutate('00000000-0000-4000-e000-000000000091',:'portal10_id',2,'{"kind":"status","status":"cancelado","reason":"Conferencia humana ficticia","cancellation_review":{"charges_reviewed":true,"refunds_reviewed":true,"deliveries_reviewed":true,"external_reviewed":true}}',gen_random_uuid()) AS cancelled10 \gset
SELECT test.assert_true(:'cancelled10'::jsonb->>'status'='cancelado' AND jsonb_array_length(:'cancelled10'::jsonb->'items')=1 AND :'cancelled10'::jsonb->>'history_total'='3','pedidos: cancelamento conserva snapshot e trilha');
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,3,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'portal10_id','{"kind":"note","note":"Fechado"}'),'PT409','pedidos: fechado imutavel');
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'request10_id',1)->>'history_total'='3','pedidos: historico completo com pagina de tres');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'requests.%' AND changes::text ~ 'fictici|Mensagem|Nota|Copias'),'pedidos: auditoria sem texto livre ou PII');
SELECT test.expect_error(format('DELETE FROM public.request_items WHERE request_id=%L',:'request10_id'),'PT403','pedidos: snapshots nao apagaveis');
SELECT test.expect_error(format('DELETE FROM private.request_history WHERE request_id=%L',:'request10_id'),'PT403','pedidos: trilha nao apagavel');

-- Legacy actor labels must remain safe for the strict HTTP DTO.
UPDATE public.profiles SET display_name=E'\t' WHERE id='00000000-0000-4000-a000-000000000094';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'request10_id',1)->>'assignee_name'='Nome não informado','pedidos: responsavel legado normalizado');
RESET ROLE;
UPDATE public.profiles SET display_name='Catalogo Ficticio' WHERE id='00000000-0000-4000-a000-000000000094';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'request10_id',1)->>'created_by_name'='Catalogo Ficticio','pedidos: criador apresenta nome seguro');
SELECT test.assert_true(public.request_detail('00000000-0000-4000-e000-000000000091',:'portal10_id',1)->>'assignee_id'='00000000-0000-4000-b000-000000000091','pedidos: triagem assume responsabilidade sem perder criador');
RESET ROLE;
-- Audit failure rolls back request, protocol allocation, item snapshots and history.
SELECT count(*) AS before10 FROM public.requests \gset
SELECT last_number AS counter10 FROM private.request_counters WHERE office_id='00000000-0000-4000-e000-000000000091' \gset
ALTER TABLE public.audit_events ADD CONSTRAINT test_request_audit_failure CHECK(action<>'requests.created') NOT VALID;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'request10'),'23514','pedidos: falha de auditoria reverte abertura inteira');
RESET ROLE;
ALTER TABLE public.audit_events DROP CONSTRAINT test_request_audit_failure;
SELECT test.assert_true((SELECT count(*) FROM public.requests)=:'before10'::bigint AND (SELECT last_number FROM private.request_counters WHERE office_id='00000000-0000-4000-e000-000000000091')=:'counter10'::bigint,'pedidos: rollback preserva contador e quantidade');
-- Keep capabilities independent even when read_all is explicitly granted.
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','requests.read_all');
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='requests.read';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.expect_error($q$SELECT public.requests_page('00000000-0000-4000-e000-000000000091','','queue','',1,3)$q$,'PT403','pedidos: read_all nao substitui read');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','requests.read');
SET ROLE authenticated;
SELECT test.assert_true(public.requests_page('00000000-0000-4000-e000-000000000091','','queue','',1,3)->>'total'='2','pedidos: read_all amplia fila no escritorio');
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='requests.read_all';

-- The contract09 success path must persist real customer/participant data and
-- validate its required fields/checklist, rather than only reject missing people.
INSERT INTO public.customers(office_id,kind,name,created_by) VALUES('00000000-0000-4000-e000-000000000091','person','Maria de Teste10','00000000-0000-4000-a000-000000000091') RETURNING id AS maria10_id \gset
INSERT INTO public.customers(office_id,kind,name,created_by) VALUES('00000000-0000-4000-e000-000000000091','person','Participante Ficticio10','00000000-0000-4000-a000-000000000091') RETURNING id AS participant10_id \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT jsonb_set(jsonb_set(:'request10','{customer_id}',to_jsonb(:'maria10_id'::text)),'{items}',jsonb_build_array(jsonb_build_object('service_id',:'contract09_id','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{"objeto":"Objeto ficticio de contrato"}'::jsonb,'participant_ids',jsonb_build_array(:'maria10_id',:'participant10_id'),'checklist','["Conferir participantes"]'::jsonb))) AS contract10 \gset
SELECT public.request_create('00000000-0000-4000-e000-000000000091',(:'contract10'::jsonb||'{"title":"Contrato com Maria de Teste"}'),gen_random_uuid(),gen_random_uuid()) AS contract10_result \gset
SELECT test.assert_true(:'contract10_result'::jsonb->>'customer_id'=:'maria10_id' AND :'contract10_result'::jsonb->'items'->0->'snapshot'->>'total_cents'='10000' AND jsonb_array_length(:'contract10_result'::jsonb->'items'->0->'participant_ids')=2 AND (:'contract10_result'::jsonb->'items'->0->'snapshot'->'definition'->>'approval_required')::boolean,'pedidos: contrato09 real conserva pessoa participantes preco e politica');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'contract10','{items,0,fields}','{}')::text),'PT422','pedidos: campo obrigatorio aplicado mesmo com pessoa correta');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'contract10','{items,0,participant_ids}',jsonb_build_array(:'maria10_id'))::text),'PT422','pedidos: minimo de participantes aplicado ao contrato');
SELECT test.expect_error(format('SELECT public.request_create(%L,%L,gen_random_uuid(),gen_random_uuid())','00000000-0000-4000-e000-000000000091',jsonb_set(:'contract10','{items,0,checklist}','[]')::text),'PT422','pedidos: checklist obrigatorio aplicado ao contrato');
RESET ROLE;
