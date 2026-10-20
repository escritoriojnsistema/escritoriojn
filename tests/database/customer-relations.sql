-- Etapa08: local-only, fictitious fixtures. This first assertion is the RED contract.
SELECT test.assert_true(to_regprocedure('public.customer_relations_state(uuid,uuid)') IS NOT NULL,
 'relacionamentos: RPC de estado existe');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'relation-'||n||'@example.test',now(),'fixture' FROM generate_series(81,89) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000081' AND '00000000-0000-4000-a000-000000000089';
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa Relação '||right(id::text,2) FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000081' AND '00000000-0000-4000-a000-000000000089';
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000081','Relações A'),('00000000-0000-4000-e000-000000000082','Relações B');
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=83 THEN '00000000-0000-4000-e000-000000000082' ELSE '00000000-0000-4000-e000-000000000081' END::uuid,
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,CASE WHEN n IN(81,83) THEN 'owner' WHEN n IN(88,89) THEN 'client' ELSE 'employee' END FROM generate_series(81,89) n;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p
 FROM generate_series(82,87) n CROSS JOIN unnest(ARRAY['customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge']) p
 WHERE (n=82 AND p IN ('customers.read','customers.create','customers.update')) OR (n=84 AND p='customers.read') OR (n=85 AND p IN('customers.read','customers.read_all')) OR n=86;
\set office08 '00000000-0000-4000-e000-000000000081'
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE role_code='owner' AND permission_code IN('customers.relate','customers.verify','customers.merge'))=3
 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code IN('customers.relate','customers.verify','customers.merge')),'relacionamentos: seed exclusivo owner');
SELECT test.assert_true(NOT has_table_privilege('authenticated','private.customer_relations','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('service_role','private.customer_snapshots','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_function_privilege('authenticated','private.customer_snapshot_capture(public.customers)','EXECUTE')
 AND NOT has_function_privilege('anon','public.customer_merge_preview(uuid,uuid,uuid)','EXECUTE')
 AND (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN('private.customer_relations'::regclass,'private.customer_snapshots'::regclass,'private.customer_merges'::regclass)), 'relacionamentos: ACL privada e RLS sem bypass bruto');
SELECT test.assert_true((SELECT count(*)=5 AND bool_and(NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN('customer_relations_state','customer_relation_candidates','customer_relation_command','customer_merge_preview','customer_merge')),'relacionamentos: cinco wrappers invoker com search_path vazio');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_create(:'office08','{"kind":"person","name":"Origem08","identifier":"52998224725","contacts":[{"kind":"email","value":"relation-88@example.test"}]}',gen_random_uuid())->>'id' AS source08 \gset
SELECT public.customer_create(:'office08','{"kind":"person","name":"Destino08","contacts":[{"kind":"phone","value":"11999990008"}]}',gen_random_uuid())->>'id' AS target08 \gset
SELECT public.customer_create(:'office08','{"kind":"person","name":"Representante08","contacts":[]}',gen_random_uuid())->>'id' AS rep08 \gset
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'capabilities'='{"can_relate":true,"can_verify":true,"can_merge":true}'
 AND public.customer_relations_state(:'office08',:'source08')->>'portal_enabled'='false','relacionamentos: estado retorna autoridade explicita sem portal');
SET ROLE anon;
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'source08'),'42501','relacionamentos: anon nega RPC');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'source08'),'PT401','relacionamentos: sessao ausente');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000088","session_id":"00000000-0000-4000-c000-000000000088","user_metadata":{"role":"owner"}}';
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'source08'),'PT403','relacionamentos: client metadata nao concede autoridade');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000083","session_id":"00000000-0000-4000-c000-000000000083"}';
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'source08'),'PT403','relacionamentos: outro escritorio');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'source08'),'PT404','relacionamentos: read sem atribuicao nao ve ficha');
SELECT test.expect_error(format('SELECT public.customer_relation_candidates(%L,%L,%L)',:'office08','team',''),'PT403','relacionamentos: candidatos exigem capacidade propria');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'source08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())->'assignments'->0->>'id' AS assignment08 \gset
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'source08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}'),'PT409','relacionamentos: grant duplicado conflita');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.assert_true(public.customer_detail(:'office08',:'source08')->>'id'=:'source08' AND public.customers_page(:'office08','Origem08',1,5)->>'total'='1','relacionamentos: atribuicao valida amplia detalhe e lista07');
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'capabilities'='{"can_relate":false,"can_verify":false,"can_merge":false}','relacionamentos: leitura nao inventa capacidades');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'source08','assignment.revoke',jsonb_build_object('id',:'assignment08','version',1),gen_random_uuid());
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'source08','assignment.revoke',jsonb_build_object('id',:'assignment08','version',1)),'PT409','relacionamentos: revogacao exige versao atual');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'source08'),'PT404','relacionamentos: revogado perde acesso');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000085","session_id":"00000000-0000-4000-c000-000000000085"}';
SELECT test.assert_true(public.customer_detail(:'office08',:'source08')->>'id'=:'source08','relacionamentos: read_all independente preservado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT test.assert_true(public.customer_detail(:'office08',:'source08')->>'id'=:'source08','relacionamentos: criador independente preservado');
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'source08','representation.grant',jsonb_build_object('representative_customer_id',:'rep08','kind','proxy','evidence','','valid_from','2020-01-01T00:00:00Z','valid_until',NULL)),'PT422','representacao: evidencia vazia negada');
SELECT public.customer_relation_command(:'office08',:'source08','representation.grant',jsonb_build_object('representative_customer_id',:'rep08','kind','proxy','evidence','Arquivo privado 08','valid_from','2020-01-01T00:00:00Z','valid_until',NULL),gen_random_uuid())->'representations'->0->>'id' AS representation08 \gset
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'representations'->0->>'authorization_status'='valid'
 AND public.customer_relations_state(:'office08',:'source08')->'representations'->0->>'grants_customer_access'='false','representacao: valida sem grant operacional');
