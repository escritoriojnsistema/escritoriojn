-- Digital intake33 extends requests10, service snapshots09, returns12 and Storage11.
CREATE TABLE private.portal_service_forms33(
 office_id uuid NOT NULL,service_id uuid NOT NULL,version_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),enabled boolean NOT NULL,
 instructions text NOT NULL DEFAULT '',updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,service_id),FOREIGN KEY(office_id,service_id,version_id) REFERENCES public.service_versions(office_id,service_id,id)
);
CREATE INDEX portal_service_forms33_version_idx ON private.portal_service_forms33(office_id,service_id,version_id);
CREATE INDEX portal_service_forms33_actor_idx ON private.portal_service_forms33(updated_by);
CREATE TABLE private.portal_service_commands33(
 office_id uuid NOT NULL,service_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(office_id,actor_id,session_id,key),FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id)
);
CREATE INDEX portal_service_commands33_service_idx ON private.portal_service_commands33(office_id,service_id);
CREATE INDEX portal_service_commands33_actor_idx ON private.portal_service_commands33(actor_id);
CREATE TABLE private.service_intakes33(
 office_id uuid NOT NULL,request_id uuid NOT NULL,request_item_id uuid NOT NULL,form_revision integer NOT NULL CHECK(form_revision>0),fields jsonb NOT NULL,answers jsonb NOT NULL,checklist jsonb NOT NULL,
 submitted_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,request_item_id),
 FOREIGN KEY(office_id,request_id,request_item_id) REFERENCES public.request_items(office_id,request_id,id)
);
CREATE INDEX service_intakes33_request_idx ON private.service_intakes33(office_id,request_id,request_item_id);
CREATE TABLE private.service_intake_revisions33(
 office_id uuid NOT NULL,request_item_id uuid NOT NULL,request_version integer NOT NULL,answers jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,request_item_id,request_version),FOREIGN KEY(office_id,request_item_id) REFERENCES private.service_intakes33(office_id,request_item_id)
);
CREATE INDEX service_intake_revisions33_actor_idx ON private.service_intake_revisions33(actor_id);
CREATE INDEX requests_portal33_rate_idx ON public.requests(office_id,created_by,created_at DESC) WHERE origin='portal' AND category<>'account_correction';
DO $$DECLARE t regclass;BEGIN FOREACH t IN ARRAY ARRAY['private.portal_service_forms33'::regclass,'private.portal_service_commands33'::regclass,'private.service_intakes33'::regclass,'private.service_intake_revisions33'::regclass] LOOP EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.portal_service_commands33 FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.service_intake_revisions33 FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.service_intake_guard33() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP='DELETE' OR to_jsonb(NEW)-'submitted_at' IS DISTINCT FROM to_jsonb(OLD)-'submitted_at' OR OLD.submitted_at IS NOT NULL OR NEW.submitted_at IS NULL THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END$$;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE ON private.service_intakes33 FOR EACH ROW EXECUTE FUNCTION private.service_intake_guard33();

