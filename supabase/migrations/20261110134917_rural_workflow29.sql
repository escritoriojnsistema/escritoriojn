-- CCIR/CAR adds workflow metadata to the existing request/checklist/file/finance/document core.
CREATE TABLE private.rural_services29(
 office_id uuid NOT NULL,service_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),kind text NOT NULL CHECK(kind IN('CCIR','CAR')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,service_id,version),FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id)
);
CREATE INDEX rural_services_actor29 ON private.rural_services29(actor_id);
CREATE TABLE private.rural_cases29(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,item_id uuid NOT NULL,property_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('CCIR','CAR')),config_version integer NOT NULL,service_id uuid NOT NULL,
 checklist_id uuid NOT NULL,preparer_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),
 stage text NOT NULL DEFAULT 'recebido' CHECK(stage IN('recebido','aguardando_documentos','encaminhado','em_analise','em_preparacao','complementacao','concluido')),
 pending text NOT NULL DEFAULT '' CHECK(char_length(pending)<=500 AND pending!~'[[:cntrl:]]'),version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 external_reference text NOT NULL DEFAULT '' CHECK(char_length(external_reference)<=120 AND external_reference!~'[[:cntrl:]]'),result_file_id uuid,result_sha256 text,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,id),UNIQUE(office_id,request_id),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id),FOREIGN KEY(office_id,request_id,item_id) REFERENCES public.request_items(office_id,request_id,id),
 FOREIGN KEY(office_id,property_id) REFERENCES private.rural_properties(office_id,id),FOREIGN KEY(office_id,service_id,config_version) REFERENCES private.rural_services29(office_id,service_id,version),
 FOREIGN KEY(office_id,preparer_id) REFERENCES public.memberships(office_id,id),FOREIGN KEY(checklist_id) REFERENCES private.checklist_instances(id),
 FOREIGN KEY(office_id,result_file_id) REFERENCES public.files(office_id,id),
 CHECK((stage='concluido' AND result_file_id IS NOT NULL AND result_sha256~'^[0-9a-f]{64}$' AND char_length(btrim(external_reference))>0) OR(stage<>'concluido' AND result_file_id IS NULL AND result_sha256 IS NULL AND external_reference=''))
);
CREATE INDEX rural_cases_property29 ON private.rural_cases29(office_id,property_id);
CREATE INDEX rural_cases_item29 ON private.rural_cases29(office_id,request_id,item_id);
CREATE INDEX rural_cases_config29 ON private.rural_cases29(office_id,service_id,config_version);
CREATE INDEX rural_cases_preparer29 ON private.rural_cases29(office_id,preparer_id);
CREATE INDEX rural_cases_checklist29 ON private.rural_cases29(checklist_id);
CREATE INDEX rural_cases_file29 ON private.rural_cases29(office_id,result_file_id);
CREATE INDEX rural_cases_creator29 ON private.rural_cases29(created_by);
CREATE TABLE private.rural_history29(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,case_id uuid NOT NULL,stage text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),pending text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,case_id) REFERENCES private.rural_cases29(office_id,id)
);
CREATE INDEX rural_history_case29 ON private.rural_history29(office_id,case_id,created_at DESC,id DESC);
CREATE INDEX rural_history_actor29 ON private.rural_history29(actor_id);
CREATE TABLE private.rural_commands29(
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),key uuid NOT NULL,session_id uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(office_id,actor_id,key)
);
CREATE INDEX rural_commands_actor29 ON private.rural_commands29(actor_id);
DO $m$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['rural_services29','rural_cases29','rural_history29','rural_commands29'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 IF t<>'rural_cases29' THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.wf_immutable()',t||'_immutable',t);END IF;
END LOOP;END$m$;
CREATE FUNCTION private.rural_case_guard29() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP='UPDATE' AND OLD.stage<>'concluido' AND NEW.version=OLD.version+1 AND NEW.updated_at>=OLD.updated_at
 AND (to_jsonb(NEW)-ARRAY['stage','pending','version','external_reference','result_file_id','result_sha256','updated_at','preparer_id'])=(to_jsonb(OLD)-ARRAY['stage','pending','version','external_reference','result_file_id','result_sha256','updated_at','preparer_id'])
 AND(NEW.preparer_id=OLD.preparer_id OR NEW.stage='encaminhado') THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';
END$$;
CREATE TRIGGER rural_case_identity29 BEFORE UPDATE OR DELETE ON private.rural_cases29 FOR EACH ROW EXECUTE FUNCTION private.rural_case_guard29();
CREATE FUNCTION private.rural_progress29(d private.rural_cases29,r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('kind',d.kind,'stage',CASE WHEN r.status='cancelado' THEN 'cancelado'
 WHEN d.stage='concluido' AND EXISTS(SELECT FROM private.deliveries dl JOIN private.document_publications p ON p.office_id=dl.office_id AND p.id=dl.publication_id JOIN public.documents doc ON doc.office_id=p.office_id AND doc.id=p.document_id JOIN private.delivery_events26 e ON e.delivery_id=dl.id AND e.kind='confirmed'
 WHERE dl.office_id=d.office_id AND doc.request_id=d.request_id AND dl.file_id=d.result_file_id AND dl.sha256=d.result_sha256 AND NOT EXISTS(SELECT FROM private.deliveries revoked JOIN private.delivery_events26 re ON re.delivery_id=revoked.id AND re.kind='revoked' WHERE revoked.office_id=dl.office_id AND revoked.publication_id=dl.publication_id)) THEN 'entregue' ELSE d.stage END,
 'pending',CASE WHEN r.status='cancelado' THEN '' ELSE d.pending END,'updated_at',d.updated_at);
$$;
CREATE FUNCTION private.rural_request29(o uuid,rid uuid,w boolean DEFAULT false) RETURNS public.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 m:=private.requests_actor(o,w);IF m.role_code='client' OR NOT private.current_permissions(o) @> ARRAY['rural.read','customers.read','checklists.read'] THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=o AND id=rid;
 IF r.id IS NULL OR NOT private.request_in_scope(r,m) THEN RAISE EXCEPTION 'RURAL_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF w AND(NOT private.request_can_work(r,m) OR NOT private.current_permissions(o) @> ARRAY['rural.records.manage','customers.update'] OR r.status IN('concluido','cancelado')) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN r;
END$$;
CREATE FUNCTION private.rural_workflow_state29(o uuid,rid uuid,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;d private.rural_cases29;canwork boolean;prepare boolean;reserved boolean;cp integer;BEGIN
 r:=private.rural_request29(o,rid);m:=private.requests_actor(o);
 IF page IS NULL OR page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO d FROM private.rural_cases29 WHERE office_id=o AND request_id=rid;
 IF d.id IS NOT NULL THEN PERFORM private.rural_access27(o,d.property_id);END IF;
 canwork:=private.request_can_work(r,m) AND r.status NOT IN('concluido','cancelado') AND private.current_permissions(o) @> ARRAY['rural.records.manage','customers.update'];
 prepare:=canwork AND d.stage IN('recebido','aguardando_documentos','complementacao');reserved:=canwork AND m.role_code='owner' AND d.stage IN('encaminhado','em_analise','em_preparacao');
 SELECT count(*) INTO cp FROM private.checklist_entries e WHERE e.office_id=o AND e.instance_id=d.checklist_id AND e.applicable AND e.rule->>'requirement'<>'optional' AND e.status NOT IN('validado','dispensado');
 RETURN jsonb_build_object('case',CASE WHEN d.id IS NULL THEN NULL ELSE private.rural_progress29(d,r)||jsonb_build_object('id',d.id,'property_name',(SELECT name FROM private.rural_properties WHERE office_id=o AND id=d.property_id),'version',d.version,'can_prepare',prepare,'can_reserved',reserved,'can_complement',reserved AND private.current_permissions(o) @> ARRAY['requests.transfer'],'can_handoff',prepare AND private.current_permissions(o) @> ARRAY['requests.transfer'],'can_complete',reserved AND d.stage='em_preparacao' AND cp=0 AND private.current_permissions(o) @> ARRAY['files.read'],'checklist_pending',cp,'external_reference',CASE WHEN private.current_permissions(o) @> ARRAY['files.read'] THEN d.external_reference ELSE '' END,'result_file_id',CASE WHEN private.current_permissions(o) @> ARRAY['files.read'] THEN d.result_file_id ELSE NULL END) END,
 'properties',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT DISTINCT p.id,p.name FROM private.property_records27 pr JOIN private.rural_properties p ON p.office_id=pr.office_id AND p.id=pr.property_id JOIN public.customers cu ON cu.office_id=p.office_id AND cu.id=p.customer_id WHERE pr.office_id=o AND pr.request_id=rid AND private.rural_scope_permissions(p,m.user_id) ORDER BY p.name,p.id LIMIT 5 OFFSET(page-1)*5)q),'[]'::jsonb),
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.snapshot->'definition'->>'name','kind',s.kind,'config_version',coalesce(s.version,0)) ORDER BY i.created_at,i.id) FROM public.request_items i LEFT JOIN LATERAL(SELECT * FROM private.rural_services29 WHERE office_id=o AND service_id=i.service_id ORDER BY version DESC LIMIT 1)s ON true WHERE i.office_id=o AND i.request_id=rid),'[]'::jsonb),
 'owners',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT a.id,coalesce(private.customer_relation_display_label(p.display_name),'Proprietário') AS name FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=o AND a.active AND a.role_code='owner' AND private.team_user_active(a.user_id,o) AND private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read','rural.read','customers.read','customers.update','checklists.read','rural.records.manage'] AND private.request_execution_allowed(r,a) ORDER BY name,a.id LIMIT 5 OFFSET(page-1)*5)q),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('stage',h.stage,'actor_name',coalesce(private.customer_relation_display_label(p.display_name),'Equipe'),'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC) FROM(SELECT * FROM private.rural_history29 WHERE office_id=o AND case_id=d.id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(page-1)*5)h LEFT JOIN public.profiles p ON p.id=h.actor_id),'[]'::jsonb),
 'history_total',(SELECT count(*) FROM private.rural_history29 WHERE office_id=o AND case_id=d.id),'page',page,'can_open',canwork AND d.id IS NULL AND private.current_permissions(o) @> ARRAY['checklists.update'],'can_configure',canwork AND m.role_code='owner' AND private.current_permissions(o) @> ARRAY['services.manage','checklists.manage']);
