-- Etapa22: pastas de modelos, classificação por nível (1 super administrador, 2 administrador, 3 funcionário),
-- vínculo opcional modelo↔serviço (preço vigente) e busca leve paginada. Nenhuma conta Auth, grant individual ou histórico PDF alterado.
INSERT INTO public.permissions(code,name) VALUES('templates.folders','Gerir pastas de modelos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code='templates.folders' ON CONFLICT DO NOTHING;
-- Amplia as allowlists vivas de atribuições sem reescrever corpos históricos de auditoria/PDF.
DO $migration$ DECLARE r record;d text;extra text::='' := '';BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%templates.read%' AND pg_get_constraintdef(oid) NOT LIKE '%templates.folders%' LOOP
  d:=replace(r.def,'''templates.approve''::text','''templates.approve''::text, ''templates.folders''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,d);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment') LOOP
  d:=pg_get_functiondef(r.oid);IF d LIKE '%''templates.approve''%' AND d NOT LIKE '%''templates.folders''%' THEN EXECUTE replace(d,'''templates.approve''','''templates.approve'', ''templates.folders''');END IF;
 END LOOP;
END $migration$;

CREATE TABLE public.template_folders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(btrim(name)) BETWEEN 1 AND 80 AND btrim(name)=name AND private.templates_has_text20(name) AND name !~ '[[:cntrl:]]'),
 level integer NOT NULL CHECK(level IN(1,2,3)),latest_version integer NOT NULL DEFAULT 0 CHECK(latest_version BETWEEN 0 AND 2147483646),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id)
);
CREATE INDEX template_folders_office_idx ON public.template_folders(office_id,level,id);
CREATE UNIQUE INDEX template_folders_unique_name_idx ON public.template_folders(office_id,lower(name));
CREATE TABLE public.template_folder_commands(
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,idempotency_key uuid NOT NULL,payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),folder_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 -- Command history must survive deletion of an empty folder. A FK to the live folder
 -- would make deleting ANY previously created folder impossible.
 PRIMARY KEY(office_id,actor_id,idempotency_key)
);
CREATE INDEX template_folder_commands_author_idx ON public.template_folder_commands(actor_id);
ALTER TABLE public.template_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_folder_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.template_folders,public.template_folder_commands FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.templates ADD COLUMN folder_id uuid;
ALTER TABLE public.templates ADD CONSTRAINT templates_folder_fk FOREIGN KEY(office_id,folder_id) REFERENCES public.template_folders(office_id,id) ON DELETE RESTRICT;
CREATE INDEX templates_folder_idx ON public.templates(office_id,folder_id,id);
ALTER TABLE public.templates ADD COLUMN service_id uuid;
ALTER TABLE public.templates ADD CONSTRAINT templates_service_fk FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id) ON DELETE RESTRICT;
CREATE INDEX templates_service_idx ON public.templates(office_id,service_id,id);
-- Editorial versions are immutable; this revision guards concurrent metadata edits.
ALTER TABLE public.templates ADD COLUMN config_version integer NOT NULL DEFAULT 0 CHECK(config_version BETWEEN 0 AND 2147483646);
ALTER TABLE public.templates ADD COLUMN execution_level integer NOT NULL DEFAULT 3 CHECK(execution_level IN (1,2,3));

CREATE FUNCTION private.template_folders_immutable22() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.template_folder_commands FOR EACH ROW EXECUTE FUNCTION private.template_folders_immutable22();

