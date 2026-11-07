-- Review26: preserve immutable history; bind access to original session and return exact command target.
CREATE OR REPLACE FUNCTION private.document_delivery_access(p_office_id uuid,p_publication_id uuid,p_delivery_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x private.deliveries;p private.document_publications;d public.documents;m public.memberships;a jsonb;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO x FROM private.deliveries WHERE office_id=p_office_id AND publication_id=p_publication_id AND id=p_delivery_id;
 IF x.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.delivery_actor26(p_office_id,d.id,'documents.deliver');
 IF x.actor_id<>m.user_id OR x.session_id IS DISTINCT FROM (auth.jwt()->>'session_id')::uuid OR x.channel='download' OR x.scope IS DISTINCT FROM private.release_scope25(p) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF x.channel='whatsapp' AND NOT EXISTS(SELECT FROM public.customer_contacts cc WHERE cc.office_id=p_office_id AND cc.customer_id=x.recipient_customer_id AND cc.position=x.contact_position AND cc.kind='phone' AND(CASE WHEN length(cc.value) IN(10,11) THEN '55'||cc.value ELSE cc.value END)=x.phone) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 a:=private.document_artifact_authorize(p_office_id,p_publication_id,false);
 IF a->>'sha256' IS DISTINCT FROM x.sha256 OR(a->>'size_bytes')::bigint IS DISTINCT FROM x.size_bytes THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN jsonb_build_object('sha256',x.sha256);
END$$;
CREATE OR REPLACE FUNCTION private.document_delivery_state(p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;r public.requests;m public.memberships;caps text[];b text[];items jsonb;recipient jsonb;n bigint;work boolean;BEGIN
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id;
 caps:=private.current_permissions(p_office_id);work:=private.request_can_work(r,m) IS TRUE;
 SELECT jsonb_build_object('id',c.id,'name',c.name,'contacts',(SELECT coalesce(jsonb_agg(jsonb_build_object('position',cc.position,'phone',CASE WHEN length(cc.value) IN(10,11) THEN '55'||cc.value ELSE cc.value END) ORDER BY cc.position),'[]') FROM public.customer_contacts cc WHERE cc.office_id=c.office_id AND cc.customer_id=c.id AND cc.kind='phone')) INTO recipient FROM public.customers c WHERE c.office_id=r.office_id AND c.id=r.customer_id;
 SELECT count(*) INTO n FROM private.deliveries WHERE office_id=p_office_id AND publication_id=p.id;
 SELECT coalesce(jsonb_agg(v ORDER BY created_at DESC,id DESC),'[]') INTO items FROM(
 SELECT x.id,x.channel,x.revision,x.sha256,x.recipient_name,x.recipient_customer_id,x.phone,x.contact_position,x.created_at,coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe') actor_name,
 e.kind status,e.id last_event_id,(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ev.id,'kind',ev.kind,'reason',ev.reason,'actor_name',coalesce(private.customer_relation_display_label(ep.display_name),'Integrante da equipe'),'created_at',ev.created_at) ORDER BY ev.created_at,ev.id),'[]') FROM private.delivery_events26 ev JOIN public.profiles ep ON ep.id=ev.actor_id WHERE ev.delivery_id=x.id) events
 FROM private.deliveries x JOIN public.profiles pr ON pr.id=x.actor_id CROSS JOIN LATERAL(SELECT * FROM private.delivery_events26 WHERE delivery_id=x.id ORDER BY created_at DESC,id DESC LIMIT 1)e
 WHERE x.office_id=p_office_id AND x.publication_id=p.id ORDER BY x.created_at DESC,x.id DESC LIMIT 5 OFFSET(p_page-1)*5)v;
 b:=private.wf_gate(p);PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('publication_id',p.id,'revision',p.revision,'ready',cardinality(b)=0,'blockers',to_jsonb(b),'can_deliver',work AND caps @> ARRAY['documents.deliver'],'can_revoke',work AND m.role_code IN('owner','admin') AND caps @> ARRAY['documents.deliveries.revoke'],'recipient',recipient,'items',items,'total',n,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION private.delivery_result26(o uuid,p uuid,d uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE target private.deliveries; n bigint; page_number integer; result jsonb; BEGIN
 SELECT * INTO target FROM private.deliveries WHERE office_id=o AND publication_id=p AND id=d;
 IF target.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 SELECT count(*) INTO n FROM private.deliveries x WHERE x.office_id=o AND x.publication_id=p AND (x.created_at,x.id)>(target.created_at,target.id);
 page_number:=(n/5+1)::integer;
 result:=private.document_delivery_state(o,p,page_number);
 RETURN result||jsonb_build_object('result_delivery_id',d);
END$$;
REVOKE ALL ON FUNCTION private.delivery_result26(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.document_delivery_command(p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;r public.requests;m public.memberships;x private.deliveries;e private.delivery_events26;old private.delivery_commands26;k text;cap text;digest text;did uuid;scope jsonb;phone text;contact_slot smallint;a jsonb;obtained uuid;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 k:=p_command->>'kind';cap:=CASE WHEN k='revoke' THEN 'documents.deliveries.revoke' ELSE 'documents.deliver' END;
 m:=private.delivery_actor26(p_office_id,d.id,cap);
 IF k='revoke' AND m.role_code NOT IN('owner','admin') THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR k IS NULL OR k NOT IN('begin','available','confirm','revoke') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('publication',p.id,'command',p_command)::text,'sha256'),'hex');
 SELECT * INTO old FROM private.delivery_commands26 WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF old.idempotency_key IS NOT NULL THEN IF old.digest<>digest THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.delivery_result26(p_office_id,p.id,old.delivery_id);END IF;
 IF k='begin' THEN
 IF NOT p_command ?& ARRAY['kind','channel','expected_revision','recipient_customer_id','contact_position','expected_phone','recipient_checked'] OR p_command-ARRAY['kind','channel','expected_revision','recipient_customer_id','contact_position','expected_phone','recipient_checked']<>'{}' OR jsonb_typeof(p_command->'channel') IS DISTINCT FROM 'string' OR p_command->>'channel' NOT IN('print','whatsapp') OR p_command->'recipient_checked' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision'!~'^[1-9][0-9]{0,9}$' OR(p_command->>'expected_revision')::numeric>2147483646 OR jsonb_typeof(p_command->'recipient_customer_id') IS DISTINCT FROM 'string' OR p_command->>'recipient_customer_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id;
 IF r.customer_id IS NULL OR r.customer_id IS DISTINCT FROM(p_command->>'recipient_customer_id')::uuid THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF(p_command->>'expected_revision')::integer<>p.revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_command->>'channel'='whatsapp' THEN
 IF jsonb_typeof(p_command->'contact_position') IS DISTINCT FROM 'number' OR p_command->>'contact_position'!~'^[0-3]$' OR jsonb_typeof(p_command->'expected_phone') IS DISTINCT FROM 'string' OR p_command->>'expected_phone'!~'^55[0-9]{10,11}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 contact_slot:=(p_command->>'contact_position')::smallint;
 SELECT CASE WHEN length(cc.value) IN(10,11) THEN '55'||cc.value ELSE cc.value END INTO phone FROM public.customer_contacts cc WHERE cc.office_id=p_office_id AND cc.customer_id=r.customer_id AND cc.kind='phone' AND cc.position=contact_slot;
 IF phone IS NULL OR phone IS DISTINCT FROM p_command->>'expected_phone' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSE IF p_command->'contact_position' IS DISTINCT FROM 'null'::jsonb OR p_command->'expected_phone' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 a:=private.document_artifact_authorize(p_office_id,p.id,false);scope:=private.release_scope25(p);
 m:=private.delivery_actor26(p_office_id,d.id,cap);
 INSERT INTO private.deliveries(office_id,publication_id,revision,recipient_customer_id,recipient_name,phone,contact_position,channel,actor_id,session_id,sha256,size_bytes,file_id,scope)
 SELECT p_office_id,p.id,p.revision,r.customer_id,c.name,phone,contact_slot,p_command->>'channel',m.user_id,(auth.jwt()->>'session_id')::uuid,a->>'sha256',(a->>'size_bytes')::bigint,(a->>'file_id')::uuid,scope FROM public.customers c WHERE c.office_id=p_office_id AND c.id=r.customer_id RETURNING id INTO did;
 INSERT INTO private.delivery_events26(delivery_id,kind,actor_id) VALUES(did,'attempt',m.user_id);
 ELSE
 IF NOT p_command ?& ARRAY['kind','delivery_id','expected_event_id','reason'] OR p_command-ARRAY['kind','delivery_id','expected_event_id','reason']<>'{}' OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR char_length(p_command->>'reason') NOT BETWEEN 5 AND 500 OR p_command->>'reason'<>btrim(p_command->>'reason') OR p_command->>'reason'~'[[:cntrl:]]' OR p_command->>'delivery_id' IS NULL OR p_command->>'expected_event_id' IS NULL OR p_command->>'delivery_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR p_command->>'expected_event_id'!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO x FROM private.deliveries WHERE office_id=p_office_id AND publication_id=p.id AND id=(p_command->>'delivery_id')::uuid;IF x.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO e FROM private.delivery_events26 WHERE delivery_id=x.id ORDER BY created_at DESC,id DESC LIMIT 1;
 IF e.id IS DISTINCT FROM(p_command->>'expected_event_id')::uuid OR e.kind='revoked' OR(k='available' AND(e.kind<>'attempt' OR x.channel='download')) OR(k='confirm' AND e.kind<>'available') THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='available' THEN
 PERFORM private.document_delivery_access(p_office_id,p.id,x.id);
 SELECT ar.id INTO obtained FROM private.document_releases25 ar WHERE ar.office_id=p_office_id AND ar.publication_id=p.id AND ar.actor_id=m.user_id AND ar.session_id=(auth.jwt()->>'session_id')::uuid AND ar.recipient_customer_id IS NOT DISTINCT FROM x.recipient_customer_id AND ar.sha256=x.sha256 AND ar.file_id IS NOT DISTINCT FROM x.file_id AND ar.size_bytes=x.size_bytes AND ar.created_at>x.created_at ORDER BY ar.created_at DESC,ar.id DESC LIMIT 1;
 IF obtained IS NULL THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 m:=private.delivery_actor26(p_office_id,d.id,cap);did:=x.id;
 INSERT INTO private.delivery_events26(delivery_id,kind,actor_id,reason,release_id) VALUES(did,CASE k WHEN 'confirm' THEN 'confirmed' WHEN 'revoke' THEN 'revoked' ELSE 'available' END,m.user_id,p_command->>'reason',obtained);
 END IF;
 INSERT INTO private.delivery_commands26 VALUES(p_office_id,m.user_id,p_idempotency_key,digest,did);
 RETURN private.delivery_result26(p_office_id,p.id,did);
END$$;
NOTIFY pgrst,'reload schema';