END$$;
CREATE FUNCTION private.rural_workflow_command29(o uuid,rid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;d private.rural_cases29;i public.request_items;s private.rural_services29;old private.rural_commands29;f public.files;ci private.checklist_instances;
 kind text;dg text;sid uuid;outid uuid;target public.memberships;nextstage text;ev integer;result jsonb;BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;
 SELECT * INTO r FROM public.requests WHERE office_id=o AND id=rid FOR UPDATE;
 -- Reading authority is always rechecked, even for committed retries after handoff.
 r:=private.rural_request29(o,rid);m:=private.requests_actor(o,true);
 IF k IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR c->>'kind' IS NULL THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=c->>'kind';sid:=(auth.jwt()->>'session_id')::uuid;dg:=encode(extensions.digest(jsonb_build_object('request',rid,'command',c)::text,'sha256'),'hex');
 IF NOT private.current_permissions(o) @> ARRAY['rural.records.manage','customers.update'] OR(kind IN('advance','complement','complete','configure') AND m.role_code<>'owner') OR(kind='configure' AND NOT private.current_permissions(o) @> ARRAY['services.manage','checklists.manage']) OR(kind='complete' AND NOT private.current_permissions(o) @> ARRAY['files.read']) OR(kind IN('handoff','complement') AND NOT private.current_permissions(o) @> ARRAY['requests.transfer']) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO d FROM private.rural_cases29 WHERE office_id=o AND request_id=rid FOR UPDATE;
 IF d.id IS NOT NULL THEN PERFORM private.rural_access27(o,d.property_id,'customers.update');END IF;
 SELECT * INTO old FROM private.rural_commands29 WHERE office_id=o AND actor_id=m.user_id AND key=k;
 IF old.key IS NOT NULL THEN
  IF old.session_id IS DISTINCT FROM sid THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF old.digest<>dg THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
  IF kind NOT IN('handoff','complement') AND NOT private.request_can_work(r,m) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF kind IN('handoff','complement') AND NOT private.request_can_work(r,m) AND NOT EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=o AND a.request_id=rid AND a.membership_id=m.id) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF r.status='cancelado' THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
  RETURN old.result;
 END IF;
 r:=private.rural_request29(o,rid,true);
 IF kind IN('configure','open') THEN
  SELECT * INTO i FROM public.request_items WHERE office_id=o AND request_id=rid AND id=private.request_uuid(c->'item_id');
  IF i.id IS NULL THEN RAISE EXCEPTION 'RURAL_NOT_FOUND' USING ERRCODE='PT404';END IF;
  PERFORM 1 FROM public.services WHERE office_id=o AND id=i.service_id FOR UPDATE;
  SELECT * INTO s FROM private.rural_services29 WHERE office_id=o AND service_id=i.service_id ORDER BY version DESC LIMIT 1;
  IF kind='configure' THEN
   PERFORM private.request_shape(c,ARRAY['kind','item_id','service_kind','expected_version']);
   IF jsonb_typeof(c->'expected_version') IS DISTINCT FROM 'number' OR c->>'expected_version'!~'^[0-9]{1,10}$' OR c->>'service_kind' IS NULL OR c->>'service_kind' NOT IN('CCIR','CAR') THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
   IF (c->>'expected_version')::integer<>coalesce(s.version,0) THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
   IF NOT EXISTS(SELECT FROM private.checklist_model_versions WHERE office_id=o AND service_id=i.service_id AND scope='internal' AND jsonb_array_length(definition->'items')>0) THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
   INSERT INTO private.rural_services29(office_id,service_id,version,kind,actor_id)VALUES(o,i.service_id,coalesce(s.version,0)+1,c->>'service_kind',m.user_id);
  ELSE
   PERFORM private.request_shape(c,ARRAY['kind','item_id','property_id']);
   IF d.id IS NOT NULL OR s.service_id IS NULL THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
   PERFORM private.rural_access27(o,private.request_uuid(c->'property_id'),'customers.update');
   IF NOT EXISTS(SELECT FROM private.property_records27 WHERE office_id=o AND request_id=rid AND property_id=(c->>'property_id')::uuid) THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
   PERFORM private.checklists_apply(o,rid,i.id,gen_random_uuid());
   SELECT * INTO ci FROM private.checklist_instances WHERE office_id=o AND request_id=rid AND item_id=i.id;
   IF ci.id IS NULL OR NOT EXISTS(SELECT FROM private.checklist_entries WHERE office_id=o AND instance_id=ci.id) THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
   IF r.assignee_id IS NULL THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
   INSERT INTO private.rural_cases29(office_id,request_id,item_id,property_id,kind,config_version,service_id,checklist_id,preparer_id,created_by)
    VALUES(o,rid,i.id,(c->>'property_id')::uuid,s.kind,s.version,i.service_id,ci.id,r.assignee_id,m.user_id)RETURNING * INTO d;outid:=d.id;
  END IF;
 ELSE
  IF d.id IS NULL THEN RAISE EXCEPTION 'RURAL_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF jsonb_typeof(c->'expected_version') IS DISTINCT FROM 'number' OR c->>'expected_version'!~'^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
  ev:=(c->>'expected_version')::int;IF ev<>d.version OR d.stage='concluido' THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
  IF kind IN('prepare','handoff') THEN
   IF d.stage NOT IN('recebido','aguardando_documentos','complementacao') THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF d.stage NOT IN('encaminhado','em_analise','em_preparacao') THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
  IF kind='prepare' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','stage']);nextstage:=c->>'stage';
   IF nextstage IS NULL OR nextstage NOT IN('recebido','aguardando_documentos') THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
  ELSIF kind='handoff' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','owner_id']);
   SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=private.request_uuid(c->'owner_id') AND active AND role_code='owner';
   IF target.id IS NULL OR NOT private.team_permissions_for_member(target.id) @> ARRAY['foundation.access','requests.read','rural.read','customers.read','customers.update','checklists.read','rural.records.manage'] THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
   nextstage:='encaminhado';d.preparer_id:=m.id;
  ELSIF kind='complement' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','pending']);d.pending:=private.request_text(c->'pending',1,500);nextstage:='complementacao';
   SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=d.preparer_id AND active;
   IF target.id IS NULL THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF kind='advance' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','stage']);nextstage:=c->>'stage';
   IF NOT(d.stage='encaminhado' AND nextstage='em_analise' OR d.stage='em_analise' AND nextstage='em_preparacao') THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF kind='complete' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','external_reference','file_id']);
   IF d.stage<>'em_preparacao' OR EXISTS(SELECT FROM private.checklist_entries WHERE office_id=o AND instance_id=d.checklist_id AND applicable AND rule->>'requirement'<>'optional' AND status NOT IN('validado','dispensado')) THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END IF;
   d.external_reference:=private.request_text(c->'external_reference',1,120);
   SELECT * INTO f FROM public.files WHERE office_id=o AND request_id=rid AND id=private.request_uuid(c->'file_id') FOR UPDATE;
   IF f.id IS NULL OR f.status NOT IN('quarentena','disponivel') OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
   IF NOT EXISTS(SELECT FROM private.file_references WHERE office_id=o AND file_id=f.id AND reference_kind='rural29') THEN INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(o,f.id,'rural29');END IF;
   d.result_file_id:=f.id;d.result_sha256:=f.sha256;nextstage:='concluido';d.pending:='';
  ELSE RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';END IF;
  IF target.id IS NOT NULL AND target.id IS DISTINCT FROM r.assignee_id THEN
   PERFORM private.request_mutate(o,rid,r.version,jsonb_build_object('kind','transfer','assignee_id',target.id,'reason',CASE WHEN kind='handoff' THEN 'Encaminhamento CCIR/CAR ao proprietário' ELSE 'Complementação CCIR/CAR solicitada pelo proprietário' END),gen_random_uuid());
  END IF;
  UPDATE private.rural_cases29 SET stage=nextstage,preparer_id=d.preparer_id,pending=d.pending,external_reference=d.external_reference,result_file_id=d.result_file_id,result_sha256=d.result_sha256,version=version+1,updated_at=clock_timestamp() WHERE office_id=o AND id=d.id RETURNING * INTO d;outid:=d.id;
 END IF;
 -- Current identity/permission checks after all locks; transfer intentionally changed the responsible member.
 m:=private.requests_actor(o,true);PERFORM private.rural_request29(o,rid);
 IF NOT private.current_permissions(o) @> ARRAY['rural.records.manage','customers.update'] THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF kind<>'configure' THEN INSERT INTO private.rural_history29(office_id,case_id,stage,actor_id,pending)VALUES(o,d.id,d.stage,m.user_id,d.pending);END IF;
 PERFORM private.emit_business_event(o,'rural.'||kind,'request',rid,k,'{}');
 result:=jsonb_build_object('id',outid);INSERT INTO private.rural_commands29(office_id,actor_id,key,session_id,digest,result)VALUES(o,m.user_id,k,sid,dg,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR check_violation OR not_null_violation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'RURAL_VALIDATION' USING ERRCODE='PT422';WHEN unique_violation THEN RAISE EXCEPTION 'RURAL_CONFLICT' USING ERRCODE='PT409';END$$;
-- Existing general status endpoints cannot bypass the reserved completion.
CREATE FUNCTION private.rural_close_guard29() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d private.rural_cases29;m public.memberships;BEGIN
 IF NEW.status='concluido' AND OLD.status IS DISTINCT FROM NEW.status THEN
  SELECT * INTO d FROM private.rural_cases29 WHERE office_id=NEW.office_id AND request_id=NEW.id;
  IF d.id IS NOT NULL THEN m:=private.requests_actor(NEW.office_id,true);IF m.role_code<>'owner' OR d.stage<>'concluido' THEN RAISE EXCEPTION 'RURAL_FORBIDDEN' USING ERRCODE='PT403';END IF;END IF;
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER rural_close29 BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION private.rural_close_guard29();
-- Portal projection is explicit: no property, employee IDs, file/hash, result or internal history.
ALTER FUNCTION private.request_summary(public.requests,boolean) RENAME TO request_summary_before_rural29;
CREATE FUNCTION private.request_summary(r public.requests,p_portal boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.request_summary_before_rural29(r,p_portal)||jsonb_build_object('rural_progress',(SELECT private.rural_progress29(d,r) FROM private.rural_cases29 d WHERE d.office_id=r.office_id AND d.request_id=r.id));
$$;
CREATE FUNCTION public.rural_workflow_state29(o uuid,rid uuid,page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.rural_workflow_state29(o,rid,page);$$;
CREATE FUNCTION public.rural_workflow_command29(o uuid,rid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.rural_workflow_command29(o,rid,c,k);$$;
REVOKE ALL ON FUNCTION private.rural_case_guard29(),private.rural_progress29(private.rural_cases29,public.requests),private.rural_request29(uuid,uuid,boolean),private.rural_workflow_state29(uuid,uuid,integer),private.rural_workflow_command29(uuid,uuid,jsonb,uuid),private.rural_close_guard29(),private.request_summary(public.requests,boolean),private.request_summary_before_rural29(public.requests,boolean),public.rural_workflow_state29(uuid,uuid,integer),public.rural_workflow_command29(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.rural_workflow_state29(uuid,uuid,integer),private.rural_workflow_command29(uuid,uuid,jsonb,uuid),public.rural_workflow_state29(uuid,uuid,integer),public.rural_workflow_command29(uuid,uuid,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
