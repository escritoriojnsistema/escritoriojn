-- Etapa 05. Additive only: no Auth identity or existing membership is rewritten.
-- Private data is reached only through the narrow invoker RPC -> definer boundary.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

INSERT INTO public.permissions(code,name) VALUES
 ('users.manage','Gerenciar equipe do escritório'),('users.owners.create','Convidar proprietário explicitamente')
 ON CONFLICT (code) DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES
 ('owner','users.manage'),('owner','users.owners.create') ON CONFLICT DO NOTHING;

CREATE TABLE private.team_member_permissions (
 membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
 permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE RESTRICT
   CHECK (permission_code IN ('foundation.access','audit.read')),
 PRIMARY KEY (membership_id,permission_code)
);
CREATE TABLE private.team_member_identities (
 membership_id uuid PRIMARY KEY REFERENCES public.memberships(id) ON DELETE RESTRICT,
 full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 120),
 cpf_hash text NOT NULL CHECK (cpf_hash LIKE '$2%'),
 cpf_masked text NOT NULL CHECK (cpf_masked ~ '^\*\*\*\.\*\*\*\.\*\*\*-[0-9]{2}$'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.team_delegations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 membership_id uuid NOT NULL,
 allowed_roles text[] NOT NULL CHECK (cardinality(allowed_roles)>0 AND allowed_roles <@ ARRAY['employee','admin','owner']),
 allowed_permissions text[] NOT NULL CHECK (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read']),
 can_create_owner boolean NOT NULL DEFAULT false,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 FOREIGN KEY (office_id,membership_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT,
 CHECK (NOT can_create_owner OR allowed_roles @> ARRAY['owner'])
);
CREATE UNIQUE INDEX team_delegations_one_current_idx ON private.team_delegations(membership_id) WHERE revoked_at IS NULL;
CREATE INDEX team_delegations_office_idx ON private.team_delegations(office_id,created_at,id);
CREATE INDEX team_delegations_actor_idx ON private.team_delegations(created_by);
CREATE TABLE private.team_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 email text NOT NULL CHECK (email=lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254),
 full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 3 AND 120),
 cpf_hash text NOT NULL CHECK (cpf_hash LIKE '$2%'),
 cpf_masked text NOT NULL CHECK (cpf_masked ~ '^\*\*\*\.\*\*\*\.\*\*\*-[0-9]{2}$'),
 role_code text NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT CHECK (role_code IN ('employee','admin','owner')),
 permissions text[] NOT NULL CHECK (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read']),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','blocked')),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 inviter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 inviter_membership_id uuid NOT NULL,
 authority_role text NOT NULL CHECK (authority_role IN ('owner','admin')),
 delegation_id uuid REFERENCES private.team_delegations(id) ON DELETE RESTRICT,
 delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sending','sent','failed')),
 delivery_lease_id uuid,
 delivery_lease_until timestamptz,
 delivery_actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 delivery_session_id uuid,
 last_delivery_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 attempts_started_at timestamptz,
 verified_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 verified_session_id uuid,
 verified_until timestamptz,
 password_existing_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 verified_password_fingerprint text CHECK (verified_password_fingerprint ~ '^[0-9a-f]{64}$'),
 accepted_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 accepted_at timestamptz,
 FOREIGN KEY (office_id,inviter_membership_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT,
 CHECK ((authority_role='owner' AND delegation_id IS NULL) OR (authority_role='admin' AND delegation_id IS NOT NULL))
);
CREATE INDEX team_invitations_office_list_idx ON private.team_invitations(office_id,created_at DESC,id DESC);
CREATE INDEX team_invitations_email_idx ON private.team_invitations(email,office_id) WHERE status='pending';
CREATE INDEX team_invitations_inviter_idx ON private.team_invitations(inviter_membership_id);
CREATE INDEX team_invitations_delegation_idx ON private.team_invitations(delegation_id);
CREATE INDEX team_invitations_inviter_user_idx ON private.team_invitations(inviter_user_id);
CREATE INDEX team_invitations_delivery_actor_idx ON private.team_invitations(delivery_actor_id);
CREATE INDEX team_invitations_verified_user_idx ON private.team_invitations(verified_user_id);
CREATE INDEX team_invitations_password_existing_user_idx ON private.team_invitations(password_existing_user_id);
CREATE INDEX team_invitations_accepted_user_idx ON private.team_invitations(accepted_user_id);
ALTER TABLE private.team_member_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.team_member_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.team_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.team_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.team_member_permissions,private.team_member_identities,private.team_delegations,private.team_invitations
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.team_require_identity() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid := auth.uid();
BEGIN
 IF caller IS NULL OR NOT EXISTS (
   SELECT FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id
   WHERE u.id=caller AND u.email_confirmed_at IS NOT NULL AND NOT u.is_anonymous
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
    AND s.id::text=(auth.jwt()->>'session_id') AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
 ) THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401'; END IF;
 RETURN caller;