SELECT public.customer_relation_command(:'office08',:'source08','representation.revoke',jsonb_build_object('id',:'representation08','version',1),gen_random_uuid());
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'representations'->0->>'status'='revoked','representacao: revogacao retida');
SELECT public.customer_relation_command(:'office08',:'source08','representation.grant',jsonb_build_object('representative_customer_id',:'rep08','kind','guardian','evidence','Referencia futura','valid_from','2090-01-01T00:00:00Z','valid_until',NULL),gen_random_uuid());
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'representations'->0->>'status'='future','representacao: futura nao autoriza');
SELECT public.customer_relation_command(:'office08',:'source08','representation.grant',jsonb_build_object('representative_customer_id',:'rep08','kind','representative','evidence','Referencia expirada','valid_from','2020-01-01T00:00:00Z','valid_until','2021-01-01T00:00:00Z'),gen_random_uuid());
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'representations'->0->>'status'='expired','representacao: expirada nao autoriza');
-- No automatic account link from matching email; manually verified intake can leave the active list.
RESET ROLE;
INSERT INTO private.customer_registrations(office_id,membership_id,name,email) VALUES(:'office08','00000000-0000-4000-b000-000000000088','Entrada Pendente08','relation-88@example.test') RETURNING id AS intake08 \gset
SET ROLE authenticated;
SELECT test.assert_true(public.customers_page(:'office08','Entrada Pendente08',1,5)->>'total'='1','identidade: contato coincidente continua pendente');
SELECT public.customer_relation_command(:'office08',:'source08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000088","evidence":"Conferencia presencial privada"}',gen_random_uuid())->'identities'->0->>'id' AS identity08 \gset
SELECT test.assert_true(public.customer_relations_state(:'office08',:'source08')->'identities'->0->>'status'='verified'
 AND public.customer_relations_state(:'office08',:'source08')->'identities'->0->>'portal_enabled'='false'
 AND public.customers_page(:'office08','Entrada Pendente08',1,5)->>'total'='0','identidade: conferencia explicita resolve intake sem portal');
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'target08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000088","evidence":"Colisao"}'),'PT409','identidade: mesma conta nao verifica duas fichas');
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'source08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000089","evidence":"Colisao"}'),'PT409','identidade: ficha nao verifica duas contas');
SELECT public.customer_relation_command(:'office08',:'source08','identity.revoke',jsonb_build_object('id',:'identity08','version',1),gen_random_uuid());
SELECT test.assert_true(public.customers_page(:'office08','Entrada Pendente08',1,5)->>'total'='1','identidade: revogacao reabre intake preservado');
SELECT public.customer_relation_command(:'office08',:'source08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000088","evidence":"Nova conferencia"}',gen_random_uuid());
SELECT public.customer_relation_command(:'office08',:'target08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000089","evidence":"Conta diferente"}',gen_random_uuid())->'identities'->0->>'id' AS target_identity08 \gset
SELECT test.assert_true(public.customer_merge_preview(:'office08',:'source08',:'target08')->'conflicts' ? 'identity','mesclagem: contas verificadas diferentes conflitam');
SELECT public.customer_relation_command(:'office08',:'target08','identity.revoke',jsonb_build_object('id',:'target_identity08','version',1),gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000086","session_id":"00000000-0000-4000-c000-000000000086"}';
SELECT test.expect_error(format('SELECT public.customer_merge_preview(%L,%L,%L)',:'office08',:'source08',:'target08'),'PT403','mesclagem: employee mesmo com capacidade nao e administrador');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'source08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid());
SELECT public.customer_merge_preview(:'office08',:'source08',:'target08')->'source'->>'version' AS source_version08,
 public.customer_merge_preview(:'office08',:'source08',:'target08')->'target'->>'version' AS target_version08 \gset
SELECT test.assert_true(public.customer_merge_preview(:'office08',:'source08',:'target08')->'expected'->>'copies_identifier'='true'
 AND public.customer_merge_preview(:'office08',:'source08',:'target08')->'expected'->>'name'='Destino08'
 AND public.customer_merge_preview(:'office08',:'source08',:'target08')->'expected'->>'transfers_authority'='false','mesclagem: previa explicita destino contatos identificador sem autoridade');
SELECT test.expect_error(format('SELECT public.customer_merge(%L,%L,%L,%s,%s,%L,false,gen_random_uuid())',:'office08',:'source08',:'target08',:'source_version08',:'target_version08','Conferencia'),'PT422','mesclagem: exige confirmacao');
SELECT test.expect_error(format('SELECT public.customer_merge(%L,%L,%L,1,%s,%L,true,gen_random_uuid())',:'office08',:'source08',:'target08',:'target_version08','Conferencia'),'PT409','mesclagem: versao obsoleta conflita');
-- Production has no future document/request tables. Only local fixtures have these FKs.
RESET ROLE;
CREATE TABLE test.relation_requests(id integer PRIMARY KEY,customer_id uuid NOT NULL REFERENCES public.customers(id));
CREATE TABLE test.relation_documents(id integer PRIMARY KEY,customer_id uuid NOT NULL REFERENCES public.customers(id),snapshot jsonb NOT NULL);
INSERT INTO test.relation_requests VALUES(1,:'source08');
INSERT INTO test.relation_documents SELECT 1,id,jsonb_build_object('name',name,'identifier',identifier,'version',version) FROM public.customers WHERE id=:'source08';
CREATE FUNCTION test.fail_relation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action LIKE 'customers.%' AND NEW.action NOT IN('customers.created','customers.updated') THEN RAISE EXCEPTION 'FIXTURE AUDIT FAILURE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fail_relation_audit BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION test.fail_relation_audit();
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.customer_merge(%L,%L,%L,%s,%s,%L,true,gen_random_uuid())',:'office08',:'source08',:'target08',:'source_version08',:'target_version08','Conferencia'),'P0001','mesclagem: falha de auditoria reverte transacao');
RESET ROLE;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.customer_merges WHERE source_id=:'source08') AND NOT EXISTS(SELECT FROM private.customer_snapshots WHERE customer_id=:'source08')
 AND (SELECT merged_into_id IS NULL AND version=:'source_version08' FROM public.customers WHERE id=:'source08'),'mesclagem: rollback inclui snapshots ficha e historia');
