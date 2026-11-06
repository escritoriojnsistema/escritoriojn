-- Runs only in the runner's disposable PostgreSQL fixtures after account-closure.sql.
BEGIN;
-- Refresh only disposable fixture session clocks; old cloned fixtures are deliberately idle.
UPDATE auth.sessions SET created_at=clock_timestamp();
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.retention_items','SELECT,INSERT,UPDATE,DELETE'),'retention: classified objects private');
SELECT test.assert_true(NOT has_function_privilege('authenticated','public.retention_worker_claim()','EXECUTE'),'retention: manager cannot impersonate physical worker');
SELECT test.assert_true(NOT has_table_privilege('service_role','private.retention_redaction_context','INSERT,UPDATE,DELETE'),'retention: worker cannot manufacture redaction context');
SELECT test.assert_true(NOT has_function_privilege('authenticated','private.retention_redact_document(uuid,uuid)','EXECUTE'),'retention: manager cannot call source erasure adapter');
SELECT test.assert_true(NOT has_function_privilege('anon','public.retention_policy_set(uuid,jsonb)','EXECUTE'),'retention: anonymous cannot approve policy');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.account_retention_policies),'retention: no invented default legal period');
CREATE TEMP TABLE retention_fixture AS SELECT d.id doc,d.office_id office,d.request_id request,r.customer_id customer,d.revision FROM public.documents d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id='00000000-0000-4000-e000-000000000201' AND r.status NOT IN('cancelado','concluido') AND EXISTS(SELECT FROM private.document_intakes intake WHERE intake.office_id=d.office_id AND intake.request_id=d.request_id AND intake.request_item_id=d.request_item_id AND intake.template_version_id=d.template_version_id) AND NOT EXISTS(SELECT FROM public.document_participants dp WHERE dp.office_id=d.office_id AND dp.document_id=d.id AND dp.customer_id IS DISTINCT FROM r.customer_id) ORDER BY d.id LIMIT 1;
SELECT test.assert_true((SELECT count(*)=1 FROM retention_fixture),'retention: real baseline document selected');
-- Exercise the actual application RPC: it copies full current revision input to its
-- immutable idempotency row, including the baseline fixture's personal override.
GRANT SELECT ON retention_fixture TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.document_intake_apply(office,doc,revision,'70000000-0000-4000-a000-000000000090')->>'id'=doc::text,'retention: legitimate intake apply creates document input command') FROM retention_fixture;
RESET ROLE;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT test.assert_true(EXISTS(SELECT FROM private.document_intake_apply_commands c JOIN retention_fixture f ON f.office=c.office_id AND f.doc=c.document_id WHERE c.input->'overrides'<>'{}'),'retention: real command copied personal revision overrides');
DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000206' AND permission_code IN('documents.read','files.read');
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT '00000000-0000-4000-b000-000000000206',code FROM unnest(ARRAY['foundation.access','archives.manage','requests.read','requests.read_all','customers.read','customers.read_all'])code ON CONFLICT DO NOTHING;
ALTER TABLE public.requests DISABLE TRIGGER USER;
UPDATE public.requests SET status='concluido',updated_at=clock_timestamp()-interval '60 days' WHERE id=(SELECT request FROM retention_fixture);
ALTER TABLE public.requests ENABLE TRIGGER USER;
-- Personal participant snapshot belongs to the same verified subject; no shared holder.
INSERT INTO public.document_participants(office_id,document_id,revision,position,customer_id,role,label,snapshot)
 SELECT f.office,f.doc,d.revision,999,f.customer,'party','Sensitive local fixture label','{"name":"PERSONAL PARTICIPANT FIXTURE"}' FROM retention_fixture f JOIN public.documents d ON d.id=f.doc;
CREATE TEMP TABLE retention_before AS SELECT
 (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM private.document_publication_events x) events_hash,
 (SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM private.cash_entries x) ledger_hash,
 (SELECT md5(coalesce(string_agg(v.content_sha256||v.snapshot_sha256,'' ORDER BY v.id),'')) FROM private.document_versions v WHERE v.document_id=(SELECT doc FROM retention_fixture)) versions_hash,
 (SELECT md5(coalesce(string_agg(p.content_sha256,'' ORDER BY p.id),'')) FROM private.document_publications p WHERE p.document_id=(SELECT doc FROM retention_fixture)) publications_hash,
 (SELECT md5(coalesce(string_agg((to_jsonb(c)-'input')::text,'' ORDER BY c.idempotency_key),'')) FROM private.document_intake_apply_commands c WHERE c.document_id=(SELECT doc FROM retention_fixture)) apply_metadata_hash;
