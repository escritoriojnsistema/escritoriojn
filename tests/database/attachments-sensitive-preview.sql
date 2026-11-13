-- Existing specialized30 fixture protocol, entirely rolled back.
RESET ROLE;
SELECT test.assert_true(to_regprocedure('public.specialized_command30(uuid,uuid,jsonb,uuid)') IS NOT NULL,'30: specialized command exists');
BEGIN;
SELECT '00000000-0000-4000-e000-000000000201' AS o30 \gset
SELECT i.id AS source_i30,i.service_id AS s30 FROM public.request_items i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.office_id=:'o30' AND r.status NOT IN('concluido','cancelado') AND r.assignee_id='00000000-0000-4000-b000-000000000201' ORDER BY i.created_at,i.id LIMIT 1 \gset
INSERT INTO public.customers(id,office_id,kind,name,created_by)VALUES('30000000-0000-4000-8000-000000000001',:'o30','person','Cliente Especializado fictício','00000000-0000-4000-a000-000000000201');
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,idempotency_key,payload_digest,triaged_at)
VALUES(:'o30','AT-Especializado30','Especializado fictício30','portal','00000000-0000-4000-a000-000000000205','00000000-0000-4000-b000-000000000201','30000000-0000-4000-8000-000000000001','normal',gen_random_uuid(),'fixture',clock_timestamp()) RETURNING id AS r30 \gset
INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)SELECT office_id,:'r30',service_id,version_id,snapshot,fields,participant_ids,checklist FROM public.request_items WHERE id=:'source_i30' RETURNING id AS i30 \gset
UPDATE private.service_categories SET execution_level=3 WHERE office_id=:'o30' AND id IN(SELECT category_id FROM private.service_version_categories WHERE office_id=:'o30' AND service_id=:'s30');

INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000202',code FROM public.permissions WHERE code IN('foundation.access','rural.read','rural.read_all','rural.create','rural.parties.manage','rural.records.manage','customers.read','customers.update','customers.read_all','requests.read','requests.read_all','requests.create','requests.update','requests.transfer','files.read','files.upload','checklists.read','checklists.update','checklists.waive','checklists.manage','services.manage','specialized.read','specialized.manage','specialized.conduct') ON CONFLICT DO NOTHING;
SELECT coalesce(max(version),0) AS cv30 FROM private.checklist_model_versions WHERE office_id=:'o30' AND service_id=:'s30' AND scope='internal' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.checklists_publish(:'o30',:'s30',:'cv30','{"name":"Checklist especializado fictício","items":[{"key":"documento","label":"Documento de identificação","requirement":"required","condition":null}]}','Modelo fictício30',gen_random_uuid(),'internal');
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','configure','item_id',:'i30','service_kind','aposentadoria','expected_version',0),gen_random_uuid());
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','open','item_id',:'i30'),gen_random_uuid())->>'id' AS c30 \gset
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{case,stage}'='recebido','30: case captures existing request and checklist');
SELECT public.specialized_command30(:'o30',:'r30',jsonb_build_object('kind','configure','item_id',:'i30','service_kind','juridico','expected_version',1),gen_random_uuid());
SELECT test.assert_true(public.specialized_state30(:'o30',:'r30',1)#>>'{case,kind}'='aposentadoria','30: versioned configuration never rewrites existing case');
SELECT public.specialized_command30(:'o30',:'r30','{"kind":"note","expected_version":1,"text":"ESTRATEGIA PRIVADA MEDICA30"}',gen_random_uuid());
SELECT public.files_begin_upload(:'o30',jsonb_build_object('request_id',:'r30','request_item_id',:'i30','name','medico-privado30.pdf','mime_type','application/pdf','size_bytes',100,'sha256',repeat('a',64),'classification','medico','idempotency_key',gen_random_uuid()::text),gen_random_uuid()) AS upload30 \gset
SELECT :'upload30'::jsonb#>>'{file,id}' AS f30,:'upload30'::jsonb->>'object_path' AS path30 \gset
SELECT test.assert_true(public.files_page(:'o30',:'r30',1,5)#>>'{items,0,classification}'='medico','30: explicitly capable owner receives medical metadata');
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.file_references WHERE file_id=:'f30' AND reference_kind='specialized30'),'30: restricted file protected from cleanup immediately');
SELECT test.expect_error(format('INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(%L,%L,%L)',:'o30',:'f30','checklist'),'PT403','30: sensitive file cannot become shared checklist/publication reference');

UPDATE public.files SET status='quarentena',validated_at=clock_timestamp(),validation_tool='attachments-byte-check/1',actual_sha256=sha256,actual_size_bytes=size_bytes,actual_mime_type=mime_type WHERE id=:'f30';
INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('request-attachments',:'path30','{"size":100,"mimetype":"application/pdf"}');
SET ROLE authenticated;
SELECT test.assert_true(public.files_preview(:'o30',:'f30',gen_random_uuid())->>'object_path'=:'path30','attachments: sensitive owner previews structurally validated quarantine');
SET storage.operation='object.get_authenticated';
SELECT test.assert_true((SELECT count(*)=1 FROM storage.objects WHERE name=:'path30'),'attachments: sensitive capability authorizes private Storage preview');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())',:'o30',:'f30'),'PT404','attachments: staff files.read without sensitive cannot preview medical bytes');
SELECT test.assert_true((SELECT count(*)=0 FROM storage.objects WHERE name=:'path30'),'attachments: Storage checks current sensitive capability');
RESET ROLE;
ROLLBACK;