DROP TRIGGER fail_relation_audit ON public.audit_events;
SET ROLE authenticated;
SELECT public.customer_merge(:'office08',:'source08',:'target08',:'source_version08',:'target_version08','Conferencia privada final',true,gen_random_uuid())->>'merge_id' AS merge08 \gset
SELECT test.assert_true(public.customer_detail(:'office08',:'target08')->>'identifier'='52998224725'
 AND jsonb_array_length(public.customer_detail(:'office08',:'target08')->'contacts')=2
 AND public.customer_relations_state(:'office08',:'target08')->'merges'->0->>'id'=:'merge08','mesclagem: destino conserva identificador contatos e historia');
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'source08'),'PT404','mesclagem: origem indisponivel no CRUD07');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L,%s,gen_random_uuid())',:'office08',:'source08','{"kind":"person","name":"Tentativa","contacts":[]}',:'source_version08'),'PT404','mesclagem: origem nao editavel');
SELECT test.assert_true(public.customers_page(:'office08','Origem08',1,5)->>'total'='0','mesclagem: origem sai da lista ativa');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'target08'),'PT404','mesclagem: atribuicao da origem nao migra ao destino');
RESET ROLE;
SELECT test.assert_true((SELECT merged_into_id=:'target08' AND identifier='52998224725' FROM public.customers WHERE id=:'source08')
 AND (SELECT customer_id=:'source08' FROM test.relation_requests WHERE id=1)
 AND (SELECT customer_id=:'source08' AND snapshot->>'name'='Origem08' AND snapshot->>'version'=:'source_version08' FROM test.relation_documents WHERE id=1)
 AND (SELECT count(*)=1 FROM public.customer_contacts WHERE customer_id=:'source08'),'mesclagem: origem FKs contatos e documento historico inalterados');