END $$;

-- Deadlines use wall time so waiting on a lock cannot preserve expired authority.
-- Internal, session-independent predicate: does not grant access to its caller.
CREATE FUNCTION private.team_user_active(p_user_id uuid,p_office_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS (SELECT FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id AND p.active
  JOIN public.offices o ON o.id=m.office_id AND o.active
  JOIN public.roles r ON r.code=m.role_code AND r.active
  JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND NOT u.is_anonymous
   AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
  WHERE m.user_id=p_user_id AND m.office_id=p_office_id AND m.active);
$$;
CREATE FUNCTION private.team_permissions_for_member(p_membership_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(array_agg(DISTINCT c.code ORDER BY c.code),ARRAY[]::text[])
 FROM public.memberships m CROSS JOIN LATERAL (
  SELECT rp.permission_code AS code FROM public.role_permissions rp WHERE rp.role_code=m.role_code
  UNION SELECT mp.permission_code FROM private.team_member_permissions mp WHERE mp.membership_id=m.id
  UNION SELECT unnest(d.allowed_permissions) FROM private.team_delegations d
   WHERE d.membership_id=m.id AND m.role_code='admin' AND d.revoked_at IS NULL AND d.expires_at>clock_timestamp()
  UNION SELECT 'users.manage' FROM private.team_delegations d
   WHERE d.membership_id=m.id AND m.role_code='admin' AND d.revoked_at IS NULL AND d.expires_at>clock_timestamp()
  UNION SELECT 'users.owners.create' FROM private.team_delegations d
   WHERE d.membership_id=m.id AND m.role_code='admin' AND d.revoked_at IS NULL AND d.expires_at>clock_timestamp() AND d.can_create_owner
 ) granted JOIN public.permissions c ON c.code=granted.code AND c.active
 WHERE m.id=p_membership_id AND private.team_user_active(m.user_id,m.office_id);
$$;
CREATE OR REPLACE FUNCTION private.current_permissions(p_office_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT private.team_permissions_for_member(m.id)
  FROM public.memberships m JOIN auth.sessions s ON s.user_id=m.user_id
   AND s.id::text=(auth.jwt()->>'session_id') AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
  WHERE m.office_id=p_office_id AND m.user_id=auth.uid()),ARRAY[]::text[]);
$$;
CREATE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read'],
   'can_create_owner',private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],'can_delegate',true,'delegation_id',NULL);
 END IF;
 SELECT * INTO d FROM private.team_delegations WHERE membership_id=m.id AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF m.role_code<>'admin' OR d.id IS NULL THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','admin',
  'allowed_roles',d.allowed_roles,'allowed_permissions',d.allowed_permissions,'can_create_owner',
  d.can_create_owner AND private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],
  'can_delegate',false,'delegation_id',d.id);
