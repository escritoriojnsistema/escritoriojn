CREATE TABLE private.office_copyright (
 office_id uuid PRIMARY KEY REFERENCES public.offices(id),
 notice text NOT NULL CHECK (char_length(notice) BETWEEN 3 AND 400 AND notice=btrim(notice) AND notice !~ '[[:cntrl:]]'),
 revision integer NOT NULL CHECK (revision>0)
);
ALTER TABLE private.office_copyright ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.office_copyright FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.office_copyright_state(o uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; selected_office uuid:=o; result jsonb;
BEGIN
 IF o IS NULL THEN
  SELECT r.office_id INTO selected_office FROM private.client_registration_settings r
   JOIN public.offices a ON a.id=r.office_id AND a.active WHERE r.singleton;
 ELSE
  actor:=private.team_require_identity();
  IF private.team_user_active(actor,o) IS NOT TRUE
     OR NOT EXISTS(SELECT FROM public.memberships m WHERE m.office_id=o AND m.user_id=actor AND m.active
      AND (m.role_code='client' OR private.current_permissions(o) @> ARRAY['foundation.access'])) THEN
   RAISE EXCEPTION 'PRIVACY_FORBIDDEN' USING ERRCODE='PT403';
  END IF;
 END IF;
 SELECT jsonb_build_object('notice',c.notice,'revision',c.revision) INTO result
 FROM private.office_copyright c WHERE c.office_id=selected_office;
 RETURN coalesce(result,jsonb_build_object('notice','© Escritório JN. Todos os direitos reservados.','revision',0));
END $$;

CREATE FUNCTION private.office_copyright_save(o uuid, expected integer, value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; previous integer;
BEGIN
 actor:=private.governance_actor(o,'settings.access',true);
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=o AND user_id=actor AND active AND role_code IN ('owner','admin')) THEN
  RAISE EXCEPTION 'PRIVACY_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 IF expected IS NULL OR expected<0 OR expected=2147483647 OR value IS NULL OR char_length(value) NOT BETWEEN 3 AND 400
    OR value<>btrim(value) OR value~'[[:cntrl:]]' THEN
  RAISE EXCEPTION 'PRIVACY_VALIDATION' USING ERRCODE='PT422';
 END IF;
 SELECT c.revision INTO previous FROM private.office_copyright c WHERE c.office_id=o FOR UPDATE;
 IF coalesce(previous,0)<>expected THEN RAISE EXCEPTION 'PRIVACY_CONFLICT' USING ERRCODE='PT409'; END IF;
 PERFORM private.governance_actor(o,'settings.access');
 INSERT INTO private.office_copyright(office_id,notice,revision) VALUES(o,value,expected+1)
 ON CONFLICT(office_id) DO UPDATE SET notice=EXCLUDED.notice,revision=EXCLUDED.revision;
 PERFORM private.emit_business_event(o,'privacy.settings_updated','office',o,gen_random_uuid(),'{}');
 RETURN private.office_copyright_state(o);
END $$;

-- Expose only the parameterless notice selected for public registration.
CREATE FUNCTION public.office_copyright_public() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
BEGIN ATOMIC SELECT private.office_copyright_state(NULL); END;
CREATE FUNCTION public.office_copyright_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
BEGIN ATOMIC SELECT private.office_copyright_state(p_office_id); END;
CREATE FUNCTION public.office_copyright_save(p_office_id uuid,p_expected_revision integer,p_notice text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.office_copyright_save(p_office_id,p_expected_revision,p_notice); $$;
REVOKE ALL ON FUNCTION private.office_copyright_state(uuid),private.office_copyright_save(uuid,integer,text),
 public.office_copyright_state(uuid),public.office_copyright_save(uuid,integer,text),public.office_copyright_public()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.office_copyright_state(uuid),public.office_copyright_public() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.office_copyright_state(uuid),private.office_copyright_save(uuid,integer,text),
 public.office_copyright_save(uuid,integer,text) TO authenticated;

CREATE FUNCTION private.requests_home_counts(o uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships; result jsonb; linked uuid; cutoff timestamptz; can_archive boolean; scope_permissions text[];
BEGIN
 m:=private.requests_actor(o);
 IF m.role_code='client' THEN
  linked:=private.portal_identity32(o,m.id);
  SELECT coalesce(jsonb_object_agg(x.status,x.n),'{}'::jsonb) INTO result
  FROM (
   SELECT private.request_public_status(r.status) AS status,count(*) AS n FROM public.requests r
   WHERE r.office_id=o AND ((r.origin='portal' AND r.created_by=m.user_id) OR r.customer_id=linked)
     AND private.portal_request_visible32(r,m)
   GROUP BY 1
  ) x;
 ELSE
  scope_permissions:=private.current_permissions(o);
  cutoff:=(private.request_archive_policy_record(o)->>'cutoff')::timestamptz;
  can_archive:=m.role_code IN ('owner','admin')
    AND scope_permissions @> ARRAY['requests.archives.manage','requests.read_all'];
  SELECT coalesce(jsonb_object_agg(x.status,x.n),'{}'::jsonb) INTO result
  FROM (
   SELECT r.status,count(*) AS n FROM public.requests r
   WHERE r.office_id=o AND private.request_in_scope(r,m)
     AND (can_archive OR NOT private.request_is_archived(r,cutoff))
     AND NOT EXISTS(SELECT FROM private.category_intakes p WHERE p.office_id=o AND p.request_id=r.id AND p.submitted_at IS NULL)
     AND NOT EXISTS(SELECT FROM private.service_intakes33 p WHERE p.office_id=o AND p.request_id=r.id AND p.submitted_at IS NULL)
   GROUP BY 1
  ) x;
 END IF;
 PERFORM private.requests_actor(o);
 IF scope_permissions IS NOT NULL AND NOT private.current_permissions(o) @> scope_permissions THEN
  RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.requests_home_counts(p_office_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT private.requests_home_counts(p_office_id); $$;
REVOKE ALL ON FUNCTION private.requests_home_counts(uuid),public.requests_home_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.requests_home_counts(uuid),public.requests_home_counts(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
