-- Etapa09. Versioned catalog, additive; no hosted fixtures or account rewrites.
-- No existing identity, membership, grant or customer data is rewritten.
INSERT INTO public.permissions(code,name) VALUES
 ('services.read','Consultar servicos'),('services.manage','Publicar catalogo'),('services.perform','Executar servicos'),('services.approve','Aprovar servicos'),('services.discount','Aplicar desconto'),('services.surcharge','Aplicar acrescimo'),('services.courtesy','Conceder cortesia'),('services.price_override','Alterar preco manualmente') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions
 WHERE code LIKE 'services.%' ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override']);

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override'],
   'can_create_owner',private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],'can_delegate',true,'delegation_id',NULL);
 END IF;
 SELECT * INTO d FROM private.team_delegations WHERE membership_id=m.id AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF m.role_code<>'admin' OR d.id IS NULL THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','admin',
  'allowed_roles',d.allowed_roles,'allowed_permissions',d.allowed_permissions,'can_create_owner',
  d.can_create_owner AND private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],
  'can_delegate',false,'delegation_id',d.id);
END $$;


CREATE OR REPLACE FUNCTION private.team_validate_assignment(p_actor jsonb,p_role text,p_permissions text[],p_creating_owner boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('employee','admin','owner') OR p_permissions IS NULL
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override'])
  OR cardinality(p_permissions)<>(SELECT count(DISTINCT x) FROM unnest(p_permissions) x)
  OR NOT EXISTS (SELECT FROM public.roles WHERE code=p_role AND active)
  OR EXISTS (SELECT FROM unnest(p_permissions) x WHERE NOT EXISTS(SELECT FROM public.permissions WHERE code=x AND active)) THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT (p_actor->'allowed_roles' ? p_role) OR NOT (p_actor->'allowed_permissions' @> to_jsonb(p_permissions))
  OR (p_role='owner' AND p_creating_owner AND NOT (p_actor->>'can_create_owner')::boolean) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
END $$;


CREATE OR REPLACE FUNCTION private.safe_audit_changes(p_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v jsonb; result jsonb:='{}'; safe boolean;
BEGIN
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RETURN result; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_changes) LOOP
  safe:=false;
  IF k IN ('active','can_create_owner') THEN safe:=jsonb_typeof(v)='boolean';
  ELSIF k='role_code' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}'=ANY(ARRAY['owner','admin','employee','client']);
  ELSIF k IN ('membership_id','archive_id','customer_id','source_id','target_id','relation_id','merge_id') THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ELSIF k='expires_at' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9TZ:+. -]{20,35}$';
  ELSIF k='count' AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN 0 AND 1000;
  ELSIF k IN ('permissions','allowed_permissions') AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE FUNCTION private.services_normalize_input(p_service jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; f jsonb; result jsonb; normalized_fields jsonb:='[]'; checks jsonb:='[]'; item jsonb; at_time timestamptz;
BEGIN
 IF jsonb_typeof(p_service) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_service))<>20 OR NOT p_service ?& ARRAY[
  'code','name','category','unit','price_cents','effective_from','person_required','participants_min','approval_required','signature_required','settlement_required',
  'required_capabilities','fields','checklist','quantity_min','quantity_max','max_discount_bps','max_surcharge_bps','allow_courtesy','allow_price_override'] THEN
  RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 FOR k IN SELECT unnest(ARRAY['code','name','category','unit']) LOOP
  IF jsonb_typeof(p_service->k) IS DISTINCT FROM 'string' OR btrim(p_service->>k)='' OR p_service->>k ~ '[[:cntrl:]]' THEN
   RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 END LOOP;
 IF p_service->>'code' !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' OR char_length(p_service->>'name')>120 OR char_length(p_service->>'category')>60 OR char_length(p_service->>'unit')>30 THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 FOR k IN SELECT unnest(ARRAY['person_required','approval_required','signature_required','settlement_required','allow_courtesy','allow_price_override']) LOOP
  IF jsonb_typeof(p_service->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 END LOOP;
 FOR k IN SELECT unnest(ARRAY['price_cents','participants_min','quantity_min','quantity_max','max_discount_bps','max_surcharge_bps']) LOOP
  IF jsonb_typeof(p_service->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  IF (p_service->>k)::numeric<>trunc((p_service->>k)::numeric) OR (p_service->>k)::numeric NOT BETWEEN 0 AND 100000000 THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 END LOOP;
 IF (p_service->>'participants_min')::integer>20 OR (p_service->>'quantity_min')::integer NOT BETWEEN 1 AND 100000
  OR (p_service->>'quantity_max')::integer NOT BETWEEN (p_service->>'quantity_min')::integer AND 100000
  OR (p_service->>'max_discount_bps')::integer>10000 OR (p_service->>'max_surcharge_bps')::integer>10000
  OR (NOT (p_service->>'person_required')::boolean AND ((p_service->>'participants_min')::integer>0 OR (p_service->>'signature_required')::boolean)) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF p_service->'effective_from'<>'null'::jsonb THEN
  IF jsonb_typeof(p_service->'effective_from') IS DISTINCT FROM 'string' OR p_service->>'effective_from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  BEGIN at_time:=(p_service->>'effective_from')::timestamptz;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END;
  IF NOT isfinite(at_time) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 END IF;
 IF jsonb_typeof(p_service->'required_capabilities') IS DISTINCT FROM 'array' OR jsonb_typeof(p_service->'fields') IS DISTINCT FROM 'array' OR jsonb_typeof(p_service->'checklist') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF jsonb_array_length(p_service->'required_capabilities')>2 OR EXISTS(SELECT FROM jsonb_array_elements(p_service->'required_capabilities') c WHERE jsonb_typeof(c)<>'string' OR c#>>'{}' NOT IN('services.perform','services.approve'))
  OR (SELECT count(DISTINCT c) FROM jsonb_array_elements(p_service->'required_capabilities') c)<>jsonb_array_length(p_service->'required_capabilities')
  OR jsonb_array_length(p_service->'fields')>12 OR jsonb_array_length(p_service->'checklist')>12 THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(p_service->'fields') LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  IF NOT f ?& ARRAY['key','label','type','required'] OR (SELECT count(*) FROM jsonb_object_keys(f))<>4 OR jsonb_typeof(f->'key') IS DISTINCT FROM 'string'
   OR f->>'key' !~ '^[a-z][a-z0-9_]{0,31}$' OR jsonb_typeof(f->'label') IS DISTINCT FROM 'string' OR char_length(btrim(f->>'label')) NOT BETWEEN 1 AND 80
   OR f->>'label' ~ '[[:cntrl:]]' OR jsonb_typeof(f->'type') IS DISTINCT FROM 'string' OR f->>'type' NOT IN('text','number','date') OR jsonb_typeof(f->'required') IS DISTINCT FROM 'boolean'
   OR EXISTS(SELECT FROM jsonb_array_elements(normalized_fields) x WHERE x->>'key'=f->>'key') THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  normalized_fields:=normalized_fields||jsonb_build_array(f||jsonb_build_object('label',btrim(f->>'label')));
 END LOOP;
 FOR item IN SELECT * FROM jsonb_array_elements(p_service->'checklist') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR char_length(btrim(item#>>'{}')) NOT BETWEEN 1 AND 120 OR item#>>'{}' ~ '[[:cntrl:]]'
   OR checks @> jsonb_build_array(btrim(item#>>'{}')) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  checks:=checks||jsonb_build_array(btrim(item#>>'{}'));
 END LOOP;
 result:=p_service||jsonb_build_object('name',btrim(p_service->>'name'),'category',btrim(p_service->>'category'),'unit',btrim(p_service->>'unit'),'fields',normalized_fields,'checklist',checks);
 RETURN result;
END $$;

CREATE TABLE public.services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'), latest_version integer NOT NULL DEFAULT 1 CHECK(latest_version BETWEEN 1 AND 2147483646),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id), UNIQUE(office_id,code)
);
CREATE INDEX services_created_by_idx ON public.services(created_by);
CREATE TABLE public.service_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL, service_id uuid NOT NULL, number integer NOT NULL CHECK(number BETWEEN 1 AND 2147483646),
 definition jsonb NOT NULL CHECK(definition=private.services_normalize_input(definition)),
 name text GENERATED ALWAYS AS (definition->>'name') STORED,
 category text GENERATED ALWAYS AS (definition->>'category') STORED,
 unit text GENERATED ALWAYS AS (definition->>'unit') STORED,
 price_cents integer GENERATED ALWAYS AS ((definition->>'price_cents')::integer) STORED,
 effective_from timestamptz NOT NULL CHECK(isfinite(effective_from)),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(reason=btrim(reason) AND char_length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id) ON DELETE RESTRICT,
 UNIQUE(office_id,service_id,number), UNIQUE(office_id,service_id,effective_from), UNIQUE(office_id,service_id,id)
);
CREATE INDEX service_versions_effective_idx ON public.service_versions(office_id,service_id,effective_from DESC);
CREATE INDEX service_versions_created_by_idx ON public.service_versions(created_by);
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.services,public.service_versions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.services_version_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'SERVICE_CONFLICT' USING ERRCODE='PT409'; END $$;
CREATE TRIGGER services_version_immutable BEFORE UPDATE OR DELETE ON public.service_versions FOR EACH ROW EXECUTE FUNCTION private.services_version_immutable();

CREATE FUNCTION private.services_actor(p_office_id uuid,p_write boolean DEFAULT false,p_perform boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid; member_id uuid; caps text[];
BEGIN
 caller:=private.team_require_identity();
 IF p_write THEN PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE;
 ELSE PERFORM 1 FROM public.offices WHERE id=p_office_id FOR SHARE; END IF;
 caller:=private.team_require_identity();
 SELECT id INTO member_id FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active AND role_code<>'client' FOR SHARE;
 caller:=private.team_require_identity(); caps:=private.current_permissions(p_office_id);
 IF member_id IS NULL OR NOT caps @> ARRAY['foundation.access','services.read'] OR (p_write AND NOT caps @> ARRAY['services.manage']) OR (p_perform AND NOT caps @> ARRAY['services.perform']) THEN
  RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN caller;
END $$;
CREATE FUNCTION private.services_version_record(v public.service_versions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT v.definition||jsonb_build_object('id',v.id,'number',v.number,'created_by',v.created_by,'created_at',v.created_at,'reason',v.reason);
$$;
CREATE FUNCTION private.services_detail_record(s public.services,p_page integer,p_can_manage boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'code',s.code,'latest_version',s.latest_version,'can_manage',p_can_manage,
  'current',(SELECT private.services_version_record(v) FROM public.service_versions v WHERE v.office_id=s.office_id AND v.service_id=s.id AND v.effective_from<=clock_timestamp() ORDER BY v.effective_from DESC LIMIT 1),
  'versions',coalesce((SELECT jsonb_agg(private.services_version_record(x) ORDER BY x.number DESC) FROM
   (SELECT v.* FROM public.service_versions v WHERE v.office_id=s.office_id AND v.service_id=s.id ORDER BY v.number DESC LIMIT 3 OFFSET (p_page-1)*3) x),'[]'::jsonb),
  'history_page',p_page,'history_total',s.latest_version);
$$;
CREATE FUNCTION private.services_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total bigint; q text; catalog_at timestamptz;
BEGIN
 PERFORM private.services_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 q:=lower(btrim(p_query)); catalog_at:=clock_timestamp();
 WITH candidates AS (SELECT s.id,s.code,v.name,v.category,v.unit,v.price_cents,v.number AS version,v.effective_from
  FROM public.services s CROSS JOIN LATERAL(SELECT ver.* FROM public.service_versions ver WHERE ver.office_id=s.office_id AND ver.service_id=s.id
   ORDER BY (ver.effective_from<=catalog_at) DESC,ver.number DESC LIMIT 1) v
  WHERE s.office_id=p_office_id AND (q='' OR strpos(lower(s.code),q)>0 OR strpos(lower(v.name),q)>0 OR strpos(lower(v.category),q)>0)),
 page AS (SELECT * FROM candidates ORDER BY code,id LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY code,id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.service_detail(p_office_id uuid,p_service_id uuid,p_page integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.services;
BEGIN
 PERFORM private.services_actor(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=p_service_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 RETURN private.services_detail_record(s,p_page,private.current_permissions(p_office_id) @> ARRAY['services.manage']);
END $$;
CREATE FUNCTION private.service_create(p_office_id uuid,p_service jsonb,p_reason text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; d jsonb; s public.services; at_time timestamptz; now_time timestamptz; violated text;
BEGIN
 caller:=private.services_actor(p_office_id,true); d:=private.services_normalize_input(p_service); now_time:=clock_timestamp();
 IF p_request_id IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 at_time:=coalesce((d->>'effective_from')::timestamptz,now_time);
 IF at_time<now_time OR at_time>now_time+interval '5 years' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 d:=d||jsonb_build_object('effective_from',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 INSERT INTO public.services(office_id,code,created_by) VALUES(p_office_id,d->>'code',caller) RETURNING * INTO s;
 INSERT INTO public.service_versions(office_id,service_id,number,definition,effective_from,created_by,reason) VALUES(p_office_id,s.id,1,d,at_time,caller,btrim(p_reason));
 PERFORM private.emit_business_event(p_office_id,'services.created','service',s.id,p_request_id,'{}');
 RETURN private.services_detail_record(s,1,true);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated=CONSTRAINT_NAME;
 IF violated='services_office_id_code_key' THEN RAISE EXCEPTION 'SERVICE_DUPLICATE' USING ERRCODE='PT409'; END IF; RAISE;
END $$;
CREATE FUNCTION private.service_publish(p_office_id uuid,p_service_id uuid,p_service jsonb,p_expected_version integer,p_reason text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; d jsonb; s public.services; at_time timestamptz; now_time timestamptz; latest_at timestamptz;
BEGIN
 caller:=private.services_actor(p_office_id,true);
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR UPDATE;
 IF s.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 -- A session or capability can be revoked while waiting for the service row.
 PERFORM private.services_actor(p_office_id,true);
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR p_request_id IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF s.latest_version<>p_expected_version THEN RAISE EXCEPTION 'SERVICE_CONFLICT' USING ERRCODE='PT409'; END IF;
 d:=private.services_normalize_input(p_service);
 IF d->>'code'<>s.code THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 now_time:=clock_timestamp(); at_time:=coalesce((d->>'effective_from')::timestamptz,now_time);
 SELECT effective_from INTO latest_at FROM public.service_versions WHERE office_id=p_office_id AND service_id=s.id AND number=s.latest_version;
 IF at_time<now_time OR at_time>now_time+interval '5 years' OR at_time<=latest_at THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 d:=d||jsonb_build_object('effective_from',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
 UPDATE public.services SET latest_version=latest_version+1 WHERE id=s.id RETURNING * INTO s;
 INSERT INTO public.service_versions(office_id,service_id,number,definition,effective_from,created_by,reason) VALUES(p_office_id,s.id,s.latest_version,d,at_time,caller,btrim(p_reason));
 PERFORM private.emit_business_event(p_office_id,'services.version_published','service',s.id,p_request_id,'{}');
 RETURN private.services_detail_record(s,1,true);
END $$;
-- Internal reusable calculation. Future order creation must persist this snapshot in
-- its own transaction, never accept a client-provided price/snapshot as authority.
CREATE FUNCTION private.services_snapshot(s public.services,v public.service_versions,p_quantity integer,p_adjustment jsonb,p_caps text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d jsonb:=v.definition; kind text; val numeric; reason text; base bigint; total bigint; unit_price bigint;
BEGIN
 IF NOT p_caps @> ARRAY(SELECT jsonb_array_elements_text(d->'required_capabilities')) THEN RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF p_quantity IS NULL OR p_quantity NOT BETWEEN (d->>'quantity_min')::integer AND (d->>'quantity_max')::integer OR jsonb_typeof(p_adjustment) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT p_adjustment ?& ARRAY['kind','value','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_adjustment))<>3 OR jsonb_typeof(p_adjustment->'kind') IS DISTINCT FROM 'string'
  OR p_adjustment->>'kind' NOT IN('none','discount','surcharge','courtesy','override') OR jsonb_typeof(p_adjustment->'value') IS DISTINCT FROM 'number' OR jsonb_typeof(p_adjustment->'reason') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 kind:=p_adjustment->>'kind'; val:=(p_adjustment->>'value')::numeric; reason:=btrim(p_adjustment->>'reason');
 IF val<>trunc(val) OR val NOT BETWEEN 0 AND 100000000 OR (kind NOT IN('none','courtesy','override') AND val>10000)
  OR (kind='none' AND (val<>0 OR reason<>'')) OR (kind='courtesy' AND val<>0)
  OR (kind<>'none' AND (char_length(reason) NOT BETWEEN 1 AND 500 OR reason ~ '[[:cntrl:]]')) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF kind<>'none' AND NOT p_caps @> ARRAY[CASE kind WHEN 'override' THEN 'services.price_override' ELSE 'services.'||kind END] THEN RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF (kind='discount' AND (val=0 OR val>(d->>'max_discount_bps')::integer)) OR (kind='surcharge' AND (val=0 OR val>(d->>'max_surcharge_bps')::integer))
  OR (kind='courtesy' AND NOT (d->>'allow_courtesy')::boolean) OR (kind='override' AND NOT (d->>'allow_price_override')::boolean) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
 unit_price:=v.price_cents; base:=unit_price*p_quantity; total:=base;
 IF kind='discount' THEN total:=base-round(base::numeric*val/10000)::bigint;
 ELSIF kind='surcharge' THEN total:=base+round(base::numeric*val/10000)::bigint;
 ELSIF kind='courtesy' THEN total:=0;
 ELSIF kind='override' THEN unit_price:=val::bigint; total:=unit_price*p_quantity; END IF;
 RETURN jsonb_build_object('service_id',s.id,'version_id',v.id,'version',v.number,'effective_from',v.effective_from,'quoted_at',clock_timestamp(),
  'definition',d,'quantity',p_quantity,'unit_price_cents',unit_price,'base_cents',base,'total_cents',total,'adjustment',p_adjustment||jsonb_build_object('reason',reason));
END $$;
CREATE FUNCTION private.service_quote(p_office_id uuid,p_service_id uuid,p_quantity integer,p_adjustment jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.services; v public.service_versions;
BEGIN
 PERFORM private.services_actor(p_office_id,false,true);
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=p_service_id;
 IF s.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 SELECT * INTO v FROM public.service_versions WHERE office_id=p_office_id AND service_id=s.id AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1;
 IF v.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_EFFECTIVE' USING ERRCODE='PT409'; END IF;
 RETURN private.services_snapshot(s,v,p_quantity,p_adjustment,private.current_permissions(p_office_id));
END $$;
CREATE FUNCTION public.services_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.services_page(p_office_id,p_query,p_page,p_size); $$;
CREATE FUNCTION public.service_detail(p_office_id uuid,p_service_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.service_detail(p_office_id,p_service_id,p_page); $$;
CREATE FUNCTION public.service_create(p_office_id uuid,p_service jsonb,p_reason text,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.service_create(p_office_id,p_service,p_reason,p_request_id); $$;
CREATE FUNCTION public.service_publish(p_office_id uuid,p_service_id uuid,p_service jsonb,p_expected_version integer,p_reason text,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.service_publish(p_office_id,p_service_id,p_service,p_expected_version,p_reason,p_request_id); $$;
CREATE FUNCTION public.service_quote(p_office_id uuid,p_service_id uuid,p_quantity integer,p_adjustment jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.service_quote(p_office_id,p_service_id,p_quantity,p_adjustment); $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN('private','public') AND (p.proname LIKE 'services_%' OR p.proname IN('service_detail','service_create','service_publish','service_quote'))
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.services_page(uuid,text,integer,integer),private.services_page(uuid,text,integer,integer),public.service_detail(uuid,uuid,integer),private.service_detail(uuid,uuid,integer),public.service_create(uuid,jsonb,text,uuid),private.service_create(uuid,jsonb,text,uuid),public.service_publish(uuid,uuid,jsonb,integer,text,uuid),private.service_publish(uuid,uuid,jsonb,integer,text,uuid),public.service_quote(uuid,uuid,integer,jsonb),private.service_quote(uuid,uuid,integer,jsonb) TO authenticated;
