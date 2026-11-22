-- Keep the notification acknowledgement contract for detached and ordinary notices.
CREATE OR REPLACE FUNCTION private.notifications_read(p_office_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  m public.memberships;
  n private.internal_notifications;
  r public.requests;
BEGIN
  m := private.notifications_actor(p_office_id, true);
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE = 'PT422';
  END IF;
  SELECT * INTO n
  FROM private.internal_notifications
  WHERE office_id = p_office_id AND id = p_id AND recipient_id = m.id
  FOR UPDATE;
  IF n.id IS NOT NULL AND n.kind IN (
    'request_deleted',
    'payment_approval_requested',
    'payment_approval_decided',
    'discount_approval_requested',
    'discount_approval_decided'
  ) THEN
    IF n.request_id IS NOT NULL THEN
      SELECT * INTO r FROM public.requests WHERE office_id = p_office_id AND id = n.request_id;
    END IF;
    IF private.notification_visible(n, r, m) IS NOT TRUE THEN
      RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'PT404';
    END IF;
    UPDATE private.internal_notifications
       SET read_at = coalesce(read_at, clock_timestamp())
     WHERE office_id = p_office_id AND id = n.id;
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN private.notifications_read_before_evolution(p_office_id, p_id);
END $$;

CREATE OR REPLACE FUNCTION public.notifications_read(p_office_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.notifications_read(p_office_id,p_id);
$$;

-- A request item can only open its own document and conference session.
CREATE OR REPLACE FUNCTION private.smart_request_context(p_office_id uuid,p_request_id uuid,p_request_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;d public.documents;i private.document_intakes;s private.document_smart_sessions;ch private.charges;financial jsonb;cfg private.template_smart_configs;courtesies jsonb;
 can_start boolean := false;
 needs_review boolean := false;
 publication private.document_publications;
BEGIN
 IF p_request_id IS NULL OR p_request_item_id IS NULL THEN
   RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';
 END IF;
 m:=private.documents_access21(p_office_id,p_request_id);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
 SELECT * INTO i FROM private.document_intakes WHERE office_id=p_office_id AND request_id=p_request_id AND request_item_id=p_request_item_id;
 SELECT * INTO d FROM public.documents
 WHERE office_id=p_office_id AND request_id=p_request_id AND request_item_id=p_request_item_id
   AND (i.id IS NULL OR template_version_id=i.template_version_id)
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF d.id IS NOT NULL THEN
   BEGIN
     PERFORM private.documents_access21(p_office_id,p_request_id,NULL,d.id);
   EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT409' THEN
     RETURN NULL;
   END;
   SELECT * INTO publication FROM private.document_publications
   WHERE office_id=p_office_id AND document_id=d.id AND revision=d.revision
   ORDER BY created_at DESC,id DESC LIMIT 1;
   needs_review := publication.id IS NULL OR private.review_status23(publication,d.revision)<>'approved';
   IF needs_review
      AND NOT (private.current_permissions(p_office_id) @> ARRAY['documents.update']
               AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m) IS TRUE)
      AND (publication.id IS NULL OR (private.review_info23(publication,d,m)->>'can_decide')::boolean IS NOT TRUE) THEN
     RETURN NULL;
   END IF;
 ELSIF i.id IS NOT NULL THEN
   can_start := private.current_permissions(p_office_id) @> ARRAY['documents.create','documents.update','templates.read']
     AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m) IS TRUE;
   IF can_start IS NOT TRUE THEN RETURN NULL; END IF;
 ELSE
   RETURN NULL;
 END IF;
 SELECT * INTO s FROM private.document_smart_sessions
 WHERE office_id=p_office_id AND request_id=p_request_id
   AND ((d.id IS NOT NULL AND document_id=d.id) OR (document_id IS NULL AND request_item_id=p_request_item_id))
 ORDER BY (document_id IS NOT NULL) DESC,updated_at DESC,id DESC LIMIT 1;
 IF i.id IS NOT NULL THEN SELECT * INTO cfg FROM private.template_smart_configs WHERE office_id=p_office_id AND template_id=i.template_id; END IF;
 SELECT * INTO ch FROM private.charges WHERE office_id=p_office_id AND request_id=p_request_id;
 IF ch.id IS NOT NULL THEN
   SELECT jsonb_build_object('charge_id',ch.id,'due_cents',a.due_cents,
     'allocated_cents',a.allocated_cents,'balance_cents',a.balance_cents,'cancelled',a.cancelled)
   INTO financial FROM private.charges_amounts(p_office_id,ch.id) a;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),'[]'::jsonb) INTO courtesies FROM private.document_courtesies c WHERE c.office_id=p_office_id AND c.request_id=p_request_id;
 RETURN jsonb_build_object(
  'request_id',p_request_id,'request_item_id',p_request_item_id,'request_protocol',r.protocol,'request_status',r.status,'origin',r.origin,
  'can_start',can_start,'needs_review',needs_review,'has_intake',i.id IS NOT NULL,'intake',CASE WHEN i.id IS NULL THEN NULL ELSE jsonb_build_object('model_name',i.model_name,'template_id',i.template_id,'template_version_id',i.template_version_id,'answers',i.answers) END,
  'document_id',d.id,'document_status',d.status,'document_revision',d.revision,'document_protocol',d.protocol,
  'smart_session',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,
  'smart_config',CASE WHEN cfg.template_id IS NULL THEN NULL ELSE cfg.config END,
  'financial',financial,
  'courtesies',courtesies
 );
