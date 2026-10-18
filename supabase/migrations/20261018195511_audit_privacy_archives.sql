-- Etapa 06: additive governance. Existing identities and memberships are untouched.
INSERT INTO public.permissions(code,name) VALUES ('audit.export','Exportar auditoria'),('archives.manage','Gerenciar arquivados') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES ('owner','audit.export'),('owner','archives.manage') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage']);

CREATE TABLE private.archived_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 target_type text NOT NULL DEFAULT 'membership' CHECK (target_type='membership'),
 target_id uuid NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 restored_at timestamptz,
 restored_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,target_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT,
 CHECK ((restored_at IS NULL)=(restored_by IS NULL))
);
CREATE UNIQUE INDEX archived_records_one_active_idx ON private.archived_records(office_id,target_id) WHERE restored_at IS NULL;
CREATE INDEX archived_records_office_time_idx ON private.archived_records(office_id,archived_at DESC,id DESC);
CREATE INDEX archived_records_target_idx ON private.archived_records(target_id);
CREATE INDEX archived_records_actor_idx ON private.archived_records(archived_by);
CREATE INDEX archived_records_restorer_idx ON private.archived_records(restored_by);
CREATE INDEX audit_events_office_action_idx ON public.audit_events(office_id,action,occurred_at DESC,id DESC);
CREATE INDEX audit_events_office_actor_idx ON public.audit_events(office_id,actor_id,occurred_at DESC,id DESC);
ALTER TABLE private.archived_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.archived_records FROM PUBLIC,anon,authenticated,service_role;
-- Reads go through the scoped DTO, not unrestricted bulk table downloads.
REVOKE SELECT ON public.audit_events FROM authenticated;

CREATE FUNCTION private.governance_actor(p_office_id uuid,p_capability text,p_lock boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid;
BEGIN
 caller:=private.team_require_identity();
 IF p_lock THEN
  PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE;
  caller:=private.team_require_identity();
 END IF;
 IF NOT (private.current_permissions(p_office_id) @> ARRAY['foundation.access',p_capability])
  OR NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active AND role_code<>'client') THEN
  RAISE EXCEPTION 'GOVERNANCE_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN caller;
END $$;
CREATE FUNCTION private.safe_audit_changes(p_changes jsonb) RETURNS jsonb
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION private.emit_business_event(p_office_id uuid,p_action text,p_type text,p_target uuid,p_request uuid,p_changes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid:=private.team_require_identity();
BEGIN
 IF p_request IS NULL OR p_action IS NULL OR p_action !~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'
  OR p_type IS NULL OR p_type !~ '^[a-z][a-z0-9_]{0,79}$' OR p_changes IS NULL OR p_changes IS DISTINCT FROM private.safe_audit_changes(p_changes) THEN
  RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422'; END IF;
 INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type,target_id,request_id,changes,occurred_at)
 VALUES(p_office_id,caller,'user',p_action,p_type,p_target,p_request,p_changes,clock_timestamp());
END $$;
CREATE FUNCTION private.audit_filters(p_page integer,p_size integer,p_action text,p_from timestamptz,p_until timestamptz) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_page IS NULL OR p_page<1 OR p_page>100000 OR p_size IS NULL OR p_size NOT IN (3,5)
  OR p_action IS NULL OR length(p_action)>120 OR p_action !~ '^[a-zA-Z0-9_.]*$'
  OR (p_from IS NOT NULL AND NOT isfinite(p_from)) OR (p_until IS NOT NULL AND NOT isfinite(p_until))
  OR (p_from IS NOT NULL AND p_until IS NOT NULL AND p_from>=p_until) THEN
  RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422'; END IF;
