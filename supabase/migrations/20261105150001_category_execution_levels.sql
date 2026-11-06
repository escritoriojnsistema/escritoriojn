-- Correções05/11: canonical category levels are deliberately NULL for legacy/imports.
ALTER TABLE private.service_categories ADD COLUMN execution_level integer CHECK(execution_level BETWEEN 1 AND 3), ADD COLUMN archived_at timestamptz;
-- Idempotent repair of unmapped legacy service categories; never classify them.
INSERT INTO private.service_categories(office_id,name)
 SELECT DISTINCT v.office_id,btrim(v.category) FROM public.service_versions v
 WHERE char_length(btrim(v.category)) BETWEEN 1 AND 60 AND NOT EXISTS(
 SELECT FROM private.service_categories c WHERE c.office_id=v.office_id AND lower(btrim(c.name))=lower(btrim(v.category))) ON CONFLICT DO NOTHING;
INSERT INTO private.service_version_categories(office_id,service_id,version_id,category_id)
 SELECT v.office_id,v.service_id,v.id,(SELECT c.id FROM private.service_categories c WHERE c.office_id=v.office_id AND lower(btrim(c.name))=lower(btrim(v.category)) ORDER BY c.id LIMIT 1)
 FROM public.service_versions v WHERE NOT EXISTS(SELECT FROM private.service_version_categories x WHERE x.version_id=v.id)
 AND EXISTS(SELECT FROM private.service_categories c WHERE c.office_id=v.office_id AND lower(btrim(c.name))=lower(btrim(v.category))) ON CONFLICT DO NOTHING;
INSERT INTO public.permissions(code,name) VALUES('requests.level1','Executar categorias de nível 1'),('requests.level2','Executar categorias de nível 2') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions VALUES('owner','requests.level1',now(),auth.uid(),current_user),('owner','requests.level2',now(),auth.uid(),current_user) ON CONFLICT DO NOTHING;
-- Extend existing explicit assignment validation; no individual grants.
DO $m$ DECLARE r record;s text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%documents.signatures.manage%' LOOP
 s:=replace(r.def,'''documents.signatures.manage''::text','''documents.signatures.manage''::text,''requests.level1''::text,''requests.level2''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,s);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP s:=replace(pg_get_functiondef(r.oid),'''documents.signatures.manage''','''documents.signatures.manage'',''requests.level1'',''requests.level2''');EXECUTE s;END LOOP;
END$m$;
CREATE OR REPLACE FUNCTION private.service_categories_state(p_office_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;manageable boolean;
BEGIN
 actor:=private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active;
 IF m.id IS NULL OR NOT private.current_permissions(p_office_id) @> ARRAY['foundation.access'] THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 manageable:=m.role_code IN('owner','admin') AND private.current_permissions(p_office_id) @> ARRAY['categories.manage'];
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(
 jsonb_build_object('id',c.id,'name',c.name,'revision',c.revision,'execution_level',c.execution_level,'is_documents',coalesce(c.system_key='documents',false))
 ||CASE WHEN manageable THEN jsonb_build_object('created_at',c.created_at,'services',
 (SELECT count(DISTINCT v.service_id) FROM private.service_version_categories v WHERE v.office_id=c.office_id AND v.category_id=c.id)) ELSE '{}'::jsonb END
 ORDER BY c.name,c.id) FROM private.service_categories c WHERE c.office_id=p_office_id AND c.archived_at IS NULL),'[]'::jsonb),'can_manage',manageable);
END $$;

