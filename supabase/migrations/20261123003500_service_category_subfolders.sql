ALTER TABLE private.service_categories
  ADD COLUMN parent_id uuid,
  ADD CONSTRAINT service_categories_parent_fk FOREIGN KEY (office_id,parent_id)
    REFERENCES private.service_categories(office_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT service_categories_parent_check
    CHECK (parent_id IS NULL OR (parent_id<>id AND system_key IS NULL));

ALTER TABLE private.service_categories DROP CONSTRAINT service_categories_office_id_name_key;
CREATE UNIQUE INDEX service_categories_root_name_key ON private.service_categories(office_id,name) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX service_categories_subfolder_name_key ON private.service_categories(office_id,parent_id,lower(name)) WHERE parent_id IS NOT NULL;

CREATE FUNCTION private.category_is_documents(p_office uuid,p_category uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT FROM private.service_categories c
    LEFT JOIN private.service_categories p ON p.office_id=c.office_id AND p.id=c.parent_id
    WHERE c.office_id=p_office AND c.id=p_category
      AND (c.system_key='documents' OR p.system_key='documents')
  );
$$;

CREATE FUNCTION private.category_parent_name(p_office uuid,p_category uuid)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT p.name FROM private.service_categories c
  JOIN private.service_categories p ON p.office_id=c.office_id AND p.id=c.parent_id
  WHERE c.office_id=p_office AND c.id=p_category;
$$;

REVOKE ALL ON FUNCTION private.category_is_documents(uuid,uuid),private.category_parent_name(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

DO $categories$
DECLARE source text; updated text;
BEGIN
  source:=pg_get_functiondef('private.service_categories_state(uuid)'::regprocedure);
  updated:=replace(source,'''name'',c.name,''revision''',
    '''name'',c.name,''parent_id'',c.parent_id,''parent_name'',private.category_parent_name(c.office_id,c.id),''revision''');
  updated:=replace(updated,'coalesce(c.system_key=''documents'',false)','private.category_is_documents(c.office_id,c.id)');
  IF updated=source THEN RAISE EXCEPTION 'Category hierarchy state contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.service_categories_command(uuid,jsonb,uuid)'::regprocedure);
  updated:=replace(source,'current private.service_categories;', 'current private.service_categories; parent uuid;');
  updated:=replace(updated,'(SELECT count(*) FROM jsonb_object_keys(p_command))<>4))' || chr(10) || ' OR (op=''rename''',
    '(SELECT count(*) FROM jsonb_object_keys(p_command))<>(4+CASE WHEN p_command ? ''parent_id'' THEN 1 ELSE 0 END)))' || chr(10) || ' OR (op=''rename''');
  updated:=replace(updated,'IF op IN(''create'',''rename'') THEN',
    'IF op=''create'' AND p_command ? ''parent_id'' THEN
      IF jsonb_typeof(p_command->''parent_id'') IS DISTINCT FROM ''string'' THEN RAISE EXCEPTION ''CATEGORIES_VALIDATION'' USING ERRCODE=''PT422''; END IF;
      BEGIN parent:=(p_command->>''parent_id'')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION ''CATEGORIES_VALIDATION'' USING ERRCODE=''PT422''; END;
    END IF;
    IF op IN(''create'',''rename'') THEN');
  updated:=replace(updated,'IF current.revision<>expected THEN',
    'parent:=current.parent_id;
     IF op=''delete'' AND EXISTS(SELECT FROM private.service_categories child WHERE child.office_id=p_office_id AND child.parent_id=cid AND child.archived_at IS NULL) THEN
       RAISE EXCEPTION ''CATEGORY_IN_USE'' USING ERRCODE=''PT409'';
     END IF;
     IF current.revision<>expected THEN');
  updated:=replace(updated,'AND lower(name)=lower(nm) AND',
    'AND parent_id IS NOT DISTINCT FROM parent AND lower(name)=lower(nm) AND');
  updated:=replace(updated,'INSERT INTO private.service_categories(office_id,name,created_by,execution_level,system_key) VALUES(p_office_id,nm,actor,(p_command->>''execution_level'')::integer,',
    'IF parent IS NOT NULL AND NOT EXISTS(
      SELECT FROM private.service_categories p WHERE p.office_id=p_office_id AND p.id=parent AND p.parent_id IS NULL AND p.archived_at IS NULL
    ) THEN RAISE EXCEPTION ''CATEGORIES_VALIDATION'' USING ERRCODE=''PT422''; END IF;
    INSERT INTO private.service_categories(office_id,name,created_by,execution_level,parent_id,system_key)
    VALUES(p_office_id,nm,actor,(p_command->>''execution_level'')::integer,parent,');
  updated:=replace(updated,'CASE WHEN nm=''Documentos''', 'CASE WHEN parent IS NULL AND nm=''Documentos''');
  IF updated=source OR strpos(updated,'4+CASE WHEN p_command')=0 OR strpos(updated,'integer,parent,')=0 THEN
    RAISE EXCEPTION 'Category hierarchy command contract changed';
  END IF;
  EXECUTE updated;
END $categories$;

-- The optional ID is used only for category selection. The historical service
-- definition remains in the existing format. Name-only callers resolve roots.
CREATE FUNCTION private.prepare_service_category(p_office uuid,p_service jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE category uuid;
BEGIN
  IF p_service ? 'category_id' THEN
    IF jsonb_typeof(p_service->'category_id') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422';
    END IF;
    BEGIN category:=(p_service->>'category_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END;
    IF NOT EXISTS (
      SELECT FROM private.service_categories c
      WHERE c.office_id=p_office AND c.id=category
        AND c.archived_at IS NULL AND c.name=btrim(p_service->>'category')
    ) THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  END IF;
  PERFORM set_config('jn.service_category_selection',coalesce(category::text,''),true);
  RETURN private.services_normalize_input(p_service-'category_id');
END $$;
REVOKE ALL ON FUNCTION private.prepare_service_category(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.categories_link_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE selected uuid:=nullif(current_setting('jn.service_category_selection',true),'')::uuid; category uuid;
BEGIN
  SELECT id INTO category FROM private.service_categories
  WHERE office_id=NEW.office_id AND name=btrim(NEW.category) AND archived_at IS NULL
    AND ((selected IS NULL AND parent_id IS NULL) OR id=selected)
  FOR KEY SHARE;
  IF category IS NULL THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422'; END IF;
  INSERT INTO private.service_version_categories(office_id,service_id,version_id,category_id)
  VALUES(NEW.office_id,NEW.service_id,NEW.id,category);
  PERFORM set_config('jn.service_category_selection','',true);
  RETURN NEW;
END $$;

DO $services$
DECLARE signature regprocedure; source text; updated text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.service_create(uuid,jsonb,text,uuid)'::regprocedure,
    'private.service_publish(uuid,uuid,jsonb,integer,text,uuid)'::regprocedure
  ] LOOP
    source:=pg_get_functiondef(signature);
    updated:=replace(source,'private.services_normalize_input(p_service)','private.prepare_service_category(p_office_id,p_service)');
    IF updated=source THEN RAISE EXCEPTION 'Category selection contract changed: %',signature; END IF;
    EXECUTE updated;
  END LOOP;
  source:=pg_get_functiondef('private.services_version_record(public.service_versions)'::regprocedure);
  updated:=replace(source,'''category_name'',private.service_category_name(v.office_id,v.id)',
    '''category_name'',private.service_category_name(v.office_id,v.id),''category_parent_name'',private.category_parent_name(v.office_id,private.service_category_id(v.office_id,v.id))');
  IF updated=source THEN RAISE EXCEPTION 'Service category detail contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.services_page(uuid,text,integer,integer)'::regprocedure);
  updated:=replace(source,'category_name,v.unit',
    'category_name,private.category_parent_name(v.office_id,private.service_category_id(v.office_id,v.id)) category_parent_name,v.unit');
  updated:=replace(updated,'OR strpos(lower(s.code),q)>0',
    'OR strpos(lower(s.code),q)>0 OR strpos(lower(coalesce(private.category_parent_name(v.office_id,private.service_category_id(v.office_id,v.id)),'''')),q)>0');
  IF updated=source OR strpos(updated,'category_parent_name,v.unit')=0 THEN RAISE EXCEPTION 'Service category list contract changed'; END IF;
  EXECUTE updated;
END $services$;

CREATE OR REPLACE FUNCTION private.request_category_snapshot(r public.requests) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce((
    SELECT jsonb_build_object('category_id',c.category_id,'category_name',c.category_name,
      'category_parent_name',private.category_parent_name(r.office_id,c.category_id))
    FROM private.request_categories c WHERE c.office_id=r.office_id AND c.request_id=r.id
  ),(
    SELECT jsonb_build_object('category_id',private.service_category_id(i.office_id,i.version_id),
      'category_name',i.snapshot#>>'{definition,category}',
      'category_parent_name',private.category_parent_name(i.office_id,private.service_category_id(i.office_id,i.version_id)))
    FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id ORDER BY i.id LIMIT 1
  ),'{}'::jsonb);
$$;

DO $workflows$
DECLARE signature regprocedure; source text; updated text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.categorized_request_create_before_category_intake(uuid,jsonb,uuid)'::regprocedure,
    'private.category_intake_open(uuid,uuid,integer,jsonb,text,uuid)'::regprocedure,
    'private.portal_service_projection33(private.portal_service_forms33)'::regprocedure
  ] LOOP
    source:=pg_get_functiondef(signature);
    updated:=replace(source,'cat.system_key=''documents''','private.category_is_documents(cat.office_id,cat.id)');
    IF updated=source THEN RAISE EXCEPTION 'Document category routing contract changed: %',signature; END IF;
    EXECUTE updated;
  END LOOP;

  source:=pg_get_functiondef('private.request_detail(uuid,uuid,integer)'::regprocedure);
  updated:=replace(source,'(category=''rural'' AND rural)',
    '(lower(coalesce(detail->>''category_parent_name'',category))=''rural'' AND rural)');
  updated:=replace(updated,'coalesce(category ~ ''\m(previdenciári[oa]|previdenciari[oa]|jurídic[oa]|juridic[oa])\M'',specialized)',
    'coalesce(lower(concat_ws('' '',detail->>''category_parent_name'',category)) ~ ''\m(previdenciári[oa]|previdenciari[oa]|jurídic[oa]|juridic[oa])\M'' OR (category IS NULL AND specialized),false)');
  IF updated=source THEN RAISE EXCEPTION 'Request category workflow contract changed'; END IF;
  EXECUTE updated;
END $workflows$;

-- Filter current services by the selected taxonomy ID before pagination.
CREATE FUNCTION private.request_service_options_by_category(
  p_office_id uuid,p_category_id uuid,p_query text,p_page integer,p_size integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships; result jsonb; total bigint; q text; catalog_at timestamptz;
BEGIN
  m:=private.requests_actor(p_office_id);
  IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  IF NOT private.current_permissions(p_office_id) @> ARRAY['services.read'] THEN
    RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403';
  END IF;
  IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]'
    OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN (3,5)
    OR NOT EXISTS(SELECT FROM private.service_categories WHERE office_id=p_office_id AND id=p_category_id AND archived_at IS NULL) THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';
  END IF;
  q:=lower(btrim(p_query)); catalog_at:=clock_timestamp();
  WITH candidates AS (
    SELECT s.id,s.code,v.name,v.definition
    FROM public.services s CROSS JOIN LATERAL (
      SELECT ver.id,ver.definition,ver.name FROM public.service_versions ver
      WHERE ver.office_id=s.office_id AND ver.service_id=s.id AND ver.effective_from<=catalog_at
      ORDER BY ver.effective_from DESC LIMIT 1
    ) v
    JOIN private.service_version_categories c ON c.office_id=s.office_id AND c.version_id=v.id
    WHERE s.office_id=p_office_id AND s.archived_at IS NULL AND c.category_id=p_category_id
      AND (q='' OR strpos(lower(v.name),q)>0 OR strpos(lower(s.code),q)>0)
  ), paginated AS (
    SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET (p_page-1)*p_size
  )
  SELECT (SELECT count(*) FROM candidates), coalesce((
    SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.name||' · '||p.code,'definition',p.definition) ORDER BY p.name,p.id)
    FROM paginated p
  ),'[]'::jsonb) INTO total,result;
  RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

CREATE FUNCTION public.request_service_options_by_category(
  p_office_id uuid,p_category_id uuid,p_query text,p_page integer,p_size integer
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT private.request_service_options_by_category(p_office_id,p_category_id,p_query,p_page,p_size);
$$;
REVOKE ALL ON FUNCTION private.request_service_options_by_category(uuid,uuid,text,integer,integer),
  public.request_service_options_by_category(uuid,uuid,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_service_options_by_category(uuid,uuid,text,integer,integer),
  public.request_service_options_by_category(uuid,uuid,text,integer,integer) TO authenticated;

DO $catalogs$
DECLARE source text; updated text;
BEGIN
  source:=pg_get_functiondef('private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text)'::regprocedure);
  updated:=replace(source,'category_rows AS(SELECT c.id,c.name,',
    'category_rows AS(SELECT c.id,c.name,c.parent_id,private.category_parent_name(c.office_id,c.id) parent_name,');
  updated:=replace(updated,'coalesce(c.system_key=''documents'',false) is_documents',
    'private.category_is_documents(c.office_id,c.id) is_documents');
  IF updated=source THEN RAISE EXCEPTION 'Document catalog category contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.portal_service_manage33(uuid,uuid)'::regprocedure);
  updated:=replace(source,'AND system_key=''documents''','AND private.category_is_documents(o,private.service_category_id(o,vid))');
  IF updated=source THEN RAISE EXCEPTION 'Portal service administration contract changed'; END IF;
  EXECUTE updated;

  source:=pg_get_functiondef('private.portal_service_publish33(uuid,uuid,jsonb,uuid)'::regprocedure);
  updated:=replace(source,'cat.system_key=''documents''','private.category_is_documents(cat.office_id,cat.id)');
  IF updated=source THEN RAISE EXCEPTION 'Portal service publication contract changed'; END IF;
  EXECUTE updated;
END $catalogs$;

NOTIFY pgrst,'reload schema';