SELECT test.assert_true((SELECT count(*)=3 FROM private.customer_snapshots WHERE customer_id IN(:'source08',:'target08'))
 AND NOT EXISTS(SELECT FROM private.customer_relations WHERE customer_id=:'source08' AND revoked_at IS NULL)
 AND (SELECT materialized_customer_id IS NULL AND association_status='pending' FROM private.customer_registrations WHERE id=:'intake08')
 AND (SELECT role_code='client' FROM public.memberships WHERE id='00000000-0000-4000-b000-000000000088'),'mesclagem: snapshots reais autoridade revogada proveniencia e conta preservadas');
SELECT test.expect_error(format('UPDATE private.customer_snapshots SET version=99 WHERE customer_id=%L',:'source08'),'PT403','snapshots: imutaveis mesmo para operador');
SELECT test.expect_error(format('DELETE FROM private.customer_merges WHERE id=%L',:'merge08'),'PT403','mesclagem: historia imutavel');
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.audit_events WHERE office_id=:'office08' AND (changes::text LIKE '%52998224725%' OR changes::text LIKE '%@%' OR changes::text LIKE '%Conferencia%')),'relacionamentos: auditoria sem identificador contato evidencia');
-- Relation fixtures deliberately stay available for real concurrency checks.
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
-- Strict JSON validation at the RPC boundary, independently of Express.
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'target08','assignment.grant',bad),'PT422','relacionamentos: payload estrito '||label) FROM (VALUES
 ('unknown','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null,"created_by":"forged"}'),
 ('missing','{"membership_id":"00000000-0000-4000-b000-000000000084"}'),('null','null'),('array','[]'),
 ('uuid','{"membership_id":"forged","valid_from":"2020-01-01T00:00:00Z","valid_until":null}'),
 ('date','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"tomorrow","valid_until":null}'),
 ('datezone','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00","valid_until":null}'),
 ('period','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2021-01-01T00:00:00Z","valid_until":"2020-01-01T00:00:00Z"}'),
 ('client','{"membership_id":"00000000-0000-4000-b000-000000000088","valid_from":"2020-01-01T00:00:00Z","valid_until":null}'),
 ('cross_office','{"membership_id":"00000000-0000-4000-b000-000000000083","valid_from":"2020-01-01T00:00:00Z","valid_until":null}')
 ) invalid(label,bad);
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'target08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000084","evidence":"Equipe nao client"}'),'PT422','identidade: exige membership client');
SELECT test.assert_true(jsonb_array_length(public.customer_relation_candidates(:'office08','client','relation-88@example.test')->'items')=1
 AND public.customer_relation_candidates(:'office08','client','relation-88@example.test')::text NOT LIKE '%relation-88@example.test%'
 AND public.customer_relation_candidates(:'office08','customers','52998224725')::text NOT LIKE '%52998224725%','candidatos: contatos e identificadores mascarados');
