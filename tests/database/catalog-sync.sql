-- Disposable laboratory only; real RPCs, snapshots and authorization.
RESET ROLE;
BEGIN;
SELECT o.office_id AS ocat,o.template_id AS tcat,o.service_id AS scat,sv.number AS vcat,sv.definition AS defcat FROM private.document_offerings o JOIN LATERAL(SELECT * FROM public.service_versions v WHERE v.office_id=o.office_id AND v.service_id=o.service_id ORDER BY v.number DESC LIMIT 1)sv ON true WHERE o.office_id='00000000-0000-4000-e000-000000000201' AND private.document_offer_projection(o,clock_timestamp()) IS NOT NULL ORDER BY o.template_id LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.service_publish(:'ocat',:'scat',(:'defcat'::jsonb||jsonb_build_object('checklist',jsonb_build_array('Documento complementar'),'effective_from',NULL)),:'vcat'::int,'Checklist publicado para conferência',gen_random_uuid());
RESET ROLE;
SELECT coalesce(private.document_offer_projection(o,clock_timestamp()),'null'::jsonb) AS ofcat FROM private.document_offerings o WHERE office_id=:'ocat' AND template_id=:'tcat' \gset
SELECT test.assert_true(:'ofcat'::jsonb IS NOT NULL AND :'ofcat'::jsonb->>'service_name' IS NOT NULL AND :'ofcat'::jsonb->>'can_book'='true','catalog: approved offer with checklist remains visible and bookable');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.document_offers_page(:'ocat',NULL,false,'',1,5,NULL) AS pagecat \gset
SELECT test.assert_true(:'pagecat'::jsonb->'items' @> jsonb_build_array(jsonb_build_object('template_id',:'tcat')),'catalog: client sees eligible folder/model/service');
SELECT public.document_booking_create(:'ocat',jsonb_build_object('template_id',:'tcat','template_version_id',:'ofcat'::jsonb->>'template_version_id','service_version_id',:'ofcat'::jsonb->>'service_version_id','offer_revision',(:'ofcat'::jsonb->>'offer_revision')::int,'origin','portal','answers',coalesce((SELECT jsonb_object_agg(v->>'key',CASE v->>'type' WHEN 'cpf' THEN '52998224725' WHEN 'cnpj' THEN '11222333000181' WHEN 'tax_id' THEN '52998224725' WHEN 'date' THEN '2026-01-01' WHEN 'money' THEN '1.00' WHEN 'number' THEN '1' ELSE 'Dados fictícios do laboratório' END) FROM jsonb_array_elements(:'ofcat'::jsonb->'variables') v WHERE v->>'required'='true'),'{}'::jsonb),'customer_id',NULL,'assignee_id',NULL),gen_random_uuid())->>'request_id' AS old_booking \gset
RESET ROLE;
SELECT snapshot AS old_booking_snapshot FROM public.request_items WHERE office_id=:'ocat' AND request_id=:'old_booking' \gset
SELECT number AS vcat,definition AS defcat FROM public.service_versions WHERE office_id=:'ocat' AND service_id=:'scat' ORDER BY number DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.service_publish(:'ocat',:'scat',(:'defcat'::jsonb||jsonb_build_object('fields',jsonb_build_array(jsonb_build_object('key','purpose','label','Finalidade','type','text','required',true)),'effective_from',NULL)),:'vcat'::int,'Informação adicional não torna oferta interna',gen_random_uuid());
RESET ROLE;
SELECT coalesce(private.document_offer_projection(o,clock_timestamp()),'null'::jsonb) AS fields_cat FROM private.document_offerings o WHERE office_id=:'ocat' AND template_id=:'tcat' \gset
SELECT test.assert_true(:'fields_cat'::jsonb IS NOT NULL AND (CASE WHEN to_regprocedure('private.portal_service_open33(uuid,jsonb,uuid)') IS NULL THEN :'fields_cat'::jsonb->>'can_book'='false' ELSE :'fields_cat'::jsonb->>'can_book'='true' AND jsonb_array_length(:'fields_cat'::jsonb->'service_fields')=1 END),'catalog: approved fields remain visible and use structured portal33 when installed');
SELECT test.assert_true(NOT(:'fields_cat'::jsonb ?| ARRAY['content','internal_note','actor_id']),'catalog: no private content leaks through public projection');
SELECT to_jsonb(o) AS stored_offer FROM private.document_offerings o WHERE office_id=:'ocat' AND template_id=:'tcat' \gset
SELECT max(number) AS vcat FROM public.service_versions WHERE office_id=:'ocat' AND service_id=:'scat' \gset
SET ROLE authenticated;
SELECT public.service_archive(:'ocat',:'scat',:'vcat'::int,'Excluir somente oferta futura em laboratório',gen_random_uuid());
RESET ROLE;
SELECT test.assert_true((SELECT private.document_offer_projection(o,clock_timestamp()) IS NULL FROM private.document_offerings o WHERE office_id=:'ocat' AND template_id=:'tcat'),'catalog: deleted service never reappears by synchronization');
-- Archiving detaches only the current association; the previous offer is retained.
SELECT test.assert_true((SELECT offering_snapshot=:'stored_offer'::jsonb FROM private.document_offering_detachments WHERE office_id=:'ocat' AND template_id=:'tcat' AND offer_revision=(:'stored_offer'::jsonb->>'revision')::int),'catalog: detached offer retains exact configuration and revision');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.document_offering_detachments','SELECT,INSERT,UPDATE,DELETE'),'catalog: detachments remain private');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.model_commercial_state(:'ocat',:'tcat') AS detached_state \gset
SELECT test.assert_true(:'detached_state'::jsonb->'offer'='null'::jsonb AND (:'detached_state'::jsonb->>'offer_revision')::int=(:'stored_offer'::jsonb->>'revision')::int,'catalog: archived service clears model selection but retains concurrency revision');
SELECT test.expect_error(format('SELECT public.document_offer_attach(%L,%L,%L,gen_random_uuid())',:'ocat',:'scat',:'tcat'),'PT404','catalog: archived service cannot be relinked');
SELECT public.service_create(:'ocat',:'defcat'::jsonb||jsonb_build_object('code','RELINK-CAT','name','Serviço novo após desvínculo','fields','[]'::jsonb,'effective_from',NULL),'Novo serviço de laboratório',gen_random_uuid())->>'id' AS relink_service \gset
SELECT gen_random_uuid() AS relink_key \gset
SELECT public.document_offer_attach(:'ocat',:'relink_service',:'tcat',:'relink_key') AS relink_offer \gset
SELECT test.assert_true(:'relink_offer'::jsonb->>'service_id'=:'relink_service' AND (:'relink_offer'::jsonb->>'offer_revision')::int>(:'stored_offer'::jsonb->>'revision')::int,'catalog: approved detached model links to new service with monotonic revision');
SELECT test.assert_true(public.document_offer_attach(:'ocat',:'relink_service',:'tcat',:'relink_key')=:'relink_offer'::jsonb,'catalog: relink retry is idempotent');
SELECT test.expect_error(format('SELECT public.document_offer_attach(%L,%L,%L,gen_random_uuid())',:'ocat',:'relink_service',:'tcat'),'PT409','catalog: current link requires explicit revisioned editing');
RESET ROLE;
SELECT private.service_category_id(:'ocat',(:'relink_offer'::jsonb->>'service_version_id')::uuid) AS relink_category \gset
SELECT revision AS relink_category_revision,name AS relink_category_name,execution_level AS relink_category_level FROM private.service_categories WHERE office_id=:'ocat' AND id=:'relink_category' \gset
SET ROLE authenticated;
SELECT public.service_categories_command(:'ocat',jsonb_build_object('kind','delete','category_id',:'relink_category','expected_revision',:'relink_category_revision'::int,'reason','Retirar categoria do catálogo preservando versões'),gen_random_uuid());
SELECT public.service_categories_state(:'ocat') AS archived_category_state \gset
SELECT test.assert_true(:'archived_category_state'::jsonb->'archived_items' @> jsonb_build_array(jsonb_build_object('id',:'relink_category')) AND NOT(:'archived_category_state'::jsonb->'items' @> jsonb_build_array(jsonb_build_object('id',:'relink_category'))),'catalog: authorized manager can find archived categories separately from active pickers');
SELECT public.service_categories_command(:'ocat',jsonb_build_object('kind','rename','category_id',:'relink_category','expected_revision',:'relink_category_revision'::int+1,'name','Categoria arquivada editada','execution_level',3,'reason','Editar metadados preservando arquivo'),gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.document_offers_page(:'ocat',NULL,false,'',1,5,NULL) AS archived_category_catalog \gset
SELECT test.assert_true(NOT(:'archived_category_catalog'::jsonb->'categories' @> jsonb_build_array(jsonb_build_object('id',:'relink_category'))) AND NOT(:'archived_category_catalog'::jsonb->'items' @> jsonb_build_array(jsonb_build_object('template_id',:'tcat'))),'catalog: archived canonical category and its offers leave client catalog');
SELECT test.expect_error(format('SELECT public.document_offers_page(%L,NULL,false,%L,1,5,%L)',:'ocat','',:'relink_category'),'PT422','catalog: client cannot force archived category by direct RPC');
SELECT test.assert_true(public.service_categories_state(:'ocat')->'archived_items'='[]'::jsonb,'catalog: client cannot inspect category management archive');
RESET ROLE;
SELECT test.assert_true((SELECT snapshot=:'old_booking_snapshot'::jsonb AND service_id=:'scat'::uuid FROM public.request_items WHERE office_id=:'ocat' AND request_id=:'old_booking'),'catalog: historical booking retains original service price and definition snapshot after relink');
SELECT test.assert_true((SELECT archived_at IS NOT NULL FROM public.services WHERE id=:'scat') AND (SELECT offering_snapshot=:'stored_offer'::jsonb FROM private.document_offering_detachments WHERE office_id=:'ocat' AND template_id=:'tcat' AND offer_revision=(:'stored_offer'::jsonb->>'revision')::int),'catalog: relink and category edits preserve old service and exact detached offering');
ROLLBACK;