END $$;
CREATE FUNCTION private.audit_rows(p_office_id uuid,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz) RETURNS TABLE (
 id uuid,actor_id uuid,actor_name text,action text,target_type text,target_id uuid,outcome text,occurred_at timestamptz,request_id uuid,changes jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT e.id,e.actor_id,coalesce(p.display_name,CASE WHEN e.actor_kind='operator' THEN 'Operação técnica' ELSE 'Pessoa sem nome informado' END),
  e.action,e.target_type,e.target_id,e.outcome,e.occurred_at,e.request_id,private.safe_audit_changes(e.changes)
 FROM public.audit_events e LEFT JOIN public.profiles p ON p.id=e.actor_id
 WHERE e.office_id=p_office_id AND (p_action='' OR e.action=p_action) AND (p_actor IS NULL OR e.actor_id=p_actor)
  AND (p_from IS NULL OR e.occurred_at>=p_from) AND (p_until IS NULL OR e.occurred_at<p_until);
$$;
CREATE FUNCTION private.audit_page(p_office_id uuid,p_page integer,p_size integer,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total bigint;
BEGIN
 PERFORM private.governance_actor(p_office_id,'audit.read');
 PERFORM private.audit_filters(p_page,p_size,p_action,p_from,p_until);
 SELECT count(*) INTO total FROM private.audit_rows(p_office_id,p_action,p_actor,p_from,p_until);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC),'[]') INTO result FROM (
  SELECT * FROM private.audit_rows(p_office_id,p_action,p_actor,p_from,p_until) ORDER BY occurred_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size) x;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.audit_export(p_office_id uuid,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; size integer;
BEGIN
 PERFORM private.governance_actor(p_office_id,'audit.read',true);
 PERFORM private.governance_actor(p_office_id,'audit.export');
 PERFORM private.audit_filters(1,5,p_action,p_from,p_until);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC),'[]'),count(*) INTO result,size FROM (
  SELECT * FROM private.audit_rows(p_office_id,p_action,p_actor,p_from,p_until) ORDER BY occurred_at DESC,id DESC LIMIT 1001) x;
 IF size>1000 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='PT422'; END IF;
 PERFORM private.emit_business_event(p_office_id,'audit.exported','office',p_office_id,p_request_id,jsonb_build_object('count',size));
 RETURN jsonb_build_object('items',result,'count',size,'office_id',p_office_id,'exported_at',clock_timestamp(),'request_id',p_request_id);
END $$;
CREATE FUNCTION private.archive_membership(p_office_id uuid,p_membership_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; target public.memberships; permissions text[]; archive_id uuid;
BEGIN
 actor:=private.team_actor(p_office_id,true);
 PERFORM private.governance_actor(p_office_id,'archives.manage');
 SELECT * INTO target FROM public.memberships WHERE id=p_membership_id AND office_id=p_office_id FOR UPDATE;
 PERFORM private.team_guard_member(actor,target,target.role_code,false);
 IF EXISTS(SELECT FROM private.archived_records WHERE office_id=p_office_id AND target_id=p_membership_id AND restored_at IS NULL) THEN
  RAISE EXCEPTION 'ARCHIVE_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT array_agg(DISTINCT x) INTO permissions FROM (
  SELECT permission_code AS x FROM private.team_member_permissions WHERE membership_id=target.id UNION SELECT 'foundation.access') p;
 PERFORM private.team_set_member(p_office_id,target.id,target.role_code,false,permissions,p_request_id);
 -- Invalidate earlier grants addressed to this identity, not only grants issued by it.
 -- Otherwise accepting an old invitation after restore could reactivate the access.
 UPDATE private.team_invitations i SET status='blocked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL
 WHERE i.office_id=p_office_id AND i.status='pending' AND (i.verified_user_id=target.user_id
  OR i.password_existing_user_id=target.user_id OR i.email=(SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id=target.user_id));
 INSERT INTO private.archived_records(office_id,target_id,archived_by) VALUES(p_office_id,target.id,(actor->>'user_id')::uuid) RETURNING id INTO archive_id;
 PERFORM private.emit_business_event(p_office_id,'archives.archived','membership',target.id,p_request_id,jsonb_build_object('archive_id',archive_id));
 RETURN jsonb_build_object('id',archive_id);
