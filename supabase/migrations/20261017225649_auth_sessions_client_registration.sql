-- Etapa 04. Identity and session are provider-owned; business access stays current.
CREATE OR REPLACE FUNCTION private.current_permissions(p_office_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(rp.permission_code ORDER BY rp.permission_code),ARRAY[]::text[])
  FROM public.memberships m
  JOIN public.profiles p ON p.id=m.user_id AND p.active
  JOIN auth.users u ON u.id=p.id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND (u.banned_until IS NULL OR u.banned_until <= now())
  JOIN auth.sessions s ON s.user_id=u.id AND s.id::text=(SELECT auth.jwt()->>'session_id')
    AND (s.not_after IS NULL OR s.not_after>now())
  JOIN public.offices o ON o.id=m.office_id AND o.active
  JOIN public.roles r ON r.code=m.role_code AND r.active
  JOIN public.role_permissions rp ON rp.role_code=r.code
  JOIN public.permissions c ON c.code=rp.permission_code AND c.active
  WHERE (SELECT auth.uid()) IS NOT NULL AND m.user_id=(SELECT auth.uid())
    AND m.office_id=p_office_id AND m.active;
$$;

CREATE FUNCTION public.my_access_context()
RETURNS TABLE(office_id uuid,user_id uuid,role_code text,permissions text[],office_name text,display_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT m.office_id,m.user_id,m.role_code,private.current_permissions(m.office_id),o.name,p.display_name
  FROM public.memberships m JOIN public.offices o ON o.id=m.office_id
  JOIN public.profiles p ON p.id=m.user_id
  WHERE m.user_id=(SELECT auth.uid()) ORDER BY m.created_at,m.id LIMIT 100;
$$;

CREATE TABLE private.client_registration_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  office_id uuid REFERENCES public.offices(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR office_id IS NOT NULL)
);
ALTER TABLE private.client_registration_settings ENABLE ROW LEVEL SECURITY;
CREATE INDEX client_registration_office_idx ON private.client_registration_settings(office_id);
-- One existing active office can be selected by the authorized migration. Empty or
-- ambiguous installations stay disabled until an operator configures them explicitly.
INSERT INTO private.client_registration_settings(singleton,office_id,enabled)
  SELECT true,CASE WHEN count(*)=1 THEN min(id::text)::uuid ELSE NULL END,count(*)=1
  FROM public.offices WHERE active;

CREATE FUNCTION private.configure_client_registration(p_office_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_enabled IS NULL OR NOT EXISTS (SELECT 1 FROM public.offices WHERE id=p_office_id AND active) THEN
    RAISE EXCEPTION 'Escritório ativo necessário.' USING ERRCODE='23514';
  END IF;
  UPDATE private.client_registration_settings
    SET office_id=p_office_id,enabled=p_enabled,updated_at=now() WHERE singleton;
  INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,changes)
    VALUES (p_office_id,'operator',current_user,'auth.registration_configured','office',p_office_id,
      jsonb_build_object('enabled',p_enabled));
END;
$$;

CREATE FUNCTION private.register_new_client() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_office uuid; membership_uuid uuid; safe_name text;
BEGIN
  -- Disabled/unconfigured registration never grants a membership. This also lets
  -- an operator create the first Auth identity before the first-office bootstrap.
  SELECT c.office_id INTO target_office FROM private.client_registration_settings c
    JOIN public.offices o ON o.id=c.office_id AND o.active WHERE c.singleton AND c.enabled;
  IF target_office IS NULL OR NEW.email IS NULL OR NEW.is_anonymous THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.raw_user_meta_data->'display_name')='string' THEN
    safe_name := nullif(left(btrim(NEW.raw_user_meta_data->>'display_name'),120),'');
  END IF;
  INSERT INTO public.profiles(id,display_name,created_by,created_by_db_role)
    VALUES (NEW.id,safe_name,NULL,session_user);
  INSERT INTO public.memberships(office_id,user_id,role_code,created_by,created_by_db_role)
    VALUES (target_office,NEW.id,'client',NULL,session_user) RETURNING id INTO membership_uuid;
  INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,changes)
    VALUES (target_office,'operator',session_user,'auth.client_registered','membership',membership_uuid,
      jsonb_build_object('role_code','client'));
  RETURN NEW;
END;
$$;
CREATE TRIGGER jn_register_new_client AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.register_new_client();

REVOKE ALL ON private.client_registration_settings FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.current_permissions(uuid),private.register_new_client(),
  private.configure_client_registration(uuid,boolean),public.my_access_context()
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.current_permissions(uuid),public.my_access_context() TO authenticated;
