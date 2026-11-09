-- Etapa28 extends rural27, requests10, files11 and charges13/15. No provider transmission or new finance ledger.
CREATE TABLE private.ditr_cases28(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,property_id uuid NOT NULL,
 exercise integer NOT NULL CHECK(exercise BETWEEN 1900 AND 2200),taxpayer_id uuid NOT NULL,request_id uuid NOT NULL,
 modality text NOT NULL CHECK(modality IN('original','rectifying')),previous_case_id uuid,root_case_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,request_id),
 FOREIGN KEY(office_id,property_id) REFERENCES private.rural_properties(office_id,id),
 FOREIGN KEY(office_id,taxpayer_id) REFERENCES public.customers(office_id,id),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id),
 FOREIGN KEY(office_id,previous_case_id) REFERENCES private.ditr_cases28(office_id,id),
 FOREIGN KEY(office_id,root_case_id) REFERENCES private.ditr_cases28(office_id,id),
 CHECK((modality='original' AND previous_case_id IS NULL AND revision=1 AND root_case_id=id) OR(modality='rectifying' AND previous_case_id IS NOT NULL AND revision>1 AND root_case_id<>id AND previous_case_id<>id))
);
CREATE UNIQUE INDEX ditr_original28 ON private.ditr_cases28(office_id,property_id,exercise,taxpayer_id) WHERE modality='original';
CREATE UNIQUE INDEX ditr_successor28 ON private.ditr_cases28(office_id,previous_case_id) WHERE previous_case_id IS NOT NULL;
CREATE INDEX ditr_property28 ON private.ditr_cases28(office_id,property_id,exercise,created_at DESC,id DESC);
CREATE INDEX ditr_taxpayer28 ON private.ditr_cases28(office_id,taxpayer_id);
CREATE INDEX ditr_root28 ON private.ditr_cases28(office_id,root_case_id,revision);
CREATE INDEX ditr_creator28 ON private.ditr_cases28(created_by);
CREATE TABLE private.ditr_evidence28(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,case_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('receipt','tax_guide','tax_payment')),file_id uuid NOT NULL,file_sha256 text NOT NULL CHECK(file_sha256~'^[0-9a-f]{64}$'),
 external_reference text NOT NULL CHECK(char_length(external_reference)<=120 AND external_reference=btrim(external_reference) AND external_reference!~'[[:cntrl:]]'),
 amount_cents bigint CHECK(amount_cents BETWEEN 0 AND 1000000000000),external_date date NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,case_id) REFERENCES private.ditr_cases28(office_id,id),FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id),
 CHECK((kind='receipt' AND amount_cents IS NULL AND char_length(external_reference)>0) OR(kind IN('tax_guide','tax_payment') AND amount_cents IS NOT NULL))
);
CREATE INDEX ditr_evidence_case28 ON private.ditr_evidence28(office_id,case_id,created_at DESC,id DESC);
CREATE INDEX ditr_evidence_file28 ON private.ditr_evidence28(office_id,file_id);
CREATE INDEX ditr_evidence_creator28 ON private.ditr_evidence28(created_by);
CREATE TABLE private.ditr_calendars28(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),exercise integer NOT NULL CHECK(exercise BETWEEN 1900 AND 2200),
 starts_on date NOT NULL,due_on date NOT NULL CHECK(due_on>=starts_on),source_url text NOT NULL CHECK(char_length(source_url) BETWEEN 15 AND 1000 AND source_url~*'^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*gov\.br([/?#][^[:cntrl:][:space:]]*)?$'),
 checked_on date NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ditr_calendar_year28 ON private.ditr_calendars28(office_id,exercise,created_at DESC,id DESC);
CREATE INDEX ditr_calendar_creator28 ON private.ditr_calendars28(created_by);
CREATE TABLE private.ditr_commands28(
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),key uuid NOT NULL,session_id uuid NOT NULL,
 digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(office_id,actor_id,key)
);
CREATE INDEX ditr_commands_actor28 ON private.ditr_commands28(actor_id);

