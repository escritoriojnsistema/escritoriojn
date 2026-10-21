-- Etapa11: private, two-phase attachments. No scanner release, hosted cleanup or account rewrites.
INSERT INTO public.permissions(code,name) VALUES('files.read','Consultar anexos'),('files.upload','Enviar anexos'),('files.copy','Copiar anexos'),('files.manage','Gerenciar anexos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('files.read','files.upload','files.copy','files.manage') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage']);

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

-- Add a tenant/request/item identity without changing immutable item snapshots.
ALTER TABLE public.request_items ADD CONSTRAINT request_items_office_request_id_key UNIQUE(office_id,request_id,id);
CREATE TABLE public.files(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,request_item_id uuid,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180 AND name !~ '[[:cntrl:]/\\<>:"|?*]' AND name=btrim(name) AND left(name,1)<>'.' AND name !~ U&'[\202A-\202E\2066-\2069]'),
 mime_type text NOT NULL CHECK(mime_type IN('application/pdf','image/png','image/jpeg')),
 size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 classification text NOT NULL CHECK(classification IN('documento','identificacao','comprovante')),
 status text NOT NULL DEFAULT 'aguardando_upload' CHECK(status IN('aguardando_upload','quarentena','disponivel','rejeitado','removido')),
 scanner_status text NOT NULL DEFAULT 'not_configured' CHECK(scanner_status IN('not_configured','pending','clean','infected')),
 validation_reason text CHECK(validation_reason IN('hash_mismatch','type_mismatch','size_mismatch','invalid_content','object_missing','storage_error')),
 validation_tool text,validated_at timestamptz,actual_sha256 text,actual_size_bytes bigint,actual_mime_type text,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 protected boolean NOT NULL DEFAULT false,legal_hold boolean NOT NULL DEFAULT false,retain_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,request_id,id),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,request_id,request_item_id) REFERENCES public.request_items(office_id,request_id,id) ON DELETE RESTRICT,
 CHECK(status<>'disponivel' OR scanner_status='clean')
);
CREATE INDEX files_request_idx ON public.files(office_id,request_id,created_at DESC,id);
CREATE INDEX files_item_idx ON public.files(office_id,request_id,request_item_id);
CREATE INDEX files_author_idx ON public.files(created_by);
CREATE TABLE private.upload_intents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,request_item_id uuid,file_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,session_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 100),payload_digest text NOT NULL,
 bucket text NOT NULL DEFAULT 'request-attachments' CHECK(bucket='request-attachments'),object_path text NOT NULL UNIQUE,
 policy_snapshot jsonb NOT NULL,source_file_id uuid,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '15 minutes'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,file_id),UNIQUE(office_id,created_by,idempotency_key),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,request_id,request_item_id) REFERENCES public.request_items(office_id,request_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,request_id,file_id) REFERENCES public.files(office_id,request_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,source_file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT,
 CHECK(object_path=office_id::text||'/'||id::text||'/'||split_part(object_path,'/',3) AND split_part(object_path,'/',3) ~ '^[0-9a-f-]{36}$')
);
CREATE INDEX upload_intents_request_idx ON private.upload_intents(office_id,request_id);
CREATE INDEX upload_intents_item_idx ON private.upload_intents(office_id,request_id,request_item_id);
CREATE INDEX upload_intents_file_idx ON private.upload_intents(office_id,request_id,file_id);
CREATE INDEX upload_intents_source_idx ON private.upload_intents(office_id,source_file_id);
CREATE INDEX upload_intents_author_idx ON private.upload_intents(created_by);
CREATE TABLE private.file_service_policies(
 office_id uuid NOT NULL,service_id uuid NOT NULL,version integer NOT NULL CHECK(version>1),
 max_bytes bigint NOT NULL CHECK(max_bytes BETWEEN 1 AND 10485760),mime_types text[] NOT NULL,
 updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,service_id),FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id) ON DELETE RESTRICT,
 CHECK(cardinality(mime_types) BETWEEN 1 AND 3 AND mime_types <@ ARRAY['application/pdf','image/png','image/jpeg'])
);
CREATE INDEX file_policies_author_idx ON private.file_service_policies(updated_by);
CREATE TABLE private.file_cleanup_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,session_id uuid NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '15 minutes'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 orphan_count integer NOT NULL DEFAULT 0,UNIQUE(office_id,id)
);
CREATE INDEX file_cleanup_office_idx ON private.file_cleanup_plans(office_id);
CREATE INDEX file_cleanup_author_idx ON private.file_cleanup_plans(created_by);
CREATE TABLE private.file_cleanup_reservations(
 file_id uuid PRIMARY KEY,office_id uuid NOT NULL,plan_id uuid NOT NULL,removed_at timestamptz,
 FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,plan_id) REFERENCES private.file_cleanup_plans(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX file_cleanup_reservation_file_idx ON private.file_cleanup_reservations(office_id,file_id);
CREATE INDEX file_cleanup_reservation_plan_idx ON private.file_cleanup_reservations(office_id,plan_id);
CREATE TABLE private.file_references(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,file_id uuid NOT NULL,reference_kind text NOT NULL CHECK(length(reference_kind) BETWEEN 1 AND 60),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX file_references_file_idx ON private.file_references(office_id,file_id);
CREATE TABLE private.file_process_leases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,session_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN('validate','copy','cleanup')),target_id uuid NOT NULL,token text NOT NULL DEFAULT gen_random_uuid()::text,
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '5 minutes'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 objects jsonb NOT NULL,result jsonb,completed_at timestamptz,UNIQUE(office_id,actor_id,session_id,action,target_id)
);
CREATE INDEX file_leases_office_idx ON private.file_process_leases(office_id);
CREATE INDEX file_leases_actor_idx ON private.file_process_leases(actor_id);
CREATE INDEX file_leases_active_idx ON private.file_process_leases(office_id,target_id,expires_at) WHERE completed_at IS NULL;
DO $$DECLARE t regclass;BEGIN FOREACH t IN ARRAY ARRAY['public.files'::regclass,'private.upload_intents'::regclass,'private.file_service_policies'::regclass,'private.file_cleanup_plans'::regclass,'private.file_cleanup_reservations'::regclass,'private.file_references'::regclass,'private.file_process_leases'::regclass] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;

