-- O catálogo mostra todas as categorias configuradas, inclusive as que ainda
-- não têm documento publicado, para orientar a escolha e a configuração.
CREATE OR REPLACE FUNCTION private.document_offers_page(p_office_id uuid,p_folder_id uuid,p_unfiled boolean,p_query text,p_page integer,p_size integer,p_category text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.memberships;at_time timestamptz;items jsonb;folders jsonb;categories jsonb;total bigint;BEGIN
 member:=private.requests_actor(p_office_id);
 IF p_unfiled IS NULL OR (p_unfiled AND p_folder_id IS NOT NULL) OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR (p_category IS NOT NULL AND (char_length(btrim(p_category)) NOT BETWEEN 1 AND 60 OR p_category ~ '[[:cntrl:]]')) THEN RAISE EXCEPTION 'TEMPLATES_VALIDATION' USING ERRCODE='PT422';END IF;
 at_time:=clock_timestamp();
 WITH available AS MATERIALIZED (SELECT CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END item FROM private.document_offerings o WHERE o.office_id=p_office_id),
 picked AS MATERIALIZED (SELECT item FROM available WHERE item IS NOT NULL AND (p_folder_id IS NULL OR item->>'folder_id'=p_folder_id::text) AND (NOT p_unfiled OR item->'folder_id'='null'::jsonb) AND (p_category IS NULL OR btrim(p_category)='' OR item->>'service_category'=btrim(p_category)) AND (btrim(p_query)='' OR strpos(lower(item->>'name'),lower(btrim(p_query)))>0 OR strpos(lower(coalesce(item->>'template_code','')),lower(btrim(p_query)))>0)),
 page AS (SELECT item FROM picked ORDER BY lower(item->>'name'),item->>'template_id' LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM picked),coalesce((SELECT jsonb_agg(item ORDER BY lower(item->>'name'),item->>'template_id') FROM page),'[]'::jsonb) INTO total,items;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'category',private.model_folder_category(f.office_id,f.id)) ORDER BY f.name,f.id),'[]'::jsonb) INTO folders FROM private.model_folders f WHERE f.office_id=p_office_id AND EXISTS(SELECT FROM private.document_offerings o JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id WHERE o.office_id=f.office_id AND l.folder_id=f.id AND (CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END) IS NOT NULL AND (p_category IS NULL OR btrim(p_category)='' OR (CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END)->>'service_category'=btrim(p_category)));
 WITH available AS MATERIALIZED (SELECT CASE WHEN member.role_code='client' THEN private.document_offer_projection(o,at_time) ELSE private.document_staff_offer_projection(o,at_time) END item FROM private.document_offerings o WHERE o.office_id=p_office_id),
 counts AS MATERIALIZED (SELECT item->>'service_category' name,count(*) n FROM available WHERE item IS NOT NULL GROUP BY 1)
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',c.name,'count',coalesce(k.n,0)) ORDER BY c.name),'[]'::jsonb) INTO categories FROM private.service_categories c LEFT JOIN counts k ON k.name=c.name WHERE c.office_id=p_office_id;
 PERFORM private.requests_actor(p_office_id);
 RETURN jsonb_build_object('items',items,'folders',folders,'categories',categories,'total',total,'page',p_page,'page_size',p_size);
END $$;
REVOKE ALL ON FUNCTION private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_offers_page(uuid,uuid,boolean,text,integer,integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';