END $$;
CREATE FUNCTION private.archives_page(p_office_id uuid,p_page integer,p_size integer,p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total bigint;
BEGIN
 PERFORM private.governance_actor(p_office_id,'archives.manage');
 PERFORM private.audit_filters(p_page,p_size,'',NULL,NULL);
 IF p_status IS NULL OR p_status NOT IN ('archived','restored') THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422'; END IF;
 SELECT count(*) INTO total FROM private.archived_records WHERE office_id=p_office_id AND ((p_status='archived')=(restored_at IS NULL));
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.archived_at DESC,x.id DESC),'[]') INTO result FROM (
  SELECT ar.id,ar.target_type,ar.target_id,ar.archived_at,ar.restored_at,
   coalesce(identity.full_name,p.display_name,'Nome não informado') AS target_label
  FROM private.archived_records ar JOIN public.memberships m ON m.office_id=ar.office_id AND m.id=ar.target_id
  JOIN public.profiles p ON p.id=m.user_id LEFT JOIN private.team_member_identities identity ON identity.membership_id=m.id
  WHERE ar.office_id=p_office_id AND ((p_status='archived')=(ar.restored_at IS NULL)) ORDER BY ar.archived_at DESC,ar.id DESC LIMIT p_size OFFSET (p_page-1)*p_size) x;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.restore_archive(p_office_id uuid,p_archive_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; archive private.archived_records;
BEGIN
 caller:=private.governance_actor(p_office_id,'archives.manage',true);
 SELECT * INTO archive FROM private.archived_records WHERE id=p_archive_id AND office_id=p_office_id FOR UPDATE;
 IF archive.id IS NULL THEN RAISE EXCEPTION 'GOVERNANCE_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF archive.restored_at IS NOT NULL THEN RAISE EXCEPTION 'ARCHIVE_CONFLICT' USING ERRCODE='PT409'; END IF;
 UPDATE private.archived_records SET restored_at=clock_timestamp(),restored_by=caller WHERE id=archive.id;
 PERFORM private.emit_business_event(p_office_id,'archives.restored',archive.target_type,archive.target_id,p_request_id,jsonb_build_object('archive_id',archive.id));
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE FUNCTION private.guard_archived_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.active AND EXISTS(SELECT FROM private.archived_records WHERE office_id=NEW.office_id AND target_id=NEW.id AND restored_at IS NULL) THEN
  RAISE EXCEPTION 'ARCHIVE_CONFLICT' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER memberships_archived_guard BEFORE UPDATE OF active ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.guard_archived_membership();

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage'])
  OR cardinality(p_permissions)<>(SELECT count(DISTINCT x) FROM unnest(p_permissions) x)
  OR NOT EXISTS (SELECT FROM public.roles WHERE code=p_role AND active)
  OR EXISTS (SELECT FROM unnest(p_permissions) x WHERE NOT EXISTS(SELECT FROM public.permissions WHERE code=x AND active)) THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT (p_actor->'allowed_roles' ? p_role) OR NOT (p_actor->'allowed_permissions' @> to_jsonb(p_permissions))
  OR (p_role='owner' AND p_creating_owner AND NOT (p_actor->>'can_create_owner')::boolean) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
END $$;

CREATE OR REPLACE FUNCTION private.team_dashboard(p_office_id uuid,p_kind text,p_page integer,p_query text,p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; members_count integer; invitations_count integer; total_count integer; items jsonb; scoped_roles text[];
BEGIN
 actor:=private.team_actor(p_office_id);
 IF p_kind IS NULL OR p_kind NOT IN ('members','invitations') OR p_page IS NULL OR p_page<1 OR p_page>100000
  OR p_query IS NULL OR length(p_query)>120 OR p_status IS NULL
  OR (p_kind='members' AND p_status NOT IN ('all','active','inactive'))
  OR (p_kind='invitations' AND p_status NOT IN ('all','pending','accepted','revoked','expired','blocked')) THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 SELECT array_agg(value) INTO scoped_roles FROM jsonb_array_elements_text(actor->'allowed_roles');
 SELECT count(*) INTO members_count FROM public.memberships m WHERE m.office_id=p_office_id AND m.role_code=ANY(scoped_roles);
 SELECT count(*) INTO invitations_count FROM private.team_invitations i WHERE i.office_id=p_office_id AND i.role_code=ANY(scoped_roles);
 IF p_kind='members' THEN
  WITH roster AS (
   SELECT m.id,m.user_id,coalesce(identity.full_name,p.display_name) AS name,u.email,m.role_code,m.active,
    private.team_user_active(m.user_id,m.office_id) AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access'] AS access_active,
    private.team_permissions_for_member(m.id) AS permissions,identity.cpf_masked,
    (actor->>'role_code'='owner' OR (m.user_id<>(actor->>'user_id')::uuid AND m.role_code<>'owner' AND NOT coalesce(d.revoked_at IS NULL AND d.expires_at>clock_timestamp(),false))) AS can_edit,
    (m.role_code='owner' AND m.active AND NOT EXISTS(SELECT FROM public.memberships other WHERE other.office_id=m.office_id
      AND other.id<>m.id AND other.role_code='owner' AND private.team_user_active(other.user_id,other.office_id))) AS protected_owner,
    CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'allowed_roles',d.allowed_roles,
     'allowed_permissions',d.allowed_permissions,'can_create_owner',d.can_create_owner,'expires_at',d.expires_at,
     'revoked_at',d.revoked_at,'active',d.revoked_at IS NULL AND d.expires_at>clock_timestamp()) END AS delegation,
    EXISTS(SELECT FROM private.archived_records ar WHERE ar.office_id=m.office_id AND ar.target_id=m.id AND ar.restored_at IS NULL) AS archived,
    m.created_at
   FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id JOIN auth.users u ON u.id=m.user_id
   LEFT JOIN private.team_member_identities identity ON identity.membership_id=m.id
   LEFT JOIN LATERAL (SELECT * FROM private.team_delegations x WHERE x.membership_id=m.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1) d ON true
   WHERE m.office_id=p_office_id AND m.role_code=ANY(scoped_roles)
    AND (p_status='all' OR (p_status='active' AND m.active) OR (p_status='inactive' AND NOT m.active))
    AND (p_query='' OR coalesce(identity.full_name,p.display_name,'') ILIKE '%'||p_query||'%' OR u.email ILIKE '%'||p_query||'%')
  ), paged AS (SELECT * FROM roster ORDER BY created_at,id LIMIT 5 OFFSET (p_page-1)*5)
  SELECT (SELECT count(*) FROM roster),coalesce((SELECT jsonb_agg(to_jsonb(paged)-'created_at' ORDER BY created_at,id) FROM paged),'[]'::jsonb)
   INTO total_count,items;
 ELSE
  WITH invitations AS (
   SELECT i.id,i.full_name AS name,i.email,i.role_code,i.permissions,
    CASE WHEN i.status<>'pending' THEN i.status WHEN i.expires_at<=clock_timestamp() THEN 'expired'
      WHEN NOT private.team_invitation_authority(i.id) THEN 'blocked' ELSE 'pending' END AS status,
    CASE WHEN i.delivery_status='sending' AND i.delivery_lease_until<=clock_timestamp() THEN 'failed' ELSE i.delivery_status END AS delivery_status,
    i.expires_at,i.created_at,i.cpf_masked
   FROM private.team_invitations i WHERE i.office_id=p_office_id AND i.role_code=ANY(scoped_roles)
    AND (p_query='' OR i.full_name ILIKE '%'||p_query||'%' OR i.email ILIKE '%'||p_query||'%')
  ), filtered AS (SELECT * FROM invitations WHERE p_status='all' OR status=p_status),
  paged AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET (p_page-1)*5)
  SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,id DESC) FROM paged),'[]'::jsonb)
   INTO total_count,items;
 END IF;
 RETURN jsonb_build_object('scope',actor-ARRAY['user_id','membership_id','office_id','delegation_id'],'kind',p_kind,
  'items',items,'total',total_count,'page',p_page,'page_size',5,'counts',jsonb_build_object('members',members_count,'invitations',invitations_count));