SELECT public.customer_relation_command(:'office08',:'target08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2090-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())->'assignments'->0->>'id' AS future_assignment08 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'target08'),'PT404','atribuicao: futura nao concede acesso');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'target08','assignment.revoke',jsonb_build_object('id',:'future_assignment08','version',1),gen_random_uuid());
SELECT public.customer_relation_command(:'office08',:'target08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":"2021-01-01T00:00:00Z"}',gen_random_uuid())->'assignments'->0->>'id' AS expired_assignment08 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'target08'),'PT404','atribuicao: expirada nao concede acesso');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'target08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000087","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000087","session_id":"00000000-0000-4000-c000-000000000087"}';
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'target08'),'PT403','atribuicao: sem customers.read continua proibido');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000082","session_id":"00000000-0000-4000-c000-000000000082"}';
SELECT public.customer_create(:'office08','{"kind":"person","name":"Criador Independente08","contacts":[]}',gen_random_uuid())->>'id' AS creator08 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'creator08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000082","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())->'assignments'->0->>'id' AS creator_assignment08 \gset
SELECT public.customer_relation_command(:'office08',:'creator08','assignment.revoke',jsonb_build_object('id',:'creator_assignment08','version',1),gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000082","session_id":"00000000-0000-4000-c000-000000000082"}';
SELECT test.assert_true(public.customer_detail(:'office08',:'creator08')->>'id'=:'creator08','atribuicao: revogar grant do criador preserva acesso original');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_create(:'office08','{"kind":"company","name":"Empresa Conflitante08","contacts":[]}',gen_random_uuid())->>'id' AS company08 \gset
SELECT test.assert_true(public.customer_merge_preview(:'office08',:'company08',:'target08')->'conflicts' ? 'kind','mesclagem: tipos diferentes conflitam');
SELECT public.customer_create(:'office08','{"kind":"person","name":"Identificador Conflitante08","identifier":"12345678909","contacts":[]}',gen_random_uuid())->>'id' AS different08 \gset
SELECT test.assert_true(public.customer_merge_preview(:'office08',:'different08',:'target08')->'conflicts' ? 'identifier','mesclagem: identificadores diferentes conflitam');
SELECT public.customer_create(:'office08','{"kind":"person","name":"Contatos Conflitantes08","contacts":[{"kind":"phone","value":"11999990101"},{"kind":"phone","value":"11999990102"},{"kind":"phone","value":"11999990103"},{"kind":"phone","value":"11999990104"}]}',gen_random_uuid())->>'id' AS contacts08 \gset
SELECT test.assert_true(public.customer_merge_preview(:'office08',:'contacts08',:'target08')->'conflicts' ? 'contacts','mesclagem: mais de quatro contatos exige revisao');
SELECT test.assert_true(public.customer_merge_preview(:'office08',:'target08',:'target08')->'conflicts' ? 'same_customer','mesclagem: auto-mesclagem negada');
RESET ROLE;
UPDATE public.customers SET blocked_at=clock_timestamp() WHERE id=:'different08';
SET ROLE authenticated;
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)',:'office08',:'different08'),'PT404','bloqueado: detalhe07 indisponivel');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L,1,gen_random_uuid())',:'office08',:'different08','{"kind":"person","name":"Reativacao","contacts":[]}'),'PT404','bloqueado: update07 indisponivel');
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'different08'),'PT404','bloqueado: estado08 indisponivel');
SELECT test.assert_true(public.customers_page(:'office08','Identificador Conflitante08',1,5)->>'total'='0','bloqueado: nao aparece na lista');
RESET ROLE;
INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000084','customers.relate');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT public.customer_relation_command(:'office08',:'target08','assignment.revoke',jsonb_build_object('id',:'expired_assignment08','version',1),gen_random_uuid());
SELECT public.customer_relation_command(:'office08',:'target08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())->'assignments'->0->>'id' AS self_assignment08 \gset
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
SELECT test.assert_true(public.customer_relation_command(:'office08',:'target08','assignment.revoke',jsonb_build_object('id',:'self_assignment08','version',1),gen_random_uuid())->>'access_lost'='true','atribuicao: autorrevogacao confirma e retorna estado terminal redigido');
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'target08'),'PT404','atribuicao: autorrevogacao nao restaura leitura');
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=5 AND bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='private' AND p.proname IN('customer_relations_state','customer_relation_candidates','customer_relation_command','customer_merge_preview','customer_merge')),'relacionamentos: todas implementacoes privadas negam anon e service_role');
SELECT test.assert_true((SELECT count(*)=0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private'
 AND p.proname IN('customer_relation_payload','customer_relation_uuid','customer_relation_time','customer_relation_evidence','customer_relation_status','customer_relation_member_active','customer_snapshot_capture','customer_in_scope','customer_intake_resolved','customer_history_immutable')
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')),'relacionamentos: nenhum helper escapa ACL');
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'target08','portal.enable','{}'),'PT422','relacionamentos: acao desconhecida nao abre portal');
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'target08','assignment.revoke','{"id":"00000000-0000-4000-f000-000000000099","version":1.5}'),'PT422','relacionamentos: revogacao recusa versao fracionada');
SELECT public.customer_relation_command(:'office08',:'target08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000089","evidence":"Conferencia vigente destino"}',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000089","session_id":"00000000-0000-4000-c000-000000000089"}';
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'target08'),'PT403','identidade: verificada continua sem operacao ou portal');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='00000000-0000-4000-a000-000000000088';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'rep08','identity.verify','{"membership_id":"00000000-0000-4000-b000-000000000088","evidence":"Nao confirmada"}'),'PT422','identidade: conta nao confirmada recusada');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id='00000000-0000-4000-a000-000000000088';
UPDATE public.memberships SET active=false WHERE id='00000000-0000-4000-b000-000000000089';
SET ROLE authenticated;
SELECT test.assert_true(public.customer_relations_state(:'office08',:'target08')->'identities'->0->>'status'='unavailable','identidade: desligamento marca vinculo indisponivel');
RESET ROLE;
UPDATE public.memberships SET active=true WHERE id='00000000-0000-4000-b000-000000000089';
-- Bounded history is explicit, not an accidental unbounded DTO.
INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,created_by,revoked_at,revoked_by,version)
 SELECT :'office08',:'rep08','assignment','00000000-0000-4000-b000-000000000084','00000000-0000-4000-a000-000000000081',clock_timestamp(),'00000000-0000-4000-a000-000000000081',2 FROM generate_series(1,55);
