-- Etapa 22: immutable revision snapshots; reuse the existing editorial decisions.
CREATE TABLE private.document_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,document_id uuid NOT NULL,revision integer NOT NULL,
 template_id uuid NOT NULL,template_version_id uuid NOT NULL,author_id uuid NOT NULL REFERENCES auth.users(id),author_name text NOT NULL,
 title text NOT NULL,protocol text NOT NULL,snapshot jsonb NOT NULL,content text NOT NULL CHECK(char_length(content)<=50000),
 content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'),snapshot_sha256 text NOT NULL CHECK(snapshot_sha256~'^[a-f0-9]{64}$'),created_at timestamptz NOT NULL,
 UNIQUE(office_id,id),UNIQUE(office_id,document_id,revision),
 FOREIGN KEY(office_id,document_id,revision) REFERENCES private.document_revisions(office_id,document_id,revision) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,template_id,template_version_id) REFERENCES public.template_versions(office_id,template_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_versions_author_idx ON private.document_versions(author_id);
CREATE INDEX document_versions_template_idx ON private.document_versions(office_id,template_id,template_version_id);
CREATE TRIGGER document_versions_immutable BEFORE UPDATE OR DELETE ON private.document_versions FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE FUNCTION private.document_version_capture(o uuid,doc uuid,rev integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;r private.document_revisions;t public.template_versions;parties jsonb;resolved jsonb;snap jsonb;
BEGIN
 SELECT * INTO d FROM public.documents WHERE office_id=o AND id=doc;
 SELECT * INTO r FROM private.document_revisions WHERE office_id=o AND document_id=doc AND revision=rev;
 SELECT * INTO t FROM public.template_versions WHERE office_id=o AND id=d.template_version_id;
 SELECT coalesce(jsonb_agg(snapshot ORDER BY position),'[]') INTO parties FROM public.document_participants WHERE office_id=o AND document_id=doc AND revision=rev;
 resolved:=private.documents_resolve21(t.definition,r.input,r.source,parties);
 snap:=jsonb_build_object('input',r.input,'source',r.source,'participants',parties,'template',jsonb_build_object('id',t.template_id,'version_id',t.id,'number',t.number,'definition',t.definition),'resolved',resolved);
 INSERT INTO private.document_versions(office_id,document_id,revision,template_id,template_version_id,author_id,author_name,title,protocol,snapshot,content,content_sha256,snapshot_sha256,created_at)
 VALUES(o,doc,rev,d.template_id,t.id,r.author_id,r.author_name,d.title,d.protocol,snap,resolved->>'rendered_content',encode(extensions.digest(resolved->>'rendered_content','sha256'),'hex'),encode(extensions.digest(snap::text,'sha256'),'hex'),r.created_at) ON CONFLICT(office_id,document_id,revision) DO NOTHING;
END$$;
CREATE FUNCTION private.document_version_capture_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM private.document_version_capture(NEW.office_id,NEW.document_id,NEW.revision);RETURN NULL;END$$;
-- Participants are inserted after their revision. Capture the complete transaction.
CREATE CONSTRAINT TRIGGER document_version_capture AFTER INSERT ON private.document_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.document_version_capture_trigger();
DO $$DECLARE r record;BEGIN FOR r IN SELECT office_id,document_id,revision FROM private.document_revisions ORDER BY office_id,document_id,revision LOOP PERFORM private.document_version_capture(r.office_id,r.document_id,r.revision);END LOOP;END$$;
CREATE TABLE private.document_version_files(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,version_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,
 lease_token uuid NOT NULL DEFAULT gen_random_uuid(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '2 minutes',object_path text NOT NULL UNIQUE,
 sha256 text CHECK(sha256~'^[a-f0-9]{64}$'),size_bytes bigint CHECK(size_bytes BETWEEN 1 AND 3145728),completed_at timestamptz,
 UNIQUE(office_id,version_id),FOREIGN KEY(office_id,version_id) REFERENCES private.document_versions(office_id,id) ON DELETE RESTRICT,
 CHECK((completed_at IS NULL AND sha256 IS NULL AND size_bytes IS NULL) OR(completed_at IS NOT NULL AND sha256 IS NOT NULL AND size_bytes IS NOT NULL))
);
CREATE INDEX document_version_files_user_idx ON private.document_version_files(user_id);
CREATE TABLE private.document_version_accesses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,version_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,version_id) REFERENCES private.document_versions(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX document_version_accesses_version_idx ON private.document_version_accesses(office_id,version_id);
CREATE INDEX document_version_accesses_actor_idx ON private.document_version_accesses(actor_id);
CREATE TRIGGER document_version_accesses_immutable BEFORE UPDATE OR DELETE ON private.document_version_accesses FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE FUNCTION private.document_versions_page(p_office_id uuid,p_document_id uuid,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.documents;items jsonb;total integer;
BEGIN
 PERFORM private.documents_access21(p_office_id);
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p_document_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT count(*) INTO total FROM private.document_versions WHERE office_id=p_office_id AND document_id=d.id;
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.revision DESC),'[]') INTO items FROM(
 SELECT v.revision,jsonb_build_object('id',v.id,'revision',v.revision,'current',v.revision=d.revision,'author_name',v.author_name,'created_at',v.created_at,'template_version_id',v.template_version_id,'template_number',(v.snapshot#>>'{template,number}')::integer,
 'content_sha256',v.content_sha256,'snapshot_sha256',v.snapshot_sha256,'pdf_sha256',f.sha256,'size_bytes',f.size_bytes,
 'status',CASE WHEN v.revision<>d.revision THEN 'superseded' WHEN e.kind='reject' THEN 'rejected' WHEN p.id IS NOT NULL AND private.wf_approved(p) THEN 'approved' WHEN p.id IS NOT NULL THEN 'in_review' ELSE 'draft' END,'last_decision',e.kind,
 'decision_reason',e.reason,'decision_at',e.created_at) value
 FROM private.document_versions v LEFT JOIN private.document_publications p ON p.office_id=v.office_id AND p.document_id=v.document_id AND p.revision=v.revision
 LEFT JOIN private.document_version_files f ON f.office_id=v.office_id AND f.version_id=v.id AND f.completed_at IS NOT NULL
 LEFT JOIN LATERAL(SELECT kind,reason,created_at FROM private.document_publication_events WHERE office_id=v.office_id AND publication_id=p.id AND kind IN('approve','reject') ORDER BY created_at DESC,id DESC LIMIT 1)e ON true
 WHERE v.office_id=p_office_id AND v.document_id=d.id ORDER BY v.revision DESC LIMIT 5 OFFSET(p_page-1)*5)x;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('items',items,'total',total,'page',p_page,'page_size',5,'current_revision',d.revision);
END$$;
CREATE FUNCTION private.document_version_begin(p_office_id uuid,p_version_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v private.document_versions;d public.documents;m public.memberships;j private.document_version_files;
BEGIN
 -- Serialize lease changes in the same office-before-request order as documents21.
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 PERFORM private.documents_access21(p_office_id);
 SELECT * INTO v FROM private.document_versions WHERE office_id=p_office_id AND id=p_version_id;
 IF v.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=v.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 INSERT INTO private.document_version_files(office_id,version_id,user_id,session_id,object_path) VALUES(p_office_id,v.id,m.user_id,(auth.jwt()->>'session_id')::uuid,p_office_id::text||'/'||v.id::text||'/'||gen_random_uuid()::text) ON CONFLICT DO NOTHING;
 SELECT * INTO j FROM private.document_version_files WHERE office_id=p_office_id AND version_id=v.id FOR UPDATE;
 IF j.completed_at IS NULL THEN
 IF j.expires_at>clock_timestamp() AND(j.user_id<>m.user_id OR j.session_id<>(auth.jwt()->>'session_id')::uuid) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.document_version_files SET user_id=m.user_id,session_id=(auth.jwt()->>'session_id')::uuid,expires_at=clock_timestamp()+interval '2 minutes',lease_token=CASE WHEN expires_at<clock_timestamp() THEN gen_random_uuid() ELSE lease_token END WHERE id=j.id RETURNING * INTO j;
 END IF;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('job_id',j.id,'lease_token',j.lease_token,'version_id',v.id,'office_id',v.office_id,'revision',v.revision,'title',v.title,'protocol',v.protocol,'content',v.content,'content_sha256',v.content_sha256,'created_at',v.created_at,'completed',j.completed_at IS NOT NULL,'bucket','jn-document-artifacts','object_path',j.object_path);
END$$;
-- Worker scope uses the identity recorded by the authenticated begin, never the service JWT.
CREATE FUNCTION private.document_version_scope22(r public.requests,m public.memberships,caps text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.office_id=m.office_id AND m.active AND m.role_code<>'client' AND CASE WHEN r.category='account_correction' THEN caps @> ARRAY['requests.read','accounts.corrections.read'] ELSE r.created_by=m.user_id OR r.assignee_id=m.id OR caps @> ARRAY['requests.read_all'] OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END;
$$;
CREATE FUNCTION private.document_version_sources22(o uuid,doc uuid,m public.memberships,caps text[]) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cid uuid;c public.customers;
BEGIN
 FOR cid IN SELECT DISTINCT x FROM(SELECT r.customer_id x FROM public.requests r JOIN public.documents d ON d.office_id=r.office_id AND d.request_id=r.id WHERE d.office_id=o AND d.id=doc UNION ALL SELECT customer_id FROM public.document_participants WHERE office_id=o AND document_id=doc UNION ALL SELECT source_customer_id FROM private.document_revisions WHERE office_id=o AND document_id=doc)z WHERE x IS NOT NULL ORDER BY x LOOP
 SELECT * INTO c FROM public.customers WHERE office_id=o AND id=cid FOR SHARE;
 IF c.id IS NULL OR c.blocked_at IS NOT NULL OR NOT coalesce(caps @> ARRAY['customers.read_all'] OR(c.merged_into_id IS NULL AND(c.created_by=m.user_id OR EXISTS(SELECT FROM private.customer_relations rel WHERE rel.office_id=o AND rel.customer_id=c.id AND rel.membership_id=m.id AND rel.relation_type='assignment' AND rel.revoked_at IS NULL AND rel.valid_from<=clock_timestamp() AND(rel.valid_until IS NULL OR rel.valid_until>clock_timestamp())))),false) THEN RETURN false;END IF;
 END LOOP;RETURN true;
END$$;
CREATE FUNCTION private.document_version_complete(p_job_id uuid,p_lease_token uuid,p_sha256 text,p_size_bytes bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.document_version_files;v private.document_versions;d public.documents;r public.requests;m public.memberships;caps text[];
BEGIN
 SELECT * INTO j FROM private.document_version_files WHERE id=p_job_id;
 IF j.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM 1 FROM public.offices WHERE id=j.office_id FOR NO KEY UPDATE;
 SELECT * INTO v FROM private.document_versions WHERE office_id=j.office_id AND id=j.version_id;
 SELECT * INTO d FROM public.documents WHERE office_id=j.office_id AND id=v.document_id;
 SELECT * INTO r FROM public.requests WHERE office_id=j.office_id AND id=d.request_id FOR SHARE;
 SELECT * INTO j FROM private.document_version_files WHERE id=p_job_id FOR UPDATE;
 SELECT * INTO m FROM public.memberships WHERE office_id=j.office_id AND user_id=j.user_id AND active AND role_code<>'client';
 caps:=private.team_permissions_for_member(m.id);
 IF j.lease_token IS DISTINCT FROM p_lease_token OR j.expires_at<clock_timestamp() OR m.id IS NULL OR NOT private.team_user_active(j.user_id,j.office_id) OR NOT coalesce(caps @> ARRAY['foundation.access','documents.read','requests.read','customers.read'],false) OR private.document_version_scope22(r,m,caps) IS NOT TRUE OR NOT EXISTS(SELECT FROM auth.sessions WHERE id=j.session_id AND user_id=j.user_id AND(not_after IS NULL OR not_after>clock_timestamp())) OR NOT EXISTS(SELECT FROM auth.users WHERE id=j.user_id AND email_confirmed_at IS NOT NULL AND NOT is_anonymous AND deleted_at IS NULL AND(banned_until IS NULL OR banned_until<clock_timestamp())) OR NOT private.document_version_sources22(j.office_id,d.id,m,caps) THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 3145728 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF j.completed_at IS NOT NULL AND(j.sha256<>p_sha256 OR j.size_bytes<>p_size_bytes) THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF j.completed_at IS NULL THEN UPDATE private.document_version_files SET sha256=p_sha256,size_bytes=p_size_bytes,completed_at=clock_timestamp() WHERE id=j.id;END IF;
 RETURN jsonb_build_object('version_id',v.id,'ready',true);
END$$;
CREATE FUNCTION private.document_version_authorize(p_office_id uuid,p_version_id uuid,p_receipt boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v private.document_versions;d public.documents;j private.document_version_files;m public.memberships;
BEGIN
 PERFORM private.documents_access21(p_office_id);
 SELECT * INTO v FROM private.document_versions WHERE office_id=p_office_id AND id=p_version_id;
 IF v.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=v.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 SELECT * INTO j FROM private.document_version_files WHERE office_id=p_office_id AND version_id=v.id AND completed_at IS NOT NULL;
 IF j.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 IF p_receipt IS TRUE THEN INSERT INTO private.document_version_accesses(office_id,version_id,actor_id) VALUES(p_office_id,v.id,m.user_id);END IF;
 PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 RETURN jsonb_build_object('version_id',v.id,'revision',v.revision,'bucket','jn-document-artifacts','object_path',j.object_path,'sha256',j.sha256,'size_bytes',j.size_bytes,'filename',v.protocol||'-rascunho-v'||v.revision||'.pdf');
END$$;
DO $m$DECLARE n text;a text;BEGIN
 FOR n,a IN SELECT * FROM(VALUES('document_versions_page','p_office_id uuid,p_document_id uuid,p_page integer'),('document_version_begin','p_office_id uuid,p_version_id uuid'),('document_version_authorize','p_office_id uuid,p_version_id uuid,p_receipt boolean DEFAULT false'))x(n,a) LOOP
 EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.%I(%s);$f$',n,a,n,CASE n WHEN 'document_versions_page' THEN 'p_office_id,p_document_id,p_page' WHEN 'document_version_begin' THEN 'p_office_id,p_version_id' ELSE 'p_office_id,p_version_id,p_receipt' END);
 END LOOP;
END$m$;
CREATE FUNCTION public.document_version_complete(p_job_id uuid,p_lease_token uuid,p_sha256 text,p_size_bytes bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.document_version_complete(p_job_id,p_lease_token,p_sha256,p_size_bytes);$$;

CREATE FUNCTION private.document_version_file_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN IF TG_OP='DELETE' OR OLD.completed_at IS NOT NULL THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END$$;
CREATE TRIGGER document_version_file_guard BEFORE UPDATE OR DELETE ON private.document_version_files FOR EACH ROW EXECUTE FUNCTION private.document_version_file_guard();
DO $m$DECLARE t text;f record;BEGIN
 FOREACH t IN ARRAY ARRAY['document_versions','document_version_files','document_version_accesses'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace IN('private'::regnamespace,'public'::regnamespace) AND proname IN('document_version_capture','document_version_capture_trigger','document_versions_page','document_version_begin','document_version_complete','document_version_authorize','document_version_file_guard','document_version_scope22','document_version_sources22') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 IF f.proname IN('document_versions_page','document_version_begin','document_version_authorize') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 IF f.proname='document_version_complete' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);END IF;
 END LOOP;
END$m$;
NOTIFY pgrst,'reload schema';
-- Existing final jobs retain renderer1. New jobs select renderer2 explicitly.
ALTER TABLE private.document_artifact_jobs ADD COLUMN renderer_version text NOT NULL DEFAULT 'jn-document-v1' CHECK(renderer_version IN('jn-document-v1','jn-document-v2'));
ALTER TABLE private.document_artifact_jobs ALTER COLUMN renderer_version SET DEFAULT 'jn-document-v2';
ALTER TABLE private.document_artifact_jobs DROP CONSTRAINT document_artifact_jobs_renderer_check;
ALTER TABLE private.document_artifact_jobs ADD CONSTRAINT document_artifact_jobs_renderer_check CHECK(renderer IN('jn-document-v1','jn-document-v2'));
DO $m$DECLARE s text;BEGIN
 s:=pg_get_functiondef('private.document_artifact_begin(uuid,uuid)'::regprocedure);
 s:=replace(s,'''signature_policy'',p.signature_policy','''signature_policy'',p.signature_policy,''renderer_version'',j.renderer_version');EXECUTE s;
 s:=pg_get_functiondef('private.document_artifact_complete(uuid,uuid,text,bigint,text)'::regprocedure);
 s:=replace(s,'p_renderer IS DISTINCT FROM ''jn-document-v1''','p_renderer IS DISTINCT FROM j.renderer_version');EXECUTE s;
END$m$;