CREATE FUNCTION private.files_actor(p_office_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS public.memberships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;caps text[];
BEGIN
 m:=private.requests_actor(p_office_id,p_write);caps:=private.current_permissions(p_office_id);
 IF m.role_code<>'client' AND (NOT caps @> ARRAY['files.read','requests.read'] OR (p_capability IS NOT NULL AND NOT caps @> ARRAY[p_capability]))
 OR(m.role_code='client' AND p_capability IS NOT NULL AND p_capability<>'files.upload') THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
EXCEPTION WHEN SQLSTATE 'PT403' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END $$;
CREATE FUNCTION private.files_request(p_office_id uuid,p_request_id uuid,m public.memberships,p_write boolean DEFAULT false) RETURNS public.requests
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;
BEGIN
 IF p_write THEN SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id FOR UPDATE;
 ELSE SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id FOR SHARE;END IF;
 PERFORM private.files_actor(p_office_id,p_write);
 IF r.id IS NULL OR (private.request_in_scope(r,m) IS NOT TRUE) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN r;
END $$;
CREATE FUNCTION private.files_policy_record(p_office_id uuid,p_service_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('max_bytes',max_bytes,'mime_types',mime_types,'version',version) FROM private.file_service_policies WHERE office_id=p_office_id AND service_id=p_service_id),jsonb_build_object('max_bytes',10485760,'mime_types',ARRAY['application/pdf','image/png','image/jpeg'],'version',1));
$$;
CREATE FUNCTION private.files_file_json(f public.files,m public.memberships) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'request_id',f.request_id,'request_item_id',f.request_item_id,'name',f.name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'sha256',f.sha256,'classification',f.classification,'status',f.status,'scanner_status',f.scanner_status,'validation_reason',f.validation_reason,'created_at',f.created_at,'updated_at',f.updated_at,
 'intent_id',(SELECT i.id FROM private.upload_intents i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.file_id=f.id AND i.source_file_id IS NULL AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) AND i.created_by=m.user_id AND (m.role_code='client' OR private.current_permissions(f.office_id) @> ARRAY['files.upload']) AND i.session_id::text=auth.jwt()->>'session_id' AND i.expires_at>clock_timestamp() AND f.status='aguardando_upload' AND r.status NOT IN('concluido','cancelado')),'can_validate',f.status='aguardando_upload' AND EXISTS(SELECT FROM private.upload_intents i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.file_id=f.id AND i.source_file_id IS NULL AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) AND i.created_by=m.user_id AND (m.role_code='client' OR private.current_permissions(f.office_id) @> ARRAY['files.upload']) AND i.session_id::text=auth.jwt()->>'session_id' AND i.expires_at>clock_timestamp() AND r.status NOT IN('concluido','cancelado')),
 'can_download',f.status='disponivel' AND f.scanner_status='clean',
 'can_copy',m.role_code<>'client' AND f.status='disponivel' AND f.scanner_status='clean' AND private.current_permissions(f.office_id) @> ARRAY['files.copy','files.upload']);
$$;
CREATE FUNCTION private.files_object_json(f public.files,i private.upload_intents) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('file_id',f.id,'intent_id',i.id,'bucket',i.bucket,'object_path',i.object_path,'name',f.name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'sha256',f.sha256)
 ||CASE WHEN i.source_file_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('source_path',(SELECT object_path FROM private.upload_intents WHERE file_id=i.source_file_id AND office_id=i.office_id)) END;
$$;
CREATE FUNCTION private.files_page(p_office_id uuid,p_request_id uuid,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;r public.requests;answer jsonb;
BEGIN
 m:=private.files_actor(p_office_id);
 IF p_page IS NULL OR p_page<1 OR p_page>10000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_request_id IS NOT NULL THEN r:=private.files_request(p_office_id,p_request_id,m);END IF;
 WITH candidates AS(SELECT f.* FROM public.files f JOIN public.requests r ON r.office_id=f.office_id AND r.id=f.request_id WHERE f.office_id=p_office_id AND (p_request_id IS NULL OR f.request_id=p_request_id) AND private.request_in_scope(r,m) AND(m.role_code<>'client' OR f.created_by=m.user_id)),page AS(SELECT * FROM candidates ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.files_file_json(p,m) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb),'total',(SELECT count(*) FROM candidates),'page',p_page,'page_size',p_size,'portal',m.role_code='client') INTO answer;
 RETURN answer;
END $$;
CREATE FUNCTION private.files_requests_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;q text:=lower(btrim(coalesce(p_query,'')));answer jsonb;
BEGIN
 m:=private.files_actor(p_office_id);
 IF length(q)>100 OR p_page IS NULL OR p_page<1 OR p_page>10000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m) AND(q='' OR strpos(lower(r.title||' '||r.protocol),q)>0)),page AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.protocol||' · '||r.title,'closed',r.status IN('concluido','cancelado'),'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'service_id',i.service_id,'name',private.customer_relation_display_label(i.snapshot->'definition'->>'name'),'policy',private.files_policy_record(i.office_id,i.service_id)) ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb)) ORDER BY r.updated_at DESC,r.id DESC) FROM page r),'[]'::jsonb),'total',(SELECT count(*) FROM candidates),'page',p_page,'page_size',p_size) INTO answer;
 RETURN answer;
