-- Private, authenticated byte preview and explicit per-file deletion. No scanner release.
CREATE TABLE private.file_deletions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),
 file_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,
 expected_updated_at timestamptz NOT NULL,bucket text,object_path text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT(clock_timestamp()+interval '15 minutes'),completed_at timestamptz,
 UNIQUE(office_id,actor_id,key),UNIQUE(file_id),
 CHECK((completed_at IS NULL AND bucket='request-attachments' AND object_path IS NOT NULL) OR(completed_at IS NOT NULL AND bucket IS NULL AND object_path IS NULL))
);
CREATE INDEX file_deletions_actor_idx ON private.file_deletions(actor_id);
CREATE INDEX file_deletions_office_idx ON private.file_deletions(office_id);
ALTER TABLE private.file_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.file_deletions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.files_own_portal(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.office_id=m.office_id AND r.origin='portal' AND r.created_by=m.user_id AND private.request_in_scope(r,m) IS TRUE;
$$;
CREATE OR REPLACE FUNCTION private.files_request(p_office_id uuid,p_request_id uuid,m public.memberships,p_write boolean DEFAULT false) RETURNS public.requests LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;BEGIN
 r:=private.files_request_before_portal_returns(p_office_id,p_request_id,m,p_write);m:=private.files_actor(p_office_id,p_write);
 IF m.role_code='client' AND private.files_own_portal(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_write AND r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION private.files_requests_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;q text:=lower(btrim(coalesce(p_query,'')));answer jsonb;BEGIN
 m:=private.files_actor(p_office_id);
 IF length(q)>100 OR p_page IS NULL OR p_page<1 OR p_page>10000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m) AND(m.role_code<>'client' OR private.files_own_portal(r,m)) AND(q='' OR q=r.id::text OR strpos(lower(r.title||' '||r.protocol),q)>0)),page AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.protocol||' · '||r.title,'can_work',r.status NOT IN('concluido','cancelado') AND(CASE WHEN m.role_code='client' THEN private.files_own_portal(r,m) ELSE private.request_can_work(r,m) IS TRUE END),'closed',r.status IN('concluido','cancelado'),'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'service_id',i.service_id,'name',private.customer_relation_display_label(i.snapshot->'definition'->>'name'),'policy',private.files_policy_record(i.office_id,i.service_id)) ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb)) ORDER BY r.updated_at DESC,r.id DESC) FROM page r),'[]'::jsonb),'total',(SELECT count(*) FROM candidates),'page',p_page,'page_size',p_size) INTO answer;
 RETURN answer;
END $$;
CREATE FUNCTION private.files_preview_ready(f public.files) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT(f.status='quarentena' AND f.scanner_status IN('not_configured','pending') OR f.status='disponivel' AND f.scanner_status='clean')
 AND f.validated_at IS NOT NULL AND f.validation_reason IS NULL AND f.validation_tool='attachments-byte-check/1'
 AND f.actual_sha256=f.sha256 AND f.actual_size_bytes=f.size_bytes AND f.actual_mime_type=f.mime_type
 AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id)
 AND NOT EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL);
$$;
-- Read guards check all inbound business FKs dynamically. New FK migrations must
-- also install files_deletion_reference_guard for concurrent writes. The own
-- intent is transport metadata; its source_file_id is a real business dependency.
CREATE FUNCTION private.files_delete_unreferenced(f public.files) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c record;hit boolean;BEGIN
 IF EXISTS(SELECT FROM private.upload_intents WHERE source_file_id=f.id)
 OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id)
 OR EXISTS(SELECT FROM private.file_process_leases WHERE office_id=f.office_id AND completed_at IS NULL AND expires_at>clock_timestamp() AND objects @> jsonb_build_array(jsonb_build_object('file_id',f.id))) THEN RETURN false;END IF;
 FOR c IN SELECT k.conrelid::regclass AS tbl,string_agg(format('t.%I = ($1).%I',a.attname,b.attname),' AND ' ORDER BY x.n) AS predicate
 FROM pg_catalog.pg_constraint k CROSS JOIN LATERAL unnest(k.conkey,k.confkey) WITH ORDINALITY x(a,b,n)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.a JOIN pg_catalog.pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=x.b
 WHERE k.contype='f' AND k.confrelid='public.files'::regclass AND k.conrelid<>'private.upload_intents'::regclass
 GROUP BY k.oid,k.conrelid LOOP
 EXECUTE format('SELECT EXISTS(SELECT FROM %s t WHERE %s)',c.tbl,c.predicate) INTO hit USING f;
 IF hit THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $$;
