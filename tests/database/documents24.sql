-- Disposable database only. Reuse real persisted22 revision and attachment11 contract.
SELECT test.assert_true(to_regprocedure('public.document_signature_state(uuid,uuid,integer)') IS NOT NULL,'24: signature RPC exists');
BEGIN;
RESET ROLE;
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.document_signature_events24','SELECT,INSERT,UPDATE,DELETE') AND NOT has_function_privilege('anon','public.document_signature_command(uuid,uuid,jsonb,uuid)','EXECUTE'),'24: events private and anonymous mutations denied');
SELECT test.assert_true((SELECT count(*)=2 FROM public.role_permissions WHERE permission_code IN('documents.signatures.manage','documents.signatures.validate') AND role_code='owner') AND NOT EXISTS(SELECT FROM public.role_permissions WHERE permission_code LIKE 'documents.signatures.%' AND role_code<>'owner'),'24: capability seed exclusively owner');
SELECT p.office_id AS o24,p.id AS p24,d.id AS d24,d.revision AS r24,d.request_id AS q24 FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision WHERE p.office_id='00000000-0000-4000-e000-000000000201' AND private.wf_approved(p) ORDER BY p.created_at DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_signature_state(:'o24',:'p24',1) AS s24 \gset
SELECT test.assert_true(:'s24'::jsonb->>'can_manage'='true' AND :'s24'::jsonb->>'can_validate'='true','24: owner capabilities with current responsibility');
SAVEPOINT external24;
-- Settled publications must still configure formalization before any signing receipt.
SAVEPOINT setup24;
SELECT public.document_workflow_command(:'o24',:'d24',jsonb_build_object('kind','handoff','expected_revision',:'r24'::int,'publication_id',:'p24','reason','Cobrança para teste de saída sem configuração'),gen_random_uuid());
RESET ROLE;
-- The existing workflow journey left a one-cent reversal. Restore it through the real ledger.
SELECT c.id AS charge24,a.balance_cents AS due24,a.version AS cv24 FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE c.office_id=:'o24' AND c.request_id=:'q24' AND NOT a.cancelled \gset
SELECT cs.id AS cash24,cs.version AS cashv24,pm.id AS method24 FROM private.cash_sessions cs JOIN private.payment_methods pm ON pm.office_id=cs.office_id AND pm.unit_id=cs.unit_id AND pm.destination_account_id=cs.cash_account_id WHERE cs.office_id=:'o24' AND cs.operator_id='00000000-0000-4000-a000-000000000206' AND cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_cash_claim(:'o24',:'p24',gen_random_uuid());
SELECT public.payment_operate(:'o24',jsonb_build_object('kind','record','session_id',:'cash24','expected_version',:'cashv24'::int,'idempotency_key',gen_random_uuid(),'evidence','Restaurar saldo no laboratório24','payment_method_id',:'method24','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',:'charge24','expected_charge_version',:'cv24'::int,'amount_cents',:'due24'::bigint)),'presented_cents',:'due24'::bigint,'fee_cents',0,'settlement','not_applicable','settled_on',NULL,'external_reference',NULL));
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
RESET ROLE;
SELECT test.assert_true((SELECT 'signature_setup'=ANY(private.signature_exit_blockers24(jsonb_populate_record(NULL::private.document_publications,to_jsonb(p)||jsonb_build_object('signature_policy','external')))) FROM private.document_publications p WHERE p.id=:'p24'),'24: default external publication without expected signers requires setup');
SET ROLE authenticated;
SELECT public.document_signature_state(:'o24',:'p24',1) AS setupstate24 \gset
SELECT test.assert_true(:'setupstate24'::jsonb->>'can_exit'='false' AND (:'setupstate24'::jsonb->'exit_blockers') ? 'signature_setup' AND NOT ((:'setupstate24'::jsonb->'exit_blockers') ? 'payment'),'24: settled publication without signers blocks signing setup');
SELECT test.expect_error(format('SELECT public.document_signature_authorize(%L,%L,true)',:'o24',:'p24'),'PT422','24: missing setup denies signing receipt even after settlement');
SELECT test.assert_true(public.document_signature_state(:'o24',:'p24',1)->>'history_total'='0','24: denied setup output never appends exit or locks configuration');
SELECT test.assert_true(public.document_signature_command(:'o24',:'p24',jsonb_build_object('kind','configure','expected_revision',:'r24'::int,'expected_event_id',NULL,'reason','Configuração permanece recuperável após saída negada','mode','external','exit_policy','before_settlement','expected_signers',jsonb_build_array('Pessoa do teste')),gen_random_uuid())->>'status'='pending','24: denied signing output leaves publication configurable');
ROLLBACK TO SAVEPOINT setup24;
SELECT jsonb_build_object('kind','configure','expected_revision',:'r24'::int,'expected_event_id',NULL,'reason','Saída deliberada antes da quitação','mode','external','exit_policy','before_settlement','expected_signers',jsonb_build_array('Signatário local')) AS c24,gen_random_uuid() AS k24 \gset
SELECT public.document_signature_command(:'o24',:'p24',:'c24',:'k24') AS s24 \gset
SELECT test.assert_true(:'s24'::jsonb->>'status'='pending' AND :'s24'::jsonb->>'mode'='external','24: external configuration never signs automatically');
SELECT test.assert_true(public.document_signature_command(:'o24',:'p24',:'c24',:'k24')->>'last_event_id'=:'s24'::jsonb->>'last_event_id','24: exact idempotent replay');
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,%L)',:'o24',:'p24',(:'c24'::jsonb||'{"reason":"Outro motivo"}')::text,:'k24'),'PT409','24: key rejects divergent payload');
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,gen_random_uuid())',:'o24',:'p24',:'c24'),'PT409','24: stale expected event conflicts');
SELECT test.assert_true(public.document_signature_authorize(:'o24',:'p24',true)->>'bucket'='jn-document-artifacts','24: signing output returns base PDF without signature or handoff cycle');
SELECT test.expect_error(format('SELECT public.document_artifact_authorize(%L,%L,false)',:'o24',:'p24'),'PT422','24: final cannot select missing external original');
SELECT public.document_workflow_command(:'o24',:'d24',jsonb_build_object('kind','handoff','expected_revision',:'r24'::int,'publication_id',:'p24','reason','Cobrança anterior à assinatura'),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.document_workflow_command(%L,%L,%L,gen_random_uuid())',:'o24',:'d24',jsonb_build_object('kind','signature','expected_revision',:'r24'::int,'publication_id',:'p24','reason','Registro simplificado proibido')::text),'PT422','24: old simplified signature command blocked');
RESET ROLE;
INSERT INTO public.files(office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by)VALUES(:'o24',:'q24','assinado.pdf','application/pdf',100,repeat('d',64),'documento','quarentena','00000000-0000-4000-a000-000000000201')RETURNING id AS f24 \gset
SELECT gen_random_uuid() AS intent24 \gset
INSERT INTO private.upload_intents(id,office_id,request_id,file_id,created_by,session_id,idempotency_key,payload_digest,object_path,policy_snapshot)VALUES(:'intent24',:'o24',:'q24',:'f24','00000000-0000-4000-a000-000000000201','00000000-0000-4000-c000-000000000201',gen_random_uuid()::text,'local',:'o24'||'/'||:'intent24'||'/'||gen_random_uuid(),'{}');
SET ROLE authenticated;
SELECT public.document_signature_command(:'o24',:'p24',jsonb_build_object('kind','import','expected_revision',:'r24'::int,'expected_event_id',:'s24'::jsonb->>'last_event_id','reason','Importar original local','file_id',:'f24'),gen_random_uuid()) AS s24 \gset
SELECT test.assert_true(:'s24'::jsonb->>'status'='in_validation' AND :'s24'::jsonb#>>'{file,scanner_status}'='not_configured','24: quarantine is visible but blocks acceptance');
SELECT jsonb_build_object('kind','validate','expected_revision',:'r24'::int,'expected_event_id',:'s24'::jsonb->>'last_event_id','reason','Conferência humana local','result','validated','verified_signers',jsonb_build_array('Signatário local'),'evidence','Consulta humana de teste local','sha256',repeat('d',64)) AS validate24 \gset
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,gen_random_uuid())',:'o24',:'p24',:'validate24'),'PT422','24: scanner not configured cannot validate');
RESET ROLE;
SELECT test.assert_true(EXISTS(SELECT FROM private.file_references WHERE file_id=:'f24' AND reference_kind='document_signature24'),'24: imported original protected from cleanup');
UPDATE public.files SET status='disponivel',scanner_status='clean',actual_sha256=sha256,actual_size_bytes=size_bytes,actual_mime_type=mime_type,validated_at=clock_timestamp() WHERE id=:'f24';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,gen_random_uuid())',:'o24',:'p24',(:'validate24'::jsonb||jsonb_build_object('sha256',repeat('e',64)))::text),'PT422','24: forged browser hash rejected');
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,gen_random_uuid())',:'o24',:'p24',(:'validate24'::jsonb||'{"verified_signers":[]}')::text),'PT422','24: missing signer rejected');
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,gen_random_uuid())',:'o24',:'p24',(:'validate24'::jsonb||jsonb_build_object('verified_signers',jsonb_build_array('Signatário local','Outra pessoa')))::text),'PT422','24: unconfigured signer cannot be added at validation');
SAVEPOINT invalid24;
SELECT public.document_signature_command(:'o24',:'p24',:'validate24'::jsonb||'{"result":"invalid","verified_signers":[]}',gen_random_uuid()) AS invalid24 \gset
SELECT test.assert_true(:'invalid24'::jsonb->>'status'='invalid','24: negative human decision accepts incomplete signers and keeps gate closed');
ROLLBACK TO SAVEPOINT invalid24;
SELECT public.document_signature_command(:'o24',:'p24',:'validate24',gen_random_uuid()) AS s24 \gset
SELECT test.assert_true(:'s24'::jsonb->>'status'='validated','24: clean exact original human validation accepted');
SELECT test.expect_error(format('SELECT public.document_signature_command(%L,%L,%L,gen_random_uuid())',:'o24',:'p24',jsonb_build_object('kind','configure','expected_revision',:'r24'::int,'expected_event_id',:'s24'::jsonb->>'last_event_id','reason','Não substituir requisito aprovado','mode','none','exit_policy','before_settlement','expected_signers','[]'::jsonb)::text),'PT409','24: formalized publication cannot lower requirement through configuration');
RESET ROLE;
SELECT test.assert_true((SELECT private.wf_signed(p) FROM private.document_publications p WHERE p.id=:'p24'),'24: external signature gate checks exact file');
-- The existing workflow journey left a one-cent reversal. Restore it through the real ledger.
SELECT c.id AS charge24,a.balance_cents AS due24,a.version AS cv24 FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE c.office_id=:'o24' AND c.request_id=:'q24' AND NOT a.cancelled \gset
SELECT cs.id AS cash24,cs.version AS cashv24,pm.id AS method24 FROM private.cash_sessions cs JOIN private.payment_methods pm ON pm.office_id=cs.office_id AND pm.unit_id=cs.unit_id AND pm.destination_account_id=cs.cash_account_id WHERE cs.office_id=:'o24' AND cs.operator_id='00000000-0000-4000-a000-000000000206' AND cs.status='open' ORDER BY cs.opened_at DESC LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT public.document_cash_claim(:'o24',:'p24',gen_random_uuid());
SELECT public.payment_operate(:'o24',jsonb_build_object('kind','record','session_id',:'cash24','expected_version',:'cashv24'::int,'idempotency_key',gen_random_uuid(),'evidence','Restaurar saldo no laboratório24','payment_method_id',:'method24','status','confirmed','allocations',jsonb_build_array(jsonb_build_object('charge_id',:'charge24','expected_charge_version',:'cv24'::int,'amount_cents',:'due24'::bigint)),'presented_cents',:'due24'::bigint,'fee_cents',0,'settlement','not_applicable','settled_on',NULL,'external_reference',NULL));
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
SELECT public.document_artifact_authorize(:'o24',:'p24',false) AS artifact24 \gset
SELECT test.assert_true(:'artifact24'::jsonb->>'bucket'='request-attachments' AND :'artifact24'::jsonb->>'file_id'=:'f24' AND :'artifact24'::jsonb->>'sha256'=repeat('d',64),'24: final selects exact validated external original, never regenerated base');
RESET ROLE;
SELECT test.expect_error(format('UPDATE private.document_signature_events24 SET reason=%L WHERE publication_id=%L','alterado',:'p24'),'PT409','24: events immutable');
SET ROLE authenticated;
SELECT public.document_signature_command(:'o24',:'p24',jsonb_build_object('kind','revoke','expected_revision',:'r24'::int,'expected_event_id',:'s24'::jsonb->>'last_event_id','reason','Revogação humana da decisão'),gen_random_uuid()) AS s24 \gset
RESET ROLE;
SELECT test.assert_true((SELECT NOT private.wf_signed(p) FROM private.document_publications p WHERE p.id=:'p24'),'24: revocation immediately closes signature gate');
SET ROLE authenticated;
ROLLBACK TO SAVEPOINT external24;
SELECT public.document_signature_state(:'o24',:'p24',1) AS s24 \gset
SELECT public.document_signature_command(:'o24',:'p24',jsonb_build_object('kind','configure','expected_revision',:'r24'::int,'expected_event_id',:'s24'::jsonb->>'last_event_id','reason','Formalização física','mode','physical','exit_policy','after_settlement','expected_signers',jsonb_build_array('Signatário local')),gen_random_uuid()) AS s24 \gset
SELECT public.document_signature_command(:'o24',:'p24',jsonb_build_object('kind','physical','expected_revision',:'r24'::int,'expected_event_id',:'s24'::jsonb->>'last_event_id','reason','Conferência presencial','verified_signers',jsonb_build_array('Signatário local'),'evidence','Via física conferida pessoalmente','signed_on',current_date::text,'custody','Arquivo físico local','notary_reference',''),gen_random_uuid()) AS s24 \gset
SELECT test.assert_true(:'s24'::jsonb->>'status'='validated' AND :'s24'::jsonb->'file'='null'::jsonb AND :'s24'::jsonb->>'custody'='Arquivo físico local','24: physical custody preserves representation without invented crypto hash');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000206","session_id":"00000000-0000-4000-c000-000000000206"}';
SELECT test.expect_error(format('SELECT public.document_signature_authorize(%L,%L,false)',:'o24',:'p24'),'PT403','24: review and finance permissions never imply signature management');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
SELECT test.expect_error(format('SELECT public.document_signature_state(%L,%L,1)',:'o24',:'p24'),'PT403','24: clients cannot read internal evidence');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000203","session_id":"00000000-0000-4000-c000-000000000203"}';
SELECT test.expect_error(format('SELECT public.document_signature_state(%L,%L,1)',:'o24',:'p24'),'PT403','24: other office cannot inspect signature state');
RESET ROLE;
ROLLBACK;