END $$;
CREATE FUNCTION private.files_begin_upload(p_office_id uuid,p_input jsonb,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;r public.requests;i private.upload_intents;f public.files;item public.request_items;policy jsonb;intent_id uuid:=gen_random_uuid();input_hash text;key text;can_upload boolean;
BEGIN
 m:=private.files_actor(p_office_id,true,'files.upload');
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_input))<>8 OR NOT p_input ?& ARRAY['request_id','request_item_id','name','mime_type','size_bytes','sha256','classification','idempotency_key'] OR p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_typeof(p_input->'request_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'request_item_id') NOT IN('string','null') OR jsonb_typeof(p_input->'sha256') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'mime_type') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'classification') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'size_bytes') IS DISTINCT FROM 'number' OR jsonb_typeof(p_input->'name') IS DISTINCT FROM 'string' OR length(p_input->>'name') NOT BETWEEN 1 AND 180 OR p_input->>'name' ~ '[[:cntrl:]/\\<>:"|?*]' OR p_input->>'name'<>btrim(p_input->>'name') OR left(p_input->>'name',1)='.' OR p_input->>'name' ~ U&'[\202A-\202E\2066-\2069]' OR p_input->>'sha256' !~ '^[0-9a-f]{64}$' OR p_input->>'mime_type' NOT IN('application/pdf','image/png','image/jpeg') OR p_input->>'classification' NOT IN('documento','identificacao','comprovante') OR coalesce(p_input->>'size_bytes','') !~ '^[0-9]{1,8}$' OR (p_input->>'size_bytes')::bigint NOT BETWEEN 1 AND 10485760 OR jsonb_typeof(p_input->'idempotency_key') IS DISTINCT FROM 'string' OR length(p_input->>'idempotency_key') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT ((p_input->>'mime_type'='application/pdf' AND lower(p_input->>'name') ~ '\.pdf$') OR (p_input->>'mime_type'='image/png' AND lower(p_input->>'name') ~ '\.png$') OR (p_input->>'mime_type'='image/jpeg' AND lower(p_input->>'name') ~ '\.jpe?g$')) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 r:=private.files_request(p_office_id,(p_input->>'request_id')::uuid,m,true);m:=private.files_actor(p_office_id,true,'files.upload');
 IF r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id) THEN
  SELECT * INTO item FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND id=(p_input->>'request_item_id')::uuid;
  IF item.id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 ELSIF p_input->>'request_item_id' IS NOT NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 input_hash:=encode(extensions.digest(p_input::text,'sha256'),'hex');key:=p_input->>'idempotency_key';
 SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=key FOR UPDATE;
 IF i.id IS NOT NULL THEN
  IF i.payload_digest<>input_hash THEN RAISE EXCEPTION 'FILE_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT * INTO f FROM public.files WHERE id=i.file_id AND office_id=p_office_id FOR UPDATE;
 ELSE
 policy:=private.files_policy_record(p_office_id,item.service_id);
 IF (p_input->>'size_bytes')::bigint>(policy->>'max_bytes')::bigint OR NOT(policy->'mime_types' ? (p_input->>'mime_type')) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  INSERT INTO public.files(office_id,request_id,request_item_id,name,mime_type,size_bytes,sha256,classification,created_by) VALUES(p_office_id,r.id,item.id,p_input->>'name',p_input->>'mime_type',(p_input->>'size_bytes')::bigint,p_input->>'sha256',p_input->>'classification',m.user_id) RETURNING * INTO f;
  INSERT INTO private.upload_intents(id,office_id,request_id,request_item_id,file_id,created_by,session_id,idempotency_key,payload_digest,object_path,policy_snapshot) VALUES(intent_id,p_office_id,r.id,item.id,f.id,m.user_id,(auth.jwt()->>'session_id')::uuid,key,input_hash,p_office_id::text||'/'||intent_id::text||'/'||gen_random_uuid()::text,policy) RETURNING * INTO i;
  PERFORM private.team_audit(p_office_id,m.user_id,'files.upload_intended','file',f.id,p_event_id,'{}');
 END IF;
 can_upload:=f.status='aguardando_upload' AND i.source_file_id IS NULL AND i.session_id::text=auth.jwt()->>'session_id' AND i.expires_at>clock_timestamp() AND NOT EXISTS(SELECT FROM storage.objects WHERE bucket_id=i.bucket AND name=i.object_path) AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id);
 RETURN jsonb_build_object('file',private.files_file_json(f,m),'intent_id',i.id,'bucket',i.bucket,'object_path',i.object_path,'expires_at',i.expires_at,'can_upload',can_upload);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END $$;