CREATE FUNCTION private.ditr_case_guard28() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'version')=(to_jsonb(OLD)-'version') AND NEW.version=OLD.version+1 THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'DITR_CONFLICT' USING ERRCODE='PT409';
END$$;
CREATE TRIGGER ditr_case_identity28 BEFORE UPDATE OR DELETE ON private.ditr_cases28 FOR EACH ROW EXECUTE FUNCTION private.ditr_case_guard28();
DO $m$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['ditr_cases28','ditr_evidence28','ditr_calendars28','ditr_commands28'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 IF t<>'ditr_cases28' THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.wf_immutable()',t||'_immutable',t);END IF;
END LOOP;END$m$;

CREATE FUNCTION private.ditr_case_view28(d private.ditr_cases28,m public.memberships) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;ch private.charges;a record;service jsonb:=NULL;BEGIN
 SELECT * INTO r FROM public.requests WHERE office_id=d.office_id AND id=d.request_id;
 IF private.current_permissions(d.office_id) @> ARRAY['charges.read'] THEN
  SELECT * INTO ch FROM private.charges WHERE office_id=d.office_id AND request_id=d.request_id;
  IF ch.id IS NOT NULL THEN SELECT * INTO a FROM private.charges_amounts(d.office_id,ch.id);service:=jsonb_build_object('charge_id',ch.id,'total_cents',a.due_cents,'paid_cents',a.allocated_cents,'balance_cents',a.balance_cents);END IF;
 END IF;
 RETURN jsonb_build_object('id',d.id,'property_id',d.property_id,'exercise',d.exercise,'taxpayer_id',d.taxpayer_id,
 'taxpayer_name',(SELECT c.name FROM public.customers c WHERE c.office_id=d.office_id AND c.id=d.taxpayer_id),'request_id',d.request_id,'internal_protocol',r.protocol,
 'responsible_name',coalesce((SELECT private.customer_relation_display_label(p.display_name) FROM public.memberships x JOIN public.profiles p ON p.id=x.user_id WHERE x.office_id=d.office_id AND x.id=r.assignee_id),'Triagem'),
 'modality',d.modality,'previous_case_id',d.previous_case_id,'root_case_id',d.root_case_id,'revision',d.revision,'version',d.version,'created_at',d.created_at,
 'can_work',coalesce(private.current_permissions(d.office_id) @> ARRAY['customers.update','rural.records.manage'] AND private.request_can_work(r,m) AND r.status<>'cancelado',false),'service',service);
END$$;

CREATE FUNCTION private.ditr_state28(o uuid,p uuid,y integer,cid uuid,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;m public.memberships;selected private.ditr_cases28;result jsonb;BEGIN
 u:=private.rural_access27(o,p);m:=private.requests_actor(o);
 IF y IS NULL OR y NOT BETWEEN 1900 AND 2200 OR page IS NULL OR page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
 IF cid IS NOT NULL THEN
 SELECT d.* INTO selected FROM private.ditr_cases28 d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id=o AND d.property_id=p AND d.exercise=y AND d.id=cid AND private.request_in_scope(r,m);
 IF selected.id IS NULL THEN RAISE EXCEPTION 'DITR_NOT_FOUND' USING ERRCODE='PT404';END IF;
 END IF;
 WITH visible AS MATERIALIZED(SELECT d.* FROM private.ditr_cases28 d JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE d.office_id=o AND d.property_id=p AND d.exercise=y AND private.request_in_scope(r,m)),
 candidates AS MATERIALIZED(SELECT r.id,r.protocol,r.customer_id AS taxpayer_id,c.name AS taxpayer_name FROM public.requests r JOIN public.customers c ON c.office_id=r.office_id AND c.id=r.customer_id
 WHERE r.office_id=o AND private.request_in_scope(r,m) AND private.request_can_work(r,m) AND r.status NOT IN('concluido','cancelado') AND private.customer_in_scope(c,u)
 AND EXISTS(SELECT FROM private.property_records27 pr WHERE pr.office_id=o AND pr.property_id=p AND pr.request_id=r.id AND(pr.exercise IS NULL OR pr.exercise=y))
 AND EXISTS(SELECT FROM private.property_parties pp WHERE pp.office_id=o AND pp.property_id=p AND pp.customer_id=r.customer_id AND pp.role='taxpayer' AND pp.valid_from<=make_date(y,12,31) AND(pp.valid_until IS NULL OR pp.valid_until>=make_date(y,1,1)))
 AND NOT EXISTS(SELECT FROM private.ditr_cases28 d WHERE d.office_id=o AND d.request_id=r.id)),
 evidences AS MATERIALIZED(SELECT e.* FROM private.ditr_evidence28 e WHERE e.office_id=o AND e.case_id=selected.id AND private.current_permissions(o) @> ARRAY['files.read'])
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(private.ditr_case_view28(d,m) ORDER BY d.created_at DESC,d.id DESC) FROM(SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(page-1)*5)d),'[]'::jsonb),'total',(SELECT count(*) FROM visible),'page',page,'page_size',5,
 'selected',CASE WHEN selected.id IS NULL THEN NULL ELSE private.ditr_case_view28(selected,m) END,
 'evidence',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'case_id',e.case_id,'kind',e.kind,'file_id',e.file_id,'external_reference',e.external_reference,'amount_cents',e.amount_cents,'external_date',e.external_date,'actor_name',coalesce((SELECT private.customer_relation_display_label(pr.display_name) FROM public.profiles pr WHERE pr.id=e.created_by),'Equipe'),'created_at',e.created_at) ORDER BY e.created_at DESC,e.id DESC) FROM(SELECT * FROM evidences ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(page-1)*5)e),'[]'::jsonb),'evidence_total',(SELECT count(*) FROM evidences),
 'calendar',(SELECT jsonb_build_object('id',ca.id,'exercise',ca.exercise,'starts_on',ca.starts_on,'due_on',ca.due_on,'source_url',ca.source_url,'checked_on',ca.checked_on,'responsible_name',coalesce((SELECT private.customer_relation_display_label(pr.display_name) FROM public.profiles pr WHERE pr.id=ca.created_by),'Equipe'),'created_at',ca.created_at) FROM private.ditr_calendars28 ca WHERE ca.office_id=o AND ca.exercise=y ORDER BY ca.created_at DESC,ca.id DESC LIMIT 1),
 'requests',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.protocol,t.id) FROM(SELECT * FROM candidates ORDER BY protocol,id LIMIT 5 OFFSET(page-1)*5)t),'[]'::jsonb),'requests_total',(SELECT count(*) FROM candidates)) INTO result;
 RETURN result;