CREATE FUNCTION private.service_answers33(defs jsonb,answers jsonb,complete boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f jsonb;k text;v text;BEGIN
 IF jsonb_typeof(defs) IS DISTINCT FROM 'array' OR jsonb_array_length(defs)>12 OR jsonb_typeof(answers) IS DISTINCT FROM 'object' OR(SELECT count(*) FROM jsonb_object_keys(answers))>12 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR k IN SELECT jsonb_object_keys(answers) LOOP IF NOT EXISTS(SELECT FROM jsonb_array_elements(defs)x WHERE x->>'key'=k) OR jsonb_typeof(answers->k) IS DISTINCT FROM 'string' OR char_length(answers->>k)>500 OR(answers->>k)~'[[:cntrl:]]' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;END LOOP;
 FOR f IN SELECT * FROM jsonb_array_elements(defs) LOOP
 v:=coalesce(answers->>(f->>'key'),'');IF complete AND(f->>'required')::boolean AND btrim(v)='' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF v<>'' AND((f->>'type'='number' AND v!~'^-?(0|[1-9][0-9]*)(\.[0-9]+)?$') OR(f->>'type'='date' AND v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF v<>'' AND f->>'type'='date' THEN BEGIN IF to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END;END IF;
 END LOOP;RETURN answers;
END$$;
CREATE FUNCTION private.service_checklist33(o uuid,sid uuid,legacy jsonb) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH model AS(SELECT version,definition FROM private.checklist_model_versions WHERE office_id=o AND service_id=sid AND scope='client' ORDER BY version DESC LIMIT 1),labels AS(
 SELECT value label FROM jsonb_array_elements_text(legacy) UNION SELECT i->>'label' FROM model,LATERAL jsonb_array_elements(definition->'items')i WHERE i->>'requirement'<>'conditional' OR i#>>'{condition,field}'='origin' AND i#>>'{condition,equals}'='portal' OR i#>>'{condition,field}'='priority' AND i#>>'{condition,equals}'='normal')
 SELECT jsonb_build_object('version',coalesce((SELECT version FROM model),0),'labels',coalesce((SELECT jsonb_agg(label ORDER BY label) FROM labels),'[]'::jsonb));
$$;
CREATE FUNCTION private.service_intake_answers33(o uuid,item uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT answers FROM private.service_intake_revisions33 WHERE office_id=o AND request_item_id=item ORDER BY request_version DESC LIMIT 1),(SELECT answers FROM private.service_intakes33 WHERE office_id=o AND request_item_id=item));
$$;
CREATE FUNCTION private.portal_draft33(r public.requests) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT r.origin='portal' AND r.status='aguardando_cliente' AND EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=r.office_id AND request_id=r.id AND submitted_at IS NULL) AND NOT EXISTS(SELECT FROM private.portal_request_visibility WHERE office_id=r.office_id AND request_id=r.id)$$;
CREATE FUNCTION private.portal_booking_result33(r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT jsonb_build_object('request_id',r.id,'protocol',r.protocol,'status',private.request_public_status(r.status),'waiting',r.status='aguardando_responsavel' AND r.assignee_id IS NULL,'draft',private.portal_draft33(r))$$;
CREATE TABLE private.portal_request_limits33(
 request_id uuid PRIMARY KEY,office_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE INDEX portal_request_limits33_window_idx ON private.portal_request_limits33(office_id,actor_id,created_at DESC);
CREATE INDEX portal_request_limits33_request_idx ON private.portal_request_limits33(office_id,request_id);
CREATE INDEX portal_request_limits33_actor_idx ON private.portal_request_limits33(actor_id);
ALTER TABLE private.portal_request_limits33 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.portal_request_limits33 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.portal_request_limits33 FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.portal_rate33() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;n integer;BEGIN
 IF NEW.origin<>'portal' OR NEW.category='account_correction' OR NEW.created_by IS DISTINCT FROM auth.uid() OR current_setting('role',true)<>'authenticated' THEN RETURN NEW;END IF;
 -- Serialized across all opening endpoints, including legacy booking/RPC.
 m:=private.requests_actor(NEW.office_id,true,'requests.create');IF m.role_code<>'client' THEN RETURN NEW;END IF;
 SELECT count(*) INTO n FROM private.portal_request_limits33 WHERE office_id=NEW.office_id AND actor_id=NEW.created_by AND created_at>clock_timestamp()-interval '10 minutes';
 IF n>=20 OR(SELECT count(*) FROM private.portal_request_limits33 WHERE office_id=NEW.office_id AND actor_id=NEW.created_by AND created_at>clock_timestamp()-interval '1 day')>=100 THEN RAISE EXCEPTION 'REQUEST_RATE_LIMIT' USING ERRCODE='PT429';END IF;
 IF NEW.status='aguardando_cliente' AND EXISTS(SELECT FROM private.portal_request_limits33 w JOIN public.requests r ON r.office_id=w.office_id AND r.id=w.request_id WHERE w.office_id=NEW.office_id AND w.actor_id=NEW.created_by AND r.payload_digest=NEW.payload_digest AND w.created_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.portal_request_limits33(request_id,office_id,actor_id)VALUES(NEW.id,NEW.office_id,NEW.created_by);RETURN NEW;
END$$;
CREATE TRIGGER portal_rate33 AFTER INSERT ON public.requests FOR EACH ROW EXECUTE FUNCTION private.portal_rate33();

CREATE FUNCTION private.portal_service_manage33(o uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f private.portal_service_forms33;vid uuid;BEGIN
 PERFORM private.services_actor(o);IF NOT EXISTS(SELECT FROM public.services WHERE office_id=o AND id=sid AND archived_at IS NULL) THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO f FROM private.portal_service_forms33 WHERE office_id=o AND service_id=sid;SELECT id INTO vid FROM public.service_versions WHERE office_id=o AND service_id=sid AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1;
 RETURN jsonb_build_object('service_id',sid,'revision',coalesce(f.revision,0),'enabled',coalesce(f.enabled,false),'version_id',f.version_id,'current_version_id',vid,'instructions',coalesce(f.instructions,''),'can_manage',private.current_permissions(o) @> ARRAY['services.manage'] AND NOT EXISTS(SELECT FROM private.service_categories WHERE office_id=o AND id=private.service_category_id(o,vid) AND system_key='documents'));
END$$;
CREATE FUNCTION private.portal_service_publish33(o uuid,sid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;f private.portal_service_forms33;sv public.service_versions;prior private.portal_service_commands33;sid_session uuid;why text;BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;actor:=private.services_actor(o,true);PERFORM 1 FROM public.services WHERE office_id=o AND id=sid AND archived_at IS NULL FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM private.request_shape(c,ARRAY['expected_revision','version_id','enabled','instructions','reason']);IF k IS NULL OR jsonb_typeof(c->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(c->'expected_revision') IS DISTINCT FROM 'number' OR c->>'expected_revision'!~'^(0|[1-9][0-9]{0,8})$' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 why:=private.request_text(c->'reason',1,500);PERFORM private.request_text(c->'instructions',0,1000);sid_session:=(auth.jwt()->>'session_id')::uuid;
 SELECT * INTO prior FROM private.portal_service_commands33 WHERE office_id=o AND actor_id=actor AND session_id=sid_session AND key=k;
 IF prior.key IS NOT NULL THEN IF prior.service_id<>sid OR prior.payload<>c THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.portal_service_manage33(o,sid);END IF;
 SELECT * INTO f FROM private.portal_service_forms33 WHERE office_id=o AND service_id=sid FOR UPDATE;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o AND service_id=sid AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1 FOR SHARE;
 IF coalesce(f.revision,0)<>(c->>'expected_revision')::integer OR sv.id IS DISTINCT FROM private.request_uuid(c->'version_id') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT FROM private.service_categories cat WHERE cat.office_id=o AND cat.id=private.service_category_id(o,sv.id) AND(cat.archived_at IS NOT NULL OR cat.system_key='documents')) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 INSERT INTO private.portal_service_forms33(office_id,service_id,version_id,revision,enabled,instructions,updated_by)VALUES(o,sid,sv.id,1,(c->>'enabled')::boolean,btrim(c->>'instructions'),actor) ON CONFLICT(office_id,service_id) DO UPDATE SET version_id=EXCLUDED.version_id,revision=portal_service_forms33.revision+1,enabled=EXCLUDED.enabled,instructions=EXCLUDED.instructions,updated_by=actor,updated_at=clock_timestamp();
 INSERT INTO private.portal_service_commands33(office_id,service_id,actor_id,session_id,key,payload)VALUES(o,sid,actor,sid_session,k,c);
 PERFORM private.team_audit(o,actor,'portal.service_published','service',sid,k,'{}');RETURN private.portal_service_manage33(o,sid);
END$$;
CREATE FUNCTION private.portal_service_projection33(f private.portal_service_forms33) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE sv public.service_versions;cat private.service_categories;checklist jsonb;BEGIN
 IF NOT f.enabled OR NOT EXISTS(SELECT FROM public.services WHERE office_id=f.office_id AND id=f.service_id AND archived_at IS NULL) THEN RETURN NULL;END IF;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=f.office_id AND service_id=f.service_id AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1;
 SELECT * INTO cat FROM private.service_categories WHERE office_id=f.office_id AND id=private.service_category_id(f.office_id,sv.id) AND archived_at IS NULL;
 IF sv.id IS DISTINCT FROM f.version_id OR cat.id IS NULL OR cat.system_key='documents' THEN RETURN NULL;END IF;checklist:=private.service_checklist33(f.office_id,f.service_id,sv.definition->'checklist');
 RETURN jsonb_build_object('service_id',f.service_id,'version_id',sv.id,'revision',f.revision,'name',sv.name,'code',sv.definition->>'code','category_id',cat.id,'category_name',cat.name,'unit',sv.unit,'price_cents',sv.price_cents,'quantity_min',sv.definition->'quantity_min','quantity_max',sv.definition->'quantity_max','fields',sv.definition->'fields','checklist',checklist->'labels','checklist_version',checklist->'version','instructions',f.instructions);
END$$;
CREATE FUNCTION private.portal_service_form33(o uuid,sid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;BEGIN m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;SELECT private.portal_service_projection33(f) INTO result FROM private.portal_service_forms33 f WHERE f.office_id=o AND f.service_id=sid;IF result IS NULL THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;RETURN result;END$$;
CREATE FUNCTION private.portal_services33(o uuid,cid uuid,q text,page integer,size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;n bigint;items jsonb;BEGIN m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF cid IS NULL OR q IS NULL OR char_length(q)>120 OR q~'[[:cntrl:]]' OR page IS NULL OR page NOT BETWEEN 1 AND 100000 OR size IS NULL OR size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS MATERIALIZED(SELECT private.portal_service_projection33(f)v FROM private.portal_service_forms33 f WHERE f.office_id=o),filtered AS(SELECT v FROM candidates WHERE v IS NOT NULL AND v->>'category_id'=cid::text AND(btrim(q)='' OR strpos(lower(v->>'name'),lower(btrim(q)))>0)),subset AS(SELECT v FROM filtered ORDER BY v->>'name',v->>'service_id' LIMIT size OFFSET(page-1)*size)
 SELECT(SELECT count(*) FROM filtered),coalesce((SELECT jsonb_agg(v) FROM subset),'[]'::jsonb) INTO n,items;RETURN jsonb_build_object('items',items,'total',n,'page',page,'page_size',size);
END$$;
CREATE FUNCTION private.portal_request_resume33(o uuid,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN PERFORM 1 FROM public.offices WHERE id=o FOR SHARE;m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;IF k IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests x WHERE x.office_id=o AND x.created_by=m.user_id AND x.origin='portal' AND x.idempotency_key=k AND private.portal_request_visible32(x,m);
 IF r.id IS NULL THEN RETURN NULL;END IF;RETURN private.portal_booking_result33(r);
END$$;

CREATE FUNCTION private.portal_submission_valid33(r public.requests) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE si private.service_intakes33;di private.document_intakes;it public.request_items;f private.portal_service_forms33;o private.document_offerings;projection jsonb;BEGIN
 FOR si IN SELECT * FROM private.service_intakes33 WHERE office_id=r.office_id AND request_id=r.id LOOP
 SELECT * INTO it FROM public.request_items WHERE office_id=r.office_id AND id=si.request_item_id;
 IF EXISTS(SELECT FROM public.services WHERE office_id=r.office_id AND id=it.service_id AND archived_at IS NOT NULL) THEN RETURN false;END IF;
 SELECT * INTO di FROM private.document_intakes WHERE office_id=r.office_id AND request_item_id=si.request_item_id;
 IF di.id IS NOT NULL THEN SELECT * INTO o FROM private.document_offerings WHERE office_id=r.office_id AND template_id=di.template_id;projection:=private.document_offer_projection(o,clock_timestamp());
 IF projection IS NULL OR o.revision<>si.form_revision OR projection->>'service_version_id' IS DISTINCT FROM it.version_id::text OR projection->>'template_version_id' IS DISTINCT FROM di.template_version_id::text THEN RETURN false;END IF;
 ELSE SELECT * INTO f FROM private.portal_service_forms33 WHERE office_id=r.office_id AND service_id=it.service_id;projection:=private.portal_service_projection33(f);
 IF projection IS NULL OR f.revision<>si.form_revision OR f.version_id IS DISTINCT FROM it.version_id THEN RETURN false;END IF;END IF;
 END LOOP;RETURN true;
END$$;
CREATE FUNCTION private.portal_service_open33(o uuid,v jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;sv public.service_versions;s public.services;f private.portal_service_forms33;projection jsonb;answers jsonb;item uuid;cat private.service_categories;digest text;result jsonb;snap jsonb;v_message33 text;protocol_number33 bigint;
BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;m:=private.portal_actor31(o);IF m.role_code<>'client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.request_shape(v,ARRAY['service_id','version_id','revision','answers','quantity','message','checklist_version']);IF k IS NULL OR jsonb_typeof(v->'revision') IS DISTINCT FROM 'number' OR v->>'revision'!~'^[1-9][0-9]{0,8}$' OR jsonb_typeof(v->'quantity') IS DISTINCT FROM 'number' OR v->>'quantity'!~'^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 v_message33:=private.request_text(v->'message',0,2000,true);digest:=encode(extensions.digest(jsonb_build_object('service_intake33',v)::text,'sha256'),'hex');
 SELECT * INTO r FROM public.requests WHERE office_id=o AND created_by=m.user_id AND idempotency_key=k;
 IF r.id IS NOT NULL THEN IF private.portal_draft33(r) AND private.portal_submission_valid33(r) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;IF r.payload_digest<>digest OR private.portal_request_visible32(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.portal_booking_result33(r);END IF;
 IF EXISTS(SELECT FROM public.requests WHERE office_id=o AND created_by=m.user_id AND payload_digest=digest AND created_at>clock_timestamp()-interval '5 minutes') THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO s FROM public.services WHERE office_id=o AND id=private.request_uuid(v->'service_id') AND archived_at IS NULL FOR SHARE;SELECT * INTO f FROM private.portal_service_forms33 WHERE office_id=o AND service_id=s.id FOR SHARE;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o AND service_id=s.id AND effective_from<=clock_timestamp() ORDER BY effective_from DESC LIMIT 1 FOR SHARE;projection:=private.portal_service_projection33(f);
 IF projection IS NULL OR sv.id IS DISTINCT FROM private.request_uuid(v->'version_id') OR f.revision<>(v->>'revision')::integer OR projection->'checklist_version' IS DISTINCT FROM v->'checklist_version' THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 answers:=private.service_answers33(sv.definition->'fields',v->'answers');IF(v->>'quantity')::integer NOT BETWEEN(sv.definition->>'quantity_min')::integer AND(sv.definition->>'quantity_max')::integer THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 m:=private.portal_actor31(o);SELECT * INTO cat FROM private.service_categories WHERE office_id=o AND id=private.service_category_id(o,sv.id) FOR SHARE;
 -- A preparation is the existing request10; the immutable item09 is captured once.
 INSERT INTO private.request_counters(office_id,last_number)VALUES(o,1)ON CONFLICT(office_id)DO UPDATE SET last_number=private.request_counters.last_number+1 RETURNING last_number INTO protocol_number33;
 INSERT INTO public.requests(office_id,protocol,title,origin,status,created_by,assignee_id,customer_id,priority,priority_reason,message,idempotency_key,payload_digest,triaged_at)
 VALUES(o,'AT-'||lpad(protocol_number33::text,greatest(6,char_length(protocol_number33::text)),'0'),sv.name,'portal','aguardando_cliente',m.user_id,NULL,NULL,'normal','',v_message33,k,digest,NULL)RETURNING * INTO r;
 INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256)VALUES(o,r.id,cat.id,cat.name,m.user_id,k,digest);
 snap:=private.services_snapshot(s,sv,(v->>'quantity')::integer,'{"kind":"none","value":0,"reason":""}',ARRAY(SELECT jsonb_array_elements_text(sv.definition->'required_capabilities')));
 INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)VALUES(o,r.id,s.id,sv.id,snap,answers,'[]',sv.definition->'checklist')RETURNING id INTO item;
 INSERT INTO private.service_intakes33(office_id,request_id,request_item_id,form_revision,fields,answers,checklist)VALUES(o,r.id,item,f.revision,sv.definition->'fields',answers,projection->'checklist');
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,to_status)VALUES(o,r.id,'created',m.user_id,r.status);
 PERFORM private.emit_business_event(o,'requests.created','request',r.id,k,'{}');RETURN private.portal_booking_result33(r);
END$$;

-- Full command body is reconciled before stripping the service namespace for legacy12.
CREATE TABLE private.service_intake_commands33(
 office_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),session_id uuid NOT NULL,key uuid NOT NULL,expected_version integer NOT NULL,payload jsonb NOT NULL,
 PRIMARY KEY(office_id,actor_id,key),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE INDEX service_intake_commands33_request_idx ON private.service_intake_commands33(office_id,request_id);
CREATE INDEX service_intake_commands33_actor_idx ON private.service_intake_commands33(actor_id);
ALTER TABLE private.service_intake_commands33 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.service_intake_commands33 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON private.service_intake_commands33 FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
ALTER FUNCTION private.portal_request_state_record(public.requests) RENAME TO portal_request_state_record_before33;
CREATE FUNCTION private.portal_request_state_record(r public.requests) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;items jsonb:='[]';x jsonb;s private.service_intakes33;extra jsonb;answers jsonb;item public.request_items;BEGIN
 result:=private.portal_request_state_record_before33(r);
 FOR x IN SELECT * FROM jsonb_array_elements(result->'inputs') LOOP
 SELECT * INTO s FROM private.service_intakes33 WHERE office_id=r.office_id AND request_item_id=(x->>'item_id')::uuid;
 IF s.request_item_id IS NOT NULL THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('key','_s33.'||(f->>'key'),'label',f->>'label','type',f->>'type','required',f->'required')),'[]') INTO extra FROM jsonb_array_elements(s.fields)f;
 SELECT coalesce(jsonb_object_agg('_s33.'||key,value),'{}') INTO answers FROM jsonb_each(private.service_intake_answers33(r.office_id,s.request_item_id));
 SELECT * INTO item FROM public.request_items WHERE office_id=r.office_id AND id=s.request_item_id;
 x:=x||jsonb_build_object('fields',(x->'fields')||extra,'answers',(x->'answers')||answers,'checklist',s.checklist,'upload_policy',private.files_policy_record(r.office_id,item.service_id),'quantity',item.snapshot->'quantity','unit',item.snapshot#>'{definition,unit}','total_cents',item.snapshot->'total_cents');
 END IF;items:=items||jsonb_build_array(x);
 END LOOP;
 FOR s IN SELECT * FROM private.service_intakes33 si WHERE si.office_id=r.office_id AND si.request_id=r.id AND NOT EXISTS(SELECT FROM private.document_intakes di WHERE di.office_id=r.office_id AND di.request_item_id=si.request_item_id) LOOP
 SELECT * INTO item FROM public.request_items WHERE office_id=r.office_id AND id=s.request_item_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key','_s33.'||(f->>'key'),'label',f->>'label','type',f->>'type','required',f->'required')),'[]') INTO extra FROM jsonb_array_elements(s.fields)f;
 SELECT coalesce(jsonb_object_agg('_s33.'||key,value),'{}') INTO answers FROM jsonb_each(private.service_intake_answers33(r.office_id,s.request_item_id));
 items:=items||jsonb_build_array(jsonb_build_object('item_id',s.request_item_id,'name',item.snapshot#>>'{definition,name}','fields',extra,'answers',answers,'checklist',s.checklist,'upload_policy',private.files_policy_record(r.office_id,item.service_id),'quantity',item.snapshot->'quantity','unit',item.snapshot#>'{definition,unit}','total_cents',item.snapshot->'total_cents'));
 END LOOP;
 RETURN result||jsonb_build_object('inputs',items,'draft',private.portal_draft33(r))||CASE WHEN private.portal_draft33(r) AND private.portal_submission_valid33(r) IS NOT TRUE THEN jsonb_build_object('can_edit',false,'can_resubmit',false) ELSE '{}'::jsonb END;
END$$;
ALTER FUNCTION private.portal_request_command(uuid,uuid,integer,jsonb,uuid) RENAME TO portal_request_command_before33;
-- Keep the legacy validator, versions/history/hiding/dispatch; acknowledge typed service intake too.
DO $$DECLARE s text;BEGIN s:=pg_get_functiondef('private.portal_request_command_before33(uuid,uuid,integer,jsonb,uuid)'::regprocedure);
 s:=replace(s,'AND NOT private.templates_has_text20(r.message)','AND NOT EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=p_office_id AND request_id=r.id) AND NOT private.templates_has_text20(r.message)');
 s:=replace(s,'''Reenviado pelo cliente''','CASE WHEN private.portal_draft33(r) THEN ''Enviado pelo cliente'' ELSE ''Reenviado pelo cliente'' END');EXECUTE s;END$$;
CREATE FUNCTION private.portal_request_command(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;prior private.service_intake_commands33;cmd jsonb;filtered jsonb:='[]';changes jsonb:='[]';x jsonb;s private.service_intakes33;ans jsonb;docans jsonb;result jsonb;current_version integer;BEGIN
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;m:=private.requests_actor(p_office_id,true);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;m:=private.requests_actor(p_office_id,true);
 IF m.role_code<>'client' OR r.id IS NULL OR r.origin<>'portal' OR r.created_by<>m.user_id OR r.category='account_correction' THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF NOT EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=p_office_id AND request_id=r.id) THEN RETURN private.portal_request_command_before33(p_office_id,p_request_id,p_expected_version,p_command,p_idempotency_key);END IF;
 IF p_idempotency_key IS NULL OR p_expected_version IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO prior FROM private.service_intake_commands33 WHERE office_id=p_office_id AND actor_id=m.user_id AND key=p_idempotency_key;
 IF prior.key IS NOT NULL THEN IF prior.request_id<>r.id OR prior.session_id IS DISTINCT FROM(auth.jwt()->>'session_id')::uuid OR prior.expected_version<>p_expected_version OR prior.payload<>p_command THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.portal_request_state_record(r);END IF;
 cmd:=p_command;
 IF p_command->>'kind'='save' THEN
 PERFORM private.request_shape(p_command,ARRAY['kind','title','message','inputs']);
 IF jsonb_typeof(p_command->'inputs') IS DISTINCT FROM 'array' OR jsonb_array_length(p_command->'inputs')<>jsonb_array_length(private.portal_request_state_record(r)->'inputs') OR(SELECT count(DISTINCT v->>'item_id') FROM jsonb_array_elements(p_command->'inputs')v)<>jsonb_array_length(p_command->'inputs') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(p_command->'inputs') LOOP
 PERFORM private.request_shape(x,ARRAY['item_id','answers']);SELECT * INTO s FROM private.service_intakes33 WHERE office_id=p_office_id AND request_id=r.id AND request_item_id=private.request_uuid(x->'item_id');
 IF jsonb_typeof(x->'answers') IS DISTINCT FROM 'object' OR(SELECT count(*) FROM jsonb_object_keys(x->'answers'))>92 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF s.request_item_id IS NOT NULL THEN
 SELECT coalesce(jsonb_object_agg(substr(key,6),value),'{}') INTO ans FROM jsonb_each(x->'answers') WHERE left(key,5)='_s33.';
 PERFORM private.service_answers33(s.fields,ans,false);changes:=changes||jsonb_build_array(jsonb_build_object('item_id',s.request_item_id,'answers',ans));END IF;
 SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO docans FROM jsonb_each(x->'answers') WHERE left(key,5)<>'_s33.';
 IF EXISTS(SELECT FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id AND request_item_id=private.request_uuid(x->'item_id')) THEN filtered:=filtered||jsonb_build_array(jsonb_build_object('item_id',x->'item_id','answers',docans));
 ELSIF s.request_item_id IS NULL OR docans<>'{}'::jsonb THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;cmd:=jsonb_set(cmd,'{inputs}',filtered);
 ELSIF p_command->>'kind'='resubmit' THEN
 IF private.portal_draft33(r) AND private.portal_submission_valid33(r) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 FOR s IN SELECT * FROM private.service_intakes33 WHERE office_id=p_office_id AND request_id=r.id LOOP PERFORM private.service_answers33(s.fields,private.service_intake_answers33(p_office_id,s.request_item_id));END LOOP;
 END IF;
 result:=private.portal_request_command_before33(p_office_id,p_request_id,p_expected_version,cmd,p_idempotency_key);SELECT version INTO current_version FROM public.requests WHERE office_id=p_office_id AND id=r.id;
 FOR x IN SELECT * FROM jsonb_array_elements(changes) LOOP INSERT INTO private.service_intake_revisions33(office_id,request_item_id,request_version,answers,actor_id)VALUES(p_office_id,(x->>'item_id')::uuid,current_version,x->'answers',m.user_id);END LOOP;
 IF p_command->>'kind'='resubmit' THEN UPDATE private.service_intakes33 SET submitted_at=clock_timestamp() WHERE office_id=p_office_id AND request_id=r.id AND submitted_at IS NULL;END IF;
 INSERT INTO private.service_intake_commands33(office_id,request_id,actor_id,session_id,key,expected_version,payload)VALUES(p_office_id,r.id,m.user_id,(auth.jwt()->>'session_id')::uuid,p_idempotency_key,p_expected_version,p_command);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=r.id;RETURN private.portal_request_state_record(r);
END$$;
ALTER FUNCTION private.request_detail_record(public.requests,public.memberships,integer) RENAME TO request_detail_record_before33;
CREATE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;items jsonb;BEGIN result:=private.request_detail_record_before33(r,m,p_page);
 IF m.role_code<>'client' AND EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=r.office_id AND request_id=r.id) THEN
 SELECT jsonb_agg(CASE WHEN private.service_intake_answers33(r.office_id,(x->>'id')::uuid) IS NOT NULL THEN jsonb_set(x,'{fields}',private.service_intake_answers33(r.office_id,(x->>'id')::uuid)) ELSE x END) INTO items FROM jsonb_array_elements(result->'items')x;
 result:=jsonb_set(result,'{items}',coalesce(items,'[]'));END IF;RETURN result;
END$$;

ALTER FUNCTION private.document_offer_projection(private.document_offerings,timestamptz) RENAME TO document_offer_projection_before33;
CREATE FUNCTION private.document_offer_projection(o private.document_offerings,at_time timestamptz DEFAULT clock_timestamp()) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;sv public.service_versions;checklist jsonb;BEGIN result:=private.document_offer_projection_before33(o,at_time);IF result IS NULL THEN RETURN NULL;END IF;SELECT * INTO sv FROM public.service_versions WHERE office_id=o.office_id AND id=(result->>'service_version_id')::uuid;
 checklist:=private.service_checklist33(o.office_id,o.service_id,sv.definition->'checklist');RETURN result||jsonb_build_object('service_fields',sv.definition->'fields','quantity_min',sv.definition->'quantity_min','quantity_max',sv.definition->'quantity_max','service_checklist',checklist->'labels','checklist_version',checklist->'version','can_book',true);
END$$;

-- Extend the actual canonical booking before its dispatch/notification effects.
DO $patch33$ DECLARE body text;BEGIN body:=pg_get_functiondef('private.document_booking_create(uuid,jsonb,uuid)'::regprocedure);
IF strpos(body,'at_time timestamptz;BEGIN')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'at_time timestamptz;BEGIN','at_time timestamptz;prepare33 boolean:=p_value ? ''intake'';service33 jsonb:=''{}'';quantity33 integer:=1;checklist33 jsonb;BEGIN');
IF strpos(body,'OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>8')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>8','OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>(CASE WHEN prepare33 THEN 9 ELSE 8 END)');
IF strpos(body,'customer:=private.request_uuid(p_value->''customer_id'',true);')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'customer:=private.request_uuid(p_value->''customer_id'',true);','IF prepare33 AND m.role_code<>''client'' THEN RAISE EXCEPTION ''REQUESTS_FORBIDDEN'' USING ERRCODE=''PT403'';END IF;customer:=private.request_uuid(p_value->''customer_id'',true);');
IF strpos(body,'IF r.id IS NOT NULL THEN IF r.payload_digest<>digest')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'IF r.id IS NOT NULL THEN IF r.payload_digest<>digest','IF r.id IS NOT NULL THEN IF prepare33 AND private.portal_request_visible32(r,m) IS NOT TRUE THEN RAISE EXCEPTION ''REQUEST_NOT_FOUND'' USING ERRCODE=''PT404'';END IF;IF prepare33 AND private.portal_draft33(r) AND private.portal_submission_valid33(r) IS NOT TRUE THEN RAISE EXCEPTION ''REQUEST_CONFLICT'' USING ERRCODE=''PT409'';END IF;IF r.payload_digest<>digest');
IF strpos(body,'jsonb_build_object(''request_id'',r.id,''protocol'',r.protocol,''status'',private.request_public_status(r.status),''waiting'',r.assignee_id IS NULL AND r.status=''aguardando_responsavel'')')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'jsonb_build_object(''request_id'',r.id,''protocol'',r.protocol,''status'',private.request_public_status(r.status),''waiting'',r.assignee_id IS NULL AND r.status=''aguardando_responsavel'')','CASE WHEN prepare33 THEN private.portal_booking_result33(r) ELSE jsonb_build_object(''request_id'',r.id,''protocol'',r.protocol,''status'',private.request_public_status(r.status),''waiting'',r.assignee_id IS NULL AND r.status=''aguardando_responsavel'') END');
IF strpos(body,'IF (sv.definition->>''quantity_min'')::integer>1 OR (sv.definition->>''quantity_max'')::integer<1 OR (sv.definition->>''participants_min'')::integer>0 OR jsonb_array_length(sv.definition->''fields'')>0 THEN')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'IF (sv.definition->>''quantity_min'')::integer>1 OR (sv.definition->>''quantity_max'')::integer<1 OR (sv.definition->>''participants_min'')::integer>0 OR jsonb_array_length(sv.definition->''fields'')>0 THEN','IF prepare33 THEN
 PERFORM private.request_shape(p_value->''intake'',ARRAY[''answers'',''quantity'',''message'',''checklist_version'']);
 IF jsonb_typeof(p_value#>''{intake,quantity}'') IS DISTINCT FROM ''number'' OR p_value#>>''{intake,quantity}''!~''^[1-9][0-9]{0,5}$'' THEN RAISE EXCEPTION ''REQUEST_VALIDATION'' USING ERRCODE=''PT422'';END IF;
 quantity33:=(p_value#>>''{intake,quantity}'')::integer;IF quantity33 NOT BETWEEN(sv.definition->>''quantity_min'')::integer AND(sv.definition->>''quantity_max'')::integer THEN RAISE EXCEPTION ''REQUEST_VALIDATION'' USING ERRCODE=''PT422'';END IF;
 service33:=private.service_answers33(sv.definition->''fields'',p_value#>''{intake,answers}'');PERFORM private.request_text(p_value#>''{intake,message}'',0,2000,true);
 checklist33:=private.service_checklist33(p_office_id,s.id,sv.definition->''checklist'');IF checklist33->''version'' IS DISTINCT FROM p_value#>''{intake,checklist_version}'' THEN RAISE EXCEPTION ''TEMPLATE_CONFLICT'' USING ERRCODE=''PT409'';END IF;
 END IF;
 IF NOT prepare33 AND ((sv.definition->>''quantity_min'')::integer>1 OR (sv.definition->>''quantity_max'')::integer<1 OR (sv.definition->>''participants_min'')::integer>0 OR jsonb_array_length(sv.definition->''fields'')>0) THEN');
IF strpos(body,'private.services_snapshot(s,sv,1,')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'private.services_snapshot(s,sv,1,','private.services_snapshot(s,sv,quantity33,');
IF strpos(body,'CASE WHEN assignee IS NULL THEN ''aguardando_responsavel'' ELSE ''aberto'' END,m.user_id')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'CASE WHEN assignee IS NULL THEN ''aguardando_responsavel'' ELSE ''aberto'' END,m.user_id','CASE WHEN prepare33 THEN ''aguardando_cliente'' WHEN assignee IS NULL THEN ''aguardando_responsavel'' ELSE ''aberto'' END,m.user_id');
IF strpos(body,'customer,''normal'','''','''',p_idempotency_key')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'customer,''normal'','''','''',p_idempotency_key','customer,''normal'','''',CASE WHEN prepare33 THEN btrim(p_value#>>''{intake,message}'') ELSE '''' END,p_idempotency_key');
IF strpos(body,'s.id,sv.id,snap,''{}'',''[]'',')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'s.id,sv.id,snap,''{}'',''[]'',','s.id,sv.id,snap,service33,''[]'',');
IF strpos(body,'IF assignee IS NOT NULL THEN INSERT INTO private.request_assignments')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'IF assignee IS NOT NULL THEN INSERT INTO private.request_assignments','IF prepare33 THEN INSERT INTO private.service_intakes33(office_id,request_id,request_item_id,form_revision,fields,answers,checklist)VALUES(p_office_id,r.id,it.id,o.revision,sv.definition->''fields'',service33,checklist33->''labels'');END IF;IF assignee IS NOT NULL THEN INSERT INTO private.request_assignments');
IF strpos(body,'IF assignee IS NULL AND origin IN(''portal'',''whatsapp'')')=0 THEN RAISE EXCEPTION 'BOOKING33_CONTRACT';END IF;
body:=replace(body,'IF assignee IS NULL AND origin IN(''portal'',''whatsapp'')','IF NOT prepare33 AND assignee IS NULL AND origin IN(''portal'',''whatsapp'')');
EXECUTE body;END$patch33$;
CREATE FUNCTION public.portal_services33(o uuid,cid uuid,q text,page integer,size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_services33(o,cid,q,page,size)$$;
CREATE FUNCTION public.portal_service_form33(o uuid,sid uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_service_form33(o,sid)$$;
CREATE FUNCTION public.portal_service_open33(o uuid,v jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_service_open33(o,v,k)$$;
CREATE FUNCTION public.portal_request_resume33(o uuid,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_request_resume33(o,k)$$;
CREATE FUNCTION public.portal_service_manage33(o uuid,sid uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_service_manage33(o,sid)$$;
CREATE FUNCTION public.portal_service_publish33(o uuid,sid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.portal_service_publish33(o,sid,c,k)$$;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure sig,p.proname,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND(p.proname LIKE '%33' OR n.nspname='private' AND p.proname IN('portal_request_state_record','portal_request_command','request_detail_record','document_offer_projection')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
 IF f.proname IN('portal_services33','portal_service_form33','portal_service_open33','portal_request_resume33','portal_service_manage33','portal_service_publish33','portal_request_command') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;
END$$;
NOTIFY pgrst,'reload schema';
-- Preparation is visible to its client but is not operational work for the team.
ALTER FUNCTION private.request_can_work(public.requests,public.memberships) RENAME TO request_can_work_before33;
CREATE FUNCTION private.request_can_work(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT private.request_can_work_before33(r,m) IS TRUE AND NOT EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=r.office_id AND request_id=r.id AND submitted_at IS NULL)$$;
REVOKE ALL ON FUNCTION private.request_can_work(public.requests,public.memberships),private.request_can_work_before33(public.requests,public.memberships) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.portal_preparation_guard33() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF current_setting('role',true)='authenticated' AND EXISTS(SELECT FROM private.service_intakes33 WHERE office_id=OLD.office_id AND request_id=OLD.id AND submitted_at IS NULL) AND NOT EXISTS(SELECT FROM public.memberships WHERE office_id=OLD.office_id AND user_id=auth.uid() AND role_code='client' AND active) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;END$$;
CREATE TRIGGER portal_preparation33 BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION private.portal_preparation_guard33();
REVOKE ALL ON FUNCTION private.portal_preparation_guard33() FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE s text;BEGIN s:=pg_get_functiondef('private.requests_page_before32(uuid,text,text,text,integer,integer)'::regprocedure);
 IF strpos(s,'WHERE r.office_id=p_office_id')=0 THEN RAISE EXCEPTION 'PORTAL_QUEUE33_CONTRACT';END IF;
 s:=replace(s,'WHERE r.office_id=p_office_id','WHERE r.office_id=p_office_id AND NOT EXISTS(SELECT FROM private.service_intakes33 prep WHERE prep.office_id=r.office_id AND prep.request_id=r.id AND prep.submitted_at IS NULL)');EXECUTE s;END$$;