CREATE FUNCTION private.files_download(p_office_id uuid,p_file_id uuid,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;r public.requests;f public.files;i private.upload_intents;
BEGIN
 m:=private.files_actor(p_office_id);SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id;
 IF f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 r:=private.files_request(p_office_id,f.request_id,m);SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id FOR SHARE;
 m:=private.files_actor(p_office_id);IF m.role_code='client' AND f.created_by<>m.user_id THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF f.status<>'disponivel' OR f.scanner_status<>'clean' OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
 SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND file_id=f.id;
 PERFORM private.team_audit(p_office_id,m.user_id,'files.download_authorized','file',f.id,p_event_id,'{}');
 RETURN jsonb_build_object('bucket',i.bucket,'object_path',i.object_path,'name',f.name,'mime_type',f.mime_type);
END $$;
CREATE FUNCTION private.files_policy_get(p_office_id uuid,p_service_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;
BEGIN
 m:=private.files_actor(p_office_id);
 IF m.role_code='client' OR NOT private.current_permissions(p_office_id) @> ARRAY['files.manage','services.manage'] THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT EXISTS(SELECT FROM public.services WHERE office_id=p_office_id AND id=p_service_id) THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.files_policy_record(p_office_id,p_service_id);
END $$;
CREATE FUNCTION private.files_policy_set(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_max_bytes bigint,p_mime_types text[],p_reason text,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;current_policy jsonb;
BEGIN
 m:=private.files_actor(p_office_id,true,'files.manage');
 IF m.role_code='client' OR NOT private.current_permissions(p_office_id) @> ARRAY['services.manage'] THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM 1 FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR UPDATE;
 m:=private.files_actor(p_office_id,true,'files.manage');IF NOT private.current_permissions(p_office_id) @> ARRAY['services.manage'] THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT FOUND OR NOT EXISTS(SELECT FROM public.services WHERE office_id=p_office_id AND id=p_service_id) THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_max_bytes IS NULL OR p_max_bytes NOT BETWEEN 1 AND 10485760 OR p_mime_types IS NULL OR cardinality(p_mime_types) NOT BETWEEN 1 AND 3 OR NOT p_mime_types <@ ARRAY['application/pdf','image/png','image/jpeg'] OR cardinality(p_mime_types)<>(SELECT count(DISTINCT x) FROM unnest(p_mime_types)x) OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 OR p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 current_policy:=private.files_policy_record(p_office_id,p_service_id);
 IF p_expected_version IS DISTINCT FROM (current_policy->>'version')::integer THEN RAISE EXCEPTION 'FILE_POLICY_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.file_service_policies(office_id,service_id,version,max_bytes,mime_types,updated_by)VALUES(p_office_id,p_service_id,p_expected_version+1,p_max_bytes,p_mime_types,m.user_id)ON CONFLICT(office_id,service_id)DO UPDATE SET version=excluded.version,max_bytes=excluded.max_bytes,mime_types=excluded.mime_types,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 PERFORM private.team_audit(p_office_id,m.user_id,'files.policy_updated','service',p_service_id,p_event_id,'{}');
 RETURN private.files_policy_record(p_office_id,p_service_id);
END $$;
CREATE FUNCTION private.files_reference_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE request_uuid uuid;
BEGIN
 PERFORM 1 FROM public.offices WHERE id=NEW.office_id FOR NO KEY UPDATE;
 SELECT request_id INTO request_uuid FROM public.files WHERE office_id=NEW.office_id AND id=NEW.file_id;
 PERFORM 1 FROM public.requests WHERE office_id=NEW.office_id AND id=request_uuid FOR UPDATE;
 PERFORM 1 FROM public.files WHERE office_id=NEW.office_id AND id=NEW.file_id FOR UPDATE;
 IF EXISTS(SELECT FROM private.file_cleanup_reservations WHERE office_id=NEW.office_id AND file_id=NEW.file_id) THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER file_reference_guard BEFORE INSERT OR UPDATE ON private.file_references FOR EACH ROW EXECUTE FUNCTION private.files_reference_guard();
CREATE FUNCTION private.files_retention_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF(NEW.protected OR NEW.legal_hold OR NEW.retain_until>clock_timestamp()) AND EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=NEW.id) THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END $$;
CREATE TRIGGER file_retention_guard BEFORE UPDATE OF protected,legal_hold,retain_until ON public.files FOR EACH ROW EXECUTE FUNCTION private.files_retention_guard();
CREATE FUNCTION private.files_cleanup_eligible(f public.files) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT NOT f.protected AND NOT f.legal_hold AND(f.retain_until IS NULL OR f.retain_until<=clock_timestamp())
 AND(f.status='rejeitado' OR(f.status='aguardando_upload' AND EXISTS(SELECT FROM private.upload_intents WHERE file_id=f.id AND expires_at<=clock_timestamp())))
 AND NOT EXISTS(SELECT FROM private.file_references WHERE office_id=f.office_id AND file_id=f.id)
 AND NOT EXISTS(SELECT FROM private.upload_intents WHERE office_id=f.office_id AND source_file_id=f.id)
 AND NOT EXISTS(SELECT FROM private.file_process_leases WHERE office_id=f.office_id AND completed_at IS NULL AND expires_at>clock_timestamp() AND objects @> jsonb_build_array(jsonb_build_object('file_id',f.id)));
$$;
CREATE FUNCTION private.files_cleanup_plan(p_office_id uuid,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;plan private.file_cleanup_plans;f public.files;orphans integer;count_files integer;items jsonb;
BEGIN
 m:=private.files_actor(p_office_id,true,'files.manage');
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 -- Existing reservations remain exact and recoverable. Never expire a deletion reservation silently.
 SELECT p.* INTO plan FROM private.file_cleanup_plans p WHERE office_id=p_office_id AND(created_by=m.user_id OR m.role_code='owner') AND EXISTS(SELECT FROM private.file_cleanup_reservations WHERE plan_id=p.id AND removed_at IS NULL) ORDER BY (created_by=m.user_id) DESC,created_at LIMIT 1 FOR UPDATE;
 IF plan.id IS NOT NULL THEN
  -- Reviewed names remain private after a transfer, including retries by the original planner.
  PERFORM 1 FROM public.requests r WHERE r.office_id=p_office_id AND EXISTS(SELECT FROM public.files f JOIN private.file_cleanup_reservations x ON x.file_id=f.id WHERE f.request_id=r.id AND x.plan_id=plan.id AND x.removed_at IS NULL) ORDER BY r.id FOR UPDATE;
  m:=private.files_actor(p_office_id,true,'files.manage');
  IF EXISTS(SELECT FROM private.file_cleanup_reservations x JOIN public.files f ON f.id=x.file_id JOIN public.requests r ON r.id=f.request_id AND r.office_id=f.office_id WHERE x.plan_id=plan.id AND x.removed_at IS NULL AND (private.request_in_scope(r,m) IS NOT TRUE)) THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF plan.created_by<>m.user_id THEN
   IF m.role_code<>'owner' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
   UPDATE private.file_process_leases SET token=gen_random_uuid()::text,expires_at=clock_timestamp() WHERE action='cleanup' AND target_id=plan.id AND completed_at IS NULL;
   PERFORM private.team_audit(p_office_id,m.user_id,'files.cleanup_taken_over','file_cleanup',plan.id,p_event_id,'{}');
  END IF;
  UPDATE private.file_cleanup_plans SET created_by=m.user_id,session_id=(auth.jwt()->>'session_id')::uuid,expires_at=clock_timestamp()+interval '15 minutes' WHERE id=plan.id RETURNING * INTO plan;
 ELSE
  SELECT count(*) INTO orphans FROM storage.objects o WHERE o.bucket_id='request-attachments' AND split_part(o.name,'/',1)=p_office_id::text AND NOT EXISTS(SELECT FROM private.upload_intents i WHERE i.bucket=o.bucket_id AND i.object_path=o.name);
  INSERT INTO private.file_cleanup_plans(office_id,created_by,session_id,orphan_count)VALUES(p_office_id,m.user_id,(auth.jwt()->>'session_id')::uuid,orphans)RETURNING * INTO plan;
  -- Office lock serializes app writers; order request locks before file locks.
  PERFORM 1 FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m) ORDER BY r.id FOR UPDATE;
  m:=private.files_actor(p_office_id,true,'files.manage');
  FOR f IN SELECT f.* FROM public.files f JOIN public.requests r ON r.office_id=f.office_id AND r.id=f.request_id WHERE f.office_id=p_office_id AND private.request_in_scope(r,m) AND private.files_cleanup_eligible(f) AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) ORDER BY f.id LIMIT 20 FOR UPDATE OF f LOOP
   IF private.files_cleanup_eligible(f) THEN INSERT INTO private.file_cleanup_reservations(file_id,office_id,plan_id)VALUES(f.id,p_office_id,plan.id);END IF;
  END LOOP;
  PERFORM private.team_audit(p_office_id,m.user_id,'files.cleanup_planned','file_cleanup',plan.id,p_event_id,jsonb_build_object('count',(SELECT count(*) FROM private.file_cleanup_reservations WHERE plan_id=plan.id)));
 END IF;
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'status',f.status) ORDER BY f.id),'[]'::jsonb) INTO count_files,items
 FROM private.file_cleanup_reservations x JOIN public.files f ON f.office_id=x.office_id AND f.id=x.file_id WHERE x.office_id=p_office_id AND x.plan_id=plan.id AND x.removed_at IS NULL;
 RETURN jsonb_build_object('id',plan.id,'expires_at',plan.expires_at,'count',count_files,'orphan_count',plan.orphan_count,'items',items);
