-- Link each new general portal request to the configured category, without
-- accepting a browser protocol, price, customer identity or internal role.
CREATE TABLE private.request_categories(
 office_id uuid NOT NULL,request_id uuid NOT NULL,category_id uuid NOT NULL,category_name text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,request_id),UNIQUE(office_id,actor_id,idempotency_key),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,category_id) REFERENCES private.service_categories(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX request_categories_category_idx ON private.request_categories(office_id,category_id);
CREATE INDEX request_categories_actor_idx ON private.request_categories(actor_id);
ALTER TABLE private.request_categories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_categories FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER request_categories_immutable BEFORE UPDATE OR DELETE ON private.request_categories FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.request_category_snapshot(r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_build_object('category_id',c.category_id,'category_name',c.category_name) FROM private.request_categories c WHERE c.office_id=r.office_id AND c.request_id=r.id),
 (SELECT jsonb_build_object('category_id',private.service_category_id(i.office_id,i.version_id),'category_name',i.snapshot#>>'{definition,category}') FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id ORDER BY i.id LIMIT 1),'{}'::jsonb);
$$;
ALTER FUNCTION private.request_summary(public.requests,boolean) RENAME TO request_summary_before_categories;
CREATE FUNCTION private.request_summary(r public.requests,p_portal boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_summary_before_categories(r,p_portal)||private.request_category_snapshot(r);$$;
ALTER FUNCTION private.request_detail_record(public.requests,public.memberships,integer) RENAME TO request_detail_record_before_categories;
CREATE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_detail_record_before_categories(r,m,p_page)||private.request_category_snapshot(r);$$;
CREATE FUNCTION private.categorized_request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;cat private.service_categories;prior private.request_categories;digest text;result jsonb;rid uuid;
BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.request_shape(p_request,ARRAY['origin','title','message','category_id']);
 IF p_idempotency_key IS NULL OR p_request->>'origin' IS DISTINCT FROM 'portal' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(p_request::text,'sha256'),'hex');
 SELECT * INTO prior FROM private.request_categories WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF prior.request_id IS NOT NULL THEN
 IF prior.payload_sha256<>digest THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN private.request_detail(p_office_id,prior.request_id,1);
 END IF;
 IF EXISTS(SELECT FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key) THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO cat FROM private.service_categories WHERE office_id=p_office_id AND id=private.request_uuid(p_request->'category_id') FOR SHARE;
 IF cat.id IS NULL OR cat.system_key='documents' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 m:=private.requests_actor(p_office_id,true,'requests.create');
 result:=private.request_create(p_office_id,p_request-'category_id',p_idempotency_key,gen_random_uuid());rid:=(result->>'id')::uuid;
 INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256) VALUES(p_office_id,rid,cat.id,cat.name,m.user_id,p_idempotency_key,digest);
 RETURN private.request_detail(p_office_id,rid,1);
END$$;
CREATE FUNCTION public.categorized_request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.categorized_request_create(p_office_id,p_request,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION public.categorized_request_create(uuid,jsonb,uuid),private.categorized_request_create(uuid,jsonb,uuid),private.request_category_snapshot(public.requests),private.request_summary(public.requests,boolean),private.request_detail_record(public.requests,public.memberships,integer),private.request_summary_before_categories(public.requests,boolean),private.request_detail_record_before_categories(public.requests,public.memberships,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.categorized_request_create(uuid,jsonb,uuid),private.categorized_request_create(uuid,jsonb,uuid) TO authenticated;
-- Canonical category identity in both public and staff-safe catalog projections.
DO $m$DECLARE n text;s text;BEGIN
 FOREACH n IN ARRAY ARRAY['document_offer_projection','document_staff_offer_projection'] LOOP
 s:=pg_get_functiondef(('private.'||n||'(private.document_offerings,timestamp with time zone)')::regprocedure);
 s:=replace(s,'''service_category'',sv.definition->>''category''','''service_category'',private.service_category_name(o.office_id,sv.id),''category_id'',private.service_category_id(o.office_id,sv.id)');
 s:=replace(s,'''service_checklist'',coalesce(sv.definition->''checklist'',''[]''::jsonb)', '''service_checklist'',coalesce(private.checklist_client_labels(o.office_id,o.service_id),''[]''::jsonb)');
 IF strpos(s,'private.service_category_id')=0 OR strpos(s,'private.checklist_client_labels')=0 THEN RAISE EXCEPTION 'Catalog projection guard not installed';END IF;
 EXECUTE s;
 END LOOP;
END$m$;
CREATE OR REPLACE FUNCTION private.document_offer_form(p_office_id uuid,p_template_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;item jsonb;BEGIN
 m:=private.requests_actor(p_office_id);
 SELECT CASE WHEN m.role_code='client' THEN private.document_offer_projection(o,clock_timestamp()) ELSE private.document_staff_offer_projection(o,clock_timestamp()) END INTO item FROM private.document_offerings o WHERE o.office_id=p_office_id AND o.template_id=p_template_id;
 IF item IS NULL THEN RAISE EXCEPTION 'TEMPLATE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.requests_actor(p_office_id);RETURN item;
END$$;
CREATE OR REPLACE FUNCTION private.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer,p_category text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;at_time timestamptz;items jsonb;folders jsonb;categories jsonb;total bigint;chosen uuid;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF p_unfiled IS NULL OR(p_unfiled AND p_folder_id IS NOT NULL) OR p_query IS NULL OR char_length(p_query)>120 OR p_query~'[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_category IS NOT NULL THEN BEGIN chosen:=p_category::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END;IF NOT EXISTS(SELECT FROM private.service_categories WHERE office_id=p_office_id AND id=chosen) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 at_time:=clock_timestamp();
 -- Compute the authorized offer projection once per model, then reuse it for
 -- the page, folders and category counts; no repeated folder-by-model projection.
 WITH available AS MATERIALIZED(SELECT CASE WHEN m.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END item FROM private.document_offerings o WHERE o.office_id=p_office_id),
 filtered AS MATERIALIZED(SELECT item FROM available WHERE item IS NOT NULL AND(chosen IS NULL OR item->>'category_id'=chosen::text) AND(p_folder_id IS NULL OR item->>'folder_id'=p_folder_id::text) AND(NOT p_unfiled OR item->'folder_id'='null'::jsonb) AND(btrim(p_query)='' OR strpos(lower(item->>'name'),lower(btrim(p_query)))>0 OR strpos(lower(item->>'template_code'),lower(btrim(p_query)))>0)),
 page AS(SELECT item FROM filtered ORDER BY lower(item->>'name'),item->>'template_id' LIMIT p_size OFFSET(p_page-1)*p_size),
 folder_rows AS(SELECT f.id,f.name,private.model_folder_category(f.office_id,f.id) category FROM private.model_folders f WHERE f.office_id=p_office_id AND EXISTS(SELECT FROM available a WHERE a.item IS NOT NULL AND a.item->>'folder_id'=f.id::text AND(chosen IS NULL OR a.item->>'category_id'=chosen::text))),
 counts AS(SELECT item->>'category_id' id,count(*) n FROM available WHERE item IS NOT NULL GROUP BY 1),
 category_rows AS(SELECT c.id,c.name,coalesce(k.n,0) count,coalesce(c.system_key='documents',false) is_documents FROM private.service_categories c LEFT JOIN counts k ON k.id=c.id::text WHERE c.office_id=p_office_id)
 SELECT (SELECT count(*) FROM filtered),
 coalesce((SELECT jsonb_agg(item ORDER BY lower(item->>'name'),item->>'template_id') FROM page),'[]'),
 coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.name,f.id) FROM folder_rows f),'[]'),
 coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name,c.id) FROM category_rows c),'[]')
 INTO total,items,folders,categories;
 PERFORM private.requests_actor(p_office_id);
 RETURN jsonb_build_object('items',items,'folders',folders,'categories',categories,'total',total,'page',p_page,'page_size',p_size);
END$$;
-- Legacy six-argument callers retain the same safe, canonical catalog.
CREATE OR REPLACE FUNCTION private.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT private.document_offers_page(p_office_id,p_folder_id,p_unfiled,p_query,p_page,p_size,NULL);$$;
NOTIFY pgrst,'reload schema';
