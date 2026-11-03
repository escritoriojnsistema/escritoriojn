-- Etapa23: extend the existing publication/event authority. No second approvals store.
INSERT INTO public.permissions(code,name) VALUES('documents.review','Revisar e decidir documentos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES('owner','documents.review') ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;body text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%documents.update%' LOOP
  body:=replace(r.def,'''documents.update''::text','''documents.update''::text, ''documents.review''::text');
  IF body=r.def THEN RAISE EXCEPTION 'Review capability constraint target absent';END IF;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,body);
 END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP
  body:=pg_get_functiondef(r.oid);body:=replace(body,'''documents.update''','''documents.update'',''documents.review''');EXECUTE body;
 END LOOP;
END $m$;
ALTER TABLE private.document_publication_events DROP CONSTRAINT document_publication_events_kind_check;
ALTER TABLE private.document_publication_events ADD CONSTRAINT document_publication_events_kind_check CHECK(kind IN('submit','approve','reject','return','withdraw','signature','handoff','download'));
ALTER TABLE private.document_publication_events ADD COLUMN reviewer_id uuid,ADD COLUMN due_at timestamptz;
ALTER TABLE private.document_publication_events ADD CONSTRAINT document_review_event_reviewer_fk FOREIGN KEY(office_id,reviewer_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT;
ALTER TABLE private.document_publication_events ADD CONSTRAINT document_review_event_fields CHECK(kind='submit' OR(reviewer_id IS NULL AND due_at IS NULL));
CREATE INDEX document_editorial_events23_idx ON private.document_publication_events(office_id,publication_id,created_at DESC,id DESC) WHERE kind IN('submit','approve','reject','return','withdraw');
CREATE INDEX document_review_assignee23_idx ON private.document_publication_events(office_id,reviewer_id,created_at DESC) WHERE kind='submit';

CREATE FUNCTION private.review_last23(p private.document_publications) RETURNS private.document_publication_events LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT e FROM private.document_publication_events e WHERE e.office_id=p.office_id AND e.publication_id=p.id AND e.kind IN('submit','approve','reject','return','withdraw') ORDER BY e.created_at DESC,e.id DESC LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION private.wf_approved(p private.document_publications) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN e.kind IN('reject','return','withdraw') THEN false WHEN e.kind='approve' THEN true ELSE NOT p.review_required END FROM(SELECT 1)x LEFT JOIN LATERAL private.review_last23(p)e ON true;
$$;
-- Explicit submission stays open to human review even when the approval gate is waived.
CREATE FUNCTION private.review_status23(p private.document_publications,p_current integer) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p.revision<>p_current THEN 'superseded' WHEN e.kind='return' THEN 'returned' WHEN e.kind='withdraw' THEN 'withdrawn' WHEN e.kind='reject' THEN 'rejected' WHEN e.kind='approve' OR(NOT p.review_required AND e.kind IS NULL) THEN 'approved' ELSE 'in_review' END FROM(SELECT 1)x LEFT JOIN LATERAL private.review_last23(p)e ON true;
$$;
CREATE FUNCTION private.review_sources23(d public.documents,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT FROM(SELECT r.customer_id cid FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id UNION SELECT customer_id FROM public.document_participants WHERE office_id=d.office_id AND document_id=d.id UNION SELECT source_customer_id FROM private.document_revisions WHERE office_id=d.office_id AND document_id=d.id)src LEFT JOIN public.customers c ON c.office_id=d.office_id AND c.id=src.cid WHERE src.cid IS NOT NULL AND private.documents_customer_visible21(c,m.user_id,private.team_permissions_for_member(m.id),true) IS NOT TRUE);
$$;
CREATE FUNCTION private.review_member23(d public.documents,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT m.office_id=d.office_id AND m.active AND m.role_code<>'client' AND private.team_user_active(m.user_id,m.office_id) IS TRUE AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','documents.read','requests.read','customers.read','documents.review'] AND EXISTS(SELECT FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id AND private.request_in_scope(r,m) IS TRUE) AND private.review_sources23(d,m);
$$;
-- Evaluate both immutable creator and latest submitter at callers; owner exemption uses captured policy.
CREATE FUNCTION private.review_self23(d public.documents,m public.memberships,p_allow boolean,p_creator uuid DEFAULT NULL) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (m.role_code='owner' AND p_allow) OR NOT(m.user_id IS NOT DISTINCT FROM p_creator OR EXISTS(SELECT FROM private.document_revisions WHERE office_id=d.office_id AND document_id=d.id AND revision=d.revision AND author_id=m.user_id) OR EXISTS(SELECT FROM private.document_preparations WHERE office_id=d.office_id AND document_id=d.id AND revision=d.revision AND actor_id=m.user_id));
$$;
CREATE FUNCTION private.review_info23(p private.document_publications,d public.documents,m public.memberships) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE last_event private.document_publication_events;submitted private.document_publication_events;status text;work boolean;reviewer_name text;preparer text;actor_name text;BEGIN
 last_event:=private.review_last23(p);status:=private.review_status23(p,d.revision);
 SELECT * INTO submitted FROM private.document_publication_events WHERE office_id=p.office_id AND publication_id=p.id AND kind='submit' ORDER BY created_at DESC,id DESC LIMIT 1;
 SELECT private.customer_relation_display_label(pr.display_name) INTO reviewer_name FROM public.memberships mm JOIN public.profiles pr ON pr.id=mm.user_id WHERE mm.office_id=p.office_id AND mm.id=submitted.reviewer_id;
 SELECT coalesce(private.customer_relation_display_label(author_name),'Integrante da equipe') INTO preparer FROM private.document_revisions WHERE office_id=d.office_id AND document_id=d.id AND revision=p.revision;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Integrante da equipe') INTO actor_name FROM public.profiles WHERE id=last_event.actor_id;
 work:=private.team_permissions_for_member(m.id) @> ARRAY['documents.update'] AND EXISTS(SELECT FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m) IS TRUE);
 RETURN jsonb_build_object('status',status,'reviewer_id',submitted.reviewer_id,'reviewer_name',CASE WHEN submitted.reviewer_id IS NOT NULL THEN coalesce(reviewer_name,'Integrante da equipe') END,'prepared_by_name',coalesce(preparer,'Integrante da equipe'),'due_at',submitted.due_at,'submitted_at',coalesce(submitted.created_at,p.created_at),'last_event_id',last_event.id,'last_reason',last_event.reason,'last_actor_name',CASE WHEN last_event.id IS NOT NULL THEN coalesce(actor_name,'Integrante da equipe') END,
 'can_decide',coalesce(status='in_review' AND private.review_member23(d,m) AND (submitted.reviewer_id IS NULL OR submitted.reviewer_id=m.id OR m.role_code='owner') AND private.review_self23(d,m,p.allow_self_approval,p.created_by) AND private.review_self23(d,m,p.allow_self_approval,coalesce(submitted.actor_id,p.created_by)) AND EXISTS(SELECT FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id AND r.status NOT IN('concluido','cancelado')),false),
 'can_withdraw',coalesce(status='in_review' AND(work OR private.review_member23(d,m) AND(submitted.reviewer_id IS NULL OR submitted.reviewer_id=m.id OR m.role_code='owner')),false),
 'can_submit',coalesce(status='withdrawn' AND work,false));
END $$;

CREATE OR REPLACE FUNCTION private.document_workflow_state(p_office_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;p private.document_publications;blockers text[];result jsonb:='[]';BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 FOR p IN SELECT * FROM private.document_publications WHERE office_id=p_office_id AND document_id=d.id ORDER BY created_at DESC,id DESC LIMIT 5 LOOP
 blockers:=private.wf_gate(p);
 result:=result||jsonb_build_array(jsonb_build_object('id',p.id,'revision',p.revision,'title',p.title,'created_at',p.created_at,'created_by',p.created_by,'review_required',p.review_required,'signature_policy',p.signature_policy,'approved',private.wf_approved(p),'signed',private.wf_signed(p),'handed_off',EXISTS(SELECT FROM private.document_cash_tasks WHERE office_id=p.office_id AND publication_id=p.id),'artifact_ready',EXISTS(SELECT FROM private.document_artifact_jobs WHERE office_id=p.office_id AND publication_id=p.id AND completed_at IS NOT NULL),'ready',cardinality(blockers)=0,'blockers',to_jsonb(blockers),'review',private.review_info23(p,d,m)));
 END LOOP;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('document_id',d.id,'current_revision',d.revision,'can_work',private.current_permissions(p_office_id) @> ARRAY['documents.update'] AND EXISTS(SELECT FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m) IS TRUE),'can_review',private.review_member23(d,m),'publications',result);
END $$;

CREATE OR REPLACE FUNCTION private.document_workflow_command(p_office_id uuid,p_document_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;p private.document_publications;cmd private.document_workflow_commands;k text;digest text;detail jsonb;why text;allow_self boolean:=false;last_event private.document_publication_events;assigned private.document_publication_events;target public.memberships;reviewer uuid;due timestamptz;expected uuid;eventid uuid;status text;action text;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 m:=private.documents_access21(p_office_id);
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT p_command ?& ARRAY['kind','expected_revision','reason'] OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision'!~'^[1-9][0-9]{0,9}$' OR(p_command->>'expected_revision')::numeric>2147483646 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_command->>'kind';why:=btrim(p_command->>'reason');
 IF char_length(why) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(why) OR why~'[[:cntrl:]]' OR k NOT IN('freeze','approve','reject','return','withdraw','signature','handoff') OR(k='freeze' AND p_command-'kind'-'expected_revision'-'reason'-'reviewer_id'-'due_at'-'expected_event_id'<>'{}') OR(k<>'freeze' AND(p_command-'kind'-'expected_revision'-'reason'-'publication_id'-'expected_event_id'<>'{}' OR NOT p_command ? 'publication_id')) OR(k IN('return','withdraw') AND NOT p_command ? 'expected_event_id') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
  IF p_command ? 'expected_event_id' THEN IF jsonb_typeof(p_command->'expected_event_id') NOT IN('string','null') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;expected:=(p_command->>'expected_event_id')::uuid;END IF;
  IF k='freeze' THEN
   IF p_command ? 'reviewer_id' AND jsonb_typeof(p_command->'reviewer_id') NOT IN('string','null') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
   reviewer:=(p_command->>'reviewer_id')::uuid;
   IF p_command ? 'due_at' AND jsonb_typeof(p_command->'due_at') NOT IN('string','null') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
   due:=(p_command->>'due_at')::timestamptz;
  END IF;
 EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id FOR UPDATE;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 digest:=encode(extensions.digest(jsonb_build_object('document',d.id,'command',p_command)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.document_workflow_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF cmd.document_id IS NOT NULL THEN IF cmd.digest<>digest THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.document_workflow_state(p_office_id,d.id);END IF;
 IF EXISTS(SELECT FROM public.requests r WHERE r.office_id=p_office_id AND r.id=d.request_id AND r.status IN('concluido','cancelado')) OR d.revision::numeric<>(p_command->>'expected_revision')::numeric THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='freeze' THEN
  m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
  IF due IS NOT NULL AND(NOT isfinite(due) OR due<=clock_timestamp() OR due>clock_timestamp()+interval '1 year') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
  detail:=private.document_detail(p_office_id,d.id,NULL,1);
  IF detail->>'status'<>'prepared' OR detail->'issues'<>'[]' OR d.status<>'prepared' THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
  SELECT allow_self_approval INTO allow_self FROM private.document_intakes WHERE office_id=p_office_id AND request_item_id=d.request_item_id;
  IF NOT FOUND THEN SELECT allow_self_approval INTO allow_self FROM private.document_offerings WHERE office_id=p_office_id AND template_id=d.template_id;END IF;
  IF reviewer IS NOT NULL THEN
   SELECT * INTO target FROM public.memberships WHERE office_id=p_office_id AND id=reviewer FOR SHARE;
   IF target.id IS NULL OR private.review_member23(d,target) IS NOT TRUE OR private.review_self23(d,target,coalesce(allow_self,false),m.user_id) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  END IF;
  SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND document_id=d.id AND revision=d.revision;
  IF p.id IS NOT NULL THEN
   last_event:=private.review_last23(p);status:=private.review_status23(p,d.revision);
   IF NOT p_command ? 'expected_event_id' OR expected IS DISTINCT FROM last_event.id OR status<>'withdrawn' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSE
   IF expected IS NOT NULL THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
   INSERT INTO private.document_publications(office_id,document_id,revision,title,protocol,content,content_sha256,review_required,signature_policy,demonstration,allow_self_approval,created_by)
   VALUES(p_office_id,d.id,d.revision,d.title,d.protocol,detail->>'rendered_content',encode(extensions.digest(detail->>'rendered_content','sha256'),'hex'),(detail#>>'{template,definition,review_required}')::boolean,detail#>>'{template,definition,signature_policy}',(detail#>>'{template,definition,demonstration}')::boolean,coalesce(allow_self,false),m.user_id) RETURNING * INTO p;
  END IF;
  INSERT INTO private.document_publication_events(office_id,publication_id,kind,actor_id,reason,reviewer_id,due_at) VALUES(p_office_id,p.id,'submit',m.user_id,why,reviewer,due) RETURNING id INTO eventid;
  action:='documents.review_submitted';
 ELSE
  BEGIN SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=(p_command->>'publication_id')::uuid AND document_id=d.id FOR UPDATE;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
  IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF p.revision<>d.revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
  last_event:=private.review_last23(p);status:=private.review_status23(p,d.revision);
  SELECT * INTO assigned FROM private.document_publication_events WHERE office_id=p_office_id AND publication_id=p.id AND kind='submit' ORDER BY created_at DESC,id DESC LIMIT 1;
  IF k IN('approve','reject','return') THEN
   IF private.review_member23(d,m) IS NOT TRUE OR(assigned.reviewer_id IS NOT NULL AND assigned.reviewer_id<>m.id AND m.role_code<>'owner') OR private.review_self23(d,m,p.allow_self_approval,p.created_by) IS NOT TRUE OR private.review_self23(d,m,p.allow_self_approval,coalesce(assigned.actor_id,p.created_by)) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  ELSIF k='withdraw' THEN
   IF NOT(private.current_permissions(p_office_id) @> ARRAY['documents.update'] AND private.request_can_work((SELECT r FROM public.requests r WHERE r.office_id=p_office_id AND r.id=d.request_id),m) IS TRUE) AND NOT(private.review_member23(d,m) AND(assigned.reviewer_id IS NULL OR assigned.reviewer_id=m.id OR m.role_code='owner')) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  ELSE m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
  END IF;
  IF k IN('approve','reject','return','withdraw') THEN
   IF status<>'in_review' OR(p_command ? 'expected_event_id' AND expected IS DISTINCT FROM last_event.id) OR(NOT p_command ? 'expected_event_id' AND EXISTS(SELECT FROM private.document_publication_events WHERE office_id=p_office_id AND publication_id=p.id AND kind IN('approve','reject','return','withdraw'))) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
   action:=CASE k WHEN 'approve' THEN 'documents.review_approved' WHEN 'reject' THEN 'documents.review_rejected' WHEN 'return' THEN 'documents.review_returned' ELSE 'documents.review_withdrawn' END;
  ELSIF k='signature' THEN
   IF p.signature_policy<>'physical' OR NOT private.wf_approved(p) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
  ELSIF k='handoff' THEN
   IF NOT private.wf_approved(p) OR NOT private.wf_signed(p) OR p.demonstration OR NOT EXISTS(SELECT FROM private.document_artifact_jobs WHERE office_id=p.office_id AND publication_id=p.id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
   INSERT INTO private.document_cash_tasks(office_id,request_id,publication_id) VALUES(p_office_id,d.request_id,p.id) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO private.document_publication_events(office_id,publication_id,kind,actor_id,reason) VALUES(p_office_id,p.id,k,m.user_id,why) RETURNING id INTO eventid;
 END IF;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF k IN('approve','reject','return') AND private.review_member23(d,m) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.document_workflow_commands VALUES(p_office_id,m.user_id,p_idempotency_key,digest,d.id);
 IF action IS NOT NULL THEN PERFORM private.emit_business_event(p_office_id,action,'document',d.id,p_idempotency_key,'{}');END IF;
 RETURN private.document_workflow_state(p_office_id,d.id);
END $$;

CREATE FUNCTION private.document_review_queue(p_office_id uuid,p_query text,p_status text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;items jsonb;total bigint;BEGIN
 m:=private.documents_access21(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query~'[[:cntrl:]]' OR p_status IS NULL OR p_status NOT IN('','in_review','approved','returned','rejected','withdrawn','superseded') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH scoped_requests AS MATERIALIZED(SELECT r FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m) IS TRUE),
 latest AS MATERIALIZED(SELECT DISTINCT ON(p.document_id) p AS pub FROM private.document_publications p WHERE p.office_id=p_office_id ORDER BY p.document_id,p.revision DESC),candidates AS MATERIALIZED(
 SELECT x.pub,d AS doc,(sr.r).protocol,private.review_status23(x.pub,d.revision) status,submitted.due_at
 FROM scoped_requests sr JOIN public.documents d ON d.office_id=(sr.r).office_id AND d.request_id=(sr.r).id JOIN latest x ON(x.pub).office_id=d.office_id AND(x.pub).document_id=d.id
 LEFT JOIN LATERAL(SELECT due_at FROM private.document_publication_events WHERE office_id=p_office_id AND publication_id=(x.pub).id AND kind='submit' ORDER BY created_at DESC,id DESC LIMIT 1)submitted ON true
 WHERE private.review_sources23(d,m) IS TRUE AND(btrim(p_query)='' OR strpos(lower((x.pub).title||' '||(sr.r).protocol),lower(btrim(p_query)))>0)),
 filtered AS(SELECT * FROM candidates WHERE p_status='' OR status=p_status),paged AS(SELECT * FROM filtered ORDER BY due_at ASC NULLS LAST,(pub).created_at,(pub).id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(jsonb_build_object('document_id',(pub).document_id,'request_id',(doc).request_id,'publication_id',(pub).id,'protocol',protocol,'title',(pub).title,'revision',(pub).revision,'pending_count',CASE WHEN status='superseded' THEN 1 ELSE jsonb_array_length(private.document_detail(p_office_id,(pub).document_id,NULL,1)->'issues') END,'review',private.review_info23(pub,doc,m)) ORDER BY due_at ASC NULLS LAST,(pub).created_at,(pub).id) FROM paged),'[]') INTO total,items;
 PERFORM private.documents_access21(p_office_id);
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.document_reviewers(p_office_id uuid,p_document_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;allow_self boolean:=false;items jsonb;total bigint;caller public.memberships;BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 caller:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query~'[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT allow_self_approval INTO allow_self FROM private.document_intakes WHERE office_id=p_office_id AND request_item_id=d.request_item_id;
 IF NOT FOUND THEN SELECT allow_self_approval INTO allow_self FROM private.document_offerings WHERE office_id=p_office_id AND template_id=d.template_id;END IF;
 WITH candidates AS MATERIALIZED(SELECT m.id,coalesce(private.customer_relation_display_label(p.display_name),'Integrante da equipe') label,m.role_code FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id WHERE m.office_id=p_office_id AND private.review_member23(d,m) IS TRUE AND private.review_self23(d,m,coalesce(allow_self,false),caller.user_id) IS TRUE AND(btrim(p_query)='' OR strpos(lower(coalesce(p.display_name,'')),lower(btrim(p_query)))>0)),paged AS(SELECT * FROM candidates ORDER BY label,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY label,id) FROM paged),'[]') INTO total,items;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size);
END $$;
CREATE FUNCTION private.document_review_history(p_office_id uuid,p_document_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;items jsonb;total bigint;BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH events AS MATERIALIZED(SELECT e.id,e.publication_id,p.revision,e.kind,coalesce(private.customer_relation_display_label(a.display_name),'Integrante da equipe') actor_name,e.reason,e.created_at,CASE WHEN e.reviewer_id IS NOT NULL THEN coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe') END reviewer_name,e.due_at FROM private.document_publications p JOIN private.document_publication_events e ON e.office_id=p.office_id AND e.publication_id=p.id JOIN public.profiles a ON a.id=e.actor_id LEFT JOIN public.memberships mm ON mm.office_id=e.office_id AND mm.id=e.reviewer_id LEFT JOIN public.profiles pr ON pr.id=mm.user_id WHERE p.office_id=p_office_id AND p.document_id=d.id AND e.kind IN('submit','approve','reject','return','withdraw')),paged AS(SELECT * FROM events ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(p_page-1)*5)
 SELECT(SELECT count(*) FROM events),coalesce((SELECT jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,id DESC) FROM paged),'[]') INTO total,items;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',5);
END $$;
CREATE FUNCTION private.request_document_reviews(p_office_id uuid,p_request_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;items jsonb;total bigint;BEGIN
 m:=private.requests_actor(p_office_id);SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id;
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS MATERIALIZED(SELECT d.title,p.revision,private.review_status23(x.pub,d.revision) status,coalesce(e.created_at,p.created_at) updated_at,d.id FROM public.documents d CROSS JOIN LATERAL(SELECT pub FROM private.document_publications pub WHERE pub.office_id=d.office_id AND pub.document_id=d.id ORDER BY pub.revision DESC LIMIT 1)x CROSS JOIN LATERAL(SELECT(x.pub).*)p LEFT JOIN LATERAL private.review_last23(x.pub)e ON true WHERE d.office_id=p_office_id AND d.request_id=r.id),paged AS(SELECT * FROM candidates ORDER BY updated_at DESC,id LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(to_jsonb(paged)-'id' ORDER BY updated_at DESC,id) FROM paged),'[]') INTO total,items;
 m:=private.requests_actor(p_office_id);IF private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',p_size);
END $$;

-- The existing inbox is the transactional outbox; no e-mail or external messaging.
DO $m$ DECLARE body text;BEGIN
 SELECT pg_get_constraintdef(oid) INTO body FROM pg_constraint WHERE conrelid='private.internal_notifications'::regclass AND conname='internal_notifications_kind_check';
 body:=replace(body,'''handoff''::text','''document_review_pending''::text,''document_approved''::text,''document_returned''::text,''document_rejected''::text,''document_withdrawn''::text,''handoff''::text');
 ALTER TABLE private.internal_notifications DROP CONSTRAINT internal_notifications_kind_check;
 EXECUTE 'ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check '||body;
END $m$;
CREATE FUNCTION private.review_notice23() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;r public.requests;notice_kind text;BEGIN
 IF NEW.kind NOT IN('submit','approve','reject','return','withdraw') THEN RETURN NEW;END IF;
 SELECT * INTO p FROM private.document_publications WHERE office_id=NEW.office_id AND id=NEW.publication_id;
 SELECT * INTO d FROM public.documents WHERE office_id=p.office_id AND id=p.document_id;
 SELECT * INTO r FROM public.requests WHERE office_id=d.office_id AND id=d.request_id;
 IF NEW.kind='submit' THEN
  IF p.review_required THEN
   INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
   SELECT d.office_id,d.request_id,m.id,'document_review_pending',NEW.id FROM public.memberships m
   WHERE m.office_id=d.office_id AND m.user_id<>NEW.actor_id AND(NEW.reviewer_id IS NULL OR m.id=NEW.reviewer_id) AND private.review_member23(d,m) IS TRUE AND private.review_self23(d,m,p.allow_self_approval,p.created_by) IS TRUE AND private.review_self23(d,m,p.allow_self_approval,NEW.actor_id) IS TRUE
   ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
  END IF;
 ELSE
  notice_kind:=CASE NEW.kind WHEN 'approve' THEN 'document_approved' WHEN 'reject' THEN 'document_rejected' WHEN 'return' THEN 'document_returned' ELSE 'document_withdrawn' END;
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
  SELECT d.office_id,d.request_id,m.id,notice_kind,NEW.id FROM public.memberships m WHERE m.office_id=d.office_id AND m.active AND private.team_user_active(m.user_id,m.office_id) IS TRUE AND private.request_in_scope(r,m) IS TRUE AND((m.role_code='client' AND r.origin='portal' AND r.created_by=m.user_id) OR(m.role_code<>'client' AND m.user_id<>NEW.actor_id AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read','documents.read'] AND(m.id=r.assignee_id OR m.user_id=p.created_by OR EXISTS(SELECT FROM private.document_revisions WHERE office_id=d.office_id AND document_id=d.id AND revision=p.revision AND author_id=m.user_id) OR EXISTS(SELECT FROM private.document_preparations WHERE office_id=d.office_id AND document_id=d.id AND revision=p.revision AND actor_id=m.user_id))))
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER document_review_notices23 AFTER INSERT ON private.document_publication_events FOR EACH ROW EXECUTE FUNCTION private.review_notice23();
ALTER FUNCTION private.notification_visible(private.internal_notifications,public.requests,public.memberships) RENAME TO notification_visible_before23;
CREATE FUNCTION private.notification_visible(n private.internal_notifications,r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN n.kind IN('document_review_pending','document_approved','document_returned','document_rejected','document_withdrawn') THEN n.office_id=m.office_id AND n.recipient_id=m.id AND private.request_in_scope(r,m) IS TRUE AND CASE WHEN m.role_code='client' THEN n.kind<>'document_review_pending' AND r.origin='portal' AND r.created_by=m.user_id ELSE private.current_permissions(m.office_id) @> ARRAY['requests.read','documents.read'] AND(n.kind<>'document_review_pending' OR private.current_permissions(m.office_id) @> ARRAY['documents.review']) END ELSE private.notification_visible_before23(n,r,m) END;
$$;
DO $m$ DECLARE body text;updated text;name text;BEGIN
 FOREACH name IN ARRAY ARRAY['notifications_page','notifications_summary'] LOOP
  SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname=name;
  updated:=replace(body,'''assignee_changed'',''account_updated''','''assignee_changed'',''account_updated'',''document_approved'',''document_returned'',''document_rejected'',''document_withdrawn''');
  updated:=replace(updated,'''handoff'',''pending'',''account_correction''','''handoff'',''pending'',''account_correction'',''document_review_pending'',''document_approved'',''document_returned'',''document_rejected'',''document_withdrawn''');
  updated:=replace(updated,'''charge_cancelled'') OR p_page','''charge_cancelled'',''document_review_pending'',''document_approved'',''document_returned'',''document_rejected'',''document_withdrawn'') OR p_page');
  updated:=replace(updated,'WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND','WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND(n.kind NOT IN(''document_review_pending'',''document_approved'',''document_returned'',''document_rejected'',''document_withdrawn'') OR private.notification_visible(n,r,m)) AND');
  IF updated=body THEN RAISE EXCEPTION 'Review notification target absent: %',name;END IF;EXECUTE updated;
 END LOOP;
END $m$;

-- Version22 keeps its snapshots/preview files and derives new editorial states.
DO $m$ DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.document_versions_page(uuid,uuid,integer)'::regprocedure) INTO body;
 updated:=replace(body,'''status'',CASE WHEN v.revision<>d.revision THEN ''superseded'' WHEN e.kind=''reject'' THEN ''rejected'' WHEN p.id IS NOT NULL AND private.wf_approved(p) THEN ''approved'' WHEN p.id IS NOT NULL THEN ''in_review'' ELSE ''draft'' END','''status'',CASE WHEN p.id IS NULL THEN CASE WHEN v.revision<>d.revision THEN ''superseded'' ELSE ''draft'' END ELSE private.review_status23(p,d.revision) END');
 updated:=replace(updated,'kind IN(''approve'',''reject'')','kind IN(''approve'',''reject'',''return'',''withdraw'')');
 IF updated=body THEN RAISE EXCEPTION 'Version22 editorial target absent';END IF;EXECUTE updated;
END $m$;

CREATE FUNCTION public.document_review_queue(p_office_id uuid,p_query text,p_status text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_review_queue(p_office_id,p_query,p_status,p_page,p_size);$$;
CREATE FUNCTION public.document_reviewers(p_office_id uuid,p_document_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_reviewers(p_office_id,p_document_id,p_query,p_page,p_size);$$;
CREATE FUNCTION public.document_review_history(p_office_id uuid,p_document_id uuid,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_review_history(p_office_id,p_document_id,p_page);$$;
CREATE FUNCTION public.request_document_reviews(p_office_id uuid,p_request_id uuid,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_document_reviews(p_office_id,p_request_id,p_page,p_size);$$;
DO $m$ DECLARE r record;BEGIN
 FOR r IN SELECT oid::regprocedure sig,proname FROM pg_proc WHERE pronamespace IN('private'::regnamespace,'public'::regnamespace) AND(proname IN('document_review_queue','document_reviewers','document_review_history','request_document_reviews','notification_visible') OR proname LIKE 'review_%23') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.sig);
  IF r.proname IN('document_review_queue','document_reviewers','document_review_history','request_document_reviews') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.sig);END IF;
 END LOOP;
END $m$;
NOTIFY pgrst,'reload schema';
