-- Run after document-workflow.sql and ALL migrations, only in the local replay.
-- The historical fixture has an approved artifact, verified client identity,
-- and a one-cent reversal. Signature24 also blocks its older external evidence;
-- listability never grants canonical bytes or bypasses either current gate.
BEGIN;
RESET ROLE;
SELECT p.id AS published_portal_id,p.title AS published_portal_title,p.protocol AS published_portal_protocol
 FROM private.document_publications p
 JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision
 JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id
 JOIN public.memberships m ON m.office_id=r.office_id AND m.id='00000000-0000-4000-b000-000000000205'
 WHERE p.office_id='00000000-0000-4000-e000-000000000201' AND private.wf_approved(p)
 AND private.wf_recipient(r,m) AND 'payment'=ANY(private.wf_gate(p,m))
 AND EXISTS(SELECT FROM private.document_artifact_jobs j WHERE j.office_id=p.office_id AND j.publication_id=p.id AND j.completed_at IS NOT NULL)
 ORDER BY p.created_at,p.id LIMIT 1 \gset
-- Missing historical publication fails explicitly; this suite must not silently skip.
SELECT test.assert_true(EXISTS(SELECT FROM private.document_publications WHERE id=:'published_portal_id'),'portal published: approved artifact and verified recipient fixture exists');
-- Calculate its page from the same eligible population, retaining five-item paging.
SELECT (1+(row_number-1)/5)::integer AS published_portal_page FROM(
 SELECT p.id,row_number() OVER(ORDER BY p.created_at DESC,p.id DESC)
 FROM private.document_publications p
 JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision
 JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id
 JOIN public.memberships m ON m.office_id=r.office_id AND m.id='00000000-0000-4000-b000-000000000205'
 WHERE p.office_id='00000000-0000-4000-e000-000000000201' AND private.wf_recipient(r,m)
) visible WHERE id=:'published_portal_id' \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT public.portal_documents_page('00000000-0000-4000-e000-000000000201',:'published_portal_page') AS published_portal_result \gset
SELECT test.assert_true((:'published_portal_result'::jsonb->>'total')::integer>0,'portal published: final-schema authenticated page contains documents');
SELECT test.assert_true(EXISTS(SELECT FROM jsonb_array_elements(:'published_portal_result'::jsonb->'items') i WHERE i->>'id'=:'published_portal_id' AND i->>'title'=:'published_portal_title' AND i->>'protocol'=:'published_portal_protocol' AND i->>'ready'='false' AND i->'blockers' ? 'payment'),'portal published: approved document is listed with financial blocker preserved');
SELECT test.assert_true(NOT EXISTS(SELECT FROM jsonb_array_elements(:'published_portal_result'::jsonb->'items') i WHERE i ?| ARRAY['content','object_path','customer_id','created_by','request_id','document_id']),'portal published: client projection excludes private data and storage path');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)','00000000-0000-4000-e000-000000000201',:'published_portal_id'),'PT422','portal published: historical fixture with incomplete signature cannot access canonical bytes');
RESET ROLE;
-- Etapa31: a real historical artifact must disappear immediately without its verified identity.
UPDATE private.customer_relations SET revoked_at=clock_timestamp(),revoked_by='00000000-0000-4000-a000-000000000201',version=version+1 WHERE office_id='00000000-0000-4000-e000-000000000201' AND membership_id='00000000-0000-4000-b000-000000000205' AND relation_type='identity' AND revoked_at IS NULL;
SET ROLE authenticated;
SELECT test.assert_true(public.portal_documents_page('00000000-0000-4000-e000-000000000201',1)->>'total'='0','31: historical published artifacts are hidden without verified link');
RESET ROLE;
ROLLBACK;
