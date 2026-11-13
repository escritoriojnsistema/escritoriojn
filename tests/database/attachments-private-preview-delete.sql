-- Only provider-shaped disposable DB. Storage DELETE below models provider metadata
-- removal; production code must exclusively call the Storage API.
RESET ROLE;
BEGIN;
\set ap_office '00000000-0000-4000-e000-000000000091'
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'attachment-'||n||'@example.test',now(),'fixture' FROM generate_series(981,982)n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000981' AND '00000000-0000-4000-a000-000000000982';
INSERT INTO auth.sessions(id,user_id)VALUES('00000000-0000-4000-c001-000000000981','00000000-0000-4000-a000-000000000981');
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa fictícia anexos' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000981' AND '00000000-0000-4000-a000-000000000982';
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,:'ap_office',('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'client' FROM generate_series(981,982)n;
INSERT INTO public.requests(office_id,protocol,title,origin,created_by,priority,idempotency_key,payload_digest)VALUES(:'ap_office','PREVIEW-DELETE-LOCAL','Anexo autoral local','portal','00000000-0000-4000-a000-000000000981','normal',gen_random_uuid(),'fixture')RETURNING id AS ap_request \gset
SELECT test.assert_true((SELECT relrowsecurity FROM pg_class WHERE oid='private.file_deletions'::regclass) AND NOT has_table_privilege('authenticated','private.file_deletions','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.file_deletions','SELECT,INSERT,UPDATE,DELETE'),'attachments: deletion jobs private RLS ACL');
SELECT test.assert_true((SELECT count(*)=3 AND bool_and(NOT prosecdef AND proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE oid IN('public.files_preview(uuid,uuid,uuid)'::regprocedure,'public.files_delete_begin(uuid,uuid,timestamptz,uuid,uuid)'::regprocedure,'public.files_delete_complete(uuid,uuid,uuid,uuid)'::regprocedure)) AND NOT has_function_privilege('anon','public.files_preview(uuid,uuid,uuid)','EXECUTE'),'attachments: wrappers invoker authenticated only');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('files_own_portal','files_preview_ready','files_delete_unreferenced','files_delete_authority','files_delete_check','files_delete_storage_allowed','files_deletion_reference_guard','files_deletion_lease_guard') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),'attachments: internal helpers and triggers have no direct role execute');
SELECT test.assert_true((SELECT count(*)=4 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname IN('attachments_insert','attachments_select','attachments_insert_gate','attachments_select_gate') AND (coalesce(pg_get_expr(polqual,polrelid),'')||coalesce(pg_get_expr(polwithcheck,polrelid),'')) LIKE '%files_storage_allowed(%'),'attachments: policies bind current helper not renamed bypass');
SELECT test.assert_true(NOT EXISTS(SELECT FROM pg_constraint c CROSS JOIN LATERAL unnest(c.conkey,c.confkey)x(a,b) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=x.a JOIN pg_attribute b ON b.attrelid=c.confrelid AND b.attnum=x.b WHERE c.contype='f' AND c.confrelid='public.files'::regclass AND b.attname='id' AND(c.conrelid<>'private.upload_intents'::regclass OR a.attname='source_file_id') AND NOT EXISTS(SELECT FROM pg_trigger t WHERE t.tgrelid=c.conrelid AND t.tgfoid='private.files_deletion_reference_guard()'::regprocedure AND t.tgargs=convert_to(a.attname::text,'UTF8')||decode('00','hex'))),'attachments: current business foreign keys guarded');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c000-000000000981"}';
SELECT test.assert_true(public.files_requests_page(:'ap_office','PREVIEW-DELETE-LOCAL',1,5)#>>'{items,0,can_work}'='true','attachments: own open portal request can receive uploads');
SELECT test.assert_true(public.files_requests_page(:'ap_office',:'ap_request',1,5)->>'total'='1' AND public.files_requests_page(:'ap_office',:'ap_request',1,5)#>>'{items,0,id}'=:'ap_request','attachments: exact authorized UUID resolves contextual request picker');
SELECT jsonb_build_object('request_id',:'ap_request','request_item_id',NULL,'name','Privado.pdf','mime_type','application/pdf','size_bytes',100,'sha256',repeat('a',64),'classification','documento','idempotency_key','preview-delete-local') AS ap_input \gset
SELECT public.files_begin_upload(:'ap_office',:'ap_input',gen_random_uuid()) AS ap_upload \gset
SELECT :'ap_upload'::jsonb#>>'{file,id}' AS ap_file,:'ap_upload'::jsonb->>'intent_id' AS ap_intent,:'ap_upload'::jsonb->>'object_path' AS ap_path \gset
SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())',:'ap_office',:'ap_file'),'PT409','attachments: pending bytes are never previewable');
SET storage.operation='object.upload';
INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('request-attachments',:'ap_path','{"size":100,"mimetype":"application/pdf"}');
SELECT public.files_process_claim(:'ap_office','validate',jsonb_build_object('intent_id',:'ap_intent'),gen_random_uuid()) AS ap_lease \gset
SET ROLE service_role;
SELECT public.files_process_complete((:'ap_lease'::jsonb->>'lease_id')::uuid,:'ap_lease'::jsonb->>'lease_token',jsonb_build_object('outcome','validated','sha256',repeat('a',64),'size_bytes',100,'mime_type','application/pdf'),gen_random_uuid());
SET ROLE authenticated;
SELECT test.assert_true(public.files_preview(:'ap_office',:'ap_file',gen_random_uuid()) @> jsonb_build_object('size_bytes',100,'sha256',repeat('a',64),'object_path',:'ap_path') AND public.files_page(:'ap_office',:'ap_request',1,5)#>>'{items,0,can_preview}'='true' AND public.files_page(:'ap_office',:'ap_request',1,5)#>>'{items,0,can_delete}'='true','attachments: validated quarantine has private preview and own deletion flags');
SELECT test.expect_error(format('SELECT public.files_download(%L,%L,gen_random_uuid())',:'ap_office',:'ap_file'),'PT409','attachments: preview does not release quarantine');
SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())','00000000-0000-4000-e000-000000000092',:'ap_file'),'PT403','attachments: known file UUID never crosses offices');
RESET ROLE;
UPDATE auth.sessions SET created_at=clock_timestamp(),not_after=NULL WHERE id='00000000-0000-4000-c000-000000000091';
DELETE FROM private.session_activities WHERE session_id='00000000-0000-4000-c000-000000000091';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT test.assert_true(public.files_preview(:'ap_office',:'ap_file',gen_random_uuid())->>'object_path'=:'ap_path','attachments: currently scoped owner can preview client quarantine');
RESET ROLE;
UPDATE public.files SET actual_sha256=repeat('b',64) WHERE id=:'ap_file';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c000-000000000981"}';
SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())',:'ap_office',:'ap_file'),'PT409','attachments: inconsistent validated hash blocks preview');
RESET ROLE;UPDATE public.files SET actual_sha256=sha256,scanner_status='infected' WHERE id=:'ap_file';SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())',:'ap_office',:'ap_file'),'PT409','attachments: infected quarantine cannot be previewed');
RESET ROLE;UPDATE public.files SET scanner_status='not_configured' WHERE id=:'ap_file';
SAVEPOINT closed_request;
UPDATE public.requests SET status='concluido' WHERE id=:'ap_request';SET ROLE authenticated;
SELECT test.assert_true(public.files_requests_page(:'ap_office','PREVIEW-DELETE-LOCAL',1,5)#>>'{items,0,can_work}'='false','attachments: closed own request has no write picker flag');
SELECT test.expect_error(format('SELECT public.files_begin_upload(%L,%L,gen_random_uuid())',:'ap_office',(:'ap_input'::jsonb||'{"idempotency_key":"closed-denied"}')::text),'PT403','attachments: closed request refuses new client upload');
ROLLBACK TO closed_request;SET ROLE authenticated;

SET storage.operation='object.get_authenticated';
SELECT test.assert_true((SELECT count(*)=1 FROM storage.objects WHERE name=:'ap_path'),'attachments: authenticated own quarantine read');
SET storage.operation='object.sign';
SELECT test.assert_true((SELECT count(*)=0 FROM storage.objects WHERE name=:'ap_path'),'attachments: preview never permits signed URL');
SET storage.operation='object.list';
SELECT test.assert_true((SELECT count(*)=0 FROM storage.objects WHERE name=:'ap_path'),'attachments: preview never permits bucket listing');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000982","session_id":"00000000-0000-4000-c000-000000000982"}';
SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())',:'ap_office',:'ap_file'),'PT404','attachments: other client cannot preview known UUID');
SELECT test.assert_true(public.files_requests_page(:'ap_office','PREVIEW-DELETE-LOCAL',1,5)->>'total'='0','attachments: other client sees no picker request');
SELECT test.assert_true(public.files_requests_page(:'ap_office',:'ap_request',1,5)->>'total'='0','attachments: UUID picker query preserves other-client denial');
SET storage.operation='object.get_authenticated';
SELECT test.assert_true((SELECT count(*)=0 FROM storage.objects WHERE name=:'ap_path'),'attachments: other client has no Storage preview');
RESET ROLE;
SELECT updated_at AS ap_version FROM public.files WHERE id=:'ap_file' \gset
UPDATE public.files SET protected=true WHERE id=:'ap_file';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c000-000000000981"}';
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT409','attachments: protected file cannot be deleted');
RESET ROLE;UPDATE public.files SET protected=false,legal_hold=true WHERE id=:'ap_file';SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT409','attachments: legal hold prevents delete');
RESET ROLE;UPDATE public.files SET legal_hold=false,retain_until=clock_timestamp()+interval '1 day' WHERE id=:'ap_file';SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT409','attachments: retention prevents delete');
RESET ROLE;UPDATE public.files SET retain_until=NULL WHERE id=:'ap_file';
INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(:'ap_office',:'ap_file','fixture_business');SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT409','attachments: business reference prevents delete');
RESET ROLE;DELETE FROM private.file_references WHERE file_id=:'ap_file';SET ROLE authenticated;
RESET ROLE;
SAVEPOINT business_fk;
INSERT INTO private.category_intakes(office_id,request_id,category_id,revision,instructions,fields,documents,answers,session_id,submitted_at)SELECT :'ap_office',:'ap_request',id,1,'Fixture local','[]','[]','{}','00000000-0000-4000-c000-000000000981',clock_timestamp() FROM private.service_categories WHERE office_id=:'ap_office' ORDER BY id LIMIT 1;
INSERT INTO private.category_intake_files(office_id,request_id,file_id,slot_key)VALUES(:'ap_office',:'ap_request',:'ap_file','identity');
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT409','attachments: category snapshot FK prevents physical deletion');
ROLLBACK TO business_fk;
SET ROLE authenticated;

SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file','2000-01-01T00:00:00Z'),'PT409','attachments: stale version prevents reserve');
SELECT gen_random_uuid() AS ap_key \gset
SELECT public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_key',gen_random_uuid()) AS ap_job \gset
SELECT :'ap_job'::jsonb->>'id' AS ap_command \gset
SELECT test.assert_true(:'ap_job'::jsonb @> jsonb_build_object('file_id',:'ap_file','bucket','request-attachments','object_path',:'ap_path','completed',false) AND public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_key',gen_random_uuid())->>'id'=:'ap_command','attachments: exact begin retry retains same reserve');
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT409','attachments: second key cannot replace reserve');
SELECT test.assert_true(public.files_page(:'ap_office',:'ap_request',1,5)#>>'{items,0,delete_pending}'='true','attachments: reserved file projects explicit deletion pending state');
-- Explicit recovery never transfers a live reservation and never relies on UUID knowledge.
SAVEPOINT expired_reclaim;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c001-000000000981"}';
SELECT gen_random_uuid() AS ap_reclaim_key \gset
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,%L,gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version',:'ap_reclaim_key'),'PT409','attachments: different session cannot reclaim live reserve');
RESET ROLE;UPDATE private.file_deletions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:'ap_command';SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000982","session_id":"00000000-0000-4000-c000-000000000982"}';
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT404','attachments: cross client cannot inherit expired reserve');
RESET ROLE;INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000094','files.manage')ON CONFLICT DO NOTHING;SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000094","session_id":"00000000-0000-4000-c000-000000000094"}';
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT404','attachments: files.manage staff outside scope cannot inherit expired reserve');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c001-000000000981"}';
SELECT test.assert_true(public.files_page(:'ap_office',:'ap_request',1,5)#>>'{items,0,can_delete}'='true' AND public.files_page(:'ap_office',:'ap_request',1,5)#>>'{items,0,can_preview}'='false','attachments: expired reserve offers authorized recovery while preview stays blocked');
SELECT test.assert_true(public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_reclaim_key',gen_random_uuid())=jsonb_build_object('id',:'ap_command','file_id',:'ap_file','bucket','request-attachments','object_path',:'ap_path','completed',false),'attachments: new authorized session reclaims exact expired file version and path');
SELECT test.expect_error(format('SELECT public.files_delete_complete(%L,%L,%L,gen_random_uuid())',:'ap_office',:'ap_command',:'ap_reclaim_key'),'PT409','attachments: reclaimed complete still refuses Storage-present success');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c000-000000000981"}';
SELECT test.expect_error(format('SELECT public.files_delete_complete(%L,%L,%L,gen_random_uuid())',:'ap_office',:'ap_command',:'ap_key'),'PT404','attachments: old key and session cannot complete reclaimed command');
SET storage.operation='object.delete_many';
WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path' RETURNING id)SELECT test.assert_true((SELECT count(*)=0 FROM removed),'attachments: old session cannot remove bytes after reclaim');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c001-000000000981"}';
WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path' RETURNING id)SELECT test.assert_true((SELECT count(*)=1 FROM removed),'attachments: reclaimed session removes exact reserved bytes');
SELECT test.assert_true(public.files_delete_complete(:'ap_office',:'ap_command',:'ap_reclaim_key',gen_random_uuid())->>'deleted'='true','attachments: reclaimed session completes physical purge');
SELECT test.expect_error(format('SELECT public.files_delete_begin(%L,%L,%L,gen_random_uuid(),gen_random_uuid())',:'ap_office',:'ap_file',:'ap_version'),'PT404','attachments: completed tombstone cannot be reclaimed');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=1 FROM public.audit_events WHERE action='files.delete_reclaimed' AND target_id=:'ap_file'),'attachments: reclaim records one minimal audit event');
ROLLBACK TO expired_reclaim;
-- An interrupted Storage response can leave bytes already absent. Reclaim still
-- requires full authority and binds to the same file, version and captured path.
SAVEPOINT absent_reclaim;
RESET ROLE;UPDATE private.file_deletions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:'ap_command';
DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c001-000000000981"}';
SELECT gen_random_uuid() AS ap_absent_key \gset
SELECT public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_absent_key',gen_random_uuid());
SELECT test.assert_true(public.files_delete_complete(:'ap_office',:'ap_command',:'ap_absent_key',gen_random_uuid())->>'deleted'='true','attachments: authorized reclaim can finish exact already-absent Storage object');
ROLLBACK TO absent_reclaim;
SAVEPOINT original_renewal;
RESET ROLE;UPDATE private.file_deletions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:'ap_command';SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c000-000000000981"}';
SELECT test.assert_true(public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_key',gen_random_uuid())->>'id'=:'ap_command','attachments: original exact command can renew after expiry with current authority');
ROLLBACK TO original_renewal;
SAVEPOINT manager_reclaim;
RESET ROLE;UPDATE private.file_deletions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=:'ap_command';SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
SELECT gen_random_uuid() AS ap_manager_key \gset
SELECT test.assert_true(public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_manager_key',gen_random_uuid())->>'id'=:'ap_command','attachments: scoped manager with current files.manage can reclaim abandoned file');
SET storage.operation='object.delete_many';
WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path' RETURNING id)SELECT test.assert_true((SELECT count(*)=1 FROM removed),'attachments: scoped manager removes only explicitly reclaimed object');
SELECT test.assert_true(public.files_delete_complete(:'ap_office',:'ap_command',:'ap_manager_key',gen_random_uuid())->>'deleted'='true','attachments: scoped manager can complete reclaimed purge');
ROLLBACK TO manager_reclaim;


SELECT test.expect_error(format('SELECT public.files_preview(%L,%L,gen_random_uuid())',:'ap_office',:'ap_file'),'PT409','attachments: preview blocked during Storage deletion');
SELECT test.expect_error(format('SELECT public.files_delete_complete(%L,%L,%L,gen_random_uuid())',:'ap_office',:'ap_command',:'ap_key'),'PT409','attachments: complete refuses success while Storage object exists');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c001-000000000981"}';
SELECT test.expect_error(format('SELECT public.files_delete_complete(%L,%L,%L,gen_random_uuid())',:'ap_office',:'ap_command',:'ap_key'),'PT404','attachments: delete job cannot migrate between sessions');
SET storage.operation='object.delete_many';
WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path' RETURNING id)SELECT test.assert_true((SELECT count(*)=0 FROM removed),'attachments: foreign session Storage removal denied');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000982","session_id":"00000000-0000-4000-c000-000000000982"}';
SELECT test.expect_error(format('SELECT public.files_delete_complete(%L,%L,%L,gen_random_uuid())',:'ap_office',:'ap_command',:'ap_key'),'PT404','attachments: delete job cannot migrate between users');
WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path' RETURNING id)SELECT test.assert_true((SELECT count(*)=0 FROM removed),'attachments: foreign user Storage removal denied');
RESET ROLE;
SELECT test.expect_error(format('INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(%L,%L,%L)',:'ap_office',:'ap_file','late_business'),'PT409','attachments: reference cannot bind during deletion');
SELECT test.expect_error(format('UPDATE public.files SET legal_hold=true WHERE id=%L',:'ap_file'),'PT409','attachments: protection cannot race reserved Storage removal');
SELECT test.assert_true((SELECT NOT private.files_cleanup_eligible(f) FROM public.files f WHERE id=:'ap_file'),'attachments: legacy cleanup excludes explicit reserve');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000981","session_id":"00000000-0000-4000-c000-000000000981"}';
SET storage.operation='object.delete_many';
WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name=:'ap_path' RETURNING id)SELECT test.assert_true((SELECT count(*)=1 FROM removed),'attachments: exact original session can remove reserved Storage object');
SELECT test.assert_true(public.files_delete_complete(:'ap_office',:'ap_command',:'ap_key',gen_random_uuid())=jsonb_build_object('deleted',true,'file_id',:'ap_file') AND public.files_delete_complete(:'ap_office',:'ap_command',:'ap_key',gen_random_uuid())=jsonb_build_object('deleted',true,'file_id',:'ap_file'),'attachments: complete physically purges metadata and retries idempotently');
SELECT test.assert_true(public.files_delete_begin(:'ap_office',:'ap_file',:'ap_version',:'ap_key',gen_random_uuid())=jsonb_build_object('id',:'ap_command','file_id',:'ap_file','bucket',NULL,'object_path',NULL,'completed',true),'attachments: completed begin retry returns pathless tombstone');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.files WHERE id=:'ap_file') AND NOT EXISTS(SELECT FROM private.upload_intents WHERE file_id=:'ap_file') AND NOT EXISTS(SELECT FROM private.file_process_leases WHERE id=(:'ap_lease'::jsonb->>'lease_id')::uuid) AND EXISTS(SELECT FROM private.file_deletions WHERE id=:'ap_command' AND completed_at IS NOT NULL AND bucket IS NULL AND object_path IS NULL),'attachments: purge removes file intent completed validation lease and object path');
SELECT test.assert_true((SELECT count(*)=1 FROM public.audit_events WHERE target_id=:'ap_file' AND action='files.deleted'),'attachments: successful retry does not duplicate deletion audit');
ROLLBACK;
