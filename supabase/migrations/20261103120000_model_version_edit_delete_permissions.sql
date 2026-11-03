-- Modelos: edição/exclusão da mesma versão, título e organização por permissão.
-- Versões continuam preservadas por auditoria; a exclusão é lógica e o conteúdo
-- anterior fica em private.template_version_events. As ações de pasta, título,
-- movimentação, edição e exclusão deixam de exigir cargo fixo e passam a exigir
-- a permissão templates.manage, que o super administrador sempre possui e que
-- pode ser concedida a administradores ou funcionários em Equipe → editar acesso.

ALTER TABLE public.template_versions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS edit_reason text;

DROP TRIGGER IF EXISTS immutable ON public.template_versions;
DROP TRIGGER IF EXISTS immutable_delete ON public.template_versions;
CREATE TRIGGER immutable_delete BEFORE DELETE ON public.template_versions
  FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();

CREATE TABLE IF NOT EXISTS private.template_version_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id uuid NOT NULL,
  template_id uuid NOT NULL,
  version_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  command jsonb NOT NULL,
  expected_version integer NOT NULL,
  old_definition jsonb NOT NULL,
  new_definition jsonb,
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500 AND private.templates_has_text20(reason) AND reason !~ '[[:cntrl:]]'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(office_id,actor_id,idempotency_key),
  FOREIGN KEY(office_id,template_id,version_id) REFERENCES public.template_versions(office_id,template_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS template_version_events_template_idx ON private.template_version_events(office_id,template_id);
ALTER TABLE private.template_version_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.template_version_events FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS template_version_events_immutable ON private.template_version_events;
CREATE TRIGGER template_version_events_immutable BEFORE UPDATE OR DELETE ON private.template_version_events
  FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();

-- A versão consultada informa quando foi editada no lugar, sem alterar a
-- aprovação já registrada. O histórico anterior está em template_version_events.
CREATE OR REPLACE FUNCTION private.template_version20(v public.template_versions) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT v.definition||jsonb_build_object('id',v.id,'number',v.number,'created_by',v.created_by,'created_by_name',v.created_by_name,'created_at',v.created_at,'reason',v.reason,'approved_by',a.approved_by,'approved_by_name',a.approved_by_name,'approved_at',a.approved_at,'approval_reason',a.reason,'edited_at',v.edited_at) FROM(SELECT 1)x LEFT JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id;
$$;

CREATE OR REPLACE FUNCTION private.template_detail20(t public.templates,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH access AS (SELECT private.model_can_read_drafts(t.office_id) drafts),visible AS (
  SELECT v.* FROM public.template_versions v CROSS JOIN access x WHERE v.office_id=t.office_id AND v.template_id=t.id AND v.archived_at IS NULL
  AND (x.drafts OR EXISTS(SELECT FROM private.template_approvals a WHERE a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id))
 ),page AS (SELECT * FROM visible ORDER BY number DESC LIMIT 5 OFFSET(p_page-1)*5)
 SELECT jsonb_build_object('id',t.id,'code',t.code,'latest_version',t.latest_version,'can_manage',private.current_permissions(t.office_id) @> ARRAY['templates.manage'],
 'can_approve',private.current_permissions(t.office_id) @> ARRAY['templates.approve'] AND EXISTS(SELECT FROM public.memberships WHERE office_id=t.office_id AND user_id=auth.uid() AND active AND role_code IN('owner','admin')),
 'versions',coalesce((SELECT jsonb_agg(private.template_version20(v) ORDER BY v.number DESC) FROM page v),'[]'::jsonb),
 'history_total',(SELECT count(*) FROM visible),'history_page',p_page);
$$;

CREATE OR REPLACE FUNCTION private.templates_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT private.model_templates_page(p_office_id,NULL,false,false,p_query,p_page,p_size,'all');
$$;

CREATE OR REPLACE FUNCTION private.model_templates_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_archived boolean,p_query text,p_page integer,p_size integer,p_state text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total bigint; at_time timestamptz; drafts boolean; BEGIN
 PERFORM private.templates_actor20(p_office_id);
 drafts:=private.model_can_read_drafts(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR p_unfiled IS NULL OR p_archived IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) OR p_state IS NULL OR p_state NOT IN('all','approved','draft') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT drafts AND (p_state='draft' OR p_archived) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT FROM private.model_folders WHERE office_id=p_office_id AND id=p_folder_id) THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 at_time:=clock_timestamp();
 WITH candidates AS (
 SELECT t.id,t.code,coalesce(m.display_name,v.definition->>'name') name,v.definition->>'kind' kind,(v.definition->>'demonstration')::boolean demonstration,t.latest_version,
 coalesce(m.revision,0) metadata_revision,m.archived_at,l.folder_id,cv.number current_version,
 NOT EXISTS(SELECT FROM private.template_approvals a WHERE a.office_id=t.office_id AND a.template_id=t.id AND a.version_id=latest.id) is_draft
 FROM public.templates t
 JOIN public.template_versions latest ON latest.office_id=t.office_id AND latest.template_id=t.id AND latest.number=t.latest_version AND latest.archived_at IS NULL
 LEFT JOIN LATERAL (
  SELECT approved.* FROM public.template_versions approved JOIN private.template_approvals a ON a.office_id=approved.office_id AND a.template_id=approved.template_id AND a.version_id=approved.id
  WHERE approved.office_id=t.office_id AND approved.template_id=t.id AND approved.archived_at IS NULL AND a.approved_at<=at_time
   AND ((approved.definition->>'effective_from') IS NULL OR (approved.definition->>'effective_from')::timestamptz<=at_time)
   AND ((approved.definition->>'effective_until') IS NULL OR (approved.definition->>'effective_until')::timestamptz>at_time)
  ORDER BY approved.number DESC LIMIT 1
 ) cv ON true
 JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.id=CASE WHEN p_state='approved' OR NOT drafts THEN cv.id ELSE latest.id END
 LEFT JOIN private.model_metadata m ON m.office_id=t.office_id AND m.template_id=t.id LEFT JOIN private.model_locations l ON l.office_id=t.office_id AND l.template_id=t.id
 WHERE t.office_id=p_office_id AND (m.archived_at IS NOT NULL)=p_archived AND (p_folder_id IS NULL OR l.folder_id=p_folder_id) AND (NOT p_unfiled OR l.folder_id IS NULL)
 AND (btrim(p_query)='' OR strpos(lower(t.code||' '||coalesce(m.display_name,v.definition->>'name')),lower(btrim(p_query)))>0)),
 filtered AS (SELECT * FROM candidates WHERE p_state='all' OR p_state='approved' AND current_version IS NOT NULL OR p_state='draft' AND is_draft),
 page AS (SELECT * FROM filtered ORDER BY code,id LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(to_jsonb(page)-'is_draft' ORDER BY code,id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

-- Somente a permissão decide a edição. O cargo não é mais uma barreira extra.
CREATE OR REPLACE FUNCTION private.model_folders_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; manageable boolean; BEGIN
 actor:=private.templates_actor20(p_office_id);
 manageable:=private.current_permissions(p_office_id) @> ARRAY['templates.manage'];
 RETURN jsonb_build_object('folders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'revision',revision,'category',private.model_folder_category(p_office_id,id)) ORDER BY name,id) FROM private.model_folders WHERE office_id=p_office_id),'[]'::jsonb),
 'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('template_id',template_id,'folder_id',folder_id,'revision',revision) ORDER BY template_id) FROM private.model_locations WHERE office_id=p_office_id),'[]'::jsonb),'can_manage',coalesce(manageable,false));
END $$;

CREATE OR REPLACE FUNCTION private.model_folders_command(p_office_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; operation text; fid uuid; tid uuid; expected integer; nm text; old_payload jsonb; f private.model_folders; loc private.model_locations; BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 operation:=p_command->>'kind';
 IF (operation='create' AND (NOT p_command ?& ARRAY['kind','name'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>2)) OR
 (operation='rename' AND (NOT p_command ?& ARRAY['kind','folder_id','expected_revision','name'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4)) OR
 (operation='delete' AND (NOT p_command ?& ARRAY['kind','folder_id','expected_revision'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>3)) OR
 (operation='move' AND (NOT p_command ?& ARRAY['kind','template_id','folder_id','expected_revision'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4)) OR operation NOT IN('create','rename','delete','move') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF operation IN('create','rename') THEN nm:=p_command->>'name'; IF jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR char_length(nm) NOT BETWEEN 1 AND 120 OR NOT private.templates_has_text20(nm) OR nm ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF; END IF;
 BEGIN
 IF operation IN('rename','delete','move') THEN
 IF jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision' !~ '^(0|[1-9][0-9]{0,8})$' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 expected:=(p_command->>'expected_revision')::integer;
 IF operation IN('rename','delete') THEN fid:=(p_command->>'folder_id')::uuid; IF fid IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 ELSE tid:=(p_command->>'template_id')::uuid; fid:=(p_command->>'folder_id')::uuid; IF tid IS NULL OR jsonb_typeof(p_command->'folder_id') NOT IN('string','null') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF; END IF; END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END;
 SELECT payload INTO old_payload FROM private.model_folder_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN actor:=private.templates_actor20(p_office_id,'templates.manage');IF old_payload<>p_command THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF; RETURN private.model_folders_state(p_office_id); END IF;
 IF operation='create' THEN actor:=private.templates_actor20(p_office_id,'templates.manage');INSERT INTO private.model_folders(office_id,name) VALUES(p_office_id,nm);
 ELSIF operation IN('rename','delete') THEN
 SELECT * INTO f FROM private.model_folders WHERE office_id=p_office_id AND id=fid FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF f.revision<>expected THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF operation='rename' THEN UPDATE private.model_folders SET name=nm,revision=revision+1 WHERE id=fid;
 ELSE
  -- Modelos arquivados não mantêm a pasta ocupada; o vínculo é removido para
  -- permitir excluir uma pasta que só continha modelos já excluídos.
  DELETE FROM private.model_locations l USING private.model_metadata m WHERE l.office_id=p_office_id AND l.folder_id=fid AND m.office_id=l.office_id AND m.template_id=l.template_id AND m.archived_at IS NOT NULL;
  IF EXISTS(SELECT FROM private.model_locations WHERE office_id=p_office_id AND folder_id=fid) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
  DELETE FROM private.model_folders WHERE office_id=p_office_id AND id=fid;
 END IF;
 ELSE
 PERFORM 1 FROM public.templates WHERE office_id=p_office_id AND id=tid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF fid IS NOT NULL THEN PERFORM 1 FROM private.model_folders WHERE office_id=p_office_id AND id=fid FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF; END IF;
 SELECT * INTO loc FROM private.model_locations WHERE office_id=p_office_id AND template_id=tid FOR UPDATE;
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF coalesce(loc.revision,0)<>expected THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 INSERT INTO private.model_locations(office_id,template_id,folder_id) VALUES(p_office_id,tid,fid) ON CONFLICT(office_id,template_id) DO UPDATE SET folder_id=EXCLUDED.folder_id,revision=private.model_locations.revision+1;
 END IF;
 INSERT INTO private.model_folder_commands VALUES(p_office_id,actor,p_idempotency_key,p_command);
 RETURN private.model_folders_state(p_office_id);
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';
END $$;

CREATE OR REPLACE FUNCTION private.model_metadata_command(p_office_id uuid,p_template_id uuid,p_command jsonb,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;m private.model_metadata;event private.model_metadata_events;op text;nm text;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF p_template_id IS NULL OR p_idempotency_key IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 2147483645 OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 op:=p_command->>'kind';
 IF (op='rename' AND (NOT p_command ?& ARRAY['kind','name'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>2 OR jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string')) OR (op IN('archive','restore') AND (SELECT count(*) FROM jsonb_object_keys(p_command))<>1) OR op NOT IN('rename','archive','restore') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF op='rename' THEN nm:=p_command->>'name';IF char_length(nm) NOT BETWEEN 1 AND 120 OR NOT private.templates_has_text20(nm) OR nm ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 SELECT * INTO event FROM private.model_metadata_events WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND AND (event.template_id<>p_template_id OR event.command<>p_command OR event.expected_revision<>p_expected_revision) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 SELECT * INTO m FROM private.model_metadata WHERE office_id=p_office_id AND template_id=t.id FOR UPDATE;
 IF event.id IS NULL THEN
 IF coalesce(m.revision,0)<>p_expected_revision OR (op='archive' AND m.archived_at IS NOT NULL) OR (op='restore' AND m.archived_at IS NULL) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF m.template_id IS NULL THEN SELECT v.definition->>'name' INTO nm FROM public.template_versions v WHERE v.office_id=p_office_id AND v.template_id=t.id AND v.number=t.latest_version AND v.archived_at IS NULL; nm:=coalesce(nm,'Modelo'); IF op='rename' THEN nm:=p_command->>'name';END IF;
 INSERT INTO private.model_metadata(office_id,template_id,revision,display_name,archived_at) VALUES(p_office_id,t.id,1,nm,CASE WHEN op='archive' THEN clock_timestamp() ELSE NULL END) RETURNING * INTO m;
 ELSE UPDATE private.model_metadata SET revision=revision+1,display_name=CASE WHEN op='rename' THEN nm ELSE display_name END,archived_at=CASE WHEN op='archive' THEN clock_timestamp() WHEN op='restore' THEN NULL ELSE archived_at END WHERE office_id=p_office_id AND template_id=t.id RETURNING * INTO m;END IF;
 INSERT INTO private.model_metadata_events(office_id,template_id,actor_id,idempotency_key,command,expected_revision) VALUES(p_office_id,t.id,actor,p_idempotency_key,p_command,p_expected_revision);
 END IF;
 RETURN jsonb_build_object('template_id',t.id,'display_name',m.display_name,'archived_at',m.archived_at,'revision',m.revision);
END $$;

CREATE OR REPLACE FUNCTION private.model_commercial_state(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;m private.model_metadata;o private.document_offerings;caps text[];is_manager boolean;name text;BEGIN
 actor:=private.templates_actor20(p_office_id);
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO m FROM private.model_metadata WHERE office_id=p_office_id AND template_id=t.id;
 IF NOT private.model_can_read_drafts(p_office_id) AND (m.archived_at IS NOT NULL OR NOT EXISTS(SELECT FROM private.template_approvals WHERE office_id=p_office_id AND template_id=t.id)) THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT coalesce(m.display_name,v.definition->>'name') INTO name FROM public.template_versions v WHERE v.office_id=p_office_id AND v.template_id=t.id AND v.number=t.latest_version AND v.archived_at IS NULL;
 caps:=private.current_permissions(p_office_id);
 SELECT role_code IN('owner','admin') AND caps @> ARRAY['templates.manage','services.read','services.manage'] INTO is_manager FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF caps @> ARRAY['services.read'] THEN SELECT * INTO o FROM private.document_offerings WHERE office_id=p_office_id AND template_id=t.id;END IF;
 RETURN jsonb_build_object('metadata',jsonb_build_object('template_id',t.id,'display_name',name,'archived_at',m.archived_at,'revision',coalesce(m.revision,0)),'offer',CASE WHEN o.template_id IS NULL THEN NULL ELSE to_jsonb(o)-'office_id' END,'can_manage',coalesce(is_manager,false),'can_manage_metadata',caps @> ARRAY['templates.manage']);
END $$;

CREATE OR REPLACE FUNCTION private.model_duplicate(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_code text,p_name text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;v public.template_versions;d jsonb;result jsonb;newid uuid;cmd private.model_duplicate_commands;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF p_template_id IS NULL OR p_version_id IS NULL OR p_idempotency_key IS NULL OR p_code IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO cmd FROM private.model_duplicate_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.source_template_id<>p_template_id OR cmd.source_version_id<>p_version_id OR cmd.code<>p_code OR cmd.name<>p_name THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSIF EXISTS(SELECT FROM private.template_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v FROM public.template_versions WHERE office_id=p_office_id AND template_id=p_template_id AND id=p_version_id AND archived_at IS NULL FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 d:=v.definition||jsonb_build_object('code',p_code,'name',p_name);
 result:=private.template_save(p_office_id,NULL,d,0,'Duplicação de modelo',p_idempotency_key);
 newid:=(result->>'id')::uuid;
 INSERT INTO private.model_metadata(office_id,template_id,revision,display_name,origin_template_id,origin_version_id) VALUES(p_office_id,newid,1,p_name,p_template_id,p_version_id) ON CONFLICT(office_id,template_id) DO NOTHING;
 INSERT INTO private.model_duplicate_commands VALUES(p_office_id,actor,p_idempotency_key,p_template_id,p_version_id,p_code,p_name) ON CONFLICT DO NOTHING;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.template_approve(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;v public.template_versions;cmd private.template_commands;digest text;actorname text;approved_time timestamptz;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.approve');
 IF p_idempotency_key IS NULL OR p_version_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483646 OR p_reason IS NULL OR (char_length(p_reason) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(p_reason)) OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('operation','approve','template_id',p_template_id,'version_id',p_version_id,'expected_version',p_expected_version,'reason',p_reason)::text,'sha256'),'hex');SELECT * INTO cmd FROM private.template_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.payload_digest<>digest THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.template_detail(p_office_id,cmd.template_id,1);END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;SELECT * INTO v FROM public.template_versions WHERE office_id=p_office_id AND template_id=p_template_id AND id=p_version_id AND archived_at IS NULL FOR SHARE;
 actor:=private.templates_actor20(p_office_id,'templates.approve');IF t.id IS NULL OR v.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF t.latest_version<>p_expected_version OR v.number<>p_expected_version OR EXISTS(SELECT FROM private.template_approvals WHERE office_id=p_office_id AND template_id=t.id AND version_id=v.id) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 approved_time:=clock_timestamp();IF(v.definition->>'effective_until')::timestamptz<=greatest(approved_time,(v.definition->>'effective_from')::timestamptz) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actorname FROM public.profiles WHERE id=actor;actorname:=coalesce(actorname,'Integrante da equipe');
 INSERT INTO private.template_approvals(office_id,template_id,version_id,approved_by,approved_by_name,approved_at,reason)VALUES(p_office_id,t.id,v.id,actor,actorname,approved_time,p_reason);
 INSERT INTO private.template_commands(office_id,actor_id,idempotency_key,payload_digest,template_id)VALUES(p_office_id,actor,p_idempotency_key,digest,t.id);
 PERFORM private.emit_business_event(p_office_id,'templates.approved','template',t.id,p_idempotency_key,'{}');RETURN private.template_detail20(t,1);END $$;

CREATE OR REPLACE FUNCTION private.model_version_command(p_office_id uuid,p_template_id uuid,p_command jsonb,p_expected_version integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;v public.template_versions;e private.template_version_events;op text;def jsonb;why text;remaining integer;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF p_template_id IS NULL OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483646 OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 op:=p_command->>'kind';
 IF (op='edit' AND (NOT p_command ?& ARRAY['kind','version_id','definition','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4)) OR (op='delete' AND (NOT p_command ?& ARRAY['kind','version_id','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>3)) OR op NOT IN('edit','delete') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 why:=p_command->>'reason';IF jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR char_length(why) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(why) OR why ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF op='edit' THEN def:=p_command->'definition';PERFORM private.templates_validate20(def);END IF;
 SELECT * INTO e FROM private.template_version_events WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF e.template_id<>p_template_id OR e.command<>p_command OR e.expected_version<>p_expected_version THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
  SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id;IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  RETURN private.template_detail20(t,1);
 END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF t.latest_version<>p_expected_version THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO v FROM public.template_versions WHERE office_id=p_office_id AND template_id=p_template_id AND id=(p_command->>'version_id')::uuid AND archived_at IS NULL FOR UPDATE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF op='edit' THEN
  IF v.number<>t.latest_version THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF def->>'code'<>t.code THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
  INSERT INTO private.template_version_events(office_id,template_id,version_id,actor_id,idempotency_key,command,expected_version,old_definition,new_definition,reason) VALUES(p_office_id,t.id,v.id,actor,p_idempotency_key,p_command,p_expected_version,v.definition,def,why);
  UPDATE public.template_versions SET definition=def,edited_at=clock_timestamp(),edited_by=actor,edit_reason=why WHERE id=v.id;
  PERFORM private.emit_business_event(p_office_id,'templates.version_edited','template',t.id,p_idempotency_key,'{}');
 ELSE
  INSERT INTO private.template_version_events(office_id,template_id,version_id,actor_id,idempotency_key,command,expected_version,old_definition,new_definition,reason) VALUES(p_office_id,t.id,v.id,actor,p_idempotency_key,p_command,p_expected_version,v.definition,NULL,why);
  UPDATE public.template_versions SET archived_at=clock_timestamp(),archived_by=actor,archive_reason=why WHERE id=v.id;
  IF v.number=t.latest_version THEN
   SELECT max(number) INTO remaining FROM public.template_versions WHERE office_id=p_office_id AND template_id=t.id AND archived_at IS NULL;
   IF remaining IS NULL THEN
    INSERT INTO private.model_metadata(office_id,template_id,revision,display_name,archived_at) VALUES(p_office_id,t.id,1,coalesce(v.definition->>'name','Modelo'),clock_timestamp())
    ON CONFLICT(office_id,template_id) DO UPDATE SET archived_at=clock_timestamp(),revision=private.model_metadata.revision+1;
   ELSE
    UPDATE public.templates SET latest_version=remaining WHERE id=t.id RETURNING * INTO t;
   END IF;
  END IF;
  PERFORM private.emit_business_event(p_office_id,'templates.version_deleted','template',t.id,p_idempotency_key,'{}');
 END IF;
 RETURN private.template_detail20(t,1);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';
END $$;

CREATE OR REPLACE FUNCTION private.model_version_edited_name() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.definition->>'name' IS DISTINCT FROM OLD.definition->>'name' THEN
  INSERT INTO private.model_metadata(office_id,template_id,revision,display_name) VALUES(NEW.office_id,NEW.template_id,1,NEW.definition->>'name')
  ON CONFLICT(office_id,template_id) DO UPDATE SET display_name=EXCLUDED.display_name,revision=private.model_metadata.revision+1;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS model_version_edited_name ON public.template_versions;
CREATE TRIGGER model_version_edited_name AFTER UPDATE OF definition ON public.template_versions
  FOR EACH ROW EXECUTE FUNCTION private.model_version_edited_name();

CREATE FUNCTION public.model_version_command(p_office_id uuid,p_template_id uuid,p_command jsonb,p_expected_version integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_version_command(p_office_id,p_template_id,p_command,p_expected_version,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.model_version_command(uuid,uuid,jsonb,integer,uuid),public.model_version_command(uuid,uuid,jsonb,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_version_command(uuid,uuid,jsonb,integer,uuid),public.model_version_command(uuid,uuid,jsonb,integer,uuid) TO authenticated;

-- Versões excluídas não entram no catálogo, nas opções de documento nem na
-- categoria derivada da pasta.
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_offer_projection(private.document_offerings,timestamptz)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND a.approved_at<=at_time','WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND v.archived_at IS NULL AND a.approved_at<=at_time');
 IF updated=body AND position('archived_at' in body)=0 THEN RAISE EXCEPTION 'document offer projection target not found';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.document_staff_offer_projection(private.document_offerings,timestamptz)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND a.approved_at<=at_time','WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND v.archived_at IS NULL AND a.approved_at<=at_time');
 IF updated=body AND position('archived_at' in body)=0 THEN RAISE EXCEPTION 'document staff offer projection target not found';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.document_options(uuid,text,uuid,text,integer)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE v.office_id=p_office_id AND a.approved_at<=at_time','WHERE v.office_id=p_office_id AND v.archived_at IS NULL AND a.approved_at<=at_time');
 IF updated=body AND position('archived_at' in body)=0 THEN RAISE EXCEPTION 'document options target not found';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.model_folder_category(uuid,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE l.office_id=p_office_id AND l.folder_id=p_folder_id','WHERE l.office_id=p_office_id AND l.folder_id=p_folder_id AND v.archived_at IS NULL');
 IF updated=body AND position('archived_at' in body)=0 THEN RAISE EXCEPTION 'folder category target not found';END IF;EXECUTE updated;
END $migration$;

NOTIFY pgrst,'reload schema';
