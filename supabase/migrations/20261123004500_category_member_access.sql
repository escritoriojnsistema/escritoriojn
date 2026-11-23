CREATE TABLE private.member_category_access (
  office_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  category_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode IN ('read','edit','denied')),
  PRIMARY KEY (office_id,membership_id,category_id),
  FOREIGN KEY (office_id,membership_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (office_id,category_id) REFERENCES private.service_categories(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX member_category_access_category_idx ON private.member_category_access(office_id,category_id);
ALTER TABLE private.member_category_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.member_category_access FROM PUBLIC,anon,authenticated,service_role;

DO $permissions$
DECLARE source text;
BEGIN
  source:=pg_get_functiondef('private.team_permissions_for_member(uuid)'::regprocedure);
  EXECUTE replace(source,'private.team_permissions_for_member(', 'private.team_general_permissions(');
END $permissions$;
CREATE OR REPLACE FUNCTION private.team_permissions_for_member(p_membership_id uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT ARRAY(
    SELECT DISTINCT code FROM (
      SELECT unnest(private.team_general_permissions(p_membership_id)) AS code
      UNION ALL
      SELECT unnest(ARRAY['requests.read','requests.category_intake'])
      WHERE EXISTS (
        SELECT FROM private.member_category_access a
        JOIN public.memberships m ON m.office_id=a.office_id AND m.id=a.membership_id
        JOIN private.service_categories c ON c.office_id=a.office_id AND c.id=a.category_id
        WHERE m.id=p_membership_id AND m.role_code IN ('admin','employee')
          AND a.mode IN ('read','edit') AND c.archived_at IS NULL
          AND private.team_user_active(m.user_id,m.office_id)
      )
    ) permissions ORDER BY code
  );
$$;

CREATE FUNCTION private.member_category_mode(m public.memberships,c private.service_categories) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN m.office_id=c.office_id AND m.active THEN
    CASE WHEN m.role_code='owner' THEN 'edit' WHEN m.role_code IN ('admin','employee') THEN (
      SELECT a.mode FROM private.member_category_access a
      WHERE a.office_id=c.office_id AND a.membership_id=m.id AND a.category_id=c.id
    ) END
  END;
$$;

CREATE OR REPLACE FUNCTION private.member_execution_level(m public.memberships,lvl integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(m.active AND m.role_code IN ('owner','admin','employee')
    AND private.team_general_permissions(m.id) @> ARRAY['foundation.access','requests.read']
    AND (m.role_code='owner' OR lvl=3
      OR (lvl=1 AND 'requests.level1'=ANY(private.team_general_permissions(m.id)))
      OR (lvl=2 AND 'requests.level2'=ANY(private.team_general_permissions(m.id)))),false);
$$;

CREATE FUNCTION private.member_category_can_execute(m public.memberships,c private.service_categories) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(m.office_id=c.office_id AND m.active AND private.team_user_active(m.user_id,m.office_id)
    AND CASE private.member_category_mode(m,c)
      WHEN 'edit' THEN true WHEN 'read' THEN false WHEN 'denied' THEN false
      ELSE private.member_execution_level(m,c.execution_level) END,false);
$$;

CREATE FUNCTION private.request_category_access_rows(r public.requests,m public.memberships)
RETURNS TABLE(mode text,can_execute boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT private.member_category_mode(m,c),private.member_category_can_execute(m,c)
  FROM private.service_categories c
  WHERE c.office_id=r.office_id AND c.id IN (
    SELECT rc.category_id FROM private.request_categories rc WHERE rc.office_id=r.office_id AND rc.request_id=r.id
    UNION
    SELECT vc.category_id FROM public.request_items i JOIN private.service_version_categories vc
      ON vc.office_id=i.office_id AND vc.version_id=i.version_id
    WHERE i.office_id=r.office_id AND i.request_id=r.id
  );
$$;

CREATE FUNCTION private.request_category_grant(r public.requests,m public.memberships) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN bool_or(a.mode='denied') THEN 'denied'
    WHEN count(*)=0 OR count(a.mode)<count(*) THEN NULL
    WHEN bool_and(a.mode='edit') THEN 'edit'
    ELSE 'read' END
  FROM private.request_category_access_rows(r,m) a;
$$;

CREATE FUNCTION private.request_category_restricted(r public.requests,m public.memberships) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS (SELECT FROM private.request_category_access_rows(r,m) a WHERE a.mode IN ('read','denied'));
$$;

CREATE OR REPLACE FUNCTION private.request_execution_allowed(r public.requests,m public.memberships) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(r.office_id=m.office_id AND m.active AND m.role_code IN ('owner','admin','employee')
    AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read'] AND (
      m.role_code='owner' OR (r.category='account_correction' AND private.member_execution_level(m,3)) OR (
        SELECT coalesce(bool_and(a.can_execute),false) OR (
          NOT coalesce(bool_or(a.mode IN ('read','denied')),false) AND EXISTS (
            SELECT FROM private.request_level_exceptions e WHERE e.office_id=r.office_id AND e.request_id=r.id
              AND e.membership_id=m.id AND e.revoked_at IS NULL
          )
        ) FROM private.request_category_access_rows(r,m) a
      )
    ),false);
$$;

CREATE OR REPLACE FUNCTION private.request_in_scope_before_portal_returns(r public.requests,m public.memberships) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT CASE WHEN r.office_id IS DISTINCT FROM m.office_id OR m.id IS NULL THEN false
    WHEN m.role_code='client' THEN private.request_in_scope_before_execution_levels(r,m) IS TRUE
    WHEN r.category='account_correction' THEN private.request_in_scope_before_execution_levels(r,m) IS TRUE
      AND private.request_execution_allowed(r,m)
    WHEN NOT m.active OR NOT private.team_user_active(m.user_id,m.office_id) THEN false
    ELSE CASE private.request_category_grant(r,m)
      WHEN 'denied' THEN false WHEN 'read' THEN true WHEN 'edit' THEN true
      ELSE (private.request_in_scope_before_execution_levels(r,m) IS TRUE AND (
        private.request_execution_allowed(r,m) OR (
          SELECT bool_and(a.can_execute OR coalesce(a.mode='read',false))
          FROM private.request_category_access_rows(r,m) a
        ) IS TRUE
      )) OR private.request_can_collect(r,m)
    END END;
$$;

CREATE OR REPLACE FUNCTION private.request_can_collect(r public.requests,m public.memberships) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(m.active AND m.role_code IN ('owner','admin','employee') AND r.office_id=m.office_id
    AND r.status NOT IN ('concluido','cancelado') AND private.request_category_grant(r,m) IS DISTINCT FROM 'denied'
    AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read']
    AND (private.team_general_permissions(m.id) @> ARRAY['requests.create'] OR private.request_category_grant(r,m) IN ('read','edit'))
    AND EXISTS (SELECT FROM private.request_preintakes p WHERE p.office_id=r.office_id AND p.request_id=r.id
      AND p.collector_id=m.id AND p.handed_off_at IS NULL),false);
$$;

CREATE FUNCTION private.category_open_actor(o uuid,cid uuid) RETURNS public.memberships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; grant_mode text;
BEGIN
  m:=private.requests_actor(o,true);
  IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  SELECT private.member_category_mode(m,c) INTO grant_mode
    FROM private.service_categories c WHERE c.office_id=o AND c.id=cid;
  IF grant_mode='denied' OR (
      grant_mode IS DISTINCT FROM 'read' AND grant_mode IS DISTINCT FROM 'edit'
      AND NOT private.current_permissions(o) @> ARRAY['requests.create']
    ) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  RETURN m;
END $$;

CREATE FUNCTION private.team_set_member_category_access(
  p_office_id uuid,p_membership_id uuid,p_role_code text,p_active boolean,p_permissions text[],
  p_category_access jsonb,p_expected_category_access jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor jsonb; previous jsonb; result jsonb;
BEGIN
  actor:=private.team_actor(p_office_id,true);
  IF actor->>'role_code' IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  IF jsonb_typeof(p_category_access) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected_category_access) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(p_category_access))>500 THEN
    RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422';
  END IF;
  SELECT coalesce(jsonb_object_agg(category_id,mode),'{}') INTO previous
  FROM private.member_category_access WHERE office_id=p_office_id AND membership_id=p_membership_id;
  IF previous<>p_expected_category_access THEN RAISE EXCEPTION 'TEAM_CONFLICT' USING ERRCODE='PT409'; END IF;
  IF (p_role_code='owner' AND p_category_access<>'{}') OR EXISTS (
    SELECT FROM jsonb_each(p_category_access) e
    WHERE jsonb_typeof(e.value)<>'string' OR (e.value#>>'{}') NOT IN ('read','edit','denied')
      OR NOT EXISTS(SELECT FROM private.service_categories c WHERE c.office_id=p_office_id AND c.id::text=e.key
        AND (c.archived_at IS NULL OR previous->e.key=e.value))
  ) THEN RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
  result:=private.team_set_member(p_office_id,p_membership_id,p_role_code,p_active,p_permissions,p_request_id);
  IF previous<>p_category_access THEN
    DELETE FROM private.member_category_access WHERE office_id=p_office_id AND membership_id=p_membership_id;
    INSERT INTO private.member_category_access(office_id,membership_id,category_id,mode)
      SELECT p_office_id,p_membership_id,key::uuid,value FROM jsonb_each_text(p_category_access);
    PERFORM private.team_audit(p_office_id,(actor->>'user_id')::uuid,'team.member_category_access_updated',
      'membership',p_membership_id,p_request_id,jsonb_build_object('count',(SELECT count(*) FROM jsonb_object_keys(p_category_access))));
  END IF;
  RETURN result;
END $$;
CREATE FUNCTION public.team_set_member_category_access(
  p_office_id uuid,p_membership_id uuid,p_role_code text,p_active boolean,p_permissions text[],
  p_category_access jsonb,p_expected_category_access jsonb,p_request_id uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.team_set_member_category_access(p_office_id,p_membership_id,p_role_code,p_active,p_permissions,
    p_category_access,p_expected_category_access,p_request_id);
$$;

REVOKE ALL ON FUNCTION private.team_general_permissions(uuid),private.member_category_mode(public.memberships,private.service_categories),
  private.member_category_can_execute(public.memberships,private.service_categories),private.request_category_access_rows(public.requests,public.memberships),
  private.request_category_grant(public.requests,public.memberships),private.request_category_restricted(public.requests,public.memberships),
  private.category_open_actor(uuid,uuid),private.team_set_member_category_access(uuid,uuid,text,boolean,text[],jsonb,jsonb,uuid),
  public.team_set_member_category_access(uuid,uuid,text,boolean,text[],jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.team_set_member_category_access(uuid,uuid,text,boolean,text[],jsonb,jsonb,uuid),
  public.team_set_member_category_access(uuid,uuid,text,boolean,text[],jsonb,jsonb,uuid) TO authenticated;

DO $team$
DECLARE source text; updated text;
BEGIN
  source:=pg_get_functiondef('private.team_dashboard(uuid,text,integer,text,text)'::regprocedure);
  updated:=replace(source,'identity.cpf_masked,',
    'identity.cpf_masked, CASE WHEN actor->>''role_code''=''owner'' THEN coalesce((
      SELECT jsonb_object_agg(a.category_id,a.mode) FROM private.member_category_access a
      WHERE a.office_id=m.office_id AND a.membership_id=m.id
    ),''{}''::jsonb) END AS category_access,');
  updated:=replace(updated,'''items'',items,''total''',
    '''category_catalog'',CASE WHEN p_kind=''members'' AND actor->>''role_code''=''owner'' THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(''id'',c.id,''name'',c.name,''parent_name'',private.category_parent_name(c.office_id,c.id),
        ''execution_level'',c.execution_level) ORDER BY c.name,c.id)
      FROM private.service_categories c WHERE c.office_id=p_office_id AND c.archived_at IS NULL
    ),''[]''::jsonb) END,''items'',items,''total''');
  IF updated=source OR strpos(updated,'AS category_access')=0 OR strpos(updated,'''category_catalog''')=0 THEN
    RAISE EXCEPTION 'Team category access dashboard contract changed';
  END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.service_categories_state(uuid)'::regprocedure);
  updated:=replace(source,'''execution_level'',c.execution_level,''is_documents''',
    '''execution_level'',c.execution_level,''access_mode'',private.member_category_mode(m,c),''is_documents''');
  IF updated=source THEN RAISE EXCEPTION 'Category access projection contract changed'; END IF;
  EXECUTE updated;
END $team$;

DO $requests$
DECLARE signature regprocedure; source text; updated text;
BEGIN
  source:=pg_get_functiondef('private.staff_category_request_create(uuid,jsonb,uuid)'::regprocedure);
  updated:=replace(source,'private.requests_actor(p_office_id,true,''requests.create'')','private.requests_actor(p_office_id,true)');
  updated:=replace(updated,'collect:=NOT private.member_execution_level(m,c.execution_level);',
    'm:=private.category_open_actor(p_office_id,c.id); collect:=NOT private.member_category_can_execute(m,c);
     IF assignee IS NOT NULL AND assignee<>m.id AND NOT private.current_permissions(p_office_id) @> ARRAY[''requests.create''] THEN
       RAISE EXCEPTION ''REQUESTS_FORBIDDEN'' USING ERRCODE=''PT403''; END IF;');
  updated:=replace(updated,'private.member_execution_level(m,c.execution_level)','private.member_category_can_execute(m,c)');
  updated:=replace(updated,'private.member_execution_level(target,c.execution_level)','private.member_category_can_execute(target,c)');
  IF updated=source OR strpos(updated,'private.category_open_actor(p_office_id,c.id)')=0 THEN
    RAISE EXCEPTION 'Staff category opening contract changed';
  END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.request_preintake_create_before_category_opening(uuid,jsonb,uuid)'::regprocedure);
  updated:=replace(source,'private.requests_actor(p_office_id,true,''requests.create'')','private.requests_actor(p_office_id,true)');
  updated:=replace(updated,'INSERT INTO private.request_counters',
    'm:=private.category_open_actor(p_office_id,c.id);
     INSERT INTO private.request_counters');
  IF updated=source OR strpos(updated,'private.category_open_actor(p_office_id,c.id)')=0 THEN
    RAISE EXCEPTION 'Preintake insert contract changed';
  END IF;
  EXECUTE updated;
  FOREACH signature IN ARRAY ARRAY[
    'private.request_preintake_create(uuid,jsonb,uuid)'::regprocedure,
    'private.request_preintake_update(uuid,uuid,integer,jsonb)'::regprocedure,
    'private.request_preintake_handoff(uuid,uuid,integer,text)'::regprocedure
  ] LOOP
    source:=pg_get_functiondef(signature);
    updated:=replace(source,'private.requests_actor(p_office_id,true,''requests.create'')','private.requests_actor(p_office_id,true)');
    IF updated=source THEN RAISE EXCEPTION 'Preintake category contract changed: %',signature; END IF;
    EXECUTE updated;
  END LOOP;

  source:=pg_get_functiondef('private.request_mutate(uuid,uuid,integer,jsonb,uuid)'::regprocedure);
  updated:=replace(source,'private.requests_actor(p_office_id,true,capability)',
    'private.requests_actor(p_office_id,true,CASE WHEN capability=''requests.update'' THEN NULL ELSE capability END)');
  updated:=replace(updated,'IF (kind=''reclaim'' AND private.request_can_reclaim(r,m)',
    'IF capability=''requests.update'' AND NOT private.current_permissions(p_office_id) @> ARRAY[capability]
       AND private.request_category_grant(r,m) IS DISTINCT FROM ''edit'' THEN
      RAISE EXCEPTION ''REQUESTS_FORBIDDEN'' USING ERRCODE=''PT403''; END IF;
     IF (kind=''reclaim'' AND private.request_can_reclaim(r,m)');
  updated:=replace(updated,'IF (kind=''reclaim'' AND private.request_can_reclaim(original,m)',
    'IF capability=''requests.update'' AND NOT private.current_permissions(p_office_id) @> ARRAY[capability]
       AND private.request_category_grant(original,m) IS DISTINCT FROM ''edit'' THEN
      RAISE EXCEPTION ''REQUESTS_FORBIDDEN'' USING ERRCODE=''PT403''; END IF;
     IF (kind=''reclaim'' AND private.request_can_reclaim(original,m)');
  IF updated=source OR strpos(updated,'private.request_category_grant(original,m)')=0 THEN
    RAISE EXCEPTION 'Request mutation category contract changed';
  END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.request_detail_record_before_categories(public.requests,public.memberships,integer)'::regprocedure);
  updated:=replace(source,'''can_update'',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY[''requests.update'']',
    '''category_access_mode'',private.request_category_grant(r,m),
     ''can_update'',NOT closed AND private.request_can_work(r,m)
       AND (caps @> ARRAY[''requests.update''] OR private.request_category_grant(r,m) IS NOT DISTINCT FROM ''edit'')');
  IF updated=source THEN RAISE EXCEPTION 'Request detail category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.document_dispatch(uuid)'::regprocedure);
  updated:=replace(source,'private.team_permissions_for_member(m.id) @> ARRAY[''foundation.access'',''requests.read'',''requests.update'']',
    '(private.team_permissions_for_member(m.id) @> ARRAY[''foundation.access'',''requests.read'',''requests.update''] OR private.request_category_grant(r,m)=''edit'')');
  updated:=replace(updated,'private.team_permissions_for_member(mm.id) @> ARRAY[''foundation.access'',''requests.read'',''requests.update'']',
    '(private.team_permissions_for_member(mm.id) @> ARRAY[''foundation.access'',''requests.read'',''requests.update''] OR private.request_category_grant(r,mm)=''edit'')');
  IF updated=source THEN RAISE EXCEPTION 'Dispatch category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.request_deletion_evaluate(uuid,uuid,boolean)'::regprocedure);
  updated:=replace(source,'AND r.status IN (''concluido'',''cancelado'') AND private.request_in_scope(r,m) IS TRUE',
    'AND r.status IN (''concluido'',''cancelado'') AND private.request_in_scope(r,m) IS TRUE
     AND NOT private.request_category_restricted(r,m)');
  IF updated=source THEN RAISE EXCEPTION 'Request deletion category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.request_archives_archive(uuid,uuid,integer,text,uuid)'::regprocedure);
  updated:=replace(source,'SELECT * INTO cmd FROM private.request_archive_commands',
    'IF private.request_category_restricted(r,m) THEN RAISE EXCEPTION ''REQUEST_ARCHIVES_FORBIDDEN'' USING ERRCODE=''PT403''; END IF;
     SELECT * INTO cmd FROM private.request_archive_commands');
  IF updated=source THEN RAISE EXCEPTION 'Request archive category contract changed'; END IF;
  EXECUTE updated;
END $requests$;

-- A case grant is confined to this request; standalone registries and sensitive files keep their own checks.
CREATE FUNCTION private.request_scoped_workflow(r public.requests,m public.memberships,workflow text,write_access boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT m.role_code IN ('admin','employee')
    AND private.request_category_grant(r,m)=ANY(CASE WHEN write_access THEN ARRAY['edit'] ELSE ARRAY['read','edit'] END)
    AND CASE workflow
      WHEN 'specialized' THEN lower(concat_ws(' ',s->>'category_parent_name',s->>'category_name'))
        ~ '\m(previdenciári[oa]|previdenciari[oa]|jurídic[oa]|juridic[oa])\M'
      WHEN 'rural' THEN lower(concat_ws(' ',s->>'category_parent_name',s->>'category_name')) ~ '\m(rural|ccir|car)\M'
      ELSE false END
  FROM (SELECT private.request_category_snapshot(r) AS s) info;
$$;
REVOKE ALL ON FUNCTION private.request_scoped_workflow(public.requests,public.memberships,text,boolean) FROM PUBLIC,anon,authenticated,service_role;

DO $workflow$
DECLARE signature regprocedure; source text; updated text;
BEGIN
  source:=pg_get_functiondef('private.request_detail(uuid,uuid,integer)'::regprocedure);
  updated:=replace(source,'''rural_workflow'',','''rural_category_access'',coalesce(private.request_scoped_workflow(r,m,''rural'',false),false),
    ''specialized_category_access'',coalesce(private.request_scoped_workflow(r,m,''specialized'',false),false),
    ''rural_workflow'',');
  IF updated=source THEN RAISE EXCEPTION 'Request workflow access projection changed'; END IF;
  -- The detail wrapper uses the request ID and its verified actor.
  updated:=replace(updated,'private.request_scoped_workflow(r,m,',
    'private.request_scoped_workflow((SELECT q FROM public.requests q WHERE q.office_id=p_office_id AND q.id=p_request_id),m,');
  EXECUTE updated;

  source:=pg_get_functiondef('private.specialized_request30(uuid,uuid,boolean)'::regprocedure);
  updated:=replace(source,'m.role_code=''client'' OR NOT private.current_permissions(o) @> ARRAY[''specialized.read'',''checklists.read'',''customers.read'']',
    'm.role_code=''client''');
  updated:=replace(updated,'IF r.customer_id IS NOT NULL',
    'IF private.request_scoped_workflow(r,m,''specialized'',false) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''specialized.read'',''checklists.read'',''customers.read''] THEN
       RAISE EXCEPTION ''SPECIALIZED_FORBIDDEN'' USING ERRCODE=''PT403''; END IF;
     IF private.request_scoped_workflow(r,m,''specialized'',false) IS NOT TRUE AND r.customer_id IS NOT NULL');
  updated:=replace(updated,'NOT private.current_permissions(o) @> ARRAY[''specialized.manage'']',
    '(private.request_scoped_workflow(r,m,''specialized'',true) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''specialized.manage''])');
  IF updated=source OR strpos(updated,'private.request_scoped_workflow')=0 THEN RAISE EXCEPTION 'Specialized request category contract changed'; END IF;
  EXECUTE updated;

  FOREACH signature IN ARRAY ARRAY[
    'private.specialized_state30(uuid,uuid,integer)'::regprocedure,
    'private.specialized_command30(uuid,uuid,jsonb,uuid)'::regprocedure
  ] LOOP
    source:=pg_get_functiondef(signature);
    updated:=replace(source,'private.current_permissions(o) @> ARRAY[''specialized.manage'']',
      '(private.request_scoped_workflow(r,m,''specialized'',true) IS TRUE OR private.current_permissions(o) @> ARRAY[''specialized.manage''])');
    updated:=replace(updated,'m.role_code NOT IN(''owner'',''admin'') OR NOT private.current_permissions(o) @> ARRAY[''specialized.conduct'']',
      '(private.request_scoped_workflow(r,m,''specialized'',true) IS NOT TRUE AND (m.role_code NOT IN(''owner'',''admin'') OR NOT private.current_permissions(o) @> ARRAY[''specialized.conduct'']))');
    updated:=replace(updated,'m.role_code IN(''owner'',''admin'') AND private.current_permissions(o) @> ARRAY[''specialized.conduct'']',
      '(private.request_scoped_workflow(r,m,''specialized'',true) IS TRUE OR (m.role_code IN(''owner'',''admin'') AND private.current_permissions(o) @> ARRAY[''specialized.conduct'']))');
    updated:=replace(updated,'IF NOT (private.request_scoped_workflow(r,m,''specialized'',true)',
      'IF private.request_category_restricted(r,m) OR NOT (private.request_scoped_workflow(r,m,''specialized'',true)');
    IF updated=source THEN RAISE EXCEPTION 'Specialized operation category contract changed: %',signature; END IF;
    EXECUTE updated;
  END LOOP;

  source:=pg_get_functiondef('private.specialized_close30()'::regprocedure);
  updated:=replace(source,'m.role_code NOT IN(''owner'',''admin'') OR d.stage<>''concluido'' OR NOT private.current_permissions(NEW.office_id) @> ARRAY[''specialized.conduct'']',
    'd.stage<>''concluido'' OR (private.request_scoped_workflow(NEW,m,''specialized'',true) IS NOT TRUE
      AND (m.role_code NOT IN(''owner'',''admin'') OR NOT private.current_permissions(NEW.office_id) @> ARRAY[''specialized.conduct'']))');
  IF updated=source THEN RAISE EXCEPTION 'Specialized close category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.specialized_file_allowed30(public.files)'::regprocedure);
  updated:=replace(source,'ARRAY[''files.read'',''specialized.read'',''specialized.sensitive'']',
    'ARRAY[''files.read'',''specialized.sensitive''] AND (private.request_scoped_workflow(r,m,''specialized'',false) IS TRUE
      OR private.current_permissions(f.office_id) @> ARRAY[''specialized.read''])');
  IF updated=source THEN RAISE EXCEPTION 'Specialized private attachment contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.rural_request29(uuid,uuid,boolean)'::regprocedure);
  updated:=replace(source,'m.role_code=''client'' OR NOT private.current_permissions(o) @> ARRAY[''rural.read'',''customers.read'',''checklists.read'']','m.role_code=''client''');
  updated:=replace(updated,'IF w AND',
    'IF private.request_scoped_workflow(r,m,''rural'',false) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''rural.read'',''customers.read'',''checklists.read''] THEN
       RAISE EXCEPTION ''RURAL_FORBIDDEN'' USING ERRCODE=''PT403''; END IF;
     IF w AND');
  updated:=replace(updated,'NOT private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update'']',
    '(private.request_scoped_workflow(r,m,''rural'',true) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update''])');
  IF updated=source OR strpos(updated,'private.request_scoped_workflow')=0 THEN RAISE EXCEPTION 'Rural request category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.rural_workflow_state29(uuid,uuid,integer)'::regprocedure);
  updated:=replace(source,'IF d.id IS NOT NULL THEN PERFORM private.rural_access27(o,d.property_id);',
    'IF d.id IS NOT NULL AND private.request_scoped_workflow(r,m,''rural'',false) IS NOT TRUE THEN PERFORM private.rural_access27(o,d.property_id);');
  updated:=replace(updated,'AND private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update'']',
    'AND (private.request_scoped_workflow(r,m,''rural'',true) IS TRUE OR private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update''])');
  updated:=replace(updated,'reserved:=canwork AND m.role_code=''owner''',
    'reserved:=canwork AND (m.role_code=''owner'' OR private.request_scoped_workflow(r,m,''rural'',true) IS TRUE)');
  IF updated=source THEN RAISE EXCEPTION 'Rural workflow category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.rural_workflow_command29(uuid,uuid,jsonb,uuid)'::regprocedure);
  updated:=replace(source,'NOT private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update'']',
    '(private.request_scoped_workflow(r,m,''rural'',true) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update''])');
  updated:=replace(updated,'IF (private.request_scoped_workflow(r,m,''rural'',true) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update'']) OR',
    'IF private.request_category_restricted(r,m) OR (private.request_scoped_workflow(r,m,''rural'',true) IS NOT TRUE AND NOT private.current_permissions(o) @> ARRAY[''rural.records.manage'',''customers.update'']) OR');
  updated:=replace(updated,'(kind IN(''advance'',''complement'',''complete'',''configure'') AND m.role_code<>''owner'')',
    '(kind=''configure'' AND m.role_code<>''owner'') OR (kind IN(''advance'',''complement'',''complete'') AND m.role_code<>''owner'' AND private.request_scoped_workflow(r,m,''rural'',true) IS NOT TRUE)');
  updated:=replace(updated,'IF d.id IS NOT NULL THEN PERFORM private.rural_access27(o,d.property_id,''customers.update'');',
    'IF d.id IS NOT NULL AND private.request_scoped_workflow(r,m,''rural'',true) IS NOT TRUE THEN PERFORM private.rural_access27(o,d.property_id,''customers.update'');');
  IF updated=source OR strpos(updated,'private.request_category_restricted')=0 THEN RAISE EXCEPTION 'Rural operation category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.rural_close_guard29()'::regprocedure);
  updated:=replace(source,'m.role_code<>''owner'' OR d.stage<>''concluido''',
    '(m.role_code<>''owner'' AND private.request_scoped_workflow(NEW,m,''rural'',true) IS NOT TRUE) OR d.stage<>''concluido''');
  IF updated=source THEN RAISE EXCEPTION 'Rural close category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.review_member23(public.documents,public.memberships)'::regprocedure);
  updated:=replace(source,'private.request_in_scope(r,m) IS TRUE)',
    'private.request_in_scope(r,m) IS TRUE AND NOT private.request_category_restricted(r,m))');
  IF updated=source THEN RAISE EXCEPTION 'Document review category contract changed'; END IF;
  EXECUTE updated;
END $workflow$;

NOTIFY pgrst,'reload schema';