CREATE FUNCTION private.files_delete_authority(f public.files) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 m:=private.files_actor(f.office_id,true);m:=private.files_actor(f.office_id,true,CASE WHEN m.role_code='client' THEN 'files.upload' ELSE 'files.manage' END);
 r:=private.files_request(f.office_id,f.request_id,m,true);
 IF m.role_code='client' AND f.created_by<>m.user_id OR private.specialized_file_allowed30(f) IS NOT TRUE OR(m.role_code='client' AND EXISTS(SELECT FROM private.portal_hidden_files WHERE file_id=f.id)) THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN m;
END $$;
CREATE FUNCTION private.files_delete_check(f public.files) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF f.protected OR f.legal_hold OR f.retain_until>clock_timestamp() THEN RAISE EXCEPTION 'FILE_PROTECTED' USING ERRCODE='PT409';END IF;
 IF private.files_delete_unreferenced(f) IS NOT TRUE THEN RAISE EXCEPTION 'FILE_IN_USE' USING ERRCODE='PT409';END IF;
END $$;
CREATE FUNCTION private.files_preview(p_office_id uuid,p_file_id uuid,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;f public.files;i private.upload_intents;BEGIN
 m:=private.files_actor(p_office_id);
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id;
 IF f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 r:=private.files_request(p_office_id,f.request_id,m);SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id FOR SHARE;
 m:=private.files_actor(p_office_id);
 IF f.id IS NULL OR(m.role_code='client' AND(f.created_by<>m.user_id OR EXISTS(SELECT FROM private.portal_hidden_files WHERE file_id=f.id))) OR private.specialized_file_allowed30(f) IS NOT TRUE THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF private.files_preview_ready(f) IS NOT TRUE THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
 SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND file_id=f.id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.team_audit(p_office_id,m.user_id,'files.preview_authorized','file',f.id,p_event_id,'{}');
 RETURN jsonb_build_object('bucket',i.bucket,'object_path',i.object_path,'name',f.name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'sha256',f.sha256);
END $$;
CREATE FUNCTION private.files_delete_begin(p_office_id uuid,p_file_id uuid,p_expected_updated_at timestamptz,p_key uuid,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;f public.files;i private.upload_intents;j private.file_deletions;pending private.file_deletions;BEGIN
 m:=private.files_actor(p_office_id,true);
 IF p_key IS NULL OR p_event_id IS NULL OR p_expected_updated_at IS NULL OR p_file_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO j FROM private.file_deletions WHERE office_id=p_office_id AND actor_id=m.user_id AND key=p_key;
 IF j.id IS NOT NULL THEN
  IF j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id' OR j.file_id<>p_file_id OR j.expected_updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF j.completed_at IS NOT NULL THEN RETURN jsonb_build_object('id',j.id,'file_id',j.file_id,'bucket',NULL,'object_path',NULL,'completed',true);END IF;
 END IF;
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id;
 IF f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.files_delete_authority(f);
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id FOR UPDATE;
 m:=private.files_delete_authority(f);
 IF f.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'FILE_VERSION_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.files_delete_check(f);
 SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND file_id=f.id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
 -- office -> request -> file -> job. A new explicit command can reclaim an
 -- abandoned reservation only after expiry and full current authorization.
 SELECT * INTO pending FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL FOR UPDATE;
 IF pending.id IS NOT NULL THEN
  IF pending.expected_updated_at<>f.updated_at OR pending.bucket<>i.bucket OR pending.object_path<>i.object_path THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  IF pending.id IS DISTINCT FROM j.id THEN
   IF pending.expires_at>clock_timestamp() THEN RAISE EXCEPTION 'FILE_DELETE_PENDING' USING ERRCODE='PT409';END IF;
   UPDATE private.file_deletions SET actor_id=m.user_id,session_id=(auth.jwt()->>'session_id')::uuid,key=p_key,expires_at=clock_timestamp()+interval '15 minutes' WHERE id=pending.id RETURNING * INTO j;
   PERFORM private.team_audit(p_office_id,m.user_id,'files.delete_reclaimed','file',f.id,p_event_id,'{}');
  ELSE UPDATE private.file_deletions SET expires_at=clock_timestamp()+interval '15 minutes' WHERE id=pending.id RETURNING * INTO j;END IF;
 ELSE
  INSERT INTO private.file_deletions(office_id,file_id,request_id,actor_id,session_id,key,expected_updated_at,bucket,object_path)VALUES(p_office_id,f.id,f.request_id,m.user_id,(auth.jwt()->>'session_id')::uuid,p_key,f.updated_at,i.bucket,i.object_path)RETURNING * INTO j;
  PERFORM private.team_audit(p_office_id,m.user_id,'files.delete_reserved','file',f.id,p_event_id,'{}');
 END IF;
 RETURN jsonb_build_object('id',j.id,'file_id',j.file_id,'bucket',j.bucket,'object_path',j.object_path,'completed',false);
END $$;
-- This predicate also runs inside Storage DELETE. It holds the existing authority
-- locks through the provider transaction and can authorize only this exact path.
CREATE FUNCTION private.files_delete_storage_allowed(p_bucket text,p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.file_deletions;f public.files;m public.memberships;BEGIN
 SELECT * INTO j FROM private.file_deletions WHERE bucket=p_bucket AND object_path=p_path AND completed_at IS NULL;
 IF j.id IS NULL OR j.actor_id<>auth.uid() OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id' OR j.expires_at<=clock_timestamp() THEN RETURN false;END IF;
 m:=private.files_actor(j.office_id,true);SELECT * INTO f FROM public.files WHERE office_id=j.office_id AND id=j.file_id;
 IF f.id IS NULL THEN RETURN false;END IF;m:=private.files_delete_authority(f);
 SELECT * INTO f FROM public.files WHERE office_id=j.office_id AND id=j.file_id FOR UPDATE;
 m:=private.files_delete_authority(f);PERFORM private.files_delete_check(f);
 -- Reclaim may have committed while this Storage request waited for its locks.
 SELECT * INTO j FROM private.file_deletions WHERE bucket=p_bucket AND object_path=p_path AND completed_at IS NULL FOR UPDATE;
 IF j.id IS NULL OR j.actor_id<>auth.uid() OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id' OR j.expires_at<=clock_timestamp() THEN RETURN false;END IF;
 RETURN f.updated_at=j.expected_updated_at AND EXISTS(SELECT FROM private.upload_intents WHERE office_id=j.office_id AND file_id=j.file_id AND bucket=p_bucket AND object_path=p_path);
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
CREATE FUNCTION private.files_delete_complete(p_office_id uuid,p_command_id uuid,p_key uuid,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j private.file_deletions;f public.files;caller uuid;BEGIN
 caller:=private.team_require_identity();PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;caller:=private.team_require_identity();
 SELECT * INTO j FROM private.file_deletions WHERE office_id=p_office_id AND id=p_command_id AND actor_id=caller AND key=p_key;
 IF j.id IS NULL OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id' THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF j.completed_at IS NOT NULL THEN RETURN jsonb_build_object('deleted',true,'file_id',j.file_id);END IF;
 -- Completion finalizes an already authorized removal, even if work scope was
 -- revoked after Storage removed bytes. A valid original UID/session is required.
 PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id=j.request_id FOR UPDATE;
 SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=j.file_id FOR UPDATE;
 SELECT * INTO j FROM private.file_deletions WHERE office_id=p_office_id AND id=p_command_id AND actor_id=caller AND key=p_key FOR UPDATE;
 IF j.id IS NULL OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id' THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF f.id IS NULL OR f.updated_at IS DISTINCT FROM j.expected_updated_at THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.files_delete_check(f);
 IF EXISTS(SELECT FROM storage.objects WHERE bucket_id=j.bucket AND name=j.object_path) THEN RAISE EXCEPTION 'FILE_DELETE_PENDING' USING ERRCODE='PT409';END IF;
 -- Own transport metadata can be erased; business dependencies were denied above.
 DELETE FROM private.file_process_leases WHERE office_id=p_office_id AND(objects @> jsonb_build_array(jsonb_build_object('file_id',f.id)) OR target_id IN(SELECT id FROM private.upload_intents WHERE file_id=f.id));
 DELETE FROM private.upload_intents WHERE office_id=p_office_id AND file_id=f.id;
 DELETE FROM public.files WHERE office_id=p_office_id AND id=f.id;
 UPDATE private.file_deletions SET completed_at=clock_timestamp(),bucket=NULL,object_path=NULL WHERE id=j.id;
 PERFORM private.team_audit(p_office_id,caller,'files.deleted','file',j.file_id,p_event_id,'{}');
 RETURN jsonb_build_object('deleted',true,'file_id',j.file_id);
END $$;
-- Block new references, copy sources, cleanup reservations, processing and changes
-- to any file metadata while its explicit reservation survives network I/O.
CREATE FUNCTION private.files_deletion_reference_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fid uuid;f public.files;BEGIN
 fid:=nullif(to_jsonb(NEW)->>TG_ARGV[0],'')::uuid;IF fid IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO f FROM public.files WHERE id=fid;IF f.id IS NULL THEN RETURN NEW;END IF;
 PERFORM 1 FROM public.offices WHERE id=f.office_id FOR NO KEY UPDATE;
 PERFORM 1 FROM public.requests WHERE office_id=f.office_id AND id=f.request_id FOR UPDATE;
 PERFORM 1 FROM public.files WHERE id=f.id FOR UPDATE;
 IF EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL) THEN RAISE EXCEPTION 'FILE_DELETE_PENDING' USING ERRCODE='PT409';END IF;
 RETURN NEW;
END $$;
DO $$DECLARE c record;BEGIN
 FOR c IN SELECT DISTINCT k.conrelid::regclass AS tbl,a.attname FROM pg_catalog.pg_constraint k
 CROSS JOIN LATERAL unnest(k.conkey,k.confkey) x(a,b)
 JOIN pg_catalog.pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=x.a JOIN pg_catalog.pg_attribute b ON b.attrelid=k.confrelid AND b.attnum=x.b
 WHERE k.contype='f' AND k.confrelid='public.files'::regclass AND b.attname='id' AND(k.conrelid<>'private.upload_intents'::regclass OR a.attname='source_file_id') LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION private.files_deletion_reference_guard(%L)','file_deletion_'||c.attname,c.tbl,c.attname);
 END LOOP;
END $$;
CREATE TRIGGER file_deletion_metadata BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION private.files_deletion_reference_guard('id');
CREATE FUNCTION private.files_deletion_lease_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o jsonb;f public.files;BEGIN
 FOR o IN SELECT value FROM jsonb_array_elements(NEW.objects) LOOP
 SELECT * INTO f FROM public.files WHERE id=(o->>'file_id')::uuid;
 IF f.id IS NOT NULL THEN
 PERFORM 1 FROM public.offices WHERE id=f.office_id FOR NO KEY UPDATE;PERFORM 1 FROM public.requests WHERE office_id=f.office_id AND id=f.request_id FOR UPDATE;PERFORM 1 FROM public.files WHERE id=f.id FOR UPDATE;
 IF EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL) THEN RAISE EXCEPTION 'FILE_DELETE_PENDING' USING ERRCODE='PT409';END IF;END IF;
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER file_deletion_lease BEFORE INSERT OR UPDATE ON private.file_process_leases FOR EACH ROW EXECUTE FUNCTION private.files_deletion_lease_guard();
ALTER FUNCTION private.files_cleanup_eligible(public.files) RENAME TO files_cleanup_eligible_before_individual_delete;
CREATE FUNCTION private.files_cleanup_eligible(f public.files) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.files_cleanup_eligible_before_individual_delete(f) AND NOT EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL);$$;
ALTER FUNCTION private.files_storage_allowed(text,text,text,jsonb) RENAME TO files_storage_allowed_before_preview_delete;
CREATE FUNCTION private.files_storage_allowed(p_bucket text,p_path text,p_operation text,p_metadata jsonb DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.upload_intents;f public.files;m public.memberships;r public.requests;BEGIN
 IF p_bucket<>'request-attachments' THEN RETURN false;END IF;
 IF p_operation='delete' OR(p_operation='select' AND storage.allow_any_operation(ARRAY['object.delete','object.delete_many'])) THEN RETURN private.files_delete_storage_allowed(p_bucket,p_path);END IF;
 SELECT * INTO i FROM private.upload_intents WHERE bucket=p_bucket AND object_path=p_path;
 IF i.id IS NULL OR EXISTS(SELECT FROM private.file_deletions WHERE file_id=i.file_id AND completed_at IS NULL) THEN RETURN false;END IF;
 IF p_operation<>'select' THEN RETURN private.files_storage_allowed_before_preview_delete(p_bucket,p_path,p_operation,p_metadata);END IF;
 IF NOT storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info']) THEN RETURN false;END IF;
 m:=private.files_actor(i.office_id);r:=private.files_request(i.office_id,i.request_id,m);SELECT * INTO f FROM public.files WHERE office_id=i.office_id AND id=i.file_id FOR SHARE;
 RETURN f.id IS NOT NULL AND private.specialized_file_allowed30(f) IS TRUE AND private.files_preview_ready(f) IS TRUE AND(m.role_code<>'client' OR(f.created_by=m.user_id AND NOT EXISTS(SELECT FROM private.portal_hidden_files WHERE file_id=f.id)));
EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
DROP POLICY attachments_delete_gate ON storage.objects;
CREATE POLICY attachments_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='request-attachments' AND storage.allow_any_operation(ARRAY['object.delete','object.delete_many']) AND private.files_storage_allowed(bucket_id,name,'delete'));
CREATE POLICY attachments_delete_gate ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'request-attachments' OR(storage.allow_any_operation(ARRAY['object.delete','object.delete_many']) AND private.files_storage_allowed(bucket_id,name,'delete')));
ALTER FUNCTION private.files_file_json(public.files,public.memberships) RENAME TO files_file_json_before_preview_delete;
CREATE FUNCTION private.files_file_json(f public.files,m public.memberships) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE base jsonb;r public.requests;can_delete boolean:=false;reserved boolean;BEGIN
 base:=private.files_file_json_before_preview_delete(f,m);
 SELECT * INTO r FROM public.requests WHERE office_id=f.office_id AND id=f.request_id;
 reserved:=EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL);
 can_delete:=NOT EXISTS(SELECT FROM private.file_deletions WHERE file_id=f.id AND completed_at IS NULL AND expires_at>clock_timestamp()) AND r.status NOT IN('concluido','cancelado') AND NOT f.protected AND NOT f.legal_hold AND(f.retain_until IS NULL OR f.retain_until<=clock_timestamp()) AND private.files_delete_unreferenced(f)
 AND CASE WHEN m.role_code='client' THEN private.files_own_portal(r,m) AND f.created_by=m.user_id ELSE private.request_can_work(r,m) IS TRUE AND private.current_permissions(f.office_id) @> ARRAY['files.read','requests.read','files.manage'] END;
 RETURN base||jsonb_build_object('delete_pending',reserved,'can_preview',coalesce(private.files_preview_ready(f),false),'can_delete',coalesce(can_delete,false))||CASE WHEN reserved THEN '{"intent_id":null,"can_validate":false,"can_copy":false,"can_download":false}'::jsonb ELSE '{}'::jsonb END;
