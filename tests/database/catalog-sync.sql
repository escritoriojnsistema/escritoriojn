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
RESET ROLE;
SELECT number AS vcat,definition AS defcat FROM public.service_versions WHERE office_id=:'ocat' AND service_id=:'scat' ORDER BY number DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.service_publish(:'ocat',:'scat',(:'defcat'::jsonb||jsonb_build_object('fields',jsonb_build_array(jsonb_build_object('key','purpose','label','Finalidade','type','text','required',true)),'effective_from',NULL)),:'vcat'::int,'Informação adicional não torna oferta interna',gen_random_uuid());
RESET ROLE;
SELECT coalesce(private.document_offer_projection(o,clock_timestamp()),'null'::jsonb) AS fields_cat FROM private.document_offerings o WHERE office_id=:'ocat' AND template_id=:'tcat' \gset
SELECT test.assert_true(:'fields_cat'::jsonb IS NOT NULL AND :'fields_cat'::jsonb->>'can_book'='false','catalog: informational approved offers stay visible when assisted intake is required');
SELECT test.assert_true(NOT(:'fields_cat'::jsonb ?| ARRAY['content','internal_note','actor_id']),'catalog: no private content leaks through public projection');
SELECT max(number) AS vcat FROM public.service_versions WHERE office_id=:'ocat' AND service_id=:'scat' \gset
SET ROLE authenticated;
SELECT public.service_archive(:'ocat',:'scat',:'vcat'::int,'Excluir somente oferta futura em laboratório',gen_random_uuid());
RESET ROLE;
SELECT test.assert_true((SELECT private.document_offer_projection(o,clock_timestamp()) IS NULL FROM private.document_offerings o WHERE office_id=:'ocat' AND template_id=:'tcat'),'catalog: deleted service never reappears by synchronization');
ROLLBACK;