END $$;
CREATE FUNCTION private.team_actor(p_office_id uuid,p_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid; member_id uuid;
BEGIN
 caller := private.team_require_identity();
 IF p_lock THEN
  PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE;
  caller:=private.team_require_identity();
 END IF;
 SELECT id INTO member_id FROM public.memberships WHERE office_id=p_office_id AND user_id=caller;
 RETURN private.team_scope_for_member(member_id);
END $$;
CREATE FUNCTION private.team_audit(p_office_id uuid,p_actor uuid,p_action text,p_type text,p_target uuid,p_request uuid,p_changes jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_request IS NULL THEN RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type,target_id,request_id,changes)
 VALUES (p_office_id,p_actor,'user',p_action,p_type,p_target,p_request,p_changes);
END $$;
CREATE FUNCTION private.team_validate_assignment(p_actor jsonb,p_role text,p_permissions text[],p_creating_owner boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('employee','admin','owner') OR p_permissions IS NULL
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read'])
  OR cardinality(p_permissions)<>(SELECT count(DISTINCT x) FROM unnest(p_permissions) x)
  OR NOT EXISTS (SELECT FROM public.roles WHERE code=p_role AND active)
  OR EXISTS (SELECT FROM unnest(p_permissions) x WHERE NOT EXISTS(SELECT FROM public.permissions WHERE code=x AND active)) THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT (p_actor->'allowed_roles' ? p_role) OR NOT (p_actor->'allowed_permissions' @> to_jsonb(p_permissions))
  OR (p_role='owner' AND p_creating_owner AND NOT (p_actor->>'can_create_owner')::boolean) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
END $$;
CREATE FUNCTION private.team_guard_member(p_actor jsonb,p_member public.memberships,p_role text,p_active boolean,p_allow_client boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_member.id IS NULL OR p_member.office_id<>(p_actor->>'office_id')::uuid OR p_active IS NULL
  OR (p_member.role_code='client' AND NOT p_allow_client) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF p_actor->>'role_code'='admin' AND p_member.user_id=(p_actor->>'user_id')::uuid THEN
  RAISE EXCEPTION 'SELF_CHANGE' USING ERRCODE='PT403'; END IF;
 IF p_actor->>'role_code'='admin' AND (p_member.role_code='owner'
  OR (p_member.role_code<>'client' AND NOT (p_actor->'allowed_roles' ? p_member.role_code))
  OR EXISTS (SELECT FROM private.team_delegations WHERE membership_id=p_member.id AND revoked_at IS NULL AND expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF p_member.role_code='owner' AND p_member.active AND (NOT p_active OR p_role<>'owner')
  AND NOT EXISTS (SELECT FROM public.memberships m WHERE m.office_id=p_member.office_id AND m.role_code='owner'
   AND m.id<>p_member.id AND private.team_user_active(m.user_id,m.office_id)) THEN
  RAISE EXCEPTION 'LAST_OWNER' USING ERRCODE='PT409'; END IF;
END $$;
CREATE FUNCTION private.team_normalize_cpf(p_cpf text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE digits text; total integer; check_digit integer; i integer; step integer;
BEGIN
 IF p_cpf IS NULL OR char_length(p_cpf)>18 OR p_cpf !~ '^[0-9. -]+$' THEN RETURN NULL; END IF;
 digits:=regexp_replace(p_cpf,'[^0-9]','','g');
 IF length(digits)<>11 OR digits=repeat(substr(digits,1,1),11) THEN RETURN NULL; END IF;
 FOR step IN 1..2 LOOP
  total:=0;
  FOR i IN 1..(8+step) LOOP total:=total+substr(digits,i,1)::integer*(10+step-i); END LOOP;
  check_digit:=(total*10)%11; IF check_digit=10 THEN check_digit:=0; END IF;
  IF substr(digits,9+step,1)::integer<>check_digit THEN RETURN NULL; END IF;
 END LOOP;
 RETURN digits;
END $$;
CREATE FUNCTION private.team_normalize_name(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT lower(normalize(regexp_replace(btrim(p_name),'\s+',' ','g')));
$$;
CREATE FUNCTION private.team_invitation_authority(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS (SELECT FROM private.team_invitations i JOIN public.memberships m
  ON m.id=i.inviter_membership_id AND m.user_id=i.inviter_user_id AND m.office_id=i.office_id
  WHERE i.id=p_id AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']
   AND ((i.authority_role='owner' AND m.role_code='owner'
     AND (i.role_code<>'owner' OR private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create']))
    OR (i.authority_role='admin' AND m.role_code='admin' AND EXISTS (
     SELECT FROM private.team_delegations d WHERE d.id=i.delegation_id AND d.membership_id=m.id
      AND d.revoked_at IS NULL AND d.expires_at>clock_timestamp() AND d.allowed_roles @> ARRAY[i.role_code]
      AND d.allowed_permissions @> i.permissions AND (i.role_code<>'owner' OR (d.can_create_owner
       AND private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create']))))));
$$;
CREATE FUNCTION private.team_recipient(p_id uuid,p_lock boolean DEFAULT false) RETURNS private.team_invitations
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid; invitation private.team_invitations; caller_email text;
BEGIN
 caller:=private.team_require_identity();
 SELECT * INTO invitation FROM private.team_invitations WHERE id=p_id;
 SELECT lower(btrim(email)) INTO caller_email FROM auth.users WHERE id=caller;
 IF invitation.id IS NULL OR caller_email IS NULL OR caller_email<>invitation.email THEN
  RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410'; END IF;
 IF p_lock THEN
  PERFORM 1 FROM public.offices WHERE id=invitation.office_id FOR UPDATE;
  SELECT * INTO invitation FROM private.team_invitations WHERE id=p_id FOR UPDATE;
  PERFORM private.team_require_identity();
  SELECT lower(btrim(email)) INTO caller_email FROM auth.users WHERE id=caller;
  IF caller_email IS NULL OR caller_email<>invitation.email THEN
   RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410'; END IF;
 END IF;
 IF invitation.status<>'pending' OR invitation.expires_at<=clock_timestamp() OR NOT private.team_invitation_authority(p_id) THEN
  RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410'; END IF;
 RETURN invitation;
END $$;

-- GoTrue can generate a temporary password while verifying an invite link.
-- A nonempty provider hash alone cannot prove that its owner chose a password.
-- Only an already trusted account, or a change after our identity verification,
-- enables acceptance. Store SHA256 of that hash, never a second bcrypt copy.
CREATE FUNCTION private.team_has_password(p_invitation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS (SELECT FROM private.team_invitations i JOIN auth.users u ON u.id=auth.uid()
  WHERE i.id=p_invitation_id AND coalesce(u.encrypted_password<>'',false)
   AND (i.password_existing_user_id=u.id OR (i.verified_user_id=u.id
    AND i.verified_session_id::text=(auth.jwt()->>'session_id') AND i.verified_until>clock_timestamp()
    AND i.verified_password_fingerprint IS NOT NULL
    AND encode(extensions.digest(u.encrypted_password,'sha256'),'hex')<>i.verified_password_fingerprint)));
$$;

CREATE FUNCTION private.team_dashboard(p_office_id uuid,p_kind text,p_page integer,p_query text,p_status text) RETURNS jsonb
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

CREATE FUNCTION private.team_create_invitation(p_office_id uuid,p_email text,p_full_name text,p_cpf text,p_role_code text,p_permissions text[],p_expires_at timestamptz,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; digits text; expires timestamptz:=coalesce(p_expires_at,clock_timestamp()+interval '72 hours'); invitation_id uuid; safe_name text; existing_password_user uuid;
BEGIN
 actor:=private.team_actor(p_office_id,true);
 PERFORM private.team_validate_assignment(actor,p_role_code,p_permissions,true);
 digits:=private.team_normalize_cpf(p_cpf); safe_name:=normalize(regexp_replace(btrim(p_full_name),'\s+',' ','g'));
 IF digits IS NULL OR safe_name IS NULL OR length(safe_name) NOT BETWEEN 3 AND 120
  OR safe_name !~ '^[[:alpha:]][[:alpha:]''’-]*( [[:alpha:]][[:alpha:]''’-]*)+$'
  OR p_email IS NULL OR length(p_email)>254 OR btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  OR expires<=clock_timestamp() OR expires>clock_timestamp()+interval '7 days' THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF EXISTS (SELECT FROM private.team_invitations WHERE office_id=p_office_id AND email=lower(btrim(p_email))
   AND status='pending' AND expires_at>clock_timestamp() AND private.team_invitation_authority(id)) THEN
  RAISE EXCEPTION 'TEAM_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT u.id INTO existing_password_user FROM auth.users u WHERE lower(btrim(u.email))=lower(btrim(p_email))
  AND u.deleted_at IS NULL AND coalesce(u.encrypted_password<>'',false)
  AND (u.invited_at IS NULL OR EXISTS (SELECT FROM private.team_invitations prior
   WHERE prior.accepted_user_id=u.id AND prior.status='accepted')) LIMIT 1;
 INSERT INTO private.team_invitations(office_id,email,full_name,cpf_hash,cpf_masked,role_code,permissions,expires_at,
   inviter_user_id,inviter_membership_id,authority_role,delegation_id,password_existing_user_id)
 VALUES (p_office_id,lower(btrim(p_email)),safe_name,extensions.crypt(digits,extensions.gen_salt('bf',10)),
   '***.***.***-'||right(digits,2),p_role_code,p_permissions,expires,(actor->>'user_id')::uuid,
   (actor->>'membership_id')::uuid,actor->>'role_code',(actor->>'delegation_id')::uuid,existing_password_user) RETURNING id INTO invitation_id;
 PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.invitation_created','invitation',invitation_id,p_request_id,
  jsonb_build_object('role_code',p_role_code,'permissions',p_permissions));
 RETURN jsonb_build_object('id',invitation_id,'expires_at',expires);
END $$;
CREATE FUNCTION private.team_claim_delivery(p_office_id uuid,p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; invitation private.team_invitations; lease uuid:=gen_random_uuid();
BEGIN
 actor:=private.team_actor(p_office_id,true);
 SELECT * INTO invitation FROM private.team_invitations WHERE id=p_invitation_id AND office_id=p_office_id FOR UPDATE;
 IF invitation.id IS NULL OR NOT (actor->'allowed_roles' ? invitation.role_code) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF invitation.status<>'pending' OR invitation.expires_at<=clock_timestamp() OR NOT private.team_invitation_authority(invitation.id) THEN
  RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410'; END IF;
 PERFORM private.team_validate_assignment(actor,invitation.role_code,invitation.permissions,true);
 IF invitation.last_delivery_at>clock_timestamp()-interval '60 seconds' THEN RAISE EXCEPTION 'TEAM_RATE_LIMIT' USING ERRCODE='PT429'; END IF;
 UPDATE private.team_invitations SET delivery_status='sending',delivery_lease_id=lease,delivery_lease_until=clock_timestamp()+interval '60 seconds',
  delivery_actor_id=(actor->>'user_id')::uuid,delivery_session_id=(auth.jwt()->>'session_id')::uuid,last_delivery_at=clock_timestamp() WHERE id=invitation.id;
 PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.invitation_delivery_claimed','invitation',invitation.id,p_request_id,'{}');
 RETURN jsonb_build_object('email',invitation.email,'invitation_id',invitation.id,'lease_id',lease);
END $$;
CREATE FUNCTION private.team_finish_delivery(p_invitation_id uuid,p_lease_id uuid,p_sent boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation private.team_invitations;
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 SELECT * INTO invitation FROM private.team_invitations WHERE id=p_invitation_id;
 IF invitation.id IS NULL THEN RETURN jsonb_build_object('recorded',false); END IF;
 PERFORM 1 FROM public.offices WHERE id=invitation.office_id FOR UPDATE;
 SELECT * INTO invitation FROM private.team_invitations WHERE id=p_invitation_id FOR UPDATE;
 IF p_sent IS NULL OR p_lease_id IS NULL OR invitation.delivery_lease_id IS DISTINCT FROM p_lease_id
  OR invitation.delivery_lease_until<=clock_timestamp() OR invitation.status<>'pending' OR invitation.expires_at<=clock_timestamp()
  OR NOT private.team_invitation_authority(invitation.id)
  OR NOT EXISTS (SELECT FROM auth.sessions s WHERE s.id=invitation.delivery_session_id AND s.user_id=invitation.delivery_actor_id
    AND (s.not_after IS NULL OR s.not_after>clock_timestamp()))
  OR NOT EXISTS (SELECT FROM public.memberships m WHERE m.user_id=invitation.delivery_actor_id AND m.office_id=invitation.office_id
    AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RETURN jsonb_build_object('recorded',false); END IF;
 UPDATE private.team_invitations SET delivery_status=CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
  delivery_lease_id=NULL,delivery_lease_until=NULL WHERE id=invitation.id;
 PERFORM private.team_audit(invitation.office_id,invitation.delivery_actor_id,
  CASE WHEN p_sent THEN 'team.invitation_sent' ELSE 'team.invitation_delivery_failed' END,'invitation',invitation.id,gen_random_uuid(),'{}');
 RETURN jsonb_build_object('recorded',true);
END $$;
CREATE FUNCTION private.team_revoke_invitation(p_office_id uuid,p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; invitation private.team_invitations;
BEGIN
 actor:=private.team_actor(p_office_id,true);
 SELECT * INTO invitation FROM private.team_invitations WHERE id=p_invitation_id AND office_id=p_office_id FOR UPDATE;
 IF invitation.id IS NULL OR NOT (actor->'allowed_roles' ? invitation.role_code)
  OR (invitation.role_code='owner' AND NOT (actor->>'can_create_owner')::boolean) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF invitation.status NOT IN ('pending','blocked') THEN RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410'; END IF;
 PERFORM private.team_validate_assignment(actor,invitation.role_code,invitation.permissions,true);
 UPDATE private.team_invitations SET status='revoked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL WHERE id=invitation.id;
 PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.invitation_revoked','invitation',invitation.id,p_request_id,'{}');
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE FUNCTION private.team_set_member(p_office_id uuid,p_membership_id uuid,p_role_code text,p_active boolean,p_permissions text[],p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; target public.memberships;
BEGIN
 actor:=private.team_actor(p_office_id,true);
 SELECT * INTO target FROM public.memberships WHERE id=p_membership_id AND office_id=p_office_id FOR UPDATE;
 PERFORM private.team_validate_assignment(actor,p_role_code,p_permissions);
 PERFORM private.team_guard_member(actor,target,p_role_code,p_active);
 IF p_role_code='owner' AND target.role_code<>'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 UPDATE public.memberships SET role_code=p_role_code,active=p_active WHERE id=target.id;
 DELETE FROM private.team_member_permissions WHERE membership_id=target.id;
 INSERT INTO private.team_member_permissions SELECT target.id,unnest(p_permissions);
 IF NOT p_active OR target.role_code<>p_role_code THEN
  UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id=target.id AND revoked_at IS NULL;
  UPDATE private.team_invitations SET status='blocked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL
   WHERE inviter_membership_id=target.id AND status='pending';
 END IF;
 PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.member_updated','membership',target.id,p_request_id,
  jsonb_build_object('role_code',p_role_code,'active',p_active,'permissions',p_permissions));
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE FUNCTION private.team_set_delegation(p_office_id uuid,p_membership_id uuid,p_allowed_roles text[],p_allowed_permissions text[],p_can_create_owner boolean,p_expires_at timestamptz,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; target public.memberships; delegation uuid; expires timestamptz:=coalesce(p_expires_at,clock_timestamp()+interval '30 days'); role_item text;
BEGIN
 actor:=private.team_actor(p_office_id,true);
 IF actor->>'role_code'<>'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 SELECT * INTO target FROM public.memberships WHERE id=p_membership_id AND office_id=p_office_id FOR UPDATE;
 IF target.id IS NULL OR target.role_code<>'admin' OR NOT private.team_user_active(target.user_id,p_office_id) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF p_allowed_roles IS NULL OR cardinality(p_allowed_roles)<1 OR cardinality(p_allowed_roles)>3
  OR NOT (p_allowed_roles <@ ARRAY['employee','admin','owner']) OR array_position(p_allowed_roles,NULL) IS NOT NULL
  OR cardinality(p_allowed_roles)<>(SELECT count(DISTINCT x) FROM unnest(p_allowed_roles) x)
  OR p_can_create_owner IS NULL OR (p_can_create_owner AND NOT p_allowed_roles @> ARRAY['owner'])
  OR (p_allowed_roles @> ARRAY['owner'] AND NOT p_can_create_owner)
  OR expires<=clock_timestamp() OR expires>clock_timestamp()+interval '90 days' THEN RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 FOREACH role_item IN ARRAY p_allowed_roles LOOP
  PERFORM private.team_validate_assignment(actor,role_item,p_allowed_permissions,p_can_create_owner);
 END LOOP;
 UPDATE private.team_invitations SET status='blocked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL
  WHERE delegation_id IN (SELECT id FROM private.team_delegations WHERE membership_id=target.id AND revoked_at IS NULL) AND status='pending';
 UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id=target.id AND revoked_at IS NULL;
 INSERT INTO private.team_delegations(office_id,membership_id,allowed_roles,allowed_permissions,can_create_owner,expires_at,created_by)
 VALUES (p_office_id,target.id,p_allowed_roles,p_allowed_permissions,p_can_create_owner,expires,(actor->>'user_id')::uuid) RETURNING id INTO delegation;
 PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.delegation_granted','delegation',delegation,p_request_id,
  jsonb_build_object('membership_id',target.id,'allowed_roles',p_allowed_roles,'allowed_permissions',p_allowed_permissions,
   'can_create_owner',p_can_create_owner,'expires_at',expires));
 RETURN jsonb_build_object('id',delegation);
END $$;
CREATE FUNCTION private.team_revoke_delegation(p_office_id uuid,p_delegation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; delegation private.team_delegations;
BEGIN
 actor:=private.team_actor(p_office_id,true);
 IF actor->>'role_code'<>'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 SELECT * INTO delegation FROM private.team_delegations WHERE id=p_delegation_id AND office_id=p_office_id FOR UPDATE;
 IF delegation.id IS NULL THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF delegation.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'INVITATION_INVALID' USING ERRCODE='PT410'; END IF;
 UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE id=delegation.id;
 UPDATE private.team_invitations SET status='blocked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL
  WHERE delegation_id=delegation.id AND status='pending';
 PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.delegation_revoked','delegation',delegation.id,p_request_id,'{}');
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE FUNCTION private.team_invitation_state(p_invitation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation private.team_invitations; password_exists boolean; verified boolean;
BEGIN
 invitation:=private.team_recipient(p_invitation_id);
 password_exists:=private.team_has_password(invitation.id);
 verified:=coalesce(invitation.verified_user_id=auth.uid() AND invitation.verified_session_id::text=(auth.jwt()->>'session_id') AND invitation.verified_until>clock_timestamp(),false);
 RETURN jsonb_build_object('id',invitation.id,'office_name',(SELECT name FROM public.offices WHERE id=invitation.office_id),
  'verified',verified,'has_password',password_exists,'verified_until',CASE WHEN verified THEN invitation.verified_until ELSE NULL END);
END $$;
CREATE FUNCTION private.team_verify_invitation(p_invitation_id uuid,p_full_name text,p_cpf text,p_role_code text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation private.team_invitations; digits text; password_exists boolean;
BEGIN
 invitation:=private.team_recipient(p_invitation_id,true);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF invitation.attempts_started_at IS NULL OR invitation.attempts_started_at<=clock_timestamp()-interval '15 minutes' THEN
  invitation.attempts:=0; invitation.attempts_started_at:=clock_timestamp();
 END IF;
 IF invitation.attempts>=5 THEN RETURN jsonb_build_object('verified',false,'code','TEAM_RATE_LIMIT'); END IF;
 digits:=private.team_normalize_cpf(p_cpf);
 IF digits IS NULL OR private.team_normalize_name(p_full_name) IS DISTINCT FROM private.team_normalize_name(invitation.full_name)
  OR p_role_code IS DISTINCT FROM invitation.role_code OR extensions.crypt(digits,invitation.cpf_hash) IS DISTINCT FROM invitation.cpf_hash THEN
  UPDATE private.team_invitations SET attempts=invitation.attempts+1,attempts_started_at=invitation.attempts_started_at,
   verified_user_id=NULL,verified_session_id=NULL,verified_until=NULL,verified_password_fingerprint=NULL WHERE id=invitation.id;
  RETURN jsonb_build_object('verified',false,'code','IDENTITY_MISMATCH');
 END IF;
 UPDATE private.team_invitations SET attempts=0,attempts_started_at=NULL,verified_user_id=auth.uid(),
  verified_session_id=(auth.jwt()->>'session_id')::uuid,verified_until=clock_timestamp()+interval '15 minutes',
  verified_password_fingerprint=CASE WHEN invitation.verified_user_id=auth.uid()
    AND invitation.verified_session_id::text=(auth.jwt()->>'session_id') AND invitation.verified_until>clock_timestamp()
    AND invitation.verified_password_fingerprint IS NOT NULL THEN invitation.verified_password_fingerprint
   ELSE (SELECT encode(extensions.digest(coalesce(encrypted_password,''),'sha256'),'hex') FROM auth.users WHERE id=auth.uid()) END
  WHERE id=invitation.id;
 PERFORM private.team_audit(invitation.office_id,auth.uid(),'team.invitation_verified','invitation',invitation.id,p_request_id,'{}');
 password_exists:=private.team_has_password(invitation.id);
 RETURN jsonb_build_object('verified',true,'has_password',password_exists);
END $$;
CREATE FUNCTION private.team_accept_invitation(p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation private.team_invitations; actor jsonb; target public.memberships; caller uuid:=auth.uid(); target_id uuid;
BEGIN
 invitation:=private.team_recipient(p_invitation_id,true);
 IF invitation.verified_user_id IS DISTINCT FROM caller OR invitation.verified_session_id::text IS DISTINCT FROM (auth.jwt()->>'session_id')
  OR invitation.verified_until IS NULL OR invitation.verified_until<=clock_timestamp()
  OR NOT private.team_has_password(invitation.id) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 actor:=private.team_scope_for_member(invitation.inviter_membership_id);
 PERFORM private.team_validate_assignment(actor,invitation.role_code,invitation.permissions,true);
 IF EXISTS (SELECT FROM public.profiles WHERE id=caller AND NOT active) THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 SELECT * INTO target FROM public.memberships WHERE office_id=invitation.office_id AND user_id=caller FOR UPDATE;
 IF target.id IS NOT NULL THEN
  PERFORM private.team_guard_member(actor,target,invitation.role_code,true,true);
  UPDATE public.memberships SET role_code=invitation.role_code,active=true WHERE id=target.id RETURNING id INTO target_id;
  IF target.role_code<>invitation.role_code THEN
   UPDATE private.team_delegations SET revoked_at=clock_timestamp() WHERE membership_id=target.id AND revoked_at IS NULL;
   UPDATE private.team_invitations SET status='blocked',verified_until=NULL,delivery_lease_id=NULL,delivery_lease_until=NULL
    WHERE inviter_membership_id=target.id AND status='pending' AND id<>invitation.id;
  END IF;
 ELSE
  INSERT INTO public.profiles(id,display_name,created_by) VALUES(caller,invitation.full_name,invitation.inviter_user_id) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.memberships(office_id,user_id,role_code,created_by) VALUES(invitation.office_id,caller,invitation.role_code,invitation.inviter_user_id)
   RETURNING id INTO target_id;
 END IF;
 DELETE FROM private.team_member_permissions WHERE membership_id=target_id;
 INSERT INTO private.team_member_permissions SELECT target_id,unnest(invitation.permissions);
 INSERT INTO private.team_member_identities(membership_id,full_name,cpf_hash,cpf_masked)
 VALUES(target_id,invitation.full_name,invitation.cpf_hash,invitation.cpf_masked) ON CONFLICT(membership_id) DO UPDATE
  SET full_name=EXCLUDED.full_name,cpf_hash=EXCLUDED.cpf_hash,cpf_masked=EXCLUDED.cpf_masked,updated_at=clock_timestamp();
 UPDATE private.team_invitations SET status='accepted',accepted_user_id=caller,accepted_at=clock_timestamp(),verified_until=NULL,verified_password_fingerprint=NULL,
  delivery_lease_id=NULL,delivery_lease_until=NULL WHERE id=invitation.id;
 PERFORM private.team_audit(invitation.office_id,caller,'team.invitation_accepted','membership',target_id,p_request_id,
  jsonb_build_object('invitation_id',invitation.id,'role_code',invitation.role_code,'permissions',invitation.permissions));
 RETURN jsonb_build_object('office_id',invitation.office_id,'role_code',invitation.role_code);
END $$;

-- A trusted pending invitation suppresses the unrelated public-client bootstrap.
-- Metadata never participates in this decision and grants no team role.
CREATE OR REPLACE FUNCTION private.register_new_client() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_office uuid; membership_uuid uuid; safe_name text;
BEGIN
 IF NEW.email IS NOT NULL AND EXISTS (SELECT FROM private.team_invitations i WHERE i.email=lower(btrim(NEW.email))
  AND i.status='pending' AND i.expires_at>clock_timestamp() AND private.team_invitation_authority(i.id)) THEN RETURN NEW; END IF;
 SELECT c.office_id INTO target_office FROM private.client_registration_settings c
  JOIN public.offices o ON o.id=c.office_id AND o.active WHERE c.singleton AND c.enabled;
 IF target_office IS NULL OR NEW.email IS NULL OR NEW.is_anonymous THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.raw_user_meta_data->'display_name')='string' THEN safe_name:=nullif(left(btrim(NEW.raw_user_meta_data->>'display_name'),120),''); END IF;
 INSERT INTO public.profiles(id,display_name,created_by,created_by_db_role) VALUES(NEW.id,safe_name,NULL,session_user);
 INSERT INTO public.memberships(office_id,user_id,role_code,created_by,created_by_db_role)
 VALUES(target_office,NEW.id,'client',NULL,session_user) RETURNING id INTO membership_uuid;
 INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,changes)
 VALUES(target_office,'operator',session_user,'auth.client_registered','membership',membership_uuid,jsonb_build_object('role_code','client'));
 RETURN NEW;
END $$;

-- Public entry points are deliberately SECURITY INVOKER; only private RPC
-- implementations are granted, never internal predicates/mutation helpers.
CREATE FUNCTION public.team_dashboard(p_office_id uuid,p_kind text,p_page integer,p_query text,p_status text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_dashboard(p_office_id,p_kind,p_page,p_query,p_status); $$;
CREATE FUNCTION public.team_create_invitation(p_office_id uuid,p_email text,p_full_name text,p_cpf text,p_role_code text,p_permissions text[],p_expires_at timestamptz,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_create_invitation(p_office_id,p_email,p_full_name,p_cpf,p_role_code,p_permissions,p_expires_at,p_request_id); $$;
CREATE FUNCTION public.team_claim_delivery(p_office_id uuid,p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_claim_delivery(p_office_id,p_invitation_id,p_request_id); $$;
CREATE FUNCTION public.team_finish_delivery(p_invitation_id uuid,p_lease_id uuid,p_sent boolean) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_finish_delivery(p_invitation_id,p_lease_id,p_sent); $$;
CREATE FUNCTION public.team_revoke_invitation(p_office_id uuid,p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_revoke_invitation(p_office_id,p_invitation_id,p_request_id); $$;
CREATE FUNCTION public.team_set_member(p_office_id uuid,p_membership_id uuid,p_role_code text,p_active boolean,p_permissions text[],p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_set_member(p_office_id,p_membership_id,p_role_code,p_active,p_permissions,p_request_id); $$;
CREATE FUNCTION public.team_set_delegation(p_office_id uuid,p_membership_id uuid,p_allowed_roles text[],p_allowed_permissions text[],p_can_create_owner boolean,p_expires_at timestamptz,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_set_delegation(p_office_id,p_membership_id,p_allowed_roles,p_allowed_permissions,p_can_create_owner,p_expires_at,p_request_id); $$;
CREATE FUNCTION public.team_revoke_delegation(p_office_id uuid,p_delegation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_revoke_delegation(p_office_id,p_delegation_id,p_request_id); $$;
CREATE FUNCTION public.team_invitation_state(p_invitation_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_invitation_state(p_invitation_id); $$;
CREATE FUNCTION public.team_verify_invitation(p_invitation_id uuid,p_full_name text,p_cpf text,p_role_code text,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_verify_invitation(p_invitation_id,p_full_name,p_cpf,p_role_code,p_request_id); $$;
CREATE FUNCTION public.team_accept_invitation(p_invitation_id uuid,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.team_accept_invitation(p_invitation_id,p_request_id); $$;
DO $$ DECLARE target record; BEGIN
 FOR target IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('private','public') AND p.proname LIKE 'team\_%' ESCAPE '\'
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',target.signature); END LOOP;
END $$;
GRANT USAGE ON SCHEMA private TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.team_dashboard(uuid,text,integer,text,text),private.team_dashboard(uuid,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_create_invitation(uuid,text,text,text,text,text[],timestamptz,uuid),private.team_create_invitation(uuid,text,text,text,text,text[],timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_claim_delivery(uuid,uuid,uuid),private.team_claim_delivery(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_finish_delivery(uuid,uuid,boolean),private.team_finish_delivery(uuid,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_revoke_invitation(uuid,uuid,uuid),private.team_revoke_invitation(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_set_member(uuid,uuid,text,boolean,text[],uuid),private.team_set_member(uuid,uuid,text,boolean,text[],uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_set_delegation(uuid,uuid,text[],text[],boolean,timestamptz,uuid),private.team_set_delegation(uuid,uuid,text[],text[],boolean,timestamptz,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_revoke_delegation(uuid,uuid,uuid),private.team_revoke_delegation(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_invitation_state(uuid),private.team_invitation_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_verify_invitation(uuid,text,text,text,uuid),private.team_verify_invitation(uuid,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_accept_invitation(uuid,uuid),private.team_accept_invitation(uuid,uuid) TO authenticated;
