-- Service identity and folder category for the document catalog.
-- Folders keep their organization; the category is derived from the document
-- kinds stored in the folder, so it follows any move/rename without a second
-- editable field getting out of sync. Existing offers are untouched.
CREATE OR REPLACE FUNCTION private.model_folder_category(p_office_id uuid,p_folder_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE coalesce((
  SELECT v.definition->>'kind'
  FROM private.model_locations l
  JOIN public.templates t ON t.office_id=l.office_id AND t.id=l.template_id
  JOIN public.template_versions v ON v.office_id=t.office_id AND v.template_id=t.id AND v.number=t.latest_version
  WHERE l.office_id=p_office_id AND l.folder_id=p_folder_id
  GROUP BY v.definition->>'kind'
  ORDER BY count(*) DESC,v.definition->>'kind'
  LIMIT 1),'')
 WHEN 'contract' THEN 'Contratos'
 WHEN 'declaration' THEN 'Declarações'
 WHEN 'official_letter' THEN 'Ofícios'
 WHEN 'application' THEN 'Requerimentos'
 ELSE 'Documentos' END;
$$;
REVOKE ALL ON FUNCTION private.model_folder_category(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Folder state now reports the derived category; the command contract and
-- folder revisions are unchanged.
CREATE OR REPLACE FUNCTION private.model_folders_state(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; manageable boolean; BEGIN
 actor:=private.templates_actor20(p_office_id);
 SELECT role_code IN('owner','admin') AND private.current_permissions(p_office_id) @> ARRAY['templates.manage'] INTO manageable FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 RETURN jsonb_build_object('folders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'revision',revision,'category',private.model_folder_category(p_office_id,id)) ORDER BY name,id) FROM private.model_folders WHERE office_id=p_office_id),'[]'::jsonb),
 'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('template_id',template_id,'folder_id',folder_id,'revision',revision) ORDER BY template_id) FROM private.model_locations WHERE office_id=p_office_id),'[]'::jsonb),'can_manage',coalesce(manageable,false));
END $$;

-- The public catalog carries the service code/category and the client
-- checklist already configured for the service, plus folder identity.
CREATE OR REPLACE FUNCTION private.document_offer_projection(o private.document_offerings,at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE tv public.template_versions;sv public.service_versions;s public.services;t public.templates;nm text;vars jsonb;folder uuid;folder_name text;folder_category text; BEGIN
 IF NOT o.portal_enabled OR EXISTS(SELECT FROM private.model_metadata WHERE office_id=o.office_id AND template_id=o.template_id AND archived_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT v.* INTO tv FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id
 WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND a.approved_at<=at_time AND ((v.definition->>'effective_from') IS NULL OR (v.definition->>'effective_from')::timestamptz<=at_time) AND ((v.definition->>'effective_until') IS NULL OR (v.definition->>'effective_until')::timestamptz>at_time) ORDER BY v.number DESC LIMIT 1;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o.office_id AND service_id=o.service_id AND effective_from<=at_time ORDER BY effective_from DESC LIMIT 1;
 SELECT * INTO s FROM public.services WHERE office_id=o.office_id AND id=o.service_id;
 SELECT * INTO t FROM public.templates WHERE office_id=o.office_id AND id=o.template_id;
 IF tv.id IS NULL OR sv.id IS NULL OR s.id IS NULL OR t.id IS NULL OR (tv.definition->>'demonstration')::boolean OR (sv.definition->>'quantity_min')::integer>1 OR (sv.definition->>'quantity_max')::integer<1 OR (sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(sv.definition->'checklist')>0 OR jsonb_array_length(sv.definition->'fields')>0 OR EXISTS(SELECT FROM jsonb_array_elements_text(o.intake_keys) k WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(tv.definition->'variables') v WHERE v->>'key'=k)) THEN RETURN NULL;END IF;
 SELECT coalesce(m.display_name,tv.definition->>'name'),l.folder_id,f.name INTO nm,folder,folder_name FROM (SELECT 1)x LEFT JOIN private.model_metadata m ON m.office_id=o.office_id AND m.template_id=o.template_id LEFT JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id LEFT JOIN private.model_folders f ON f.office_id=o.office_id AND f.id=l.folder_id;
 IF folder IS NOT NULL THEN folder_category:=private.model_folder_category(o.office_id,folder);END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','type',v->>'type','required',o.required_intake_keys @> jsonb_build_array(v->>'key')) ORDER BY ord),'[]'::jsonb) INTO vars FROM jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,ord) WHERE o.intake_keys @> jsonb_build_array(v->>'key');
 RETURN jsonb_build_object('template_id',o.template_id,'template_version_id',tv.id,'service_version_id',sv.id,'offer_revision',o.revision,'name',nm,'template_code',t.code,'folder_id',folder,'folder_name',folder_name,'folder_category',folder_category,'instructions',o.instructions,'price_cents',sv.price_cents,'service_id',s.id,'service_code',s.code,'service_category',sv.definition->>'category','service_checklist',coalesce(sv.definition->'checklist','[]'::jsonb),'variables',vars);
END $$;

CREATE OR REPLACE FUNCTION private.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.memberships;at_time timestamptz;items jsonb;folders jsonb;total bigint;BEGIN
 member:=private.requests_actor(p_office_id);
 IF p_unfiled IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 at_time:=clock_timestamp();
 WITH available AS MATERIALIZED (SELECT private.document_offer_projection(o,at_time) item FROM private.document_offerings o WHERE o.office_id=p_office_id), filtered AS MATERIALIZED (SELECT item FROM available WHERE item IS NOT NULL AND (p_folder_id IS NULL OR item->>'folder_id'=p_folder_id::text) AND (NOT p_unfiled OR item->'folder_id'='null'::jsonb) AND (btrim(p_query)='' OR strpos(lower(item->>'name'),lower(btrim(p_query)))>0 OR strpos(lower(coalesce(item->>'template_code','')),lower(btrim(p_query)))>0)),page AS (SELECT item FROM filtered ORDER BY lower(item->>'name'),item->>'template_id' LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(item ORDER BY lower(item->>'name'),item->>'template_id') FROM page),'[]'::jsonb) INTO total,items;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'category',private.model_folder_category(f.office_id,f.id)) ORDER BY f.name,f.id),'[]'::jsonb) INTO folders FROM private.model_folders f WHERE f.office_id=p_office_id AND EXISTS(SELECT FROM private.document_offerings o JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id WHERE o.office_id=f.office_id AND l.folder_id=f.id AND private.document_offer_projection(o,at_time) IS NOT NULL);
 PERFORM private.requests_actor(p_office_id);
 RETURN jsonb_build_object('items',items,'folders',folders,'total',total,'page',p_page,'page_size',p_size);
END $$;

-- Read the document linked to one service (the offering is unique per
-- service). Used by the Serviços screen to show the contracted identity.
CREATE FUNCTION private.document_offer_for_service(p_office_id uuid,p_service_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;item jsonb;BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_service_id IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT private.document_offer_projection(o,clock_timestamp()) INTO item FROM private.document_offerings o WHERE o.office_id=p_office_id AND o.service_id=p_service_id;
 RETURN item;
END $$;

-- Link an existing approved model to a document service using the offer
-- defaults. Eligibility, idempotency, locks and uniqueness stay in
-- document_offer_manage; this only assembles the official defaults.
CREATE FUNCTION private.document_offer_attach(p_office_id uuid,p_service_id uuid,p_template_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;t public.templates;s public.services;item jsonb;BEGIN
 actor:=private.templates_actor20(p_office_id,'templates.manage');
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active AND role_code IN('owner','admin')) OR NOT private.current_permissions(p_office_id) @> ARRAY['services.read','services.manage'] THEN RAISE EXCEPTION 'TEMPLATES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_service_id IS NULL OR p_template_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR SHARE;
 SELECT * INTO t FROM public.templates WHERE office_id=p_office_id AND id=p_template_id FOR SHARE;
 IF s.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.document_offer_manage(p_office_id,p_template_id,jsonb_build_object('service_id',p_service_id,'instructions','','execution_level',1,'portal_enabled',true,'intake_keys','[]'::jsonb,'required_intake_keys','[]'::jsonb,'allow_self_approval',false),0,p_idempotency_key);
 SELECT private.document_offer_projection(o,clock_timestamp()) INTO item FROM private.document_offerings o WHERE o.office_id=p_office_id AND o.template_id=p_template_id;
 IF item IS NULL THEN RAISE EXCEPTION 'TEMPLATE_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN item;
END $$;

CREATE FUNCTION public.document_offer_for_service(p_office_id uuid,p_service_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_offer_for_service(p_office_id,p_service_id);$$;
CREATE FUNCTION public.document_offer_attach(p_office_id uuid,p_service_id uuid,p_template_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_offer_attach(p_office_id,p_service_id,p_template_id,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.document_offer_for_service(uuid,uuid),private.document_offer_attach(uuid,uuid,uuid,uuid),public.document_offer_for_service(uuid,uuid),public.document_offer_attach(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_offer_for_service(uuid,uuid),private.document_offer_attach(uuid,uuid,uuid,uuid),public.document_offer_for_service(uuid,uuid),public.document_offer_attach(uuid,uuid,uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
