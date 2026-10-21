-- Disposable fixtures only; all operations use the existing request/file domains.
SELECT test.assert_true(to_regclass('private.checklist_instances') IS NOT NULL,'checklists12: dominio instalado');
SELECT test.assert_true((SELECT count(*)=4 FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'checklists.%') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'checklists.%'),'checklists12: seed somente owner');
INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000092',unnest(ARRAY['checklists.read','checklists.update']);
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,priority,idempotency_key,payload_digest)VALUES('00000000-0000-4000-e000-000000000091','CHECKLIST-12','Pedido privado ficticio12','presencial','00000000-0000-4000-a000-000000000091','00000000-0000-4000-b000-000000000092','normal',gen_random_uuid(),'fixture12')RETURNING id AS req12 \gset
INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)SELECT office_id,:'req12',service_id,version_id,snapshot,fields,participant_ids,checklist FROM public.request_items ORDER BY created_at LIMIT 1 RETURNING id AS item12,service_id AS service12 \gset
SELECT '{"name":"Tres arquivos ficticios","items":[{"key":"a","label":"Arquivo A","requirement":"required","condition":null},{"key":"b","label":"Arquivo B","requirement":"required","condition":null},{"key":"c","label":"Arquivo C","requirement":"required","condition":null}]}'::jsonb AS model12 \gset
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.checklists_notifications('00000000-0000-4000-e000-000000000091',1,3,false)$q$,'42501','checklists12: anon sem RPC');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.checklists_notifications('00000000-0000-4000-e000-000000000091',1,3,false)$q$,'PT401','checklists12: sessao exigida');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.checklists_publish('00000000-0000-4000-e000-000000000091',:'service12',0,:'model12','Modelo ficticio inicial',gen_random_uuid());
SELECT public.checklists_apply('00000000-0000-4000-e000-000000000091',:'req12',:'item12',gen_random_uuid()) AS applied12 \gset
SELECT :'applied12'::jsonb->'instance'->>'id' AS instance12,:'applied12'::jsonb->'instance'->'entries'->0->>'id' AS entry12a,:'applied12'::jsonb->'instance'->'entries'->1->>'id' AS entry12b,:'applied12'::jsonb->'instance'->'entries'->2->>'id' AS entry12c \gset
SELECT test.assert_true(:'applied12'::jsonb->'instance'->>'pending'='3','checklists12: tres itens obrigatorios pendentes');
SELECT public.checklists_publish('00000000-0000-4000-e000-000000000091',:'service12',1,jsonb_set(:'model12','{items,0,label}','"Novo rotulo"'),'Atualizacao ficticia',gen_random_uuid());
SELECT test.assert_true(public.checklists_view('00000000-0000-4000-e000-000000000091',:'req12',:'item12')->'instance'->'entries'->0->>'label'='Arquivo A','checklists12: modelo posterior preserva checklist antigo');
SELECT test.expect_error(format('SELECT public.checklists_publish(%L,%L,1,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'service12',:'model12','Versao concorrente'),'PT409','checklists12: publicacao exige versao atual');
RESET ROLE;
INSERT INTO public.files(office_id,request_id,request_item_id,name,mime_type,size_bytes,sha256,classification,status,created_by)VALUES('00000000-0000-4000-e000-000000000091',:'req12',:'item12','Arquivo ficticio A.pdf','application/pdf',100,repeat('a',64),'documento','quarentena','00000000-0000-4000-a000-000000000091')RETURNING id AS file12a \gset
INSERT INTO public.files(office_id,request_id,request_item_id,name,mime_type,size_bytes,sha256,classification,status,created_by)VALUES('00000000-0000-4000-e000-000000000091',:'req12',:'item12','Arquivo ficticio B.pdf','application/pdf',100,repeat('b',64),'documento','quarentena','00000000-0000-4000-a000-000000000091')RETURNING id AS file12b \gset
SET ROLE authenticated;
SELECT public.checklists_update('00000000-0000-4000-e000-000000000091',:'entry12a',1,'recebido',:'file12a','Recebimento ficticio',gen_random_uuid());
SELECT public.checklists_update('00000000-0000-4000-e000-000000000091',:'entry12b',1,'recebido',:'file12b','Recebimento ficticio',gen_random_uuid()) AS two12 \gset
SELECT test.assert_true(:'two12'::jsonb->'instance'->>'pending'='1' AND :'two12'::jsonb->'instance'->>'received'='2','checklists12: dois recebidos e terceiro necessario pendente');
SELECT test.expect_error(format('SELECT public.checklists_update(%L,%L,2,%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'entry12a','validado',:'file12a','Nao existe scanner'),'PT409','checklists12: quarentena nao valida nem libera');
SELECT test.expect_error(format('SELECT public.checklists_update(%L,%L,1,%L,NULL,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'entry12c','dispensado',''),'PT422','checklists12: dispensa exige motivo');
SELECT public.checklists_notify('00000000-0000-4000-e000-000000000091',:'instance12');
SELECT public.checklists_notify('00000000-0000-4000-e000-000000000091',:'instance12');
SELECT test.assert_true(public.checklists_notifications('00000000-0000-4000-e000-000000000091',1,3,false)->>'total'='0','checklists12: remetente nao le destinatario');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT public.checklists_notifications('00000000-0000-4000-e000-000000000091',1,3,false) AS notices12 \gset
SELECT test.assert_true(:'notices12'::jsonb->>'total'='1' AND :'notices12'::jsonb->>'unread'='1' AND :'notices12'::jsonb::text !~ 'privado|ficticio|Arquivo|sha256|reason|title','checklists12: alerta deduplicado sem texto sensivel');
SELECT public.checklists_read('00000000-0000-4000-e000-000000000091',(:'notices12'::jsonb->'items'->0->>'id')::uuid);
SELECT test.assert_true(public.checklists_notifications('00000000-0000-4000-e000-000000000091',1,3,true)->>'total'='0','checklists12: leitura persistida');
SELECT test.expect_error(format('SELECT public.checklists_update(%L,%L,1,%L,NULL,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'entry12c','dispensado','Dispensa sem capacidade'),'PT403','checklists12: dispensa exige capacidade independente');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT test.expect_error($q$SELECT public.checklists_notifications('00000000-0000-4000-e000-000000000091',1,3,false)$q$,'PT403','checklists12: portal nao recebe notificacoes internas');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=2 FROM private.file_references WHERE reference_kind LIKE 'checklist12:%'),'checklists12: arquivos vinculados protegidos por referencia11');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.checklist_entries','SELECT,UPDATE') AND NOT has_function_privilege('authenticated','private.checklists_notice(uuid,uuid,text,uuid,uuid)','EXECUTE'),'checklists12: metadados e produtor privados');
SELECT test.expect_error(format('UPDATE private.checklist_model_versions SET reason=%L WHERE office_id=%L','Alteracao indevida','00000000-0000-4000-e000-000000000091'),'PT403','checklists12: modelos imutaveis ate contra escrita interna');
SELECT test.expect_error(format('DELETE FROM private.checklist_history WHERE entry_id=%L',:'entry12a'),'PT403','checklists12: historico imutavel');
SELECT test.assert_true((SELECT count(*)=8 AND bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'checklists_%'),'checklists12: oito wrappers invoker e search_path vazio');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.checklists_update('00000000-0000-4000-e000-000000000091',:'entry12c',1,'dispensado',NULL,'Dispensa autorizada ficticia',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.checklists_update(%L,%L,1,%L,NULL,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'entry12c','pendente','Estado concorrente'),'PT409','checklists12: versao concorrente negada');
SELECT test.expect_error(format('SELECT public.checklists_update(%L,%L,2,%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'entry12c','recebido',:'file12a','Mesmo arquivo para outro item'),'PT409','checklists12: um arquivo nao supre dois itens');
SELECT test.expect_error(format('SELECT public.checklists_publish(%L,%L,2,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'service12',jsonb_set(:'model12','{items,1,key}','"a"')::text,'Chave repetida'),'PT422','checklists12: chave duplicada negada no banco');
RESET ROLE;
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,priority,idempotency_key,payload_digest)VALUES('00000000-0000-4000-e000-000000000091','CONDICIONAL-12','Condicoes ficticias12','presencial','00000000-0000-4000-a000-000000000091','normal',gen_random_uuid(),'conditional12')RETURNING id AS req12conditional \gset
INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)SELECT office_id,:'req12conditional',service_id,version_id,snapshot,fields,participant_ids,checklist FROM public.request_items WHERE id=:'item12' RETURNING id AS item12conditional \gset
SET ROLE authenticated;
SELECT public.checklists_publish('00000000-0000-4000-e000-000000000091',:'service12',2,'{"name":"Condicoes","items":[{"key":"opcional","label":"Opcional","requirement":"optional","condition":null},{"key":"portal","label":"So portal","requirement":"conditional","condition":{"field":"origin","equals":"portal"}},{"key":"normal","label":"Prioridade normal","requirement":"conditional","condition":{"field":"priority","equals":"normal"}}]}','Modelo condicional ficticio',gen_random_uuid());
SELECT public.checklists_apply('00000000-0000-4000-e000-000000000091',:'req12conditional',:'item12conditional',gen_random_uuid()) AS conditional12 \gset
SELECT test.assert_true(:'conditional12'::jsonb->'instance'->>'pending'='1' AND :'conditional12'::jsonb->'instance'->'entries'->1->>'applicable'='false' AND :'conditional12'::jsonb->'instance'->'entries'->2->>'applicable'='true','checklists12: opcional nao bloqueia e condicoes capturadas explicitamente');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.expect_error(format('SELECT public.checklists_view(%L,%L,NULL)','00000000-0000-4000-e000-000000000091',:'req12conditional'),'PT404','checklists12: funcionario A nao le pedido sem atribuicao B');
SELECT test.expect_error(format('SELECT public.checklists_read(%L,%L)','00000000-0000-4000-e000-000000000092',(:'notices12'::jsonb->'items'->0->>'id')),'PT403','checklists12: troca de escritorio negada');
RESET ROLE;
-- Synthetic metadata fixture only, as in11. This does not simulate or claim a scanner.
UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id=:'file12a';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.checklists_update('00000000-0000-4000-e000-000000000091',:'entry12a',2,'validado',:'file12a','Conferencia de fixture clean',gen_random_uuid())->'instance'->'entries'->0->>'status'='validado','checklists12: validado registrado somente com fixture disponivel clean');
SELECT test.expect_error(format('SELECT public.checklists_update(%L,%L,1,%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'conditional12'::jsonb->'instance'->'entries'->2->>'id'),'recebido',:'file12b','Arquivo de outro pedido'),'PT404','checklists12: arquivo de outro pedido negado mesmo para owner');
RESET ROLE;
