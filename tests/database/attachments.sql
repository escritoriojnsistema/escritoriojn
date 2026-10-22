CREATE FUNCTION test.fixture_responsible(p_protocol text,p_member uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r public.requests;u uuid;
BEGIN
 SELECT * INTO r FROM public.requests WHERE protocol=p_protocol AND office_id=(SELECT office_id FROM public.memberships WHERE id=p_member);
 SELECT user_id INTO u FROM public.memberships WHERE id=p_member AND office_id=r.office_id;
 UPDATE private.request_assignments SET ended_at=clock_timestamp() WHERE request_id=r.id AND ended_at IS NULL;
 UPDATE public.requests SET assignee_id=p_member WHERE id=r.id;
 INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id) VALUES(r.office_id,r.id,p_member,u);
END $$;
-- Metadata-only provider stub; real byte transport is exercised by tests/auth.
SELECT test.assert_true(to_regclass('public.files') IS NOT NULL AND to_regclass('private.upload_intents') IS NOT NULL,'anexos: pipeline privado instalado');
SELECT test.assert_true((SELECT count(*)=4 FROM public.role_permissions WHERE role_code='owner' AND permission_code LIKE 'files.%') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'files.%'),'anexos: quatro capacidades independentes seed somente owner');
SELECT test.assert_true((SELECT count(*)=9 AND bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'files_%'),'anexos: nove wrappers invoker search_path vazio');
SELECT test.assert_true(NOT has_table_privilege('authenticated','public.files','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.upload_intents','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('authenticated','public.files_process_complete(uuid,text,jsonb,uuid)','EXECUTE') AND has_function_privilege('service_role','public.files_process_complete(uuid,text,jsonb,uuid)','EXECUTE'),'anexos: metadados e finalizacao com ACL minima');
SELECT test.assert_true((SELECT NOT public AND file_size_limit=10485760 AND allowed_mime_types=ARRAY['application/pdf','image/png','image/jpeg'] FROM storage.buckets WHERE id='request-attachments'),'anexos: bucket privado limitado a dez MiB e tres tipos');
INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT '00000000-0000-4000-b000-000000000092',unnest(ARRAY['files.read','files.upload','files.copy','files.manage']);
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000094','files.read');
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,priority,idempotency_key,payload_digest)VALUES('00000000-0000-4000-e000-000000000091','ANEXO-11','Anexos ficticios11','presencial','00000000-0000-4000-a000-000000000091','00000000-0000-4000-b000-000000000091','normal',gen_random_uuid(),'fixture11')RETURNING id AS request11 \gset
INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)SELECT office_id,:'request11',service_id,version_id,snapshot,fields,participant_ids,checklist FROM public.request_items ORDER BY created_at LIMIT 1 RETURNING id AS item11,service_id AS service11 \gset
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,priority,idempotency_key,payload_digest)VALUES('00000000-0000-4000-e000-000000000091','ANEXO-PORTAL-11','Envio proprio11','portal','00000000-0000-4000-a000-000000000095','normal',gen_random_uuid(),'fixture11')RETURNING id AS portal11 \gset
SELECT jsonb_build_object('request_id',:'request11','request_item_id',:'item11','name','Documento ficticio.pdf','mime_type','application/pdf','size_bytes',100,'sha256',repeat('a',64),'classification','documento','idempotency_key','intention11')AS upload11 \gset
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.files_page('00000000-0000-4000-e000-000000000091',NULL,1,3)$q$,'42501','anexos: anon sem RPC');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.files_page('00000000-0000-4000-e000-000000000091',NULL,1,3)$q$,'PT401','anexos: identidade e sessao reais obrigatorias');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000096","session_id":"00000000-0000-4000-c000-000000000096","user_metadata":{"role":"owner"}}';
SELECT test.expect_error($q$SELECT public.files_page('00000000-0000-4000-e000-000000000091',NULL,1,3)$q$,'PT403','anexos: metadata nao concede files.read');
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.files_page('00000000-0000-4000-e000-000000000091',NULL,1,3)->>'total'='0','anexos: lista vazia utilizavel');
SELECT test.expect_error($q$SELECT public.files_page('00000000-0000-4000-e000-000000000091',NULL,0,3)$q$,'PT422','anexos: paginacao limitada');
SELECT test.assert_true(public.files_requests_page('00000000-0000-4000-e000-000000000091','Anexos ficticios11',1,3)->'items'->0->'items'->0 ?& ARRAY['id','service_id','name','policy'] AND NOT (public.files_requests_page('00000000-0000-4000-e000-000000000091','Anexos ficticios11',1,3)::text ~ 'price_cents|internal_note|participant_ids'),'anexos: seletores so retornam nome item e politica sem preco');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"request_item_id":null}')::text),'PT422','anexos: pedido com itens exige item correspondente');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"size_bytes":10485761}')::text),'PT422','anexos: excesso negado antes do Storage');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"name":"enganoso.exe"}')::text),'PT422','anexos: extensao enganosa negada');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"classification":"outro"}')::text),'PT422','anexos: classificacao desconhecida negada');
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',:'upload11',gen_random_uuid()) AS intent11 \gset
SELECT :'intent11'::jsonb->'file'->>'id' AS file11,:'intent11'::jsonb->>'intent_id' AS intention11,:'intent11'::jsonb->>'object_path' AS path11 \gset
SELECT test.assert_true((:'intent11'::jsonb->>'can_upload')::boolean AND :'intent11'::jsonb->'file' @> '{"status":"aguardando_upload","scanner_status":"not_configured","can_validate":true,"can_download":false,"can_copy":false}'::jsonb AND :'intent11'::jsonb->'file'->>'intent_id'=:'intention11','anexos: intencao persistida tem estado e capacidade de retomada');
SELECT test.assert_true(:'path11' ~ '^00000000-0000-4000-e000-000000000091/[0-9a-f-]{36}/[0-9a-f-]{36}$' AND :'path11' !~ 'Documento|pdf','anexos: caminho aleatorio sem nome ou identificador pessoal');
SELECT test.assert_true(public.files_begin_upload('00000000-0000-4000-e000-000000000091',:'upload11',gen_random_uuid())->>'intent_id'=:'intention11','anexos: repeticao devolve mesma intencao');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"name":"Outro.pdf"}')::text),'PT409','anexos: mesma chave com payload diferente conflita');
SET storage.operation='object.upload';
INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('request-attachments',:'path11','{"size":100,"mimetype":"application/pdf"}');
SELECT test.assert_true(NOT(public.files_begin_upload('00000000-0000-4000-e000-000000000091',:'upload11',gen_random_uuid())->>'can_upload')::boolean,'anexos: objeto existente nao e sobrescrito na retomada');
SELECT test.assert_true((SELECT count(*) FROM storage.objects WHERE name=:'path11')=0,'anexos: upload aguardando nao pode ser lido no Storage');
SELECT test.expect_error(format('INSERT INTO storage.objects(bucket_id,name,metadata)VALUES(%L,%L,%L)','request-attachments','00000000-0000-4000-e000-000000000091/00000000-0000-4000-f000-000000000001/00000000-0000-4000-f000-000000000002','{"size":1}'),'42501','anexos: caminho inventado sem intencao negado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000093","session_id":"00000000-0000-4000-c000-000000000093"}';
SELECT test.expect_error(format('INSERT INTO storage.objects(bucket_id,name)VALUES(%L,%L)','request-attachments',:'path11'),'42501','anexos: outro escritorio nao usa caminho conhecido');
SELECT test.expect_error(format('SELECT public.files_download(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'file11'),'PT403','anexos: outro escritorio nao baixa por UUID');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000094","session_id":"00000000-0000-4000-c000-000000000094"}';
SELECT test.expect_error(format('SELECT public.files_page(%L,%L,1,3)','00000000-0000-4000-e000-000000000091',:'request11'),'PT404','anexos: files.read nao amplia escopo do pedido');
SELECT test.expect_error(format('SELECT public.files_page(%L,%L,1,3)','00000000-0000-4000-e000-000000000091',:'portal11'),'PT404','anexos: responsavel NULL falha fechado para equipe fora do escopo');

RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000092');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||jsonb_build_object('request_id',:'portal11','request_item_id',NULL,'idempotency_key','null-scope11'))::text),'PT404','anexos: responsavel NULL nao concede upload fora de escopo');
SELECT test.assert_true(public.files_page('00000000-0000-4000-e000-000000000091',:'request11',1,3)->'items'->0->>'intent_id' IS NULL AND NOT(public.files_page('00000000-0000-4000-e000-000000000091',:'request11',1,3)->'items'->0->>'can_validate')::boolean,'anexos: responsavel atual le metadados mas nao valida upload alheio');
SELECT test.expect_error(format('SELECT public.files_process_claim(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091','validate',jsonb_build_object('intent_id',:'intention11')),'PT403','anexos: validacao exige autor e sessao da intencao');
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','validate',jsonb_build_object('intent_id',:'intention11'),gen_random_uuid())AS lease11 \gset
SELECT test.assert_true(public.files_process_claim('00000000-0000-4000-e000-000000000091','validate',jsonb_build_object('intent_id',:'intention11'),gen_random_uuid())->>'lease_id'=:'lease11'::jsonb->>'lease_id','anexos: lease repetido idempotente');
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'lease11'::jsonb->>'lease_id',:'lease11'::jsonb->>'lease_token','{"outcome":"validated"}'),'42501','anexos: navegador nao finaliza metadados');
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'lease11'::jsonb->>'lease_id','token-forjado','{"outcome":"validated"}'),'PT403','anexos: token de lease forjado negado');
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'lease11'::jsonb->>'lease_id',:'lease11'::jsonb->>'lease_token','{"outcome":"clean"}'),'PT422','anexos: worker nao pode inventar scanner clean');
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'lease11'::jsonb->>'lease_id',:'lease11'::jsonb->>'lease_token',jsonb_build_object('outcome','validated','sha256',repeat('b',64),'size_bytes',100,'mime_type','application/pdf')),'PT422','anexos: hash final divergente nunca valida');
SELECT test.assert_true(public.files_process_complete((:'lease11'::jsonb->>'lease_id')::uuid,:'lease11'::jsonb->>'lease_token','{"outcome":"missing","reason":"object_missing"}',gen_random_uuid())->'file'->>'status'='aguardando_upload','anexos: objeto ausente continua recuperavel');
SELECT public.files_process_complete((:'lease11'::jsonb->>'lease_id')::uuid,:'lease11'::jsonb->>'lease_token',jsonb_build_object('outcome','validated','sha256',repeat('a',64),'size_bytes',100,'mime_type','application/pdf'),gen_random_uuid())AS completed11 \gset
SELECT test.assert_true(:'completed11'::jsonb->'file' @> '{"status":"quarentena","scanner_status":"not_configured","can_validate":false,"can_download":false,"can_copy":false}'::jsonb,'anexos: formato e hash validos ficam em quarentena sem scanner');
SELECT test.assert_true(public.files_process_complete((:'lease11'::jsonb->>'lease_id')::uuid,:'lease11'::jsonb->>'lease_token',jsonb_build_object('outcome','validated','sha256',repeat('a',64),'size_bytes',100,'mime_type','application/pdf'),gen_random_uuid())=:'completed11'::jsonb,'anexos: conclusao repetida devolve resultado persistido');
RESET ROLE;
SELECT test.assert_true((SELECT validation_tool='attachments-byte-check/1' AND actual_sha256=sha256 FROM public.files WHERE id=:'file11'),'anexos: ferramenta fixa e hash efetivo persistidos');
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.files_download(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'file11'),'PT409','anexos: quarentena nunca gera download');
SELECT test.assert_true((SELECT count(*) FROM storage.objects WHERE name=:'path11')=0,'anexos: quarentena bloqueia Storage SELECT direto');
RESET ROLE;
-- This trusted fixture models a future scanner result; no scanner-release RPC exists.
UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id=:'file11';
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='files.upload';
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000092');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT test.assert_true(NOT(public.files_page('00000000-0000-4000-e000-000000000091',:'request11',1,3)->'items'->0->>'can_copy')::boolean,'anexos: files.copy sem upload nao anuncia copia que exige escrita no destino');
SELECT test.expect_error(format('SELECT public.files_process_claim(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091','copy',jsonb_build_object('source_file_id',:'file11','target_request_id',:'request11','target_item_id',:'item11','idempotency_key','copy-without-upload11')),'PT403','anexos: copia exige capacidade adicional de upload no destino');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','files.upload');
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SET storage.operation='object.get_authenticated';
SELECT test.assert_true(public.files_download('00000000-0000-4000-e000-000000000091',:'file11',gen_random_uuid())->>'object_path'=:'path11' AND(SELECT count(*) FROM storage.objects WHERE name=:'path11')=1,'anexos: download JWT exige disponibilidade clean e escopo');
SET storage.operation='object.sign';
SELECT test.assert_true((SELECT count(*) FROM storage.objects WHERE name=:'path11')=0,'anexos: assinatura URL negada mesmo para arquivo disponivel');
SET storage.operation='object.list';
SELECT test.assert_true((SELECT count(*) FROM storage.objects WHERE name=:'path11')=0,'anexos: listagem Storage nao expoe objetos');
SET storage.operation='object.get_authenticated';
SELECT public.files_policy_set('00000000-0000-4000-e000-000000000091',:'service11',1,50,ARRAY['application/pdf'],'Limite ficticio11',gen_random_uuid())AS policy11 \gset
SELECT test.assert_true(:'policy11'::jsonb->>'version'='2' AND :'policy11'::jsonb->>'max_bytes'='50','anexos: politica por servico independente versionada');
SELECT test.assert_true(public.files_begin_upload('00000000-0000-4000-e000-000000000091',:'upload11',gen_random_uuid())->>'intent_id'=:'intention11','anexos: repeticao conserva politica capturada quando politica atual muda');
SELECT test.expect_error(format('SELECT public.files_policy_set(%L,%L,1,100,ARRAY[%L],%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'service11','application/pdf','Versao antiga'),'PT409','anexos: politica exige versao esperada');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"idempotency_key":"policy-reject11"}')::text),'PT422','anexos: intencao nova respeita limite especifico');
SELECT test.expect_error(format('SELECT public.files_process_claim(%L,%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091','copy',jsonb_build_object('source_file_id',:'file11','target_request_id',:'request11','target_item_id',:'item11','idempotency_key','copy-policy11')),'PT422','anexos: copia tambem respeita politica do destino');
SELECT public.files_policy_set('00000000-0000-4000-e000-000000000091',:'service11',2,1000,ARRAY['application/pdf'],'Restaurar politica11',gen_random_uuid());
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','copy',jsonb_build_object('source_file_id',:'file11','target_request_id',:'request11','target_item_id',:'item11','idempotency_key','copy11'),gen_random_uuid())AS copy11 \gset
SELECT test.assert_true(:'copy11'::jsonb->'objects'->0->>'source_path'=:'path11' AND :'copy11'::jsonb->'objects'->0->>'object_path'<>:'path11','anexos: copia reserva novo destino aleatorio e origem privada');
SELECT test.assert_true(public.files_process_claim('00000000-0000-4000-e000-000000000091','copy',jsonb_build_object('source_file_id',:'file11','target_request_id',:'request11','target_item_id',:'item11','idempotency_key','copy11'),gen_random_uuid())->>'lease_id'=:'copy11'::jsonb->>'lease_id','anexos: copia recuperavel conserva lease e objeto');
SET ROLE service_role;
SELECT test.assert_true(public.files_process_complete((:'copy11'::jsonb->>'lease_id')::uuid,:'copy11'::jsonb->>'lease_token',jsonb_build_object('outcome','validated','sha256',repeat('a',64),'size_bytes',100,'mime_type','application/pdf'),gen_random_uuid())->'file'->>'status'='quarentena','anexos: copia validada permanece em quarentena');
RESET ROLE;
SELECT test.assert_true((SELECT policy_snapshot->>'max_bytes'='10485760' FROM private.upload_intents WHERE id=:'intention11'),'anexos: politica posterior conserva snapshot da intencao anterior');
-- Restrictive policies still deny future accidentally permissive Storage policies and grants.
CREATE POLICY test_storage_broad ON storage.objects FOR ALL TO authenticated USING(true)WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.files TO authenticated;
CREATE POLICY test_files_broad ON public.files FOR ALL TO authenticated USING(true)WITH CHECK(true);
SET ROLE authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.files)=0,'anexos: gate restritivo protege metadados contra future policy ampla');
WITH changed AS(UPDATE storage.objects SET metadata='{"size":2}' WHERE name=:'path11' RETURNING id)SELECT test.assert_true((SELECT count(*) FROM changed)=0,'anexos: gate restritivo impede sobrescrita mesmo com policy ampla');
WITH changed AS(DELETE FROM storage.objects WHERE name=:'path11' RETURNING id)SELECT test.assert_true((SELECT count(*) FROM changed)=0,'anexos: gate restritivo impede delete pelo usuario');
SELECT test.expect_error($q$INSERT INTO storage.objects(bucket_id,name)VALUES('request-attachments','inventado')$q$,'42501','anexos: gate restritivo impede insert sem intencao com policy ampla');
RESET ROLE;
DROP POLICY test_storage_broad ON storage.objects;DROP POLICY test_files_broad ON public.files;
REVOKE SELECT,INSERT,UPDATE,DELETE ON public.files FROM authenticated;
SET ROLE authenticated;
-- A client sees only personal uploads, including inside the same portal request.
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||jsonb_build_object('request_id',:'portal11','request_item_id',NULL,'idempotency_key','staff-portal11')),gen_random_uuid())AS staff_portal11 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000095","session_id":"00000000-0000-4000-c000-000000000095"}';
SELECT test.assert_true(public.files_page('00000000-0000-4000-e000-000000000091',:'portal11',1,3)->>'total'='0','anexos: portal nao le envio da equipe no proprio pedido');
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||jsonb_build_object('request_id',:'portal11','request_item_id',NULL,'idempotency_key','own-portal11')),gen_random_uuid())AS own_portal11 \gset
SELECT test.assert_true(public.files_page('00000000-0000-4000-e000-000000000091',:'portal11',1,3)->>'total'='1' AND(public.files_page('00000000-0000-4000-e000-000000000091',:'portal11',1,3)->>'portal')::boolean,'anexos: portal pode enviar e listar somente envio proprio');
SELECT test.expect_error(format('SELECT public.files_download(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000091',:'staff_portal11'::jsonb->'file'->>'id'),'PT404','anexos: portal nao baixa envio da equipe com UUID conhecido');
SELECT test.expect_error(format('SELECT public.files_policy_get(%L,%L)','00000000-0000-4000-e000-000000000091',:'service11'),'PT403','anexos: portal nao consulta gestao de politica');
SELECT test.expect_error($q$SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())$q$,'PT403','anexos: portal nao planeja limpeza');
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
-- Rejected/expired candidates with every retention protection, active validation and unknown objects.
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||jsonb_build_object('name','Cleanup'||n||'.pdf','idempotency_key','cleanup11-'||n)),gen_random_uuid())AS cleanup_intent FROM generate_series(1,7)n;
RESET ROLE;
UPDATE public.files SET status='rejeitado',validation_reason='invalid_content' WHERE name LIKE 'Cleanup%.pdf';
UPDATE public.files SET protected=true WHERE name='Cleanup2.pdf';
UPDATE public.files SET legal_hold=true WHERE name='Cleanup3.pdf';
UPDATE public.files SET retain_until=clock_timestamp()+interval '1 day' WHERE name='Cleanup4.pdf';
INSERT INTO private.file_references(office_id,file_id,reference_kind)SELECT office_id,id,'documento' FROM public.files WHERE name='Cleanup5.pdf';
UPDATE public.files SET status='quarentena' WHERE name='Cleanup6.pdf';
UPDATE public.files SET status='aguardando_upload' WHERE name='Cleanup7.pdf';
UPDATE private.upload_intents SET expires_at=clock_timestamp()-interval '1 second' WHERE file_id IN(SELECT id FROM public.files WHERE name='Cleanup7.pdf');
SELECT id AS remove11 FROM public.files WHERE name='Cleanup1.pdf' \gset
INSERT INTO storage.objects(bucket_id,name)VALUES('request-attachments','00000000-0000-4000-e000-000000000091/unknown-object-for-manual-review');
SET ROLE authenticated;
SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())AS plan11 \gset
SELECT test.assert_true(:'plan11'::jsonb->>'count'='2' AND :'plan11'::jsonb->>'orphan_count'='1','anexos: limpeza inclui so rejeitado ou vencido e conta desconhecido sem excluir');
SELECT test.assert_true(jsonb_array_length(:'plan11'::jsonb->'items')=(:'plan11'::jsonb->>'count')::integer AND (SELECT array_agg(i->>'name' ORDER BY i->>'name') FROM jsonb_array_elements(:'plan11'::jsonb->'items')i)=ARRAY['Cleanup1.pdf','Cleanup7.pdf'] AND NOT EXISTS(SELECT FROM jsonb_array_elements(:'plan11'::jsonb->'items')i WHERE NOT i ?& ARRAY['id','name','status'] OR (SELECT count(*) FROM jsonb_object_keys(i))<>3 OR i->>'status' NOT IN('rejeitado','aguardando_upload')),'anexos: plano revisavel mostra exatamente nomes e estados reservados sem dados extras ou protegidos');
SELECT test.assert_true(public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())->'items'=:'plan11'::jsonb->'items','anexos: repeticao do plano conserva lista e ordem dos objetos reservados');
RESET ROLE;
SELECT test.expect_error(format('INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(%L,%L,%L)','00000000-0000-4000-e000-000000000091',:'remove11','nova-referencia'),'PT409','anexos: referencia nova nao atravessa reserva de limpeza');
SELECT test.expect_error(format('UPDATE public.files SET legal_hold=true WHERE id=%L',:'remove11'),'PT409','anexos: retencao nova nao atravessa reserva de limpeza');
SET ROLE authenticated;
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','cleanup',jsonb_build_object('plan_id',:'plan11'::jsonb->>'id'),gen_random_uuid())AS cleanlease11 \gset
SELECT test.assert_true(jsonb_array_length(:'cleanlease11'::jsonb->'objects')=2 AND NOT(:'cleanlease11'::jsonb->'objects' @> jsonb_build_array(jsonb_build_object('object_path','00000000-0000-4000-e000-000000000091/unknown-object-for-manual-review'))),'anexos: lease de limpeza usa somente caminhos reservados conhecidos');
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'cleanlease11'::jsonb->>'lease_id',:'cleanlease11'::jsonb->>'lease_token',jsonb_build_object('outcome','removed','removed_ids',jsonb_build_array(:'file11'))),'PT422','anexos: Storage nao confirma objeto fora do plano');
SELECT test.assert_true(public.files_process_complete((:'cleanlease11'::jsonb->>'lease_id')::uuid,:'cleanlease11'::jsonb->>'lease_token',jsonb_build_object('outcome','removed','removed_ids',jsonb_build_array(:'remove11')),gen_random_uuid()) @> '{"removed":1,"pending":1}'::jsonb,'anexos: sucesso parcial confirma apenas exclusao reportada');
SELECT test.assert_true(public.files_process_complete((:'cleanlease11'::jsonb->>'lease_id')::uuid,:'cleanlease11'::jsonb->>'lease_token',jsonb_build_object('outcome','removed','removed_ids',jsonb_build_array(:'remove11')),gen_random_uuid()) @> '{"removed":0,"pending":1}'::jsonb,'anexos: repeticao de exclusao parcial nao perde reserva restante');
RESET ROLE;
SELECT test.assert_true((SELECT status='removido' FROM public.files WHERE id=:'remove11') AND EXISTS(SELECT FROM storage.objects WHERE name='00000000-0000-4000-e000-000000000091/unknown-object-for-manual-review'),'anexos: limpeza conserva metadados e objeto desconhecido');
SET ROLE authenticated;
SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())AS partial_plan11 \gset
SELECT test.assert_true(:'partial_plan11'::jsonb->>'id'=:'plan11'::jsonb->>'id' AND :'partial_plan11'::jsonb->>'count'='1' AND jsonb_array_length(:'partial_plan11'::jsonb->'items')=1 AND :'partial_plan11'::jsonb->'items'->0->>'name'='Cleanup7.pdf','anexos: revisao apos exclusao parcial mostra somente reserva ainda pendente');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'files.%' AND changes::text ~ 'Documento|Cleanup|object_path|sha256|pdf|mime_type|session_id'),'anexos: auditoria sem nome caminho hash sessao ou PII');
-- Revalidate the original uploader after network, including independent capabilities and scope.
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000092');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"idempotency_key":"revocation11"}'),gen_random_uuid())AS revoke_intent11 \gset
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','validate',jsonb_build_object('intent_id',:'revoke_intent11'::jsonb->>'intent_id'),gen_random_uuid())AS revoke_lease11 \gset
RESET ROLE;
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='files.upload';
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'revoke_lease11'::jsonb->>'lease_id',:'revoke_lease11'::jsonb->>'lease_token','{"outcome":"missing","reason":"object_missing"}'),'PT403','anexos: revogacao de upload apos rede impede finalizacao');
RESET ROLE;
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','files.upload');
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='00000000-0000-4000-c000-000000000092';
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'revoke_lease11'::jsonb->>'lease_id',:'revoke_lease11'::jsonb->>'lease_token','{"outcome":"missing","reason":"object_missing"}'),'PT401','anexos: sessao revogada apos rede impede finalizacao');
RESET ROLE;
UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000092';
UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000091' WHERE id=:'request11';
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'revoke_lease11'::jsonb->>'lease_id',:'revoke_lease11'::jsonb->>'lease_token','{"outcome":"missing","reason":"object_missing"}'),'PT403','anexos: transferencia apos rede conserva leitura mas impede finalizacao');
RESET ROLE;
UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000092' WHERE id=:'request11';
UPDATE private.file_process_leases SET expires_at=clock_timestamp()-interval '1 second' WHERE id=(:'copy11'::jsonb->>'lease_id')::uuid;
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.files_process_claim('00000000-0000-4000-e000-000000000091','copy',jsonb_build_object('source_file_id',:'file11','target_request_id',:'request11','target_item_id',:'item11','idempotency_key','copy11'),gen_random_uuid())->'result'->'file'->>'status'='quarentena','anexos: lease concluido vencido devolve resultado autorizado sem nova rede');
RESET ROLE;
-- Composite FKs and indexes also protect against accidental internal cross-tenant writes.
SELECT test.expect_error(format('INSERT INTO public.files(office_id,request_id,request_item_id,name,mime_type,size_bytes,sha256,classification,created_by)VALUES(%L,%L,%L,%L,%L,100,%L,%L,%L)','00000000-0000-4000-e000-000000000092',:'request11',:'item11','Falso.pdf','application/pdf',repeat('a',64),'documento','00000000-0000-4000-a000-000000000093'),'23503','anexos: FK composta nega pedido de outro escritorio');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_constraint c WHERE c.contype='f' AND c.conrelid IN('public.files'::regclass,'private.upload_intents'::regclass,'private.file_service_policies'::regclass,'private.file_cleanup_plans'::regclass,'private.file_cleanup_reservations'::regclass,'private.file_references'::regclass,'private.file_process_leases'::regclass) AND NOT EXISTS(SELECT FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid AND(SELECT array_agg(k.attnum ORDER BY k.n) FROM unnest(i.indkey)WITH ORDINALITY k(attnum,n) WHERE k.n<=cardinality(c.conkey))=c.conkey)),'anexos: todas FKs novas cobertas por indices');

