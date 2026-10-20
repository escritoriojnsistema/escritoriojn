-- Etapa10: additive request workflow. No financial/document effects or account rewrites.
INSERT INTO public.permissions(code,name) VALUES
 ('requests.read','Consultar atendimentos'),('requests.create','Abrir atendimentos'),('requests.update','Atualizar atendimentos'),('requests.transfer','Transferir atendimentos'),('requests.cancel','Cancelar atendimentos'),('requests.read_all','Consultar fila do escritorio') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN ('requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all']);

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE TABLE private.request_counters (
 office_id uuid PRIMARY KEY REFERENCES public.offices(id) ON DELETE RESTRICT,
 last_number bigint NOT NULL CHECK(last_number>0)
);
CREATE TABLE public.requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 protocol text NOT NULL, title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120 AND title=btrim(title) AND title !~ '[[:cntrl:]]'),
 origin text NOT NULL CHECK(origin IN('presencial','whatsapp','portal')),
 status text NOT NULL DEFAULT 'aberto' CHECK(status IN('aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado')),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 assignee_id uuid REFERENCES public.memberships(id) ON DELETE RESTRICT,
 customer_id uuid, priority text NOT NULL CHECK(priority IN('normal','urgent')), priority_reason text NOT NULL DEFAULT '',
 message text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 triaged_at timestamptz, idempotency_key uuid NOT NULL, payload_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,protocol),UNIQUE(office_id,created_by,idempotency_key),
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX requests_office_updated_idx ON public.requests(office_id,updated_at DESC,id DESC);
CREATE INDEX requests_office_creator_idx ON public.requests(office_id,created_by,updated_at DESC);
CREATE INDEX requests_assignee_idx ON public.requests(assignee_id,updated_at DESC);
CREATE INDEX requests_customer_idx ON public.requests(customer_id);
CREATE INDEX requests_creator_idx ON public.requests(created_by);
CREATE TABLE public.request_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,
 service_id uuid NOT NULL,version_id uuid NOT NULL,snapshot jsonb NOT NULL,
 fields jsonb NOT NULL,participant_ids jsonb NOT NULL,checklist jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,service_id,version_id) REFERENCES public.service_versions(office_id,service_id,id) ON DELETE RESTRICT
);
CREATE INDEX request_items_request_idx ON public.request_items(office_id,request_id);
CREATE INDEX request_items_version_idx ON public.request_items(office_id,service_id,version_id);
CREATE TABLE private.request_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,
 membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),ended_at timestamptz,
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX request_assignments_current_idx ON private.request_assignments(office_id,request_id) WHERE ended_at IS NULL;
CREATE INDEX request_assignments_member_idx ON private.request_assignments(membership_id);
CREATE INDEX request_assignments_actor_idx ON private.request_assignments(actor_id);
CREATE TABLE private.request_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('created','status','transfer','note','triage')),actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 reason text NOT NULL DEFAULT '',from_status text,to_status text,from_assignee uuid REFERENCES public.memberships(id) ON DELETE RESTRICT,
 to_assignee uuid REFERENCES public.memberships(id) ON DELETE RESTRICT,cancellation_review jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX request_history_request_idx ON private.request_history(office_id,request_id,created_at DESC,id DESC);
