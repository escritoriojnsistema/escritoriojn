-- Only disposable databases: fixtures created by the existing integrated journey.
RESET ROLE;
SELECT test.assert_true(to_regclass('private.document_versions') IS NOT NULL,'22: document_versions exists');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.document_versions','SELECT') AND NOT has_table_privilege('anon','private.document_version_files','SELECT'),'22: snapshots and paths are private');
SELECT test.assert_true(NOT has_function_privilege('authenticated','public.document_version_complete(uuid,uuid,text,bigint)','EXECUTE'),'22: only trusted worker completes preview');
SELECT d.id AS v_doc,d.revision AS v_rev,d.office_id AS v_office FROM public.documents d JOIN private.document_publications p ON p.document_id=d.id WHERE d.office_id='00000000-0000-4000-e000-000000000201' ORDER BY p.created_at LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_versions_page(:'v_office',:'v_doc',1) AS v_page \gset
SELECT test.assert_true(:'v_page'::jsonb->'items'->0->>'status'='approved','22: exact approved revision identified');
SELECT :'v_page'::jsonb->'items'->0->>'id' AS v_id \gset
SELECT public.document_version_begin(:'v_office',:'v_id') AS v_job \gset
SELECT test.assert_true(:'v_job'::jsonb->>'content_sha256' IS NOT NULL AND :'v_job'::jsonb->>'completed'='false','22: preview permits internal review without financial release');
SELECT public.document_operate(:'v_office',:'v_doc',jsonb_build_object('kind','save','expected_revision',:'v_rev'::integer,'input',jsonb_build_object('content','Declaração corrigida {{cliente.nome}} em {{datas.emissao}}','overrides',jsonb_build_object('cliente.nome','Sônia e João'),'money_in_words',true),'idempotency_key',gen_random_uuid()));
SELECT public.document_versions_page(:'v_office',:'v_doc',1) AS v_new \gset
SELECT test.assert_true(:'v_new'::jsonb->'items'->0->>'status'='draft' AND :'v_new'::jsonb->'items'->1->>'status'='superseded','22: approved change creates draft without inheriting decision');
SELECT test.assert_true(:'v_new'::jsonb->'items'->1->>'id'=:'v_id','22: historical version identity remains stable');
SELECT public.document_version_begin(:'v_office',:'v_id') AS v_retry \gset
SELECT test.assert_true(:'v_retry'::jsonb->>'object_path'=:'v_job'::jsonb->>'object_path','22: historical preview reuses same private object');
RESET ROLE;
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='00000000-0000-4000-c000-000000000201';
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.document_version_complete(%L,%L,%L,100)',:'v_job'::jsonb->>'job_id',:'v_job'::jsonb->>'lease_token',repeat('b',64)),'PT403','22: revoked session cannot complete preview');
RESET ROLE;
UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000201';
SET ROLE service_role;
SELECT public.document_version_complete((:'v_job'::jsonb->>'job_id')::uuid,(:'v_job'::jsonb->>'lease_token')::uuid,repeat('b',64),100);
SELECT test.expect_error(format('SELECT public.document_version_complete(%L,%L,%L,100)',:'v_job'::jsonb->>'job_id',:'v_job'::jsonb->>'lease_token',repeat('c',64)),'PT409','22: preserved preview cannot change hash');
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT test.assert_true(public.document_version_authorize(:'v_office',:'v_id')->>'sha256'=repeat('b',64),'22: historical preview remains authorized internally');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_version_authorize(%L,%L)',:'v_office',:'v_id'),'PT403','22: client cannot preview internal draft');
RESET ROLE;
SELECT test.expect_error(format('UPDATE private.document_versions SET content=%L WHERE id=%L','changed',:'v_id'),'PT409','22: immutable version snapshot');
SELECT test.assert_true((SELECT count(*) FROM private.document_versions v JOIN private.document_revisions r USING(office_id,document_id,revision))=(SELECT count(*) FROM private.document_revisions),'22: every revision captured including participants');
SELECT test.assert_true((SELECT bool_and(renderer_version='jn-document-v1' AND renderer='jn-document-v1') FROM private.document_artifact_jobs WHERE completed_at IS NOT NULL),'22: existing final jobs retain renderer1 and original hash');
SELECT test.assert_true((SELECT bool_and(v.snapshot->'participants'=(SELECT coalesce(jsonb_agg(p.snapshot ORDER BY p.position),'[]') FROM public.document_participants p WHERE p.office_id=v.office_id AND p.document_id=v.document_id AND p.revision=v.revision)) FROM private.document_versions v),'22: snapshots contain exact participants of each revision');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT (public.document_detail(:'v_office',:'v_doc',NULL,1)->>'revision')::integer AS v_revision \gset
SELECT public.document_operate(:'v_office',:'v_doc',jsonb_build_object('kind','prepare','expected_revision',:'v_revision'::integer,'idempotency_key',gen_random_uuid()));
SELECT public.document_workflow_command(:'v_office',:'v_doc',jsonb_build_object('kind','freeze','expected_revision',:'v_revision'::integer,'reason','Nova revisão'),gen_random_uuid()) AS v_frozen \gset
SELECT :'v_frozen'::jsonb->'publications'->0->>'id' AS v_pub \gset
SELECT test.assert_true(public.document_versions_page(:'v_office',:'v_doc',1)->'items'->0->>'status'='in_review','22: frozen prepared version is in review');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_workflow_command(:'v_office',:'v_doc',jsonb_build_object('kind','reject','expected_revision',:'v_revision'::integer,'publication_id',:'v_pub','reason','Correção necessária'),gen_random_uuid());
SELECT test.assert_true(public.document_versions_page(:'v_office',:'v_doc',1)->'items'->0->>'status'='rejected','22: rejection is exact and auditable');
SELECT public.document_workflow_command(:'v_office',:'v_doc',jsonb_build_object('kind','approve','expected_revision',:'v_revision'::integer,'publication_id',:'v_pub','reason','Reconsideração explícita conferida'),gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_artifact_begin(:'v_office',:'v_pub') AS v_final_job \gset
SELECT test.assert_true(:'v_final_job'::jsonb->>'renderer_version'='jn-document-v2','22: new final jobs select renderer2 explicitly');
RESET ROLE;
SET ROLE service_role;
SELECT test.expect_error(format('SELECT public.document_artifact_complete(%L,%L,%L,100,%L)',:'v_final_job'::jsonb->>'job_id',:'v_final_job'::jsonb->>'lease_token',repeat('c',64),'jn-document-v1'),'PT422','22: wrong final renderer rejected');
SELECT test.assert_true(public.document_artifact_complete((:'v_final_job'::jsonb->>'job_id')::uuid,(:'v_final_job'::jsonb->>'lease_token')::uuid,repeat('c',64),100,'jn-document-v2')->>'ready'='true','22: selected renderer2 accepted');
RESET ROLE;

-- A reader with broad capabilities and no direct relation: service JWT is empty.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_versions_page(:'v_office',:'v_doc',1)->'items'->0->>'id' AS v_reader_id \gset
SELECT public.document_version_begin(:'v_office',:'v_reader_id') AS v_reader_job \gset
RESET ROLE;
SET request.jwt.claims='{}';
SET ROLE service_role;
SELECT test.assert_true(public.document_version_complete((:'v_reader_job'::jsonb->>'job_id')::uuid,(:'v_reader_job'::jsonb->>'lease_token')::uuid,repeat('d',64),120)->>'ready'='true','22: broad reader completes under service JWT without inheriting service identity');
RESET ROLE;