END $$;
CREATE FUNCTION private.files_lease_json(l private.file_process_leases) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT jsonb_build_object('lease_id',l.id,'lease_token',l.token,'action',l.action,'expires_at',l.expires_at,'objects',l.objects,'result',CASE WHEN l.completed_at IS NOT NULL THEN l.result ELSE NULL END);$$;
CREATE FUNCTION private.files_process_claim(p_office_id uuid,p_action text,p_args jsonb,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;r public.requests;source_r public.requests;f public.files;source_f public.files;i private.upload_intents;source_i private.upload_intents;plan private.file_cleanup_plans;l private.file_process_leases;target uuid;objects_json jsonb;intent jsonb;upload jsonb;
BEGIN
 m:=private.files_actor(p_office_id,true,CASE p_action WHEN 'copy' THEN 'files.copy' WHEN 'cleanup' THEN 'files.manage' ELSE 'files.upload' END);
 IF p_action IS NULL OR p_action NOT IN('validate','copy','cleanup') OR jsonb_typeof(p_args) IS DISTINCT FROM 'object' OR p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_action='validate' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT p_args ? 'intent_id' THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND id=(p_args->>'intent_id')::uuid;
  IF i.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  r:=private.files_request(p_office_id,i.request_id,m,true);m:=private.files_actor(p_office_id,true,'files.upload');
  SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=i.file_id FOR UPDATE;
  IF i.created_by<>m.user_id OR i.session_id::text<>auth.jwt()->>'session_id' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF i.source_file_id IS NOT NULL OR r.status IN('concluido','cancelado') OR i.expires_at<=clock_timestamp() OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  target:=i.id;objects_json:=jsonb_build_array(private.files_object_json(f,i));
 ELSIF p_action='copy' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>4 OR NOT p_args ?& ARRAY['source_file_id','target_request_id','target_item_id','idempotency_key'] THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO source_f FROM public.files WHERE office_id=p_office_id AND id=(p_args->>'source_file_id')::uuid;
  IF source_f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id IN(source_f.request_id,(p_args->>'target_request_id')::uuid) ORDER BY id FOR UPDATE;
  source_r:=private.files_request(p_office_id,source_f.request_id,m,true);r:=private.files_request(p_office_id,(p_args->>'target_request_id')::uuid,m,true);m:=private.files_actor(p_office_id,true,'files.copy');
  SELECT * INTO source_f FROM public.files WHERE office_id=p_office_id AND id=source_f.id FOR SHARE;
  IF source_f.status<>'disponivel' OR source_f.scanner_status<>'clean' OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=source_f.id) THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
  IF jsonb_typeof(p_args->'idempotency_key') IS DISTINCT FROM 'string' OR length(p_args->>'idempotency_key') NOT BETWEEN 1 AND 95 THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  upload:=jsonb_build_object('request_id',r.id,'request_item_id',p_args->'target_item_id','name',source_f.name,'mime_type',source_f.mime_type,'size_bytes',source_f.size_bytes,'sha256',source_f.sha256,'classification',source_f.classification,'idempotency_key','copy:'||(p_args->>'idempotency_key'));
  intent:=private.files_begin_upload(p_office_id,upload,p_event_id);
  SELECT * INTO i FROM private.upload_intents WHERE id=(intent->>'intent_id')::uuid FOR UPDATE;
  IF i.source_file_id IS NOT NULL AND i.source_file_id<>source_f.id THEN RAISE EXCEPTION 'FILE_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  IF i.source_file_id IS NULL THEN
   UPDATE private.upload_intents SET source_file_id=source_f.id WHERE id=i.id RETURNING * INTO i;
   INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(p_office_id,source_f.id,'copy');
  END IF;
  SELECT * INTO f FROM public.files WHERE id=i.file_id AND office_id=p_office_id FOR UPDATE;
  IF i.created_by<>m.user_id OR i.session_id::text<>auth.jwt()->>'session_id' OR i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  target:=i.id;objects_json:=jsonb_build_array(private.files_object_json(f,i));
 ELSE
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT p_args ? 'plan_id' THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO plan FROM private.file_cleanup_plans WHERE office_id=p_office_id AND id=(p_args->>'plan_id')::uuid FOR UPDATE;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF plan.created_by<>m.user_id OR plan.session_id::text<>auth.jwt()->>'session_id' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF plan.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  PERFORM 1 FROM public.requests r WHERE r.office_id=p_office_id AND EXISTS(SELECT FROM public.files f JOIN private.file_cleanup_reservations x ON x.file_id=f.id WHERE f.request_id=r.id AND x.plan_id=plan.id) ORDER BY r.id FOR UPDATE;
  m:=private.files_actor(p_office_id,true,'files.manage');
  IF EXISTS(SELECT FROM public.files f JOIN private.file_cleanup_reservations x ON x.file_id=f.id JOIN public.requests r ON r.office_id=f.office_id AND r.id=f.request_id WHERE x.plan_id=plan.id AND (private.request_in_scope(r,m) IS NOT TRUE)) THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT coalesce(jsonb_agg(private.files_object_json(f,i) ORDER BY f.id),'[]'::jsonb) INTO objects_json FROM private.file_cleanup_reservations x JOIN public.files f ON f.id=x.file_id JOIN private.upload_intents i ON i.file_id=f.id WHERE x.plan_id=plan.id AND x.removed_at IS NULL;
  target:=plan.id;
 END IF;
 SELECT * INTO l FROM private.file_process_leases WHERE office_id=p_office_id AND actor_id=m.user_id AND session_id::text=auth.jwt()->>'session_id' AND action=p_action AND target_id=target FOR UPDATE;
 IF l.id IS NOT NULL THEN
  IF l.completed_at IS NULL AND l.expires_at<=clock_timestamp() THEN UPDATE private.file_process_leases SET token=gen_random_uuid()::text,expires_at=clock_timestamp()+interval '5 minutes',objects=objects_json WHERE id=l.id RETURNING * INTO l;END IF;
 ELSE
  IF p_action IN('validate','copy') AND f.status<>'aguardando_upload' THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
  INSERT INTO private.file_process_leases(office_id,actor_id,session_id,action,target_id,objects)VALUES(p_office_id,m.user_id,(auth.jwt()->>'session_id')::uuid,p_action,target,objects_json)RETURNING * INTO l;
  PERFORM private.team_audit(p_office_id,m.user_id,'files.process_claimed','file_process',l.id,p_event_id,'{}');
 END IF;
 RETURN private.files_lease_json(l);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END $$;
