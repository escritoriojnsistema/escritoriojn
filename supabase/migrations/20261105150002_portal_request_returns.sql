-- Own online returns, immutable edits and logical hiding; no deletion of archives.
CREATE TABLE private.portal_request_commands(
 office_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,
 expected_version integer NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE TABLE private.portal_request_visibility(
 office_id uuid NOT NULL,request_id uuid NOT NULL,hidden_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,request_id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE TABLE private.portal_intake_forms(office_id uuid NOT NULL,intake_id uuid NOT NULL REFERENCES private.document_intakes(id),fields jsonb NOT NULL,PRIMARY KEY(office_id,intake_id));
CREATE TABLE private.portal_hidden_files(office_id uuid NOT NULL,file_id uuid NOT NULL REFERENCES public.files(id),hidden_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,file_id));
CREATE TABLE private.portal_intake_revisions(
 office_id uuid NOT NULL,request_id uuid NOT NULL,request_item_id uuid NOT NULL,request_version integer NOT NULL,answers jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,request_item_id,request_version),FOREIGN KEY(office_id,request_id,request_item_id) REFERENCES public.request_items(office_id,request_id,id)
);
DO $$DECLARE t regclass;BEGIN FOREACH t IN ARRAY ARRAY['private.portal_request_commands'::regclass,'private.portal_request_visibility'::regclass,'private.portal_intake_revisions'::regclass,'private.portal_hidden_files'::regclass,'private.portal_intake_forms'::regclass] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('CREATE TRIGGER portal_immutable BEFORE UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t);END LOOP;END $$;
CREATE FUNCTION private.portal_capture_intake_form() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 INSERT INTO private.portal_intake_forms(office_id,intake_id,fields)
 SELECT NEW.office_id,NEW.id,coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','required',coalesce(o.required_intake_keys ? (v->>'key'),false)) ORDER BY n),'[]'::jsonb) FROM public.template_versions tv JOIN private.document_offerings o ON o.office_id=tv.office_id AND o.template_id=tv.template_id,LATERAL jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,n) WHERE tv.office_id=NEW.office_id AND tv.id=NEW.template_version_id AND o.intake_keys ? (v->>'key');RETURN NEW;
END $$;
CREATE TRIGGER portal_capture_intake_form AFTER INSERT ON private.document_intakes FOR EACH ROW EXECUTE FUNCTION private.portal_capture_intake_form();
-- Existing bookings retain known client keys. Use offering schema only when its revision still matches.
INSERT INTO private.portal_intake_forms(office_id,intake_id,fields)
 SELECT i.office_id,i.id,coalesce((SELECT jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','required',coalesce(o.required_intake_keys ? (v->>'key'),false)) ORDER BY n) FROM public.template_versions tv LEFT JOIN private.document_offerings o ON o.office_id=tv.office_id AND o.template_id=tv.template_id AND o.revision=i.offer_revision,LATERAL jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,n) WHERE tv.office_id=i.office_id AND tv.id=i.template_version_id AND(i.answers ? (v->>'key') OR o.intake_keys ? (v->>'key'))),'[]'::jsonb) FROM private.document_intakes i;
CREATE FUNCTION private.portal_intake_answers(i private.document_intakes) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT x.answers FROM private.portal_intake_revisions x WHERE x.office_id=i.office_id AND x.request_item_id=i.request_item_id ORDER BY request_version DESC LIMIT 1),i.answers);
$$;
ALTER FUNCTION private.request_in_scope(public.requests,public.memberships) RENAME TO request_in_scope_before_portal_returns;
CREATE FUNCTION private.request_in_scope(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_in_scope_before_portal_returns(r,m) IS TRUE AND(m.role_code<>'client' OR NOT EXISTS(SELECT FROM private.portal_request_visibility v WHERE v.office_id=r.office_id AND v.request_id=r.id));
$$;
CREATE FUNCTION private.portal_request_state_record(r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('request_id',r.id,'version',r.version,'title',r.title,'message',r.message,
 'reason',coalesce((SELECT h.reason FROM private.request_history h WHERE h.office_id=r.office_id AND h.request_id=r.id AND h.kind='status' AND h.to_status=r.status AND r.status IN('aguardando_cliente','cancelado') ORDER BY h.created_at DESC,h.id DESC LIMIT 1),''),
 'can_edit',r.status='aguardando_cliente' AND r.category<>'account_correction' AND NOT EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id),
 'can_resubmit',r.status='aguardando_cliente' AND r.category<>'account_correction' AND NOT EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id),
 'can_hide',r.status IN('aguardando_cliente','cancelado') AND r.category<>'account_correction','hidden',EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id),
 'inputs',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.request_item_id,'name',i.model_name,'answers',private.portal_intake_answers(i),'fields',coalesce((SELECT f.fields FROM private.portal_intake_forms f WHERE f.office_id=i.office_id AND f.intake_id=i.id),'[]'::jsonb)) ORDER BY i.created_at,i.id) FROM private.document_intakes i WHERE i.office_id=r.office_id AND i.request_id=r.id AND i.client_user_id=r.created_by),'[]'::jsonb));