END$$;

-- When the editor has a document ID, use that document's access and item context.
CREATE OR REPLACE FUNCTION private.smart_session_get(p_office_id uuid,p_request_id uuid,p_document_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships; r public.requests; d public.documents; s private.document_smart_sessions;
BEGIN
 IF p_document_id IS NOT NULL THEN
  SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
  IF d.id IS NULL OR (p_request_id IS NOT NULL AND p_request_id<>d.request_id) THEN
   RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';
  END IF;
  PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
  SELECT * INTO s FROM private.document_smart_sessions
  WHERE office_id=p_office_id AND request_id=d.request_id
    AND (document_id=d.id OR (document_id IS NULL AND request_item_id=d.request_item_id))
  ORDER BY (document_id IS NOT NULL) DESC,updated_at DESC,id DESC LIMIT 1;
 ELSIF p_request_id IS NOT NULL THEN
  PERFORM private.team_require_identity();
  SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=auth.uid() AND active FOR SHARE;
  IF m.id IS NULL OR NOT private.team_user_active(m.user_id,p_office_id) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
  SELECT * INTO s FROM private.document_smart_sessions WHERE office_id=p_office_id AND request_id=p_request_id;
  IF s.document_id IS NOT NULL AND m.role_code<>'client' THEN
   PERFORM private.documents_access21(p_office_id,p_request_id,NULL,s.document_id);
  END IF;
 END IF;
 RETURN CASE WHEN s.id IS NOT NULL THEN to_jsonb(s) END;
END $$;

CREATE OR REPLACE FUNCTION private.smart_conference_operate(p_office_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;d public.documents;tv public.template_versions;s private.document_smart_sessions;req_id uuid;doc_id uuid;next_status text;notes text;notify_client boolean;notice_kind text;evt_id uuid;
BEGIN
 req_id:=(p_payload->>'request_id')::uuid;
 doc_id:=NULLIF(p_payload->>'document_id','')::uuid;
 next_status:=p_payload->>'conference_status';
 notes:=coalesce(p_payload->>'conference_notes','');
 notify_client:=coalesce((p_payload->>'notify_client')::boolean,false);
 IF req_id IS NULL OR next_status NOT IN('nao_iniciada','em_conferencia','aguardando_complementacao','conferencia_concluida') OR char_length(notes)>2000 THEN
  RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';
 END IF;
 IF doc_id IS NOT NULL THEN
  SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=doc_id AND request_id=req_id;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 END IF;
 m:=private.documents_access21(p_office_id,req_id,'documents.update',doc_id);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=req_id FOR UPDATE;
 SELECT * INTO s FROM private.document_smart_sessions WHERE office_id=p_office_id AND request_id=req_id FOR UPDATE;
 IF s.id IS NOT NULL THEN
  IF d.id IS NOT NULL AND ((s.document_id IS NOT NULL AND s.document_id<>d.id)
    OR s.request_item_id IS DISTINCT FROM d.request_item_id) THEN
   RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';
  END IF;
  UPDATE private.document_smart_sessions SET
   conference_status=next_status,
   conference_notes=notes,
   document_id=coalesce(doc_id,document_id),
   updated_by=m.user_id,
   updated_at=clock_timestamp()
  WHERE id=s.id RETURNING * INTO s;
 ELSIF doc_id IS NOT NULL THEN
  IF d.id IS NOT NULL THEN
   SELECT * INTO tv FROM public.template_versions WHERE office_id=p_office_id AND id=d.template_version_id;
   IF tv.id IS NOT NULL THEN
    INSERT INTO private.document_smart_sessions(
     office_id,request_id,request_item_id,document_id,template_id,template_version_id,origin,channel,current_step,
     conference_status,conference_notes,revision,created_by,updated_by
    ) VALUES(
     p_office_id,req_id,d.request_item_id,d.id,tv.template_id,tv.id,
     CASE WHEN r.origin IN('portal','presencial','whatsapp') THEN r.origin ELSE 'presencial' END,
     'web','revisao',next_status,notes,1,m.user_id,m.user_id
    ) RETURNING * INTO s;
   END IF;
  END IF;
 END IF;
 IF notify_client AND r.origin='portal' THEN
  notice_kind:=CASE WHEN coalesce((p_payload->>'release_charge')::boolean,false) THEN 'charge_released' ELSE 'conference_done' END;
  evt_id:=gen_random_uuid();
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
  SELECT p_office_id,r.id,cm.id,notice_kind,evt_id FROM public.memberships cm
  WHERE cm.office_id=p_office_id AND cm.user_id=r.created_by AND cm.role_code='client' AND cm.active
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 RETURN jsonb_build_object('request_id',req_id,'conference_status',next_status,'conference_notes',notes,'updated_at',clock_timestamp());
END$$;

-- Preserve the normal intake command and its original idempotency contract. Serialize
-- repeat starts from the request UI on the same office lock as document_create.
CREATE FUNCTION private.document_intake_open_from_request(
 p_office_id uuid,p_request_id uuid,p_request_item_id uuid,p_participants jsonb,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; document jsonb;
BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 context := private.smart_request_context(p_office_id,p_request_id,p_request_item_id);
 IF context IS NULL THEN
   RAISE EXCEPTION 'DOCUMENT_CONTEXT_UNAVAILABLE' USING ERRCODE='PT422';
 END IF;
 IF context->>'document_id' IS NOT NULL THEN
   document := private.document_detail(p_office_id,(context->>'document_id')::uuid,NULL,1);
 ELSIF (context->>'can_start')::boolean IS TRUE THEN
   document := private.document_intake_start(p_office_id,p_request_id,p_request_item_id,p_participants,p_idempotency_key);
   context := private.smart_request_context(p_office_id,p_request_id,p_request_item_id);
 ELSE
   RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';
 END IF;
 RETURN jsonb_build_object('context',context,'document',document);
END $$;

CREATE FUNCTION public.document_intake_open_from_request(
 p_office_id uuid,p_request_id uuid,p_request_item_id uuid,p_participants jsonb,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.document_intake_open_from_request(p_office_id,p_request_id,p_request_item_id,p_participants,p_idempotency_key);
$$;
REVOKE ALL ON FUNCTION private.document_intake_open_from_request(uuid,uuid,uuid,jsonb,uuid),
 public.document_intake_open_from_request(uuid,uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.document_intake_open_from_request(uuid,uuid,uuid,jsonb,uuid),
 public.document_intake_open_from_request(uuid,uuid,uuid,jsonb,uuid) TO authenticated;

-- Prefer the recorded category. Older requests can use their explicitly configured
-- services. Never infer category from a request title.
CREATE OR REPLACE FUNCTION private.request_detail(p_office_id uuid,p_request_id uuid,p_page integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 m public.memberships;
 detail jsonb;
 category text;
 rural boolean;
 specialized boolean;
BEGIN
 m := private.requests_actor(p_office_id);
 IF m.role_code='client' THEN
   RETURN private.portal_request_detail32(p_office_id,p_request_id,p_page);
 END IF;
 detail := private.request_detail_before32(p_office_id,p_request_id,p_page);
 category := lower(btrim(detail->>'category_name'));
 SELECT
   EXISTS(SELECT 1 FROM private.rural_cases29 c WHERE c.office_id=p_office_id AND c.request_id=p_request_id)
   OR EXISTS(SELECT 1 FROM public.request_items i JOIN private.rural_services29 s USING (office_id,service_id)
      WHERE i.office_id=p_office_id AND i.request_id=p_request_id),
   EXISTS(SELECT 1 FROM private.specialized_cases c WHERE c.office_id=p_office_id AND c.request_id=p_request_id)
   OR EXISTS(SELECT 1 FROM public.request_items i JOIN private.specialized_services30 s USING (office_id,service_id)
      WHERE i.office_id=p_office_id AND i.request_id=p_request_id)
 INTO rural,specialized;
 RETURN detail || jsonb_build_object(
   'rural_workflow', coalesce(category ~ '\m(ccir|car)\M' OR (category='rural' AND rural),rural),
   'specialized_workflow', coalesce(category ~ '\m(previdenciári[oa]|previdenciari[oa]|jurídic[oa]|juridic[oa])\M',specialized)
 );
END $$;

CREATE OR REPLACE FUNCTION public.request_detail(p_office_id uuid,p_request_id uuid,p_page integer)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_detail(p_office_id,p_request_id,p_page);
$$;

-- Use the portal's request access rules when loading the client's review summary.
CREATE OR REPLACE FUNCTION private.request_document_reviews(p_office_id uuid,p_request_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;items jsonb;total bigint;BEGIN
 m:=private.requests_actor(p_office_id);SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
 IF r.id IS NULL OR (CASE WHEN m.role_code='client' THEN
   r.origin='portal' AND r.created_by=m.user_id AND private.portal_request_visible32(r,m)
 ELSE private.request_in_scope(r,m) END) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS MATERIALIZED(SELECT d.title,p.revision,private.review_status23(x.pub,d.revision) status,coalesce(e.created_at,p.created_at) updated_at,d.id FROM public.documents d CROSS JOIN LATERAL(SELECT pub FROM private.document_publications pub WHERE pub.office_id=d.office_id AND pub.document_id=d.id ORDER BY pub.revision DESC LIMIT 1)x CROSS JOIN LATERAL(SELECT(x.pub).*)p LEFT JOIN LATERAL private.review_last23(x.pub)e ON true WHERE d.office_id=p_office_id AND d.request_id=r.id),paged AS(SELECT * FROM candidates ORDER BY updated_at DESC,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(paged)-'id' ORDER BY updated_at DESC,id) FROM paged),'[]') INTO total,items;
 m:=private.requests_actor(p_office_id);IF (CASE WHEN m.role_code='client' THEN
   r.origin='portal' AND r.created_by=m.user_id AND private.portal_request_visible32(r,m)
 ELSE private.request_in_scope(r,m) END) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size);
END $$;

NOTIFY pgrst,'reload schema';
