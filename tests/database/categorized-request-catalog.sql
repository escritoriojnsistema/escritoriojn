-- Real RPCs, disposable fixtures. No hosted writes.
BEGIN;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000734","session_id":"00000000-0000-4000-c000-000000000734"}';
SELECT value->>'id' AS request_category FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items') WHERE value->>'name'='Rural' \gset
SELECT value->>'id' AS document_category FROM jsonb_array_elements(public.service_categories_state('00000000-0000-4000-e000-000000000731')->'items') WHERE value->>'is_documents'='true' \gset
SELECT gen_random_uuid() AS categorized_key \gset
SELECT jsonb_build_object('origin','portal','title','Solicitação rural de teste','message','Orientação fictícia','category_id',:'request_category') AS categorized_payload \gset
SELECT public.categorized_request_create('00000000-0000-4000-e000-000000000731',:'categorized_payload',:'categorized_key') AS categorized_result \gset
SELECT test.assert_true(:'categorized_result'::jsonb->>'category_id'=:'request_category' AND :'categorized_result'::jsonb->>'category_name'='Rural' AND (:'categorized_result'::jsonb->>'protocol')~'^AT-[0-9]{6,}$','solicitação: categoria oficial e protocolo automático');
SELECT test.assert_true(public.categorized_request_create('00000000-0000-4000-e000-000000000731',:'categorized_payload',:'categorized_key')->>'id'=:'categorized_result'::jsonb->>'id','solicitação: retry mantém o mesmo protocolo e pedido');
SELECT test.expect_error(format('SELECT public.categorized_request_create(%L,%L,%L)','00000000-0000-4000-e000-000000000731',(:'categorized_payload'::jsonb||'{"title":"Outro pedido"}')::text,:'categorized_key'),'PT409','solicitação: chave não aceita conteúdo diferente');
SELECT test.expect_error(format('SELECT public.categorized_request_create(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',(:'categorized_payload'::jsonb||jsonb_build_object('category_id',:'document_category'))::text),'PT422','solicitação: documentos exigem oferta e preço oficiais');
SELECT test.expect_error(format('SELECT public.categorized_request_create(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000731',(:'categorized_payload'::jsonb||'{"protocol":"AT-FORJADO"}')::text),'PT422','solicitação: protocolo do navegador é rejeitado');
SELECT test.assert_true(NOT(:'categorized_result'::jsonb ?| ARRAY['internal_note','created_by','assignee_id','history']),'solicitação: detalhe do cliente não expõe campos internos');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000731","session_id":"00000000-0000-4000-c000-000000000731"}';
SELECT public.template_save('00000000-0000-4000-e000-000000000731',NULL,test.template_definition20()||'{"code":"CAT-DOC","name":"Documento publicado de teste","demonstration":false,"variables":[],"content":"CONTEUDO PRIVADO DO MODELO"}',0,'Teste integrado do catálogo',gen_random_uuid()) AS catalog_template \gset
SELECT :'catalog_template'::jsonb->>'id' AS catalog_template_id,:'catalog_template'::jsonb->'versions'->0->>'id' AS catalog_version_id \gset
SELECT public.template_approve('00000000-0000-4000-e000-000000000731',:'catalog_template_id',:'catalog_version_id',1,'Conferência de teste',gen_random_uuid());
SELECT public.service_create('00000000-0000-4000-e000-000000000731','{"code":"CAT-DOC","name":"Serviço documental de teste","category":"Documentos","unit":"unidade","price_cents":2540,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false,"settlement_required":true,"required_capabilities":[],"fields":[],"checklist":[],"quantity_min":1,"quantity_max":1,"max_discount_bps":0,"max_surcharge_bps":0,"allow_courtesy":false,"allow_price_override":false}','Teste de integração',gen_random_uuid())->>'id' AS catalog_service_id \gset
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000731','{"kind":"create","name":"Pasta do cliente"}',gen_random_uuid()) AS catalog_folders \gset
SELECT value->>'id' AS catalog_folder_id FROM jsonb_array_elements(:'catalog_folders'::jsonb->'folders') WHERE value->>'name'='Pasta do cliente' \gset
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000731',jsonb_build_object('kind','move','template_id',:'catalog_template_id','folder_id',:'catalog_folder_id','expected_revision',0),gen_random_uuid());
SELECT public.checklists_publish('00000000-0000-4000-e000-000000000731',:'catalog_service_id',0,'{"name":"Externo","items":[{"key":"identidade","label":"Documento de identidade","requirement":"required","condition":null}]}','Exigência do cliente',gen_random_uuid(),'client');
SELECT public.checklists_publish('00000000-0000-4000-e000-000000000731',:'catalog_service_id',0,'{"name":"Interno","items":[{"key":"conferencia","label":"REGRA INTERNA SIGILOSA","requirement":"required","condition":null}]}','Conferência interna',gen_random_uuid(),'internal');
SELECT jsonb_build_object('service_id',:'catalog_service_id','instructions','Envie os dados necessários','execution_level',1,'portal_enabled',true,'intake_keys','[]'::jsonb,'required_intake_keys','[]'::jsonb,'allow_self_approval',false) AS catalog_offer_input \gset
SELECT public.document_offer_manage('00000000-0000-4000-e000-000000000731',:'catalog_template_id',:'catalog_offer_input',0,gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000734","session_id":"00000000-0000-4000-c000-000000000734"}';
SELECT public.document_offers_page('00000000-0000-4000-e000-000000000731',:'catalog_folder_id',false,'',1,5,:'document_category') AS catalog_page \gset
SELECT test.assert_true(:'catalog_page'::jsonb->>'total'='1' AND :'catalog_page'::jsonb->'items'->0->>'price_cents'='2540' AND :'catalog_page'::jsonb->'items'->0->>'service_category'='Documentos' AND :'catalog_page'::jsonb->'folders'->0->>'id'=:'catalog_folder_id','catálogo: categoria, pasta, modelo aprovado e preço real conectados');
SELECT test.assert_true(strpos(:'catalog_page','CONTEUDO PRIVADO')=0 AND strpos(:'catalog_page','REGRA INTERNA')=0 AND strpos(:'catalog_page','Documento de identidade')>0,'catálogo: cliente recebe checklist externo sem texto do modelo nem checklist interno');
SELECT test.assert_true(public.document_offers_page('00000000-0000-4000-e000-000000000731',NULL,false,'',1,5,:'request_category')->>'total'='0','catálogo: filtro por ID oficial não mistura categorias');
SELECT public.document_offer_form('00000000-0000-4000-e000-000000000731',:'catalog_template_id') AS catalog_form \gset
SELECT public.document_booking_create('00000000-0000-4000-e000-000000000731',jsonb_build_object('template_id',:'catalog_template_id','template_version_id',:'catalog_version_id','service_version_id',:'catalog_form'::jsonb->>'service_version_id','offer_revision',1,'origin','portal','answers','{}'::jsonb,'customer_id',NULL,'assignee_id',NULL),gen_random_uuid()) AS catalog_booking \gset
SELECT test.assert_true((:'catalog_booking'::jsonb->>'protocol')~'^AT-[0-9]{6,}$','catálogo: reserva cria solicitação com protocolo automático');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 AND min((snapshot->>'total_cents')::int)=2540 FROM public.request_items WHERE request_id=(:'catalog_booking'::jsonb->>'request_id')::uuid),'catálogo: preço fica capturado no pedido');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.request_categories','SELECT,INSERT,UPDATE,DELETE'),'solicitação: vínculo da categoria fechado à escrita direta');
ROLLBACK;
