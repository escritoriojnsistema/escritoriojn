-- Etapa07: customer records are independent from Auth identities.
-- No existing identity, membership, grant or customer data is rewritten.
INSERT INTO public.permissions(code,name) VALUES
 ('customers.read','Consultar clientes'),('customers.create','Cadastrar clientes'),
 ('customers.update','Alterar clientes'),('customers.read_all','Consultar todos os clientes do escritorio') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions
 WHERE code IN ('customers.read','customers.create','customers.update','customers.read_all') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all']);

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all'])
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
  ELSIF k IN ('membership_id','archive_id') THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ELSIF k='expires_at' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9TZ:+. -]{20,35}$';
  ELSIF k='count' AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN 0 AND 1000;
  ELSIF k IN ('permissions','allowed_permissions') AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

-- Accept only complete canonical formatting or digits; arbitrary text is never stripped into an ID.
CREATE FUNCTION private.customers_normalize_identifier(p_kind text,p_identifier text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE digits text; total integer; expected integer; step integer; i integer;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN ('person','company') THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF p_identifier IS NULL OR p_identifier='' THEN RETURN NULL; END IF;
 IF (p_kind='person' AND p_identifier !~ '^([0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$')
  OR (p_kind='company' AND p_identifier !~ '^([0-9]{14}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2})$') THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 digits:=regexp_replace(p_identifier,'[^0-9]','','g');
 IF p_kind='person' THEN
  IF private.team_normalize_cpf(digits) IS NULL THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 ELSE
  IF digits=repeat(substr(digits,1,1),14) THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  FOR step IN 1..2 LOOP
   total:=0;
   FOR i IN 1..(11+step) LOOP total:=total+substr(digits,i,1)::integer*(((11+step-i)%8)+2); END LOOP;
   expected:=11-(total%11); IF expected>=10 THEN expected:=0; END IF;
   IF substr(digits,12+step,1)::integer<>expected THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  END LOOP;
 END IF;
 RETURN digits;
END $$;

CREATE TABLE public.customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK (kind IN ('person','company')),
 name text NOT NULL CHECK (name=btrim(name) AND char_length(name) BETWEEN 1 AND 120 AND name !~ '[[:cntrl:]]'),
 identifier text CHECK (identifier IS NULL OR (identifier<>'' AND identifier=private.customers_normalize_identifier(kind,identifier))),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 version integer NOT NULL DEFAULT 1 CHECK (version>=1),
 UNIQUE(office_id,id)
);
CREATE UNIQUE INDEX customers_office_kind_identifier_idx ON public.customers(office_id,kind,identifier) WHERE identifier IS NOT NULL;
CREATE INDEX customers_office_time_idx ON public.customers(office_id,created_at DESC,id DESC);
CREATE INDEX customers_office_creator_time_idx ON public.customers(office_id,created_by,created_at DESC,id DESC);
CREATE INDEX customers_created_by_idx ON public.customers(created_by);
CREATE TABLE public.customer_contacts (
 office_id uuid NOT NULL,
 customer_id uuid NOT NULL,
 position smallint NOT NULL CHECK (position BETWEEN 0 AND 3),
 kind text NOT NULL CHECK (kind IN ('email','phone')),
 value text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 254 AND value=btrim(value)),
 PRIMARY KEY(customer_id,position),
 UNIQUE(customer_id,kind,value),
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 CHECK ((kind='email' AND value=lower(value) AND value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  OR (kind='phone' AND value ~ '^([0-9]{10,11}|55[0-9]{10,11})$'))
);
CREATE INDEX customer_contacts_office_customer_idx ON public.customer_contacts(office_id,customer_id);
-- No raw API grants or policies: every read is an authorized, deliberately limited DTO.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customers,public.customer_contacts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.customers_normalize_input(p_customer jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE normalized jsonb; contacts jsonb:='[]'; contact jsonb; contact_kind text; contact_value text; identifier text; customer_name text;
BEGIN
 IF jsonb_typeof(p_customer) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT (p_customer ?& ARRAY['kind','name','contacts'])
  OR EXISTS(SELECT FROM jsonb_object_keys(p_customer) k WHERE k NOT IN ('kind','name','identifier','contacts'))
  OR jsonb_typeof(p_customer->'kind') IS DISTINCT FROM 'string'
  OR p_customer->>'kind' NOT IN ('person','company')
  OR jsonb_typeof(p_customer->'name') IS DISTINCT FROM 'string'
  OR (p_customer ? 'identifier' AND jsonb_typeof(p_customer->'identifier') IS DISTINCT FROM 'string')
  OR jsonb_typeof(p_customer->'contacts') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 customer_name:=btrim(p_customer->>'name');
 IF char_length(customer_name) NOT BETWEEN 1 AND 120 OR customer_name ~ '[[:cntrl:]]'
  OR jsonb_array_length(p_customer->'contacts')>4 THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 identifier:=private.customers_normalize_identifier(p_customer->>'kind',p_customer->>'identifier');
 FOR contact IN SELECT * FROM jsonb_array_elements(p_customer->'contacts') LOOP
  IF jsonb_typeof(contact) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  IF NOT (contact ?& ARRAY['kind','value']) OR EXISTS(SELECT FROM jsonb_object_keys(contact) k WHERE k NOT IN ('kind','value'))
   OR jsonb_typeof(contact->'kind') IS DISTINCT FROM 'string' OR contact->>'kind' NOT IN ('email','phone')
   OR jsonb_typeof(contact->'value') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  contact_kind:=contact->>'kind'; contact_value:=btrim(contact->>'value');
  IF char_length(contact_value) NOT BETWEEN 1 AND 254 OR contact_value ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  IF contact_kind='email' THEN
   contact_value:=lower(contact_value);
   IF contact_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  ELSE
   IF contact_value !~ '^\+?[0-9() .-]+$' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
   contact_value:=regexp_replace(contact_value,'[^0-9]','','g');
   IF contact_value !~ '^([0-9]{10,11}|55[0-9]{10,11})$' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  END IF;
  normalized:=jsonb_build_object('kind',contact_kind,'value',contact_value);
  IF contacts @> jsonb_build_array(normalized) THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  contacts:=contacts||jsonb_build_array(normalized);
 END LOOP;
 RETURN jsonb_build_object('kind',p_customer->>'kind','name',customer_name,'identifier',identifier,'contacts',contacts);
END $$;

-- Same office lock order as team/governance mutations; a post-lock session/capability check
-- prevents revoked authority surviving a wait. A membership share lock stabilizes its row.
CREATE FUNCTION private.customers_actor(p_office_id uuid,p_write text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid; member_id uuid; capabilities text[];
BEGIN
 caller:=private.team_require_identity();
 IF p_write IS NULL THEN PERFORM 1 FROM public.offices WHERE id=p_office_id FOR SHARE;
 ELSE PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE; END IF;
 caller:=private.team_require_identity();
 SELECT id INTO member_id FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active AND role_code<>'client' FOR SHARE;
 caller:=private.team_require_identity();
 capabilities:=private.current_permissions(p_office_id);
 IF member_id IS NULL OR NOT (capabilities @> ARRAY['foundation.access','customers.read'])
  OR (p_write IS NOT NULL AND (p_write NOT IN ('customers.create','customers.update') OR NOT capabilities @> ARRAY[p_write])) THEN
  RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN caller;
END $$;
CREATE FUNCTION private.customers_summary(p_customer public.customers) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_customer.id,'kind',p_customer.kind,'name',p_customer.name,
  'identifier_masked',CASE WHEN p_customer.identifier IS NULL THEN NULL WHEN p_customer.kind='person' THEN '***.***.***-'||right(p_customer.identifier,2)
   ELSE '**.***.***/****-'||right(p_customer.identifier,2) END,'created_at',p_customer.created_at);
$$;
CREATE FUNCTION private.customers_detail_record(p_customer public.customers,p_can_update boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.customers_summary(p_customer)||jsonb_build_object('identifier',p_customer.identifier,'version',p_customer.version,'can_update',p_can_update,
  'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',c.kind,'value',c.value) ORDER BY c.position)
   FROM public.customer_contacts c WHERE c.office_id=p_customer.office_id AND c.customer_id=p_customer.id),'[]'::jsonb));
