-- Current organization is separate from immutable template versions and approvals.
CREATE TABLE private.model_folders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL REFERENCES public.offices(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 120 AND private.templates_has_text20(name) AND name !~ '[[:cntrl:]]'),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), UNIQUE(office_id,id), UNIQUE(office_id,name)
);
CREATE TABLE private.model_locations (
 office_id uuid NOT NULL, template_id uuid NOT NULL, folder_id uuid, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(office_id,template_id), FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id),
 FOREIGN KEY(office_id,folder_id) REFERENCES private.model_folders(office_id,id)
);
CREATE INDEX model_locations_folder_idx ON private.model_locations(office_id,folder_id);
CREATE TABLE private.model_folder_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id), actor_id uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(office_id,actor_id,idempotency_key)
);
ALTER TABLE private.model_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.model_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.model_folder_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.model_folders, private.model_locations, private.model_folder_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.model_folders_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; manageable boolean; BEGIN
 actor:=private.templates_actor20(p_office_id);
 SELECT role_code IN('owner','admin') AND private.current_permissions(p_office_id) @> ARRAY['templates.manage'] INTO manageable FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 RETURN jsonb_build_object('folders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'revision',revision) ORDER BY name,id) FROM private.model_folders WHERE office_id=p_office_id),'[]'::jsonb),
 'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('template_id',template_id,'folder_id',folder_id,'revision',revision) ORDER BY template_id) FROM private.model_locations WHERE office_id=p_office_id),'[]'::jsonb),'can_manage',coalesce(manageable,false));
END $$;
CREATE FUNCTION private.model_folders_command(p_office_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; role_name text; operation text; fid uuid; tid uuid; expected integer; nm text; old_payload jsonb; f private.model_folders; loc private.model_locations; BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 SELECT role_code INTO role_name FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF role_name NOT IN('owner','admin') THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403'; END IF;
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
 IF FOUND THEN actor:=private.templates_actor20(p_office_id,'templates.manage');IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;IF old_payload<>p_command THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF; RETURN private.model_folders_state(p_office_id); END IF;
 IF operation='create' THEN actor:=private.templates_actor20(p_office_id,'templates.manage');IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;INSERT INTO private.model_folders(office_id,name) VALUES(p_office_id,nm);
 ELSIF operation IN('rename','delete') THEN
 SELECT * INTO f FROM private.model_folders WHERE office_id=p_office_id AND id=fid FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 actor:=private.templates_actor20(p_office_id,'templates.manage');IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF f.revision<>expected THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 IF operation='rename' THEN UPDATE private.model_folders SET name=nm,revision=revision+1 WHERE id=fid;
 ELSE IF EXISTS(SELECT FROM private.model_locations WHERE office_id=p_office_id AND folder_id=fid) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF; DELETE FROM private.model_folders WHERE id=fid; END IF;
 ELSE
 PERFORM 1 FROM public.templates WHERE office_id=p_office_id AND id=tid FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF fid IS NOT NULL THEN PERFORM 1 FROM private.model_folders WHERE office_id=p_office_id AND id=fid FOR SHARE; IF NOT FOUND THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF; END IF;
 SELECT * INTO loc FROM private.model_locations WHERE office_id=p_office_id AND template_id=tid FOR UPDATE;
 actor:=private.templates_actor20(p_office_id,'templates.manage');IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF coalesce(loc.revision,0)<>expected THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 INSERT INTO private.model_locations(office_id,template_id,folder_id) VALUES(p_office_id,tid,fid) ON CONFLICT(office_id,template_id) DO UPDATE SET folder_id=EXCLUDED.folder_id,revision=private.model_locations.revision+1;
 END IF;
 INSERT INTO private.model_folder_commands VALUES(p_office_id,actor,p_idempotency_key,p_command);
 RETURN private.model_folders_state(p_office_id);
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';
END $$;
CREATE FUNCTION public.model_folders_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_folders_state(p_office_id);$$;
CREATE FUNCTION public.model_folders_command(p_office_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_folders_command(p_office_id,p_command,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.model_folders_state(uuid),private.model_folders_command(uuid,jsonb,uuid),public.model_folders_state(uuid),public.model_folders_command(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_folders_state(uuid),private.model_folders_command(uuid,jsonb,uuid),public.model_folders_state(uuid),public.model_folders_command(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';

CREATE TABLE private.model_metadata (
 office_id uuid NOT NULL,template_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 1 AND 120 AND private.templates_has_text20(display_name) AND display_name !~ '[[:cntrl:]]'),archived_at timestamptz,
 PRIMARY KEY(office_id,template_id),FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id)
);
ALTER TABLE private.model_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.model_metadata FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.model_templates_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_archived boolean,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; total bigint; at_time timestamptz; BEGIN
 PERFORM private.templates_actor20(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR p_unfiled IS NULL OR p_archived IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT FROM private.model_folders WHERE office_id=p_office_id AND id=p_folder_id) THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 at_time:=clock_timestamp();
 WITH candidates AS (
 SELECT t.id,t.code,coalesce(m.display_name,v.definition->>'name') name,v.definition->>'kind' kind,(v.definition->>'demonstration')::boolean demonstration,t.latest_version,
 coalesce(m.revision,0) metadata_revision,m.archived_at,l.folder_id,
 (SELECT max(cv.number) FROM public.template_versions cv JOIN private.template_approvals a ON a.office_id=cv.office_id AND a.template_id=cv.template_id AND a.version_id=cv.id WHERE cv.office_id=t.office_id AND cv.template_id=t.id AND greatest(a.approved_at,(cv.definition->>'effective_from')::timestamptz)<=at_time AND ((cv.definition->>'effective_until') IS NULL OR (cv.definition->>'effective_until')::timestamptz>at_time)) current_version
 FROM public.templates t JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
 LEFT JOIN private.model_metadata m ON m.office_id=t.office_id AND m.template_id=t.id LEFT JOIN private.model_locations l ON l.office_id=t.office_id AND l.template_id=t.id
 WHERE t.office_id=p_office_id AND (m.archived_at IS NOT NULL)=p_archived AND (p_folder_id IS NULL OR l.folder_id=p_folder_id) AND (NOT p_unfiled OR l.folder_id IS NULL)
 AND (btrim(p_query)='' OR strpos(lower(t.code||' '||coalesce(m.display_name,v.definition->>'name')),lower(btrim(p_query)))>0)),
 page AS (SELECT * FROM candidates ORDER BY code,id LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY code,id) FROM page),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION public.model_templates_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_archived boolean,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_templates_page(p_office_id,p_folder_id,p_unfiled,p_archived,p_query,p_page,p_size);$$;
REVOKE ALL ON FUNCTION private.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer),public.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer),public.model_templates_page(uuid,uuid,boolean,boolean,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE TABLE private.model_metadata_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,template_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL, command jsonb NOT NULL,expected_revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id)
);
CREATE INDEX model_metadata_events_template_idx ON private.model_metadata_events(office_id,template_id);
ALTER TABLE private.model_metadata_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.model_metadata_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER model_metadata_events_immutable BEFORE UPDATE OR DELETE ON private.model_metadata_events FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.model_metadata_command(p_office_id uuid,p_template_id uuid,p_command jsonb,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;role_name text;t public.templates;m private.model_metadata;event private.model_metadata_events;op text;nm text;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 SELECT role_code INTO role_name FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF role_name NOT IN('owner','admin') THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_template_id IS NULL OR p_idempotency_key IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 2147483645 OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 op:=p_command->>'kind';
 IF (op='rename' AND (NOT p_command ?& ARRAY['kind','name'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>2 OR jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string')) OR (op IN('archive','restore') AND (SELECT count(*) FROM jsonb_object_keys(p_command))<>1) OR op NOT IN('rename','archive','restore') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF op='rename' THEN nm:=p_command->>'name';IF char_length(nm) NOT BETWEEN 1 AND 120 OR NOT private.templates_has_text20(nm) OR nm ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 SELECT * INTO event FROM private.model_metadata_events WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND AND (event.template_id<>p_template_id OR event.command<>p_command OR event.expected_revision<>p_expected_revision) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO m FROM private.model_metadata WHERE office_id=p_office_id AND template_id=t.id FOR UPDATE;
 IF event.id IS NULL THEN
 IF coalesce(m.revision,0)<>p_expected_revision OR (op='archive' AND m.archived_at IS NOT NULL) OR (op='restore' AND m.archived_at IS NULL) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF m.template_id IS NULL THEN SELECT v.definition->>'name' INTO nm FROM public.template_versions v WHERE v.office_id=p_office_id AND v.template_id=t.id AND v.number=t.latest_version; IF op='rename' THEN nm:=p_command->>'name';END IF;
 INSERT INTO private.model_metadata(office_id,template_id,revision,display_name,archived_at) VALUES(p_office_id,t.id,1,nm,CASE WHEN op='archive' THEN clock_timestamp() ELSE NULL END) RETURNING * INTO m;
 ELSE UPDATE private.model_metadata SET revision=revision+1,display_name=CASE WHEN op='rename' THEN nm ELSE display_name END,archived_at=CASE WHEN op='archive' THEN clock_timestamp() WHEN op='restore' THEN NULL ELSE archived_at END WHERE office_id=p_office_id AND template_id=t.id RETURNING * INTO m;END IF;
 INSERT INTO private.model_metadata_events(office_id,template_id,actor_id,idempotency_key,command,expected_revision) VALUES(p_office_id,t.id,actor,p_idempotency_key,p_command,p_expected_revision);
 END IF;
 RETURN jsonb_build_object('template_id',t.id,'display_name',m.display_name,'archived_at',m.archived_at,'revision',m.revision);
END $$;
CREATE FUNCTION public.model_metadata_command(p_office_id uuid,p_template_id uuid,p_command jsonb,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_metadata_command(p_office_id,p_template_id,p_command,p_expected_revision,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.model_metadata_command(uuid,uuid,jsonb,integer,uuid),public.model_metadata_command(uuid,uuid,jsonb,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_metadata_command(uuid,uuid,jsonb,integer,uuid),public.model_metadata_command(uuid,uuid,jsonb,integer,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
-- An archived model cannot be selected for a new document. Existing documents
-- and idempotent retries remain valid. Locking the template serializes archive.
CREATE FUNCTION private.model_guard_new_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.templates WHERE office_id=NEW.office_id AND id=NEW.template_id FOR SHARE;
 IF EXISTS(SELECT FROM private.model_metadata WHERE office_id=NEW.office_id AND template_id=NEW.template_id AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_guard_new_document BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION private.model_guard_new_document();
CREATE FUNCTION private.model_version_name() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT FROM public.memberships m WHERE m.office_id=NEW.office_id AND m.user_id=auth.uid() AND m.active AND m.role_code IN('owner','admin')) AND private.current_permissions(NEW.office_id) @> ARRAY['templates.manage'] THEN
  UPDATE private.model_metadata SET display_name=NEW.definition->>'name',revision=revision+1 WHERE office_id=NEW.office_id AND template_id=NEW.template_id;
 ELSIF NEW.number>1 THEN
  INSERT INTO private.model_metadata(office_id,template_id,revision,display_name) SELECT NEW.office_id,NEW.template_id,1,v.definition->>'name' FROM public.template_versions v WHERE v.office_id=NEW.office_id AND v.template_id=NEW.template_id AND v.number=NEW.number-1 ON CONFLICT(office_id,template_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER model_version_name AFTER INSERT ON public.template_versions FOR EACH ROW EXECUTE FUNCTION private.model_version_name();
DO $migration$ DECLARE body text; updated text; BEGIN
 SELECT pg_get_functiondef('private.document_options(uuid,text,uuid,text,integer)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE v.office_id=p_office_id AND a.approved_at<=at_time','WHERE v.office_id=p_office_id AND NOT EXISTS(SELECT FROM private.model_metadata mm WHERE mm.office_id=v.office_id AND mm.template_id=v.template_id AND mm.archived_at IS NOT NULL) AND a.approved_at<=at_time');
 IF updated=body THEN RAISE EXCEPTION 'document_options migration target not found'; END IF; EXECUTE updated;
END $migration$;
REVOKE ALL ON FUNCTION private.model_guard_new_document(),private.model_version_name() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.model_metadata ADD COLUMN origin_template_id uuid,ADD COLUMN origin_version_id uuid,
 ADD CONSTRAINT model_metadata_origin_pair CHECK ((origin_template_id IS NULL)=(origin_version_id IS NULL)),
 ADD CONSTRAINT model_metadata_origin_fk FOREIGN KEY(office_id,origin_template_id,origin_version_id) REFERENCES public.template_versions(office_id,template_id,id);
CREATE INDEX model_metadata_origin_idx ON private.model_metadata(office_id,origin_template_id,origin_version_id);
CREATE FUNCTION private.model_duplicate(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_code text,p_name text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;v public.template_versions;d jsonb;result jsonb;newid uuid;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_template_id IS NULL OR p_version_id IS NULL OR p_idempotency_key IS NULL OR p_code IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO v FROM public.template_versions WHERE office_id=p_office_id AND template_id=p_template_id AND id=p_version_id FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 d:=v.definition||jsonb_build_object('code',p_code,'name',p_name);
 result:=private.template_save(p_office_id,NULL,d,0,'Duplicação de modelo',p_idempotency_key);
 newid:=(result->>'id')::uuid;
 INSERT INTO private.model_metadata(office_id,template_id,revision,display_name,origin_template_id,origin_version_id) VALUES(p_office_id,newid,1,p_name,p_template_id,p_version_id) ON CONFLICT(office_id,template_id) DO NOTHING;
 RETURN result;
END $$;
CREATE FUNCTION public.model_duplicate(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_code text,p_name text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_duplicate(p_office_id,p_template_id,p_version_id,p_code,p_name,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.model_duplicate(uuid,uuid,uuid,text,text,uuid),public.model_duplicate(uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_duplicate(uuid,uuid,uuid,text,text,uuid),public.model_duplicate(uuid,uuid,uuid,text,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE TABLE private.model_duplicate_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,source_template_id uuid NOT NULL,source_version_id uuid NOT NULL,code text NOT NULL,name text NOT NULL,
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,source_template_id,source_version_id) REFERENCES public.template_versions(office_id,template_id,id)
);
CREATE INDEX model_duplicate_source_idx ON private.model_duplicate_commands(office_id,source_template_id,source_version_id);
ALTER TABLE private.model_duplicate_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.model_duplicate_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER model_duplicate_commands_immutable BEFORE UPDATE OR DELETE ON private.model_duplicate_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE OR REPLACE FUNCTION private.model_duplicate(p_office_id uuid,p_template_id uuid,p_version_id uuid,p_code text,p_name text,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;v public.template_versions;d jsonb;result jsonb;newid uuid;cmd private.model_duplicate_commands;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_template_id IS NULL OR p_version_id IS NULL OR p_idempotency_key IS NULL OR p_code IS NULL OR p_name IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO cmd FROM private.model_duplicate_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF cmd.source_template_id<>p_template_id OR cmd.source_version_id<>p_version_id OR cmd.code<>p_code OR cmd.name<>p_name THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSIF EXISTS(SELECT FROM private.template_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT * INTO v FROM public.template_versions WHERE office_id=p_office_id AND template_id=p_template_id AND id=p_version_id FOR SHARE;
 IF v.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 d:=v.definition||jsonb_build_object('code',p_code,'name',p_name);
 result:=private.template_save(p_office_id,NULL,d,0,'Duplicação de modelo',p_idempotency_key);
 newid:=(result->>'id')::uuid;
 INSERT INTO private.model_metadata(office_id,template_id,revision,display_name,origin_template_id,origin_version_id) VALUES(p_office_id,newid,1,p_name,p_template_id,p_version_id) ON CONFLICT(office_id,template_id) DO NOTHING;
 INSERT INTO private.model_duplicate_commands VALUES(p_office_id,actor,p_idempotency_key,p_template_id,p_version_id,p_code,p_name) ON CONFLICT DO NOTHING;
 RETURN result;
END $$;
-- An offer points to the existing service catalog; no prices are seeded here.
CREATE TABLE private.document_offerings (
 office_id uuid NOT NULL,template_id uuid NOT NULL,service_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),
 instructions text NOT NULL CHECK(char_length(instructions)<=2000),execution_level integer NOT NULL CHECK(execution_level BETWEEN 1 AND 3),portal_enabled boolean NOT NULL,
 intake_keys jsonb NOT NULL,required_intake_keys jsonb NOT NULL,allow_self_approval boolean NOT NULL DEFAULT false,
 PRIMARY KEY(office_id,template_id), UNIQUE(office_id,service_id),
 FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id),FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id)
);
CREATE TABLE private.document_offering_commands (
 office_id uuid NOT NULL,template_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,value jsonb NOT NULL,expected_revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,template_id) REFERENCES public.templates(office_id,id)
);
CREATE INDEX document_offering_commands_template_idx ON private.document_offering_commands(office_id,template_id);
ALTER TABLE private.document_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.document_offering_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.document_offerings,private.document_offering_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_offering_commands_immutable BEFORE UPDATE OR DELETE ON private.document_offering_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.document_offer_manage(p_office_id uuid,p_template_id uuid,p_value jsonb,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;s public.services;v public.template_versions;current_sv public.service_versions;o private.document_offerings;c private.document_offering_commands;sid uuid;k jsonb;level_number numeric;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) OR NOT private.current_permissions(p_office_id) @> ARRAY['services.read','services.manage'] THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_template_id IS NULL OR p_idempotency_key IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 2147483645 OR jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR NOT p_value ?& ARRAY['service_id','instructions','execution_level','portal_enabled','intake_keys','required_intake_keys','allow_self_approval'] OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>7 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_typeof(p_value->'service_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_value->'instructions') IS DISTINCT FROM 'string' OR char_length(p_value->>'instructions')>2000 OR translate(p_value->>'instructions',E'\n\r\t','') ~ '[[:cntrl:]]' OR jsonb_typeof(p_value->'execution_level') IS DISTINCT FROM 'number' OR jsonb_typeof(p_value->'portal_enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_value->'allow_self_approval') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_value->'intake_keys') IS DISTINCT FROM 'array' OR jsonb_typeof(p_value->'required_intake_keys') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN sid:=(p_value->>'service_id')::uuid;level_number:=(p_value->>'execution_level')::numeric;EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END;
 IF level_number NOT IN(1,2,3) OR jsonb_array_length(p_value->'intake_keys')>80 OR jsonb_array_length(p_value->'required_intake_keys')>80 OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(p_value->'intake_keys')x)<>jsonb_array_length(p_value->'intake_keys') OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(p_value->'required_intake_keys')x)<>jsonb_array_length(p_value->'required_intake_keys') OR NOT (p_value->'intake_keys') @> (p_value->'required_intake_keys') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO c FROM private.document_offering_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND AND (c.template_id<>p_template_id OR c.value<>p_value OR c.expected_revision<>p_expected_revision) THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR UPDATE;
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=sid FOR SHARE;
 IF t.id IS NULL OR s.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF c.idempotency_key IS NULL THEN
 SELECT * INTO o FROM private.document_offerings WHERE office_id=p_office_id AND template_id=t.id FOR UPDATE;
 IF coalesce(o.revision,0)<>p_expected_revision THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT tv.* INTO v FROM public.template_versions tv WHERE tv.office_id=p_office_id AND tv.template_id=t.id AND tv.number=t.latest_version;
 IF (p_value->>'portal_enabled')::boolean THEN
 SELECT tv.* INTO v FROM public.template_versions tv JOIN private.template_approvals a ON a.office_id=tv.office_id AND a.template_id=tv.template_id AND a.version_id=tv.id WHERE tv.office_id=p_office_id AND tv.template_id=t.id AND a.approved_at<=clock_timestamp() AND ((tv.definition->>'effective_from') IS NULL OR (tv.definition->>'effective_from')::timestamptz<=clock_timestamp()) AND ((tv.definition->>'effective_until') IS NULL OR (tv.definition->>'effective_until')::timestamptz>clock_timestamp()) ORDER BY tv.number DESC LIMIT 1;
 SELECT * INTO current_sv FROM public.service_versions WHERE office_id=p_office_id AND service_id=s.id AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1;
 IF v.id IS NULL OR (v.definition->>'demonstration')::boolean OR EXISTS(SELECT FROM private.model_metadata WHERE office_id=p_office_id AND template_id=t.id AND archived_at IS NOT NULL) OR current_sv.id IS NULL OR (current_sv.definition->>'quantity_min')::integer>1 OR (current_sv.definition->>'quantity_max')::integer<1 OR (current_sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(current_sv.definition->'checklist')>0 OR jsonb_array_length(current_sv.definition->'fields')>0 THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 FOR k IN SELECT x FROM jsonb_array_elements(p_value->'intake_keys')x LOOP
 IF jsonb_typeof(k)<>'string' OR k#>>'{}' !~ '^documento\.[a-z][a-z0-9_]{0,63}$' OR NOT EXISTS(SELECT FROM jsonb_array_elements(v.definition->'variables')x WHERE x->>'key'=k#>>'{}') THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;END LOOP;
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) OR NOT private.current_permissions(p_office_id) @> ARRAY['services.read','services.manage'] THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.document_offerings(office_id,template_id,service_id,revision,instructions,execution_level,portal_enabled,intake_keys,required_intake_keys,allow_self_approval) VALUES(p_office_id,t.id,s.id,1,p_value->>'instructions',level_number::integer,(p_value->>'portal_enabled')::boolean,p_value->'intake_keys',p_value->'required_intake_keys',(p_value->>'allow_self_approval')::boolean)
 ON CONFLICT(office_id,template_id) DO UPDATE SET service_id=EXCLUDED.service_id,revision=private.document_offerings.revision+1,instructions=EXCLUDED.instructions,execution_level=EXCLUDED.execution_level,portal_enabled=EXCLUDED.portal_enabled,intake_keys=EXCLUDED.intake_keys,required_intake_keys=EXCLUDED.required_intake_keys,allow_self_approval=EXCLUDED.allow_self_approval RETURNING * INTO o;
 INSERT INTO private.document_offering_commands VALUES(p_office_id,t.id,actor,p_idempotency_key,p_value,p_expected_revision,clock_timestamp());
 ELSE SELECT * INTO o FROM private.document_offerings WHERE office_id=p_office_id AND template_id=t.id;END IF;
 RETURN to_jsonb(o)-'office_id';
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';
END $$;
CREATE FUNCTION public.document_offer_manage(p_office_id uuid,p_template_id uuid,p_value jsonb,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_offer_manage(p_office_id,p_template_id,p_value,p_expected_revision,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.document_offer_manage(uuid,uuid,jsonb,integer,uuid),public.document_offer_manage(uuid,uuid,jsonb,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_offer_manage(uuid,uuid,jsonb,integer,uuid),public.document_offer_manage(uuid,uuid,jsonb,integer,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE FUNCTION private.document_offer_projection(o private.document_offerings,at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE tv public.template_versions;sv public.service_versions;nm text;vars jsonb;folder uuid; BEGIN
 IF NOT o.portal_enabled OR EXISTS(SELECT FROM private.model_metadata WHERE office_id=o.office_id AND template_id=o.template_id AND archived_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT v.* INTO tv FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id
 WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND a.approved_at<=at_time AND ((v.definition->>'effective_from') IS NULL OR (v.definition->>'effective_from')::timestamptz<=at_time) AND ((v.definition->>'effective_until') IS NULL OR (v.definition->>'effective_until')::timestamptz>at_time) ORDER BY v.number DESC LIMIT 1;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o.office_id AND service_id=o.service_id AND effective_from<=at_time ORDER BY effective_from DESC LIMIT 1;
 IF tv.id IS NULL OR sv.id IS NULL OR (tv.definition->>'demonstration')::boolean OR (sv.definition->>'quantity_min')::integer>1 OR (sv.definition->>'quantity_max')::integer<1 OR (sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(sv.definition->'checklist')>0 OR jsonb_array_length(sv.definition->'fields')>0 OR EXISTS(SELECT FROM jsonb_array_elements_text(o.intake_keys) k WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(tv.definition->'variables') v WHERE v->>'key'=k)) THEN RETURN NULL;END IF;
 SELECT coalesce(m.display_name,tv.definition->>'name'),l.folder_id INTO nm,folder FROM (SELECT 1)x LEFT JOIN private.model_metadata m ON m.office_id=o.office_id AND m.template_id=o.template_id LEFT JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','type',v->>'type','required',o.required_intake_keys @> jsonb_build_array(v->>'key')) ORDER BY ord),'[]'::jsonb) INTO vars FROM jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,ord) WHERE o.intake_keys @> jsonb_build_array(v->>'key');
 RETURN jsonb_build_object('template_id',o.template_id,'template_version_id',tv.id,'service_version_id',sv.id,'offer_revision',o.revision,'name',nm,'folder_id',folder,'instructions',o.instructions,'price_cents',sv.price_cents,'variables',vars);
END $$;
CREATE FUNCTION private.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.memberships;at_time timestamptz;items jsonb;folders jsonb;total bigint;BEGIN
 member:=private.requests_actor(p_office_id);
 IF p_unfiled IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 at_time:=clock_timestamp();
 WITH available AS MATERIALIZED (SELECT private.document_offer_projection(o,at_time) item FROM private.document_offerings o WHERE o.office_id=p_office_id), filtered AS MATERIALIZED (SELECT item FROM available WHERE item IS NOT NULL AND (p_folder_id IS NULL OR item->>'folder_id'=p_folder_id::text) AND (NOT p_unfiled OR item->'folder_id'='null'::jsonb) AND (btrim(p_query)='' OR strpos(lower(item->>'name'),lower(btrim(p_query)))>0)),page AS (SELECT item FROM filtered ORDER BY lower(item->>'name'),item->>'template_id' LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(item ORDER BY lower(item->>'name'),item->>'template_id') FROM page),'[]'::jsonb) INTO total,items;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) ORDER BY f.name,f.id),'[]'::jsonb) INTO folders FROM private.model_folders f WHERE f.office_id=p_office_id AND EXISTS(SELECT FROM private.document_offerings o JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id WHERE o.office_id=f.office_id AND l.folder_id=f.id AND private.document_offer_projection(o,at_time) IS NOT NULL);
 PERFORM private.requests_actor(p_office_id);
 RETURN jsonb_build_object('items',items,'folders',folders,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.document_offer_form(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;BEGIN
 PERFORM private.requests_actor(p_office_id);
 SELECT private.document_offer_projection(o,clock_timestamp()) INTO item FROM private.document_offerings o WHERE o.office_id=p_office_id AND o.template_id=p_template_id;
 IF item IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.requests_actor(p_office_id);RETURN item;
END $$;
CREATE FUNCTION public.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_offers_page(p_office_id,p_folder_id,p_unfiled,p_query,p_page,p_size);$$;
CREATE FUNCTION public.document_offer_form(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_offer_form(p_office_id,p_template_id);$$;
REVOKE ALL ON FUNCTION private.document_offer_projection(private.document_offerings,timestamptz),private.document_offers_page(uuid,uuid,boolean,text,integer,integer),private.document_offer_form(uuid,uuid),public.document_offers_page(uuid,uuid,boolean,text,integer,integer),public.document_offer_form(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_offers_page(uuid,uuid,boolean,text,integer,integer),private.document_offer_form(uuid,uuid),public.document_offers_page(uuid,uuid,boolean,text,integer,integer),public.document_offer_form(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE TABLE private.document_presence (
 office_id uuid NOT NULL REFERENCES public.offices(id),membership_id uuid NOT NULL REFERENCES public.memberships(id),session_id uuid NOT NULL,status text NOT NULL CHECK(status IN('available','busy','away')),capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 10),last_seen timestamptz NOT NULL,
 PRIMARY KEY(office_id,membership_id)
);
CREATE INDEX document_presence_session_idx ON private.document_presence(session_id);
ALTER TABLE private.document_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.document_presence FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.document_presence_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_presence;online boolean;BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO p FROM private.document_presence WHERE office_id=p_office_id AND membership_id=m.id;
 online:=p.session_id IS NOT NULL AND p.last_seen>clock_timestamp()-interval '90 seconds' AND EXISTS(SELECT FROM auth.sessions s WHERE s.id=p.session_id AND s.user_id=m.user_id AND (s.not_after IS NULL OR s.not_after>clock_timestamp()));
 RETURN jsonb_build_object('status',CASE WHEN online THEN p.status ELSE 'offline' END,'capacity',coalesce(p.capacity,1),'last_seen',p.last_seen,'session_current',coalesce(p.session_id::text=auth.jwt()->>'session_id',false));
END $$;
CREATE FUNCTION private.document_presence_update(p_office_id uuid,p_status text,p_capacity integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;session_id uuid;BEGIN
 m:=private.requests_actor(p_office_id,true);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_status IS NULL OR p_status NOT IN('available','busy','away') OR p_capacity IS NULL OR p_capacity NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN session_id:=(auth.jwt()->>'session_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';END;
 IF session_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';END IF;
 m:=private.requests_actor(p_office_id,true);
 INSERT INTO private.document_presence(office_id,membership_id,session_id,status,capacity,last_seen) VALUES(p_office_id,m.id,session_id,p_status,p_capacity,clock_timestamp()) ON CONFLICT(office_id,membership_id) DO UPDATE SET session_id=EXCLUDED.session_id,status=EXCLUDED.status,capacity=EXCLUDED.capacity,last_seen=EXCLUDED.last_seen;
 RETURN private.document_presence_state(p_office_id);
END $$;
CREATE FUNCTION public.document_presence_state(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_presence_state(p_office_id);$$;
CREATE FUNCTION public.document_presence_update(p_office_id uuid,p_status text,p_capacity integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_presence_update(p_office_id,p_status,p_capacity);$$;
REVOKE ALL ON FUNCTION private.document_presence_state(uuid),private.document_presence_update(uuid,text,integer),public.document_presence_state(uuid),public.document_presence_update(uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_presence_state(uuid),private.document_presence_update(uuid,text,integer),public.document_presence_state(uuid),public.document_presence_update(uuid,text,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
-- Contracted data is append-only and never overwrites customer records.
-- Reuse request_items_office_request_id_key installed by11; no duplicate index.
CREATE TABLE private.document_intakes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,request_item_id uuid NOT NULL,template_id uuid NOT NULL,template_version_id uuid NOT NULL,service_id uuid NOT NULL,service_version_id uuid NOT NULL,
 offer_revision integer NOT NULL,model_name text NOT NULL,execution_level integer NOT NULL CHECK(execution_level BETWEEN 1 AND 3),answers jsonb NOT NULL,client_user_id uuid REFERENCES auth.users(id),allow_self_approval boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,request_id,request_item_id),FOREIGN KEY(office_id,request_id,request_item_id) REFERENCES public.request_items(office_id,request_id,id),FOREIGN KEY(office_id,template_id,template_version_id) REFERENCES public.template_versions(office_id,template_id,id),FOREIGN KEY(office_id,service_id,service_version_id) REFERENCES public.service_versions(office_id,service_id,id)
);
CREATE INDEX document_intakes_template_idx ON private.document_intakes(office_id,template_id,template_version_id);
CREATE INDEX document_intakes_service_idx ON private.document_intakes(office_id,service_id,service_version_id);
CREATE INDEX document_intakes_client_idx ON private.document_intakes(client_user_id);
ALTER TABLE private.document_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.document_intakes FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_intakes_immutable BEFORE UPDATE OR DELETE ON private.document_intakes FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.document_active_load(p_office_id uuid,p_member_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n integer;cash_n integer:=0;BEGIN
 SELECT count(*) INTO n FROM public.requests WHERE office_id=p_office_id AND assignee_id=p_member_id AND status IN('aberto','em_atendimento');
 IF to_regclass('private.document_cash_tasks') IS NOT NULL THEN
 EXECUTE 'SELECT count(DISTINCT t.request_id) FROM private.document_cash_tasks t JOIN private.document_publications p ON p.office_id=t.office_id AND p.id=t.publication_id JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id AND d.revision=p.revision JOIN public.requests r ON r.office_id=t.office_id AND r.id=t.request_id WHERE t.office_id=$1 AND t.claimed_by=$2 AND r.status NOT IN (''concluido'',''cancelado'') AND NOT EXISTS(SELECT FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id) a WHERE c.office_id=t.office_id AND c.request_id=t.request_id AND NOT a.cancelled AND a.balance_cents=0)' INTO cash_n USING p_office_id,p_member_id;
 END IF;RETURN n+cash_n;
END $$;
REVOKE ALL ON FUNCTION private.document_active_load(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.document_dispatch(p_office_id uuid) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;lvl integer;target uuid;task_count integer;assigned integer:=0;extra_condition text;BEGIN
 -- Every caller holds the office write lock through requests_actor or booking.
 FOR r IN SELECT rq.* FROM public.requests rq WHERE rq.office_id=p_office_id AND rq.status='aguardando_responsavel' AND rq.assignee_id IS NULL AND rq.origin IN('portal','whatsapp') AND EXISTS(SELECT FROM private.document_intakes i WHERE i.office_id=rq.office_id AND i.request_id=rq.id) ORDER BY rq.created_at,rq.id FOR UPDATE LOOP
 SELECT execution_level INTO lvl FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id ORDER BY created_at,id LIMIT 1;
 target:=NULL;
 -- The optional financial table is introduced by the following workflow migration.
 -- Its claimed tasks consume capacity as soon as that migration is available.
 FOR target IN SELECT m.id FROM public.memberships m JOIN private.document_presence p ON p.office_id=m.office_id AND p.membership_id=m.id JOIN auth.sessions s ON s.id=p.session_id AND s.user_id=m.user_id
 WHERE m.office_id=p_office_id AND m.active AND CASE m.role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'employee' THEN 3 ELSE 0 END=lvl
 AND p.status='available' AND p.last_seen>clock_timestamp()-interval '90 seconds' AND (s.not_after IS NULL OR s.not_after>clock_timestamp())
 AND private.team_user_active(m.user_id,p_office_id) AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read','services.read','services.perform','documents.read','documents.create','customers.read']
 ORDER BY private.document_active_load(p_office_id,m.id),
 (SELECT max(a.created_at) FROM private.request_assignments a WHERE a.office_id=p_office_id AND a.membership_id=m.id) NULLS FIRST,m.id LOOP
 PERFORM 1 FROM public.memberships WHERE office_id=p_office_id AND id=target AND active FOR SHARE;
 task_count:=private.document_active_load(p_office_id,target);
 IF task_count<(SELECT capacity FROM private.document_presence WHERE office_id=p_office_id AND membership_id=target) AND EXISTS(SELECT FROM public.memberships mm JOIN private.document_presence pp ON pp.office_id=mm.office_id AND pp.membership_id=mm.id JOIN auth.sessions ss ON ss.id=pp.session_id AND ss.user_id=mm.user_id WHERE mm.office_id=p_office_id AND mm.id=target AND mm.active AND CASE mm.role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'employee' THEN 3 ELSE 0 END=lvl AND pp.status='available' AND pp.last_seen>clock_timestamp()-interval '90 seconds' AND (ss.not_after IS NULL OR ss.not_after>clock_timestamp()) AND private.team_user_active(mm.user_id,p_office_id) AND private.team_permissions_for_member(mm.id) @> ARRAY['foundation.access','requests.read','services.read','services.perform','documents.read','documents.create','customers.read']) THEN EXIT;END IF;
 target:=NULL;
 END LOOP;
 IF target IS NOT NULL THEN
 UPDATE public.requests SET assignee_id=target,status='aberto',version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=r.id;
 INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id) VALUES(p_office_id,r.id,target,auth.uid());
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status,to_assignee) VALUES(p_office_id,r.id,'transfer',auth.uid(),'Distribuição automática','aguardando_responsavel','aberto',target);
 assigned:=assigned+1;
 END IF;
 END LOOP;
 RETURN assigned;
END $$;
REVOKE ALL ON FUNCTION private.document_dispatch(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.document_booking_create(p_office_id uuid,p_value jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;o private.document_offerings;tv public.template_versions;sv public.service_versions;s public.services;r public.requests;it public.request_items;v jsonb;ans jsonb;k text;result jsonb;digest text;projection jsonb;protocol_number bigint;assignee uuid;customer uuid;origin text;member public.memberships;caps text[];snap jsonb;at_time timestamptz;BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR NOT p_value ?& ARRAY['template_id','template_version_id','service_version_id','offer_revision','origin','answers','customer_id','assignee_id'] OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>8 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_typeof(p_value->'origin') IS DISTINCT FROM 'string' OR p_value->>'origin' NOT IN('portal','presencial','whatsapp') OR jsonb_typeof(p_value->'answers') IS DISTINCT FROM 'object' OR jsonb_typeof(p_value->'offer_revision') IS DISTINCT FROM 'number' OR p_value->>'offer_revision' !~ '^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 origin:=p_value->>'origin';IF (m.role_code='client' AND origin<>'portal') OR (m.role_code<>'client' AND origin='portal') THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 customer:=private.request_uuid(p_value->'customer_id',true);assignee:=private.request_uuid(p_value->'assignee_id',true);
 IF (m.role_code='client' AND (customer IS NOT NULL OR assignee IS NOT NULL)) OR (origin='presencial' AND assignee IS NULL) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('document_booking',p_value)::text,'sha256'),'hex');
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key;
 IF r.id IS NOT NULL THEN IF r.payload_digest<>digest THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN jsonb_build_object('request_id',r.id,'protocol',r.protocol,'status',private.request_public_status(r.status),'waiting',r.assignee_id IS NULL AND r.status='aguardando_responsavel');END IF;
 SELECT * INTO o FROM private.document_offerings WHERE office_id=p_office_id AND template_id=private.request_uuid(p_value->'template_id') FOR UPDATE;
 IF o.template_id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM 1 FROM public.templates WHERE office_id=p_office_id AND id=o.template_id FOR SHARE;
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=o.service_id FOR SHARE;
 IF customer IS NOT NULL THEN PERFORM private.request_customer(p_office_id,customer,m.user_id);END IF;
 IF assignee IS NOT NULL THEN
 SELECT * INTO member FROM public.memberships WHERE office_id=p_office_id AND id=assignee AND active AND role_code<>'client' FOR SHARE;
 PERFORM private.request_assignee(p_office_id,assignee);
 IF (CASE member.role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'employee' THEN 3 ELSE 4 END)>o.execution_level OR NOT private.team_permissions_for_member(member.id) @> ARRAY['foundation.access','requests.read','services.read','services.perform','documents.read','documents.create','customers.read'] THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF private.document_active_load(p_office_id,member.id)>=coalesce((SELECT p.capacity FROM private.document_presence p WHERE p.office_id=p_office_id AND p.membership_id=member.id),1) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 m:=private.requests_actor(p_office_id,true,'requests.create');at_time:=clock_timestamp();projection:=private.document_offer_projection(o,at_time);
 IF projection IS NULL OR o.revision<>(p_value->>'offer_revision')::integer OR projection->>'template_version_id'<>private.request_uuid(p_value->'template_version_id')::text OR projection->>'service_version_id'<>private.request_uuid(p_value->'service_version_id')::text THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO tv FROM public.template_versions WHERE office_id=p_office_id AND id=(projection->>'template_version_id')::uuid FOR SHARE;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=p_office_id AND id=(projection->>'service_version_id')::uuid FOR SHARE;
 IF (sv.definition->>'quantity_min')::integer>1 OR (sv.definition->>'quantity_max')::integer<1 OR (sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(sv.definition->'checklist')>0 OR jsonb_array_length(sv.definition->'fields')>0 THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 ans:=p_value->'answers';IF (SELECT count(*) FROM jsonb_object_keys(ans))>80 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR k IN SELECT jsonb_object_keys(ans) LOOP IF NOT o.intake_keys @> jsonb_build_array(k) OR jsonb_typeof(ans->k) IS DISTINCT FROM 'string' OR char_length(ans->>k)>2000 OR translate(ans->>k,E'\n\r\t','') ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;END LOOP;
 FOR k IN SELECT jsonb_array_elements_text(o.required_intake_keys) LOOP IF NOT(ans ? k) OR NOT private.templates_has_text20(ans->>k) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;END LOOP;
 v:=private.documents_resolve21(tv.definition,jsonb_build_object('content',tv.definition->>'content','overrides',ans,'money_in_words',false),'{}'::jsonb,'[]'::jsonb);
 IF EXISTS(SELECT FROM jsonb_array_elements(v->'issues') issue WHERE issue->>'code'='invalid_value' AND ans ? (issue->>'key')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 caps:=ARRAY(SELECT jsonb_array_elements_text(sv.definition->'required_capabilities'));
 snap:=private.services_snapshot(s,sv,1,'{"kind":"none","value":0,"reason":""}'::jsonb,caps);
 INSERT INTO private.request_counters(office_id,last_number) VALUES(p_office_id,1) ON CONFLICT(office_id) DO UPDATE SET last_number=private.request_counters.last_number+1 RETURNING last_number INTO protocol_number;
 INSERT INTO public.requests(office_id,protocol,title,origin,status,created_by,assignee_id,customer_id,priority,priority_reason,message,idempotency_key,payload_digest,triaged_at)
 VALUES(p_office_id,'AT-'||lpad(protocol_number::text,greatest(6,char_length(protocol_number::text)),'0'),btrim(projection->>'name'),origin,CASE WHEN assignee IS NULL THEN 'aguardando_responsavel' ELSE 'aberto' END,m.user_id,assignee,customer,'normal','','',p_idempotency_key,digest,CASE WHEN customer IS NULL THEN NULL ELSE clock_timestamp() END) RETURNING * INTO r;
 INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist) VALUES(p_office_id,r.id,s.id,sv.id,snap,'{}','[]','[]') RETURNING * INTO it;
 INSERT INTO private.document_intakes(office_id,request_id,request_item_id,template_id,template_version_id,service_id,service_version_id,offer_revision,model_name,execution_level,answers,client_user_id,allow_self_approval) VALUES(p_office_id,r.id,it.id,tv.template_id,tv.id,s.id,sv.id,o.revision,projection->>'name',o.execution_level,ans,CASE WHEN m.role_code='client' THEN m.user_id ELSE NULL END,o.allow_self_approval);
 IF assignee IS NOT NULL THEN INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id) VALUES(p_office_id,r.id,assignee,m.user_id);END IF;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,to_status,to_assignee) VALUES(p_office_id,r.id,'created',m.user_id,r.status,assignee);
 PERFORM private.emit_business_event(p_office_id,'requests.created','request',r.id,p_idempotency_key,'{}');
 IF assignee IS NULL AND origin IN('portal','whatsapp') THEN PERFORM private.document_dispatch(p_office_id);END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=r.id;
 RETURN jsonb_build_object('request_id',r.id,'protocol',r.protocol,'status',private.request_public_status(r.status),'waiting',r.assignee_id IS NULL AND r.status='aguardando_responsavel');
END $$;
CREATE FUNCTION public.document_booking_create(p_office_id uuid,p_value jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_booking_create(p_office_id,p_value,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.document_booking_create(uuid,jsonb,uuid),public.document_booking_create(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_booking_create(uuid,jsonb,uuid),public.document_booking_create(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
-- A booked item is fixed to its contracted version. Archiving stops new
-- selections but does not prevent work on an already contracted item.
CREATE OR REPLACE FUNCTION private.model_guard_new_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM public.templates WHERE office_id=NEW.office_id AND id=NEW.template_id FOR SHARE;
 IF EXISTS(SELECT FROM private.document_intakes WHERE office_id=NEW.office_id AND request_id=NEW.request_id AND request_item_id=NEW.request_item_id AND template_version_id<>NEW.template_version_id) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF EXISTS(SELECT FROM private.model_metadata WHERE office_id=NEW.office_id AND template_id=NEW.template_id AND archived_at IS NOT NULL) AND NOT EXISTS(SELECT FROM private.document_intakes WHERE office_id=NEW.office_id AND request_id=NEW.request_id AND request_item_id=NEW.request_item_id AND template_version_id=NEW.template_version_id) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422'; END IF;
 RETURN NEW;
END $$;
-- Triage attaches the checked customer to a booked portal request without
-- creating a second item or changing the contracted snapshot.
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.request_mutate(uuid,uuid,integer,jsonb,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'OR EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id)THEN', 'OR (EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id) AND NOT EXISTS(SELECT FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id)) THEN');
 updated:=replace(updated,'PERFORM private.request_capture_items(p_office_id,r.id,customer,p_mutation->''items'',m,capability);r.customer_id:=customer;', 'IF EXISTS(SELECT FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id) THEN IF p_mutation->''items''<>''[]''::jsonb THEN RAISE EXCEPTION ''REQUEST_VALIDATION'' USING ERRCODE=''PT422'';END IF;PERFORM private.request_customer(p_office_id,customer,m.user_id); ELSE PERFORM private.request_capture_items(p_office_id,r.id,customer,p_mutation->''items'',m,capability);END IF;r.customer_id:=customer;');
 IF updated=body OR position('private.document_intakes' IN updated)=0 THEN RAISE EXCEPTION 'request triage migration target not found';END IF;EXECUTE updated;
END $migration$;
CREATE FUNCTION private.document_dispatch_after_request() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF pg_trigger_depth()=1 AND auth.uid() IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id) THEN PERFORM private.document_dispatch(NEW.office_id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER document_dispatch_after_request AFTER UPDATE OF status,assignee_id ON public.requests FOR EACH ROW EXECUTE FUNCTION private.document_dispatch_after_request();
REVOKE ALL ON FUNCTION private.document_dispatch_after_request() FROM PUBLIC,anon,authenticated,service_role;
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_presence_update(uuid,text,integer)'::regprocedure) INTO body;
 updated:=replace(body,'RETURN private.document_presence_state(p_office_id);','PERFORM private.document_dispatch(p_office_id);RETURN private.document_presence_state(p_office_id);');
 IF updated=body THEN RAISE EXCEPTION 'presence dispatch migration target not found';END IF;EXECUTE updated;
END $migration$;
CREATE TABLE private.document_intake_apply_commands (
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,document_id uuid NOT NULL,expected_revision integer NOT NULL,input jsonb NOT NULL,
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,document_id) REFERENCES public.documents(office_id,id)
);
CREATE INDEX document_intake_apply_commands_document_idx ON private.document_intake_apply_commands(office_id,document_id);
ALTER TABLE private.document_intake_apply_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.document_intake_apply_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER document_intake_apply_commands_immutable BEFORE UPDATE OR DELETE ON private.document_intake_apply_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.document_intake_view(p_office_id uuid,p_request_id uuid,p_request_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;i private.document_intakes;BEGIN
 m:=private.documents_access21(p_office_id,p_request_id,'documents.create');
 SELECT * INTO i FROM private.document_intakes WHERE office_id=p_office_id AND request_id=p_request_id AND request_item_id=p_request_item_id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,p_request_id,'documents.create');
 RETURN jsonb_build_object('request_id',i.request_id,'request_item_id',i.request_item_id,'template_version_id',i.template_version_id,'model_name',i.model_name,'answers',i.answers);
END $$;
CREATE FUNCTION private.document_intake_start(p_office_id uuid,p_request_id uuid,p_request_item_id uuid,p_participants jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.document_intakes;BEGIN
 PERFORM private.documents_access21(p_office_id,p_request_id,'documents.create');
 SELECT * INTO i FROM private.document_intakes WHERE office_id=p_office_id AND request_id=p_request_id AND request_item_id=p_request_item_id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.document_create(p_office_id,p_request_id,p_request_item_id,i.template_version_id,p_participants,p_idempotency_key);
END $$;
CREATE FUNCTION private.document_intake_apply(p_office_id uuid,p_document_id uuid,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;i private.document_intakes;r private.document_revisions;c private.document_intake_apply_commands;new_input jsonb;result jsonb;BEGIN
 IF p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 1 AND 2147483646 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id FOR UPDATE;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
 SELECT * INTO c FROM private.document_intake_apply_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF c.idempotency_key IS NOT NULL THEN
 IF c.document_id<>d.id OR c.expected_revision<>p_expected_revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;new_input:=c.input;
 ELSE
 IF EXISTS(SELECT FROM private.document_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key) OR d.revision<>p_expected_revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO i FROM private.document_intakes WHERE office_id=p_office_id AND request_id=d.request_id AND request_item_id=d.request_item_id AND template_version_id=d.template_version_id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO r FROM private.document_revisions WHERE office_id=p_office_id AND document_id=d.id AND revision=d.revision;
 new_input:=jsonb_set(r.input,'{overrides}',(r.input->'overrides')||i.answers);
 END IF;
 result:=private.document_operate(p_office_id,d.id,jsonb_build_object('kind','save','expected_revision',p_expected_revision,'idempotency_key',p_idempotency_key,'input',new_input));
 IF c.idempotency_key IS NULL THEN INSERT INTO private.document_intake_apply_commands VALUES(p_office_id,m.user_id,p_idempotency_key,d.id,p_expected_revision,new_input);END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.document_intake_view(p_office_id uuid,p_request_id uuid,p_request_item_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_intake_view(p_office_id,p_request_id,p_request_item_id);$$;
CREATE FUNCTION public.document_intake_start(p_office_id uuid,p_request_id uuid,p_request_item_id uuid,p_participants jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_intake_start(p_office_id,p_request_id,p_request_item_id,p_participants,p_idempotency_key);$$;
CREATE FUNCTION public.document_intake_apply(p_office_id uuid,p_document_id uuid,p_expected_revision integer,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_intake_apply(p_office_id,p_document_id,p_expected_revision,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.document_intake_view(uuid,uuid,uuid),private.document_intake_start(uuid,uuid,uuid,jsonb,uuid),private.document_intake_apply(uuid,uuid,integer,uuid),public.document_intake_view(uuid,uuid,uuid),public.document_intake_start(uuid,uuid,uuid,jsonb,uuid),public.document_intake_apply(uuid,uuid,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_intake_view(uuid,uuid,uuid),private.document_intake_start(uuid,uuid,uuid,jsonb,uuid),private.document_intake_apply(uuid,uuid,integer,uuid),public.document_intake_view(uuid,uuid,uuid),public.document_intake_start(uuid,uuid,uuid,jsonb,uuid),public.document_intake_apply(uuid,uuid,integer,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE FUNCTION private.document_assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE lvl integer;m public.memberships;capacity integer;BEGIN
 IF NEW.assignee_id IS NULL OR (NEW.assignee_id IS NOT DISTINCT FROM OLD.assignee_id AND NOT (NEW.status IN('aberto','em_atendimento') AND OLD.status NOT IN('aberto','em_atendimento'))) THEN RETURN NEW;END IF;
 SELECT execution_level INTO lvl FROM private.document_intakes WHERE office_id=NEW.office_id AND request_id=NEW.id ORDER BY created_at,id LIMIT 1;
 IF lvl IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO m FROM public.memberships WHERE office_id=NEW.office_id AND id=NEW.assignee_id AND active AND role_code<>'client' FOR SHARE;
 IF m.id IS NULL OR (CASE m.role_code WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'employee' THEN 3 ELSE 4 END)>lvl OR NOT private.team_user_active(m.user_id,NEW.office_id) OR NOT private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read','services.read','services.perform','documents.read','documents.create','customers.read'] THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT p.capacity INTO capacity FROM private.document_presence p WHERE p.office_id=NEW.office_id AND p.membership_id=m.id;
 IF private.document_active_load(NEW.office_id,m.id)>=coalesce(capacity,1) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_assignment_guard BEFORE UPDATE OF status,assignee_id ON public.requests FOR EACH ROW EXECUTE FUNCTION private.document_assignment_guard();
REVOKE ALL ON FUNCTION private.document_assignment_guard() FROM PUBLIC,anon,authenticated,service_role;
-- Show the current display title in the legacy document selector too.
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_options(uuid,text,uuid,text,integer)'::regprocedure) INTO body;
 updated:=replace(body,'v.definition->>''name'' name,v.definition->''demonstration''', 'coalesce((SELECT mm.display_name FROM private.model_metadata mm WHERE mm.office_id=v.office_id AND mm.template_id=v.template_id),v.definition->>''name'') name,v.definition->''demonstration''');
 updated:=replace(updated,'lower((v.definition->>''name'')||'' ''||(v.definition->>''code''))','lower(coalesce((SELECT mm.display_name FROM private.model_metadata mm WHERE mm.office_id=v.office_id AND mm.template_id=v.template_id),v.definition->>''name'')||'' ''||(v.definition->>''code''))');
 IF updated=body THEN RAISE EXCEPTION 'document selector title migration target not found';END IF;EXECUTE updated;
END $migration$;
-- Staff may book a configured offer without making it visible to the portal.
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_offer_projection(private.document_offerings,timestamptz)'::regprocedure) INTO body;
 updated:=replace(body,'FUNCTION private.document_offer_projection(', 'FUNCTION private.document_staff_offer_projection(');
 updated:=replace(updated,'IF NOT o.portal_enabled OR EXISTS(', 'IF EXISTS(');
 IF updated=body OR position('IF NOT o.portal_enabled OR EXISTS(' IN updated)>0 THEN RAISE EXCEPTION 'staff offer projection migration target not found';END IF;EXECUTE updated;
 REVOKE ALL ON FUNCTION private.document_staff_offer_projection(private.document_offerings,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
 SELECT pg_get_functiondef('private.document_booking_create(uuid,jsonb,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'projection:=private.document_offer_projection(o,at_time);','projection:=CASE WHEN m.role_code=''client'' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END;');
 IF updated=body THEN RAISE EXCEPTION 'booking projection migration target not found';END IF;EXECUTE updated;
END $migration$;
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_offers_page(uuid,uuid,boolean,text,integer,integer)'::regprocedure) INTO body;
 updated:=replace(body,'private.document_offer_projection(o,at_time)', 'CASE WHEN member.role_code=''client'' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END');
 IF updated=body THEN RAISE EXCEPTION 'staff offer page migration target not found';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.document_offer_form(uuid,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'DECLARE item jsonb;BEGIN', 'DECLARE item jsonb;member public.memberships;BEGIN');
 updated:=replace(updated,'PERFORM private.requests_actor(p_office_id);', 'member:=private.requests_actor(p_office_id);');
 updated:=replace(updated,'private.document_offer_projection(o,clock_timestamp())', 'CASE WHEN member.role_code=''client'' THEN private.document_offer_projection(o,clock_timestamp()) ELSE private.document_staff_offer_projection(o,clock_timestamp()) END');
 IF updated=body THEN RAISE EXCEPTION 'staff offer form migration target not found';END IF;EXECUTE updated;
END $migration$;
-- A contracted approved version remains usable for that exact item even if
-- its catalog validity later ends; new purchases still check current validity.
DO $migration$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_create(uuid,uuid,uuid,uuid,jsonb,uuid)'::regprocedure) INTO body;
 updated:=replace(body,$text$OR(t.definition->>'effective_from')::timestamptz>at_time OR(t.definition->>'effective_until')::timestamptz<=at_time THEN$text$, $text$OR ((t.definition->>'effective_from')::timestamptz>at_time OR(t.definition->>'effective_until')::timestamptz<=at_time) AND NOT EXISTS(SELECT FROM private.document_intakes ii WHERE ii.office_id=p_office_id AND ii.request_id=p_request_id AND ii.request_item_id=p_request_item_id AND ii.template_version_id=t.id) THEN$text$);
 updated:=replace(updated,$text$at_time:=clock_timestamp();IF(t.definition->>'effective_from')::timestamptz>at_time OR(t.definition->>'effective_until')::timestamptz<=at_time THEN$text$, $text$at_time:=clock_timestamp();IF ((t.definition->>'effective_from')::timestamptz>at_time OR(t.definition->>'effective_until')::timestamptz<=at_time) AND NOT EXISTS(SELECT FROM private.document_intakes ii WHERE ii.office_id=p_office_id AND ii.request_id=p_request_id AND ii.request_item_id=p_request_item_id AND ii.template_version_id=t.id) THEN$text$);
 IF updated=body THEN RAISE EXCEPTION 'contracted version migration target not found';END IF;EXECUTE updated;
END $migration$;
CREATE TRIGGER model_folder_commands_immutable BEFORE UPDATE OR DELETE ON private.model_folder_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.model_commercial_state(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;m private.model_metadata;o private.document_offerings;caps text[];is_manager boolean;name text;BEGIN
 actor:=private.templates_actor20(p_office_id);
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id;
 IF t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO m FROM private.model_metadata WHERE office_id=p_office_id AND template_id=t.id;
 SELECT coalesce(m.display_name,v.definition->>'name') INTO name FROM public.template_versions v WHERE v.office_id=p_office_id AND v.template_id=t.id AND v.number=t.latest_version;
 caps:=private.current_permissions(p_office_id);
 SELECT role_code IN('owner','admin') AND caps @> ARRAY['templates.manage','services.read','services.manage'] INTO is_manager FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF caps @> ARRAY['services.read'] THEN SELECT * INTO o FROM private.document_offerings WHERE office_id=p_office_id AND template_id=t.id;END IF;
 RETURN jsonb_build_object('metadata',jsonb_build_object('template_id',t.id,'display_name',name,'archived_at',m.archived_at,'revision',coalesce(m.revision,0)),'offer',CASE WHEN o.template_id IS NULL THEN NULL ELSE to_jsonb(o)-'office_id' END,'can_manage',coalesce(is_manager,false),'can_manage_metadata',EXISTS(SELECT FROM public.memberships x WHERE x.office_id=p_office_id AND x.user_id=actor AND x.active AND x.role_code IN('owner','admin')) AND caps @> ARRAY['templates.manage']);
END $$;
CREATE FUNCTION public.model_commercial_state(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.model_commercial_state(p_office_id,p_template_id);$$;
REVOKE ALL ON FUNCTION private.model_commercial_state(uuid,uuid),public.model_commercial_state(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.model_commercial_state(uuid,uuid),public.model_commercial_state(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
-- Deferred callbacks observe the completed financial transaction, including
-- its ledger links, rather than intermediate allocation/reversal writes.
CREATE FUNCTION private.document_dispatch_after_finance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF auth.uid() IS NOT NULL THEN
 PERFORM 1 FROM public.offices WHERE id=NEW.office_id FOR NO KEY UPDATE;
 PERFORM private.document_dispatch(NEW.office_id);
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER document_dispatch_charge_event AFTER INSERT ON private.charge_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.document_dispatch_after_finance();
CREATE CONSTRAINT TRIGGER document_dispatch_allocation AFTER INSERT ON private.payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.document_dispatch_after_finance();
CREATE CONSTRAINT TRIGGER document_dispatch_reversal AFTER INSERT ON private.payment_reversals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.document_dispatch_after_finance();
CREATE CONSTRAINT TRIGGER document_dispatch_ledger AFTER INSERT ON private.payment_ledger_links DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.document_dispatch_after_finance();
REVOKE ALL ON FUNCTION private.document_dispatch_after_finance() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.document_intake_is_booked(p_office_id uuid,p_request_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 m:=private.requests_actor(p_office_id);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.requests_actor(p_office_id);IF private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN EXISTS(SELECT FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id);
END $$;
CREATE FUNCTION public.document_intake_is_booked(p_office_id uuid,p_request_id uuid) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_intake_is_booked(p_office_id,p_request_id);$$;
REVOKE ALL ON FUNCTION private.document_intake_is_booked(uuid,uuid),public.document_intake_is_booked(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_intake_is_booked(uuid,uuid),public.document_intake_is_booked(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE FUNCTION private.document_dispatch_page(p_office_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;items jsonb;members jsonb;total bigint;BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['requests.read_all'] THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS MATERIALIZED(SELECT r.id,r.protocol,r.title,r.created_at FROM public.requests r WHERE r.office_id=p_office_id AND r.status='aguardando_responsavel' AND r.assignee_id IS NULL AND EXISTS(SELECT FROM private.document_intakes i WHERE i.office_id=r.office_id AND i.request_id=r.id)),page AS(SELECT * FROM candidates ORDER BY created_at,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY created_at,id) FROM page),'[]'::jsonb) INTO total,items;
 SELECT coalesce(jsonb_agg(x.item ORDER BY x.name,x.id),'[]'::jsonb) INTO members FROM (
 SELECT mm.id,coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe') name,jsonb_build_object('membership_id',mm.id,'name',coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe'),'role',mm.role_code,'status',CASE WHEN pp.last_seen>clock_timestamp()-interval '90 seconds' AND EXISTS(SELECT FROM auth.sessions ss WHERE ss.id=pp.session_id AND ss.user_id=mm.user_id AND (ss.not_after IS NULL OR ss.not_after>clock_timestamp())) AND private.team_user_active(mm.user_id,p_office_id) THEN pp.status ELSE 'offline' END,'capacity',coalesce(pp.capacity,1),'active_load',private.document_active_load(p_office_id,mm.id)) item
 FROM public.memberships mm LEFT JOIN public.profiles pr ON pr.id=mm.user_id LEFT JOIN private.document_presence pp ON pp.office_id=mm.office_id AND pp.membership_id=mm.id WHERE mm.office_id=p_office_id AND mm.active AND mm.role_code IN('owner','admin','employee') ORDER BY name,mm.id LIMIT 50)x;
 m:=private.requests_actor(p_office_id);IF m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['requests.read_all'] THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN jsonb_build_object('items',items,'members',members,'total',total,'page',p_page,'page_size',p_size,'members_limit',50,'members_total',(SELECT count(*) FROM public.memberships mm WHERE mm.office_id=p_office_id AND mm.active AND mm.role_code IN('owner','admin','employee')));
END $$;
CREATE FUNCTION public.document_dispatch_page(p_office_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_dispatch_page(p_office_id,p_page,p_size);$$;
REVOKE ALL ON FUNCTION private.document_dispatch_page(uuid,integer,integer),public.document_dispatch_page(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_dispatch_page(uuid,integer,integer),public.document_dispatch_page(uuid,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
