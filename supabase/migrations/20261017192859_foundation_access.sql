-- Etapa 03. Catalog seed is versioned here so an empty replay is sufficient.
-- Apply atomically. No Auth accounts, passwords, SMTP or public signup trigger.
-- Preserve Supabase's existing RLS event trigger, but remove its unnecessary API EXECUTE.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='rls_auto_enable' AND p.pronargs=0
      AND p.prorettype='pg_catalog.event_trigger'::pg_catalog.regtype) THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated,service_role;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (name=btrim(name) AND char_length(name) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_db_role name NOT NULL DEFAULT current_user
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name text CHECK (display_name=btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_db_role name NOT NULL DEFAULT current_user
);
CREATE TABLE public.roles (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_db_role name NOT NULL DEFAULT current_user
);
CREATE TABLE public.permissions (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_db_role name NOT NULL DEFAULT current_user
);
CREATE TABLE public.role_permissions (
  role_code text NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_db_role name NOT NULL DEFAULT current_user,
  PRIMARY KEY (role_code,permission_code)
);
CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  role_code text NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_db_role name NOT NULL DEFAULT current_user,
  UNIQUE (office_id,user_id),
  UNIQUE (office_id,id)
);
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','operator')),
  actor_db_role name,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  target_type text NOT NULL CHECK (char_length(target_type) BETWEEN 1 AND 80),
  target_id uuid,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','failure')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(changes)='object'),
  CHECK ((actor_kind='user' AND actor_id IS NOT NULL AND actor_db_role IS NULL)
    OR (actor_kind='operator' AND actor_id IS NULL AND actor_db_role IS NOT NULL))
);

CREATE INDEX offices_created_by_idx ON public.offices(created_by);
CREATE INDEX profiles_created_by_idx ON public.profiles(created_by);
CREATE INDEX roles_created_by_idx ON public.roles(created_by);
CREATE INDEX permissions_created_by_idx ON public.permissions(created_by);
CREATE INDEX role_permissions_created_by_idx ON public.role_permissions(created_by);
CREATE INDEX role_permissions_permission_idx ON public.role_permissions(permission_code);
CREATE INDEX memberships_created_by_idx ON public.memberships(created_by);
CREATE INDEX memberships_user_office_idx ON public.memberships(user_id,office_id);
CREATE INDEX memberships_role_idx ON public.memberships(role_code);
CREATE INDEX audit_events_office_time_idx ON public.audit_events(office_id,occurred_at DESC,id DESC);
CREATE INDEX audit_events_actor_idx ON public.audit_events(actor_id);

INSERT INTO public.roles(code,name) VALUES
  ('owner','Proprietário'),('admin','Administrador delegado'),('employee','Funcionário'),('client','Cliente');
INSERT INTO public.permissions(code,name) VALUES
  ('foundation.access','Acessar a base do escritório'),('audit.read','Consultar auditoria do escritório');
INSERT INTO public.role_permissions(role_code,permission_code) VALUES
  ('owner','foundation.access'),('owner','audit.read'),('admin','foundation.access'),
  ('employee','foundation.access'),('client','foundation.access');

CREATE FUNCTION private.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
CREATE TRIGGER offices_updated BEFORE UPDATE ON public.offices FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER roles_updated BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER permissions_updated BEFORE UPDATE ON public.permissions FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();
CREATE TRIGGER memberships_updated BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

-- Sole privileged authorization helper. It reads the authoritative tables as their
-- owner to avoid recursive policies; no superuser/BYPASSRLS grant is required.
CREATE FUNCTION private.current_permissions(p_office_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(rp.permission_code ORDER BY rp.permission_code),ARRAY[]::text[])
  FROM public.memberships m
  JOIN public.profiles p ON p.id=m.user_id AND p.active
  JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
  JOIN public.offices o ON o.id=m.office_id AND o.active
  JOIN public.roles r ON r.code=m.role_code AND r.active
  JOIN public.role_permissions rp ON rp.role_code=r.code
  JOIN public.permissions c ON c.code=rp.permission_code AND c.active
  WHERE (SELECT auth.uid()) IS NOT NULL AND m.user_id=(SELECT auth.uid())
    AND m.office_id=p_office_id AND m.active;
