-- Publication-scoped, append-only human formalization; attachment11 owns bytes/scanning.
INSERT INTO public.permissions(code,name) VALUES('documents.signatures.manage','Gerir formalização documental'),('documents.signatures.validate','Conferir assinatura documental') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',x FROM unnest(ARRAY['documents.signatures.manage','documents.signatures.validate'])x ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;s text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%documents.review%' LOOP
 s:=replace(r.def,'''documents.review''::text','''documents.review''::text,''documents.signatures.manage''::text,''documents.signatures.validate''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,s);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP s:=replace(pg_get_functiondef(r.oid),'''documents.review''','''documents.review'',''documents.signatures.manage'',''documents.signatures.validate''');EXECUTE s;END LOOP;
END$m$;
CREATE TABLE private.document_signature_events24(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,publication_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 kind text NOT NULL CHECK(kind IN('configure','import','validate','physical','revoke','exit')),reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
 state jsonb NOT NULL,file_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX signature_events24_pub_idx ON private.document_signature_events24(office_id,publication_id,created_at DESC,id DESC);
CREATE INDEX signature_events24_actor_idx ON private.document_signature_events24(actor_id);
CREATE INDEX signature_events24_file_idx ON private.document_signature_events24(office_id,file_id);
CREATE TABLE private.document_signature_commands24(
 office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,digest text NOT NULL,publication_id uuid NOT NULL,
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,publication_id) REFERENCES private.document_publications(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX signature_commands24_actor_idx ON private.document_signature_commands24(actor_id);
CREATE INDEX signature_commands24_pub_idx ON private.document_signature_commands24(office_id,publication_id);
CREATE TRIGGER signature_events24_immutable BEFORE UPDATE OR DELETE ON private.document_signature_events24 FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE TRIGGER signature_commands24_immutable BEFORE UPDATE OR DELETE ON private.document_signature_commands24 FOR EACH ROW EXECUTE FUNCTION private.wf_immutable();
CREATE FUNCTION private.signature_snapshot24(p private.document_publications) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT state FROM private.document_signature_events24 WHERE office_id=p.office_id AND publication_id=p.id AND kind<>'exit' ORDER BY created_at DESC,id DESC LIMIT 1),jsonb_build_object('mode',p.signature_policy,'exit_policy','after_settlement','expected_signers','[]'::jsonb,'verified_signers','[]'::jsonb,'status',CASE WHEN p.signature_policy='none' THEN 'not_required' WHEN p.signature_policy='physical' AND EXISTS(SELECT FROM private.document_publication_events WHERE office_id=p.office_id AND publication_id=p.id AND kind='signature') THEN 'validated' ELSE 'pending' END,'file_id',NULL,'evidence',NULL,'signed_on',NULL,'custody',NULL,'notary_reference',NULL));
$$;
CREATE FUNCTION private.signature_file_ready24(f public.files) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT f.id IS NOT NULL AND f.status='disponivel' AND f.scanner_status='clean' AND f.mime_type='application/pdf' AND f.size_bytes<=3145728 AND f.actual_sha256=f.sha256 AND f.actual_size_bytes=f.size_bytes AND f.actual_mime_type=f.mime_type AND f.validated_at IS NOT NULL AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE office_id=f.office_id AND file_id=f.id);
$$;
CREATE OR REPLACE FUNCTION private.wf_signed(p private.document_publications) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN s->>'mode'='none' THEN s->>'status'='not_required' AND p.signature_policy='none' AND NOT EXISTS(SELECT FROM public.documents d JOIN public.request_items ri ON ri.office_id=d.office_id AND ri.id=d.request_item_id WHERE d.office_id=p.office_id AND d.id=p.document_id AND coalesce((ri.snapshot#>>'{definition,signature_required}')::boolean,false)) WHEN s->>'status'<>'validated' THEN false WHEN s->>'mode'='physical' THEN true ELSE EXISTS(SELECT FROM public.files f WHERE f.office_id=p.office_id AND f.id=(s->>'file_id')::uuid AND private.signature_file_ready24(f) AND f.sha256=s->>'sha256' AND f.size_bytes=(s->>'size_bytes')::bigint) END FROM(SELECT private.signature_snapshot24(p)s)x;
$$;
CREATE FUNCTION private.signature_exit_blockers24(p private.document_publications) RETURNS text[] LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT ARRAY(SELECT x FROM unnest(private.wf_gate(p))x WHERE x NOT IN('signature','handoff') AND(x<>'payment' OR private.signature_snapshot24(p)->>'exit_policy'='after_settlement')) || CASE WHEN private.signature_snapshot24(p)->>'mode'='none' OR jsonb_array_length(private.signature_snapshot24(p)->'expected_signers')=0 THEN ARRAY['signature_setup'] ELSE ARRAY[]::text[] END;
$$;
CREATE FUNCTION private.signature_history24(p private.document_publications) RETURNS TABLE(id uuid,kind text,actor_id uuid,created_at timestamptz,reason text) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT e.id,e.kind,e.actor_id,e.created_at,e.reason FROM private.document_signature_events24 e WHERE e.office_id=p.office_id AND e.publication_id=p.id
 UNION ALL SELECT e.id,'physical_legacy',e.actor_id,e.created_at,e.reason FROM private.document_publication_events e WHERE e.office_id=p.office_id AND e.publication_id=p.id AND e.kind='signature';
$$;
CREATE FUNCTION private.document_signature_state(p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;m public.memberships;s jsonb;f public.files;lastid uuid;items jsonb;total bigint;work boolean;caps text[];b text[];BEGIN
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 s:=private.signature_snapshot24(p);SELECT * INTO f FROM public.files WHERE office_id=p.office_id AND id=(s->>'file_id')::uuid;
 SELECT id INTO lastid FROM private.document_signature_events24 WHERE office_id=p.office_id AND publication_id=p.id AND kind<>'exit' ORDER BY created_at DESC,id DESC LIMIT 1;
 SELECT count(*) INTO total FROM private.signature_history24(p);
 SELECT coalesce(jsonb_agg(v ORDER BY created_at DESC,id DESC),'[]') INTO items FROM(SELECT e.id,e.kind,coalesce(private.customer_relation_display_label(pr.display_name),'Integrante da equipe') actor_name,e.created_at,e.reason FROM private.signature_history24(p) e JOIN public.profiles pr ON pr.id=e.actor_id ORDER BY e.created_at DESC,e.id DESC LIMIT 5 OFFSET(p_page-1)*5)v;
 caps:=private.current_permissions(p_office_id);work:=d.revision=p.revision AND EXISTS(SELECT FROM public.requests r WHERE r.office_id=d.office_id AND r.id=d.request_id AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m));b:=private.signature_exit_blockers24(p);
 RETURN jsonb_build_object('publication_id',p.id,'document_id',d.id,'request_id',d.request_id,'revision',p.revision,'mode',s->>'mode','exit_policy',s->>'exit_policy','expected_signers',s->'expected_signers','verified_signers',s->'verified_signers','status',s->>'status','last_event_id',lastid,'can_manage',work AND caps @> ARRAY['documents.signatures.manage'],'can_validate',work AND caps @> ARRAY['documents.signatures.validate'],'can_exit',work AND caps @> ARRAY['documents.signatures.manage'] AND cardinality(b)=0,'exit_blockers',to_jsonb(b),'file',CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('id',f.id,'name',f.name,'sha256',f.sha256,'size_bytes',f.size_bytes,'status',f.status,'scanner_status',f.scanner_status) END,'evidence',s->'evidence','signed_on',s->'signed_on','custody',s->'custody','notary_reference',s->'notary_reference','history',items,'history_total',total,'page',p_page,'page_size',5);
END$$;
CREATE FUNCTION private.document_signature_command(p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;m public.memberships;s jsonb;k text;why text;h text;old private.document_signature_commands24;lastid uuid;f public.files;signers jsonb;action text;extra jsonb;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 m:=private.documents_access21(p_office_id,d.request_id,NULL,d.id);
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=d.id FOR UPDATE;
 k:=p_command->>'kind';action:=CASE WHEN k='validate' THEN 'documents.signatures.validate' ELSE 'documents.signatures.manage' END;
 m:=private.documents_access21(p_office_id,d.request_id,action,d.id);
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR NOT p_command ?& ARRAY['kind','reason','expected_revision','expected_event_id'] OR k NOT IN('configure','import','validate','physical','revoke') OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision'!~'^[1-9][0-9]{0,9}$' OR jsonb_typeof(p_command->'expected_event_id') NOT IN('string','null') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN IF p_command->>'expected_event_id' IS NOT NULL THEN PERFORM (p_command->>'expected_event_id')::uuid;END IF;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
 IF NOT (p_command ?& (CASE k WHEN 'configure' THEN ARRAY['mode','exit_policy','expected_signers'] WHEN 'import' THEN ARRAY['file_id'] WHEN 'validate' THEN ARRAY['result','verified_signers','evidence','sha256'] WHEN 'physical' THEN ARRAY['verified_signers','evidence','signed_on','custody','notary_reference'] ELSE ARRAY[]::text[] END)) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 why:=btrim(p_command->>'reason');IF char_length(why) NOT BETWEEN 1 AND 500 OR NOT private.templates_has_text20(why) OR why~'[[:cntrl:]]' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 extra:=p_command-'kind'-'reason'-'expected_revision'-'expected_event_id';
 IF (CASE k WHEN 'configure' THEN extra-'mode'-'exit_policy'-'expected_signers' WHEN 'import' THEN extra-'file_id' WHEN 'validate' THEN extra-'result'-'verified_signers'-'evidence'-'sha256' WHEN 'physical' THEN extra-'verified_signers'-'evidence'-'signed_on'-'custody'-'notary_reference' ELSE extra END) <>'{}' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 h:=encode(extensions.digest(jsonb_build_object('publication',p.id,'command',p_command)::text,'sha256'),'hex');SELECT * INTO old FROM private.document_signature_commands24 WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF old.publication_id IS NOT NULL THEN IF old.digest<>h THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.document_signature_state(p_office_id,p.id,1);END IF;
 SELECT id INTO lastid FROM private.document_signature_events24 WHERE office_id=p.office_id AND publication_id=p.id AND kind<>'exit' ORDER BY created_at DESC,id DESC LIMIT 1;
 IF d.revision<>p.revision OR d.revision::numeric<>(p_command->>'expected_revision')::numeric OR lastid::text IS DISTINCT FROM lower(p_command->>'expected_event_id') THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF NOT private.wf_approved(p) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 s:=private.signature_snapshot24(p);
 IF k IN('import','validate') AND NOT private.current_permissions(p_office_id) @> ARRAY['files.read'] THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF k='configure' THEN
 IF EXISTS(SELECT FROM private.document_signature_events24 WHERE office_id=p_office_id AND publication_id=p.id AND kind<>'configure') OR(p.signature_policy<>'none' AND p_command->>'mode' IS DISTINCT FROM p.signature_policy) OR(s->>'mode'<>'none' AND p_command->>'mode' IS DISTINCT FROM s->>'mode') THEN RAISE EXCEPTION 'DOCUMENT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_command->>'mode' IS NULL OR p_command->>'mode' NOT IN('none','physical','external') OR p_command->>'exit_policy' IS NULL OR p_command->>'exit_policy' NOT IN('after_settlement','before_settlement') THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_command->>'mode'='none' AND(p.signature_policy<>'none' OR EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND id=d.request_item_id AND coalesce((snapshot#>>'{definition,signature_required}')::boolean,false))) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 signers:=p_command->'expected_signers';s:=jsonb_build_object('mode',p_command->>'mode','exit_policy',p_command->>'exit_policy','expected_signers',signers,'verified_signers','[]'::jsonb,'status',CASE WHEN p_command->>'mode'='none' THEN 'not_required' ELSE 'pending' END,'file_id',NULL,'evidence',NULL,'signed_on',NULL,'custody',NULL,'notary_reference',NULL);
 ELSIF k='import' THEN
 IF jsonb_array_length(s->'expected_signers')=0 THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 IF s->>'mode'<>'external' OR jsonb_typeof(p_command->'file_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=(p_command->>'file_id')::uuid FOR UPDATE;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
 IF f.id IS NULL OR f.request_id<>d.request_id OR f.mime_type<>'application/pdf' OR f.size_bytes>3145728 OR f.status NOT IN('quarentena','disponivel') OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE office_id=f.office_id AND file_id=f.id) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(p_office_id,f.id,'document_signature24');s:=s||jsonb_build_object('file_id',f.id,'sha256',f.sha256,'size_bytes',f.size_bytes,'status','in_validation','verified_signers','[]'::jsonb,'evidence',NULL);
 ELSIF k IN('validate','physical') THEN
 IF jsonb_array_length(s->'expected_signers')=0 THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 IF(k='validate' AND s->>'mode'<>'external') OR(k='physical' AND s->>'mode'<>'physical') OR jsonb_typeof(p_command->'evidence') IS DISTINCT FROM 'string' OR char_length(btrim(p_command->>'evidence')) NOT BETWEEN 5 AND 2000 OR NOT private.templates_has_text20(p_command->>'evidence') OR (p_command->>'evidence')~'[[:cntrl:]]' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 signers:=p_command->'verified_signers';
 IF k='validate' THEN
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=(s->>'file_id')::uuid FOR UPDATE;
 IF NOT coalesce(private.signature_file_ready24(f),false) OR f.request_id<>d.request_id OR p_command->>'sha256' IS DISTINCT FROM f.sha256 OR f.sha256 IS DISTINCT FROM s->>'sha256' OR p_command->>'result' IS NULL OR p_command->>'result' NOT IN('validated','invalid') THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 ELSE
 IF jsonb_typeof(p_command->'custody') IS DISTINCT FROM 'string' OR char_length(btrim(p_command->>'custody')) NOT BETWEEN 1 AND 500 OR jsonb_typeof(p_command->'notary_reference') IS DISTINCT FROM 'string' OR char_length(p_command->>'notary_reference')>500 OR (p_command->>'notary_reference')~'[[:cntrl:]]' OR (p_command->>'custody')~'[[:cntrl:]]' OR p_command->>'signed_on' IS NULL OR NOT private.templates_has_text20(p_command->>'custody') OR p_command->>'signed_on'!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN IF (p_command->>'signed_on')::date>current_date THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END;
 s:=s||jsonb_build_object('signed_on',p_command->>'signed_on','custody',p_command->>'custody','notary_reference',p_command->>'notary_reference');END IF;
 IF NOT coalesce((s->'expected_signers') @> signers,false) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 IF(k='physical' OR p_command->>'result'='validated') AND NOT coalesce(signers @> (s->'expected_signers'),false) THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 s:=s||jsonb_build_object('status',CASE WHEN k='physical' THEN 'validated' ELSE p_command->>'result' END,'verified_signers',signers,'evidence',p_command->>'evidence');
 ELSE s:=s||jsonb_build_object('status','invalid');END IF;
 IF k IN('configure','validate','physical') THEN
 IF jsonb_typeof(signers) IS DISTINCT FROM 'array' OR jsonb_array_length(signers)>20 OR((k='physical' OR(k='validate' AND p_command->>'result'='validated') OR(k='configure' AND s->>'mode'<>'none')) AND jsonb_array_length(signers)=0) OR(k='configure' AND s->>'mode'='none' AND jsonb_array_length(signers)<>0) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(signers)x WHERE jsonb_typeof(x)<>'string' OR char_length(btrim(x#>>'{}')) NOT BETWEEN 1 AND 120 OR (x#>>'{}')~'[[:cntrl:]]' OR (x#>>'{}')<>btrim(x#>>'{}')) OR(SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(signers)x) THEN RAISE EXCEPTION 'DOCUMENTS_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 m:=private.documents_access21(p_office_id,d.request_id,action,d.id);
 IF k IN('import','validate') AND NOT private.current_permissions(p_office_id) @> ARRAY['files.read'] THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.document_signature_events24(office_id,publication_id,actor_id,kind,reason,state,file_id)VALUES(p_office_id,p.id,m.user_id,k,why,s,(s->>'file_id')::uuid);
 INSERT INTO private.document_signature_commands24 VALUES(p_office_id,m.user_id,p_idempotency_key,h,p.id);
 RETURN private.document_signature_state(p_office_id,p.id,1);
END$$;
-- Signature output is base PDF only; it does not assert delivery or bypass final settlement.
CREATE FUNCTION private.document_signature_authorize(p_office_id uuid,p_publication_id uuid,p_receipt boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p private.document_publications;d public.documents;m public.memberships;j private.document_artifact_jobs;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;PERFORM 1 FROM public.documents WHERE office_id=p_office_id AND id=d.id FOR UPDATE;
 m:=private.documents_access21(p_office_id,d.request_id,'documents.signatures.manage',d.id);
 IF cardinality(private.signature_exit_blockers24(p))<>0 THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 SELECT * INTO j FROM private.document_artifact_jobs WHERE office_id=p_office_id AND publication_id=p.id AND completed_at IS NOT NULL;
 IF j.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 IF p_receipt IS TRUE THEN INSERT INTO private.document_signature_events24(office_id,publication_id,actor_id,kind,reason,state)VALUES(p_office_id,p.id,m.user_id,'exit','Saída autenticada do PDF base para assinatura',private.signature_snapshot24(p));END IF;
 RETURN jsonb_build_object('publication_id',p.id,'bucket','jn-document-artifacts','object_path',j.object_path,'sha256',j.sha256,'size_bytes',j.size_bytes,'filename',p.protocol||'.pdf');
END$$;
CREATE OR REPLACE FUNCTION private.document_artifact_authorize(p_office_id uuid,p_publication_id uuid,p_receipt boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;p private.document_publications;d public.documents;r public.requests;j private.document_artifact_jobs;s jsonb;f public.files;i private.upload_intents;result jsonb;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 m:=private.requests_actor(p_office_id);SELECT * INTO p FROM private.document_publications WHERE office_id=p_office_id AND id=p_publication_id;IF p.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=p.document_id;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=d.request_id FOR UPDATE;SELECT * INTO d FROM public.documents WHERE office_id=p_office_id AND id=d.id FOR UPDATE;
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN IF private.wf_recipient(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;ELSE PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);END IF;
 s:=private.signature_snapshot24(p);
 IF s->>'mode'='external' THEN
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=(s->>'file_id')::uuid FOR UPDATE;
 IF NOT coalesce(private.signature_file_ready24(f),false) OR f.request_id<>d.request_id OR f.sha256 IS DISTINCT FROM s->>'sha256' OR f.size_bytes IS DISTINCT FROM (s->>'size_bytes')::bigint THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND file_id=f.id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 result:=jsonb_build_object('publication_id',p.id,'file_id',f.id,'bucket','request-attachments','object_path',i.object_path,'sha256',f.sha256,'size_bytes',f.size_bytes,'filename',p.protocol||'.pdf');
 ELSE SELECT * INTO j FROM private.document_artifact_jobs WHERE office_id=p_office_id AND publication_id=p.id AND completed_at IS NOT NULL;
 IF j.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_INCOMPLETE' USING ERRCODE='PT422';END IF;
 result:=jsonb_build_object('publication_id',p.id,'bucket','jn-document-artifacts','object_path',j.object_path,'sha256',j.sha256,'size_bytes',j.size_bytes,'filename',p.protocol||'.pdf');END IF;
 -- Recheck after every file lock/wait. Office lock serializes financial and authority commands.
 m:=private.requests_actor(p_office_id);IF m.role_code<>'client' THEN PERFORM private.documents_access21(p_office_id,d.request_id,NULL,d.id);END IF;
 IF cardinality(private.wf_gate(p,CASE WHEN m.role_code='client' THEN m ELSE NULL END))>0 THEN RAISE EXCEPTION 'DOCUMENTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_receipt IS TRUE THEN INSERT INTO private.document_publication_events(office_id,publication_id,kind,actor_id,reason)VALUES(p_office_id,p.id,'download',m.user_id,'Acesso autenticado ao arquivo final autorizado');END IF;
 RETURN result;
END$$;
-- Retain historical physical events; new simplified records are forbidden. Handoff is financial only.
DO $m$ DECLARE s text;BEGIN
 SELECT pg_get_functiondef('private.document_workflow_command(uuid,uuid,jsonb,uuid)'::regprocedure) INTO s;
 s:=replace(s,'ELSIF k=''signature'' THEN','ELSIF k=''signature'' THEN RAISE EXCEPTION ''DOCUMENTS_VALIDATION'' USING ERRCODE=''PT422'';');
 s:=replace(s,'NOT private.wf_approved(p) OR NOT private.wf_signed(p) OR p.demonstration','NOT private.wf_approved(p) OR p.demonstration');EXECUTE s;
END$m$;
DO $m$ DECLARE n text;a text;r record;BEGIN
 FOR n,a IN SELECT * FROM(VALUES('document_signature_state','p_office_id uuid,p_publication_id uuid,p_page integer DEFAULT 1'),('document_signature_command','p_office_id uuid,p_publication_id uuid,p_command jsonb,p_idempotency_key uuid'),('document_signature_authorize','p_office_id uuid,p_publication_id uuid,p_receipt boolean'))v(n,a) LOOP
 EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.%I(%s);$f$',n,a,n,CASE n WHEN 'document_signature_state' THEN 'p_office_id,p_publication_id,p_page' WHEN 'document_signature_command' THEN 'p_office_id,p_publication_id,p_command,p_idempotency_key' ELSE 'p_office_id,p_publication_id,p_receipt' END);END LOOP;
 FOR r IN SELECT oid::regprocedure p,proname FROM pg_proc WHERE pronamespace IN('private'::regnamespace,'public'::regnamespace) AND proname IN('signature_snapshot24','signature_history24','signature_file_ready24','signature_exit_blockers24','document_signature_state','document_signature_command','document_signature_authorize') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.p);IF r.proname LIKE 'document_signature_%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',r.p);END IF;END LOOP;
 FOREACH n IN ARRAY ARRAY['document_signature_events24','document_signature_commands24'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;
END$m$;
NOTIFY pgrst,'reload schema';