SET ROLE authenticated;
SELECT test.assert_true(jsonb_array_length(public.customer_relations_state(:'office08',:'rep08')->'assignments')=50
 AND public.customer_relations_state(:'office08',:'rep08')->'truncated'->>'assignments'='true','relacionamentos: historico limitado50 indica truncamento');
RESET ROLE;
-- Audit failure rolls back relation grants too, including the customer version.
CREATE TRIGGER fail_relation_audit BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION test.fail_relation_audit();
SET ROLE authenticated;
SELECT public.customer_detail(:'office08',:'rep08')->>'version' AS audit_version08 \gset
SELECT test.expect_error(format('SELECT public.customer_relation_command(%L,%L,%L,%L,gen_random_uuid())',:'office08',:'rep08','assignment.grant','{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}'),'P0001','relacionamentos: falha de auditoria reverte grant');
SELECT test.assert_true(public.customer_detail(:'office08',:'rep08')->>'version'=:'audit_version08','relacionamentos: auditoria atomica preserva versao');
RESET ROLE;
DROP TRIGGER fail_relation_audit ON public.audit_events;
SELECT test.assert_true(NOT EXISTS(SELECT FROM private.customer_relations WHERE customer_id=:'rep08' AND relation_type='assignment' AND revoked_at IS NULL),'relacionamentos: auditoria atomica preserva ausencia de grant');
SELECT test.assert_true(private.team_scope_for_member('00000000-0000-4000-b000-000000000081')->'allowed_permissions' ?& ARRAY['customers.relate','customers.verify','customers.merge']
 AND private.safe_audit_changes('{"permissions":["customers.relate","customers.verify","customers.merge"],"evidence":"privada","identifier":"52998224725"}')='{"permissions":["customers.relate","customers.verify","customers.merge"]}','relacionamentos: catalogo de delegacao e auditoria reconhece capacidades sem PII');
