-- Exclusively local fictional graph. No hosted fixture, scanner, signer or permission is fabricated.
RESET ROLE;
BEGIN;
SELECT test.assert_true(to_regprocedure('public.portal_share_command32(uuid,uuid,jsonb,uuid)') IS NOT NULL,'32: publication scoped sharing exists');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.portal_grants32','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','private.portal_grants32','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.portal_documents_page32(uuid,text,integer,integer)','EXECUTE'),'32: tables and anonymous RPC closed');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)SELECT ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'portal32-'||n||'@example.test',now(),'fixture' FROM generate_series(321,323)n;
INSERT INTO auth.sessions(id,user_id)SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000321' AND '00000000-0000-4000-a000-000000000323';
INSERT INTO public.profiles(id,display_name)SELECT id,'Pessoa Fictícia32' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000321' AND '00000000-0000-4000-a000-000000000323';
INSERT INTO public.memberships(id,office_id,user_id,role_code)SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000201',('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'client' FROM generate_series(321,323)n;
INSERT INTO public.customers(id,office_id,kind,name,created_by)SELECT ('00000000-0000-4000-f000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-4000-e000-000000000201','person',CASE WHEN n=321 THEN 'Comprador fictício32' ELSE 'Vendedor fictício32' END,'00000000-0000-4000-a000-000000000201' FROM generate_series(321,322)n;
INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,evidence,valid_from,created_by)SELECT '00000000-0000-4000-e000-000000000201',('00000000-0000-4000-f000-'||lpad(n::text,12,'0'))::uuid,'identity',('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,'Conferência fictícia32',clock_timestamp(),'00000000-0000-4000-a000-000000000201' FROM generate_series(321,322)n;
CREATE FUNCTION test.portal_fixture32(owner_customer uuid,other_customer uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE o uuid:='00000000-0000-4000-e000-000000000201';actor uuid:='00000000-0000-4000-a000-000000000201';member uuid:='00000000-0000-4000-b000-000000000201';r uuid;i uuid;d uuid;p uuid;charge uuid;source public.documents;ri public.request_items;BEGIN
 SELECT * INTO source FROM public.documents doc WHERE doc.office_id=o AND EXISTS(SELECT FROM public.request_items x WHERE x.id=doc.request_item_id AND coalesce((x.snapshot#>>'{definition,signature_required}')::boolean,false)=false) ORDER BY doc.created_at LIMIT 1;
 SELECT * INTO ri FROM public.request_items WHERE id=source.request_item_id;
 INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,idempotency_key,payload_digest)VALUES(o,'AT32-'||gen_random_uuid(),'TITULO INTERNO SECRETO32','presencial',actor,member,owner_customer,'normal',gen_random_uuid(),'fixture')RETURNING id INTO r;
 INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)VALUES(o,r,ri.service_id,ri.version_id,ri.snapshot,'{}','[]','[]')RETURNING id INTO i;
 INSERT INTO public.documents(office_id,request_id,request_item_id,template_id,template_version_id,protocol,title,revision,status,created_by,prepared_at)VALUES(o,r,i,source.template_id,source.template_version_id,'DOC32-'||gen_random_uuid(),'Contrato comum fictício32',1,'prepared',actor,clock_timestamp())RETURNING id INTO d;
 INSERT INTO private.document_revisions(office_id,document_id,revision,input,source,author_id,author_name)VALUES(o,d,1,'{"content":"Contrato FICTÍCIO32","overrides":{},"money_in_words":false}','{}',actor,'Autor fictício32');
 INSERT INTO public.document_participants(office_id,document_id,revision,position,customer_id,role,label,snapshot)VALUES(o,d,1,1,owner_customer,'buyer','Comprador',jsonb_build_object('role','buyer','customer_id',owner_customer,'name','Comprador fictício32','kind','person','identifier',NULL));
 IF other_customer IS NOT NULL THEN INSERT INTO public.document_participants(office_id,document_id,revision,position,customer_id,role,label,snapshot)VALUES(o,d,1,2,other_customer,'seller','Vendedor',jsonb_build_object('role','seller','customer_id',other_customer,'name','Vendedor fictício32','kind','person','identifier',NULL));END IF;
 INSERT INTO private.document_publications(office_id,document_id,revision,title,protocol,content,content_sha256,review_required,signature_policy,demonstration,created_by)SELECT o,d,1,'Contrato comum fictício32',doc.protocol,'CONTRATO FICTÍCIO32',encode(extensions.digest('CONTRATO FICTÍCIO32','sha256'),'hex'),false,'none',false,actor FROM public.documents doc WHERE doc.id=d RETURNING id INTO p;
 INSERT INTO private.document_artifact_jobs(office_id,publication_id,user_id,session_id,object_path,sha256,size_bytes,renderer,completed_at)VALUES(o,p,actor,'00000000-0000-4000-c000-000000000201',o::text||'/'||p::text||'/'||gen_random_uuid()::text,repeat('a',64),100,'jn-document-v1',clock_timestamp());
 INSERT INTO private.document_cash_tasks(office_id,request_id,publication_id)VALUES(o,r,p);
 INSERT INTO private.charges(office_id,request_id,created_by)VALUES(o,r,actor)RETURNING id INTO charge;
 INSERT INTO private.charge_items(office_id,charge_id,request_item_id,snapshot,quantity,unit_price_cents,total_cents)VALUES(o,charge,i,ri.snapshot,1,0,0);
 INSERT INTO private.charge_events(office_id,charge_id,version,kind,delta_cents,reason,actor_id)VALUES(o,charge,1,'created',0,'Isenção FICTÍCIA local32',actor);
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,to_status)VALUES(o,r,'created',actor,'NOTA INTERNA SECRETA32','aberto'),(o,r,'note',actor,'NOTA MEDICA SECRETA32',NULL),(o,r,'status',actor,'OUTRA NOTA SECRETA32','aguardando_cliente');
 RETURN jsonb_build_object('request',r,'document',d,'publication',p,'charge',charge);
END$$;
\set o32 '00000000-0000-4000-e000-000000000201'
\set buyer32 '00000000-0000-4000-f000-000000000321'
\set seller32 '00000000-0000-4000-f000-000000000322'
SELECT test.portal_fixture32(:'buyer32',:'seller32') AS graph32 \gset
SELECT test.portal_fixture32(:'seller32') AS independent32 \gset
SELECT :'graph32'::jsonb->>'publication' AS p32,:'graph32'::jsonb->>'request' AS r32,:'graph32'::jsonb->>'document' AS d32,:'graph32'::jsonb->>'charge' AS charge32,:'independent32'::jsonb->>'publication' AS otherp32,:'independent32'::jsonb->>'request' AS otherr32 \gset
SELECT test.assert_true(cardinality(private.wf_gate((SELECT p FROM private.document_publications p WHERE id=:'p32')))=0,'32: common fixture is centrally releasable');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000321","session_id":"00000000-0000-4000-c000-000000000321"}';
SELECT test.assert_true(public.portal_documents_page32(:'o32','',1,3)->>'total'='1','32: buyer sees only own document');
SELECT test.assert_true(public.portal_document_state32(:'o32',:'p32',1,3)->>'financial' IS NOT NULL,'32: own finance is permitted');
SELECT test.expect_error(format('SELECT public.portal_document_state32(%L,%L,1,3)',:'o32',:'otherp32'),'PT404','32: UUID cannot open independent seller case');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)',:'o32',:'otherr32'),'PT404','32: independent seller request not visible');
SELECT test.assert_true(public.requests_page(:'o32','SECRETO32','mine','',1,3)->>'total'='0','32: searching private title cannot infer an authorized or foreign record');
SELECT public.request_detail(:'o32',:'r32',1) AS rd32 \gset
SELECT test.assert_true(:'rd32'::jsonb->>'title'='Atendimento do escritório' AND :'rd32'::jsonb->>'message'='' AND(:'rd32'::jsonb#>>'{portal_history,total}')::int=2 AND :'rd32' NOT LIKE '%SECRETA32%' AND :'rd32' NOT LIKE '%actor_id%','32: linked request exposes only public history, never title/notes/actors');
SELECT test.expect_error(format('SELECT public.portal_share_command32(%L,%L,%L,gen_random_uuid())',:'o32',:'p32','{"kind":"grant"}'),'PT403','32: client cannot grant itself access');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000322","session_id":"00000000-0000-4000-c000-000000000322"}';
SELECT test.expect_error(format('SELECT public.portal_document_state32(%L,%L,1,3)',:'o32',:'p32'),'PT404','32: being named as participant alone gives no document access');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT jsonb_build_object('kind','grant','expected_revision',1,'customer_id',:'seller32','valid_until',clock_timestamp()+interval '1 day','evidence','Instrumento conferido fictício32') AS grantbody32,gen_random_uuid() AS key32 \gset
SELECT public.portal_share_command32(:'o32',:'p32',:'grantbody32',:'key32')->>'id' AS grant32 \gset
SELECT test.assert_true(public.portal_share_command32(:'o32',:'p32',:'grantbody32',:'key32')->>'id'=:'grant32','32: grant retry returns same decision');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000322","session_id":"00000000-0000-4000-c000-000000000322"}';
SELECT test.assert_true(public.portal_documents_page32(:'o32','',1,3)->>'total'='2' AND public.portal_document_state32(:'o32',:'p32',1,3)->'financial'='null'::jsonb,'32: seller sees common contract without buyer finance');
SELECT public.document_artifact_authorize(:'o32',:'p32',true);
SELECT test.assert_true(public.portal_document_state32(:'o32',:'p32',1,3)->>'history_total'='1','32: own download authorization recorded without another actor history');
SELECT test.expect_error(format('SELECT public.request_detail(%L,%L,1)',:'o32',:'r32'),'PT404','32: shared contract does not open buyer request');
SELECT test.expect_error(format('SELECT public.files_page(%L,%L,1,3)',:'o32',:'r32'),'PT404','32: shared contract does not open buyer attachments');
RESET ROLE;
SELECT test.assert_true((SELECT recipient_customer_id FROM private.document_releases25 WHERE office_id=:'o32' AND publication_id=:'p32' ORDER BY created_at DESC LIMIT 1)=:'seller32'::uuid,'32: release25 records the effective seller recipient');
SELECT test.assert_true(NOT private.finance_client_request((SELECT r FROM public.requests r WHERE id=:'r32'),(SELECT m FROM public.memberships m WHERE id='00000000-0000-4000-b000-000000000322')),'32: shared authorization never broadens finance');
INSERT INTO private.charge_events(office_id,charge_id,version,kind,delta_cents,reason,actor_id)VALUES(:'o32',:'charge32',2,'adjusted',100,'Cobrança FICTÍCIA superveniente32','00000000-0000-4000-a000-000000000201');
SET ROLE authenticated;
SELECT test.assert_true(public.portal_document_state32(:'o32',:'p32',1,3)#>'{document,blockers}'='["restriction"]'::jsonb,'32: participant pending condition never reveals third-party financial reason or amount');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'o32',:'p32'),'PT403','32: central payment rule blocks shared bytes again');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000323","session_id":"00000000-0000-4000-c000-000000000323"}';
SELECT test.assert_true(public.portal_documents_page32(:'o32','',1,3)->>'total'='0','32: third account sees no common or independent record');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'o32',:'p32'),'PT403','32: known publication UUID cannot fetch bytes as third account');
RESET ROLE;
-- Loss of current responsibility must invalidate a pre-existing grant without epoch changes.
SAVEPOINT authority32;
UPDATE public.requests SET assignee_id=NULL WHERE id=:'r32';
UPDATE private.portal_grants32 SET authority_epoch=gen_random_uuid() WHERE id=:'grant32';
SELECT test.assert_true(NOT private.portal_grant_valid32((SELECT g FROM private.portal_grants32 g WHERE id=:'grant32'),(SELECT p FROM private.document_publications p WHERE id=:'p32'),(SELECT m FROM public.memberships m WHERE id='00000000-0000-4000-b000-000000000322')),'32: stale issuer authority epoch denies grant');
ROLLBACK TO authority32;
SAVEPOINT scope32;
UPDATE public.memberships SET role_code='owner' WHERE id='00000000-0000-4000-b000-000000000323';
-- A same-office active team membership is sufficient to model a real transfer target.
UPDATE public.requests SET assignee_id=(SELECT id FROM public.memberships WHERE office_id=:'o32' AND role_code<>'client' AND id<>'00000000-0000-4000-b000-000000000201' AND active AND private.request_execution_allowed((SELECT req FROM public.requests req WHERE req.id=:'r32'),memberships) LIMIT 1) WHERE id=:'r32';
SELECT test.assert_true((SELECT assignee_id IS NOT NULL AND assignee_id<>'00000000-0000-4000-b000-000000000201' FROM public.requests WHERE id=:'r32'),'32: regression uses a distinct responsible member');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000322","session_id":"00000000-0000-4000-c000-000000000322"}';
SELECT test.expect_error(format('SELECT public.portal_document_state32(%L,%L,1,3)',:'o32',:'p32'),'PT404','32: transferred request invalidates issuer grant');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'o32',:'p32'),'PT403','32: transferred responsibility denies bytes');
RESET ROLE;
UPDATE public.requests SET assignee_id='00000000-0000-4000-b000-000000000201' WHERE id=:'r32';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.portal_document_state32(%L,%L,1,3)',:'o32',:'p32'),'PT404','32: A to B to A never resurrects old grant');
RESET ROLE;
ROLLBACK TO scope32;
SAVEPOINT source32;
INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,created_by)VALUES(:'o32',:'seller32','assignment','00000000-0000-4000-b000-000000000201','00000000-0000-4000-a000-000000000201');
SELECT test.assert_true((SELECT invalidated_at IS NOT NULL FROM private.portal_grants32 WHERE id=:'grant32'),'32: source assignment change persistently invalidates grant');
ROLLBACK TO source32;
SAVEPOINT identity32;
UPDATE private.customer_relations SET revoked_at=clock_timestamp(),revoked_by='00000000-0000-4000-a000-000000000201' WHERE customer_id=:'seller32' AND relation_type='identity';
INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,evidence,created_by)VALUES(:'o32',:'seller32','identity','00000000-0000-4000-b000-000000000322','Reconferência FICTÍCIA32','00000000-0000-4000-a000-000000000201');
SELECT test.assert_true(NOT private.portal_grant_valid32((SELECT g FROM private.portal_grants32 g WHERE id=:'grant32'),(SELECT p FROM private.document_publications p WHERE id=:'p32'),(SELECT m FROM public.memberships m WHERE id='00000000-0000-4000-b000-000000000322')),'32: identity reconfirmation cannot revive old grant');
ROLLBACK TO identity32;
SAVEPOINT bytes32;
UPDATE private.document_artifact_jobs SET sha256=repeat('b',64) WHERE publication_id=:'p32';
SELECT test.assert_true(NOT private.portal_grant_valid32((SELECT g FROM private.portal_grants32 g WHERE id=:'grant32'),(SELECT p FROM private.document_publications p WHERE id=:'p32'),(SELECT m FROM public.memberships m WHERE id='00000000-0000-4000-b000-000000000322')),'32: changed exact bytes invalidate grant');
ROLLBACK TO bytes32;
UPDATE private.portal_grants32 SET valid_until=clock_timestamp()-interval '1 minute' WHERE id=:'grant32';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000322","session_id":"00000000-0000-4000-c000-000000000322"}';
SELECT test.expect_error(format('SELECT public.portal_document_state32(%L,%L,1,3)',:'o32',:'p32'),'PT404','32: expired grant blocks old detail URL');
RESET ROLE;
UPDATE private.portal_grants32 SET valid_until=clock_timestamp()+interval '1 day',revoked_at=clock_timestamp() WHERE id=:'grant32';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.portal_document_state32(%L,%L,1,3)',:'o32',:'p32'),'PT404','32: revoked grant blocks subsequent operation');
RESET ROLE;
ROLLBACK;