$$;
CREATE FUNCTION private.portal_request_state(p_office_id uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 m:=private.requests_actor(p_office_id);SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR SHARE;
 m:=private.requests_actor(p_office_id);
 IF m.role_code<>'client' OR r.id IS NULL OR r.origin<>'portal' OR r.created_by<>m.user_id THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.portal_request_state_record(r);
END $$;
CREATE FUNCTION private.portal_request_command(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;c private.portal_request_commands;kind text;next_title text;next_message text;input jsonb;i private.document_intakes;tv public.template_versions;ans jsonb;field jsonb;k text;resolved jsonb;result jsonb;old_assignee uuid;BEGIN
 m:=private.requests_actor(p_office_id,true);SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.requests_actor(p_office_id,true);
 IF m.role_code<>'client' OR r.id IS NULL OR r.origin<>'portal' OR r.created_by<>m.user_id OR r.category='account_correction' THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO c FROM private.portal_request_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF c.idempotency_key IS NOT NULL THEN
 IF c.request_id<>r.id OR c.expected_version<>p_expected_version OR c.payload<>p_command THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN private.portal_request_state_record(r);END IF;
 kind:=p_command->>'kind';
 IF r.version<>p_expected_version OR EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=p_office_id AND request_id=r.id) OR NOT(r.status='aguardando_cliente' OR(kind='hide' AND r.status='cancelado')) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 IF kind='hide' THEN
 PERFORM private.request_shape(p_command,ARRAY['kind']);INSERT INTO private.portal_request_visibility(office_id,request_id)VALUES(p_office_id,r.id);
 ELSIF kind='remove_file' THEN
 PERFORM private.request_shape(p_command,ARRAY['kind','file_id']);
 IF NOT EXISTS(SELECT FROM public.files f WHERE f.office_id=p_office_id AND f.id=private.request_uuid(p_command->'file_id') AND f.request_id=r.id AND f.created_by=m.user_id) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 INSERT INTO private.portal_hidden_files(office_id,file_id)VALUES(p_office_id,private.request_uuid(p_command->'file_id')) ON CONFLICT DO NOTHING;
 ELSIF kind='save' THEN
 PERFORM private.request_shape(p_command,ARRAY['kind','title','message','inputs']);next_title:=private.request_text(p_command->'title',1,120);next_message:=private.request_text(p_command->'message',0,2000,true);
 IF jsonb_typeof(p_command->'inputs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'inputs')<>(SELECT count(*) FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id AND client_user_id=m.user_id) OR (SELECT count(DISTINCT x->>'item_id') FROM jsonb_array_elements(p_command->'inputs') x)<>jsonb_array_length(p_command->'inputs') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR input IN SELECT * FROM jsonb_array_elements(p_command->'inputs') LOOP
 PERFORM private.request_shape(input,ARRAY['item_id','answers']);SELECT * INTO i FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id AND request_item_id=private.request_uuid(input->'item_id') AND client_user_id=m.user_id;
 IF i.id IS NULL OR jsonb_typeof(input->'answers') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 ans:=input->'answers';IF (SELECT count(*) FROM jsonb_object_keys(ans))>80 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO tv FROM public.template_versions WHERE office_id=p_office_id AND id=i.template_version_id;
 FOR k IN SELECT jsonb_object_keys(ans) LOOP
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(private.portal_request_state_record(r)->'inputs') x,LATERAL jsonb_array_elements(x->'fields') f WHERE x->>'item_id'=i.request_item_id::text AND f->>'key'=k) OR jsonb_typeof(ans->k) IS DISTINCT FROM 'string' OR char_length(ans->>k)>2000 OR translate(ans->>k,E'\n\r\t','') ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
 resolved:=private.documents_resolve21(tv.definition,jsonb_build_object('content',tv.definition->>'content','overrides',ans,'money_in_words',false),'{}'::jsonb,'[]'::jsonb);
 IF EXISTS(SELECT FROM jsonb_array_elements(resolved->'issues') issue WHERE issue->>'code'='invalid_value' AND ans ? (issue->>'key')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 INSERT INTO private.portal_intake_revisions(office_id,request_id,request_item_id,request_version,answers,actor_id)VALUES(p_office_id,r.id,i.request_item_id,r.version+1,ans,m.user_id);
 END LOOP;
 UPDATE public.requests SET title=next_title,message=next_message WHERE office_id=p_office_id AND id=r.id;
 ELSIF kind='resubmit' THEN
 PERFORM private.request_shape(p_command,ARRAY['kind']);
 IF EXISTS(SELECT FROM jsonb_array_elements(private.portal_request_state_record(r)->'inputs') x,LATERAL jsonb_array_elements(x->'fields') f WHERE(f->>'required')::boolean AND NOT private.templates_has_text20(x->'answers'->>(f->>'key'))) OR(NOT EXISTS(SELECT FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id) AND NOT private.templates_has_text20(r.message)) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 -- End the previous responsibility before dispatch. History remains readable internally.
 old_assignee:=r.assignee_id;
 UPDATE private.request_assignments SET ended_at=clock_timestamp() WHERE office_id=p_office_id AND request_id=r.id AND ended_at IS NULL;
 UPDATE public.requests SET assignee_id=NULL,status='aguardando_responsavel' WHERE office_id=p_office_id AND id=r.id;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status,from_assignee)VALUES(p_office_id,r.id,'status',m.user_id,'Reenviado pelo cliente','aguardando_cliente','aguardando_responsavel',old_assignee);
 PERFORM private.document_dispatch(p_office_id);
 ELSE RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF kind<>'hide' THEN UPDATE public.requests SET version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=r.id RETURNING * INTO r;END IF;
 result:=private.portal_request_state_record(r);
 INSERT INTO private.portal_request_commands(office_id,request_id,actor_id,idempotency_key,expected_version,payload,result)VALUES(p_office_id,r.id,m.user_id,p_idempotency_key,p_expected_version,p_command,result);
 RETURN result;
END $$;
CREATE FUNCTION public.portal_request_state(p_office_id uuid,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_request_state(p_office_id,p_request_id);$$;
CREATE FUNCTION public.portal_request_command(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_request_command(p_office_id,p_request_id,p_expected_version,p_command,p_idempotency_key);$$;
-- Every existing worker completion uses files_request again after request locks.
ALTER FUNCTION private.files_request(uuid,uuid,public.memberships,boolean) RENAME TO files_request_before_portal_returns;
CREATE FUNCTION private.files_request(p_office_id uuid,p_request_id uuid,m public.memberships,p_write boolean DEFAULT false) RETURNS public.requests LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;BEGIN r:=private.files_request_before_portal_returns(p_office_id,p_request_id,m,p_write);m:=private.files_actor(p_office_id,p_write);IF p_write AND m.role_code='client' AND(r.status<>'aguardando_cliente' OR r.origin<>'portal' OR r.created_by<>m.user_id) THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN r;END $$;
ALTER FUNCTION private.files_storage_allowed(text,text,text,jsonb) RENAME TO files_storage_allowed_before_portal_returns;
CREATE FUNCTION private.files_storage_allowed(p_bucket text,p_path text,p_operation text,p_metadata jsonb DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i private.upload_intents;m public.memberships;r public.requests;BEGIN
 IF NOT private.files_storage_allowed_before_portal_returns(p_bucket,p_path,p_operation,p_metadata) THEN RETURN false;END IF;
 SELECT * INTO i FROM private.upload_intents WHERE bucket=p_bucket AND object_path=p_path;m:=private.files_actor(i.office_id);r:=private.files_request(i.office_id,i.request_id,m,p_operation='insert');IF m.role_code='client' AND EXISTS(SELECT FROM private.portal_hidden_files WHERE office_id=i.office_id AND file_id=i.file_id) THEN RETURN false;END IF;RETURN true;
 EXCEPTION WHEN OTHERS THEN RETURN false;END $$;
DO $$DECLARE body text;updated text;BEGIN
 SELECT pg_get_functiondef('private.files_page(uuid,uuid,integer,integer)'::regprocedure) INTO body;
 updated:=replace(body,'m.role_code<>''client'' OR f.created_by=m.user_id','m.role_code<>''client'' OR (f.created_by=m.user_id AND NOT EXISTS(SELECT FROM private.portal_hidden_files ph WHERE ph.office_id=f.office_id AND ph.file_id=f.id))');
 IF updated=body THEN RAISE EXCEPTION 'Portal files page target missing';END IF;EXECUTE updated;
END $$;
-- Effective answers are an append-only overlay; preserve the originally contracted intake.
DO $$DECLARE body text;updated text;name text;BEGIN FOREACH name IN ARRAY ARRAY['document_intake_view','document_intake_apply'] LOOP SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname=name;updated:=replace(body,'i.answers','private.portal_intake_answers(i)');IF updated=body THEN RAISE EXCEPTION 'Portal intake target missing: %',name;END IF;EXECUTE updated;END LOOP;END $$;
DO $$DECLARE c record;BEGIN SELECT conname,pg_get_constraintdef(oid) body INTO c FROM pg_constraint WHERE conrelid='private.internal_notifications'::regclass AND contype='c' AND conname='internal_notifications_kind_check';EXECUTE format('ALTER TABLE private.internal_notifications DROP CONSTRAINT %I',c.conname);EXECUTE 'ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check CHECK ('||substr(c.body,7)||' OR kind IN(''request_returned'',''request_cancelled''))';END $$;
CREATE FUNCTION private.portal_return_notice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NEW.kind='status' AND NEW.to_status IN('aguardando_cliente','cancelado') THEN
 INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,event_id,kind)
 SELECT r.office_id,r.id,m.id,NEW.id,CASE NEW.to_status WHEN 'cancelado' THEN 'request_cancelled' ELSE 'request_returned' END FROM public.requests r JOIN public.memberships m ON m.office_id=r.office_id AND m.user_id=r.created_by AND m.active AND m.role_code='client' WHERE r.office_id=NEW.office_id AND r.id=NEW.request_id AND r.origin='portal' ON CONFLICT DO NOTHING;
 END IF;RETURN NEW;END $$;
CREATE TRIGGER portal_return_notice AFTER INSERT ON private.request_history FOR EACH ROW EXECUTE FUNCTION private.portal_return_notice();
ALTER FUNCTION private.notification_visible(private.internal_notifications,public.requests,public.memberships) RENAME TO notification_visible_before_portal_returns;
CREATE FUNCTION private.notification_visible(n private.internal_notifications,r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT CASE WHEN n.kind IN('request_returned','request_cancelled') THEN n.office_id=m.office_id AND n.recipient_id=m.id AND m.role_code='client' AND private.request_in_scope(r,m) IS TRUE ELSE private.notification_visible_before_portal_returns(n,r,m) END;$$;
DO $$DECLARE body text;updated text;name text;BEGIN FOREACH name IN ARRAY ARRAY['notifications_page','notifications_summary'] LOOP SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname=name;updated:=replace(body,'''assignee_changed'',''account_updated''','''request_returned'',''request_cancelled'',''assignee_changed'',''account_updated''');updated:=replace(updated,'''document_withdrawn'') OR p_page','''document_withdrawn'',''request_returned'',''request_cancelled'') OR p_page');IF updated=body THEN RAISE EXCEPTION 'Portal notification target absent: %',name;END IF;EXECUTE updated;END LOOP;END $$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT oid::regprocedure sig,proname FROM pg_proc WHERE pronamespace='private'::regnamespace AND(proname LIKE 'portal_%' OR proname IN('request_in_scope_before_portal_returns','request_in_scope','files_request_before_portal_returns','files_request','files_storage_allowed_before_portal_returns','files_storage_allowed','notification_visible_before_portal_returns','notification_visible')) LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);END LOOP;END $$;
REVOKE ALL ON FUNCTION public.portal_request_state(uuid,uuid),public.portal_request_command(uuid,uuid,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.portal_request_state(uuid,uuid),public.portal_request_command(uuid,uuid,integer,jsonb,uuid),private.portal_request_state(uuid,uuid),private.portal_request_command(uuid,uuid,integer,jsonb,uuid) TO authenticated;
-- RLS stores function OIDs: a rename does not rebind existing policies.
ALTER POLICY attachments_insert ON storage.objects WITH CHECK(bucket_id='request-attachments' AND private.files_storage_allowed(bucket_id,name,'insert',metadata));
ALTER POLICY attachments_insert_gate ON storage.objects WITH CHECK(bucket_id<>'request-attachments' OR private.files_storage_allowed(bucket_id,name,'insert',metadata));
ALTER POLICY attachments_select ON storage.objects USING(bucket_id='request-attachments' AND private.files_storage_allowed(bucket_id,name,'select'));
ALTER POLICY attachments_select_gate ON storage.objects USING(bucket_id<>'request-attachments' OR private.files_storage_allowed(bucket_id,name,'select'));
GRANT EXECUTE ON FUNCTION private.files_storage_allowed(text,text,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
