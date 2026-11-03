-- Repair imported model DTO provenance, version lifecycle, and service removal.
CREATE OR REPLACE FUNCTION private.template_version20(v public.template_versions) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT v.definition||jsonb_build_object('id',v.id,'number',v.number,'created_by',v.created_by,
 'source_import_id',v.source_import_id,'created_by_name',v.created_by_name,'created_at',v.created_at,
 'reason',v.reason,'approved_by',a.approved_by,'approved_by_name',a.approved_by_name,
 'approved_at',a.approved_at,'approval_reason',a.reason,'edited_at',v.edited_at)
 FROM(SELECT 1)x LEFT JOIN private.template_approvals a
 ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id;
$$;

-- Keep deleted version numbers reserved forever; editing a historical approved
-- version must not require creating a new version.
DO $m$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.template_save(uuid,uuid,jsonb,integer,text,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'SET latest_version=latest_version+1','SET latest_version=(SELECT max(number)+1 FROM public.template_versions WHERE template_id=t.id AND office_id=p_office_id)');
 IF updated=body THEN RAISE EXCEPTION 'template_save repair target absent';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.model_version_command(uuid,uuid,jsonb,integer,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'IF v.number<>t.latest_version THEN RAISE EXCEPTION ''TEMPLATE_CONFLICT'' USING ERRCODE=''PT409'';END IF;','');
 updated:=replace(updated,'SELECT * INTO v FROM public.template_versions','actor:=private.templates_actor20(p_office_id,''templates.manage''); SELECT * INTO v FROM public.template_versions');
 IF updated=body THEN RAISE EXCEPTION 'model_version repair target absent';END IF;EXECUTE updated;
END $m$;