CREATE TEMP TABLE retention_result(kind text PRIMARY KEY,data jsonb);
GRANT SELECT ON retention_fixture TO authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON retention_result TO authenticated,service_role;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.account_close('00000000-0000-4000-e000-000000000201','{"reason":"privacy","observation":"","acknowledged":true,"export_offered":true}');
RESET ROLE;
UPDATE private.account_closures SET closed_at=clock_timestamp()-interval '31 days' WHERE user_id='00000000-0000-4000-a000-000000000205';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000202","session_id":"00000000-0000-4000-c000-000000000202"}';
SELECT test.expect_error($q$SELECT public.retention_state('00000000-0000-4000-e000-000000000201',1)$q$,'PT403','retention: employee denied policy management');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.assert_true(public.retention_state('00000000-0000-4000-e000-000000000201',1)->>'candidate_total'='0','retention: archive manager without domain read sees no document title');
SELECT test.expect_error($q$SELECT public.retention_classify(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','document','target_id',doc,'data_class','signed_document','document_type','Local test only','revision',0)) FROM retention_fixture$q$,'PT403','retention: archive permission alone cannot classify document');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.retention_state('00000000-0000-4000-e000-000000000201',1)->>'candidate_total'<>'0','retention: unclassified real artifacts require a decision');
INSERT INTO retention_result SELECT 'classify',public.retention_classify(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','document','target_id',doc,'data_class','signed_document','document_type','Local test only','revision',0)) FROM retention_fixture;
SELECT test.assert_true((public.retention_state('00000000-0000-4000-e000-000000000201',1)#>>'{items,0,status}')='review_overdue','retention: missing policy review expires, never silently extends');
SELECT test.expect_error($q$SELECT public.retention_reserve('00000000-0000-4000-e000-000000000201',(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='classify'),1)$q$,'PT409','retention: no purge without approved class policy');
INSERT INTO retention_result SELECT 'policy',public.retention_policy_set(office,jsonb_build_object('data_class','signed_document','document_type','Local test only','legal_basis','Synthetic fixture decision; no real legal basis','justification','Disposable local fixture only','start_event','account_closed','period_days',0,'review_at',clock_timestamp()+interval '30 days','backup_disposition','Disposable fixture, no hosted backup','revision',0,'approved',true)) FROM retention_fixture;
SELECT test.assert_true((public.retention_state('00000000-0000-4000-e000-000000000201',1)#>>'{items,0,status}')='due','retention: zero-day policy produces effective deadline');
INSERT INTO retention_result SELECT 'hold',public.retention_hold(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','data_class','signed_document','reason','Local litigation simulation','release_id',NULL)) FROM retention_fixture;
SELECT test.expect_error($q$SELECT public.retention_reserve('00000000-0000-4000-e000-000000000201',(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='classify'),1)$q$,'PT409','retention: active legal hold suspends purge');
SELECT public.retention_hold(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','data_class','signed_document','reason','Local decision released','release_id',(SELECT data->>'id' FROM retention_result WHERE kind='hold'))) FROM retention_fixture;
INSERT INTO retention_result SELECT 'reserve',public.retention_reserve(office,(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='classify'),1) FROM retention_fixture;
SELECT test.expect_error($q$SELECT public.retention_reserve('00000000-0000-4000-e000-000000000201',(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='classify'),1)$q$,'PT409','retention: stale classification version rejected');
SELECT test.expect_error($q$SELECT public.document_versions_page(office,doc,1) FROM retention_fixture$q$,'PT409','retention: reserved document previews blocked');
SELECT test.expect_error($q$SELECT public.retention_hold('00000000-0000-4000-e000-000000000201',jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','data_class','signed_document','reason','Too late after committed dispatch','release_id',NULL))$q$,'PT409','retention: never claims a hold succeeded after destructive reservation');
RESET ROLE;
SELECT set_config('jn.retention_redaction','true',true);
SELECT test.expect_error($q$UPDATE private.document_publications SET content='[Documento eliminado]',title='Documento eliminado' WHERE document_id=(SELECT doc FROM retention_fixture)$q$,'PT409','retention: user-controlled GUC cannot bypass immutable content guard');
SELECT test.assert_true((SELECT cardinality(private.wf_gate(p,NULL))>0 FROM private.document_publications p WHERE p.document_id=(SELECT doc FROM retention_fixture) LIMIT 1),'retention: portal distribution fenced by common gate');
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
INSERT INTO retention_result VALUES('claim',public.retention_worker_claim());
SELECT test.assert_true(jsonb_array_length((SELECT data->'items' FROM retention_result WHERE kind='claim'))=1,'retention: worker claims only an authorized purge');
SELECT test.assert_true(jsonb_array_length(public.retention_worker_claim()->'items')=0,'retention: concurrent worker cannot claim active lease');
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name) SELECT obj->>'bucket',obj->>'object_path' FROM retention_result r CROSS JOIN LATERAL jsonb_array_elements(r.data#>'{items,0,objects}')obj WHERE r.kind='claim' ON CONFLICT DO NOTHING;
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
SELECT test.expect_error($q$SELECT public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid) FROM retention_result WHERE kind='claim'$q$,'PT409','retention: completion refuses objects still in Storage');
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.document_publications WHERE document_id=(SELECT doc FROM retention_fixture) AND content<>'[Documento eliminado]'),'retention: Storage present failure preserves original source content');
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
SELECT test.expect_error($q$SELECT public.retention_worker_complete((data#>>'{items,0,id}')::uuid,gen_random_uuid()) FROM retention_result WHERE kind='claim'$q$,'PT409','retention: stale worker token denied');
RESET ROLE;
-- Local metadata fixture simulates Storage removal; real worker must call Storage API.
DELETE FROM storage.objects s USING retention_result r WHERE r.kind='claim' AND EXISTS(SELECT FROM jsonb_array_elements(r.data#>'{items,0,objects}')obj WHERE s.bucket_id=obj->>'bucket' AND s.name=obj->>'object_path');
-- Defensive hold check even if a privileged maintenance operation introduced one.
INSERT INTO private.account_retention_holds(office_id,user_id,data_class,reason,created_by) SELECT office,'00000000-0000-4000-a000-000000000205','signed_document','Local privileged hold simulation','00000000-0000-4000-a000-000000000201' FROM retention_fixture;
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
SELECT test.expect_error($q$SELECT public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid) FROM retention_result WHERE kind='claim'$q$,'PT409','retention: hold blocks source redaction and finalization');
RESET ROLE;
UPDATE private.account_retention_holds SET released_at=clock_timestamp() WHERE reason='Local privileged hold simulation';
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
SELECT test.assert_true(public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid)->>'completed'='true','retention: successful byte removal finalized') FROM retention_result WHERE kind='claim';
SELECT test.assert_true(public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid)->>'completed'='true','retention: completion replay idempotent') FROM retention_result WHERE kind='claim';
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.document_publications WHERE document_id=(SELECT doc FROM retention_fixture)),'retention: immutable evidence identity conserved');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.document_publications WHERE document_id=(SELECT doc FROM retention_fixture) AND(content<>'[Documento eliminado]' OR title<>'Documento eliminado')),'retention: publication text irreversibly redacted');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.document_revisions WHERE document_id=(SELECT doc FROM retention_fixture) AND(input<>'{}' OR source<>'{}' OR author_name<>'Registro preservado' OR source_customer_id IS NOT NULL)),'retention: all document input and source snapshots redacted');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.document_versions WHERE document_id=(SELECT doc FROM retention_fixture) AND(content<>'' OR snapshot<>'{}' OR title<>'Documento eliminado' OR author_name<>'Registro preservado')),'retention: all printable version snapshots redacted');
SELECT test.assert_true(EXISTS(SELECT FROM public.document_participants WHERE document_id=(SELECT doc FROM retention_fixture) AND position=999 AND snapshot='{}' AND label='Participante'),'retention: personal participant snapshot irreversibly redacted');
SELECT test.assert_true((SELECT title='Documento eliminado' FROM public.documents WHERE id=(SELECT doc FROM retention_fixture)),'retention: live document title redacted');
SELECT test.assert_true((SELECT md5(coalesce(string_agg(v.content_sha256||v.snapshot_sha256,'' ORDER BY v.id),'')) FROM private.document_versions v WHERE v.document_id=(SELECT doc FROM retention_fixture))=(SELECT versions_hash FROM retention_before),'retention: original version hashes conserved');
SELECT test.assert_true((SELECT md5(coalesce(string_agg(p.content_sha256,'' ORDER BY p.id),'')) FROM private.document_publications p WHERE p.document_id=(SELECT doc FROM retention_fixture))=(SELECT publications_hash FROM retention_before),'retention: original publication hashes conserved');
SELECT test.assert_true((SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM private.document_publication_events x)=(SELECT events_hash FROM retention_before),'retention: event records and evidence not rewritten');
SELECT test.assert_true((SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),'')) FROM private.cash_entries x)=(SELECT ledger_hash FROM retention_before),'retention: financial ledger not rewritten');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.document_intake_apply_commands c WHERE c.document_id=(SELECT doc FROM retention_fixture) AND c.input<>'{}'),'retention: document command full personal input erased');
SELECT test.assert_true((SELECT md5(coalesce(string_agg((to_jsonb(c)-'input')::text,'' ORDER BY c.idempotency_key),'')) FROM private.document_intake_apply_commands c WHERE c.document_id=(SELECT doc FROM retention_fixture))=(SELECT apply_metadata_hash FROM retention_before),'retention: command identity and expected revision preserved');
SELECT test.expect_error($q$UPDATE private.document_intake_apply_commands SET input='{"content":"Restore personal fixture"}' WHERE document_id=(SELECT doc FROM retention_fixture)$q$,'PT409','retention: command personal input cannot be restored outside private context');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.retention_redaction_context),'retention: one-transaction erasure authority removed');
SELECT test.expect_error($q$UPDATE private.document_versions SET content='Restore personal text' WHERE document_id=(SELECT doc FROM retention_fixture)$q$,'PT409','retention: erased personal sources cannot be restored by ordinary update');
SELECT test.assert_true(EXISTS(SELECT FROM private.retention_items WHERE target_id=(SELECT doc FROM retention_fixture) AND purged_at IS NOT NULL),'retention: physical erasure recorded');
SELECT test.assert_true(EXISTS(SELECT FROM private.account_retention_holds WHERE released_by IS NOT NULL AND release_reason='Local decision released'),'retention: hold release retains authorship and reason');
SELECT test.assert_true((SELECT count(*)=1 FROM private.retention_policy_history),'retention: policy approval version preserved');
-- Attachment adapter: same reservations as existing cleanup, protected metadata retained.
INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,scanner_status,created_by)
 SELECT '70000000-0000-4000-a000-000000000001',office,request,'local-retention.pdf','application/pdf',100,repeat('a',64),'documento','disponivel','clean','00000000-0000-4000-a000-000000000205' FROM retention_fixture;
