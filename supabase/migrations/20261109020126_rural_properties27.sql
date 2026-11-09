-- Rural27 extends customers08 and requests/files10/11. No portal rights are inferred.
CREATE TABLE private.rural_properties(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),customer_id uuid NOT NULL,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 120),municipality text NOT NULL CHECK(char_length(btrim(municipality)) BETWEEN 1 AND 120),
 state text NOT NULL CHECK(state ~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$'),
 location text NOT NULL CHECK(char_length(location)<=500),identifiers jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id)
);
CREATE INDEX rural_customer27 ON private.rural_properties(office_id,customer_id);
CREATE INDEX rural_creator27 ON private.rural_properties(created_by);
CREATE TABLE private.property_parties(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,property_id uuid NOT NULL,customer_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN('holder','taxpayer','representative')),valid_from date NOT NULL,valid_until date CHECK(valid_until>=valid_from),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,property_id) REFERENCES private.rural_properties(office_id,id),FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id)
);
CREATE INDEX parties_property27 ON private.property_parties(office_id,property_id,valid_from);
CREATE INDEX parties_customer27 ON private.property_parties(office_id,customer_id);
CREATE INDEX parties_creator27 ON private.property_parties(created_by);
CREATE TABLE private.property_records27(
 office_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,file_id uuid,exercise integer CHECK(exercise BETWEEN 1900 AND 2200),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 FOREIGN KEY(office_id,property_id) REFERENCES private.rural_properties(office_id,id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id),FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id),
 UNIQUE NULLS NOT DISTINCT(office_id,request_id,file_id)
);
CREATE INDEX records_property27 ON private.property_records27(office_id,property_id,exercise);
CREATE INDEX records_file27 ON private.property_records27(office_id,file_id);
CREATE INDEX records_creator27 ON private.property_records27(created_by);
CREATE TABLE private.property_commands27(office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),key uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(office_id,actor_id,key));
CREATE INDEX commands_actor27 ON private.property_commands27(actor_id);
CREATE FUNCTION private.rural_access27(o uuid,p uuid,write_cap text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; c public.customers; BEGIN
 u:=private.customers_actor(o,write_cap);
 SELECT x.* INTO c FROM public.customers x JOIN private.rural_properties r ON r.customer_id=x.id AND r.office_id=x.office_id WHERE r.office_id=o AND r.id=p;
 IF c.id IS NULL OR private.customer_in_scope(c,u) IS NOT TRUE THEN RAISE EXCEPTION 'RURAL_NOT_FOUND' USING ERRCODE='PT404'; END IF; RETURN u;
END$$;
CREATE FUNCTION private.rural_state27(o uuid,p uuid DEFAULT NULL,page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; result jsonb; BEGIN
 u:=private.customers_actor(o,NULL);IF page NOT BETWEEN 1 AND 100000 OR page IS NULL THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p IS NULL THEN
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(v),'[]'),'page',page,'page_size',5) INTO result FROM(SELECT r.id,r.name,r.municipality,r.state,r.version FROM private.rural_properties r JOIN public.customers c ON c.office_id=r.office_id AND c.id=r.customer_id WHERE r.office_id=o AND private.customer_in_scope(c,u) ORDER BY r.created_at DESC,r.id LIMIT 5 OFFSET(page-1)*5)v;RETURN result;
 END IF;
 PERFORM private.rural_access27(o,p);
 SELECT jsonb_build_object('property',jsonb_build_object('id',r.id,'customer_id',r.customer_id,'name',r.name,'municipality',r.municipality,'state',r.state,'location',r.location,'identifiers',r.identifiers,'version',r.version),'parties',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'customer_id',a.customer_id,'name',c.name,'role',a.role,'valid_from',a.valid_from,'valid_until',a.valid_until) ORDER BY a.valid_from DESC,a.id),'[]') FROM (SELECT * FROM private.property_parties WHERE office_id=o AND property_id=p ORDER BY valid_from DESC,id LIMIT 5 OFFSET(page-1)*5) a JOIN public.customers c ON c.office_id=a.office_id AND c.id=a.customer_id WHERE a.office_id=o AND a.property_id=p),'records',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'request_id',a.request_id,'file_id',a.file_id,'exercise',a.exercise) ORDER BY a.created_at DESC),'[]') FROM (SELECT * FROM private.property_records27 WHERE office_id=o AND property_id=p ORDER BY created_at DESC,id LIMIT 5 OFFSET(page-1)*5) a WHERE a.office_id=o AND a.property_id=p),'page',page,'parties_total',(SELECT count(*) FROM private.property_parties WHERE office_id=o AND property_id=p),'records_total',(SELECT count(*) FROM private.property_records27 WHERE office_id=o AND property_id=p)) INTO result FROM private.rural_properties r WHERE r.office_id=o AND r.id=p;RETURN result;
END$$;
CREATE FUNCTION private.rural_command27(o uuid,p uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid; d text; old private.property_commands27; prop private.rural_properties; cust public.customers; pid uuid; m public.memberships;r public.requests; result jsonb; kind text; BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
 kind:=c->>'kind';u:=private.customers_actor(o,CASE WHEN kind='create' THEN 'customers.create' ELSE 'customers.update' END);
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
DO $m$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['rural_properties','property_parties','property_records27','property_commands27'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$m$;
CREATE FUNCTION public.rural_state27(o uuid,p uuid DEFAULT NULL,page integer DEFAULT 1) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.rural_state27(o,p,page);$$;
CREATE FUNCTION public.rural_command27(o uuid,p uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.rural_command27(o,p,c,k);$$;
REVOKE ALL ON FUNCTION private.rural_access27(uuid,uuid,text),private.rural_state27(uuid,uuid,integer),private.rural_command27(uuid,uuid,jsonb,uuid),public.rural_state27(uuid,uuid,integer),public.rural_command27(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.rural_state27(uuid,uuid,integer),private.rural_command27(uuid,uuid,jsonb,uuid),public.rural_state27(uuid,uuid,integer),public.rural_command27(uuid,uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE TRIGGER records27_immutable BEFORE UPDATE OR DELETE ON private.property_records27 FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE TRIGGER commands27_immutable BEFORE UPDATE OR DELETE ON private.property_commands27 FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