CREATE OR REPLACE FUNCTION private.service_categories_command(p_office_id uuid,p_command jsonb,p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;op text;nm text;reason text;cid uuid;expected integer;old_command jsonb;current private.service_categories;
BEGIN
 actor:=private.team_require_identity();
 IF p_idempotency_key IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR jsonb_typeof(p_command->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 op:=p_command->>'kind';reason:=btrim(p_command->>'reason');
 IF (op='create' AND (NOT p_command ?& ARRAY['kind','name','execution_level','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4))
 OR (op='rename' AND (NOT p_command ?& ARRAY['kind','category_id','expected_revision','name','execution_level','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>6))
 OR (op='delete' AND (NOT p_command ?& ARRAY['kind','category_id','expected_revision','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4))
 OR op NOT IN('create','rename','delete') OR jsonb_typeof(p_command->'reason') IS DISTINCT FROM 'string' OR char_length(reason) NOT BETWEEN 1 AND 500 OR reason ~ '[[:cntrl:]]' OR NOT private.templates_has_text20(reason)
 THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 IF op IN('create','rename') THEN
  IF jsonb_typeof(p_command->'execution_level') IS DISTINCT FROM 'number' OR p_command->>'execution_level' NOT IN('1','2','3') THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
  nm:=btrim(p_command->>'name');
  IF jsonb_typeof(p_command->'name') IS DISTINCT FROM 'string' OR char_length(nm) NOT BETWEEN 1 AND 60 OR NOT private.templates_has_text20(nm) OR nm ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;
 IF op IN('rename','delete') THEN
  IF jsonb_typeof(p_command->'category_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'expected_revision') IS DISTINCT FROM 'number' OR p_command->>'expected_revision' !~ '^[1-9][0-9]{0,9}$' OR (p_command->>'expected_revision')::numeric>2147483645 THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
  expected:=(p_command->>'expected_revision')::integer;
  BEGIN cid:=(p_command->>'category_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END;
  IF cid IS NULL THEN RAISE EXCEPTION 'CATEGORIES_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;
 -- One office lock serializes idempotency, service association, and name edits.
 PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE;
 actor:=private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=actor AND active FOR SHARE;
 actor:=private.team_require_identity();
 IF m.id IS NULL OR m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(p_office_id) @> ARRAY['foundation.access','categories.manage'] THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT command INTO old_command FROM private.service_category_commands WHERE office_id=p_office_id AND actor_id=actor AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF old_command<>p_command THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.service_categories_state(p_office_id);
 END IF;
 IF op<>'create' THEN
  SELECT * INTO current FROM private.service_categories WHERE office_id=p_office_id AND id=cid FOR UPDATE;
  actor:=private.team_require_identity();
  IF NOT EXISTS(SELECT FROM public.memberships WHERE id=m.id AND active AND role_code IN('owner','admin')) OR NOT private.current_permissions(p_office_id) @> ARRAY['foundation.access','categories.manage'] THEN RAISE EXCEPTION 'CATEGORIES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF current.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF current.revision<>expected THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 IF op IN('create','rename') AND EXISTS(SELECT FROM private.service_categories WHERE office_id=p_office_id AND lower(name)=lower(nm) AND (cid IS NULL OR id<>cid)) THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';END IF;
 IF op='create' THEN
  INSERT INTO private.service_categories(office_id,name,created_by,execution_level,system_key) VALUES(p_office_id,nm,actor,(p_command->>'execution_level')::integer,
  CASE WHEN nm='Documentos' AND NOT EXISTS(SELECT FROM private.service_categories WHERE office_id=p_office_id AND system_key='documents') THEN 'documents' END) RETURNING id INTO cid;
 ELSIF op='rename' THEN
  UPDATE private.service_categories SET name=nm,execution_level=(p_command->>'execution_level')::integer,revision=revision+1 WHERE id=cid;
 ELSE
  UPDATE private.service_categories SET archived_at=clock_timestamp(),revision=revision+1 WHERE id=cid;
 END IF;
 INSERT INTO private.service_category_commands(office_id,actor_id,idempotency_key,command) VALUES(p_office_id,actor,p_idempotency_key,p_command);
 -- The immutable command stores the reason; the public audit event carries no text.
 PERFORM private.emit_business_event(p_office_id,'categories.'||CASE op WHEN 'create' THEN 'created' WHEN 'rename' THEN 'renamed' ELSE 'deleted' END,'service_category',cid,p_idempotency_key,'{}');
 RETURN private.service_categories_state(p_office_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CATEGORY_CONFLICT' USING ERRCODE='PT409';
 WHEN foreign_key_violation THEN RAISE EXCEPTION 'CATEGORY_IN_USE' USING ERRCODE='PT409';
END $$;

CREATE FUNCTION private.member_execution_level(m public.memberships,lvl integer) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(m.active AND m.role_code IN('owner','admin','employee') AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read'] AND (m.role_code='owner' OR lvl=3 OR (lvl=1 AND private.team_permissions_for_member(m.id) @> ARRAY['requests.level1']) OR (lvl=2 AND private.team_permissions_for_member(m.id) @> ARRAY['requests.level2'])),false);
$$;
CREATE FUNCTION private.request_execution_level(r public.requests) RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN r.category='account_correction' THEN 3 ELSE (
 SELECT CASE WHEN count(*)>0 AND count(c.execution_level)=count(*) THEN min(c.execution_level) END FROM private.service_categories c WHERE c.office_id=r.office_id AND c.id IN(
 SELECT rc.category_id FROM private.request_categories rc WHERE rc.office_id=r.office_id AND rc.request_id=r.id
 UNION SELECT vc.category_id FROM public.request_items i JOIN private.service_version_categories vc ON vc.office_id=i.office_id AND vc.version_id=i.version_id WHERE i.office_id=r.office_id AND i.request_id=r.id)) END;
$$;
CREATE FUNCTION private.request_execution_allowed(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.office_id=m.office_id AND private.member_execution_level(m,private.request_execution_level(r));
$$;
ALTER FUNCTION private.request_can_work(public.requests,public.memberships) RENAME TO request_can_work_before_levels;
CREATE FUNCTION private.request_can_work(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_can_work_before_levels(r,m) IS TRUE AND private.request_execution_allowed(r,m);
$$;
ALTER FUNCTION private.request_can_reclaim(public.requests,public.memberships) RENAME TO request_can_reclaim_before_levels;
CREATE FUNCTION private.request_can_reclaim(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_can_reclaim_before_levels(r,m) IS TRUE AND private.request_execution_allowed(r,m);
$$;
-- Automatic assignment reuses the existing presence, capacity, lock and history path.
DO $m$ DECLARE body text;BEGIN
 body:=pg_get_functiondef('private.document_dispatch(uuid)'::regprocedure);
 body:=replace(body,'rq.origin IN(''portal'',''whatsapp'') AND EXISTS(SELECT FROM private.document_intakes i WHERE i.office_id=rq.office_id AND i.request_id=rq.id)','rq.origin IN(''portal'',''whatsapp'',''presencial'')');
 body:=replace(body,'SELECT execution_level INTO lvl FROM private.document_intakes WHERE office_id=p_office_id AND request_id=r.id ORDER BY created_at,id LIMIT 1;','lvl:=private.request_execution_level(r);IF lvl IS NULL THEN CONTINUE;END IF;');
 body:=replace(body,'CASE m.role_code WHEN ''owner'' THEN 1 WHEN ''admin'' THEN 2 WHEN ''employee'' THEN 3 ELSE 0 END=lvl','private.member_execution_level(m,lvl)');
 body:=replace(body,'CASE mm.role_code WHEN ''owner'' THEN 1 WHEN ''admin'' THEN 2 WHEN ''employee'' THEN 3 ELSE 0 END=lvl','private.member_execution_level(mm,lvl)');
 EXECUTE body;
END$m$;
-- A direct RPC transfer cannot assign an ineligible executor by UUID.
CREATE FUNCTION private.request_assignment_level_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.memberships;
BEGIN
 IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
 SELECT * INTO member FROM public.memberships WHERE office_id=NEW.office_id AND id=NEW.assignee_id;
 IF NOT private.request_execution_allowed(NEW,member) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER request_assignment_level_guard BEFORE UPDATE OF assignee_id ON public.requests FOR EACH ROW EXECUTE FUNCTION private.request_assignment_level_guard();
REVOKE ALL ON FUNCTION private.member_execution_level(public.memberships,integer),private.request_execution_level(public.requests),private.request_execution_allowed(public.requests,public.memberships),private.request_can_work_before_levels(public.requests,public.memberships),private.request_can_reclaim_before_levels(public.requests,public.memberships),private.request_can_work(public.requests,public.memberships),private.request_can_reclaim(public.requests,public.memberships),private.request_assignment_level_guard() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
-- Replace previous role hierarchy checks in document booking and assignment.
DO $m$ DECLARE body text;BEGIN
 body:=pg_get_functiondef('private.document_assignment_guard()'::regprocedure);
 body:=replace(body,'(CASE m.role_code WHEN ''owner'' THEN 1 WHEN ''admin'' THEN 2 WHEN ''employee'' THEN 3 ELSE 4 END)>lvl','NOT private.request_execution_allowed(NEW,m)');EXECUTE body;
 body:=pg_get_functiondef('private.document_booking_create(uuid,jsonb,uuid)'::regprocedure);
 body:=replace(body,'(CASE member.role_code WHEN ''owner'' THEN 1 WHEN ''admin'' THEN 2 WHEN ''employee'' THEN 3 ELSE 4 END)>o.execution_level','NOT private.member_execution_level(member,(SELECT c.execution_level FROM private.service_categories c WHERE c.office_id=o.office_id AND c.id=private.service_category_id(o.office_id,(SELECT sv.id FROM public.service_versions sv WHERE sv.office_id=o.office_id AND sv.service_id=o.service_id ORDER BY sv.number DESC LIMIT 1))))');
 EXECUTE body;
 -- Canonical categories can be archived without touching historical snapshots.
 body:=pg_get_functiondef('private.categories_link_version()'::regprocedure);
 body:=replace(body,'name=btrim(NEW.category) FOR KEY SHARE','name=btrim(NEW.category) AND archived_at IS NULL FOR KEY SHARE');EXECUTE body;
 body:=pg_get_functiondef('private.categorized_request_create(uuid,jsonb,uuid)'::regprocedure);
 body:=replace(body,'cat.id IS NULL OR cat.system_key=', 'cat.id IS NULL OR cat.archived_at IS NOT NULL OR cat.system_key=');EXECUTE body;
END$m$;
CREATE TABLE private.request_preintakes(
 office_id uuid NOT NULL,request_id uuid NOT NULL,collector_id uuid NOT NULL REFERENCES public.memberships(id),details jsonb NOT NULL DEFAULT '{}',handed_off_at timestamptz,
 PRIMARY KEY(office_id,request_id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
ALTER TABLE private.request_preintakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_preintakes FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.request_can_collect(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(m.active AND m.role_code IN('owner','admin','employee') AND r.office_id=m.office_id AND r.status NOT IN('concluido','cancelado') AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read','requests.create'] AND EXISTS(SELECT FROM private.request_preintakes p WHERE p.office_id=r.office_id AND p.request_id=r.id AND p.collector_id=m.id AND p.handed_off_at IS NULL),false);
$$;
CREATE FUNCTION private.request_preintake_create(p_office_id uuid,p_value jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;c private.service_categories;cust uuid;nm text;msg text;note text;n bigint;digest text;BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.request_shape(p_value,ARRAY['origin','title','message','customer_id','category_id','internal_note']);
 IF p_idempotency_key IS NULL OR p_value->>'origin' NOT IN('presencial','whatsapp') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 nm:=private.request_text(p_value->'title',1,120);msg:=private.request_text(p_value->'message',0,2000,true);note:=private.request_text(p_value->'internal_note',0,2000,true);
 cust:=private.request_uuid(p_value->'customer_id',true);IF cust IS NOT NULL THEN PERFORM private.request_customer(p_office_id,cust,m.user_id);END IF;
 SELECT * INTO c FROM private.service_categories WHERE office_id=p_office_id AND id=private.request_uuid(p_value->'category_id') AND archived_at IS NULL FOR SHARE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(p_value::text,'sha256'),'hex');
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key;
 IF r.id IS NOT NULL THEN IF r.payload_digest<>digest THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;RETURN private.request_detail(p_office_id,r.id,1);END IF;
 m:=private.requests_actor(p_office_id,true,'requests.create');
 INSERT INTO private.request_counters(office_id,last_number) VALUES(p_office_id,1) ON CONFLICT(office_id) DO UPDATE SET last_number=private.request_counters.last_number+1 RETURNING last_number INTO n;
 INSERT INTO public.requests(office_id,protocol,title,origin,status,created_by,customer_id,priority,priority_reason,message,idempotency_key,payload_digest)
 VALUES(p_office_id,'AT-'||lpad(n::text,greatest(6,char_length(n::text)),'0'),nm,p_value->>'origin','aberto',m.user_id,cust,'normal','',msg,p_idempotency_key,digest) RETURNING * INTO r;
 INSERT INTO private.request_categories(office_id,request_id,category_id,category_name,actor_id,idempotency_key,payload_sha256) VALUES(p_office_id,r.id,c.id,c.name,m.user_id,p_idempotency_key,digest);
 INSERT INTO private.request_preintakes(office_id,request_id,collector_id,details) VALUES(p_office_id,r.id,m.id,p_value);
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,to_status) VALUES(p_office_id,r.id,'created',m.user_id,note,'aberto');
 PERFORM private.emit_business_event(p_office_id,'requests.preintake_created','request',r.id,p_idempotency_key,'{}');
 RETURN private.request_detail(p_office_id,r.id,1);
END$$;
CREATE FUNCTION private.request_preintake_handoff(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;reason text;BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');reason:=private.request_text(to_jsonb(p_reason),1,500);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF r.id IS NULL OR NOT private.request_can_collect(r,m) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_expected_version IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.request_preintakes SET handed_off_at=clock_timestamp() WHERE office_id=p_office_id AND request_id=r.id;
 UPDATE public.requests SET assignee_id=NULL,status='aguardando_responsavel',version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=r.id;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status) VALUES(p_office_id,r.id,'transfer',m.user_id,reason,r.status,'aguardando_responsavel');
 PERFORM private.emit_business_event(p_office_id,'requests.preintake_handed_off','request',r.id,gen_random_uuid(),'{}');PERFORM private.document_dispatch(p_office_id);
 RETURN private.request_detail(p_office_id,r.id,1);
END$$;
CREATE FUNCTION public.request_preintake_create(p_office_id uuid,p_value jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_preintake_create(p_office_id,p_value,p_idempotency_key);$$;
CREATE FUNCTION public.request_preintake_handoff(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_preintake_handoff(p_office_id,p_request_id,p_expected_version,p_reason);$$;
REVOKE ALL ON FUNCTION private.request_can_collect(public.requests,public.memberships),private.request_preintake_create(uuid,jsonb,uuid),private.request_preintake_handoff(uuid,uuid,integer,text),public.request_preintake_create(uuid,jsonb,uuid),public.request_preintake_handoff(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_preintake_create(uuid,jsonb,uuid),private.request_preintake_handoff(uuid,uuid,integer,text),public.request_preintake_create(uuid,jsonb,uuid),public.request_preintake_handoff(uuid,uuid,integer,text) TO authenticated;
-- Collection grants only file intake; execution, checklist and finance guards stay separate.
DO $m$ DECLARE r record;body text;BEGIN
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('files_request','files_storage_allowed','files_record') LOOP
 body:=pg_get_functiondef(r.oid);
 body:=replace(body,'private.request_can_work(r,m) IS NOT TRUE','(private.request_can_work(r,m) OR private.request_can_collect(r,m)) IS NOT TRUE');
 body:=replace(body,'private.request_can_work(r,m) IS TRUE','(private.request_can_work(r,m) OR private.request_can_collect(r,m)) IS TRUE');
 EXECUTE body;END LOOP;
END$m$;
ALTER FUNCTION private.request_detail_record(public.requests,public.memberships,integer) RENAME TO request_detail_record_before_preintake;
CREATE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_detail_record_before_preintake(r,m,p_page)||CASE WHEN m.role_code='client' THEN '{}'::jsonb ELSE jsonb_build_object('execution_level',private.request_execution_level(r),'can_collect',private.request_can_collect(r,m),'preintake',EXISTS(SELECT FROM private.request_preintakes p WHERE p.office_id=r.office_id AND p.request_id=r.id),'can_handoff',private.request_can_collect(r,m)) END;
$$;
REVOKE ALL ON FUNCTION private.request_detail_record_before_preintake(public.requests,public.memberships,integer),private.request_detail_record(public.requests,public.memberships,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE private.request_level_exceptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,membership_id uuid NOT NULL REFERENCES public.memberships(id),authorized_by uuid NOT NULL REFERENCES auth.users(id),reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 1 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),revoked_at timestamptz,revoked_by uuid REFERENCES auth.users(id),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX request_level_exception_request_idx ON private.request_level_exceptions(office_id,request_id,membership_id) WHERE revoked_at IS NULL;
ALTER TABLE private.request_level_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_level_exceptions FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.request_execution_allowed(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(r.office_id=m.office_id AND m.active AND m.role_code<>'client' AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read'] AND (
 private.member_execution_level(m,private.request_execution_level(r)) OR EXISTS(SELECT FROM private.request_level_exceptions e WHERE e.office_id=r.office_id AND e.request_id=r.id AND e.membership_id=m.id AND e.revoked_at IS NULL)),false);
$$;
CREATE FUNCTION private.request_level_transfer(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_assignee_id uuid,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;target public.memberships;reason text;BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.transfer');reason:=private.request_text(to_jsonb(p_reason),1,500);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,'requests.transfer');
 IF m.role_code NOT IN('owner','admin') OR NOT private.request_in_scope(r,m) OR NOT private.request_can_work(r,m) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_expected_version IS DISTINCT FROM r.version OR r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.request_assignee(p_office_id,p_assignee_id);
 SELECT * INTO target FROM public.memberships WHERE office_id=p_office_id AND id=p_assignee_id FOR SHARE;
 IF target.id IS NULL OR private.request_execution_level(r) IS NULL THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 UPDATE private.request_level_exceptions SET revoked_at=clock_timestamp(),revoked_by=m.user_id WHERE office_id=p_office_id AND request_id=r.id AND revoked_at IS NULL;
 INSERT INTO private.request_level_exceptions(office_id,request_id,membership_id,authorized_by,reason) VALUES(p_office_id,r.id,p_assignee_id,m.user_id,reason);
 PERFORM private.emit_business_event(p_office_id,'requests.level_exception_authorized','request',r.id,gen_random_uuid(),'{}');
 RETURN private.request_mutate(p_office_id,r.id,p_expected_version,jsonb_build_object('kind','transfer','assignee_id',p_assignee_id,'reason',reason),gen_random_uuid());
END$$;
CREATE FUNCTION private.request_level_revoke(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;reason text;BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.transfer');reason:=private.request_text(to_jsonb(p_reason),1,500);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,'requests.transfer');
 IF m.role_code NOT IN('owner','admin') OR NOT private.request_in_scope(r,m) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_expected_version IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 UPDATE private.request_level_exceptions SET revoked_at=clock_timestamp(),revoked_by=m.user_id WHERE office_id=p_office_id AND request_id=r.id AND revoked_at IS NULL;
 UPDATE public.requests SET version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=r.id;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason) VALUES(p_office_id,r.id,'note',m.user_id,reason);
 PERFORM private.emit_business_event(p_office_id,'requests.level_exception_revoked','request',r.id,gen_random_uuid(),'{}');
 RETURN private.request_detail(p_office_id,r.id,1);
END$$;
CREATE FUNCTION public.request_level_transfer(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_assignee_id uuid,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_level_transfer(p_office_id,p_request_id,p_expected_version,p_assignee_id,p_reason);$$;
CREATE FUNCTION public.request_level_revoke(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_level_revoke(p_office_id,p_request_id,p_expected_version,p_reason);$$;
REVOKE ALL ON FUNCTION private.request_level_transfer(uuid,uuid,integer,uuid,text),private.request_level_revoke(uuid,uuid,integer,text),public.request_level_transfer(uuid,uuid,integer,uuid,text),public.request_level_revoke(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_level_transfer(uuid,uuid,integer,uuid,text),private.request_level_revoke(uuid,uuid,integer,text),public.request_level_transfer(uuid,uuid,integer,uuid,text),public.request_level_revoke(uuid,uuid,integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';
CREATE TABLE private.request_preintake_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
ALTER TABLE private.request_preintake_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.request_preintake_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER request_preintake_events_immutable BEFORE UPDATE OR DELETE ON private.request_preintake_events FOR EACH ROW EXECUTE FUNCTION private.templates_immutable20();
CREATE FUNCTION private.request_preintake_update(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;cust uuid;new_title text;new_message text;note text;BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');
 PERFORM private.request_shape(p_value,ARRAY['title','message','customer_id','internal_note']);
 new_title:=private.request_text(p_value->'title',1,120);new_message:=private.request_text(p_value->'message',0,2000,true);note:=private.request_text(p_value->'internal_note',0,2000,true);cust:=private.request_uuid(p_value->'customer_id',true);
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,'requests.create');
 IF r.id IS NULL OR NOT private.request_can_collect(r,m) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_expected_version IS DISTINCT FROM r.version THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 IF cust IS NOT NULL THEN PERFORM private.request_customer(p_office_id,cust,m.user_id);END IF;
 m:=private.requests_actor(p_office_id,true,'requests.create');IF NOT private.request_can_collect(r,m) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 INSERT INTO private.request_preintake_events(office_id,request_id,actor_id,details) VALUES(p_office_id,r.id,m.user_id,jsonb_build_object('title',r.title,'message',r.message,'customer_id',r.customer_id));
 UPDATE public.requests SET title=new_title,message=new_message,customer_id=cust,version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=r.id;
 UPDATE private.request_preintakes SET details=p_value WHERE office_id=p_office_id AND request_id=r.id;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason) VALUES(p_office_id,r.id,'note',m.user_id,CASE WHEN note='' THEN 'Dados do pré-atendimento atualizados' ELSE note END);
 PERFORM private.emit_business_event(p_office_id,'requests.preintake_updated','request',r.id,gen_random_uuid(),'{}');
 RETURN private.request_detail(p_office_id,r.id,1);
END$$;
CREATE FUNCTION public.request_preintake_update(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_value jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.request_preintake_update(p_office_id,p_request_id,p_expected_version,p_value);$$;
REVOKE ALL ON FUNCTION private.request_preintake_update(uuid,uuid,integer,jsonb),public.request_preintake_update(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.request_preintake_update(uuid,uuid,integer,jsonb),public.request_preintake_update(uuid,uuid,integer,jsonb) TO authenticated;
-- End exceptions on a later transfer; moving the request back cannot revive them.
CREATE OR REPLACE FUNCTION private.request_assignment_level_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member public.memberships;BEGIN
 IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
 UPDATE private.request_level_exceptions SET revoked_at=clock_timestamp(),revoked_by=auth.uid() WHERE office_id=NEW.office_id AND request_id=NEW.id AND membership_id IS DISTINCT FROM NEW.assignee_id AND revoked_at IS NULL;
 IF NEW.assignee_id IS NOT NULL THEN
 SELECT * INTO member FROM public.memberships WHERE office_id=NEW.office_id AND id=NEW.assignee_id;
 IF NOT private.request_execution_allowed(NEW,member) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;END IF;RETURN NEW;
END$$;
-- Item capture cannot create an assignment that bypasses category habilitation.
CREATE FUNCTION private.request_item_level_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;BEGIN
 SELECT * INTO r FROM public.requests WHERE office_id=NEW.office_id AND id=NEW.request_id;
 IF r.assignee_id IS NOT NULL THEN
 SELECT * INTO m FROM public.memberships WHERE office_id=r.office_id AND id=r.assignee_id;
 IF NOT private.request_execution_allowed(r,m) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER request_item_level_guard AFTER INSERT ON public.request_items FOR EACH ROW EXECUTE FUNCTION private.request_item_level_guard();
REVOKE ALL ON FUNCTION private.request_item_level_guard() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
-- Each category must be authorized independently; level1 never implies level2.
CREATE OR REPLACE FUNCTION private.request_execution_allowed(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(r.office_id=m.office_id AND m.active AND m.role_code IN('owner','admin','employee') AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read'] AND (
 m.role_code='owner' OR (r.category='account_correction' AND private.member_execution_level(m,3)) OR
 (private.request_execution_level(r) IS NOT NULL AND NOT EXISTS(SELECT FROM private.service_categories c WHERE c.office_id=r.office_id AND c.id IN(
 SELECT rc.category_id FROM private.request_categories rc WHERE rc.office_id=r.office_id AND rc.request_id=r.id
 UNION SELECT vc.category_id FROM public.request_items i JOIN private.service_version_categories vc ON vc.office_id=i.office_id AND vc.version_id=i.version_id WHERE i.office_id=r.office_id AND i.request_id=r.id)
 AND NOT private.member_execution_level(m,c.execution_level))) OR
 EXISTS(SELECT FROM private.request_level_exceptions e WHERE e.office_id=r.office_id AND e.request_id=r.id AND e.membership_id=m.id AND e.revoked_at IS NULL)),false);
$$;
DO $m$ DECLARE body text;BEGIN
 body:=pg_get_functiondef('private.document_dispatch(uuid)'::regprocedure);
 body:=replace(body,'private.member_execution_level(m,lvl)','private.request_execution_allowed(r,m)');
 body:=replace(body,'private.member_execution_level(mm,lvl)','private.request_execution_allowed(r,mm)');
 body:=replace(body,'private.team_permissions_for_member(m.id) @> ARRAY[''foundation.access'',''requests.read'',''services.read'',''services.perform'',''documents.read'',''documents.create'',''customers.read'']','private.team_permissions_for_member(m.id) @> ARRAY[''foundation.access'',''requests.read'',''requests.update''] AND (NOT EXISTS(SELECT FROM private.document_intakes di WHERE di.office_id=r.office_id AND di.request_id=r.id) OR private.team_permissions_for_member(m.id) @> ARRAY[''services.read'',''services.perform'',''documents.read'',''documents.create'',''customers.read''])');
 body:=replace(body,'private.team_permissions_for_member(mm.id) @> ARRAY[''foundation.access'',''requests.read'',''services.read'',''services.perform'',''documents.read'',''documents.create'',''customers.read'']','private.team_permissions_for_member(mm.id) @> ARRAY[''foundation.access'',''requests.read'',''requests.update''] AND (NOT EXISTS(SELECT FROM private.document_intakes di WHERE di.office_id=r.office_id AND di.request_id=r.id) OR private.team_permissions_for_member(mm.id) @> ARRAY[''services.read'',''services.perform'',''documents.read'',''documents.create'',''customers.read''])');
 EXECUTE body;
END$m$;
-- Visibility is a separate authorization decision; read_all never grants a level.
ALTER FUNCTION private.request_in_scope(public.requests,public.memberships) RENAME TO request_in_scope_before_execution_levels;
CREATE FUNCTION private.request_in_scope(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_in_scope_before_execution_levels(r,m) IS TRUE AND(m.role_code='client' OR private.request_execution_allowed(r,m) OR private.request_can_collect(r,m));
$$;
REVOKE ALL ON FUNCTION private.request_in_scope(public.requests,public.memberships),private.request_in_scope_before_execution_levels(public.requests,public.memberships) FROM PUBLIC,anon,authenticated,service_role;
-- A collector loses the restricted detail after handoff; commit the handoff and
-- return an explicit access-lost result rather than rolling it back with a403.
DO $m$ DECLARE body text;BEGIN
 body:=pg_get_functiondef('private.request_preintake_handoff(uuid,uuid,integer,text)'::regprocedure);
 body:=replace(body,'RETURN private.request_detail(p_office_id,r.id,1);','SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=r.id;IF NOT private.request_in_scope(r,m) THEN RETURN jsonb_build_object(''access_lost'',true);END IF;RETURN private.request_detail(p_office_id,r.id,1);');
 EXECUTE body;
END$m$;
-- Categorized portal intake becomes routable only after its category is stored.
DO $m$ DECLARE body text;updated text;BEGIN
 body:=pg_get_functiondef('private.categorized_request_create(uuid,jsonb,uuid)'::regprocedure);
 updated:=replace(body,'RETURN private.request_detail(p_office_id,rid,1);','UPDATE public.requests SET status=''aguardando_responsavel'',version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=rid AND assignee_id IS NULL;PERFORM private.document_dispatch(p_office_id);RETURN private.request_detail(p_office_id,rid,1);');
 IF updated=body THEN RAISE EXCEPTION 'Categorized dispatch patch missing';END IF;EXECUTE updated;
END$m$;

-- Every exposed portal opening must use the canonical category path. Internal
-- account-data correction requests keep their existing private workflow.
CREATE OR REPLACE FUNCTION public.request_create(p_office_id uuid,p_request jsonb,p_idempotency_key uuid,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_request->>'origin'='portal'
 THEN private.categorized_request_create(p_office_id,p_request,p_idempotency_key)
 ELSE private.request_create(p_office_id,p_request,p_idempotency_key,p_request_id) END;
$$;