CREATE INDEX request_history_actor_idx ON private.request_history(actor_id);
CREATE INDEX request_history_from_assignee_idx ON private.request_history(from_assignee);
CREATE INDEX request_history_to_assignee_idx ON private.request_history(to_assignee);
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.request_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.request_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.request_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.requests,public.request_items,private.request_counters,private.request_assignments,private.request_history FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.request_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'REQUEST_HISTORY_IMMUTABLE' USING ERRCODE='PT403'; END $$;
CREATE TRIGGER request_items_immutable BEFORE UPDATE OR DELETE ON public.request_items FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER request_history_immutable BEFORE UPDATE OR DELETE ON private.request_history FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.requests_actor(p_office_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS public.memberships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid; m public.memberships; caps text[];
BEGIN
 caller:=private.team_require_identity();
 IF p_write THEN PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 ELSE PERFORM 1 FROM public.offices WHERE id=p_office_id FOR SHARE; END IF;
 caller:=private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active FOR SHARE;
 caller:=private.team_require_identity();caps:=private.current_permissions(p_office_id);
 IF m.id IS NULL OR NOT private.team_user_active(caller,p_office_id) OR NOT caps @> ARRAY['foundation.access']
  OR (m.role_code<>'client' AND (NOT caps @> ARRAY['requests.read'] OR (p_capability IS NOT NULL AND NOT caps @> ARRAY[p_capability])))
  OR (m.role_code='client' AND p_capability IS NOT NULL AND p_capability<>'requests.create') THEN
  RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
END $$;
CREATE FUNCTION private.request_in_scope(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id
 ELSE r.created_by=m.user_id OR r.assignee_id=m.id OR private.current_permissions(r.office_id) @> ARRAY['requests.read_all'] END;
$$;
CREATE FUNCTION private.request_public_status(p_status text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE p_status WHEN 'aberto' THEN 'recebido' WHEN 'aguardando_cliente' THEN 'aguardando_cliente' WHEN 'concluido' THEN 'concluido' WHEN 'cancelado' THEN 'cancelado' ELSE 'em_analise' END;
$$;
CREATE FUNCTION private.request_summary(r public.requests,p_portal boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'protocol',r.protocol,'title',r.title,'public_status',private.request_public_status(r.status),'created_at',r.created_at,'updated_at',r.updated_at)
 ||CASE WHEN p_portal THEN '{}'::jsonb ELSE jsonb_build_object('status',r.status,'origin',r.origin,'priority',r.priority,'created_by',r.created_by,'created_by_name',(SELECT private.customer_relation_display_label(p.display_name) FROM public.profiles p WHERE p.id=r.created_by),'assignee_id',r.assignee_id,
 'assignee_name',(SELECT private.customer_relation_display_label(p.display_name) FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id WHERE m.id=r.assignee_id AND m.office_id=r.office_id),
 'customer_name',(SELECT c.name FROM public.customers c WHERE c.id=r.customer_id AND c.office_id=r.office_id),'version',r.version) END;
$$;
CREATE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caps text[]:=private.current_permissions(r.office_id);closed boolean:=r.status IN('concluido','cancelado');
BEGIN
 IF m.role_code='client' THEN
 RETURN private.request_summary(r,true)||jsonb_build_object('portal',true,'message',r.message,'services',coalesce((SELECT jsonb_agg(i.snapshot->'definition'->>'name' ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb));END IF;
 RETURN private.request_summary(r,false)||jsonb_build_object('portal',false,'customer_id',r.customer_id,'message',r.message,'priority_reason',r.priority_reason,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'snapshot',i.snapshot,'fields',i.fields,'participant_ids',i.participant_ids,'checklist',i.checklist) ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'kind',h.kind,'actor_id',h.actor_id,'actor_name',private.customer_relation_display_label(p.display_name),'reason',h.reason,'from_status',h.from_status,'to_status',h.to_status,'from_assignee',h.from_assignee,'to_assignee',h.to_assignee,'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC)
 FROM (SELECT * FROM private.request_history x WHERE x.office_id=r.office_id AND x.request_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 3 OFFSET (p_page-1)*3) h LEFT JOIN public.profiles p ON p.id=h.actor_id),'[]'::jsonb),
 'history_page',p_page,'history_total',(SELECT count(*) FROM private.request_history h WHERE h.office_id=r.office_id AND h.request_id=r.id),
 'can_update',NOT closed AND caps @> ARRAY['requests.update'],'can_transfer',NOT closed AND caps @> ARRAY['requests.transfer'],'can_cancel',NOT closed AND caps @> ARRAY['requests.cancel']);
END $$;
-- Strict shape/type helpers keep direct RPC calls as constrained as Express.
CREATE FUNCTION private.request_shape(p_value jsonb,p_keys text[]) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT p_value ?& p_keys OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>cardinality(p_keys) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF; END $$;
CREATE FUNCTION private.request_text(p_value jsonb,p_min integer,p_max integer,p_multiline boolean DEFAULT false) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 result:=btrim(p_value#>>'{}');
 IF char_length(result) NOT BETWEEN p_min AND p_max OR (NOT p_multiline AND result ~ '[[:cntrl:]]') OR (p_multiline AND translate(result,E'\n\t','') ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;RETURN result;
END $$;
CREATE FUNCTION private.request_uuid(p_value jsonb,p_nullable boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR p_value#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;RETURN (p_value#>>'{}')::uuid;
END $$;
CREATE FUNCTION private.request_customer(p_office_id uuid,p_customer_id uuid,p_caller uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.customers;
BEGIN
 IF p_customer_id IS NULL THEN RETURN;END IF;
 IF NOT private.current_permissions(p_office_id) @> ARRAY['customers.read'] THEN RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO c FROM public.customers WHERE office_id=p_office_id AND id=p_customer_id FOR SHARE;
 IF c.id IS NULL OR NOT private.customer_in_scope(c,p_caller) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404';END IF;
END $$;
CREATE FUNCTION private.request_assignee(p_office_id uuid,p_member_id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_member_id AND office_id=p_office_id AND active AND role_code<>'client' FOR SHARE;
 IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) OR NOT private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read'] THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
END $$;
CREATE FUNCTION private.request_capture_items(p_office_id uuid,p_request_id uuid,p_customer_id uuid,p_items jsonb,p_member public.memberships,p_capability text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb;s public.services;v public.service_versions;d jsonb;f jsonb;k text;value text;participant jsonb;caps text[];snap jsonb;service_key uuid;quantity numeric;
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.request_customer(p_office_id,p_customer_id,p_member.user_id);
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  PERFORM private.request_shape(item,ARRAY['service_id','quantity','adjustment','fields','participant_ids','checklist']);
  service_key:=private.request_uuid(item->'service_id');
  IF jsonb_typeof(item->'quantity') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  quantity:=(item->>'quantity')::numeric;
  IF quantity<>trunc(quantity) OR quantity NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=service_key FOR SHARE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF jsonb_typeof(item->'fields') IS DISTINCT FROM 'object' OR jsonb_typeof(item->'participant_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(item->'checklist') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  IF jsonb_array_length(item->'participant_ids')>20 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  -- Acquire every potentially blocking participant lock before choosing the
  -- effective catalog version. A scheduled price can become current while waiting.
  FOR participant IN SELECT * FROM jsonb_array_elements(item->'participant_ids') LOOP PERFORM private.request_customer(p_office_id,private.request_uuid(participant),p_member.user_id);END LOOP;
  PERFORM private.requests_actor(p_office_id,true,p_capability);caps:=private.current_permissions(p_office_id);
  IF NOT caps @> ARRAY['services.read','services.perform'] THEN RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT * INTO v FROM public.service_versions WHERE office_id=p_office_id AND service_id=s.id AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1;
  IF v.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_EFFECTIVE' USING ERRCODE='PT409';END IF;d:=v.definition;
  IF (d->>'person_required')::boolean AND p_customer_id IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item->'fields'))>12 OR jsonb_array_length(item->'participant_ids') NOT BETWEEN (d->>'participants_min')::integer AND 20 OR jsonb_array_length(item->'checklist')>12
   OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(item->'participant_ids') x)<>jsonb_array_length(item->'participant_ids')
   OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(item->'checklist') x)<>jsonb_array_length(item->'checklist') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  FOR k IN SELECT jsonb_object_keys(item->'fields') LOOP
   IF k !~ '^[a-z][a-z0-9_]{0,31}$' OR NOT EXISTS(SELECT FROM jsonb_array_elements(d->'fields') x WHERE x->>'key'=k) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
   PERFORM private.request_text(item->'fields'->k,0,500);
  END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(d->'fields') LOOP
   value:=coalesce(item->'fields'->>(f->>'key'),'');
   IF (f->>'required')::boolean AND btrim(value)='' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
   IF value<>'' AND ((f->>'type'='number' AND value !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$') OR (f->>'type'='date' AND value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
   IF value<>'' AND f->>'type'='date' THEN
    BEGIN IF to_char(value::date,'YYYY-MM-DD')<>value THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
    EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END;
   END IF;
  END LOOP;
  FOR participant IN SELECT * FROM jsonb_array_elements(item->'participant_ids') LOOP PERFORM private.request_customer(p_office_id,private.request_uuid(participant),p_member.user_id);END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(item->'checklist') LOOP
   PERFORM private.request_text(f,1,120);IF NOT (d->'checklist' @> jsonb_build_array(f)) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  END LOOP;
  IF NOT (item->'checklist' @> (d->'checklist')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  PERFORM private.requests_actor(p_office_id,true,p_capability);
  PERFORM private.request_customer(p_office_id,p_customer_id,p_member.user_id);
  -- Customer relation/permission revocation is checked after every wait as well.
  FOR participant IN SELECT * FROM jsonb_array_elements(item->'participant_ids') LOOP PERFORM private.request_customer(p_office_id,private.request_uuid(participant),p_member.user_id);END LOOP;
  caps:=private.current_permissions(p_office_id);
  IF NOT caps @> ARRAY['services.read','services.perform'] THEN RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  snap:=private.services_snapshot(s,v,quantity::integer,item->'adjustment',caps);
  INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)
   VALUES(p_office_id,p_request_id,s.id,v.id,snap,item->'fields',item->'participant_ids',item->'checklist');
 END LOOP;
END $$;
CREATE FUNCTION private.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;read_all boolean;
BEGIN
 m:=private.requests_actor(p_office_id);read_all:=private.current_permissions(p_office_id) @> ARRAY['requests.read_all'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_scope IS NULL OR p_scope NOT IN('mine','queue') OR p_status IS NULL OR p_status NOT IN('','aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado','recebido','em_analise') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;q:=lower(btrim(p_query));
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND (CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id ELSE read_all OR r.created_by=m.user_id OR r.assignee_id=m.id END)
  AND (p_scope='queue' OR r.created_by=m.user_id OR r.assignee_id=m.id)
  AND (p_status='' OR CASE WHEN m.role_code='client' THEN private.request_public_status(r.status)=p_status ELSE r.status=p_status END)
  AND (q='' OR strpos(lower(r.title),q)>0 OR strpos(lower(r.protocol),q)>0)),
 paginated AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.request_summary(p,m.role_code='client') ORDER BY p.updated_at DESC,p.id DESC) FROM paginated p),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size,'portal',m.role_code='client');
END $$;
CREATE FUNCTION private.request_detail(p_office_id uuid,p_request_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id AND private.request_in_scope(x,m);
 IF r.id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;RETURN private.request_detail_record(r,m,p_page);
END $$;
CREATE FUNCTION private.request_options(p_office_id uuid,p_kind text,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;catalog_at timestamptz;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_kind IS NULL OR p_kind NOT IN('services','customers','assignees') OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;q:=lower(btrim(p_query));catalog_at:=clock_timestamp();
 IF p_kind='services' THEN
  IF NOT private.current_permissions(p_office_id) @> ARRAY['services.read'] THEN RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  WITH candidates AS(SELECT s.id,v.definition,v.definition->>'name' AS name,s.code FROM public.services s CROSS JOIN LATERAL(SELECT ver.definition FROM public.service_versions ver WHERE ver.office_id=s.office_id AND ver.service_id=s.id AND ver.effective_from<=catalog_at ORDER BY ver.effective_from DESC LIMIT 1)v
   WHERE s.office_id=p_office_id AND(q='' OR strpos(lower(v.definition->>'name'),q)>0 OR strpos(lower(s.code),q)>0)),paginated AS(SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.name||' · '||p.code,'definition',p.definition) ORDER BY name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 ELSIF p_kind='customers' THEN
  IF NOT private.current_permissions(p_office_id) @> ARRAY['customers.read'] THEN RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  WITH candidates AS(SELECT c.id,c.name FROM public.customers c WHERE c.office_id=p_office_id AND private.customer_in_scope(c,m.user_id) AND(q='' OR strpos(lower(c.name),q)>0)),paginated AS(SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.name) ORDER BY name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 ELSE
  WITH candidates AS(SELECT a.id,private.customer_relation_display_label(p.display_name) AS name FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=p_office_id AND a.active AND a.role_code<>'client' AND private.team_user_active(a.user_id,p_office_id) AND private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read'] AND(q='' OR strpos(lower(coalesce(p.display_name,'')),q)>0)),paginated AS(SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',coalesce(p.name,'Membro da equipe')) ORDER BY name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 END IF;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;assignee uuid;customer uuid;title_text text;reason_text text;message_text text:='';note_text text:='';protocol_number bigint;payload_hash text;
BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF p_idempotency_key IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF m.role_code='client' AND p_request->>'origin' IS DISTINCT FROM 'portal' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF m.role_code<>'client' AND (p_request->>'origin' IS NULL OR p_request->>'origin' NOT IN('presencial','whatsapp')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 title_text:=private.request_text(p_request->'title',1,120);
 IF m.role_code='client' THEN PERFORM private.request_shape(p_request,ARRAY['origin','title','message']);message_text:=private.request_text(p_request->'message',1,2000,true);
 ELSE
  PERFORM private.request_shape(p_request,ARRAY['origin','title','customer_id','assignee_id','priority','priority_reason','items','internal_note']);
  IF jsonb_typeof(p_request->'priority') IS DISTINCT FROM 'string' OR p_request->>'priority' NOT IN('normal','urgent') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  reason_text:=private.request_text(p_request->'priority_reason',CASE WHEN p_request->>'priority'='urgent' THEN 1 ELSE 0 END,500);
  IF p_request->>'priority'='normal' AND reason_text<>'' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  customer:=private.request_uuid(p_request->'customer_id',true);assignee:=coalesce(private.request_uuid(p_request->'assignee_id',true),m.id);
  note_text:=private.request_text(p_request->'internal_note',0,2000,true);
 END IF;
 payload_hash:=encode(extensions.digest(p_request::text,'sha256'),'hex');
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key;
 IF r.id IS NOT NULL THEN
  IF r.payload_digest<>payload_hash THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.request_detail_record(r,m,1);
 END IF;
 IF m.role_code<>'client' THEN PERFORM private.request_assignee(p_office_id,assignee);PERFORM private.request_customer(p_office_id,customer,m.user_id);END IF;
 INSERT INTO private.request_counters(office_id,last_number)VALUES(p_office_id,1)ON CONFLICT(office_id)DO UPDATE SET last_number=private.request_counters.last_number+1 RETURNING last_number INTO protocol_number;
 INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,customer_id,priority,priority_reason,message,idempotency_key,payload_digest,triaged_at)
 VALUES(p_office_id,'AT-'||lpad(protocol_number::text,greatest(6,char_length(protocol_number::text)), '0'),title_text,p_request->>'origin',m.user_id,assignee,customer,CASE WHEN m.role_code='client' THEN 'normal' ELSE p_request->>'priority' END,coalesce(reason_text,''),message_text,p_idempotency_key,payload_hash,CASE WHEN m.role_code='client' THEN NULL ELSE clock_timestamp() END)RETURNING * INTO r;
 IF m.role_code<>'client' THEN
  PERFORM private.request_capture_items(p_office_id,r.id,customer,p_request->'items',m,'requests.create');PERFORM private.request_assignee(p_office_id,assignee);
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES(p_office_id,r.id,assignee,m.user_id);
 END IF;
 m:=private.requests_actor(p_office_id,true,'requests.create');
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,to_status,to_assignee)VALUES(p_office_id,r.id,'created',m.user_id,note_text,'aberto',assignee);
 PERFORM private.emit_business_event(p_office_id,'requests.created','request',r.id,p_request_id,'{}');
 RETURN private.request_detail_record(r,m,1);
END $$;
CREATE FUNCTION private.request_mutate(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_mutation jsonb,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;kind text;capability text;reason_text text;next_assignee uuid;customer uuid;next_status text;old_status text;old_assignee uuid;review jsonb;
BEGIN
 m:=private.requests_actor(p_office_id,true);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_event_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(p_mutation) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=p_mutation->>'kind';
 IF kind IS NULL OR kind NOT IN('status','transfer','note','triage') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 capability:=CASE WHEN kind='transfer' THEN 'requests.transfer' WHEN kind='status' AND p_mutation->>'status'='cancelado' THEN 'requests.cancel' ELSE 'requests.update' END;
 m:=private.requests_actor(p_office_id,true,capability);
 SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id AND private.request_in_scope(x,m) FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,capability);
 IF r.id IS NULL OR NOT private.request_in_scope(r,m) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF r.version<>p_expected_version OR r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 old_status:=r.status;old_assignee:=r.assignee_id;
 IF kind='status' THEN
  next_status:=p_mutation->>'status';
  IF next_status IS NULL OR next_status NOT IN('aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  IF next_status='cancelado' THEN
   PERFORM private.request_shape(p_mutation,ARRAY['kind','status','reason','cancellation_review']);review:=p_mutation->'cancellation_review';
   PERFORM private.request_shape(review,ARRAY['charges_reviewed','refunds_reviewed','deliveries_reviewed','external_reviewed']);
   IF review<>'{"charges_reviewed":true,"refunds_reviewed":true,"deliveries_reviewed":true,"external_reviewed":true}'::jsonb THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  ELSE PERFORM private.request_shape(p_mutation,ARRAY['kind','status','reason']);END IF;
  reason_text:=private.request_text(p_mutation->'reason',1,500);
  IF next_status=r.status OR (r.triaged_at IS NULL AND next_status='concluido') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;r.status:=next_status;
 ELSIF kind='note' THEN
  PERFORM private.request_shape(p_mutation,ARRAY['kind','note']);reason_text:=private.request_text(p_mutation->'note',1,2000,true);
 ELSIF kind='transfer' THEN
  PERFORM private.request_shape(p_mutation,ARRAY['kind','assignee_id','reason']);reason_text:=private.request_text(p_mutation->'reason',1,500);next_assignee:=private.request_uuid(p_mutation->'assignee_id');
  PERFORM private.request_assignee(p_office_id,next_assignee);
  IF next_assignee IS NOT DISTINCT FROM r.assignee_id THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;r.assignee_id:=next_assignee;
 ELSE
  PERFORM private.request_shape(p_mutation,ARRAY['kind','customer_id','items','reason']);reason_text:=private.request_text(p_mutation->'reason',1,500);
  IF r.origin<>'portal' OR r.triaged_at IS NOT NULL OR EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id)THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
  customer:=private.request_uuid(p_mutation->'customer_id',true);PERFORM private.request_capture_items(p_office_id,r.id,customer,p_mutation->'items',m,capability);r.customer_id:=customer;r.triaged_at:=clock_timestamp();r.status:='em_atendimento';IF r.assignee_id IS NULL THEN r.assignee_id:=m.id;PERFORM private.request_assignee(p_office_id,m.id);END IF;
 END IF;
 m:=private.requests_actor(p_office_id,true,capability);
 -- r still carries the proposed new assignee: check original scope after all waits.
 IF NOT (r.created_by=m.user_id OR old_assignee=m.id OR private.current_permissions(p_office_id) @> ARRAY['requests.read_all']) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF kind='triage' AND old_assignee IS NULL THEN
  PERFORM private.request_assignee(p_office_id,r.assignee_id);
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES(p_office_id,r.id,r.assignee_id,m.user_id);
 END IF;
 IF kind='transfer' THEN
  PERFORM private.request_assignee(p_office_id,next_assignee);
  UPDATE private.request_assignments SET ended_at=clock_timestamp()WHERE office_id=p_office_id AND request_id=r.id AND ended_at IS NULL;
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES(p_office_id,r.id,next_assignee,m.user_id);
 END IF;
 UPDATE public.requests SET status=r.status,assignee_id=r.assignee_id,customer_id=r.customer_id,triaged_at=r.triaged_at,version=version+1,updated_at=clock_timestamp()WHERE office_id=p_office_id AND id=r.id RETURNING * INTO r;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status,from_assignee,to_assignee,cancellation_review)VALUES(p_office_id,r.id,kind,m.user_id,reason_text,old_status,r.status,old_assignee,r.assignee_id,review);
 PERFORM private.emit_business_event(p_office_id,'requests.'||CASE kind WHEN 'status' THEN 'status_changed' WHEN 'transfer' THEN 'transferred' WHEN 'note' THEN 'note_added' ELSE 'triaged' END,'request',r.id,p_event_id,'{}');
 IF NOT private.request_in_scope(r,m) THEN RETURN '{"access_lost":true}'::jsonb;END IF;
 RETURN private.request_detail_record(r,m,1);
END $$;
CREATE FUNCTION public.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.requests_page(p_office_id,p_query,p_scope,p_status,p_page,p_size); $$;
CREATE FUNCTION public.request_detail(p_office_id uuid,p_request_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_detail(p_office_id,p_request_id,p_page); $$;
CREATE FUNCTION public.request_options(p_office_id uuid,p_kind text,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_options(p_office_id,p_kind,p_query,p_page,p_size); $$;
CREATE FUNCTION public.request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_create(p_office_id,p_request,p_idempotency_key,p_request_id); $$;
CREATE FUNCTION public.request_mutate(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_mutation jsonb,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_mutate(p_office_id,p_request_id,p_expected_version,p_mutation,p_event_id); $$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND(p.proname LIKE 'requests_%' OR p.proname LIKE 'request_%')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.requests_page(uuid,text,text,text,integer,integer),private.requests_page(uuid,text,text,text,integer,integer),public.request_detail(uuid,uuid,integer),private.request_detail(uuid,uuid,integer),public.request_options(uuid,text,text,integer,integer),private.request_options(uuid,text,text,integer,integer),public.request_create(uuid,jsonb,uuid,uuid),private.request_create(uuid,jsonb,uuid,uuid),public.request_mutate(uuid,uuid,integer,jsonb,uuid),private.request_mutate(uuid,uuid,integer,jsonb,uuid)TO authenticated;

-- Composite office FKs defend tenant consistency even against accidental internal writes.
ALTER TABLE public.requests ADD CONSTRAINT requests_assignee_office_fk FOREIGN KEY(office_id,assignee_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT;
ALTER TABLE private.request_assignments ADD CONSTRAINT request_assignments_member_office_fk FOREIGN KEY(office_id,membership_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT;
CREATE FUNCTION private.request_record_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status IN('concluido','cancelado') OR OLD.created_by IS DISTINCT FROM NEW.created_by OR OLD.office_id IS DISTINCT FROM NEW.office_id OR OLD.protocol IS DISTINCT FROM NEW.protocol OR OLD.origin IS DISTINCT FROM NEW.origin OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key OR OLD.payload_digest IS DISTINCT FROM NEW.payload_digest OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.request_record_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER request_record_guard BEFORE UPDATE OR DELETE ON public.requests FOR EACH ROW EXECUTE FUNCTION private.request_record_guard();
