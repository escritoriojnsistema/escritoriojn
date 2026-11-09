INSERT INTO public.permissions(code,name) VALUES ('rural.read','Consultar imóveis de clientes do seu escopo'),('rural.read_all','Consultar imóveis de todos os clientes autorizados do escritório'),('rural.create','Cadastrar imóveis rurais'),('rural.parties.manage','Gerenciar pessoas e períodos dos imóveis'),('rural.records.manage','Vincular atendimentos e arquivos aos imóveis') ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;s text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%documents.deliver%' LOOP
 s:=replace(r.def,'''documents.deliver''::text', '''documents.deliver''::text,''rural.read''::text,''rural.read_all''::text,''rural.create''::text,''rural.parties.manage''::text,''rural.records.manage''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,s);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP s:=replace(pg_get_functiondef(r.oid),'''documents.deliver''','''documents.deliver'',''rural.read'',''rural.read_all'',''rural.create'',''rural.parties.manage'',''rural.records.manage''');EXECUTE s;END LOOP;
END$m$;
-- Translate configured flags within their original source. Dependencies remain cumulative at operation time; this preserves split direct/delegated grants.
INSERT INTO public.role_permissions(role_code,permission_code) SELECT rp.role_code,m.target FROM public.role_permissions rp JOIN(VALUES('customers.read','rural.read'),('customers.read_all','rural.read_all'),('customers.create','rural.create'),('customers.update','rural.parties.manage'),('customers.update','rural.records.manage'))m(source,target) ON rp.permission_code=m.source ON CONFLICT DO NOTHING;
INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT rp.membership_id,m.target FROM private.team_member_permissions rp JOIN(VALUES('customers.read','rural.read'),('customers.read_all','rural.read_all'),('customers.create','rural.create'),('customers.update','rural.parties.manage'),('customers.update','rural.records.manage'))m(source,target) ON rp.permission_code=m.source ON CONFLICT DO NOTHING;
UPDATE private.team_invitations t SET permissions=ARRAY(SELECT DISTINCT v FROM unnest(t.permissions||ARRAY(SELECT m.target FROM(VALUES('customers.read','rural.read'),('customers.read_all','rural.read_all'),('customers.create','rural.create'),('customers.update','rural.parties.manage'),('customers.update','rural.records.manage'))m(source,target) WHERE m.source=ANY(t.permissions)))v ORDER BY v) WHERE t.status='pending' AND t.expires_at>clock_timestamp();
UPDATE private.team_delegations t SET allowed_permissions=ARRAY(SELECT DISTINCT v FROM unnest(t.allowed_permissions||ARRAY(SELECT m.target FROM(VALUES('customers.read','rural.read'),('customers.read_all','rural.read_all'),('customers.create','rural.create'),('customers.update','rural.parties.manage'),('customers.update','rural.records.manage'))m(source,target) WHERE m.source=ANY(t.allowed_permissions)))v ORDER BY v) WHERE t.revoked_at IS NULL AND t.expires_at>clock_timestamp();
CREATE FUNCTION private.rural_scope_permissions(r private.rural_properties,u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.customers c WHERE c.office_id=r.office_id AND c.id=r.customer_id AND private.customer_in_scope(c,u) AND (r.created_by=u OR c.created_by=u OR private.current_permissions(r.office_id) @> ARRAY['rural.read_all','customers.read_all'] OR EXISTS(SELECT FROM private.customer_relations x JOIN public.memberships m ON m.office_id=x.office_id AND m.id=x.membership_id WHERE x.office_id=c.office_id AND x.customer_id=c.id AND x.relation_type='assignment' AND x.revoked_at IS NULL AND x.valid_from<=clock_timestamp() AND (x.valid_until IS NULL OR x.valid_until>clock_timestamp()) AND m.user_id=u AND m.active AND m.role_code<>'client')));
$$;
REVOKE ALL ON FUNCTION private.rural_scope_permissions(private.rural_properties,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.rural_access27(o uuid,p uuid,write_cap text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; c public.customers; BEGIN
 u:=private.customers_actor(o,write_cap);IF NOT private.current_permissions(o) @> ARRAY['rural.read'] THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT x.* INTO c FROM public.customers x JOIN private.rural_properties r ON r.customer_id=x.id AND r.office_id=x.office_id WHERE r.office_id=o AND r.id=p;
 IF c.id IS NULL OR NOT EXISTS(SELECT FROM private.rural_properties r WHERE r.office_id=o AND r.id=p AND private.rural_scope_permissions(r,u)) THEN RAISE EXCEPTION 'RURAL_NOT_FOUND' USING ERRCODE='PT404'; END IF; RETURN u;
END$$;
CREATE OR REPLACE FUNCTION private.rural_state27(o uuid,p uuid DEFAULT NULL,page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; result jsonb; BEGIN
 u:=private.customers_actor(o,NULL);IF NOT private.current_permissions(o) @> ARRAY['rural.read'] THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;IF page NOT BETWEEN 1 AND 100000 OR page IS NULL THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p IS NULL THEN
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(v),'[]'),'page',page,'page_size',5) INTO result FROM(SELECT r.id,r.name,r.municipality,r.state,r.version FROM private.rural_properties r JOIN public.customers c ON c.office_id=r.office_id AND c.id=r.customer_id WHERE r.office_id=o AND private.rural_scope_permissions(r,u) ORDER BY r.created_at DESC,r.id LIMIT 5 OFFSET(page-1)*5)v;RETURN result;
 END IF;
 PERFORM private.rural_access27(o,p);
 SELECT jsonb_build_object('property',jsonb_build_object('id',r.id,'customer_id',r.customer_id,'name',r.name,'municipality',r.municipality,'state',r.state,'location',r.location,'identifiers',r.identifiers,'version',r.version),'parties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'customer_id',a.customer_id,'name',c.name,'role',a.role,'valid_from',a.valid_from,'valid_until',a.valid_until) ORDER BY a.valid_from DESC,a.id),'[]') FROM (SELECT * FROM private.property_parties WHERE office_id=o AND property_id=p ORDER BY valid_from DESC,id LIMIT 5 OFFSET(page-1)*5) a JOIN public.customers c ON c.office_id=a.office_id AND c.id=a.customer_id WHERE a.office_id=o AND a.property_id=p),'records',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'request_id',a.request_id,'file_id',a.file_id,'exercise',a.exercise) ORDER BY a.created_at DESC),'[]') FROM (SELECT * FROM private.property_records27 WHERE office_id=o AND property_id=p ORDER BY created_at DESC,id LIMIT 5 OFFSET(page-1)*5) a WHERE a.office_id=o AND a.property_id=p),'page',page,'parties_total',(SELECT count(*) FROM private.property_parties WHERE office_id=o AND property_id=p),'records_total',(SELECT count(*) FROM private.property_records27 WHERE office_id=o AND property_id=p)) INTO result FROM private.rural_properties r WHERE r.office_id=o AND r.id=p;RETURN result;
END$$;
CREATE OR REPLACE FUNCTION private.rural_command27(o uuid,p uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; d text; old private.property_commands27; prop private.rural_properties; cust public.customers; pid uuid; m public.memberships;r public.requests; result jsonb; kind text; BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
 kind:=c->>'kind';u:=private.customers_actor(o,CASE WHEN kind='create' THEN 'customers.create' ELSE 'customers.update' END);
 IF NOT private.current_permissions(o) @> ARRAY['rural.read',CASE kind WHEN 'create' THEN 'rural.create' WHEN 'link' THEN 'rural.records.manage' ELSE 'rural.parties.manage' END] THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF kind<>'create' AND (jsonb_typeof(c->'expected_version') IS DISTINCT FROM 'number' OR c->>'expected_version'!~'^[1-9][0-9]{0,9}$') THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF k IS NULL OR jsonb_typeof(c)<>'object' OR kind IS NULL OR kind NOT IN('create','party','end_party','link') THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 d:=encode(extensions.digest(jsonb_build_object('property',p,'command',c)::text,'sha256'),'hex');SELECT * INTO old FROM private.property_commands27 WHERE office_id=o AND actor_id=u AND key=k;
 IF old.key IS NOT NULL THEN IF old.digest<>d THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;PERFORM private.rural_access27(o,(old.result->>'id')::uuid);RETURN old.result;END IF;
 IF kind='create' THEN
 IF EXISTS(SELECT FROM jsonb_each(c)x WHERE x.key=ANY(ARRAY['name','municipality','state','location','customer_id']) AND jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p IS NOT NULL OR NOT c ?& ARRAY['kind','customer_id','name','municipality','state','location','identifiers'] OR c-ARRAY['kind','customer_id','name','municipality','state','location','identifiers']<>'{}' OR jsonb_typeof(c->'identifiers')<>'object' OR (c->'identifiers')-ARRAY['cafir','sncr','car','registry']<>'{}' OR EXISTS(SELECT FROM jsonb_each(c->'identifiers')x WHERE jsonb_typeof(x.value)<>'string' OR char_length(x.value#>>'{}')>120) THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO cust FROM public.customers WHERE office_id=o AND id=(c->>'customer_id')::uuid;IF cust.id IS NULL OR private.customer_in_scope(cust,u) IS NOT TRUE THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.rural_properties(office_id,customer_id,name,municipality,state,location,identifiers,created_by)VALUES(o,cust.id,btrim(c->>'name'),btrim(c->>'municipality'),c->>'state',c->>'location',c->'identifiers',u) RETURNING id INTO pid;
 ELSE
 u:=private.rural_access27(o,p,'customers.update');SELECT * INTO prop FROM private.rural_properties WHERE office_id=o AND id=p FOR UPDATE;
 IF (c->>'expected_version')::integer IS DISTINCT FROM prop.version THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;pid:=p;
 IF kind='party' THEN
 IF c-ARRAY['kind','expected_version','customer_id','role','valid_from','valid_until']<>'{}' THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO cust FROM public.customers WHERE office_id=o AND id=(c->>'customer_id')::uuid;IF cust.id IS NULL OR private.customer_in_scope(cust,u) IS NOT TRUE THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF EXISTS(SELECT FROM private.property_parties a WHERE a.office_id=o AND a.property_id=p AND a.customer_id=cust.id AND a.role=c->>'role' AND daterange(a.valid_from,a.valid_until,'[]')&&daterange((c->>'valid_from')::date,(c->>'valid_until')::date,'[]')) THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.property_parties(office_id,property_id,customer_id,role,valid_from,valid_until,created_by)VALUES(o,p,cust.id,c->>'role',(c->>'valid_from')::date,(c->>'valid_until')::date,u);
 ELSIF kind='end_party' THEN
 IF jsonb_typeof(c->'valid_until') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF c-ARRAY['kind','expected_version','party_id','valid_until']<>'{}' THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 UPDATE private.property_parties SET valid_until=(c->>'valid_until')::date WHERE office_id=o AND property_id=p AND id=(c->>'party_id')::uuid AND valid_until IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE
 IF c-ARRAY['kind','expected_version','request_id','file_id','exercise']<>'{}' THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF EXISTS(SELECT FROM private.property_records27 WHERE office_id=o AND request_id=(c->>'request_id')::uuid AND property_id<>p) THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
 m:=private.files_actor(o,false);r:=private.files_request(o,(c->>'request_id')::uuid,m,true);
 IF private.request_can_work(r,m) IS NOT TRUE OR NOT EXISTS(SELECT FROM private.property_parties a WHERE a.office_id=o AND a.property_id=p AND a.customer_id=r.customer_id AND a.valid_from<=r.created_at::date AND (a.valid_until IS NULL OR a.valid_until>=r.created_at::date)) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF c->>'file_id' IS NOT NULL AND NOT EXISTS(SELECT FROM public.files f WHERE f.office_id=o AND f.id=(c->>'file_id')::uuid AND f.request_id=r.id AND f.status IN('quarentena','disponivel')) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF c->>'file_id' IS NOT NULL THEN INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(o,(c->>'file_id')::uuid,'rural27');END IF;
 INSERT INTO private.property_records27(office_id,property_id,request_id,file_id,exercise,created_by)VALUES(o,p,r.id,(c->>'file_id')::uuid,(c->>'exercise')::integer,u);
 END IF;
 PERFORM private.rural_access27(o,p,'customers.update');UPDATE private.rural_properties SET version=version+1 WHERE office_id=o AND id=p;
 END IF;
 PERFORM private.emit_business_event(o,'rural.'||kind,'rural_property',pid,k,'{}');
 result:=jsonb_build_object('id',pid);INSERT INTO private.property_commands27 VALUES(o,u,k,d,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';WHEN unique_violation THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END$$;
NOTIFY pgrst,'reload schema';

-- Expose permanent grants separately from effective (role/delegation) grants.
DO $m$ DECLARE original text;s text;BEGIN
 SELECT pg_get_functiondef(oid) INTO original FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname='team_dashboard';
 s:=replace(original,'private.team_permissions_for_member(m.id) AS permissions,','private.team_permissions_for_member(m.id) AS permissions, ARRAY(SELECT mp.permission_code FROM private.team_member_permissions mp WHERE mp.membership_id=m.id ORDER BY mp.permission_code) AS direct_permissions,');
 IF s=original THEN RAISE EXCEPTION 'TEAM_DASHBOARD_ADAPTER_MISMATCH';END IF;EXECUTE s;
END$m$;