END$$;

CREATE FUNCTION private.ditr_command28(o uuid,p uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u uuid;m public.memberships;r public.requests;d private.ditr_cases28;previous private.ditr_cases28;old private.ditr_commands28;f public.files;
 kind text;dg text;sid uuid;outid uuid;y integer;prev uuid;req uuid;last_calendar uuid;calendar_expected uuid;ref text;url text;ek text;amount bigint;dt date;start_date date;due_date date;checked date;result jsonb;
BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
 u:=private.rural_access27(o,p,'customers.update');m:=private.requests_actor(o,true);
 IF NOT private.current_permissions(o) @> ARRAY['rural.records.manage'] THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF k IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR c->>'kind' IS NULL THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=c->>'kind';sid:=(auth.jwt()->>'session_id')::uuid;dg:=encode(extensions.digest(jsonb_build_object('property',p,'command',c)::text,'sha256'),'hex');
 IF kind='evidence' AND NOT private.current_permissions(o) @> ARRAY['files.read'] THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO old FROM private.ditr_commands28 WHERE office_id=o AND actor_id=u AND key=k;
 IF old.key IS NOT NULL THEN
  IF old.session_id IS DISTINCT FROM sid THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF old.digest<>dg THEN RAISE EXCEPTION 'DITR_CONFLICT' USING ERRCODE='PT409';END IF;
  IF old.result->>'id' IS NOT NULL THEN
   SELECT * INTO d FROM private.ditr_cases28 WHERE office_id=o AND property_id=p AND id=(old.result->>'id')::uuid;
   SELECT * INTO r FROM public.requests WHERE office_id=o AND id=d.request_id FOR UPDATE;
   m:=private.requests_actor(o,true);PERFORM private.rural_access27(o,p,'customers.update');
   IF d.id IS NULL OR NOT private.request_in_scope(r,m) OR NOT private.request_can_work(r,m) OR r.status='cancelado' THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
  END IF;
  RETURN old.result;
 END IF;
 IF kind='calendar' THEN
  PERFORM private.request_shape(c,ARRAY['kind','exercise','starts_on','due_on','source_url','checked_on','expected_calendar_id']);
  IF jsonb_typeof(c->'exercise') IS DISTINCT FROM 'number' OR c->>'exercise'!~'^[0-9]{4}$' THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;y:=(c->>'exercise')::int;
  start_date:=private.request_text(c->'starts_on',10,10)::date;due_date:=private.request_text(c->'due_on',10,10)::date;checked:=private.request_text(c->'checked_on',10,10)::date;url:=private.request_text(c->'source_url',15,1000);
  IF c->>'starts_on'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR c->>'due_on'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR c->>'checked_on'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR checked>current_date OR due_date<start_date OR url!~*'^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*gov\.br([/?#][^[:cntrl:][:space:]]*)?$' THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
  calendar_expected:=private.request_uuid(c->'expected_calendar_id',true);SELECT id INTO last_calendar FROM private.ditr_calendars28 WHERE office_id=o AND exercise=y ORDER BY created_at DESC,id DESC LIMIT 1;
  IF calendar_expected IS DISTINCT FROM last_calendar THEN RAISE EXCEPTION 'DITR_CONFLICT' USING ERRCODE='PT409';END IF;
  INSERT INTO private.ditr_calendars28(office_id,exercise,starts_on,due_on,source_url,checked_on,created_by)VALUES(o,y,start_date,due_date,url,checked,u);
 ELSIF kind='create' THEN
  PERFORM private.request_shape(c,ARRAY['kind','exercise','request_id','modality','previous_case_id']);
  IF jsonb_typeof(c->'exercise') IS DISTINCT FROM 'number' OR c->>'exercise'!~'^[0-9]{4}$' OR c->>'modality' IS NULL OR c->>'modality' NOT IN('original','rectifying') THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;y:=(c->>'exercise')::int;
  IF y NOT BETWEEN 1900 AND 2200 THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
  req:=private.request_uuid(c->'request_id');prev:=private.request_uuid(c->'previous_case_id',true);
  IF(c->>'modality'='original') IS DISTINCT FROM(prev IS NULL) THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO r FROM public.requests WHERE office_id=o AND id=req FOR UPDATE;
  m:=private.requests_actor(o,true);PERFORM private.rural_access27(o,p,'customers.update');
  IF r.id IS NULL OR NOT private.request_in_scope(r,m) OR NOT private.request_can_work(r,m) THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'DITR_CONFLICT' USING ERRCODE='PT409';END IF;
  IF NOT EXISTS(SELECT FROM public.customers cu WHERE cu.office_id=o AND cu.id=r.customer_id AND private.customer_in_scope(cu,u)) OR NOT EXISTS(SELECT FROM private.property_records27 pr WHERE pr.office_id=o AND pr.property_id=p AND pr.request_id=r.id AND(pr.exercise IS NULL OR pr.exercise=y)) OR NOT EXISTS(SELECT FROM private.property_parties pp WHERE pp.office_id=o AND pp.property_id=p AND pp.customer_id=r.customer_id AND pp.role='taxpayer' AND pp.valid_from<=make_date(y,12,31) AND(pp.valid_until IS NULL OR pp.valid_until>=make_date(y,1,1))) THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
  IF prev IS NOT NULL THEN
   SELECT * INTO previous FROM private.ditr_cases28 WHERE office_id=o AND id=prev FOR UPDATE;
   IF previous.id IS NULL OR previous.property_id<>p OR previous.exercise<>y OR previous.taxpayer_id<>r.customer_id THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
   IF NOT EXISTS(SELECT FROM public.requests pr WHERE pr.office_id=o AND pr.id=previous.request_id AND private.request_in_scope(pr,m)) THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
  END IF;
  outid:=gen_random_uuid();INSERT INTO private.ditr_cases28(id,office_id,property_id,exercise,taxpayer_id,request_id,modality,previous_case_id,root_case_id,revision,created_by)
  VALUES(outid,o,p,y,r.customer_id,r.id,c->>'modality',prev,coalesce(previous.root_case_id,outid),coalesce(previous.revision+1,1),u);
 ELSIF kind='evidence' THEN
  PERFORM private.request_shape(c,ARRAY['kind','case_id','expected_version','evidence_kind','file_id','external_reference','amount_cents','external_date']);
  IF jsonb_typeof(c->'expected_version') IS DISTINCT FROM 'number' OR c->>'expected_version'!~'^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO d FROM private.ditr_cases28 WHERE office_id=o AND property_id=p AND id=private.request_uuid(c->'case_id') FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'DITR_NOT_FOUND' USING ERRCODE='PT404';END IF;
  SELECT * INTO r FROM public.requests WHERE office_id=o AND id=d.request_id FOR UPDATE;
  m:=private.requests_actor(o,true);PERFORM private.rural_access27(o,p,'customers.update');
  IF NOT private.current_permissions(o) @> ARRAY['files.read'] OR NOT private.request_in_scope(r,m) OR NOT private.request_can_work(r,m) OR r.status='cancelado' THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF (c->>'expected_version')::int<>d.version THEN RAISE EXCEPTION 'DITR_CONFLICT' USING ERRCODE='PT409';END IF;
  ek:=private.request_text(c->'evidence_kind',1,20);ref:=private.request_text(c->'external_reference',0,120);dt:=private.request_text(c->'external_date',10,10)::date;
  IF c->>'external_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ek NOT IN('receipt','tax_guide','tax_payment') OR(ek='receipt' AND(c->'amount_cents' IS DISTINCT FROM 'null'::jsonb OR ref='')) OR(ek<>'receipt' AND(jsonb_typeof(c->'amount_cents') IS DISTINCT FROM 'number' OR c->>'amount_cents'!~'^[0-9]{1,13}$')) THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
  amount:=(c->>'amount_cents')::bigint;
  SELECT * INTO f FROM public.files WHERE office_id=o AND request_id=r.id AND id=private.request_uuid(c->'file_id') FOR UPDATE;
  IF f.id IS NULL OR f.status NOT IN('quarentena','disponivel') OR EXISTS(SELECT FROM private.file_cleanup_reservations cr WHERE cr.file_id=f.id) THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF NOT EXISTS(SELECT FROM private.file_references fr WHERE fr.office_id=o AND fr.file_id=f.id AND fr.reference_kind='ditr28') THEN INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(o,f.id,'ditr28');END IF;
  INSERT INTO private.ditr_evidence28(office_id,case_id,kind,file_id,file_sha256,external_reference,amount_cents,external_date,created_by)VALUES(o,d.id,ek,f.id,f.sha256,ref,amount,dt,u);
  UPDATE private.ditr_cases28 SET version=version+1 WHERE office_id=o AND id=d.id;outid:=d.id;
 ELSE RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.rural_access27(o,p,'customers.update');m:=private.requests_actor(o,true);
 IF NOT private.current_permissions(o) @> ARRAY['rural.records.manage'] THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF kind='evidence' AND NOT private.current_permissions(o) @> ARRAY['files.read'] THEN RAISE EXCEPTION 'DITR_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.emit_business_event(o,CASE kind WHEN 'create' THEN 'rural.ditr_create' WHEN 'evidence' THEN 'rural.ditr_evidence' ELSE 'rural.ditr_calendar' END,'rural_property',p,k,'{}');
 result:=jsonb_build_object('id',outid);INSERT INTO private.ditr_commands28(office_id,actor_id,key,session_id,digest,result)VALUES(o,u,k,sid,dg,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'DITR_VALIDATION' USING ERRCODE='PT422';WHEN unique_violation THEN RAISE EXCEPTION 'DITR_CONFLICT' USING ERRCODE='PT409';END$$;
CREATE FUNCTION public.ditr_state28(o uuid,p uuid,y integer,cid uuid,page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.ditr_state28(o,p,y,cid,page);$$;
CREATE FUNCTION public.ditr_command28(o uuid,p uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.ditr_command28(o,p,c,k);$$;
REVOKE ALL ON FUNCTION private.ditr_case_guard28(),private.ditr_case_view28(private.ditr_cases28,public.memberships),private.ditr_state28(uuid,uuid,integer,uuid,integer),private.ditr_command28(uuid,uuid,jsonb,uuid),public.ditr_state28(uuid,uuid,integer,uuid,integer),public.ditr_command28(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.ditr_state28(uuid,uuid,integer,uuid,integer),private.ditr_command28(uuid,uuid,jsonb,uuid),public.ditr_state28(uuid,uuid,integer,uuid,integer),public.ditr_command28(uuid,uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