CREATE FUNCTION private.template_folder_actor22(p_office uuid,p_action text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid;caps text[];BEGIN
 actor:=private.team_require_identity();PERFORM 1 FROM public.offices WHERE id=p_office FOR SHARE;
 IF NOT EXISTS(SELECT 1 FROM public.memberships WHERE office_id=p_office AND user_id=actor AND active AND role_code IN ('owner','admin'))
 THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 caps:=private.current_permissions(p_office);
 IF NOT caps @> ARRAY['foundation.access','templates.read',p_action] THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN actor;
END $$;

-- Pastas: lista paginada com contagem de modelos (exclusão exige pasta vazia).
CREATE FUNCTION private.template_folders_page(p_office_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;total bigint;BEGIN
 PERFORM private.templates_actor20(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS(SELECT f.id,f.name,f.level,f.latest_version,(SELECT count(*) FROM public.templates t WHERE t.office_id=f.office_id AND t.folder_id=f.id)templates_count FROM public.template_folders f WHERE f.office_id=p_office_id),page AS(SELECT * FROM candidates ORDER BY lower(name),id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY lower(name),id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

-- Criar/renomear/mover nível/excluir (somente vazia). Idempotência por chave e digest; lock forte primeiro.
CREATE FUNCTION private.template_folder_save(p_office_id uuid,p_folder_id uuid,p_name text,p_level integer,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;f public.template_folders;cmd public.template_folder_commands;digest text;normalized text;BEGIN
 actor:=private.template_folder_actor22(p_office_id,'templates.folders');
 normalized:=btrim(p_name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
 IF normalized IS NULL OR char_length(normalized) NOT BETWEEN 1 AND 80 OR normalized ~ '[[:cntrl:]]' OR p_level IS NULL OR p_level NOT IN(1,2,3)
  OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483645 OR p_reason IS NULL OR (char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(p_reason)) OR p_reason ~ '[[:cntrl:]]' OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('operation','folder','folder_id',p_folder_id,'name',normalized,'level',p_level,'expected_version',p_expected_version,'reason',p_reason)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM public.template_folder_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF cmd.payload_digest<>digest THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN coalesce(private.template_folder_detail22(p_office_id,cmd.folder_id),jsonb_build_object('deleted',true));
 END IF;
 IF p_folder_id IS NULL THEN
  IF p_expected_version<>0 THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF EXISTS(SELECT FROM public.template_folders WHERE office_id=p_office_id AND lower(name)=lower(normalized))THEN RAISE EXCEPTION 'TEMPLATE_DUPLICATE' USING ERRCODE='PT409';END IF;
  INSERT INTO public.template_folders(office_id,name,level,latest_version,created_by)VALUES(p_office_id,normalized,p_level,0,actor) RETURNING * INTO f;
 ELSE
  SELECT * INTO f FROM public.template_folders WHERE office_id=p_office_id AND id=p_folder_id FOR UPDATE;
  IF f.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF f.latest_version<>p_expected_version THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF p_reason='__delete__' THEN
   IF EXISTS(SELECT 1 FROM public.templates t WHERE t.office_id=p_office_id AND t.folder_id=f.id LIMIT 1)THEN RAISE EXCEPTION 'TEMPLATE_FOLDER_NOT_EMPTY' USING ERRCODE='PT409';END IF;
   DELETE FROM public.template_folders WHERE office_id=p_office_id AND id=f.id;
   INSERT INTO public.template_folder_commands(office_id,actor_id,idempotency_key,payload_digest,folder_id)VALUES(p_office_id,actor,p_idempotency_key,digest,f.id);
   PERFORM private.emit_business_event(p_office_id,'templates.folder_deleted','template_folder',f.id,p_idempotency_key,jsonb_build_object('name',f.name,'level',f.level));
   RETURN jsonb_build_object('deleted',true);
  END IF;
  IF lower(normalized)<>lower(f.name) AND EXISTS(SELECT FROM public.template_folders WHERE office_id=p_office_id AND lower(name)=lower(normalized) AND id<>f.id)THEN RAISE EXCEPTION 'TEMPLATE_DUPLICATE' USING ERRCODE='PT409';END IF;
  UPDATE public.template_folders SET name=normalized,level=p_level,latest_version=latest_version+1 WHERE office_id=p_office_id AND id=f.id RETURNING * INTO f;
 END IF;
 INSERT INTO public.template_folder_commands(office_id,actor_id,idempotency_key,payload_digest,folder_id)VALUES(p_office_id,actor,p_idempotency_key,digest,f.id);
 PERFORM private.emit_business_event(p_office_id,'templates.folder_saved','template_folder',f.id,p_idempotency_key,jsonb_build_object('name',f.name,'level',f.level));
 RETURN private.template_folder_detail22(p_office_id,f.id);
END $$;

CREATE FUNCTION private.template_folder_detail22(p_office_id uuid,p_folder_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'name',f.name,'level',f.level,'latest_version',f.latest_version,'templates_count',(SELECT count(*) FROM public.templates t WHERE t.office_id=f.office_id AND t.folder_id=f.id),'page',1)
 FROM public.template_folders f WHERE f.office_id=p_office_id AND f.id=p_folder_id;
$$;

-- Vínculo modelo↔serviço (preço) e pasta do modelo. Altera metadados do modelo, não o texto versionado.
CREATE FUNCTION private.template_link22(p_office_id uuid,p_template_id uuid,p_service_id uuid,p_folder_id uuid,p_level integer,p_expected_version integer,p_expected_config_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;cmd private.template_commands;digest text;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 -- Employees cannot alter model pricing or classification even if separately delegated templates.manage.
 PERFORM private.template_folder_actor22(p_office_id,'templates.folders');
 IF p_level IS NULL OR p_level NOT IN (1,2,3)
  OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483646
  OR p_expected_config_version IS NULL OR p_expected_config_version NOT BETWEEN 0 AND 2147483645
  OR p_reason IS NULL OR (char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(p_reason)) OR p_reason ~ '[[:cntrl:]]' OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.template_folders WHERE office_id=p_office_id AND id=p_folder_id)THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_service_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.services WHERE office_id=p_office_id AND id=p_service_id)THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('operation','link','template_id',p_template_id,'service_id',p_service_id,'folder_id',p_folder_id,'level',p_level,'expected_version',p_expected_version,'expected_config_version',p_expected_config_version,'reason',p_reason)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.template_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.payload_digest<>digest THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.template_detail22(p_office_id,cmd.template_id,1);END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF t.latest_version<>p_expected_version OR t.config_version<>p_expected_config_version THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_service_id IS DISTINCT FROM t.service_id AND NOT (private.current_permissions(p_office_id) @> ARRAY['services.manage'])
 THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 UPDATE public.templates SET service_id=p_service_id,folder_id=p_folder_id,execution_level=p_level,config_version=config_version+1 WHERE office_id=p_office_id AND id=t.id;
 INSERT INTO private.template_commands(office_id,actor_id,idempotency_key,payload_digest,template_id)VALUES(p_office_id,actor,p_idempotency_key,digest,t.id);
 PERFORM private.emit_business_event(p_office_id,'templates.linked','template',t.id,p_idempotency_key,jsonb_build_object('service_id',p_service_id,'folder_id',p_folder_id,'level',p_level));
 RETURN private.template_detail22(p_office_id,t.id,1);
END $$;

-- Detalhe enriquecido (nível/pasta/serviço vigente) preservando o corpo20 das versões.
CREATE FUNCTION private.template_detail22(p_office_id uuid,p_template_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 -- Required even when called through the public SQL wrapper: approved drafts
 -- and their contents must never become readable to clients/other offices.
 PERFORM private.templates_actor20(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT base||jsonb_build_object('folder_id',t.folder_id,'level',t.execution_level,'config_version',t.config_version,'service',CASE WHEN sv.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'code',s.code,'name',sv.name,'version_id',sv.id,'price_cents',sv.price_cents)END) INTO result
 FROM public.templates t
 LEFT JOIN public.template_folders f ON f.office_id=t.office_id AND f.id=t.folder_id
 LEFT JOIN public.services s ON s.office_id=t.office_id AND s.id=t.service_id
 LEFT JOIN LATERAL(SELECT sv.* FROM public.service_versions sv WHERE sv.office_id=s.office_id AND sv.service_id=s.id AND sv.effective_from<=clock_timestamp() ORDER BY sv.effective_from DESC LIMIT 1)sv ON true
 CROSS JOIN LATERAL(SELECT private.template_detail20(t,p_page))x(base)
 WHERE t.office_id=p_office_id AND t.id=p_template_id;
 IF result IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN result;
END $$;
$$;

-- Página enriquecida (pasta, nível e serviço vigente) com a assinatura original de 4 argumentos.
CREATE OR REPLACE FUNCTION private.templates_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;total bigint;at_time timestamptz;BEGIN
 PERFORM private.templates_actor20(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 at_time:=clock_timestamp();
 WITH candidates AS(
  SELECT t.id,t.code,v.definition->>'name' name,v.definition->>'kind' kind,(v.definition->>'demonstration')::boolean demonstration,t.latest_version,t.folder_id,f.name folder_name,t.execution_level level,
   (SELECT max(cv.number) FROM public.template_versions cv JOIN private.template_approvals a ON a.office_id=cv.office_id AND a.template_id=cv.template_id AND a.version_id=cv.id WHERE cv.office_id=t.office_id AND cv.template_id=t.id AND greatest(a.approved_at,(cv.definition->>'effective_from')::timestamptz)<=at_time AND((cv.definition->>'effective_until') IS NULL OR(cv.definition->>'effective_until')::timestamptz>at_time))current_version,
   (SELECT CASE WHEN sv.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'code',s.code,'name',sv.name,'version_id',sv.id,'price_cents',sv.price_cents)END FROM public.services s LEFT JOIN LATERAL(SELECT sv.* FROM public.service_versions sv WHERE sv.office_id=s.office_id AND sv.service_id=s.id AND sv.effective_from<=at_time ORDER BY sv.effective_from DESC LIMIT 1)sv ON true WHERE s.office_id=t.office_id AND s.id=t.service_id)service
  FROM public.templates t JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
  LEFT JOIN public.template_folders f ON f.office_id=t.office_id AND f.id=t.folder_id
  WHERE t.office_id=p_office_id
   AND(btrim(p_query)='' OR strpos(lower(t.code||' '||(v.definition->>'name')),lower(btrim(p_query)))>0)),
 page AS(SELECT * FROM candidates ORDER BY folder_name NULLS FIRST,code,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY folder_name NULLS FIRST,code,id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

-- Busca privada de modelos por pasta/nível para equipe. Portal do cliente
-- terá endpoint de ofertas aprovadas separado, sem expor minutas internas.
CREATE FUNCTION private.templates_folder_search22(p_office_id uuid,p_query text,p_page integer,p_size integer,p_folder_id uuid,p_level integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;total bigint;at_time timestamptz;BEGIN
 PERFORM private.templates_actor20(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR(p_level IS NOT NULL AND p_level NOT IN(1,2,3))THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 at_time:=clock_timestamp();
 WITH candidates AS(
  SELECT t.id,t.code,v.definition->>'name' name,v.definition->>'kind' kind,(v.definition->>'demonstration')::boolean demonstration,t.latest_version,t.folder_id,f.name folder_name,t.execution_level level,
   (SELECT max(cv.number) FROM public.template_versions cv JOIN private.template_approvals a ON a.office_id=cv.office_id AND a.template_id=cv.template_id AND a.version_id=cv.id WHERE cv.office_id=t.office_id AND cv.template_id=t.id AND greatest(a.approved_at,(cv.definition->>'effective_from')::timestamptz)<=at_time AND((cv.definition->>'effective_until') IS NULL OR(cv.definition->>'effective_until')::timestamptz>at_time))current_version,
   (SELECT CASE WHEN sv.id IS NULL THEN NULL ELSE jsonb_build_object('id',s.id,'code',s.code,'name',sv.name,'version_id',sv.id,'price_cents',sv.price_cents)END FROM public.services s LEFT JOIN LATERAL(SELECT sv.* FROM public.service_versions sv WHERE sv.office_id=s.office_id AND sv.service_id=s.id AND sv.effective_from<=at_time ORDER BY sv.effective_from DESC LIMIT 1)sv ON true WHERE s.office_id=t.office_id AND s.id=t.service_id)service
  FROM public.templates t JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
  LEFT JOIN public.template_folders f ON f.office_id=t.office_id AND f.id=t.folder_id
  WHERE t.office_id=p_office_id AND(p_folder_id IS NULL OR t.folder_id=p_folder_id)AND(p_level IS NULL OR t.execution_level=p_level)
   AND(btrim(p_query)='' OR strpos(lower(t.code||' '||(v.definition->>'name')),lower(btrim(p_query)))>0)),
 page AS(SELECT * FROM candidates ORDER BY folder_name NULLS FIRST,code,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY folder_name NULLS FIRST,code,id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

CREATE FUNCTION public.template_folders_page(p_office_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_folders_page(p_office_id,p_page,p_size);$$;
CREATE FUNCTION public.template_folder_save(p_office_id uuid,p_folder_id uuid,p_name text,p_level integer,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_folder_save(p_office_id,p_folder_id,p_name,p_level,p_expected_version,p_reason,p_idempotency_key);$$;
CREATE FUNCTION public.template_link(p_office_id uuid,p_template_id uuid,p_service_id uuid,p_folder_id uuid,p_level integer,p_expected_version integer,p_expected_config_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_link22(p_office_id,p_template_id,p_service_id,p_folder_id,p_level,p_expected_version,p_expected_config_version,p_reason,p_idempotency_key);$$;
CREATE OR REPLACE FUNCTION public.templates_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.templates_page(p_office_id,p_query,p_page,p_size);$$;
CREATE FUNCTION public.templates_folder_search(p_office_id uuid,p_query text,p_page integer,p_size integer,p_folder_id uuid,p_level integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.templates_folder_search22(p_office_id,p_query,p_page,p_size,p_folder_id,p_level);$$;
CREATE OR REPLACE FUNCTION public.template_detail(p_office_id uuid,p_template_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.template_detail22(p_office_id,p_template_id,p_page);$$;
-- Existing create/edit/approve RPCs return the same enriched projection on success.
-- They keep their original versioning, idempotency and approval semantics.
CREATE OR REPLACE FUNCTION public.template_save(p_office_id uuid,p_template_id uuid,p_definition jsonb,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.template_detail22(p_office_id,(private.template_save(p_office_id,p_template_id,p_definition,p_expected_version,p_reason,p_idempotency_key)->>'id')::uuid,1);
$$;
CREATE OR REPLACE FUNCTION public.template_approve(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.template_detail22(p_office_id,(private.template_approve(p_office_id,p_template_id,p_version_id,p_expected_version,p_reason,p_idempotency_key)->>'id')::uuid,1);
$$;

DO $$DECLARE r record;BEGIN FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace IN('public'::regnamespace,'private'::regnamespace) AND(proname LIKE 'template_folders_%' OR proname LIKE 'template_folder_%' OR proname='template_link22' OR proname='template_detail22' OR proname='templates_folder_search22') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);END LOOP;
 FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('template_folders_page','template_folder_save','template_link','templates_folder_search') LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.signature);END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
