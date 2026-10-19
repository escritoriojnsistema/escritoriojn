-- Etapa07: disposable fictitious records, exercised as real API roles.
CREATE FUNCTION test.expect_customer_error(statement text,expected_state text,expected_message text,label text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actual_state text; actual_message text;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE,actual_message=MESSAGE_TEXT; END;
 IF actual_state IS DISTINCT FROM expected_state OR actual_message IS DISTINCT FROM expected_message THEN
  RAISE EXCEPTION 'FAIL: % (expected %/%, actual %/%)',label,expected_state,expected_message,actual_state,actual_message; END IF;
 RETURN 'PASS: '||label;
END $$;
GRANT EXECUTE ON FUNCTION test.expect_customer_error(text,text,text,text) TO authenticated;
SELECT test.assert_true((SELECT count(*) FROM public.role_permissions WHERE role_code='owner' AND permission_code IN ('customers.read','customers.create','customers.update','customers.read_all'))=4
 AND NOT EXISTS(SELECT FROM public.role_permissions WHERE role_code<>'owner' AND permission_code LIKE 'customers.%'),'clientes: quatro capacidades somente owner por padrao');
INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password) SELECT
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,'customer-'||n||'@example.test',now(),'fixture' FROM generate_series(41,49) n;
INSERT INTO auth.sessions(id,user_id) SELECT replace(id::text,'a000','c000')::uuid,id FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000041' AND '00000000-0000-4000-a000-000000000049';
INSERT INTO public.profiles(id,display_name) SELECT id,'Pessoa Clientes Ficticia' FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000041' AND '00000000-0000-4000-a000-000000000049';
INSERT INTO public.offices(id,name) VALUES ('00000000-0000-4000-e000-000000000041','Clientes Ficticios A'),('00000000-0000-4000-e000-000000000042','Clientes Ficticios B');
INSERT INTO public.memberships(id,office_id,user_id,role_code) SELECT
 ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n=43 THEN '00000000-0000-4000-e000-000000000042' ELSE '00000000-0000-4000-e000-000000000041' END::uuid,
 ('00000000-0000-4000-a000-'||lpad(n::text,12,'0'))::uuid,
 CASE WHEN n IN (41,43) THEN 'owner' WHEN n=45 THEN 'client' WHEN n=46 THEN 'admin' ELSE 'employee' END FROM generate_series(41,49) n;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT
 ('00000000-0000-4000-b000-'||lpad(n::text,12,'0'))::uuid,p FROM generate_series(41,49) n
 CROSS JOIN unnest(ARRAY['customers.read','customers.create','customers.update','customers.read_all']) p
 WHERE (n IN (42,48) AND p<>'customers.read_all') OR (n=44 AND p='customers.read') OR n=45 OR (n=47 AND p IN ('customers.create','customers.update'));
