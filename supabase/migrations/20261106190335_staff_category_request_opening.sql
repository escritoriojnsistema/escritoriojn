-- Category-first staff opening. Existing service/booking paths remain unchanged.
CREATE TABLE private.staff_category_request_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),idempotency_key uuid NOT NULL,
 request_id uuid NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 PRIMARY KEY(office_id,actor_id,idempotency_key),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id)
);
CREATE INDEX staff_category_request_commands_actor_idx ON private.staff_category_request_commands(actor_id);
CREATE INDEX staff_category_request_commands_request_idx ON private.staff_category_request_commands(office_id,request_id);
ALTER TABLE private.staff_category_request_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.staff_category_request_commands FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER staff_category_request_commands_immutable BEFORE UPDATE OR DELETE ON private.staff_category_request_commands FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
ALTER FUNCTION private.request_preintake_create(uuid,jsonb,uuid) RENAME TO request_preintake_create_before_category_opening;
REVOKE ALL ON FUNCTION private.request_preintake_create_before_category_opening(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.staff_category_request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;target public.memberships;c private.service_categories;r public.requests;prior private.staff_category_request_commands;digest text;nm text;msg text;note text;reason text;cust uuid;assignee uuid;n bigint;result jsonb;collect boolean;
BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.request_shape(p_request,ARRAY['origin','category_id','title','message','customer_id','assignee_id','priority','priority_reason','items','internal_note']);
 IF p_idempotency_key IS NULL OR p_request->>'origin' IS NULL OR p_request->>'origin' NOT IN('presencial','whatsapp') OR p_request->>'priority' IS NULL OR p_request->>'priority' NOT IN('normal','urgent') OR jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_request->'items')>10 THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 nm:=private.request_text(p_request->'title',1,120);msg:=private.request_text(p_request->'message',0,2000,true);note:=private.request_text(p_request->'internal_note',0,2000,true);reason:=private.request_text(p_request->'priority_reason',CASE WHEN p_request->>'priority'='urgent' THEN 1 ELSE 0 END,500);
 IF p_request->>'priority'='normal' AND reason<>'' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 cust:=private.request_uuid(p_request->'customer_id',true);assignee:=private.request_uuid(p_request->'assignee_id',true);
 digest:=encode(extensions.digest(p_request::text,'sha256'),'hex');
 SELECT * INTO prior FROM private.staff_category_request_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key;
 IF prior.request_id IS NOT NULL THEN IF prior.payload_sha256<>digest THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.request_detail(p_office_id,prior.request_id,1);END IF;
 IF EXISTS(SELECT FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key) THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT * INTO c FROM private.service_categories WHERE office_id=p_office_id AND id=private.request_uuid(p_request->'category_id') AND archived_at IS NULL FOR SHARE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF cust IS NOT NULL THEN PERFORM private.request_customer(p_office_id,cust,m.user_id);END IF;
 IF assignee IS NOT NULL THEN PERFORM private.request_assignee(p_office_id,assignee);END IF;
 -- requests_actor locks the office and verifies session/capabilities again after waits.
 m:=private.requests_actor(p_office_id,true,'requests.create');
 collect:=NOT private.member_execution_level(m,c.execution_level);
 IF collect THEN
  IF jsonb_array_length(p_request->'items')<>0 OR assignee IS NOT NULL THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  result:=private.request_preintake_create_before_category_opening(p_office_id,jsonb_build_object('origin',p_request->'origin','title',nm,'message',msg,'customer_id',cust,'category_id',c.id,'internal_note',note),p_idempotency_key);
  UPDATE public.requests SET priority=p_request->>'priority',priority_reason=reason WHERE office_id=p_office_id AND id=(result->>'id')::uuid RETURNING * INTO r;
 ELSE
  assignee:=coalesce(assignee,m.id);
  SELECT * INTO target FROM public.memberships WHERE office_id=p_office_id AND id=assignee AND active FOR SHARE;
  m:=private.requests_actor(p_office_id,true,'requests.create');
  IF NOT private.member_execution_level(m,c.execution_level) OR NOT private.member_execution_level(target,c.execution_level) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  INSERT INTO private.request_counters(office_id,last_number) VALUES(p_office_id,1) ON CONFLICT(office_id) DO UPDATE SET last_number=private.request_counters.last_number+1 RETURNING last_number INTO n;
  -- Store category identity before assigning; request guards see the canonical level.
  INSERT INTO public.requests(office_id,protocol,title,origin,status,created_by,customer_id,priority,priority_reason,message,idempotency_key,payload_digest,triaged_at)
  VALUES(p_office_id,'AT-'||lpad(n::text,greatest(6,char_length(n::text)),'0'),nm,p_request->>'origin','aberto',m.user_id,cust,p_request->>'priority',reason,msg,p_idempotency_key,digest,clock_timestamp()) RETURNING * INTO r;
  INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256) VALUES(p_office_id,r.id,c.id,c.name,m.user_id,p_idempotency_key,digest);
  IF jsonb_array_length(p_request->'items')>0 THEN
   PERFORM private.request_capture_items(p_office_id,r.id,cust,p_request->'items',m,'requests.create');
   IF EXISTS(SELECT FROM public.request_items i LEFT JOIN private.service_version_categories vc ON vc.office_id=i.office_id AND vc.version_id=i.version_id WHERE i.office_id=p_office_id AND i.request_id=r.id AND vc.category_id IS DISTINCT FROM c.id) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  END IF;
  m:=private.requests_actor(p_office_id,true,'requests.create');
  IF NOT private.member_execution_level(m,c.execution_level) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  UPDATE public.requests SET assignee_id=assignee WHERE office_id=p_office_id AND id=r.id RETURNING * INTO r;
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id) VALUES(p_office_id,r.id,assignee,m.user_id);
  INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,to_status,to_assignee) VALUES(p_office_id,r.id,'created',m.user_id,note,'aberto',assignee);
  PERFORM private.emit_business_event(p_office_id,'requests.created','request',r.id,p_idempotency_key,'{}');
 END IF;
 INSERT INTO private.staff_category_request_commands(office_id,actor_id,idempotency_key,request_id,payload_sha256) VALUES(p_office_id,m.user_id,p_idempotency_key,r.id,digest);
 RETURN private.request_detail(p_office_id,r.id,1);