CREATE FUNCTION private.files_process_complete(p_lease_id uuid,p_lease_token text,p_result jsonb,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE l private.file_process_leases;m public.memberships;r public.requests;source_r public.requests;f public.files;source_f public.files;i private.upload_intents;plan private.file_cleanup_plans;original_claims text:=current_setting('request.jwt.claims',true);answer jsonb;outcome text;removed_count integer:=0;pending_count integer:=0;obj jsonb;remove_uuid uuid;
BEGIN
 -- The only entry is a service_role-only invoker RPC. Authorization below uses stored identity, never worker-provided identity.
 SELECT * INTO l FROM private.file_process_leases WHERE id=p_lease_id;
 IF l.id IS NULL OR l.token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',l.actor_id,'session_id',l.session_id)::text,true);
 m:=private.files_actor(l.office_id,true,CASE l.action WHEN 'cleanup' THEN 'files.manage' WHEN 'copy' THEN 'files.copy' ELSE 'files.upload' END);
 -- Lock requests, files and finally the lease in the same order as claim/cleanup.
 PERFORM 1 FROM public.requests r WHERE r.office_id=l.office_id AND EXISTS(SELECT FROM public.files f WHERE f.office_id=r.office_id AND f.request_id=r.id AND(l.objects @> jsonb_build_array(jsonb_build_object('file_id',f.id)) OR f.id IN(SELECT source_file_id FROM private.upload_intents WHERE id=l.target_id))) ORDER BY r.id FOR UPDATE;
 m:=private.files_actor(l.office_id,true,CASE l.action WHEN 'cleanup' THEN 'files.manage' WHEN 'copy' THEN 'files.copy' ELSE 'files.upload' END);
 IF l.action='copy' THEN PERFORM private.files_actor(l.office_id,true,'files.upload');END IF;
 SELECT * INTO l FROM private.file_process_leases WHERE id=p_lease_id FOR UPDATE;
 IF l.token IS DISTINCT FROM p_lease_token THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 FOR obj IN SELECT * FROM jsonb_array_elements(l.objects) LOOP
  SELECT * INTO f FROM public.files WHERE office_id=l.office_id AND id=(obj->>'file_id')::uuid FOR UPDATE;
  r:=private.files_request(l.office_id,f.request_id,m,true);
  IF m.role_code='client' AND f.created_by<>m.user_id THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF l.action<>'cleanup' AND r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
 END LOOP;
 IF l.action='copy' THEN
  SELECT * INTO source_f FROM public.files WHERE office_id=l.office_id AND id=(SELECT source_file_id FROM private.upload_intents WHERE id=l.target_id) FOR SHARE;
  source_r:=private.files_request(l.office_id,source_f.request_id,m,true);
  IF source_f.status<>'disponivel' OR source_f.scanner_status<>'clean' THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
 END IF;
 m:=private.files_actor(l.office_id,true,CASE l.action WHEN 'cleanup' THEN 'files.manage' WHEN 'copy' THEN 'files.copy' ELSE 'files.upload' END);
 IF l.action='copy' THEN PERFORM private.files_actor(l.office_id,true,'files.upload');END IF;
 IF l.completed_at IS NOT NULL THEN PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);RETURN l.result;END IF;
 IF l.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR p_event_id IS NULL OR NOT p_result ? 'outcome' OR EXISTS(SELECT FROM jsonb_object_keys(p_result)k WHERE k NOT IN('outcome','sha256','size_bytes','mime_type','reason','removed_ids')) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 outcome:=p_result->>'outcome';
 IF outcome IS NULL OR outcome NOT IN('validated','rejected','missing','storage_error','removed') THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF l.action='cleanup' THEN
  IF outcome NOT IN('removed','storage_error') OR(outcome='removed' AND jsonb_typeof(p_result->'removed_ids') IS DISTINCT FROM 'array') THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO plan FROM private.file_cleanup_plans WHERE id=l.target_id FOR UPDATE;
  IF plan.created_by<>l.actor_id OR plan.session_id<>l.session_id THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  FOR remove_uuid IN SELECT value::text::uuid FROM jsonb_array_elements_text(coalesce(p_result->'removed_ids','[]')) LOOP
   IF NOT l.objects @> jsonb_build_array(jsonb_build_object('file_id',remove_uuid)) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
   SELECT * INTO f FROM public.files WHERE office_id=l.office_id AND id=remove_uuid FOR UPDATE;
   IF NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE plan_id=plan.id AND file_id=f.id) THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
   IF f.status<>'removido' AND NOT private.files_cleanup_eligible(f) THEN
    -- This lease itself is expected; other eligibility protections remain mandatory.
    IF f.protected OR f.legal_hold OR f.retain_until>clock_timestamp() OR EXISTS(SELECT FROM private.file_references WHERE file_id=f.id) OR f.status NOT IN('rejeitado','aguardando_upload') THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
   END IF;
   UPDATE private.file_cleanup_reservations SET removed_at=clock_timestamp() WHERE plan_id=plan.id AND file_id=f.id AND removed_at IS NULL;
   IF FOUND THEN removed_count:=removed_count+1;UPDATE public.files SET status='removido',updated_at=clock_timestamp() WHERE id=f.id;END IF;
  END LOOP;
  SELECT count(*) INTO pending_count FROM private.file_cleanup_reservations WHERE plan_id=plan.id AND removed_at IS NULL;
  answer:=jsonb_build_object('file',NULL,'removed',removed_count,'pending',pending_count);
 ELSE
  SELECT * INTO i FROM private.upload_intents WHERE office_id=l.office_id AND id=l.target_id;
  IF i.expires_at<=clock_timestamp() OR i.session_id<>l.session_id OR i.created_by<>l.actor_id OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=i.file_id) THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT * INTO f FROM public.files WHERE office_id=l.office_id AND id=i.file_id FOR UPDATE;
  IF f.status<>'aguardando_upload' THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF outcome='validated' THEN
   IF p_result->>'sha256' IS DISTINCT FROM f.sha256 OR p_result->>'mime_type' IS DISTINCT FROM f.mime_type OR coalesce(p_result->>'size_bytes','') !~ '^[0-9]{1,8}$' OR (p_result->>'size_bytes')::bigint<>f.size_bytes THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
   UPDATE public.files SET status='quarentena',scanner_status='not_configured',validation_reason=NULL,validation_tool='attachments-byte-check/1',validated_at=clock_timestamp(),actual_sha256=f.sha256,actual_size_bytes=f.size_bytes,actual_mime_type=f.mime_type,updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
  ELSIF outcome='rejected' THEN
   IF p_result->>'reason' IS NULL OR p_result->>'reason' NOT IN('hash_mismatch','type_mismatch','size_mismatch','invalid_content') OR(p_result->>'sha256' IS NOT NULL AND p_result->>'sha256' !~ '^[0-9a-f]{64}$') OR(p_result->>'size_bytes' IS NOT NULL AND(p_result->>'size_bytes' !~ '^[0-9]{1,12}$' OR(p_result->>'size_bytes')::bigint<0)) OR(p_result->>'mime_type' IS NOT NULL AND p_result->>'mime_type' NOT IN('application/pdf','image/png','image/jpeg')) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
   UPDATE public.files SET status='rejeitado',scanner_status='not_configured',validation_reason=p_result->>'reason',validation_tool='attachments-byte-check/1',validated_at=clock_timestamp(),actual_sha256=p_result->>'sha256',actual_size_bytes=(p_result->>'size_bytes')::bigint,actual_mime_type=p_result->>'mime_type',updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
  ELSIF outcome IN('missing','storage_error') THEN
   UPDATE public.files SET validation_reason=CASE outcome WHEN 'missing' THEN 'object_missing' ELSE 'storage_error' END,updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
  ELSE RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  answer:=jsonb_build_object('file',private.files_file_json(f,m),'removed',0,'pending',CASE WHEN outcome IN('missing','storage_error') THEN 1 ELSE 0 END);
 END IF;
 -- Missing objects, partial cleanup and transient provider failures remain retryable with the same lease.
 IF(outcome IN('validated','rejected') OR(l.action='cleanup' AND pending_count=0 AND outcome='removed')) THEN
  UPDATE private.file_process_leases SET result=answer,completed_at=clock_timestamp() WHERE id=l.id;
 ELSE UPDATE private.file_process_leases SET result=answer WHERE id=l.id;END IF;
 PERFORM private.team_audit(l.office_id,l.actor_id,'files.process_completed','file_process',l.id,p_event_id,jsonb_build_object('count',removed_count));
 PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);RETURN answer;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';
 WHEN OTHERS THEN PERFORM set_config('request.jwt.claims',coalesce(original_claims,''),true);RAISE;