UPDATE auth.users SET is_anonymous=true WHERE id='00000000-0000-4000-a000-000000000049';
SELECT test.assert_true((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.customers'::regclass,'public.customer_contacts'::regclass))
 AND NOT has_table_privilege('authenticated','public.customers','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.customer_contacts','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('anon','public.customers','SELECT,INSERT,UPDATE,DELETE'),'clientes: RLS e ACL impedem acesso bruto a CPF/contatos');
SELECT test.assert_true((SELECT bool_and(NOT p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('customers_page','customer_detail','customer_create','customer_update'))
 AND (SELECT count(*)=4 AND bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=""']) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('customers_page','customer_detail','customer_create','customer_update')),'clientes: wrappers invoker e implementacao definer privada com search_path vazio');
SET ROLE anon;
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'42501','clientes: anon nao executa RPC');
SELECT test.expect_error($q$SELECT identifier FROM public.customers$q$,'42501','clientes: anon nao consulta tabela');
SET ROLE authenticated;
SET request.jwt.claims='{}';
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT401','clientes: sessao ausente negada');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000049","session_id":"00000000-0000-4000-c000-000000000049"}';
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT401','clientes: usuario Auth anonimo negado');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000045","session_id":"00000000-0000-4000-c000-000000000045","user_metadata":{"role":"owner"}}';
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT403','clientes: cliente com capacidades forjadas nao entra no modulo');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT test.expect_error($q$SELECT identifier FROM public.customers$q$,'42501','clientes: owner nao acessa CPF pela tabela');
SELECT test.expect_error($q$SELECT private.customers_normalize_input('{"kind":"person","name":"X","contacts":[]}')$q$,'42501','clientes: helper interno nao e RPC exposta');
SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"  Pessoa Ficticia Owner  ","identifier":"529.982.247-25","contacts":[{"kind":"email","value":"  FICTICIO@EXAMPLE.TEST "},{"kind":"phone","value":"+55 (11) 99999-1234"}]}',gen_random_uuid())->>'id' AS owner07_id \gset
SELECT test.assert_true(public.customer_detail('00000000-0000-4000-e000-000000000041',:'owner07_id')->>'identifier'='52998224725'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'owner07_id')->>'name'='Pessoa Ficticia Owner'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'owner07_id')->'contacts'='[{"kind":"email","value":"ficticio@example.test"},{"kind":"phone","value":"5511999991234"}]'
 AND (public.customer_detail('00000000-0000-4000-e000-000000000041',:'owner07_id')->>'can_update')::boolean,'clientes: detalhe autorizado normaliza CPF nome email telefone');
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','529.982.247-25',1,3)->>'total'='1'
 AND (public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)->'items'->0)->>'identifier_masked'='***.***.***-25'
 AND NOT ((public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)->'items'->0) ?| ARRAY['identifier','contacts','created_by','version'])
 AND public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)::text NOT LIKE '%52998224725%','clientes: busca por CPF retorna somente resumo mascarado');
SELECT test.expect_customer_error($q$SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Duplicado","identifier":"52998224725","contacts":[]}',gen_random_uuid())$q$,'PT409','CUSTOMER_DUPLICATE','clientes: CPF canonico duplicado no escritorio gera conflito');
SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"company","name":"Empresa Ficticia","identifier":"11.222.333/0001-81","contacts":[]}',gen_random_uuid())->>'id' AS company07_id \gset
SELECT test.assert_true(public.customer_detail('00000000-0000-4000-e000-000000000041',:'company07_id')->>'identifier'='11222333000181'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'company07_id')->>'identifier_masked'='**.***.***/****-81','clientes: CNPJ valido e mascara de pessoa juridica');
SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Sem CPF Um","identifier":"","contacts":[]}',gen_random_uuid())->>'id' AS empty07_id \gset
SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Sem CPF Dois","contacts":[]}',gen_random_uuid());
SELECT test.assert_true(public.customer_detail('00000000-0000-4000-e000-000000000041',:'empty07_id')->'identifier'='null'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'empty07_id')->'identifier_masked'='null'
 AND jsonb_array_length(public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)->'items')=3
 AND public.customers_page('00000000-0000-4000-e000-000000000041','',2,3)->>'total'='4','clientes: CPF opcional nao colide e paginacao3 funciona');
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','pessoa ficticia',1,5)->>'total'='1'
 AND public.customers_page('00000000-0000-4000-e000-000000000041','%',1,5)->>'total'='0','clientes: busca nominal case insensitive trata wildcard literalmente');