END$$;
-- Legacy preintake clients also receive the server-derived modality; no owner can force collection.
CREATE FUNCTION private.request_preintake_create(p_office_id uuid,p_value jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;prior public.requests;
BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.request_shape(p_value,ARRAY['origin','title','message','customer_id','category_id','internal_note']);
 SELECT * INTO prior FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key;
 IF prior.id IS NOT NULL AND NOT EXISTS(SELECT FROM private.staff_category_request_commands WHERE office_id=p_office_id AND actor_id=m.user_id AND idempotency_key=p_idempotency_key) THEN
  IF prior.payload_digest<>encode(extensions.digest(p_value::text,'sha256'),'hex') THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.request_detail(p_office_id,prior.id,1);
 END IF;
 RETURN private.staff_category_request_create(p_office_id,p_value||jsonb_build_object('assignee_id',NULL,'priority','normal','priority_reason','','items','[]'::jsonb),p_idempotency_key);
END$$;
CREATE FUNCTION public.staff_category_request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.staff_category_request_create(p_office_id,p_request,p_idempotency_key);$$;
REVOKE ALL ON FUNCTION private.staff_category_request_create(uuid,jsonb,uuid),public.staff_category_request_create(uuid,jsonb,uuid),private.request_preintake_create(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.staff_category_request_create(uuid,jsonb,uuid),public.staff_category_request_create(uuid,jsonb,uuid),private.request_preintake_create(uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