END $$;
-- Storage receives JWT bytes directly. It never accepts overwrites or user deletes.
DO $$BEGIN IF EXISTS(SELECT FROM storage.buckets WHERE id='request-attachments' AND(public OR file_size_limit IS DISTINCT FROM 10485760 OR allowed_mime_types IS DISTINCT FROM ARRAY['application/pdf','image/png','image/jpeg'])) THEN RAISE EXCEPTION 'FILES_BUCKET_CONFLICT' USING ERRCODE='PT409';END IF;END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('request-attachments','request-attachments',false,10485760,ARRAY['application/pdf','image/png','image/jpeg']) ON CONFLICT(id)DO NOTHING;
CREATE FUNCTION private.files_storage_allowed(p_bucket text,p_path text,p_operation text,p_metadata jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE i private.upload_intents;f public.files;m public.memberships;r public.requests;
BEGIN
 IF p_bucket<>'request-attachments' THEN RETURN false;END IF;
 SELECT * INTO i FROM private.upload_intents WHERE bucket=p_bucket AND object_path=p_path;
 IF i.id IS NULL THEN RETURN false;END IF;
 m:=private.files_actor(i.office_id,false,CASE WHEN p_operation='insert' THEN 'files.upload' ELSE NULL END);
 r:=private.files_request(i.office_id,i.request_id,m);
 SELECT * INTO f FROM public.files WHERE office_id=i.office_id AND id=i.file_id;
 IF f.id IS NULL OR(m.role_code='client' AND f.created_by<>m.user_id) OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) THEN RETURN false;END IF;
 IF p_operation='select' THEN RETURN f.status='disponivel' AND f.scanner_status='clean' AND storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info']);END IF;
 IF p_operation<>'insert' OR NOT storage.allow_any_operation(ARRAY['object.upload']) THEN RETURN false;END IF;
 RETURN i.created_by=m.user_id AND i.session_id::text=auth.jwt()->>'session_id' AND i.source_file_id IS NULL AND i.expires_at>clock_timestamp() AND f.status='aguardando_upload' AND r.status NOT IN('concluido','cancelado')
  AND(p_metadata->>'size' IS NULL OR((p_metadata->>'size')::bigint BETWEEN 1 AND(i.policy_snapshot->>'max_bytes')::bigint))
  AND(p_metadata->>'mimetype' IS NULL OR i.policy_snapshot->'mime_types' ? (p_metadata->>'mimetype'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE POLICY attachments_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='request-attachments' AND private.files_storage_allowed(bucket_id,name,'insert',metadata));
CREATE POLICY attachments_insert_gate ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'request-attachments' OR private.files_storage_allowed(bucket_id,name,'insert',metadata));
CREATE POLICY attachments_select ON storage.objects FOR SELECT TO authenticated USING(bucket_id='request-attachments' AND private.files_storage_allowed(bucket_id,name,'select'));
CREATE POLICY attachments_select_gate ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'request-attachments' OR private.files_storage_allowed(bucket_id,name,'select'));
CREATE POLICY attachments_anon_insert_gate ON storage.objects AS RESTRICTIVE FOR INSERT TO anon WITH CHECK(bucket_id<>'request-attachments');
CREATE POLICY attachments_anon_select_gate ON storage.objects AS RESTRICTIVE FOR SELECT TO anon USING(bucket_id<>'request-attachments');
CREATE POLICY attachments_update_gate ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(bucket_id<>'request-attachments') WITH CHECK(bucket_id<>'request-attachments');
CREATE POLICY attachments_delete_gate ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'request-attachments');
CREATE POLICY attachments_metadata_gate ON public.files AS RESTRICTIVE FOR ALL TO PUBLIC USING(false)WITH CHECK(false);