SELECT test.expect_customer_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',0,3)$q$,'PT422','CUSTOMERS_VALIDATION','clientes: pagina zero negada diretamente na RPC');
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,1000)$q$,'PT422','clientes: tamanho fora3/5 negado');
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041',repeat('x',121),1,3)$q$,'PT422','clientes: busca longa negada');
-- All invalid inputs must fail before writing either customer, contact or audit.
SELECT test.expect_error(format('SELECT public.customer_create(%L,%L::jsonb,gen_random_uuid())','00000000-0000-4000-e000-000000000041',bad),'PT422','clientes: payload invalido '||label) FROM (VALUES
 ('cpf','{"kind":"person","name":"Invalido","identifier":"11111111111","contacts":[]}'),
 ('cpf_check','{"kind":"person","name":"Invalido","identifier":"52998224724","contacts":[]}'),
 ('cpf_letters','{"kind":"person","name":"Invalido","identifier":"abc52998224725","contacts":[]}'),
 ('cnpj','{"kind":"company","name":"Invalido","identifier":"11222333000182","contacts":[]}'),
 ('empty_name','{"kind":"person","name":"  ","contacts":[]}'),
 ('null_identifier','{"kind":"person","name":"Invalido","identifier":null,"contacts":[]}'),
 ('bad_contact','{"kind":"person","name":"Invalido","contacts":[null]}'),
 ('contact_unknown','{"kind":"person","name":"Invalido","contacts":[{"kind":"email","value":"x@example.test","id":"forged"}]}'),
 ('kind','{"kind":"client","name":"Invalido","contacts":[]}'),
 ('unknown','{"kind":"person","name":"Invalido","created_by":"forged","contacts":[]}'),
 ('contact_kind','{"kind":"person","name":"Invalido","contacts":[{"kind":"sms","value":"11999991234"}]}'),
 ('email','{"kind":"person","name":"Invalido","contacts":[{"kind":"email","value":"invalido"}]}'),
 ('phone','{"kind":"person","name":"Invalido","contacts":[{"kind":"phone","value":"123"}]}'),
 ('phone_letters','{"kind":"person","name":"Invalido","contacts":[{"kind":"phone","value":"abc11999991234"}]}'),
 ('null_contacts','{"kind":"person","name":"Invalido","contacts":null}'),
 ('too_many','{"kind":"person","name":"Invalido","contacts":[{"kind":"phone","value":"11999990001"},{"kind":"phone","value":"11999990002"},{"kind":"phone","value":"11999990003"},{"kind":"phone","value":"11999990004"},{"kind":"phone","value":"11999990005"}]}'),
 ('duplicate_contact','{"kind":"person","name":"Invalido","contacts":[{"kind":"email","value":"X@example.test"},{"kind":"email","value":"x@example.test"}]}'),
 ('bad_type','{"kind":"person","name":8,"contacts":[]}'),
 ('null','null'), ('array','[]')) inputs(label,bad);
SELECT test.expect_error($q$SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Sem Request","contacts":[]}',NULL)$q$,'PT422','clientes: request_id obrigatorio');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'empty07_id','{"kind":"person","name":"Duplicado na Edicao","identifier":"52998224725","contacts":[]}'),'PT409','clientes: alteracao nao pode duplicar CPF de outra ficha');
SELECT test.assert_true(public.customer_detail('00000000-0000-4000-e000-000000000041',:'empty07_id')->>'version'='1'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'empty07_id')->'identifier'='null','clientes: conflito de CPF preserva ficha e versao anteriores');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,0,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'empty07_id','{"kind":"person","name":"Sem Versao","contacts":[]}'),'PT422','clientes: versao zero negada na RPC');

SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000043","session_id":"00000000-0000-4000-c000-000000000043"}';
SELECT public.customer_create('00000000-0000-4000-e000-000000000042','{"kind":"person","name":"Pessoa B Ficticia","identifier":"52998224725","contacts":[]}',gen_random_uuid())->>'id' AS other07_id \gset
SELECT test.expect_customer_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT403','CUSTOMERS_FORBIDDEN','clientes: owner B nao lista A');
SELECT test.expect_error(format('SELECT public.customer_detail(%L,%L)','00000000-0000-4000-e000-000000000042',:'owner07_id'),'PT404','clientes: detalhe nao cruza escritórios mesmo com id conhecido');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000042","session_id":"00000000-0000-4000-c000-000000000042"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','',1,5)->>'total'='0','clientes: employee read sem global nao ve clientes de outro criador');
SELECT test.expect_customer_error(format('SELECT public.customer_detail(%L,%L)','00000000-0000-4000-e000-000000000041',:'owner07_id'),'PT404','CUSTOMER_NOT_FOUND','clientes: escopo de criador protege detalhe diretamente na RPC');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'owner07_id','{"kind":"person","name":"Ataque","contacts":[]}'),'PT404','clientes: escopo de criador protege alteracao');
SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Pessoa Employee Ficticia","contacts":[]}',gen_random_uuid())->>'id' AS own07_id \gset
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)->>'total'='1'
 AND public.customer_detail('00000000-0000-4000-e000-000000000041',:'own07_id')->>'version'='1','clientes: employee acessa sua propria ficha e versao inicial');
