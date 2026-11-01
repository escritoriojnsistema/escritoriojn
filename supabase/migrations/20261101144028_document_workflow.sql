-- Exact prepared revisions, trusted private artifacts and current financial gates.
CREATE TABLE private.document_publications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL,
 title text NOT NULL,protocol text NOT NULL,content text NOT NULL CHECK(char_length(content) BETWEEN 1 AND 50000),
 content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'),review_required boolean NOT NULL,signature_policy text NOT NULL CHECK(signature_policy IN('none','physical','external')),
 demonstration boolean NOT NULL,allow_self_approval boolean NOT NULL DEFAULT false,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,document_id,revision),FOREIGN KEY(office_id,document_id,revision) REFERENCES private.document_revisions(office_id,document_id,revision) ON DELETE RESTRICT
);
CREATE INDEX document_publications_creator_idx ON private.document_publications(created_by);
CREATE TABLE private.document_publication_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('approve','reject','signature','handoff','download')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_publication_events_pub_idx ON private.document_publication_events(office_id,publication_id,created_at DESC,id DESC);
CREATE INDEX document_publication_events_actor_idx ON private.document_publication_events(actor_id);
CREATE TABLE private.document_artifact_jobs(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes',
 object_path text NOT NULL UNIQUE,sha256 text CHECK(sha256~'^[a-f0-9]{64}$'),size_bytes bigint CHECK(size_bytes BETWEEN 1 AND 3145728),renderer text CHECK(renderer='jn-document-v1'),completed_at timestamptz,
 UNIQUE(office_id,publication_id),FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id) ON DELETE RESTRICT,
 CHECK((completed_at IS NULL AND sha256 IS NULL AND size_bytes IS NULL AND renderer IS NULL) OR(completed_at IS NOT NULL AND sha256 IS NOT NULL AND size_bytes IS NOT NULL AND renderer IS NOT NULL))
);
CREATE INDEX document_artifact_jobs_user_idx ON private.document_artifact_jobs(user_id);
CREATE TABLE private.document_cash_tasks(
 office_id uuid NOT NULL,request_id uuid NOT NULL,publication_id uuid NOT NULL,claimed_by uuid REFERENCES public.memberships(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,publication_id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_cash_tasks_request_idx ON private.document_cash_tasks(office_id,request_id);
CREATE INDEX document_cash_tasks_claim_idx ON private.document_cash_tasks(claimed_by);
CREATE TABLE private.document_workflow_commands(
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,digest text NOT NULL,document_id uuid NOT NULL,
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,document_id) REFERENCES public.documents(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_workflow_commands_doc_idx ON private.document_workflow_commands(office_id,document_id);
CREATE FUNCTION private.wf_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END$$;
CREATE TRIGGER document_publications_immutable BEFORE UPDATE OR DELETE ON private.document_publications FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE TRIGGER document_publication_events_immutable BEFORE UPDATE OR DELETE ON private.document_publication_events FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE TRIGGER document_workflow_commands_immutable BEFORE UPDATE OR DELETE ON private.document_workflow_commands FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE FUNCTION private.wf_approved(p private.document_publications) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT NOT p.review_required OR coalesce((SELECT e.kind='approve' FROM private.document_publication_events e WHERE e.office_id=p.office_id AND e.publication_id=p.id AND e.kind IN('approve','reject') ORDER BY e.created_at DESC,e.id DESC LIMIT 1),false);
$$;
CREATE FUNCTION private.wf_signed(p private.document_publications) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p.signature_policy='none' OR(p.signature_policy='physical' AND EXISTS(SELECT FROM private.document_publication_events WHERE office_id=p.office_id AND publication_id=p.id AND kind='signature'));
$$;
CREATE FUNCTION private.wf_recipient(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.finance_client_request(r,m) IS TRUE AND r.customer_id IS NOT NULL AND EXISTS(
 SELECT FROM private.customer_relations rel JOIN public.customers c ON c.office_id=rel.office_id AND c.id=rel.customer_id
 WHERE rel.office_id=r.office_id AND rel.customer_id=r.customer_id AND rel.membership_id=m.id AND rel.relation_type='identity' AND rel.revoked_at IS NULL AND rel.valid_from<=clock_timestamp() AND c.blocked_at IS NULL AND c.merged_into_id IS NULL);
$$;
CREATE FUNCTION private.wf_gate(p private.document_publications,m public.memberships DEFAULT NULL) RETURNS text[] LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.documents;r public.requests;b text[]:='{}';settled boolean;
BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=p.office_id AND id=p.document_id;
 SELECT * INTO r FROM public.requests WHERE office_id=d.office_id AND id=d.request_id;
 IF d.revision<>p.revision THEN b:=array_append(b,'superseded');END IF;
 IF r.status='cancelado' THEN b:=array_append(b,'cancelled');END IF;
 IF p.demonstration THEN b:=array_append(b,'demonstration');END IF;
 IF EXISTS(SELECT FROM public.customers c WHERE c.office_id=p.office_id AND(c.blocked_at IS NOT NULL OR c.merged_into_id IS NOT NULL) AND(c.id=r.customer_id OR c.id IN(SELECT customer_id FROM public.document_participants WHERE office_id=p.office_id AND document_id=p.document_id) OR c.id IN(SELECT source_customer_id FROM private.document_revisions WHERE office_id=p.office_id AND document_id=p.document_id)))THEN b:=array_append(b,'restriction');END IF;
 IF NOT private.wf_approved(p) THEN b:=array_append(b,'review');END IF;
 IF NOT private.wf_signed(p) THEN b:=array_append(b,'signature');END IF;
 IF NOT EXISTS(SELECT FROM private.document_cash_tasks WHERE office_id=p.office_id AND publication_id=p.id) THEN b:=array_append(b,'handoff');END IF;
 SELECT EXISTS(SELECT FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(c.office_id,c.id)a WHERE c.office_id=r.office_id AND c.request_id=r.id AND NOT a.cancelled AND a.balance_cents=0) INTO settled;
 IF NOT settled THEN b:=array_append(b,'payment');END IF;
 IF m.id IS NOT NULL AND private.wf_recipient(r,m) IS NOT TRUE THEN b:=array_append(b,'identity');END IF;
 IF NOT EXISTS(SELECT FROM private.document_artifact_jobs WHERE office_id=p.office_id AND publication_id=p.id AND completed_at IS NOT NULL) THEN b:=array_append(b,'artifact');END IF;
 RETURN b;
END$$;
CREATE FUNCTION private.wf_sources_allowed(p_office uuid,p_document uuid,p_actor uuid,p_caps text[]) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cid uuid;c public.customers;
BEGIN
 FOR cid IN SELECT DISTINCT x FROM(SELECT r.customer_id x FROM public.requests r JOIN public.documents d ON d.office_id=r.office_id AND d.request_id=r.id WHERE d.office_id=p_office AND d.id=p_document UNION ALL SELECT customer_id FROM public.document_participants WHERE office_id=p_office AND document_id=p_document UNION ALL SELECT source_customer_id FROM private.document_revisions WHERE office_id=p_office AND document_id=p_document)z WHERE x IS NOT NULL ORDER BY x LOOP
 SELECT * INTO c FROM public.customers WHERE office_id=p_office AND id=cid FOR SHARE;
 IF private.documents_customer_visible21(c,p_actor,p_caps,true) IS NOT TRUE THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END$$;
CREATE FUNCTION private.document_workflow_state(p_office_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;result jsonb;
BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,p_document_id);
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT coalesce(jsonb_agg(v.value ORDER BY v.created_at DESC,v.id DESC),'[]') INTO result FROM(
 SELECT p.id,p.created_at,jsonb_build_object('id',p.id,'revision',p.revision,'title',p.title,'created_at',p.created_at,'created_by',p.created_by,'review_required',p.review_required,'signature_policy',p.signature_policy,
 'approved',private.wf_approved(p),'signed',private.wf_signed(p),'handed_off',EXISTS(SELECT FROM private.document_cash_tasks WHERE office_id=p.office_id AND publication_id=p.id),
 'artifact_ready',EXISTS(SELECT FROM private.document_artifact_jobs WHERE office_id=p.office_id AND publication_id=p.id AND completed_at IS NOT NULL),'ready',cardinality(private.wf_gate(p))=0,'blockers',to_jsonb(private.wf_gate(p)))value
 FROM private.document_publications p WHERE p.office_id=p_office_id AND p.document_id=p_document_id ORDER BY created_at DESC,id DESC LIMIT 5)v;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('document_id',d.id,'current_revision',d.revision,'can_work',private.current_permissions(p_office_id) @> ARRAY['documents.update'] AND private.request_can_work((SELECT r FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id),m),
 'can_review',m.role_code IN('owner','admin') AND private.current_permissions(p_office_id) @> ARRAY['templates.approve','documents.update'],'publications',result);
END$$;
CREATE FUNCTION private.document_workflow_command(p_office_id uuid,p_document_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;d public.documents;p private.document_publications;cmd private.document_workflow_commands;k text;hash text;detail jsonb;reason text;allow_self boolean:=false;
BEGIN
 m:=private.documents_access21(p_office_id,NULL,'documents.update');
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT p_command ?& ARRAY['kind','expected_revision','reason'] OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision'!~'^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_command->>'kind';reason:=btrim(p_command->>'reason');
 IF char_length(reason) NOT BETWEEN 1 AND 500 OR reason~'[[:cntrl:]]' OR(k='freeze' AND p_command-'kind'-'expected_revision'-'reason'<>'{}') OR(k<>'freeze' AND(p_command-'kind'-'expected_revision'-'reason'-'publication_id'<>'{}' OR NOT p_command ? 'publication_id')) OR k NOT IN('freeze','approve','reject','signature','handoff') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 m:=private.documents_access21(p_office_id,d.request_id,CASE WHEN k IN('approve','reject') THEN NULL ELSE 'documents.update' END,d.id);
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id FOR UPDATE;
 m:=private.documents_access21(p_office_id,d.request_id,CASE WHEN k IN('approve','reject') THEN NULL ELSE 'documents.update' END,d.id);
 hash:=encode(extensions.digest(jsonb_build_object('document',d.id,'command',p_command)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.document_workflow_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF cmd.document_id IS NOT NULL THEN IF cmd.digest<>hash THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.document_workflow_state(p_office_id,d.id);END IF;
 IF EXISTS(SELECT FROM public.requests WHERE office_id=p_office_id AND id=d.request_id AND status IN('concluido','cancelado')) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF d.revision::numeric<>(p_command->>'expected_revision')::numeric THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='freeze' THEN
 detail:=private.document_detail(p_office_id,d.id,NULL,1);
 IF detail->>'status'<>'prepared' OR detail->'issues'<>'[]' OR d.status<>'prepared' THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 -- A configured offering may explicitly permit owner self-review; never infer it from role alone.
 SELECT allow_self_approval INTO allow_self FROM private.document_intakes WHERE office_id=p_office_id AND request_item_id=d.request_item_id;
 IF NOT FOUND THEN SELECT allow_self_approval INTO allow_self FROM private.document_offerings WHERE office_id=p_office_id AND template_id=d.template_id;END IF;
 INSERT INTO private.document_publications(office_id,document_id,revision,title,protocol,content,content_sha256,review_required,signature_policy,demonstration,allow_self_approval,created_by)
 VALUES(p_office_id,d.id,d.revision,d.title,d.protocol,detail->>'rendered_content',encode(extensions.digest(detail->>'rendered_content','sha256'),'hex'),(detail#>>'{template,definition,review_required}')::boolean,detail#>>'{template,definition,signature_policy}',(detail#>>'{template,definition,demonstration}')::boolean,coalesce(allow_self,false),m.user_id)
 ON CONFLICT(office_id,document_id,revision)DO NOTHING;
 ELSE
 BEGIN SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=(p_command->>'publication_id')::uuid AND document_id=d.id;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
 IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p.revision<>d.revision THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k IN('approve','reject') THEN
 IF m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['templates.approve'] OR(p.created_by=m.user_id AND NOT(m.role_code='owner' AND p.allow_self_approval)) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSIF k='signature' THEN
 IF p.signature_policy<>'physical' OR NOT private.wf_approved(p) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 ELSIF k='handoff' THEN
 IF NOT private.wf_approved(p) OR NOT private.wf_signed(p) OR p.demonstration OR NOT EXISTS(SELECT FROM private.document_artifact_jobs WHERE office_id=p.office_id AND publication_id=p.id AND completed_at IS NOT NULL) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 INSERT INTO private.document_cash_tasks(office_id,request_id,publication_id)VALUES(p_office_id,d.request_id,p.id)ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO private.document_publication_events(office_id,publication_id,kind,actor_id,reason)VALUES(p_office_id,p.id,k,m.user_id,reason);
 END IF;
 PERFORM private.documents_access21(p_office_id,d.request_id,CASE WHEN k IN('approve','reject') THEN NULL ELSE 'documents.update' END,d.id);
 INSERT INTO private.document_workflow_commands VALUES(p_office_id,m.user_id,p_idempotency_key,hash,d.id);
 RETURN private.document_workflow_state(p_office_id,d.id);
END$$;
CREATE FUNCTION private.document_cash_can_work(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_can_work(r,m) IS TRUE OR(m.role_code<>'client' AND m.active AND m.office_id=r.office_id AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read','charges.read','cash.open'] AND EXISTS(SELECT FROM private.document_cash_tasks t JOIN private.document_publications p ON p.office_id=t.office_id AND p.id=t.publication_id JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id WHERE t.office_id=r.office_id AND t.request_id=r.id AND t.claimed_by=m.id AND d.revision=p.revision));
$$;
CREATE FUNCTION private.document_cash_in_scope(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.request_in_scope(r,m) IS TRUE OR private.document_cash_can_work(r,m);$$;
-- Extend financial responsibility only, without granting document/customer/attachment access.
DO $m$DECLARE f record;s text;BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('charges_view','charges_view_record','charges_create','charges_mutate','cash_operate_before15','cash_eligible_charges','payment_operate','correction_sources','correction_operate') LOOP
 s:=pg_get_functiondef(f.oid);s:=replace(s,'private.request_can_work(r, m)','private.document_cash_can_work(r, m)');s:=replace(s,'private.request_can_work(r,m)','private.document_cash_can_work(r,m)');s:=replace(s,'private.request_in_scope(r, m)','private.document_cash_in_scope(r, m)');s:=replace(s,'private.request_in_scope(r,m)','private.document_cash_in_scope(r,m)');EXECUTE s;
 END LOOP;
END$m$;
CREATE FUNCTION private.document_cash_queue(p_office_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;items jsonb;total integer;
BEGIN
 m:=private.charges_actor(p_office_id);PERFORM private.cash_actor(p_office_id,false,'cash.read');
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT count(*) INTO total FROM private.document_cash_tasks t JOIN private.document_publications p ON p.office_id=t.office_id AND p.id=t.publication_id JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=t.office_id AND r.id=t.request_id WHERE t.office_id=p_office_id AND d.revision=p.revision AND r.status<>'cancelado' AND(t.claimed_by IS NULL OR t.claimed_by=m.id);
 SELECT coalesce(jsonb_agg(v.value ORDER BY v.created_at,v.id),'[]') INTO items FROM(
 SELECT p.id,t.created_at,jsonb_build_object('publication_id',p.id,'request_id',r.id,'protocol',r.protocol,'title',p.title,'claimed',t.claimed_by=m.id,'has_charge',EXISTS(SELECT FROM private.charges c WHERE c.office_id=r.office_id AND c.request_id=r.id))value FROM private.document_cash_tasks t JOIN private.document_publications p ON p.office_id=t.office_id AND p.id=t.publication_id JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=t.office_id AND r.id=t.request_id WHERE t.office_id=p_office_id AND d.revision=p.revision AND r.status<>'cancelado' AND(t.claimed_by IS NULL OR t.claimed_by=m.id) ORDER BY t.created_at,p.id LIMIT 5 OFFSET(p_page-1)*5)v;
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION private.document_cash_claim(p_office_id uuid,p_publication_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;r public.requests;t private.document_cash_tasks;total bigint;charge private.charges;
BEGIN
 m:=private.charges_actor(p_office_id,true,'charges.create');PERFORM private.cash_actor(p_office_id,true,'cash.open');
 IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=(SELECT request_id FROM public.documents WHERE office_id=p_office_id AND id=p.document_id) FOR UPDATE;
 SELECT * INTO t FROM private.document_cash_tasks WHERE office_id=p_office_id AND publication_id=p.id FOR UPDATE;
 m:=private.charges_actor(p_office_id,true,'charges.create');PERFORM private.cash_actor(p_office_id,true,'cash.open');
 IF t.publication_id IS NULL OR r.id IS NULL OR r.status IN('concluido','cancelado') OR EXISTS(SELECT FROM public.documents WHERE office_id=p_office_id AND id=p.document_id AND revision<>p.revision) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF t.claimed_by IS NOT NULL AND t.claimed_by<>m.id THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.document_cash_tasks SET claimed_by=m.id WHERE office_id=p_office_id AND publication_id=p.id;
 SELECT * INTO charge FROM private.charges WHERE office_id=p_office_id AND request_id=r.id;
 IF charge.id IS NULL THEN
 SELECT sum((snapshot->>'total_cents')::bigint) INTO total FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id;
 PERFORM private.charges_create(p_office_id,r.id,jsonb_build_array(jsonb_build_object('due_date',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD'),'amount_cents',total)),p_idempotency_key);
 END IF;
 RETURN private.document_cash_queue(p_office_id,1);
END$$;
CREATE FUNCTION private.portal_documents_page(p_office_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;items jsonb;total integer;
BEGIN
 actor:=private.team_require_identity();m:=private.requests_actor(p_office_id);
 IF m.role_code<>'client' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT count(*) INTO total FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE p.office_id=p_office_id AND p.revision=d.revision AND private.wf_recipient(r,m);
 SELECT coalesce(jsonb_agg(v.value ORDER BY v.created_at DESC,v.id DESC),'[]') INTO items FROM(
 SELECT p.id,p.created_at,jsonb_build_object('id',p.id,'title',p.title,'protocol',p.protocol,'created_at',p.created_at,'ready',cardinality(private.wf_gate(p,m))=0,'blockers',to_jsonb(private.wf_gate(p,m)))value FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE p.office_id=p_office_id AND p.revision=d.revision AND private.wf_recipient(r,m) ORDER BY p.created_at DESC,p.id DESC LIMIT 5 OFFSET(p_page-1)*5)v;
 PERFORM private.team_require_identity();RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION private.document_artifact_begin(p_office_id uuid,p_publication_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;d public.documents;j private.document_artifact_jobs;
BEGIN
 m:=private.documents_access21(p_office_id,NULL,'documents.update');
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=d.id FOR SHARE;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.update',d.id);
 IF p.id IS NULL OR d.revision<>p.revision OR p.demonstration OR NOT private.wf_approved(p) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 INSERT INTO private.document_artifact_jobs(office_id,publication_id,user_id,session_id,object_path)VALUES(p_office_id,p.id,m.user_id,(auth.jwt()->>'session_id')::uuid,p_office_id::text||'/'||p.id::text||'/'||gen_random_uuid()::text)ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM private.document_artifact_jobs WHERE office_id=p_office_id AND publication_id=p.id FOR UPDATE;
 IF j.completed_at IS NULL THEN
 IF j.expires_at>clock_timestamp() AND(j.user_id<>m.user_id OR j.session_id<>(auth.jwt()->>'session_id')::uuid) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.document_artifact_jobs SET user_id=m.user_id,session_id=(auth.jwt()->>'session_id')::uuid,expires_at=clock_timestamp()+interval '2 minutes',lease_token=CASE WHEN expires_at<clock_timestamp() THEN gen_random_uuid() ELSE lease_token END WHERE id=j.id RETURNING * INTO j;
 END IF;
 RETURN jsonb_build_object('job_id',j.id,'lease_token',j.lease_token,'publication_id',p.id,'office_id',p_office_id,'bucket','jn-document-artifacts','object_path',j.object_path,'content',p.content,'content_sha256',p.content_sha256,'title',p.title,'protocol',p.protocol,'created_at',p.created_at,'completed',j.completed_at IS NOT NULL,'sha256',j.sha256,'size_bytes',j.size_bytes,'signature_policy',p.signature_policy);
END$$;
CREATE FUNCTION private.document_artifact_complete(p_job_id uuid,p_lease_token uuid,p_sha256 text,p_size_bytes bigint,p_renderer text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.document_artifact_jobs;p private.document_publications;d public.documents;r public.requests;m public.memberships;
BEGIN
 SELECT * INTO j FROM private.document_artifact_jobs WHERE id=p_job_id;
 IF j.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM 1 FROM public.offices WHERE id=j.office_id FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=j.office_id AND id=j.publication_id;
 SELECT * INTO d FROM public.documents WHERE office_id=j.office_id AND id=p.document_id;
 SELECT * INTO r FROM public.requests WHERE office_id=j.office_id AND id=d.request_id FOR UPDATE;
 SELECT * INTO d FROM public.documents WHERE office_id=j.office_id AND id=d.id FOR SHARE;
 SELECT * INTO j FROM private.document_artifact_jobs WHERE id=p_job_id FOR UPDATE;
 SELECT * INTO m FROM public.memberships WHERE office_id=j.office_id AND user_id=j.user_id AND active AND role_code<>'client';
 IF j.lease_token IS DISTINCT FROM p_lease_token OR j.expires_at<clock_timestamp() OR d.revision<>p.revision OR NOT private.wf_approved(p) OR private.request_can_work(r,m) IS NOT TRUE OR NOT private.team_user_active(j.user_id,j.office_id) OR NOT private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','documents.read','documents.update','requests.read','customers.read'] OR NOT EXISTS(SELECT FROM auth.sessions WHERE id=j.session_id AND user_id=j.user_id AND(not_after IS NULL OR not_after>clock_timestamp())) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT EXISTS(SELECT FROM auth.users WHERE id=j.user_id AND email_confirmed_at IS NOT NULL AND NOT is_anonymous AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<clock_timestamp())) OR NOT private.wf_sources_allowed(j.office_id,d.id,j.user_id,private.team_permissions_for_member(m.id)) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 3145728 OR p_renderer IS DISTINCT FROM 'jn-document-v1' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF j.completed_at IS NOT NULL AND(j.sha256<>p_sha256 OR j.size_bytes<>p_size_bytes OR j.renderer<>p_renderer) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF j.completed_at IS NULL THEN UPDATE private.document_artifact_jobs SET sha256=p_sha256,size_bytes=p_size_bytes,renderer=p_renderer,completed_at=clock_timestamp() WHERE id=j.id;END IF;
 RETURN jsonb_build_object('publication_id',p.id,'ready',true,'sha256',p_sha256,'size_bytes',p_size_bytes);
END$$;
CREATE FUNCTION private.document_artifact_authorize(p_office_id uuid,p_publication_id uuid,p_receipt boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;d public.documents;r public.requests;j private.document_artifact_jobs;
BEGIN
 m:=private.requests_actor(p_office_id);SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR SHARE;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=d.id FOR SHARE;
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN
 IF private.wf_recipient(r,m) IS NOT TRUE OR cardinality(private.wf_gate(p,m))>0 THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF d.revision<>p.revision OR r.status='cancelado' THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 SELECT * INTO j FROM private.document_artifact_jobs WHERE office_id=p_office_id AND publication_id=p.id AND completed_at IS NOT NULL;
 IF j.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 IF p_receipt IS TRUE THEN INSERT INTO private.document_publication_events(office_id,publication_id,kind,actor_id,reason)VALUES(p_office_id,p.id,'download',m.user_id,'Acesso autenticado ao arquivo canônico');END IF;
 RETURN jsonb_build_object('publication_id',p.id,'object_path',j.object_path,'bucket','jn-document-artifacts','sha256',j.sha256,'size_bytes',j.size_bytes,'filename',p.protocol||'.pdf');
END$$;
DO $m$DECLARE name text;args text;BEGIN
 FOR name,args IN SELECT * FROM(VALUES
 ('document_workflow_state','p_office_id uuid,p_document_id uuid'),
 ('document_workflow_command','p_office_id uuid,p_document_id uuid,p_command jsonb,p_idempotency_key uuid'),
 ('document_cash_queue','p_office_id uuid,p_page integer'),
 ('document_cash_claim','p_office_id uuid,p_publication_id uuid,p_idempotency_key uuid'),
 ('portal_documents_page','p_office_id uuid,p_page integer'),
 ('document_artifact_begin','p_office_id uuid,p_publication_id uuid'),
 ('document_artifact_authorize','p_office_id uuid,p_publication_id uuid,p_receipt boolean'))v(n,a) LOOP
 EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.%I(%s);$f$',name,args,name,(SELECT string_agg(split_part(btrim(x), ' ',1),',') FROM unnest(string_to_array(args,','))x));
 EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s),private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',name,args,name,args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s),private.%I(%s) TO authenticated',name,args,name,args);
 END LOOP;
END$m$;
CREATE FUNCTION public.document_artifact_complete(p_job_id uuid,p_lease_token uuid,p_sha256 text,p_size_bytes bigint,p_renderer text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_artifact_complete(p_job_id,p_lease_token,p_sha256,p_size_bytes,p_renderer);$$;
REVOKE ALL ON FUNCTION public.document_artifact_complete(uuid,uuid,text,bigint,text),private.document_artifact_complete(uuid,uuid,text,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.document_artifact_complete(uuid,uuid,text,bigint,text),private.document_artifact_complete(uuid,uuid,text,bigint,text) TO service_role;
DO $m$DECLARE n text;f record;BEGIN
 FOREACH n IN ARRAY ARRAY['document_publications','document_publication_events','document_artifact_jobs','document_cash_tasks','document_workflow_commands'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',n);
 END LOOP;
 FOR f IN SELECT oid::regprocedure p FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('wf_immutable','wf_approved','wf_signed','wf_recipient','wf_gate','wf_sources_allowed','document_cash_can_work','document_cash_in_scope') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.p);END LOOP;
END$m$;
DO $$BEGIN IF EXISTS(SELECT FROM storage.buckets WHERE id='jn-document-artifacts' AND(public OR file_size_limit IS DISTINCT FROM 3145728 OR allowed_mime_types IS DISTINCT FROM ARRAY['application/pdf']))THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;END$$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)VALUES('jn-document-artifacts','jn-document-artifacts',false,3145728,ARRAY['application/pdf'])ON CONFLICT DO NOTHING;
NOTIFY pgrst,'reload schema';