ALTER TABLE public.services ADD COLUMN archived_at timestamptz;
CREATE TABLE private.service_archive_commands(
 office_id uuid NOT NULL, service_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES auth.users(id),
 idempotency_key uuid NOT NULL, expected_version integer NOT NULL,
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500 AND reason !~ '[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key),
 FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX service_archive_commands_service_idx ON private.service_archive_commands(office_id,service_id);
CREATE INDEX service_archive_commands_actor_idx ON private.service_archive_commands(actor_id);
ALTER TABLE private.service_archive_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_archive_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_archive_commands_immutable BEFORE UPDATE OR DELETE ON private.service_archive_commands
 FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();

CREATE FUNCTION private.service_archive(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;s public.services;prior private.service_archive_commands;BEGIN
 actor:=private.services_actor(p_office_id,true);
 IF p_service_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645
 OR p_idempotency_key IS NULL OR p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 1 AND 500
 OR NOT private.templates_has_text20(p_reason) OR p_reason ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'SERVICES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR UPDATE;
 actor:=private.services_actor(p_office_id,true);
 IF s.id IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO prior FROM private.service_archive_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF prior.service_id IS NOT NULL THEN
  IF prior.service_id<>p_service_id OR prior.expected_version<>p_expected_version OR prior.reason<>btrim(p_reason)
  THEN RAISE EXCEPTION 'SERVICE_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE
  IF s.archived_at IS NOT NULL OR s.latest_version<>p_expected_version THEN RAISE EXCEPTION 'SERVICE_CONFLICT' USING ERRCODE='PT409';END IF;
  UPDATE public.services SET archived_at=clock_timestamp() WHERE office_id=p_office_id AND id=p_service_id RETURNING * INTO s;
  INSERT INTO private.service_archive_commands(office_id,service_id,actor_id,idempotency_key,expected_version,reason)
  VALUES(p_office_id,p_service_id,actor,p_idempotency_key,p_expected_version,btrim(p_reason));
  PERFORM private.emit_business_event(p_office_id,'services.archived','service',s.id,p_idempotency_key,'{}');
 END IF;
 RETURN jsonb_build_object('id',s.id,'archived_at',s.archived_at);
END $$;
CREATE FUNCTION public.service_archive(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_reason text,p_idempotency_key uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.service_archive(p_office_id,p_service_id,p_expected_version,p_reason,p_idempotency_key);
$$;
REVOKE ALL ON FUNCTION private.service_archive(uuid,uuid,integer,text,uuid),public.service_archive(uuid,uuid,integer,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.service_archive(uuid,uuid,integer,text,uuid),public.service_archive(uuid,uuid,integer,text,uuid) TO authenticated;

-- Same authorization/calculation functions; add a lifecycle gate at their
-- common entrypoint so direct RPCs cannot contract an excluded service.
DO $m$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.services_snapshot(public.services,public.service_versions,integer,jsonb,text[])'::regprocedure) INTO body;
 updated:=replace(body,'BEGIN','BEGIN IF s.archived_at IS NOT NULL THEN RAISE EXCEPTION ''SERVICE_NOT_FOUND'' USING ERRCODE=''PT404'';END IF;');
 EXECUTE updated;
 SELECT pg_get_functiondef('private.service_publish(uuid,uuid,jsonb,integer,text,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'IF s.id IS NULL THEN','IF s.id IS NULL OR s.archived_at IS NOT NULL THEN');
 IF updated=body THEN RAISE EXCEPTION 'service_publish repair target absent';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.services_page(uuid,text,integer,integer)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE s.office_id=p_office_id AND','WHERE s.office_id=p_office_id AND s.archived_at IS NULL AND');
 IF updated=body THEN RAISE EXCEPTION 'services_page repair target absent';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.request_options(uuid,text,text,integer,integer)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE s.office_id=p_office_id AND','WHERE s.office_id=p_office_id AND s.archived_at IS NULL AND');
 IF updated=body THEN RAISE EXCEPTION 'request_options repair target absent';END IF;EXECUTE updated;
 SELECT pg_get_functiondef('private.quick_context(uuid,uuid,text,integer,integer,integer)'::regprocedure) INTO body;
 updated:=replace(body,'WHERE svc.office_id=p_office_id AND','WHERE svc.office_id=p_office_id AND svc.archived_at IS NULL AND');
 IF updated=body THEN RAISE EXCEPTION 'quick_services repair target absent';END IF;EXECUTE updated;
END $m$;

-- Both catalog projections exclude deleted template versions and services.
CREATE OR REPLACE FUNCTION private.document_offer_projection(o private.document_offerings,at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE tv public.template_versions;sv public.service_versions;s public.services;t public.templates;nm text;vars jsonb;folder uuid;folder_name text;folder_category text; BEGIN
 IF NOT o.portal_enabled OR EXISTS(SELECT FROM private.model_metadata WHERE office_id=o.office_id AND template_id=o.template_id AND archived_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT v.* INTO tv FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id
 WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND v.archived_at IS NULL AND a.approved_at<=at_time AND ((v.definition->>'effective_from') IS NULL OR (v.definition->>'effective_from')::timestamptz<=at_time) AND ((v.definition->>'effective_until') IS NULL OR (v.definition->>'effective_until')::timestamptz>at_time) ORDER BY v.number DESC LIMIT 1;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o.office_id AND service_id=o.service_id AND effective_from<=at_time ORDER BY effective_from DESC LIMIT 1;
 SELECT * INTO s FROM public.services WHERE office_id=o.office_id AND id=o.service_id;
 SELECT * INTO t FROM public.templates WHERE office_id=o.office_id AND id=o.template_id;
 IF tv.id IS NULL OR sv.id IS NULL OR s.id IS NULL OR s.archived_at IS NOT NULL OR t.id IS NULL OR (tv.definition->>'demonstration')::boolean OR (sv.definition->>'quantity_min')::integer>1 OR (sv.definition->>'quantity_max')::integer<1 OR (sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(sv.definition->'checklist')>0 OR jsonb_array_length(sv.definition->'fields')>0 OR EXISTS(SELECT FROM jsonb_array_elements_text(o.intake_keys) k WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(tv.definition->'variables') v WHERE v->>'key'=k)) THEN RETURN NULL;END IF;
 SELECT coalesce(m.display_name,tv.definition->>'name'),l.folder_id,f.name INTO nm,folder,folder_name FROM (SELECT 1)x LEFT JOIN private.model_metadata m ON m.office_id=o.office_id AND m.template_id=o.template_id LEFT JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id LEFT JOIN private.model_folders f ON f.office_id=o.office_id AND f.id=l.folder_id;
 IF folder IS NOT NULL THEN folder_category:=private.model_folder_category(o.office_id,folder);END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','type',v->>'type','required',o.required_intake_keys @> jsonb_build_array(v->>'key')) ORDER BY ord),'[]'::jsonb) INTO vars FROM jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,ord) WHERE o.intake_keys @> jsonb_build_array(v->>'key');
 RETURN jsonb_build_object('template_id',o.template_id,'template_version_id',tv.id,'service_version_id',sv.id,'offer_revision',o.revision,'name',nm,'template_code',t.code,'folder_id',folder,'folder_name',folder_name,'folder_category',folder_category,'instructions',o.instructions,'price_cents',sv.price_cents,'service_id',s.id,'service_code',s.code,'service_category',private.service_category_name(o.office_id,sv.id),'category_id',private.service_category_id(o.office_id,sv.id),'service_checklist',coalesce(private.checklist_client_labels(o.office_id,o.service_id),'[]'::jsonb),'variables',vars);
END $$;

CREATE OR REPLACE FUNCTION private.document_staff_offer_projection(o private.document_offerings,at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE tv public.template_versions;sv public.service_versions;s public.services;t public.templates;nm text;vars jsonb;folder uuid;folder_name text;folder_category text; BEGIN
 IF EXISTS(SELECT FROM private.model_metadata WHERE office_id=o.office_id AND template_id=o.template_id AND archived_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT v.* INTO tv FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id
 WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND v.archived_at IS NULL AND a.approved_at<=at_time AND ((v.definition->>'effective_from') IS NULL OR (v.definition->>'effective_from')::timestamptz<=at_time) AND ((v.definition->>'effective_until') IS NULL OR (v.definition->>'effective_until')::timestamptz>at_time) ORDER BY v.number DESC LIMIT 1;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o.office_id AND service_id=o.service_id AND effective_from<=at_time ORDER BY effective_from DESC LIMIT 1;
 SELECT * INTO s FROM public.services WHERE office_id=o.office_id AND id=o.service_id;
 SELECT * INTO t FROM public.templates WHERE office_id=o.office_id AND id=o.template_id;
 IF tv.id IS NULL OR sv.id IS NULL OR s.id IS NULL OR s.archived_at IS NOT NULL OR t.id IS NULL OR (tv.definition->>'demonstration')::boolean OR (sv.definition->>'quantity_min')::integer>1 OR (sv.definition->>'quantity_max')::integer<1 OR (sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(sv.definition->'checklist')>0 OR jsonb_array_length(sv.definition->'fields')>0 OR EXISTS(SELECT FROM jsonb_array_elements_text(o.intake_keys) k WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(tv.definition->'variables') v WHERE v->>'key'=k)) THEN RETURN NULL;END IF;
 SELECT coalesce(m.display_name,tv.definition->>'name'),l.folder_id,f.name INTO nm,folder,folder_name FROM (SELECT 1)x LEFT JOIN private.model_metadata m ON m.office_id=o.office_id AND m.template_id=o.template_id LEFT JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id LEFT JOIN private.model_folders f ON f.office_id=o.office_id AND f.id=l.folder_id;
 IF folder IS NOT NULL THEN folder_category:=private.model_folder_category(o.office_id,folder);END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','type',v->>'type','required',o.required_intake_keys @> jsonb_build_array(v->>'key')) ORDER BY ord),'[]'::jsonb) INTO vars FROM jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,ord) WHERE o.intake_keys @> jsonb_build_array(v->>'key');
 RETURN jsonb_build_object('template_id',o.template_id,'template_version_id',tv.id,'service_version_id',sv.id,'offer_revision',o.revision,'name',nm,'template_code',t.code,'folder_id',folder,'folder_name',folder_name,'folder_category',folder_category,'instructions',o.instructions,'price_cents',sv.price_cents,'service_id',s.id,'service_code',s.code,'service_category',private.service_category_name(o.office_id,sv.id),'category_id',private.service_category_id(o.office_id,sv.id),'service_checklist',coalesce(private.checklist_client_labels(o.office_id,o.service_id),'[]'::jsonb),'variables',vars);
END $$;
NOTIFY pgrst,'reload schema';

NOTIFY pgrst,'reload schema';

-- Documentos is the document-request entrypoint, regardless of the linked
-- service's business category (e.g. Rural or Contratos). Preserve that category
-- and all historical snapshots while including its approved offers here.
DO $m$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text)'::regprocedure) INTO body;
 updated:=replace(body,'at_time:=clock_timestamp();','IF EXISTS(SELECT FROM private.service_categories WHERE office_id=p_office_id AND id=chosen AND system_key=''documents'') THEN chosen:=NULL;END IF; at_time:=clock_timestamp();');
 updated:=replace(updated,'coalesce(k.n,0) count','CASE WHEN c.system_key=''documents'' THEN (SELECT count(*) FROM available WHERE item IS NOT NULL) ELSE coalesce(k.n,0) END count');
 IF updated=body THEN RAISE EXCEPTION 'document category repair target absent';END IF;EXECUTE updated;
END $m$;
NOTIFY pgrst,'reload schema';

-- Locate versions by their visible rank, not by gaps in reserved version numbers.
CREATE FUNCTION private.template_detail_version(p_office_id uuid,p_template_id uuid,p_number integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE page_number integer;drafts boolean;BEGIN
 PERFORM private.templates_actor20(p_office_id);
 IF p_number IS NULL OR p_number NOT BETWEEN 1 AND 2147483646 THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 drafts:=private.model_can_read_drafts(p_office_id);
 IF NOT EXISTS(SELECT FROM public.template_versions v WHERE v.office_id=p_office_id AND v.template_id=p_template_id AND v.number=p_number AND v.archived_at IS NULL AND(drafts OR EXISTS(SELECT FROM private.template_approvals a WHERE a.version_id=v.id AND a.office_id=v.office_id))) THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT (count(*)/5)::integer+1 INTO page_number FROM public.template_versions v
 WHERE v.office_id=p_office_id AND v.template_id=p_template_id AND v.number>p_number AND v.archived_at IS NULL
 AND(drafts OR EXISTS(SELECT FROM private.template_approvals a WHERE a.version_id=v.id AND a.office_id=v.office_id));
 RETURN private.template_detail(p_office_id,p_template_id,page_number);
END $$;
CREATE FUNCTION public.template_detail_version(p_office_id uuid,p_template_id uuid,p_number integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.template_detail_version(p_office_id,p_template_id,p_number); $$;
REVOKE ALL ON FUNCTION private.template_detail_version(uuid,uuid,integer),public.template_detail_version(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.template_detail_version(uuid,uuid,integer),public.template_detail_version(uuid,uuid,integer) TO authenticated;

-- Optimistic concurrency for edits within a version. Legacy clients without a
-- stamp can only alter a version which has never been edited. Exact replay is
-- still resolved from the immutable command before this check.
DO $m$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.model_version_command(uuid,uuid,jsonb,integer,uuid)'::regprocedure) INTO body;
 updated:=replace(body,'jsonb_object_keys(p_command)','jsonb_object_keys(p_command-''expected_edited_at'')');
 updated:=replace(updated,'IF v.id IS NULL THEN RAISE EXCEPTION ''TEMPLATE_NOT_FOUND'' USING ERRCODE=''PT404'';END IF;',
 'IF v.id IS NULL THEN RAISE EXCEPTION ''TEMPLATE_NOT_FOUND'' USING ERRCODE=''PT404'';END IF;
 IF p_command ? ''expected_edited_at'' AND jsonb_typeof(p_command->''expected_edited_at'') NOT IN(''string'',''null'') THEN RAISE EXCEPTION ''TEMPLATES_VALIDATION'' USING ERRCODE=''PT422'';END IF;
 BEGIN
 IF (p_command->>''expected_edited_at'')::timestamptz IS DISTINCT FROM v.edited_at THEN RAISE EXCEPTION ''TEMPLATE_CONFLICT'' USING ERRCODE=''PT409'';END IF;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION ''TEMPLATES_VALIDATION'' USING ERRCODE=''PT422'';END;');
 updated:=replace(updated,'edited_at=clock_timestamp()','edited_at=greatest(clock_timestamp(),v.edited_at+interval ''1 microsecond'')');
 updated:=replace(updated,'RETURN private.template_detail20(t,1);','IF op=''edit'' THEN RETURN private.template_detail_version(p_office_id,t.id,(SELECT number FROM public.template_versions WHERE office_id=p_office_id AND id=(p_command->>''version_id'')::uuid));END IF; RETURN private.template_detail20(t,1);');
 IF updated=body THEN RAISE EXCEPTION 'version concurrency repair target absent';END IF;EXECUTE updated;
END $m$;
NOTIFY pgrst,'reload schema';