$$;

ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
-- Explicit deny for all mutations; separate SELECT policies permit limited reading.
CREATE POLICY offices_deny ON public.offices FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY profiles_deny ON public.profiles FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY roles_deny ON public.roles FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY permissions_deny ON public.permissions FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY role_permissions_deny ON public.role_permissions FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY memberships_deny ON public.memberships FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY audit_events_deny ON public.audit_events FOR ALL TO anon,authenticated USING (false) WITH CHECK (false);
CREATE POLICY offices_read ON public.offices FOR SELECT TO authenticated
  USING (private.current_permissions(id) @> ARRAY['foundation.access']);
CREATE POLICY memberships_read ON public.memberships FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()) AND private.current_permissions(office_id) @> ARRAY['foundation.access']);
CREATE POLICY profiles_read ON public.profiles FOR SELECT TO authenticated
  USING (id=(SELECT auth.uid()) AND active AND EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.user_id=profiles.id
  ));
CREATE POLICY audit_events_read ON public.audit_events FOR SELECT TO authenticated
  USING (private.current_permissions(office_id) @> ARRAY['foundation.access','audit.read']);

CREATE FUNCTION public.access_context(p_office_id uuid)
RETURNS TABLE(office_id uuid,user_id uuid,role_code text,permissions text[])
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT m.office_id,m.user_id,m.role_code,private.current_permissions(m.office_id)
  FROM public.memberships m
  WHERE m.office_id=p_office_id AND m.user_id=(SELECT auth.uid());
$$;

-- Operator-only first-owner bootstrap. Subject identity is explicit; actor is
-- the trusted SQL operator, not an invented Auth session for that subject.
CREATE FUNCTION private.provision_owner(p_user_id uuid,p_office_name text,p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE office_uuid uuid; membership_uuid uuid;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_office_name IS NULL
    OR char_length(btrim(p_office_name)) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Parâmetros de provisionamento inválidos.' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now())) THEN
    RAISE EXCEPTION 'Identidade confirmada necessária.' USING ERRCODE='23514';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('escritoriojn.foundation.provision_owner',0));
  IF EXISTS (SELECT 1 FROM public.offices) THEN
    RAISE EXCEPTION 'Fundação já provisionada; usar administração autorizada.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.profiles(id,created_by,created_by_db_role) VALUES (p_user_id,NULL,current_user)
    ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user_id AND active) THEN
    RAISE EXCEPTION 'Perfil inativo.' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.offices(name,created_by,created_by_db_role)
    VALUES (btrim(p_office_name),NULL,current_user) RETURNING id INTO office_uuid;
  INSERT INTO public.memberships(office_id,user_id,role_code,created_by,created_by_db_role)
    VALUES (office_uuid,p_user_id,'owner',NULL,current_user) RETURNING id INTO membership_uuid;
  INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,request_id,changes)
    VALUES (office_uuid,'operator',current_user,'foundation.owner_provisioned','membership',membership_uuid,
      p_request_id,pg_catalog.jsonb_build_object('role_code','owner'));
  RETURN office_uuid;
END;
$$;

CREATE FUNCTION private.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Auditoria oficial não permite alteração ou exclusão.' USING ERRCODE='55000'; END;
$$;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.reject_audit_mutation();

-- Neutralize hosted default grants on these exact objects, then grant the minimum.
REVOKE ALL ON public.offices,public.profiles,public.roles,public.permissions,
  public.role_permissions,public.memberships,public.audit_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.offices,public.profiles,public.memberships,public.audit_events TO authenticated;
REVOKE ALL ON FUNCTION private.touch_updated_at(),private.current_permissions(uuid),
  private.provision_owner(uuid,text,uuid),private.reject_audit_mutation(),public.access_context(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.current_permissions(uuid),public.access_context(uuid) TO authenticated;