END $$;
CREATE FUNCTION public.files_preview(p_office_id uuid,p_file_id uuid,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_preview(p_office_id,p_file_id,p_event_id);$$;
CREATE FUNCTION public.files_delete_begin(p_office_id uuid,p_file_id uuid,p_expected_updated_at timestamptz,p_key uuid,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_delete_begin(p_office_id,p_file_id,p_expected_updated_at,p_key,p_event_id);$$;
CREATE FUNCTION public.files_delete_complete(p_office_id uuid,p_command_id uuid,p_key uuid,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.files_delete_complete(p_office_id,p_command_id,p_key,p_event_id);$$;
REVOKE ALL ON FUNCTION private.files_own_portal(public.requests,public.memberships),private.files_preview_ready(public.files),private.files_delete_unreferenced(public.files),private.files_delete_authority(public.files),private.files_delete_check(public.files),private.files_preview(uuid,uuid,uuid),private.files_delete_begin(uuid,uuid,timestamptz,uuid,uuid),private.files_delete_complete(uuid,uuid,uuid,uuid),private.files_delete_storage_allowed(text,text),private.files_deletion_reference_guard(),private.files_deletion_lease_guard(),private.files_cleanup_eligible(public.files),private.files_cleanup_eligible_before_individual_delete(public.files),private.files_storage_allowed(text,text,text,jsonb),private.files_storage_allowed_before_preview_delete(text,text,text,jsonb),private.files_file_json(public.files,public.memberships),private.files_file_json_before_preview_delete(public.files,public.memberships),public.files_preview(uuid,uuid,uuid),public.files_delete_begin(uuid,uuid,timestamptz,uuid,uuid),public.files_delete_complete(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.files_preview(uuid,uuid,uuid),private.files_delete_begin(uuid,uuid,timestamptz,uuid,uuid),private.files_delete_complete(uuid,uuid,uuid,uuid),public.files_preview(uuid,uuid,uuid),public.files_delete_begin(uuid,uuid,timestamptz,uuid,uuid),public.files_delete_complete(uuid,uuid,uuid,uuid),private.files_storage_allowed(text,text,text,jsonb) TO authenticated;
-- Policies keep function OIDs through RENAME, so explicitly bind all four gates.
ALTER POLICY attachments_insert ON storage.objects WITH CHECK(bucket_id='request-attachments' AND private.files_storage_allowed(bucket_id,name,'insert',metadata));
ALTER POLICY attachments_insert_gate ON storage.objects WITH CHECK(bucket_id<>'request-attachments' OR private.files_storage_allowed(bucket_id,name,'insert',metadata));
ALTER POLICY attachments_select ON storage.objects USING(bucket_id='request-attachments' AND private.files_storage_allowed(bucket_id,name,'select'));
ALTER POLICY attachments_select_gate ON storage.objects USING(bucket_id<>'request-attachments' OR private.files_storage_allowed(bucket_id,name,'select'));
CREATE TRIGGER file_deletion_intent_metadata BEFORE UPDATE ON private.upload_intents FOR EACH ROW EXECUTE FUNCTION private.files_deletion_reference_guard('file_id');
NOTIFY pgrst,'reload schema';