$$;
CREATE FUNCTION private.customers_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; all_records boolean; result jsonb; total bigint; query_text text; query_digits text;
BEGIN
 caller:=private.customers_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN (3,5) THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 all_records:=private.current_permissions(p_office_id) @> ARRAY['customers.read_all'];
 query_text:=btrim(p_query);
 IF query_text ~ '^[0-9 ./-]+$' THEN query_digits:=nullif(regexp_replace(query_text,'[^0-9]','','g'),''); END IF;
 SELECT count(*) INTO total FROM public.customers c WHERE c.office_id=p_office_id AND (all_records OR c.created_by=caller)
  AND (query_text='' OR strpos(lower(c.name),lower(query_text))>0 OR (query_digits IS NOT NULL AND strpos(c.identifier,query_digits)>0));
 SELECT coalesce(jsonb_agg(private.customers_summary(x) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO result FROM (
  SELECT c.* FROM public.customers c WHERE c.office_id=p_office_id AND (all_records OR c.created_by=caller)
   AND (query_text='' OR strpos(lower(c.name),lower(query_text))>0 OR (query_digits IS NOT NULL AND strpos(c.identifier,query_digits)>0))
   ORDER BY c.created_at DESC,c.id DESC LIMIT p_size OFFSET (p_page-1)*p_size) x;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.customer_detail(p_office_id uuid,p_customer_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; customer public.customers; capabilities text[];
BEGIN
 caller:=private.customers_actor(p_office_id); capabilities:=private.current_permissions(p_office_id);
 SELECT * INTO customer FROM public.customers c WHERE c.office_id=p_office_id AND c.id=p_customer_id
  AND (c.created_by=caller OR capabilities @> ARRAY['customers.read_all']);
 IF customer.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 RETURN private.customers_detail_record(customer,capabilities @> ARRAY['customers.update']);
END $$;
CREATE FUNCTION private.customer_create(p_office_id uuid,p_customer jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; normalized jsonb; customer public.customers; violated_constraint text;
BEGIN
 caller:=private.customers_actor(p_office_id,'customers.create');
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 normalized:=private.customers_normalize_input(p_customer);
 INSERT INTO public.customers(office_id,kind,name,identifier,created_by) VALUES
  (p_office_id,normalized->>'kind',normalized->>'name',normalized->>'identifier',caller) RETURNING * INTO customer;
 INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value)
  SELECT p_office_id,customer.id,(ordinality-1)::smallint,value->>'kind',value->>'value' FROM jsonb_array_elements(normalized->'contacts') WITH ORDINALITY;
 PERFORM private.emit_business_event(p_office_id,'customers.created','customer',customer.id,p_request_id,'{}');
 RETURN private.customers_detail_record(customer,private.current_permissions(p_office_id) @> ARRAY['customers.update']);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='customers_office_kind_identifier_idx' THEN RAISE EXCEPTION 'CUSTOMER_DUPLICATE' USING ERRCODE='PT409'; END IF;
 RAISE;
END $$;
CREATE FUNCTION private.customer_update(p_office_id uuid,p_customer_id uuid,p_customer jsonb,p_version integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; normalized jsonb; customer public.customers; capabilities text[]; violated_constraint text;
BEGIN
 caller:=private.customers_actor(p_office_id,'customers.update'); capabilities:=private.current_permissions(p_office_id);
 IF p_request_id IS NULL OR p_version IS NULL OR p_version NOT BETWEEN 1 AND 2147483646 THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 SELECT * INTO customer FROM public.customers c WHERE c.office_id=p_office_id AND c.id=p_customer_id
  AND (c.created_by=caller OR capabilities @> ARRAY['customers.read_all']) FOR UPDATE;
 IF customer.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF customer.version<>p_version THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409'; END IF;
 normalized:=private.customers_normalize_input(p_customer);
 UPDATE public.customers SET kind=normalized->>'kind',name=normalized->>'name',identifier=normalized->>'identifier',version=version+1,updated_at=clock_timestamp()
  WHERE id=customer.id AND office_id=p_office_id RETURNING * INTO customer;
 DELETE FROM public.customer_contacts WHERE office_id=p_office_id AND customer_id=customer.id;
 INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value)
  SELECT p_office_id,customer.id,(ordinality-1)::smallint,value->>'kind',value->>'value' FROM jsonb_array_elements(normalized->'contacts') WITH ORDINALITY;
 PERFORM private.emit_business_event(p_office_id,'customers.updated','customer',customer.id,p_request_id,'{}');
 RETURN private.customers_detail_record(customer,true);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='customers_office_kind_identifier_idx' THEN RAISE EXCEPTION 'CUSTOMER_DUPLICATE' USING ERRCODE='PT409'; END IF;
 RAISE;
END $$;

CREATE FUNCTION public.customers_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customers_page(p_office_id,p_query,p_page,p_size); $$;
CREATE FUNCTION public.customer_detail(p_office_id uuid,p_customer_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_detail(p_office_id,p_customer_id); $$;
CREATE FUNCTION public.customer_create(p_office_id uuid,p_customer jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_create(p_office_id,p_customer,p_request_id); $$;
CREATE FUNCTION public.customer_update(p_office_id uuid,p_customer_id uuid,p_customer jsonb,p_version integer,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_update(p_office_id,p_customer_id,p_customer,p_version,p_request_id); $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('private','public') AND (p.proname LIKE 'customers_%' OR p.proname IN ('customer_detail','customer_create','customer_update'))
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.customers_page(uuid,text,integer,integer),private.customers_page(uuid,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_detail(uuid,uuid),private.customer_detail(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_create(uuid,jsonb,uuid),private.customer_create(uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_update(uuid,uuid,jsonb,integer,uuid),private.customer_update(uuid,uuid,jsonb,integer,uuid) TO authenticated;