INSERT INTO private.upload_intents(id,office_id,request_id,file_id,created_by,session_id,idempotency_key,payload_digest,object_path,policy_snapshot)
 SELECT '70000000-0000-4000-a000-000000000002',office,request,'70000000-0000-4000-a000-000000000001','00000000-0000-4000-a000-000000000205','00000000-0000-4000-c000-000000000205','retention-fixture','hash',office::text||'/70000000-0000-4000-a000-000000000002/70000000-0000-4000-a000-000000000003','{}' FROM retention_fixture;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.assert_true(public.retention_state('00000000-0000-4000-e000-000000000201',1)->>'candidate_total'='0','retention: archive manager without file read sees no file name');
SELECT test.expect_error($q$SELECT public.retention_classify(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id','70000000-0000-4000-a000-000000000001','data_class','signed_document','document_type','Local test only','revision',0)) FROM retention_fixture$q$,'PT403','retention: archive permission alone cannot classify attachment');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
INSERT INTO retention_result SELECT 'file',public.retention_classify(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id','70000000-0000-4000-a000-000000000001','data_class','signed_document','document_type','Local test only','revision',0)) FROM retention_fixture;
RESET ROLE;
UPDATE public.files SET legal_hold=true WHERE id='70000000-0000-4000-a000-000000000001';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.retention_reserve('00000000-0000-4000-e000-000000000201',(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='file'),1)$q$,'PT409','retention: existing file legal hold protects bytes');
RESET ROLE;
UPDATE public.files SET legal_hold=false,retain_until=clock_timestamp()+interval '1 day' WHERE id='70000000-0000-4000-a000-000000000001';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.retention_reserve('00000000-0000-4000-e000-000000000201',(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='file'),1)$q$,'PT409','retention: existing file deadline protects bytes');
RESET ROLE;
UPDATE public.files SET retain_until=NULL WHERE id='70000000-0000-4000-a000-000000000001';
INSERT INTO private.file_references(office_id,file_id,reference_kind) SELECT office,'70000000-0000-4000-a000-000000000001','checklist12' FROM retention_fixture;
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.retention_reserve('00000000-0000-4000-e000-000000000201',(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='file'),1)$q$,'PT409','retention: other module reference blocks physical erasure');
RESET ROLE;
DELETE FROM private.file_references WHERE file_id='70000000-0000-4000-a000-000000000001';
INSERT INTO private.file_references(office_id,file_id,reference_kind) SELECT office,'70000000-0000-4000-a000-000000000001','document_signature24' FROM retention_fixture;
INSERT INTO private.document_signature_events24(office_id,publication_id,actor_id,kind,reason,state,file_id) SELECT f.office,p.id,'00000000-0000-4000-a000-000000000201','import','Disposable local fixture','{}','70000000-0000-4000-a000-000000000001' FROM retention_fixture f JOIN private.document_publications p ON p.office_id=f.office AND p.document_id=f.doc LIMIT 1;
SET ROLE authenticated;
SELECT public.retention_reserve(office,(SELECT (data#>>'{item,id}')::uuid FROM retention_result WHERE kind='file'),1) FROM retention_fixture;
SELECT test.expect_error($q$SELECT public.files_download('00000000-0000-4000-e000-000000000201','70000000-0000-4000-a000-000000000001',gen_random_uuid())$q$,'PT409','retention: file downloads blocked at reservation');
RESET ROLE;
SELECT test.expect_error($q$INSERT INTO private.file_references(office_id,file_id,reference_kind) VALUES('00000000-0000-4000-e000-000000000201','70000000-0000-4000-a000-000000000001','new_reference')$q$,'PT409','retention: new references cannot race committed reservation');
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
INSERT INTO retention_result VALUES('file_claim',public.retention_worker_claim());
RESET ROLE;
UPDATE private.retention_purges SET lease_until=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT (data#>>'{items,0,id}')::uuid FROM retention_result WHERE kind='file_claim');
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
INSERT INTO retention_result VALUES('file_retry',public.retention_worker_claim());
SELECT test.expect_error($q$SELECT public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid) FROM retention_result WHERE kind='file_claim'$q$,'PT409','retention: retry rotates token and denies abandoned worker');
SELECT test.assert_true(public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid)->>'completed'='true','retention: retry finishes physical attachment disposition') FROM retention_result WHERE kind='file_retry';
RESET ROLE;
SELECT test.assert_true((SELECT status='removido' AND sha256=repeat('a',64) FROM public.files WHERE id='70000000-0000-4000-a000-000000000001'),'retention: file metadata and hash survive erasure');
SELECT test.assert_true(EXISTS(SELECT FROM private.file_references WHERE file_id='70000000-0000-4000-a000-000000000001'),'retention: immutable signature reference is preserved after authorized erasure');
-- Automatic lifecycle: classification is advance administrative authorization;
-- cron must reserve due configured items without a manual reserve RPC.
CREATE TEMP TABLE retention_auto_fixture(id uuid,data_class text,document_type text,days integer);
INSERT INTO retention_auto_fixture VALUES
 ('70000000-0000-4000-a000-000000000011','optional','Automatic due',0),
 ('70000000-0000-4000-a000-000000000012','registration','Automatic future',365),
 ('70000000-0000-4000-a000-000000000013','tax','Automatic held',0),
 ('70000000-0000-4000-a000-000000000014','audit','Automatic expired policy',0);
GRANT SELECT ON retention_auto_fixture TO authenticated;
INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,scanner_status,created_by)
 SELECT a.id,f.office,f.request,'automatic-fixture.pdf','application/pdf',100,repeat('b',64),'documento','disponivel','clean','00000000-0000-4000-a000-000000000205' FROM retention_auto_fixture a CROSS JOIN retention_fixture f;
INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,scanner_status,created_by)
 SELECT '70000000-0000-4000-a000-000000000015',office,request,'unclassified-fixture.pdf','application/pdf',100,repeat('c',64),'documento','disponivel','clean','00000000-0000-4000-a000-000000000205' FROM retention_fixture;