END $$;

CREATE FUNCTION public.audit_page(p_office_id uuid,p_page integer,p_size integer,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.audit_page(p_office_id,p_page,p_size,p_action,p_actor,p_from,p_until); $$;

CREATE FUNCTION public.audit_export(p_office_id uuid,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.audit_export(p_office_id,p_action,p_actor,p_from,p_until,p_request_id); $$;

CREATE FUNCTION public.archive_membership(p_office_id uuid,p_membership_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.archive_membership(p_office_id,p_membership_id,p_request_id); $$;

CREATE FUNCTION public.archives_page(p_office_id uuid,p_page integer,p_size integer,p_status text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.archives_page(p_office_id,p_page,p_size,p_status); $$;

CREATE FUNCTION public.restore_archive(p_office_id uuid,p_archive_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.restore_archive(p_office_id,p_archive_id,p_request_id); $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('private','public') AND p.proname IN ('audit_page','audit_export','archive_membership','archives_page','restore_archive','governance_actor','safe_audit_changes','emit_business_event','audit_filters','audit_rows','guard_archived_membership')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.audit_page(uuid,integer,integer,text,uuid,timestamptz,timestamptz),private.audit_page(uuid,integer,integer,text,uuid,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_export(uuid,text,uuid,timestamptz,timestamptz,uuid),private.audit_export(uuid,text,uuid,timestamptz,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_membership(uuid,uuid,uuid),private.archive_membership(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archives_page(uuid,integer,integer,text),private.archives_page(uuid,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_archive(uuid,uuid,uuid),private.restore_archive(uuid,uuid,uuid) TO authenticated;
