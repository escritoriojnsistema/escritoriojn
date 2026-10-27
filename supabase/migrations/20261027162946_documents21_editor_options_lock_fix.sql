CREATE OR REPLACE FUNCTION private.document_options(p_office_id uuid,p_kind text,p_request_id uuid,p_query text,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;items jsonb:='[]';total bigint:=0;at_time timestamptz;action text;
BEGIN
 -- Acquire the strongest office lock before the first gate; the gate revalidates identity after any wait.
 PERFORM private.team_require_identity();
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 m:=private.documents_access21(p_office_id);
 action:=CASE WHEN p_kind='customers' AND private.current_permissions(p_office_id) @> ARRAY['documents.update'] THEN 'documents.update' ELSE 'documents.create' END;
 m:=private.documents_access21(p_office_id,NULL,action);
 IF p_kind IS NULL OR p_kind NOT IN('requests','items','templates','customers') OR p_query IS NULL OR char_length(p_query)>120 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_request_id IS NOT NULL THEN m:=private.documents_access21(p_office_id,p_request_id,action);END IF;
 IF p_kind='requests' THEN
 FOR r IN SELECT * FROM public.requests WHERE office_id=p_office_id AND status NOT IN('concluido','cancelado') AND private.request_can_work(requests,m) AND(btrim(p_query)='' OR strpos(lower(protocol||' '||title),lower(btrim(p_query)))>0) ORDER BY updated_at DESC,id DESC LOOP
 BEGIN PERFORM private.documents_access21(p_office_id,r.id,'documents.create');EXCEPTION WHEN SQLSTATE 'PT403' THEN CONTINUE;END;
 total:=total+1;IF total>(p_page-1)*5 AND total<=p_page*5 THEN items:=items||jsonb_build_array(jsonb_build_object('id',r.id,'label',r.protocol||' — '||r.title));END IF;END LOOP;
 ELSIF p_kind='items' THEN
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS MATERIALIZED(SELECT id,snapshot#>>'{definition,name}' label,created_at FROM public.request_items WHERE office_id=p_office_id AND request_id=p_request_id AND(btrim(p_query)='' OR strpos(lower(snapshot#>>'{definition,name}'),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY created_at,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',label) ORDER BY created_at,id) FROM page),'[]') INTO total,items;
 ELSIF p_kind='customers' THEN
 WITH candidates AS MATERIALIZED(SELECT id,name FROM public.customers WHERE office_id=p_office_id AND private.customer_in_scope(customers,m.user_id) AND(btrim(p_query)='' OR strpos(lower(name),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY name,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',name) ORDER BY name,id) FROM page),'[]') INTO total,items;
 ELSE
 IF NOT private.current_permissions(p_office_id) @> ARRAY['templates.read'] THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;at_time:=clock_timestamp();
 WITH candidates AS MATERIALIZED(SELECT v.id,v.number,v.definition->>'name' name,v.definition->'demonstration' demonstration FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.version_id=v.id WHERE v.office_id=p_office_id AND a.approved_at<=at_time AND((v.definition->>'effective_from') IS NULL OR(v.definition->>'effective_from')::timestamptz<=at_time) AND((v.definition->>'effective_until') IS NULL OR(v.definition->>'effective_until')::timestamptz>at_time) AND(btrim(p_query)='' OR strpos(lower((v.definition->>'name')||' '||(v.definition->>'code')),lower(btrim(p_query)))>0)),page AS(SELECT * FROM candidates ORDER BY name,number DESC,id LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',name||' · v'||number,'demonstration',demonstration) ORDER BY name,number DESC,id) FROM page),'[]') INTO total,items;
 END IF;
 PERFORM private.documents_access21(p_office_id,p_request_id,action);
 RETURN jsonb_build_object('kind',p_kind,'items',items,'total',total,'page',p_page,'page_size',5);
END$$;