SET ROLE authenticated;
SELECT public.team_set_member(:'office08','00000000-0000-4000-b000-000000000087','employee',true,ARRAY['foundation.access','customers.read','customers.relate','customers.verify','customers.merge'],gen_random_uuid());
RESET ROLE;
SELECT test.assert_true((SELECT count(*)=3 FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000087' AND permission_code IN('customers.relate','customers.verify','customers.merge')),'relacionamentos: gestao existente concede tres capacidades explicitamente');
UPDATE auth.users SET is_anonymous=true WHERE id='00000000-0000-4000-a000-000000000089';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000089","session_id":"00000000-0000-4000-c000-000000000089"}';
SELECT test.expect_error(format('SELECT public.customer_relations_state(%L,%L)',:'office08',:'target08'),'PT401','relacionamentos: Auth anonimo com session_id valido recusado');
RESET ROLE;
UPDATE auth.users SET is_anonymous=false WHERE id='00000000-0000-4000-a000-000000000089';

-- Independent, rolled-back fixtures cover names permitted by the legacy profiles domain.
BEGIN;
SELECT test.assert_true((SELECT NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']
 AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0)
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
 FROM pg_proc p WHERE p.oid='private.customer_relation_display_label(text)'::regprocedure),
 'nomes legados08: helper invoker privado, search_path vazio e nenhuma ACL de aplicativo/PUBLIC');
SELECT test.assert_true(private.customer_relation_display_label(NULL)='Nome não informado'
 AND private.customer_relation_display_label(U&'\0009\000A\000D\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')='Nome não informado'
 AND private.customer_relation_display_label(repeat('á',121))=repeat('á',120),
 'nomes legados08: fallback Unicode independente de locale e limite120');
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('00000000-0000-4000-a000-000000000091','legacy-team08@example.test',now()),
 ('00000000-0000-4000-a000-000000000092','legacy-client08@example.test',now());
INSERT INTO public.profiles(id) VALUES ('00000000-0000-4000-a000-000000000091'),('00000000-0000-4000-a000-000000000092');
INSERT INTO public.memberships(id,office_id,user_id,role_code) VALUES
 ('00000000-0000-4000-b000-000000000091',:'office08','00000000-0000-4000-a000-000000000091','employee'),
 ('00000000-0000-4000-b000-000000000092',:'office08','00000000-0000-4000-a000-000000000092','client');
CREATE FUNCTION test.relation_legacy_labels() RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE sample record; member record; customer_id uuid; candidate jsonb; broad jsonb; state jsonb; relation jsonb; collection text; action text;
 office_id constant uuid:='00000000-0000-4000-e000-000000000081';
BEGIN
 PERFORM set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}',true);
 FOR sample IN SELECT * FROM (VALUES ('null',NULL::text,'Nome não informado'),('tab','Ana'||chr(9)||'Silva','Ana Silva'),
  ('controls','Ana'||chr(1)||chr(127)||chr(133)||chr(159)||'Silva','Ana Silva'),('spaces',chr(160)||chr(8199)||chr(65279),'Nome não informado'),
  ('unicode',chr(12288)||'Ana'||chr(8239)||'Silva'||chr(65279),'Ana Silva'),('normal','Ana Silva','Ana Silva'),('limit120',repeat('á',120),repeat('á',120))) v(label,raw_name,expected)
 LOOP
  UPDATE public.profiles SET display_name=sample.raw_name WHERE id IN ('00000000-0000-4000-a000-000000000091','00000000-0000-4000-a000-000000000092');
  EXECUTE 'SET LOCAL ROLE authenticated';
  customer_id:=(public.customer_create(office_id,jsonb_build_object('kind','person','name','Legado08 '||sample.label,'contacts','[]'::jsonb),gen_random_uuid())->>'id')::uuid;
  FOR member IN SELECT * FROM (VALUES ('team','00000000-0000-4000-b000-000000000091'::uuid,'legacy-team08@example.test'),('client','00000000-0000-4000-b000-000000000092'::uuid,'legacy-client08@example.test')) v(kind,id,email)
  LOOP
   candidate:=public.customer_relation_candidates(office_id,member.kind,member.email);
   RETURN NEXT test.assert_true(jsonb_array_length(candidate->'items')=1 AND candidate->'items'->0->>'name'=sample.expected
    AND candidate->'items'->0->>'contact_masked'='l***@***' AND strpos(candidate::text,member.email)=0,'nomes legados08: '||sample.label||' '||member.kind||' contato mascarado');
   broad:=public.customer_relation_candidates(office_id,member.kind,'');
   RETURN NEXT test.assert_true(broad->'items' @> jsonb_build_array(jsonb_build_object('id',member.id,'name',sample.expected))
    AND strpos(broad::text,'@example.test')=0,'nomes legados08: '||sample.label||' '||member.kind||' busca ampla');
   collection:=CASE WHEN member.kind='team' THEN 'assignments' ELSE 'identities' END;
   action:=CASE WHEN member.kind='team' THEN 'assignment' ELSE 'identity' END;
   state:=public.customer_relation_command(office_id,customer_id,action||CASE WHEN member.kind='team' THEN '.grant' ELSE '.verify' END,
    jsonb_build_object('membership_id',member.id)||CASE WHEN member.kind='team' THEN '{"valid_from":"2020-01-01T00:00:00Z","valid_until":null}'::jsonb ELSE '{"evidence":"REF-LEGADO08"}'::jsonb END,gen_random_uuid());
   relation:=state->collection->0;
   RETURN NEXT test.assert_true(relation->>'name'=sample.expected AND strpos(state::text,'@example.test')=0,'nomes legados08: '||sample.label||' '||member.kind||' comando retorna estado seguro');
   PERFORM public.customer_relation_command(office_id,customer_id,action||'.revoke',jsonb_build_object('id',relation->'id','version',relation->'version'),gen_random_uuid());
   state:=public.customer_relations_state(office_id,customer_id);
   RETURN NEXT test.assert_true(state->collection->0->>'name'=sample.expected AND state->collection->0->>'status'='revoked'
    AND strpos(state::text,'@example.test')=0,'nomes legados08: '||sample.label||' '||member.kind||' leitura historica segura');
  END LOOP;
  EXECUTE 'RESET ROLE';
  RETURN NEXT test.assert_true((SELECT count(*)=2 AND bool_and(display_name IS NOT DISTINCT FROM sample.raw_name) FROM public.profiles WHERE id IN ('00000000-0000-4000-a000-000000000091','00000000-0000-4000-a000-000000000092')),
   'nomes legados08: '||sample.label||' projecoes preservam profiles');
 END LOOP;
END $$;
SELECT * FROM test.relation_legacy_labels();
ROLLBACK;