SET ROLE service_role;
SELECT test.assert_true(public.files_process_complete((:'cleanlease11'::jsonb->>'lease_id')::uuid,:'cleanlease11'::jsonb->>'lease_token',jsonb_build_object('outcome','removed','removed_ids',(SELECT jsonb_agg(o->>'file_id')FROM jsonb_array_elements(:'cleanlease11'::jsonb->'objects')o)),gen_random_uuid())->>'pending'='0','anexos: nova tentativa conclui exatamente objetos restantes do plano');
RESET ROLE;

-- A lost or archived planner must not strand a reservation forever.
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||'{"idempotency_key":"takeover11"}'),gen_random_uuid())AS takeover_intent11 \gset
RESET ROLE;
UPDATE public.files SET status='rejeitado' WHERE id=(:'takeover_intent11'::jsonb->'file'->>'id')::uuid;
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000092');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';
SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())AS staff_plan11 \gset
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','cleanup',jsonb_build_object('plan_id',:'staff_plan11'::jsonb->>'id'),gen_random_uuid())AS staff_cleanup_lease11 \gset
RESET ROLE;
UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000091' WHERE id=:'request11';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())$q$,'PT403','anexos: plano existente nao revela nomes apos perda do escopo');
RESET ROLE;
UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000092' WHERE id=:'request11';
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='files.manage';
SET ROLE authenticated;
RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())AS owner_plan11 \gset
SELECT test.assert_true(:'owner_plan11'::jsonb->>'id'=:'staff_plan11'::jsonb->>'id' AND :'owner_plan11'::jsonb->>'count'='1','anexos: owner recupera plano pendente de gestor revogado sem perder caminhos');
SELECT test.assert_true(:'owner_plan11'::jsonb->'items'=:'staff_plan11'::jsonb->'items' AND :'owner_plan11'::jsonb->'items'->0->>'id'=:'takeover_intent11'::jsonb->'file'->>'id','anexos: takeover conserva exatamente a lista de arquivos revisada');
RESET ROLE;
SELECT test.assert_true((SELECT token<>:'staff_cleanup_lease11'::jsonb->>'lease_token' FROM private.file_process_leases WHERE id=(:'staff_cleanup_lease11'::jsonb->>'lease_id')::uuid),'anexos: takeover invalida token antigo mantendo reserva');
INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','files.manage');
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.files_process_complete(%L,%L,%L,gen_random_uuid())',:'staff_cleanup_lease11'::jsonb->>'lease_id',:'staff_cleanup_lease11'::jsonb->>'lease_token','{"outcome":"removed","removed_ids":[]}'),'PT403','anexos: conclusao antiga nao atravessa takeover mesmo apos recuperar capacidade');
SET ROLE authenticated;
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','cleanup',jsonb_build_object('plan_id',:'owner_plan11'::jsonb->>'id'),gen_random_uuid())AS owner_cleanup_lease11 \gset
SET ROLE service_role;
SELECT test.assert_true(public.files_process_complete((:'owner_cleanup_lease11'::jsonb->>'lease_id')::uuid,:'owner_cleanup_lease11'::jsonb->>'lease_token',jsonb_build_object('outcome','removed','removed_ids',jsonb_build_array(:'takeover_intent11'::jsonb->'file'->>'id')),gen_random_uuid())->>'pending'='0','anexos: owner conclui exclusao recuperada com as mesmas chaves');
RESET ROLE;
-- The review and subsequent worker must share the same bounded reservation batch.
BEGIN;
SET ROLE authenticated;
SELECT public.files_begin_upload('00000000-0000-4000-e000-000000000091',(:'upload11'::jsonb||jsonb_build_object('name','BatchReview'||n||'.pdf','idempotency_key','batch-review11-'||n)),gen_random_uuid()) FROM generate_series(1,25)n;
RESET ROLE;
UPDATE public.files SET status='rejeitado' WHERE name LIKE 'BatchReview%.pdf';
SET ROLE authenticated;
SELECT public.files_cleanup_plan('00000000-0000-4000-e000-000000000091',gen_random_uuid())AS batch_plan11 \gset
SELECT test.assert_true(:'batch_plan11'::jsonb->>'count'='20' AND jsonb_array_length(:'batch_plan11'::jsonb->'items')=20,'anexos: plano de revisao limita reserva e lista ao mesmo lote de vinte arquivos');
SELECT public.files_process_claim('00000000-0000-4000-e000-000000000091','cleanup',jsonb_build_object('plan_id',:'batch_plan11'::jsonb->>'id'),gen_random_uuid())AS batch_lease11 \gset
SELECT test.assert_true((SELECT array_agg(i->>'id' ORDER BY i->>'id') FROM jsonb_array_elements(:'batch_plan11'::jsonb->'items')i)=(SELECT array_agg(i->>'file_id' ORDER BY i->>'file_id') FROM jsonb_array_elements(:'batch_lease11'::jsonb->'objects')i),'anexos: worker recebe exatamente os mesmos IDs exibidos na revisao');
ROLLBACK;

RESET ROLE;SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000092');