INSERT INTO private.upload_intents(id,office_id,request_id,file_id,created_by,session_id,idempotency_key,payload_digest,object_path,policy_snapshot)
 SELECT a.id,f.office,f.request,a.id,'00000000-0000-4000-a000-000000000205','00000000-0000-4000-c000-000000000205',a.id::text,'hash',f.office::text||'/'||a.id::text||'/'||a.id::text,'{}' FROM retention_auto_fixture a CROSS JOIN retention_fixture f;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.retention_policy_set(f.office,jsonb_build_object('data_class',a.data_class,'document_type',a.document_type,'legal_basis','Synthetic local fixture','justification','Disposable automation test','start_event','account_closed','period_days',a.days,'review_at',clock_timestamp()+interval '30 days','backup_disposition','Local disposable only','revision',0,'approved',true)) FROM retention_auto_fixture a CROSS JOIN retention_fixture f;
SELECT public.retention_classify(f.office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id',a.id,'data_class',a.data_class,'document_type',a.document_type,'revision',0)) FROM retention_auto_fixture a CROSS JOIN retention_fixture f;
SELECT public.retention_hold(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','data_class','tax','reason','Local automatic hold test','release_id',NULL)) FROM retention_fixture;
RESET ROLE;
UPDATE private.account_retention_policies SET review_at=clock_timestamp()-interval '1 second' WHERE document_type='Automatic expired policy';
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
INSERT INTO retention_result VALUES('auto_claim',public.retention_worker_claim());
SELECT test.assert_true(jsonb_array_length(data->'items')=1,'retention: cron selects configured zero-day item without manual reserve') FROM retention_result WHERE kind='auto_claim';
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.retention_items WHERE target_id='70000000-0000-4000-a000-000000000011' AND reserved_at IS NOT NULL),'retention: due classified item automatically reserved');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.retention_items WHERE target_id IN('70000000-0000-4000-a000-000000000012','70000000-0000-4000-a000-000000000013','70000000-0000-4000-a000-000000000014') AND reserved_at IS NOT NULL),'retention: future deadline, active hold and expired policy excluded automatically');
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id='70000000-0000-4000-a000-000000000015'),'retention: unclassified object never automatically erased');
SET ROLE service_role;
SET request.jwt.claims='{"role":"service_role"}';
SELECT test.assert_true(public.retention_worker_complete((data#>>'{items,0,id}')::uuid,(data#>>'{items,0,token}')::uuid)->>'completed'='true','retention: automatically scheduled erasure completes without human session') FROM retention_result WHERE kind='auto_claim';
RESET ROLE;
SELECT test.assert_true((SELECT status='removido' FROM public.files WHERE id='70000000-0000-4000-a000-000000000011'),'retention: automatic due file reaches eliminated state');
-- Fiscal/event-based deadlines cannot be inferred from account closure.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.retention_policy_set(office,jsonb_build_object('data_class','tax','document_type','Verified event local','legal_basis','Synthetic local test only','justification','Verified event deadline fixture','start_event','verified_event','period_days',10,'review_at',clock_timestamp()+interval '30 days','backup_disposition','Local disposable only','revision',0,'approved',true)) FROM retention_fixture;
SELECT test.expect_error(format('SELECT public.retention_classify(%L,%L::jsonb)',office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id','70000000-0000-4000-a000-000000000012','data_class','tax','document_type','Verified event local','revision',1)::text),'PT422','retention: fiscal deadline requires verified legal event') FROM retention_fixture;
SELECT test.expect_error(format('SELECT public.retention_classify(%L,%L::jsonb)',office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id','70000000-0000-4000-a000-000000000012','data_class','tax','document_type','Verified event local','revision',1,'verified_start_at',clock_timestamp()-interval '3 days','verified_start_reason',jsonb_build_object('forged','not text'))::text),'PT422','retention: verified-event reason has strict text type') FROM retention_fixture;
SELECT test.expect_error(format('SELECT public.retention_classify(%L,%L::jsonb)',office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id','70000000-0000-4000-a000-000000000012','data_class','tax','document_type','Verified event local','revision',1,'verified_start_at',clock_timestamp()+interval '1 day','verified_start_reason','Future event cannot be verified')::text),'PT422','retention: future event cannot trigger erasure') FROM retention_fixture;
SELECT public.retention_classify(office,jsonb_build_object('user_id','00000000-0000-4000-a000-000000000205','target_kind','file','target_id','70000000-0000-4000-a000-000000000012','data_class','tax','document_type','Verified event local','revision',1,'verified_start_at',clock_timestamp()-interval '3 days','verified_start_reason','Verified local fiscal fixture')) FROM retention_fixture;
RESET ROLE;
SELECT test.assert_true(abs(extract(epoch FROM(private.retention_deadline(i)-(clock_timestamp()+interval '7 days'))))<5,'retention: deadline derives from verified event rather than closed account') FROM private.retention_items i WHERE target_id='70000000-0000-4000-a000-000000000012';
ROLLBACK;