CREATE FUNCTION public.files_page(p_office_id uuid,p_request_id uuid,p_page integer,p_size integer)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_page(p_office_id,p_request_id,p_page,p_size);$$;
CREATE FUNCTION public.files_requests_page(p_office_id uuid,p_query text,p_page integer,p_size integer)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_requests_page(p_office_id,p_query,p_page,p_size);$$;
CREATE FUNCTION public.files_begin_upload(p_office_id uuid,p_input jsonb,p_event_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_begin_upload(p_office_id,p_input,p_event_id);$$;
CREATE FUNCTION public.files_download(p_office_id uuid,p_file_id uuid,p_event_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_download(p_office_id,p_file_id,p_event_id);$$;
CREATE FUNCTION public.files_policy_get(p_office_id uuid,p_service_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_policy_get(p_office_id,p_service_id);$$;
CREATE FUNCTION public.files_policy_set(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_max_bytes bigint,p_mime_types text[],p_reason text,p_event_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_policy_set(p_office_id,p_service_id,p_expected_version,p_max_bytes,p_mime_types,p_reason,p_event_id);$$;
CREATE FUNCTION public.files_cleanup_plan(p_office_id uuid,p_event_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_cleanup_plan(p_office_id,p_event_id);$$;
CREATE FUNCTION public.files_process_claim(p_office_id uuid,p_action text,p_args jsonb,p_event_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_process_claim(p_office_id,p_action,p_args,p_event_id);$$;
CREATE FUNCTION public.files_process_complete(p_lease_id uuid,p_lease_token text,p_result jsonb,p_event_id uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_process_complete(p_lease_id,p_lease_token,p_result,p_event_id);$$;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,p.proname,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname LIKE 'files_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN('files_page','files_requests_page','files_begin_upload','files_download','files_policy_get','files_policy_set','files_cleanup_plan','files_process_claim') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
  IF f.proname='files_process_complete' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);END IF;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION private.files_storage_allowed(text,text,text,jsonb) TO authenticated;
