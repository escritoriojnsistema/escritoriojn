-- Run after templates.sql in the disposable database.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.model_folders_state(uuid)') IS NOT NULL,'commercial: folder state exists');
SELECT test.assert_true(to_regprocedure('public.model_folders_command(uuid,jsonb,uuid)') IS NOT NULL,'commercial: folder command exists');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201','{"kind":"create","name":"Contratos"}',gen_random_uuid()) AS folder_result \gset
SELECT :'folder_result'::jsonb->'folders'->0->>'id' AS folder_id \gset
SELECT test.assert_true(jsonb_array_length(:'folder_result'::jsonb->'folders')=1,'commercial: owner creates folder');
SELECT test.expect_error(format('SELECT public.model_folders_command(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','rename','folder_id',:'folder_id','expected_revision',0,'name','Outro')::text),'PT409','commercial: stale folder revision rejected');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.expect_error($q$SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201','{"kind":"create","name":"Teste"}',gen_random_uuid())$q$,'PT403','commercial: employee cannot manage folders');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(to_regprocedure('public.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer)') IS NOT NULL,'commercial: filtered page exists');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT id AS commercial_tid FROM test.templates_saved20 LIMIT 1 \gset
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'commercial_tid','{"kind":"rename","name":"Novo nome"}',0,gen_random_uuid()) AS renamed \gset
SELECT test.assert_true(:'renamed'::jsonb @> '{"display_name":"Novo nome","revision":1}','commercial: rename current metadata');
SELECT test.assert_true(public.document_options('00000000-0000-4000-e000-000000000201','templates',NULL,'Novo nome',1)->>'total'<>'0','commercial: renamed title visible in legacy approved model picker');
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',NULL,false,false,'Novo nome',1,5)->>'total'='1','commercial: current name used before pagination');
SELECT test.expect_error(format('SELECT public.model_metadata_command(%L,%L,%L::jsonb,0,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'commercial_tid','{"kind":"archive"}'),'PT409','commercial: stale metadata rejected');
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'commercial_tid','{"kind":"archive"}',1,gen_random_uuid()) AS archived \gset
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',NULL,false,true,'Novo nome',1,5)->>'total'='1','commercial: archived page');
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'commercial_tid','{"kind":"restore"}',2,gen_random_uuid());
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT id AS source_tid FROM test.templates_saved20 LIMIT 1 \gset
RESET ROLE;
SELECT id AS source_vid FROM public.template_versions WHERE template_id=:'source_tid' ORDER BY number DESC LIMIT 1 \gset
SET ROLE authenticated;
SELECT gen_random_uuid() AS dupkey \gset
SELECT public.model_duplicate('00000000-0000-4000-e000-000000000201',:'source_tid',:'source_vid','COPIA-TESTE','Copia Teste',:'dupkey') AS duplicated \gset
SELECT test.assert_true(:'duplicated'::jsonb->'versions'->0->'approved_at'='null'::jsonb,'commercial: duplicate is an unapproved draft');
SELECT test.assert_true(public.model_duplicate('00000000-0000-4000-e000-000000000201',:'source_tid',:'source_vid','COPIA-TESTE','Copia Teste',:'dupkey')->>'id'=:'duplicated'::jsonb->>'id','commercial: duplicate retry uses same template');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT gen_random_uuid() AS movekey \gset
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'source_tid','folder_id',:'folder_id','expected_revision',0),:'movekey') AS moved \gset
SELECT test.assert_true(:'moved'::jsonb->'locations' @> jsonb_build_array(jsonb_build_object('template_id',:'source_tid','folder_id',:'folder_id','revision',1)),'commercial: move records location');
SELECT test.assert_true(public.model_templates_page('00000000-0000-4000-e000-000000000201',:'folder_id',false,false,'',1,5)->>'total'='1','commercial: folder filter before pagination');
SELECT test.expect_error(format('SELECT public.model_folders_command(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','delete','folder_id',:'folder_id','expected_revision',1)::text),'PT409','commercial: nonempty folder cannot be deleted');
SELECT test.assert_true(public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'source_tid','folder_id',:'folder_id','expected_revision',0),:'movekey')->'locations' @> jsonb_build_array(jsonb_build_object('template_id',:'source_tid','revision',1)),'commercial: move retry is idempotent');
SELECT test.expect_error(format('SELECT public.model_folders_command(%L,%L::jsonb,%L)','00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'source_tid','folder_id',NULL,'expected_revision',1)::text,:'movekey'),'PT409','commercial: changed payload retry rejected');
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','move','template_id',:'source_tid','folder_id',NULL,'expected_revision',1),gen_random_uuid());
SELECT public.model_folders_command('00000000-0000-4000-e000-000000000201',jsonb_build_object('kind','delete','folder_id',:'folder_id','expected_revision',1),gen_random_uuid());
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_class WHERE oid IN('private.model_folders'::regclass,'private.model_locations'::regclass,'private.model_folder_commands'::regclass,'private.model_metadata'::regclass,'private.model_metadata_events'::regclass,'private.model_duplicate_commands'::regclass) AND (NOT relrowsecurity OR has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE'))),'commercial: table ACL and RLS closed');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT (public.template_detail('00000000-0000-4000-e000-000000000201',:'source_tid',1)->>'latest_version')::integer AS source_latest \gset
SELECT public.template_save('00000000-0000-4000-e000-000000000201',:'source_tid',test.template_definition20()||'{"demonstration":false}',:'source_latest','Versão de teste contratável',gen_random_uuid()) AS sellable \gset
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',:'source_tid',(:'sellable'::jsonb->'versions'->0->>'id')::uuid,(:'sellable'::jsonb->>'latest_version')::integer,'Aprovação fictícia para teste',gen_random_uuid());
SELECT public.model_metadata_command('00000000-0000-4000-e000-000000000201',:'source_tid','{"kind":"rename","name":"Novo nome"}',4,gen_random_uuid());
SELECT public.service_create('00000000-0000-4000-e000-000000000201','{"code":"OFERTA-TESTE","name":"Servico teste","category":"Teste","unit":"unidade","price_cents":1234,"effective_from":null,"person_required":false,"participants_min":0,"approval_required":false,"signature_required":false,"settlement_required":true,"required_capabilities":[],"fields":[],"checklist":[],"quantity_min":1,"quantity_max":1,"max_discount_bps":0,"max_surcharge_bps":0,"allow_courtesy":false,"allow_price_override":false}','Oferta de teste',gen_random_uuid())->>'id' AS commercial_service \gset
SELECT jsonb_build_object('service_id',:'commercial_service','instructions','Traga documentos','execution_level',2,'portal_enabled',false,'intake_keys','[]'::jsonb,'required_intake_keys','[]'::jsonb,'allow_self_approval',false) AS commercial_offer \gset
SELECT public.document_offer_manage('00000000-0000-4000-e000-000000000201',:'source_tid',:'commercial_offer',0,gen_random_uuid()) AS offer \gset
SELECT test.assert_true(:'offer'::jsonb @> jsonb_build_object('service_id',:'commercial_service','revision',1,'execution_level',2),'commercial: offer references existing service');
SELECT test.expect_error(format('SELECT public.document_offer_manage(%L,%L,%L::jsonb,0,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'source_tid',:'commercial_offer'),'PT409','commercial: stale offer update rejected');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_offer_manage('00000000-0000-4000-e000-000000000201',:'source_tid',(:'commercial_offer'::jsonb||'{"portal_enabled":true}'),1,gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.document_offer_form('00000000-0000-4000-e000-000000000201',:'source_tid') AS public_offer \gset
SELECT test.assert_true(:'public_offer'::jsonb->>'price_cents'='1234' AND NOT (:'public_offer'::jsonb ?| ARRAY['content','execution_level','allow_self_approval']),'commercial: client gets real price without internals');
SELECT test.assert_true(public.document_offers_page('00000000-0000-4000-e000-000000000201',NULL,false,'',1,5)->>'total'='1','commercial: client sees published offer');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.document_presence_update('00000000-0000-4000-e000-000000000201','available',2) @> '{"status":"available","capacity":2,"session_current":true}','commercial: own presence update');
SELECT test.expect_error($q$SELECT public.document_presence_update('00000000-0000-4000-e000-000000000201','available',11)$q$,'PT422','commercial: invalid capacity rejected');
RESET ROLE;
UPDATE private.document_presence SET last_seen=clock_timestamp()-interval '91 seconds' WHERE membership_id='00000000-0000-4000-b000-000000000201';
SET ROLE authenticated;
SELECT test.assert_true(public.document_presence_state('00000000-0000-4000-e000-000000000201')->>'status'='offline','commercial: stale presence offline');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error($q$SELECT public.document_presence_state('00000000-0000-4000-e000-000000000201')$q$,'PT403','commercial: client cannot see staff presence');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.document_offer_form('00000000-0000-4000-e000-000000000201',:'source_tid') AS book_form \gset
SELECT jsonb_build_object('template_id',:'source_tid','template_version_id',:'book_form'::jsonb->>'template_version_id','service_version_id',:'book_form'::jsonb->>'service_version_id','offer_revision',(:'book_form'::jsonb->>'offer_revision')::integer,'origin','portal','answers','{}'::jsonb,'customer_id',NULL,'assignee_id',NULL) AS booking_input \gset
SELECT gen_random_uuid() AS booking_key \gset
SELECT public.document_booking_create('00000000-0000-4000-e000-000000000201',:'booking_input',:'booking_key') AS booked \gset
SELECT test.assert_true(:'booked'::jsonb ? 'request_id','commercial: portal booking creates request');
SELECT test.assert_true(public.document_booking_create('00000000-0000-4000-e000-000000000201',:'booking_input',:'booking_key')->>'request_id'=:'booked'::jsonb->>'request_id','commercial: booking retry returns same request');
SELECT test.expect_error(format('SELECT public.document_booking_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',(:'booking_input'::jsonb||'{"offer_revision":1}')::text),'PT409','commercial: stale offer rejected at booking');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 AND min((i.snapshot->>'total_cents')::integer)=1234 FROM public.request_items i WHERE request_id=(:'booked'::jsonb->>'request_id')::uuid),'commercial: one item retains real price snapshot');
SELECT test.assert_true((SELECT count(*)=1 FROM private.document_intakes WHERE request_id=(:'booked'::jsonb->>'request_id')::uuid),'commercial: one intake retained');
SELECT private.document_active_load('00000000-0000-4000-e000-000000000201','00000000-0000-4000-b000-000000000201')+1 AS commercial_capacity \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_offer_manage('00000000-0000-4000-e000-000000000201',:'source_tid',(:'commercial_offer'::jsonb||'{"portal_enabled":true,"execution_level":1}'),2,gen_random_uuid());
SELECT public.document_presence_update('00000000-0000-4000-e000-000000000201','available',:'commercial_capacity');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.document_offer_form('00000000-0000-4000-e000-000000000201',:'source_tid') AS level1form \gset
SELECT jsonb_set(:'booking_input'::jsonb,'{offer_revision}',:'level1form'::jsonb->'offer_revision') AS level1booking \gset
SELECT public.document_booking_create('00000000-0000-4000-e000-000000000201',:'level1booking',gen_random_uuid()) AS assigned_booking \gset
SELECT public.document_booking_create('00000000-0000-4000-e000-000000000201',:'level1booking',gen_random_uuid()) AS waiting_booking \gset
RESET ROLE;
SELECT test.assert_true((SELECT assignee_id='00000000-0000-4000-b000-000000000201' AND status='aberto' FROM public.requests WHERE id=(:'assigned_booking'::jsonb->>'request_id')::uuid),'commercial: exact execution level receives available slot');
SELECT test.assert_true((SELECT assignee_id IS NULL AND status='aguardando_responsavel' FROM public.requests WHERE id=(:'waiting_booking'::jsonb->>'request_id')::uuid),'commercial: full slot waits');
SELECT request_item_id AS assigned_item FROM private.document_intakes WHERE request_id=(:'assigned_booking'::jsonb->>'request_id')::uuid \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.document_intake_view('00000000-0000-4000-e000-000000000201',(:'assigned_booking'::jsonb->>'request_id')::uuid,:'assigned_item')->>'template_version_id'=:'level1form'::jsonb->>'template_version_id','commercial: staff sees contracted intake');
SELECT public.document_intake_start('00000000-0000-4000-e000-000000000201',(:'assigned_booking'::jsonb->>'request_id')::uuid,:'assigned_item','[]'::jsonb,gen_random_uuid()) AS started_document \gset
SELECT gen_random_uuid() AS apply_key \gset
SELECT public.document_intake_apply('00000000-0000-4000-e000-000000000201',(:'started_document'::jsonb->>'id')::uuid,1,:'apply_key') AS applied_document \gset
SELECT test.assert_true(:'applied_document'::jsonb->>'id'=:'started_document'::jsonb->>'id','commercial: intake applies explicitly to existing editor');
SELECT test.assert_true(public.document_intake_apply('00000000-0000-4000-e000-000000000201',(:'started_document'::jsonb->>'id')::uuid,1,:'apply_key')->>'id'=:'started_document'::jsonb->>'id','commercial: intake apply retry is idempotent');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.model_commercial_state('00000000-0000-4000-e000-000000000201',:'source_tid') @> '{"can_manage":true,"can_manage_metadata":true,"metadata":{"display_name":"Novo nome","revision":5},"offer":{"execution_level":1}}','commercial: staff reads current metadata and offer');
SELECT test.expect_error(format('SELECT public.document_offer_manage(%L,%L,%L::jsonb,0,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'duplicated'::jsonb->>'id',(:'commercial_offer'::jsonb||'{"portal_enabled":true}')::text),'PT409','commercial: unapproved draft cannot be published');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',(:'duplicated'::jsonb->>'id')::uuid,(:'duplicated'::jsonb->'versions'->0->>'id')::uuid,1,'Aprovação demonstrativa de teste',gen_random_uuid());
SELECT test.expect_error(format('SELECT public.document_offer_manage(%L,%L,%L::jsonb,0,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'duplicated'::jsonb->>'id',(:'commercial_offer'::jsonb||'{"portal_enabled":true}')::text),'PT409','commercial: approved demonstration cannot be sold');
RESET ROLE;
SELECT customer_id AS triage_customer FROM public.requests WHERE office_id='00000000-0000-4000-e000-000000000201' AND customer_id IS NOT NULL LIMIT 1 \gset
SELECT version AS triage_version FROM public.requests WHERE id=(:'assigned_booking'::jsonb->>'request_id')::uuid \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.document_intake_is_booked('00000000-0000-4000-e000-000000000201',(:'assigned_booking'::jsonb->>'request_id')::uuid),'commercial: scoped booking marker');
SELECT public.request_mutate('00000000-0000-4000-e000-000000000201',(:'assigned_booking'::jsonb->>'request_id')::uuid,:'triage_version',jsonb_build_object('kind','triage','customer_id',:'triage_customer','items','[]'::jsonb,'reason','Conferência de teste'),gen_random_uuid()) AS triaged_booking \gset
RESET ROLE;
SELECT test.assert_true((SELECT customer_id=:'triage_customer'::uuid AND triaged_at IS NOT NULL FROM public.requests WHERE id=(:'assigned_booking'::jsonb->>'request_id')::uuid) AND (SELECT count(*)=1 FROM public.request_items WHERE request_id=(:'assigned_booking'::jsonb->>'request_id')::uuid),'commercial: triage links checked customer without duplicating item');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.charges_create('00000000-0000-4000-e000-000000000201',(:'assigned_booking'::jsonb->>'request_id')::uuid,'[{"due_date":"2027-01-01","amount_cents":1234}]',gen_random_uuid()) AS commercial_charge \gset
SELECT test.assert_true(:'commercial_charge'::jsonb->'charge'->>'id' IS NOT NULL,'commercial: real charge creation commits with deferred dispatch');
RESET ROLE;
SELECT definition||'{"price_cents":1500,"effective_from":null}'::jsonb AS changed_service FROM public.service_versions WHERE office_id='00000000-0000-4000-e000-000000000201' AND service_id=:'commercial_service' ORDER BY number DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.service_publish('00000000-0000-4000-e000-000000000201',:'commercial_service',:'changed_service',1,'Novo preço fictício',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_booking_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'level1booking'),'PT409','commercial: changed service price conflicts with displayed form');
RESET ROLE;
SELECT test.assert_true((SELECT (snapshot->>'total_cents')::integer=1234 FROM public.request_items WHERE id=:'assigned_item'),'commercial: later price change does not rewrite prior snapshot');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.template_save('00000000-0000-4000-e000-000000000201',NULL,test.template_definition20()||'{"code":"MANUAL-OFERTA","name":"Campos manuais de teste","demonstration":false,"content":"Dados {{documento.nome}} e {{documento.cpf}}.","variables":[{"key":"documento.nome","label":"Nome","type":"text","required":true},{"key":"documento.cpf","label":"CPF","type":"cpf","required":true}]}',0,'Cadastro fictício',gen_random_uuid()) AS manual_template \gset
SELECT public.template_approve('00000000-0000-4000-e000-000000000201',(:'manual_template'::jsonb->>'id')::uuid,(:'manual_template'::jsonb->'versions'->0->>'id')::uuid,1,'Aprovação fictícia',gen_random_uuid());
SELECT public.service_create('00000000-0000-4000-e000-000000000201',:'changed_service'::jsonb||'{"code":"OFERTA-MANUAL","effective_from":null}','Preço fictício de teste',gen_random_uuid())->>'id' AS manual_service \gset
SELECT public.document_offer_manage('00000000-0000-4000-e000-000000000201',(:'manual_template'::jsonb->>'id')::uuid,jsonb_build_object('service_id',:'manual_service','instructions','','execution_level',1,'portal_enabled',true,'intake_keys',jsonb_build_array('documento.nome','documento.cpf'),'required_intake_keys',jsonb_build_array('documento.nome','documento.cpf'),'allow_self_approval',false),0,gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.document_offer_form('00000000-0000-4000-e000-000000000201',(:'manual_template'::jsonb->>'id')::uuid) AS manual_form \gset
SELECT jsonb_build_object('template_id',:'manual_form'::jsonb->>'template_id','template_version_id',:'manual_form'::jsonb->>'template_version_id','service_version_id',:'manual_form'::jsonb->>'service_version_id','offer_revision',(:'manual_form'::jsonb->>'offer_revision')::integer,'origin','portal','answers',jsonb_build_object('documento.nome','Pessoa fictícia','documento.cpf','52998224725'),'customer_id',NULL,'assignee_id',NULL) AS manual_booking \gset
SELECT test.expect_error(format('SELECT public.document_booking_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',jsonb_set(:'manual_booking'::jsonb,'{answers,documento.cpf}','"11111111111"')::text),'PT422','commercial: invalid CPF answer rejected');
SELECT test.expect_error(format('SELECT public.document_booking_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',jsonb_set(:'manual_booking'::jsonb,'{answers}','{"documento.nome":"Pessoa fictícia"}')::text),'PT422','commercial: required intake answer missing');
SELECT public.document_booking_create('00000000-0000-4000-e000-000000000201',:'manual_booking',gen_random_uuid()) AS manual_booked \gset
RESET ROLE;
SELECT test.assert_true((SELECT answers @> '{"documento.nome":"Pessoa fictícia","documento.cpf":"52998224725"}'::jsonb FROM private.document_intakes WHERE request_id=(:'manual_booked'::jsonb->>'request_id')::uuid),'commercial: valid typed declaration captured privately');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true((public.document_dispatch_page('00000000-0000-4000-e000-000000000201',1,5)->>'members_total')::integer>=1,'commercial: authorized manager sees availability');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error($q$SELECT public.document_dispatch_page('00000000-0000-4000-e000-000000000201',1,5)$q$,'PT403','commercial: client cannot see dispatch roster');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT public.template_save('00000000-0000-4000-e000-000000000201',(:'duplicated'::jsonb->>'id')::uuid,test.template_definition20()||'{"code":"COPIA-TESTE","name":"Nome editorial da equipe"}',1,'Edição autorizada',gen_random_uuid());
SELECT test.assert_true(public.model_commercial_state('00000000-0000-4000-e000-000000000201',(:'duplicated'::jsonb->>'id')::uuid)->'metadata'->>'display_name'='Copia Teste','commercial: employee edits content without managing catalog metadata');
RESET ROLE;
SELECT version AS awaiting_version FROM public.requests WHERE id=(:'assigned_booking'::jsonb->>'request_id')::uuid \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.request_mutate('00000000-0000-4000-e000-000000000201',(:'assigned_booking'::jsonb->>'request_id')::uuid,:'awaiting_version','{"kind":"status","status":"aguardando_cliente","reason":"Aguardando cliente"}',gen_random_uuid());
RESET ROLE;
SELECT version AS resume_version FROM public.requests WHERE id=(:'assigned_booking'::jsonb->>'request_id')::uuid \gset
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.request_mutate(%L,%L,%s,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'assigned_booking'::jsonb->>'request_id',:'resume_version','{"kind":"status","status":"em_atendimento","reason":"Retomar trabalho"}'),'PT409','commercial: resuming execution respects occupied capacity');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.service_create('00000000-0000-4000-e000-000000000201',:'changed_service'::jsonb||'{"code":"OFERTA-CHECK","effective_from":null,"checklist":["Conferir pessoalmente"]}','Preço fictício de teste',gen_random_uuid())->>'id' AS checklist_service \gset
SELECT test.expect_error(format('SELECT public.document_offer_manage(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'manual_template'::jsonb->>'id',(:'commercial_offer'::jsonb||jsonb_build_object('service_id',:'checklist_service','portal_enabled',true))::text),'PT409','commercial: incompatible service cannot be published');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.service_create('00000000-0000-4000-e000-000000000201',:'changed_service'::jsonb||'{"code":"OFERTA-CAMPO","effective_from":null,"fields":[{"key":"obs","label":"Observação","type":"text","required":false}]}','Preço fictício de teste',gen_random_uuid())->>'id' AS field_service \gset
SELECT test.expect_error(format('SELECT public.document_offer_manage(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000201',:'manual_template'::jsonb->>'id',(:'commercial_offer'::jsonb||jsonb_build_object('service_id',:'field_service','portal_enabled',true))::text),'PT409','commercial: unsupported optional service field cannot be published');
RESET ROLE;