SELECT test.assert_true(public.customer_update('00000000-0000-4000-e000-000000000041',:'own07_id','{"kind":"person","name":"Pessoa Employee Editada","contacts":[{"kind":"phone","value":"(11)3333-4444"}]}',1,gen_random_uuid())->>'version'='2','clientes: update atomico substitui contatos e incrementa versao');
SELECT test.expect_customer_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'own07_id','{"kind":"person","name":"Desatualizado","contacts":[]}'),'PT409','CUSTOMER_CONFLICT','clientes: versao antiga nao sobrescreve dados');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000044","session_id":"00000000-0000-4000-c000-000000000044"}';
SELECT test.expect_error($q$SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Sem Create","contacts":[]}',gen_random_uuid())$q$,'PT403','clientes: read nao concede create');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,1,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'own07_id','{"kind":"person","name":"Sem Update","contacts":[]}'),'PT403','clientes: read nao concede update');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000047","session_id":"00000000-0000-4000-c000-000000000047"}';
SELECT test.expect_error($q$SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Sem Read","contacts":[]}',gen_random_uuid())$q$,'PT403','clientes: create exige tambem read');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,2,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'own07_id','{"kind":"person","name":"Sem Read","contacts":[]}'),'PT403','clientes: update exige tambem read');
-- Grant through existing management RPC: allowlists and delegation must retain current scope.
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT public.team_set_member('00000000-0000-4000-e000-000000000041','00000000-0000-4000-b000-000000000044','employee',true,ARRAY['foundation.access','customers.read','customers.read_all'],gen_random_uuid());
SELECT public.team_set_delegation('00000000-0000-4000-e000-000000000041','00000000-0000-4000-b000-000000000046',ARRAY['employee'],ARRAY['foundation.access','customers.read'],false,now()+interval '1 day',gen_random_uuid());
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000046","session_id":"00000000-0000-4000-c000-000000000046"}';
SELECT public.team_set_member('00000000-0000-4000-e000-000000000041','00000000-0000-4000-b000-000000000048','employee',true,ARRAY['foundation.access','customers.read'],gen_random_uuid());
SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000041','00000000-0000-4000-b000-000000000048','employee',true,ARRAY['foundation.access','customers.read','customers.read_all'],gen_random_uuid())$q$,'PT403','clientes: admin nao concede read_all alem da delegacao');
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000044","session_id":"00000000-0000-4000-c000-000000000044"}';
SELECT test.assert_true(public.customers_page('00000000-0000-4000-e000-000000000041','',1,5)->>'total'='5'
 AND NOT (public.customer_detail('00000000-0000-4000-e000-000000000041',:'own07_id')->>'can_update')::boolean,'clientes: read_all explicito amplia leitura sem permitir edicao');
RESET ROLE;
SELECT test.assert_true((SELECT count(*) FROM public.audit_events WHERE office_id='00000000-0000-4000-e000-000000000041' AND action IN ('customers.created','customers.updated'))=6
 AND NOT EXISTS(SELECT FROM public.audit_events WHERE action LIKE 'customers.%' AND (changes<>'{}' OR target_type<>'customer' OR actor_kind<>'user')),'clientes: criacao/edicao auditadas sem CPF nome email telefone');
-- Audit fault must roll back both the parent, contacts, version and business event.
ALTER TABLE public.audit_events ADD CONSTRAINT customers07_fault CHECK (action NOT IN ('customers.created','customers.updated')) NOT VALID;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000042","session_id":"00000000-0000-4000-c000-000000000042"}';
SELECT test.expect_error($q$SELECT public.customer_create('00000000-0000-4000-e000-000000000041','{"kind":"person","name":"Rollback Criacao Ficticia","contacts":[{"kind":"email","value":"rollback@example.test"}]}',gen_random_uuid())$q$,'23514','clientes: falha de auditoria reverte criacao e contato');
SELECT test.expect_error(format('SELECT public.customer_update(%L,%L,%L::jsonb,2,gen_random_uuid())','00000000-0000-4000-e000-000000000041',:'own07_id','{"kind":"person","name":"Rollback Edicao Ficticia","contacts":[]}'),'23514','clientes: falha de auditoria reverte edicao e contatos');
SELECT test.assert_true(public.customer_detail('00000000-0000-4000-e000-000000000041',:'own07_id')->>'version'='2'
 AND jsonb_array_length(public.customer_detail('00000000-0000-4000-e000-000000000041',:'own07_id')->'contacts')=1,'clientes: rollback conserva versao e contato anterior');
RESET ROLE;
ALTER TABLE public.audit_events DROP CONSTRAINT customers07_fault;
SELECT test.assert_true(NOT EXISTS(SELECT FROM public.customers WHERE name LIKE 'Rollback%') AND NOT EXISTS(SELECT FROM public.customer_contacts WHERE value='rollback@example.test'),'clientes: rollback nao deixa registro nem contato orfao');
SELECT test.assert_true((SELECT actor_id FROM public.audit_events WHERE action='customers.updated' AND target_id=:'own07_id')='00000000-0000-4000-a000-000000000042','clientes: ator do evento deriva da sessao e nao do payload');
SELECT test.assert_true((SELECT count(*) FROM auth.users WHERE id::text BETWEEN '00000000-0000-4000-a000-000000000041' AND '00000000-0000-4000-a000-000000000049')=9,'clientes: ficha nao cria identidades Auth ficticias');
-- Leave the active employee record for true multi-connection races in the runner.
RESET request.jwt.claims;
-- Defense in depth when an operator accidentally widens grants.
GRANT SELECT,INSERT,UPDATE,DELETE ON public.customers,public.customer_contacts TO authenticated;
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000041","session_id":"00000000-0000-4000-c000-000000000041"}';
SELECT test.assert_true((SELECT count(*) FROM public.customers)=0 AND (SELECT count(*) FROM public.customer_contacts)=0,'clientes: RLS nega leitura bruta mesmo com GRANT acidental');
WITH changed AS (UPDATE public.customers SET identifier=NULL RETURNING *) SELECT test.assert_true((SELECT count(*) FROM changed)=0,'clientes: RLS nega update bruto com GRANT acidental');
SELECT test.expect_error($q$INSERT INTO public.customers(office_id,kind,name,created_by) VALUES('00000000-0000-4000-e000-000000000041','person','Bypass Ficticio',auth.uid())$q$,'42501','clientes: RLS nega insert bruto com GRANT acidental');
RESET ROLE;
REVOKE ALL ON public.customers,public.customer_contacts FROM authenticated;
-- Current provider and business state, rather than JWT metadata, is authoritative.
UPDATE public.offices SET active=false WHERE id='00000000-0000-4000-e000-000000000041';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT403','clientes: escritorio inativo nega JWT vigente');
RESET ROLE;
UPDATE public.offices SET active=true WHERE id='00000000-0000-4000-e000-000000000041';
UPDATE public.memberships SET active=false WHERE id='00000000-0000-4000-b000-000000000042';
SET ROLE authenticated;
SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000042","session_id":"00000000-0000-4000-c000-000000000042"}';
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT403','clientes: membership inativo nega JWT vigente');
RESET ROLE;
UPDATE public.memberships SET active=true WHERE id='00000000-0000-4000-b000-000000000042';
UPDATE public.permissions SET active=false WHERE code='customers.read';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT403','clientes: capacidade inativa nega JWT vigente');
RESET ROLE;
UPDATE public.permissions SET active=true WHERE code='customers.read';
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE id='00000000-0000-4000-c000-000000000042';
SET ROLE authenticated;
SELECT test.expect_error($q$SELECT public.customers_page('00000000-0000-4000-e000-000000000041','',1,3)$q$,'PT401','clientes: sessao expirada nega JWT vigente');
RESET ROLE;
UPDATE auth.sessions SET not_after=NULL WHERE id='00000000-0000-4000-c000-000000000042';
RESET request.jwt.claims;
