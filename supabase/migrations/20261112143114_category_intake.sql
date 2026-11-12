-- Category forms reuse requests10, the existing dispatch/returns and private Storage11.
CREATE TABLE private.category_intake_forms(
 office_id uuid NOT NULL,category_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),enabled boolean NOT NULL,instructions text NOT NULL,fields jsonb NOT NULL,documents jsonb NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,category_id),FOREIGN KEY(office_id,category_id) REFERENCES private.service_categories(office_id,id)
);
CREATE INDEX category_intake_forms_actor_idx ON private.category_intake_forms(actor_id);
CREATE TABLE private.category_intakes(
 office_id uuid NOT NULL,request_id uuid NOT NULL,category_id uuid NOT NULL,revision integer NOT NULL,instructions text NOT NULL,fields jsonb NOT NULL,documents jsonb NOT NULL,answers jsonb NOT NULL,
 session_id uuid NOT NULL,submitted_at timestamptz,PRIMARY KEY(office_id,request_id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id),FOREIGN KEY(office_id,category_id) REFERENCES private.service_categories(office_id,id)
);
CREATE INDEX category_intakes_category_idx ON private.category_intakes(office_id,category_id);
CREATE TABLE private.category_intake_revisions(
 office_id uuid NOT NULL,request_id uuid NOT NULL,version integer NOT NULL,answers jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),PRIMARY KEY(office_id,request_id,version),FOREIGN KEY(office_id,request_id) REFERENCES private.category_intakes(office_id,request_id)
);
CREATE INDEX category_intake_revisions_actor_idx ON private.category_intake_revisions(actor_id);
CREATE TABLE private.category_intake_files(
 office_id uuid NOT NULL,request_id uuid NOT NULL,file_id uuid NOT NULL,slot_key text NOT NULL,PRIMARY KEY(office_id,request_id,file_id),FOREIGN KEY(office_id,request_id) REFERENCES private.category_intakes(office_id,request_id),FOREIGN KEY(office_id,request_id,file_id) REFERENCES public.files(office_id,request_id,id)
);
CREATE INDEX category_intake_files_file_idx ON private.category_intake_files(office_id,file_id);
CREATE TABLE private.category_intake_commands(
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,category_id uuid,request_id uuid,version integer,payload jsonb NOT NULL,
 PRIMARY KEY(office_id,actor_id,key),FOREIGN KEY(office_id,category_id) REFERENCES private.service_categories(office_id,id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE INDEX category_intake_commands_actor_idx ON private.category_intake_commands(actor_id);
CREATE INDEX category_intake_commands_category_idx ON private.category_intake_commands(office_id,category_id);
CREATE INDEX category_intake_commands_request_idx ON private.category_intake_commands(office_id,request_id);
DO $$DECLARE t regclass;BEGIN FOREACH t IN ARRAY ARRAY['private.category_intake_forms'::regclass,'private.category_intakes'::regclass,'private.category_intake_revisions'::regclass,'private.category_intake_files'::regclass,'private.category_intake_commands'::regclass] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.category_intake_revisions FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.category_intake_files FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.category_intake_commands FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.category_intake_snapshot_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP='DELETE' OR to_jsonb(NEW)-'submitted_at' IS DISTINCT FROM to_jsonb(OLD)-'submitted_at' OR OLD.submitted_at IS NOT NULL OR NEW.submitted_at IS NULL THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END$$;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE ON private.category_intakes FOR EACH ROW EXECUTE FUNCTION private.category_intake_snapshot_guard();

CREATE FUNCTION private.category_intake_validate(fields jsonb,documents jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f jsonb;d jsonb;x jsonb;BEGIN
 IF jsonb_typeof(fields) IS DISTINCT FROM 'array' OR jsonb_array_length(fields)>24 OR jsonb_typeof(documents) IS DISTINCT FROM 'array' OR jsonb_array_length(documents)>12 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (SELECT count(DISTINCT v->>'key') FROM jsonb_array_elements(fields)v)<>jsonb_array_length(fields) OR(SELECT count(DISTINCT v->>'key') FROM jsonb_array_elements(documents)v)<>jsonb_array_length(documents) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(fields) LOOP
 PERFORM private.request_shape(f,ARRAY['key','label','type','required','options']);PERFORM private.request_text(f->'label',1,80);
 IF jsonb_typeof(f->'key') IS DISTINCT FROM 'string' OR f->>'key'!~'^[a-z][a-z0-9_]{0,31}$' OR jsonb_typeof(f->'type') IS DISTINCT FROM 'string' OR f->>'type' NOT IN('text','textarea','number','date','email','phone','cpf','cnpj','select') OR jsonb_typeof(f->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(f->'options') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (f->>'type'='select' AND jsonb_array_length(f->'options') NOT BETWEEN 2 AND 20) OR(f->>'type'<>'select' AND f->'options'<>'[]'::jsonb) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(f->'options'))<>jsonb_array_length(f->'options') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(f->'options') LOOP PERFORM private.request_text(x,1,80);END LOOP;
 END LOOP;
 FOR d IN SELECT * FROM jsonb_array_elements(documents) LOOP
 PERFORM private.request_shape(d,ARRAY['key','label','required','max_files','max_bytes','mime_types','classification']);PERFORM private.request_text(d->'label',1,100);
 IF jsonb_typeof(d->'key') IS DISTINCT FROM 'string' OR d->>'key'!~'^[a-z][a-z0-9_]{0,31}$' OR jsonb_typeof(d->'required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(d->'max_files') IS DISTINCT FROM 'number' OR d->>'max_files'!~'^[0-9]{1,2}$' OR(d->>'max_files')::integer NOT BETWEEN 1 AND 10 OR jsonb_typeof(d->'max_bytes') IS DISTINCT FROM 'number' OR d->>'max_bytes'!~'^[0-9]{1,8}$' OR(d->>'max_bytes')::integer NOT BETWEEN 1024 AND 10485760 OR jsonb_typeof(d->'classification') IS DISTINCT FROM 'string' OR d->>'classification' NOT IN('documento','identificacao','comprovante') OR jsonb_typeof(d->'mime_types') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'mime_types') NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(d->'mime_types')v WHERE jsonb_typeof(v)<>'string' OR v#>>'{}' NOT IN('application/pdf','image/png','image/jpeg')) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(d->'mime_types'))<>jsonb_array_length(d->'mime_types') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
END$$;
CREATE FUNCTION private.category_intake_answers(fields jsonb,answers jsonb,complete boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f jsonb;k text;v text;BEGIN
 IF jsonb_typeof(answers) IS DISTINCT FROM 'object' OR(SELECT count(*) FROM jsonb_object_keys(answers))>24 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR k IN SELECT jsonb_object_keys(answers) LOOP IF NOT EXISTS(SELECT FROM jsonb_array_elements(fields) field_entry WHERE field_entry->>'key'=k) OR jsonb_typeof(answers->k) IS DISTINCT FROM 'string' OR char_length(answers->>k)>2000 OR translate(answers->>k,E'\n\r\t','')~'[[:cntrl:]]' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(fields) LOOP
 v:=btrim(coalesce(answers->>(f->>'key'),''));IF complete AND(f->>'required')::boolean AND btrim(v)='' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF v<>'' THEN
 IF (f->>'type'<>'textarea' AND (v~'[[:cntrl:]]' OR char_length(v)>500)) OR(f->>'type'='number' AND v!~'^-?(0|[1-9][0-9]*)(\.[0-9]+)?$') OR(f->>'type'='date' AND v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR(f->>'type'='email' AND(v!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR char_length(v)>254)) OR(f->>'type'='phone' AND char_length(regexp_replace(v,'[^0-9]','','g')) NOT BETWEEN 10 AND 15) OR(f->>'type'='cpf' AND v!~'^([0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$') OR(f->>'type'='cnpj' AND v!~'^([0-9]{14}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2})$') OR(f->>'type'='select' AND NOT(f->'options' ? v)) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF f->>'type' IN('cpf','cnpj') THEN BEGIN PERFORM private.customers_normalize_identifier(CASE WHEN f->>'type'='cpf' THEN 'person' ELSE 'company' END,v);EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END;END IF;
 IF f->>'type'='date' THEN BEGIN IF to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END;END IF;
 END IF;END LOOP;RETURN answers;
END$$;
CREATE FUNCTION private.category_intake_form(o uuid,cid uuid,manage boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;f private.category_intake_forms;cat private.service_categories;allowed boolean;has_services boolean;BEGIN
 PERFORM private.service_categories_state(o);SELECT * INTO m FROM public.memberships WHERE office_id=o AND user_id=auth.uid() AND active;
 allowed:=m.role_code IN('owner','admin') AND private.current_permissions(o) @> ARRAY['foundation.access','categories.manage'];
 IF manage IS NULL OR(manage AND NOT allowed) THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT manage AND m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO cat FROM private.service_categories WHERE office_id=o AND id=cid AND archived_at IS NULL;IF cat.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO f FROM private.category_intake_forms WHERE office_id=o AND category_id=cid;
 SELECT EXISTS(SELECT FROM private.portal_service_forms33 s WHERE s.office_id=o AND private.portal_service_projection33(s)->>'category_id'=cid::text) INTO has_services;
 IF NOT manage AND f.enabled IS NOT TRUE THEN RETURN jsonb_build_object('category_id',cid,'revision',0,'enabled',false,'instructions','','fields','[]'::jsonb,'documents','[]'::jsonb,'can_manage',false,'has_services',has_services);END IF;
 RETURN jsonb_build_object('category_id',cid,'revision',coalesce(f.revision,0),'enabled',coalesce(f.enabled,false),'instructions',coalesce(f.instructions,''),'fields',coalesce(f.fields,'[]'),'documents',coalesce(f.documents,'[]'),'can_manage',manage AND allowed,'has_services',has_services);
END$$;
CREATE FUNCTION private.category_intake_publish(o uuid,cid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE projection jsonb;prior private.category_intake_commands;actor uuid;BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;projection:=private.category_intake_form(o,cid,true);actor:=auth.uid();
 PERFORM private.request_shape(c,ARRAY['expected_revision','enabled','instructions','fields','documents','reason']);
 IF k IS NULL OR jsonb_typeof(c->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'expected_revision') IS DISTINCT FROM 'number' OR c->>'expected_revision'!~'^(0|[1-9][0-9]{0,8})$' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF (c->>'enabled')::boolean AND jsonb_array_length(c->'fields')+jsonb_array_length(c->'documents')=0 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;PERFORM private.request_text(c->'instructions',0,1000);PERFORM private.request_text(c->'reason',1,500);PERFORM private.category_intake_validate(c->'fields',c->'documents');
 SELECT * INTO prior FROM private.category_intake_commands WHERE office_id=o AND actor_id=actor AND key=k;
 IF prior.key IS NOT NULL THEN IF prior.session_id IS DISTINCT FROM(auth.jwt()->>'session_id')::uuid OR prior.category_id IS DISTINCT FROM cid OR prior.request_id IS NOT NULL OR prior.payload<>c THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN projection;END IF;
 IF projection->'revision' IS DISTINCT FROM c->'expected_revision' THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.category_intake_forms(office_id,category_id,revision,enabled,instructions,fields,documents,actor_id)VALUES(o,cid,1,(c->>'enabled')::boolean,btrim(c->>'instructions'),c->'fields',c->'documents',actor)ON CONFLICT(office_id,category_id) DO UPDATE SET revision=category_intake_forms.revision+1,enabled=EXCLUDED.enabled,instructions=EXCLUDED.instructions,fields=EXCLUDED.fields,documents=EXCLUDED.documents,actor_id=actor,updated_at=clock_timestamp();
 INSERT INTO private.category_intake_commands(office_id,actor_id,session_id,key,category_id,payload)VALUES(o,actor,(auth.jwt()->>'session_id')::uuid,k,cid,c);
 PERFORM private.team_audit(o,actor,'portal.category_published','category',cid,k,'{}');RETURN private.category_intake_form(o,cid,true);
END$$;
CREATE FUNCTION private.category_intake_current(i private.category_intakes) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT i.submitted_at IS NOT NULL OR EXISTS(SELECT FROM private.category_intake_forms f JOIN private.service_categories c ON c.office_id=f.office_id AND c.id=f.category_id WHERE f.office_id=i.office_id AND f.category_id=i.category_id AND f.revision=i.revision AND f.enabled AND c.archived_at IS NULL)$$;
CREATE FUNCTION private.category_intake_effective(i private.category_intakes) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT coalesce((SELECT answers FROM private.category_intake_revisions WHERE office_id=i.office_id AND request_id=i.request_id ORDER BY version DESC LIMIT 1),i.answers)$$;
CREATE FUNCTION private.category_intake_state_record(r public.requests,m public.memberships) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE i private.category_intakes;editable boolean;file_rows jsonb:='[]';BEGIN
 SELECT * INTO i FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id;IF i.request_id IS NULL THEN RETURN NULL;END IF;
 editable:=m.role_code='client' AND r.status='aguardando_cliente' AND NOT EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id) AND private.category_intake_current(i) AND (i.submitted_at IS NOT NULL OR private.portal_submission_valid33(r));
 IF m.role_code='client' OR private.current_permissions(r.office_id) @> ARRAY['files.read'] THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('slot_key',b.slot_key,'file_id',f.id,'name',f.name,'status',f.status)ORDER BY f.created_at,f.id),'[]') INTO file_rows FROM private.category_intake_files b JOIN public.files f ON f.office_id=b.office_id AND f.request_id=b.request_id AND f.id=b.file_id WHERE b.office_id=r.office_id AND b.request_id=r.id AND NOT EXISTS(SELECT FROM private.portal_hidden_files h WHERE h.office_id=f.office_id AND h.file_id=f.id) AND(m.role_code<>'client' OR f.created_by=m.user_id);
 END IF;
 RETURN jsonb_build_object('request_id',r.id,'category_id',i.category_id,'revision',i.revision,'version',r.version,'protocol',r.protocol,'category_name',private.request_category_snapshot(r)->>'category_name','instructions',i.instructions,'fields',i.fields,'answers',private.category_intake_effective(i),'documents',i.documents,'files',file_rows,'message',r.message,'draft',i.submitted_at IS NULL,'can_edit',editable,'can_submit',editable,'hidden',EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id));
END$$;
CREATE FUNCTION private.category_intake_state(o uuid,rid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 m:=private.requests_actor(o,false);SELECT * INTO r FROM public.requests WHERE office_id=o AND id=rid FOR SHARE;m:=private.requests_actor(o,false);
 IF r.id IS NULL OR(m.role_code='client' AND(r.created_by<>m.user_id OR r.origin<>'portal')) OR(m.role_code<>'client' AND private.request_in_scope(r,m) IS NOT TRUE) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.category_intake_state_record(r,m);
END$$;
CREATE FUNCTION private.category_intake_open(o uuid,cid uuid,rev integer,answers jsonb,message text,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;f private.category_intake_forms;cat private.service_categories;digest text;n bigint;BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF k IS NULL OR rev IS NULL OR rev<1 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;PERFORM private.request_text(to_jsonb(message),0,2000,true);
 digest:=encode(extensions.digest(jsonb_build_object('category_intake',cid,'revision',rev,'answers',answers,'message',message)::text,'sha256'),'hex');
 SELECT * INTO r FROM public.requests WHERE office_id=o AND created_by=m.user_id AND idempotency_key=k;
 IF r.id IS NOT NULL THEN
 IF r.payload_digest<>digest OR NOT EXISTS(SELECT FROM private.category_intakes i WHERE i.office_id=o AND i.request_id=r.id AND i.session_id=(auth.jwt()->>'session_id')::uuid AND private.category_intake_current(i)) OR private.portal_request_visible32(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN private.portal_booking_result33(r);END IF;
 PERFORM private.category_intake_form(o,cid,false);SELECT * INTO f FROM private.category_intake_forms WHERE office_id=o AND category_id=cid FOR SHARE;SELECT * INTO cat FROM private.service_categories WHERE office_id=o AND id=cid AND archived_at IS NULL FOR SHARE;
 IF cat.system_key='documents' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF f.enabled IS NOT TRUE OR f.revision<>rev THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;PERFORM private.category_intake_answers(f.fields,answers,false);
 INSERT INTO private.request_counters(office_id,last_number)VALUES(o,1)ON CONFLICT(office_id)DO UPDATE SET last_number=private.request_counters.last_number+1 RETURNING last_number INTO n;
 INSERT INTO public.requests(office_id,protocol,title,origin,status,created_by,priority,priority_reason,message,idempotency_key,payload_digest)VALUES(o,'AT-'||lpad(n::text,greatest(6,char_length(n::text)),'0'),cat.name,'portal','aguardando_cliente',m.user_id,'normal','',btrim(message),k,digest)RETURNING * INTO r;
 INSERT INTO private.category_intakes(office_id,request_id,category_id,revision,instructions,fields,documents,answers,session_id)VALUES(o,r.id,cid,rev,f.instructions,f.fields,f.documents,answers,(auth.jwt()->>'session_id')::uuid);
 INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256)VALUES(o,r.id,cid,cat.name,m.user_id,k,digest);
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,to_status)VALUES(o,r.id,'created',m.user_id,r.status);PERFORM private.emit_business_event(o,'requests.created','request',r.id,k,'{}');RETURN private.portal_booking_result33(r);
END$$;
-- Include category preparations in the existing draft, queue and operational gates.
ALTER FUNCTION private.portal_draft33(public.requests) RENAME TO portal_draft33_before_category_intake;
CREATE FUNCTION private.portal_draft33(r public.requests) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_draft33_before_category_intake(r) OR(r.origin='portal' AND r.status='aguardando_cliente' AND EXISTS(SELECT FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id AND submitted_at IS NULL) AND NOT EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id))$$;
-- The legacy submit accepts structured category values without inventing a message.
DO $$DECLARE s text;BEGIN s:=pg_get_functiondef('private.portal_request_command_before33(uuid,uuid,integer,jsonb,uuid)'::regprocedure);IF strpos(s,'AND NOT private.templates_has_text20(r.message)')=0 THEN RAISE EXCEPTION 'CATEGORY_INTAKE_CONTRACT';END IF;s:=replace(s,'AND NOT private.templates_has_text20(r.message)','AND NOT EXISTS(SELECT FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id) AND NOT private.templates_has_text20(r.message)');EXECUTE s;END$$;
ALTER FUNCTION private.portal_request_command(uuid,uuid,integer,jsonb,uuid) RENAME TO portal_request_command_before_category_intake;
CREATE FUNCTION private.category_intake_command(o uuid,rid uuid,v integer,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;i private.category_intakes;prior private.category_intake_commands;f public.files;d jsonb;ignored jsonb;BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;m:=private.requests_actor(o,true);SELECT * INTO r FROM public.requests WHERE office_id=o AND id=rid FOR UPDATE;m:=private.requests_actor(o,true);
 SELECT * INTO i FROM private.category_intakes WHERE office_id=o AND request_id=rid;
 IF m.role_code<>'client' OR r.id IS NULL OR r.created_by<>m.user_id OR r.origin<>'portal' OR i.request_id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF k IS NULL OR v IS NULL OR v NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(c) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO prior FROM private.category_intake_commands WHERE office_id=o AND actor_id=m.user_id AND key=k;
 IF prior.key IS NOT NULL THEN IF prior.session_id IS DISTINCT FROM(auth.jwt()->>'session_id')::uuid OR prior.request_id IS DISTINCT FROM rid OR prior.version IS DISTINCT FROM v OR prior.payload<>c THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.category_intake_state_record(r,m);END IF;
 IF r.version<>v OR EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=o AND request_id=rid) OR NOT(r.status='aguardando_cliente' OR(c->>'kind'='hide' AND r.status='cancelado')) OR(c->>'kind'<>'hide' AND (NOT private.category_intake_current(i) OR (i.submitted_at IS NULL AND private.portal_submission_valid33(r) IS NOT TRUE))) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 CASE c->>'kind'
 WHEN 'save' THEN
 PERFORM private.request_shape(c,ARRAY['kind','answers','message']);PERFORM private.category_intake_answers(i.fields,c->'answers',false);PERFORM private.request_text(c->'message',0,2000,true);
 INSERT INTO private.category_intake_revisions(office_id,request_id,version,answers,actor_id)VALUES(o,rid,v+1,c->'answers',m.user_id);UPDATE public.requests SET message=btrim(c->>'message') WHERE office_id=o AND id=rid;
 WHEN 'bind_file' THEN
 PERFORM private.request_shape(c,ARRAY['kind','slot_key','file_id']);SELECT * INTO f FROM public.files WHERE office_id=o AND request_id=rid AND id=private.request_uuid(c->'file_id') AND created_by=m.user_id FOR SHARE;
 IF f.id IS NULL OR f.status IN('removido','rejeitado') OR EXISTS(SELECT FROM private.portal_hidden_files WHERE office_id=o AND file_id=f.id) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.files_actor(o,true,'files.upload');PERFORM private.files_request(o,rid,m,true);
 SELECT x INTO d FROM jsonb_array_elements(i.documents)x WHERE x->>'key'=c->>'slot_key';
 IF d IS NULL OR f.classification<>d->>'classification' OR f.size_bytes>(d->>'max_bytes')::bigint OR NOT(d->'mime_types' ? f.mime_type) OR EXISTS(SELECT FROM private.category_intake_files WHERE office_id=o AND file_id=f.id) OR(SELECT count(*) FROM private.category_intake_files b JOIN public.files ff ON ff.office_id=b.office_id AND ff.id=b.file_id WHERE b.office_id=o AND b.request_id=rid AND b.slot_key=d->>'key' AND ff.status NOT IN('removido','rejeitado') AND NOT EXISTS(SELECT FROM private.portal_hidden_files WHERE office_id=o AND file_id=ff.id))>=(d->>'max_files')::integer THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 INSERT INTO private.category_intake_files(office_id,request_id,file_id,slot_key)VALUES(o,rid,f.id,d->>'key');
 WHEN 'remove_file' THEN
 PERFORM private.request_shape(c,ARRAY['kind','file_id']);IF NOT EXISTS(SELECT FROM public.files WHERE office_id=o AND request_id=rid AND id=private.request_uuid(c->'file_id') AND created_by=m.user_id) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 INSERT INTO private.portal_hidden_files(office_id,file_id)VALUES(o,private.request_uuid(c->'file_id'))ON CONFLICT DO NOTHING;
 WHEN 'submit' THEN
 PERFORM private.request_shape(c,ARRAY['kind']);PERFORM private.category_intake_answers(i.fields,private.category_intake_effective(i),true);
 IF EXISTS(SELECT FROM jsonb_array_elements(i.documents) required_slot WHERE(required_slot->>'required')::boolean AND NOT EXISTS(SELECT FROM private.category_intake_files b JOIN public.files ff ON ff.office_id=b.office_id AND ff.request_id=b.request_id AND ff.id=b.file_id WHERE b.office_id=o AND b.request_id=rid AND b.slot_key=required_slot->>'key' AND ff.created_by=m.user_id AND ff.status IN('quarentena','disponivel') AND NOT EXISTS(SELECT FROM private.portal_hidden_files WHERE office_id=o AND file_id=ff.id))) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 ignored:=private.portal_request_command_before_category_intake(o,rid,v,'{"kind":"resubmit"}',k);UPDATE private.category_intakes SET submitted_at=clock_timestamp()WHERE office_id=o AND request_id=rid AND submitted_at IS NULL;
 WHEN 'hide' THEN PERFORM private.request_shape(c,ARRAY['kind']);INSERT INTO private.portal_request_visibility(office_id,request_id)VALUES(o,rid);
 ELSE RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END CASE;
 IF c->>'kind' NOT IN('submit','hide') THEN UPDATE public.requests SET version=version+1,updated_at=clock_timestamp()WHERE office_id=o AND id=rid;END IF;
 INSERT INTO private.category_intake_commands(office_id,actor_id,session_id,key,request_id,version,payload)VALUES(o,m.user_id,(auth.jwt()->>'session_id')::uuid,k,rid,v,c);
 SELECT * INTO r FROM public.requests WHERE office_id=o AND id=rid;RETURN private.category_intake_state_record(r,m);
END$$;
CREATE FUNCTION private.portal_request_command(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM private.category_intakes WHERE office_id=p_office_id AND request_id=p_request_id) THEN
 IF p_command->>'kind' IN('hide','remove_file','resubmit') THEN PERFORM private.category_intake_command(p_office_id,p_request_id,p_expected_version,CASE WHEN p_command->>'kind'='resubmit' THEN jsonb_set(p_command,'{kind}','"submit"') ELSE p_command END,p_idempotency_key);RETURN private.portal_request_state(p_office_id,p_request_id);END IF;
 IF p_command->>'kind'<>'save' OR NOT EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=p_office_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 RETURN private.portal_request_command_before_category_intake(p_office_id,p_request_id,p_expected_version,p_command,p_idempotency_key);
END$$;
ALTER FUNCTION private.request_detail_record(public.requests,public.memberships,integer) RENAME TO request_detail_record_before_category_intake;
CREATE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.request_detail_record_before_category_intake(r,m,p_page)||CASE WHEN m.role_code<>'client' THEN jsonb_build_object('category_intake',private.category_intake_state_record(r,m)) ELSE '{}'::jsonb END$$;
ALTER FUNCTION private.request_can_work(public.requests,public.memberships) RENAME TO request_can_work_before_category_intake;
CREATE FUNCTION private.request_can_work(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.request_can_work_before_category_intake(r,m) IS TRUE AND NOT EXISTS(SELECT FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id AND submitted_at IS NULL)$$;
DO $$DECLARE s text;BEGIN s:=pg_get_functiondef('private.requests_page_before32(uuid,text,text,text,integer,integer)'::regprocedure);IF strpos(s,'WHERE r.office_id=p_office_id')=0 THEN RAISE EXCEPTION 'CATEGORY_QUEUE_CONTRACT';END IF;s:=replace(s,'WHERE r.office_id=p_office_id','WHERE r.office_id=p_office_id AND NOT EXISTS(SELECT FROM private.category_intakes prep WHERE prep.office_id=r.office_id AND prep.request_id=r.id AND prep.submitted_at IS NULL)');EXECUTE s;END$$;
CREATE FUNCTION private.category_intake_preparation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF current_setting('role',true)='authenticated' AND EXISTS(SELECT FROM private.category_intakes WHERE office_id=OLD.office_id AND request_id=OLD.id AND submitted_at IS NULL) AND NOT EXISTS(SELECT FROM public.memberships WHERE office_id=OLD.office_id AND user_id=auth.uid() AND role_code='client' AND active) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END$$;
CREATE TRIGGER category_intake_preparation BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION private.category_intake_preparation_guard();
-- An already configured category cannot skip its form through the old generic endpoint.
ALTER FUNCTION private.categorized_request_create(uuid,jsonb,uuid) RENAME TO categorized_request_create_before_category_intake;
CREATE FUNCTION private.categorized_request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 PERFORM private.portal_actor31(p_office_id);IF EXISTS(SELECT FROM private.category_intake_forms WHERE office_id=p_office_id AND category_id=private.request_uuid(p_request->'category_id')) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 RETURN private.categorized_request_create_before_category_intake(p_office_id,p_request,p_idempotency_key);END$$;
CREATE FUNCTION private.category_intake_capture() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f private.category_intake_forms;r public.requests;BEGIN
 SELECT * INTO r FROM public.requests WHERE office_id=NEW.office_id AND id=NEW.request_id;
 IF r.origin<>'portal' OR r.status<>'aguardando_cliente' THEN RETURN NEW;END IF;
 SELECT * INTO f FROM private.category_intake_forms WHERE office_id=NEW.office_id AND category_id=NEW.category_id AND enabled;
 IF f.category_id IS NOT NULL THEN INSERT INTO private.category_intakes(office_id,request_id,category_id,revision,instructions,fields,documents,answers,session_id)VALUES(r.office_id,r.id,f.category_id,f.revision,f.instructions,f.fields,f.documents,'{}',(auth.jwt()->>'session_id')::uuid)ON CONFLICT DO NOTHING;END IF;RETURN NEW;
END$$;
CREATE TRIGGER category_intake_capture AFTER INSERT ON private.request_categories FOR EACH ROW EXECUTE FUNCTION private.category_intake_capture();
CREATE FUNCTION private.category_intake_capture_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f private.category_intake_forms;cid uuid;BEGIN
 SELECT private.service_category_id(NEW.office_id,version_id) INTO cid FROM public.request_items WHERE office_id=NEW.office_id AND id=NEW.request_item_id;
 SELECT * INTO f FROM private.category_intake_forms WHERE office_id=NEW.office_id AND category_id=cid AND enabled;
 IF f.category_id IS NOT NULL THEN INSERT INTO private.category_intakes(office_id,request_id,category_id,revision,instructions,fields,documents,answers,session_id)VALUES(NEW.office_id,NEW.request_id,cid,f.revision,f.instructions,f.fields,f.documents,'{}',(auth.jwt()->>'session_id')::uuid)ON CONFLICT DO NOTHING;END IF;RETURN NEW;
END$$;
CREATE TRIGGER category_intake_capture_booking AFTER INSERT ON private.service_intakes33 FOR EACH ROW EXECUTE FUNCTION private.category_intake_capture_booking();
ALTER FUNCTION private.portal_booking_result33(public.requests) RENAME TO portal_booking_result33_before_category_intake;
CREATE FUNCTION private.portal_booking_result33(r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_booking_result33_before_category_intake(r)||CASE WHEN EXISTS(SELECT FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id) THEN jsonb_build_object('category_form',true) ELSE '{}'::jsonb END$$;
ALTER FUNCTION private.portal_request_state_record(public.requests) RENAME TO portal_request_state_record_before_category_intake;
CREATE FUNCTION private.portal_request_state_record(r public.requests) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$DECLARE i private.category_intakes;result jsonb;BEGIN
 result:=private.portal_request_state_record_before_category_intake(r);SELECT * INTO i FROM private.category_intakes WHERE office_id=r.office_id AND request_id=r.id;
 IF i.request_id IS NOT NULL THEN result:=result||jsonb_build_object('category_form',true);IF NOT private.category_intake_current(i) THEN result:=result||jsonb_build_object('can_edit',false,'can_resubmit',false);END IF;END IF;RETURN result;END$$;
-- Request-wide slots on a captured model/service booking use the unchanged default11 policy.
DO $$DECLARE s text;BEGIN s:=pg_get_functiondef('private.files_begin_upload(uuid,jsonb,uuid)'::regprocedure);
 IF strpos(s,'IF EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id) THEN')=0 THEN RAISE EXCEPTION 'CATEGORY_UPLOAD_CONTRACT';END IF;
 s:=replace(s,'IF EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id) THEN','IF EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id) AND NOT(p_input->>''request_item_id'' IS NULL AND EXISTS(SELECT FROM private.category_intakes WHERE office_id=p_office_id AND request_id=r.id)) THEN');EXECUTE s;END$$;
CREATE FUNCTION public.category_intake_form(o uuid,cid uuid,manage boolean DEFAULT false) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.category_intake_form(o,cid,manage)$$;
CREATE FUNCTION public.category_intake_publish(o uuid,cid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.category_intake_publish(o,cid,c,k)$$;
CREATE FUNCTION public.category_intake_open(o uuid,cid uuid,rev integer,answers jsonb,message text,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.category_intake_open(o,cid,rev,answers,message,k)$$;
CREATE FUNCTION public.category_intake_state(o uuid,rid uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.category_intake_state(o,rid)$$;
CREATE FUNCTION public.category_intake_command(o uuid,rid uuid,v integer,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.category_intake_command(o,rid,v,c,k)$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND(p.proname LIKE '%category_intake%' OR p.proname IN('portal_draft33','portal_request_command','request_detail_record','request_can_work','categorized_request_create','portal_booking_result33','portal_request_state_record')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname IN('category_intake_form','category_intake_publish','category_intake_open','category_intake_state','category_intake_command','portal_request_command','categorized_request_create') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;END$$;
NOTIFY pgrst,'reload schema';
