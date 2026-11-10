-- RF14 extends the existing request/checklist/attachment/financial/document core.
INSERT INTO public.permissions(code,name) VALUES
 ('specialized.read','Consultar casos previdenciários e jurídicos'),('specialized.manage','Preparar casos e encaminhar documentos'),
 ('specialized.conduct','Conduzir análise e prazos especializados'),('specialized.sensitive','Acessar notas estratégicas e anexos médicos restritos') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions SELECT 'owner',x FROM unnest(ARRAY['specialized.read','specialized.manage','specialized.conduct','specialized.sensitive'])x ON CONFLICT DO NOTHING;
DO $m$ DECLARE r record;s text;BEGIN
 FOR r IN SELECT conrelid::regclass tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid IN('private.team_member_permissions'::regclass,'private.team_delegations'::regclass,'private.team_invitations'::regclass) AND contype='c' AND pg_get_constraintdef(oid) LIKE '%rural.records.manage%' LOOP
 s:=replace(r.def,'''rural.records.manage''::text','''rural.records.manage''::text,''specialized.read''::text,''specialized.manage''::text,''specialized.conduct''::text,''specialized.sensitive''::text');EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',r.tbl,r.conname);EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s',r.tbl,r.conname,s);END LOOP;
 FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='private'::regnamespace AND proname IN('team_scope_for_member','team_validate_assignment','safe_audit_changes') LOOP s:=replace(pg_get_functiondef(r.oid),'''rural.records.manage''','''rural.records.manage'',''specialized.read'',''specialized.manage'',''specialized.conduct'',''specialized.sensitive''');EXECUTE s;END LOOP;
END$m$;
CREATE TABLE private.specialized_services30(
 office_id uuid NOT NULL,service_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),kind text NOT NULL CHECK(kind IN('aposentadoria','salario_maternidade','requerimento','oficio','juridico')),
 actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,service_id,version),FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id)
);
CREATE INDEX specialized_services_actor30 ON private.specialized_services30(actor_id);
CREATE TABLE private.specialized_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,item_id uuid NOT NULL,service_id uuid NOT NULL,config_version integer NOT NULL,
 kind text NOT NULL CHECK(kind IN('aposentadoria','salario_maternidade','requerimento','oficio','juridico')),checklist_id uuid NOT NULL REFERENCES private.checklist_instances(id),preparer_id uuid NOT NULL,
 stage text NOT NULL DEFAULT 'recebido' CHECK(stage IN('recebido','aguardando_documentos','encaminhado','em_analise','complementacao','concluido')),
 pending text NOT NULL DEFAULT '' CHECK(char_length(pending)<=500 AND pending!~'[[:cntrl:]]'),external_reference text NOT NULL DEFAULT '' CHECK(char_length(external_reference)<=120 AND external_reference!~'[[:cntrl:]]'),
 version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),created_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,id),UNIQUE(office_id,request_id),
 FOREIGN KEY(office_id,request_id,item_id) REFERENCES public.request_items(office_id,request_id,id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id),
 FOREIGN KEY(office_id,service_id,config_version) REFERENCES private.specialized_services30(office_id,service_id,version),FOREIGN KEY(office_id,preparer_id) REFERENCES public.memberships(office_id,id)
);
CREATE INDEX specialized_cases_item30 ON private.specialized_cases(office_id,request_id,item_id);
CREATE INDEX specialized_cases_config30 ON private.specialized_cases(office_id,service_id,config_version);
CREATE INDEX specialized_cases_checklist30 ON private.specialized_cases(checklist_id);
CREATE INDEX specialized_cases_preparer30 ON private.specialized_cases(office_id,preparer_id);
CREATE INDEX specialized_cases_creator30 ON private.specialized_cases(created_by);
CREATE TABLE private.deadlines(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,case_id uuid NOT NULL,type text NOT NULL CHECK(type IN('interno','externo')),
 label text NOT NULL CHECK(char_length(btrim(label)) BETWEEN 1 AND 120 AND label!~'[[:cntrl:]]'),due_on date NOT NULL,alert_on date NOT NULL,checked_on date NOT NULL,source text NOT NULL CHECK(char_length(btrim(source)) BETWEEN 1 AND 500 AND source!~'[[:cntrl:]]'),responsible_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,completed_by uuid REFERENCES auth.users(id),
 FOREIGN KEY(office_id,case_id) REFERENCES private.specialized_cases(office_id,id),FOREIGN KEY(office_id,responsible_id) REFERENCES public.memberships(office_id,id),
 CHECK(alert_on<=due_on),CHECK((completed_at IS NULL)=(completed_by IS NULL))
);
CREATE INDEX deadlines_case30 ON private.deadlines(office_id,case_id,due_on,id);
CREATE INDEX deadlines_alert30 ON private.deadlines(office_id,responsible_id,alert_on) WHERE completed_at IS NULL;
CREATE INDEX deadlines_responsible30 ON private.deadlines(office_id,responsible_id);
CREATE INDEX deadlines_creator30 ON private.deadlines(created_by);
CREATE INDEX deadlines_completer30 ON private.deadlines(completed_by);
CREATE TABLE private.specialized_notes30(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,case_id uuid NOT NULL,text text NOT NULL CHECK(char_length(btrim(text)) BETWEEN 1 AND 2000 AND text!~'[[:cntrl:]]'),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(office_id,case_id) REFERENCES private.specialized_cases(office_id,id)
);
CREATE INDEX specialized_notes_case30 ON private.specialized_notes30(office_id,case_id,created_at DESC,id DESC);
CREATE INDEX specialized_notes_actor30 ON private.specialized_notes30(actor_id);
CREATE TABLE private.specialized_expenses30(
 office_id uuid NOT NULL,case_id uuid NOT NULL,expense_id uuid NOT NULL,linked_version integer NOT NULL CHECK(linked_version>0),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,case_id,expense_id),UNIQUE(office_id,expense_id),FOREIGN KEY(office_id,case_id) REFERENCES private.specialized_cases(office_id,id),FOREIGN KEY(office_id,expense_id) REFERENCES private.expenses(office_id,id)
);
CREATE INDEX specialized_expenses_actor30 ON private.specialized_expenses30(actor_id);
CREATE TABLE private.specialized_commands30(
 office_id uuid NOT NULL REFERENCES public.offices(id),actor_id uuid NOT NULL REFERENCES auth.users(id),key uuid NOT NULL,session_id uuid NOT NULL,digest text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(office_id,actor_id,key)
);
CREATE INDEX specialized_commands_actor30 ON private.specialized_commands30(actor_id);
DO $m$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['specialized_services30','specialized_cases','deadlines','specialized_notes30','specialized_commands30','specialized_expenses30'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
 IF t NOT IN('specialized_cases','deadlines') THEN EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.wf_immutable()',t||'_immutable',t);END IF;
END LOOP;END$m$;
CREATE FUNCTION private.specialized_guard30() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='specialized_cases' THEN IF OLD.stage<>'concluido' AND NEW.version=OLD.version+1 AND NEW.updated_at>=OLD.updated_at AND(to_jsonb(NEW)-ARRAY['stage','pending','external_reference','version','updated_at','preparer_id'])=(to_jsonb(OLD)-ARRAY['stage','pending','external_reference','version','updated_at','preparer_id']) AND(NEW.preparer_id=OLD.preparer_id OR NEW.stage='encaminhado') THEN RETURN NEW;END IF;END IF;
  IF TG_TABLE_NAME='deadlines' THEN IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL AND NEW.completed_by IS NOT NULL AND(to_jsonb(NEW)-ARRAY['completed_at','completed_by'])=(to_jsonb(OLD)-ARRAY['completed_at','completed_by']) THEN RETURN NEW;END IF;END IF;
 END IF;RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';
END$$;
CREATE TRIGGER specialized_case_guard30 BEFORE UPDATE OR DELETE ON private.specialized_cases FOR EACH ROW EXECUTE FUNCTION private.specialized_guard30();
CREATE TRIGGER deadline_guard30 BEFORE UPDATE OR DELETE ON private.deadlines FOR EACH ROW EXECUTE FUNCTION private.specialized_guard30();
CREATE FUNCTION private.specialized_request30(o uuid,rid uuid,w boolean DEFAULT false) RETURNS public.requests LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 m:=private.requests_actor(o,w);IF m.role_code='client' OR NOT private.current_permissions(o) @> ARRAY['specialized.read','checklists.read','customers.read'] THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=o AND id=rid;
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'SPECIALIZED_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF r.customer_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.customers cu WHERE cu.office_id=o AND cu.id=r.customer_id AND private.customer_in_scope(cu,m.user_id)) THEN RAISE EXCEPTION 'SPECIALIZED_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF w AND(private.request_can_work(r,m) IS NOT TRUE OR r.status IN('concluido','cancelado') OR NOT private.current_permissions(o) @> ARRAY['specialized.manage']) THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN r;
END$$;
CREATE FUNCTION private.specialized_progress30(d private.specialized_cases,r public.requests) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('kind',d.kind,'stage',CASE WHEN r.status='cancelado' THEN 'cancelado' ELSE d.stage END,'pending',CASE WHEN r.status='cancelado' THEN '' ELSE d.pending END,'updated_at',d.updated_at);
$$;
CREATE FUNCTION private.specialized_state30(o uuid,rid uuid,page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;d private.specialized_cases;work boolean;conduct boolean;sensitive boolean;cp integer;BEGIN
 r:=private.specialized_request30(o,rid);m:=private.requests_actor(o);IF page IS NULL OR page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO d FROM private.specialized_cases WHERE office_id=o AND request_id=rid;
 work:=private.request_can_work(r,m) AND r.status NOT IN('concluido','cancelado') AND private.current_permissions(o) @> ARRAY['specialized.manage'];
 conduct:=work AND m.role_code IN('owner','admin') AND private.current_permissions(o) @> ARRAY['specialized.conduct'];sensitive:=private.current_permissions(o) @> ARRAY['specialized.sensitive'];
 SELECT count(*) INTO cp FROM private.checklist_entries e WHERE e.office_id=o AND e.instance_id=d.checklist_id AND e.applicable AND e.rule->>'requirement'<>'optional' AND e.status NOT IN('validado','dispensado');
 RETURN jsonb_build_object('case',CASE WHEN d.id IS NULL THEN NULL ELSE private.specialized_progress30(d,r)||jsonb_build_object('id',d.id,'responsible_id',r.assignee_id,'responsible_name',coalesce((SELECT private.customer_relation_display_label(p.display_name) FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=o AND a.id=r.assignee_id),'Responsável'),'version',d.version,'can_prepare',work AND d.stage IN('recebido','aguardando_documentos','complementacao'),'can_handoff',work AND d.stage IN('recebido','aguardando_documentos','complementacao') AND private.current_permissions(o) @> ARRAY['requests.transfer'],'can_conduct',conduct AND d.stage<>'concluido','can_complement',conduct AND d.stage IN('encaminhado','em_analise') AND private.current_permissions(o) @> ARRAY['requests.transfer'],'can_sensitive',sensitive,'can_complete',conduct AND d.stage='em_analise' AND cp=0 AND NOT EXISTS(SELECT FROM private.deadlines WHERE office_id=o AND case_id=d.id AND completed_at IS NULL),'checklist_pending',cp,'checklist_version',coalesce((SELECT ((regexp_match(source,'Interno v([0-9]+)'))[1])::int FROM private.checklist_instances WHERE id=d.checklist_id),1),'external_reference',CASE WHEN conduct OR sensitive THEN d.external_reference ELSE '' END) END,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.snapshot->'definition'->>'name','kind',s.kind,'config_version',coalesce(s.version,0)) ORDER BY i.created_at,i.id) FROM public.request_items i LEFT JOIN LATERAL(SELECT * FROM private.specialized_services30 WHERE office_id=o AND service_id=i.service_id ORDER BY version DESC LIMIT 1)s ON true WHERE i.office_id=o AND i.request_id=rid),'[]'::jsonb),
 'owners',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT a.id,coalesce(private.customer_relation_display_label(p.display_name),'Proprietário') name FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=o AND a.active AND a.role_code='owner' AND private.team_user_active(a.user_id,o) AND private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read','specialized.read','specialized.manage','specialized.conduct','customers.read','checklists.read'] AND private.request_execution_allowed(r,a) ORDER BY name,a.id LIMIT 5 OFFSET(page-1)*5)q),'[]'::jsonb),
 'participants',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT DISTINCT cu.id,cu.name FROM public.request_items i CROSS JOIN LATERAL jsonb_array_elements_text(i.participant_ids) p(id) JOIN public.customers cu ON cu.office_id=i.office_id AND cu.id=p.id::uuid WHERE i.office_id=o AND i.request_id=rid AND private.customer_in_scope(cu,m.user_id) ORDER BY cu.name,cu.id LIMIT 20)q),'[]'::jsonb),
 'notes',CASE WHEN sensitive THEN coalesce((SELECT jsonb_agg(jsonb_build_object('text',n.text,'created_at',n.created_at) ORDER BY n.created_at DESC,n.id DESC) FROM(SELECT * FROM private.specialized_notes30 WHERE office_id=o AND case_id=d.id ORDER BY created_at DESC,id DESC LIMIT 5 OFFSET(page-1)*5)n),'[]'::jsonb) ELSE '[]'::jsonb END,
 'deadlines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'type',x.type,'label',x.label,'due_on',x.due_on,'alert_on',x.alert_on,'checked_on',x.checked_on,'source',x.source,'responsible_name',coalesce(private.customer_relation_display_label(p.display_name),'Responsável'),'completed_at',x.completed_at) ORDER BY x.due_on,x.id) FROM(SELECT * FROM private.deadlines WHERE office_id=o AND case_id=d.id ORDER BY due_on,id LIMIT 5 OFFSET(page-1)*5)x JOIN public.memberships a ON a.office_id=x.office_id AND a.id=x.responsible_id JOIN public.profiles p ON p.id=a.user_id),'[]'::jsonb),
 'financial',jsonb_build_object('fees',CASE WHEN private.current_permissions(o) @> ARRAY['charges.read'] THEN(SELECT jsonb_build_object('due_cents',v#>'{charge,due_cents}','balance_cents',v#>'{charge,balance_cents}') FROM(SELECT private.charges_view(o,rid,1) v)q WHERE v->'charge'<>'null'::jsonb) ELSE NULL END,
 'expenses',CASE WHEN private.current_permissions(o) @> ARRAY['expenses.read','cash.read'] THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'label',left(e.description,120),'amount_cents',e.amount_cents,'status',e.status,'version',e.version)) FROM(SELECT e.* FROM private.expenses e JOIN private.specialized_expenses30 x ON x.office_id=e.office_id AND x.expense_id=e.id WHERE x.office_id=o AND x.case_id=d.id ORDER BY e.created_at DESC,e.id LIMIT 5 OFFSET(page-1)*5)e),'[]'::jsonb) ELSE '[]'::jsonb END,
 'options',CASE WHEN conduct AND private.current_permissions(o) @> ARRAY['expenses.read','cash.read'] THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'label',left(e.description,120),'amount_cents',e.amount_cents,'status',e.status,'version',e.version)) FROM(SELECT e.* FROM private.expenses e WHERE e.office_id=o AND NOT EXISTS(SELECT FROM private.specialized_expenses30 x WHERE x.office_id=o AND x.expense_id=e.id) ORDER BY e.created_at DESC,e.id LIMIT 5 OFFSET(page-1)*5)e),'[]'::jsonb) ELSE '[]'::jsonb END,
 'total',CASE WHEN private.current_permissions(o) @> ARRAY['expenses.read','cash.read'] THEN(SELECT count(*) FROM private.specialized_expenses30 WHERE office_id=o AND case_id=d.id) ELSE 0 END,
 'options_total',CASE WHEN conduct AND private.current_permissions(o) @> ARRAY['expenses.read','cash.read'] THEN(SELECT count(*) FROM private.expenses e WHERE e.office_id=o AND NOT EXISTS(SELECT FROM private.specialized_expenses30 x WHERE x.office_id=o AND x.expense_id=e.id)) ELSE 0 END,
 'can_link',conduct AND d.id IS NOT NULL AND d.stage<>'concluido' AND private.current_permissions(o) @> ARRAY['expenses.read','cash.read']),
 'total_deadlines',(SELECT count(*) FROM private.deadlines WHERE office_id=o AND case_id=d.id),'page',page,'can_open',work AND d.id IS NULL AND r.assignee_id IS NOT NULL AND private.current_permissions(o) @> ARRAY['checklists.update'],
 'can_configure',conduct AND private.current_permissions(o) @> ARRAY['services.manage','checklists.manage']);
END$$;
CREATE FUNCTION private.specialized_command30(o uuid,rid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;d private.specialized_cases;i public.request_items;s private.specialized_services30;ci private.checklist_instances;old private.specialized_commands30;kind text;dg text;sid uuid;target public.memberships;result jsonb;outid uuid;BEGIN
 PERFORM 1 FROM public.offices WHERE id=o FOR NO KEY UPDATE;PERFORM 1 FROM public.requests WHERE office_id=o AND id=rid FOR UPDATE;
 r:=private.specialized_request30(o,rid);m:=private.requests_actor(o,true);
 IF k IS NULL OR jsonb_typeof(c) IS DISTINCT FROM 'object' OR c->>'kind' IS NULL THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=c->>'kind';sid:=(auth.jwt()->>'session_id')::uuid;dg:=encode(extensions.digest(jsonb_build_object('request',rid,'command',c)::text,'sha256'),'hex');
 IF NOT private.current_permissions(o) @> ARRAY['specialized.manage'] OR(kind IN('configure','complement','note','external','deadline','finish_deadline','complete','expense') AND(m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(o) @> ARRAY['specialized.conduct'])) OR(kind='advance' AND c->>'stage'='em_analise' AND(m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(o) @> ARRAY['specialized.conduct'])) OR(kind='open' AND NOT private.current_permissions(o) @> ARRAY['checklists.update']) OR(kind='expense' AND NOT private.current_permissions(o) @> ARRAY['expenses.read','cash.read']) OR(kind='note' AND NOT private.current_permissions(o) @> ARRAY['specialized.sensitive']) OR(kind='configure' AND NOT private.current_permissions(o) @> ARRAY['services.manage','checklists.manage']) OR(kind IN('handoff','complement') AND NOT private.current_permissions(o) @> ARRAY['requests.transfer']) THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO d FROM private.specialized_cases WHERE office_id=o AND request_id=rid FOR UPDATE;
 SELECT * INTO old FROM private.specialized_commands30 WHERE office_id=o AND actor_id=m.user_id AND key=k;
 IF old.key IS NOT NULL THEN
  IF old.session_id IS DISTINCT FROM sid THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF old.digest<>dg THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
  IF private.request_can_work(r,m) IS NOT TRUE AND(kind NOT IN('handoff','complement') OR NOT EXISTS(SELECT FROM private.request_assignments WHERE office_id=o AND request_id=rid AND membership_id=m.id)) OR r.status='cancelado' THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN old.result;
 END IF;
 r:=private.specialized_request30(o,rid,true);
 IF kind IN('configure','open') THEN
  SELECT * INTO i FROM public.request_items WHERE office_id=o AND request_id=rid AND id=private.request_uuid(c->'item_id');IF i.id IS NULL THEN RAISE EXCEPTION 'SPECIALIZED_NOT_FOUND' USING ERRCODE='PT404';END IF;
  PERFORM 1 FROM public.services WHERE office_id=o AND id=i.service_id FOR UPDATE;
  SELECT * INTO s FROM private.specialized_services30 WHERE office_id=o AND service_id=i.service_id ORDER BY version DESC LIMIT 1;
  IF kind='configure' THEN
   PERFORM private.request_shape(c,ARRAY['kind','item_id','service_kind','expected_version']);
   IF jsonb_typeof(c->'expected_version') IS DISTINCT FROM 'number' OR c->>'expected_version'!~'^[0-9]{1,10}$' OR c->>'service_kind' IS NULL OR c->>'service_kind' NOT IN('aposentadoria','salario_maternidade','requerimento','oficio','juridico') THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
   IF (c->>'expected_version')::int<>coalesce(s.version,0) THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
   IF NOT EXISTS(SELECT FROM private.checklist_model_versions WHERE office_id=o AND service_id=i.service_id AND scope='internal' AND jsonb_array_length(definition->'items')>0) THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
   INSERT INTO private.specialized_services30(office_id,service_id,version,kind,actor_id)VALUES(o,i.service_id,coalesce(s.version,0)+1,c->>'service_kind',m.user_id);
  ELSE
   PERFORM private.request_shape(c,ARRAY['kind','item_id']);IF d.id IS NOT NULL OR s.service_id IS NULL OR r.assignee_id IS NULL OR EXISTS(SELECT FROM private.rural_cases29 WHERE office_id=o AND request_id=rid) THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
   PERFORM private.checklists_apply(o,rid,i.id,gen_random_uuid());SELECT * INTO ci FROM private.checklist_instances WHERE office_id=o AND request_id=rid AND item_id=i.id;
   IF ci.id IS NULL OR NOT EXISTS(SELECT FROM private.checklist_entries WHERE office_id=o AND instance_id=ci.id) THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
   INSERT INTO private.specialized_cases(office_id,request_id,item_id,service_id,config_version,kind,checklist_id,preparer_id,created_by)VALUES(o,rid,i.id,i.service_id,s.version,s.kind,ci.id,r.assignee_id,m.user_id) RETURNING * INTO d;outid:=d.id;
  END IF;
 ELSE
  IF d.id IS NULL THEN RAISE EXCEPTION 'SPECIALIZED_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF jsonb_typeof(c->'expected_version') IS DISTINCT FROM 'number' OR c->>'expected_version'!~'^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
  IF(c->>'expected_version')::int<>d.version OR d.stage='concluido' THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
  IF kind='handoff' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','owner_id']);IF d.stage NOT IN('recebido','aguardando_documentos','complementacao') THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
   SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=private.request_uuid(c->'owner_id') AND active AND role_code='owner';
   IF target.id IS NULL OR NOT private.team_permissions_for_member(target.id) @> ARRAY['foundation.access','requests.read','specialized.read','specialized.manage','specialized.conduct','customers.read','checklists.read'] THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;d.stage:='encaminhado';d.preparer_id:=m.id;
  ELSIF kind='advance' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','stage']);
   IF c->>'stage'='aguardando_documentos' AND d.stage IN('recebido','complementacao') THEN d.stage:='aguardando_documentos';
   ELSIF c->>'stage'='em_analise' AND d.stage='encaminhado' THEN IF m.role_code NOT IN('owner','admin') OR NOT private.current_permissions(o) @> ARRAY['specialized.conduct'] THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;d.stage:='em_analise';
   ELSE RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF kind='complement' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','pending']);IF d.stage NOT IN('encaminhado','em_analise') THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
   d.pending:=private.request_text(c->'pending',1,500);d.stage:='complementacao';SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=d.preparer_id AND active;
   IF target.id IS NULL OR NOT private.team_permissions_for_member(target.id) @> ARRAY['foundation.access','requests.read','specialized.read','specialized.manage','customers.read','checklists.read'] THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF kind='note' THEN PERFORM private.request_shape(c,ARRAY['kind','expected_version','text']);INSERT INTO private.specialized_notes30(office_id,case_id,text,actor_id)VALUES(o,d.id,private.request_text(c->'text',1,2000),m.user_id);
  ELSIF kind='external' THEN PERFORM private.request_shape(c,ARRAY['kind','expected_version','reference']);d.external_reference:=private.request_text(c->'reference',1,120);
  ELSIF kind='deadline' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','type','label','due_on','source','responsible_id','alert_on','checked_on']);
   IF c->>'type' IS NULL OR c->>'type' NOT IN('interno','externo') OR EXISTS(SELECT FROM unnest(ARRAY['due_on','alert_on','checked_on'])x WHERE jsonb_typeof(c->x) IS DISTINCT FROM 'string' OR c->>x!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR(c->>'checked_on')::date>current_date THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
   SELECT * INTO target FROM public.memberships WHERE office_id=o AND id=private.request_uuid(c->'responsible_id') AND id=r.assignee_id AND active;
   IF target.id IS NULL THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;
   INSERT INTO private.deadlines(office_id,case_id,type,label,due_on,alert_on,checked_on,source,responsible_id,created_by)VALUES(o,d.id,c->>'type',private.request_text(c->'label',1,120),(c->>'due_on')::date,(c->>'alert_on')::date,(c->>'checked_on')::date,private.request_text(c->'source',1,500),target.id,m.user_id);target:=NULL;
  ELSIF kind='finish_deadline' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','deadline_id']);UPDATE private.deadlines SET completed_at=clock_timestamp(),completed_by=m.user_id WHERE office_id=o AND case_id=d.id AND id=private.request_uuid(c->'deadline_id') AND completed_at IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF kind='expense' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version','expense_id','expected_expense_version']);
   IF jsonb_typeof(c->'expected_expense_version') IS DISTINCT FROM 'number' OR c->>'expected_expense_version'!~'^[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
   PERFORM 1 FROM private.expenses WHERE office_id=o AND id=private.request_uuid(c->'expense_id') FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'SPECIALIZED_NOT_FOUND' USING ERRCODE='PT404';END IF;
   IF NOT EXISTS(SELECT FROM private.expenses WHERE office_id=o AND id=(c->>'expense_id')::uuid AND version=(c->>'expected_expense_version')::integer) THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
   INSERT INTO private.specialized_expenses30(office_id,case_id,expense_id,linked_version,actor_id)VALUES(o,d.id,(c->>'expense_id')::uuid,(c->>'expected_expense_version')::int,m.user_id) ON CONFLICT DO NOTHING;
   IF NOT FOUND THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;
  ELSIF kind='complete' THEN
   PERFORM private.request_shape(c,ARRAY['kind','expected_version']);IF d.stage<>'em_analise' OR EXISTS(SELECT FROM private.checklist_entries WHERE office_id=o AND instance_id=d.checklist_id AND applicable AND rule->>'requirement'<>'optional' AND status NOT IN('validado','dispensado')) OR EXISTS(SELECT FROM private.deadlines WHERE office_id=o AND case_id=d.id AND completed_at IS NULL) THEN RAISE EXCEPTION 'SPECIALIZED_CONFLICT' USING ERRCODE='PT409';END IF;d.stage:='concluido';d.pending:='';
  ELSE RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';END IF;
  IF kind IN('handoff','complement') AND target.id IS DISTINCT FROM r.assignee_id THEN PERFORM private.request_mutate(o,rid,r.version,jsonb_build_object('kind','transfer','assignee_id',target.id,'reason',CASE WHEN kind='handoff' THEN 'Caso especializado encaminhado ao proprietário' ELSE 'Complementação especializada solicitada' END),gen_random_uuid());END IF;
  UPDATE private.specialized_cases SET stage=d.stage,pending=d.pending,external_reference=d.external_reference,preparer_id=d.preparer_id,version=version+1,updated_at=clock_timestamp() WHERE office_id=o AND id=d.id RETURNING * INTO d;outid:=d.id;
 END IF;
 result:=jsonb_build_object('id',outid);INSERT INTO private.specialized_commands30(office_id,actor_id,key,session_id,digest,result)VALUES(o,m.user_id,k,sid,dg,result);
 PERFORM private.team_audit(o,m.user_id,'specialized.'||kind,'request',rid,k,'{}');RETURN result;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR datetime_field_overflow OR check_violation THEN RAISE EXCEPTION 'SPECIALIZED_VALIDATION' USING ERRCODE='PT422';
END$$;
CREATE FUNCTION private.specialized_close30() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$DECLARE d private.specialized_cases;m public.memberships;BEGIN
 IF NEW.status='concluido' AND OLD.status IS DISTINCT FROM NEW.status THEN SELECT * INTO d FROM private.specialized_cases WHERE office_id=NEW.office_id AND request_id=NEW.id;
 IF d.id IS NOT NULL THEN m:=private.requests_actor(NEW.office_id,true);IF m.role_code NOT IN('owner','admin') OR d.stage<>'concluido' OR NOT private.current_permissions(NEW.office_id) @> ARRAY['specialized.conduct'] THEN RAISE EXCEPTION 'SPECIALIZED_FORBIDDEN' USING ERRCODE='PT403';END IF;END IF;END IF;RETURN NEW;
END$$;
CREATE TRIGGER specialized_close30 BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION private.specialized_close30();
ALTER FUNCTION private.request_summary(public.requests,boolean) RENAME TO request_summary_before_specialized30;
CREATE FUNCTION private.request_summary(r public.requests,p_portal boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.request_summary_before_specialized30(r,p_portal)||jsonb_build_object('specialized_progress',(SELECT private.specialized_progress30(d,r) FROM private.specialized_cases d WHERE d.office_id=r.office_id AND d.request_id=r.id));$$;
CREATE FUNCTION public.specialized_state30(o uuid,rid uuid,page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.specialized_state30(o,rid,page);$$;
CREATE FUNCTION public.specialized_command30(o uuid,rid uuid,c jsonb,k uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.specialized_command30(o,rid,c,k);$$;
REVOKE ALL ON FUNCTION private.specialized_guard30(),private.specialized_request30(uuid,uuid,boolean),private.specialized_progress30(private.specialized_cases,public.requests),private.specialized_state30(uuid,uuid,integer),private.specialized_command30(uuid,uuid,jsonb,uuid),private.specialized_close30(),private.request_summary(public.requests,boolean),private.request_summary_before_specialized30(public.requests,boolean),public.specialized_state30(uuid,uuid,integer),public.specialized_command30(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.specialized_state30(uuid,uuid,integer),private.specialized_command30(uuid,uuid,jsonb,uuid),public.specialized_state30(uuid,uuid,integer),public.specialized_command30(uuid,uuid,jsonb,uuid) TO authenticated;
-- Sensitivity is captured before bytes arrive and cannot be removed by copying/linking.
ALTER TABLE public.files DROP CONSTRAINT files_classification_check;
ALTER TABLE public.files ADD CONSTRAINT files_classification_check CHECK(classification IN('documento','identificacao','comprovante','medico','estrategico'));
CREATE FUNCTION private.specialized_file_allowed30(f public.files) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;BEGIN
 IF f.classification NOT IN('medico','estrategico') THEN RETURN true;END IF;
 m:=private.requests_actor(f.office_id);SELECT * INTO r FROM public.requests WHERE office_id=f.office_id AND id=f.request_id;
 RETURN m.role_code<>'client' AND private.current_permissions(f.office_id) @> ARRAY['files.read','specialized.read','specialized.sensitive'] AND private.request_in_scope(r,m) AND EXISTS(SELECT FROM private.specialized_cases WHERE office_id=f.office_id AND request_id=f.request_id);
EXCEPTION WHEN OTHERS THEN RETURN false;
END$$;
CREATE FUNCTION private.specialized_file_guard30() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF TG_OP='UPDATE' AND(OLD.classification IS DISTINCT FROM NEW.classification OR OLD.request_id IS DISTINCT FROM NEW.request_id) THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF TG_OP='INSERT' AND NEW.classification IN('medico','estrategico') THEN
  IF private.specialized_file_allowed30(NEW) IS NOT TRUE THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  PERFORM private.specialized_request30(NEW.office_id,NEW.request_id,true);
 END IF;RETURN NEW;
END$$;
CREATE TRIGGER specialized_file_guard30 BEFORE INSERT OR UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION private.specialized_file_guard30();
CREATE FUNCTION private.specialized_file_reference30() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF EXISTS(SELECT FROM public.files WHERE office_id=NEW.office_id AND id=NEW.file_id AND classification IN('medico','estrategico')) AND NEW.reference_kind<>'specialized30' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN NEW;
END$$;
CREATE TRIGGER specialized_file_reference30 BEFORE INSERT OR UPDATE ON private.file_references FOR EACH ROW EXECUTE FUNCTION private.specialized_file_reference30();
CREATE FUNCTION private.specialized_file_protect30() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF NEW.classification IN('medico','estrategico') THEN INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(NEW.office_id,NEW.id,'specialized30');END IF;RETURN NEW;
END$$;
CREATE TRIGGER specialized_file_protect30 AFTER INSERT ON public.files FOR EACH ROW EXECUTE FUNCTION private.specialized_file_protect30();
ALTER FUNCTION private.files_file_json(public.files,public.memberships) RENAME TO files_file_json_before30;
CREATE FUNCTION private.files_file_json(f public.files,m public.memberships) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF private.specialized_file_allowed30(f) IS NOT TRUE THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.files_file_json_before30(f,m)||CASE WHEN f.classification IN('medico','estrategico') THEN '{"can_copy":false}'::jsonb ELSE '{}'::jsonb END;
END$$;
-- Patch only the named existing gates, with assertions against silent drift.
DO $m$ DECLARE s text;next text;BEGIN
 s:=pg_get_functiondef('private.files_begin_upload(uuid,jsonb,uuid)'::regprocedure);
 next:=replace(s,'''documento'',''identificacao'',''comprovante''','''documento'',''identificacao'',''comprovante'',''medico'',''estrategico''');
 IF next=s THEN RAISE EXCEPTION 'Missing upload classification gate';END IF;EXECUTE next;
 s:=pg_get_functiondef('private.files_page(uuid,uuid,integer,integer)'::regprocedure);
 next:=replace(s,'WHERE f.office_id=p_office_id AND','WHERE private.specialized_file_allowed30(f) AND f.office_id=p_office_id AND');
 IF next=s THEN RAISE EXCEPTION 'Missing files page gate';END IF;EXECUTE next;
 s:=pg_get_functiondef('private.files_download(uuid,uuid,uuid)'::regprocedure);
 next:=replace(s,'IF f.status<>''disponivel''','IF private.specialized_file_allowed30(f) IS NOT TRUE THEN RAISE EXCEPTION ''FILE_NOT_FOUND'' USING ERRCODE=''PT404'';END IF; IF f.status<>''disponivel''');
 IF next=s THEN RAISE EXCEPTION 'Missing download gate';END IF;EXECUTE next;
 s:=pg_get_functiondef('private.files_storage_allowed(text,text,text,jsonb)'::regprocedure);
 next:=replace(s,'DECLARE i private.upload_intents;','DECLARE f public.files;i private.upload_intents;');
 next:=replace(next,'IF NOT private.files_storage_allowed_before_portal_returns','SELECT x.* INTO f FROM public.files x JOIN private.upload_intents u ON u.office_id=x.office_id AND u.file_id=x.id WHERE u.bucket=p_bucket AND u.object_path=p_path; IF f.id IS NULL OR private.specialized_file_allowed30(f) IS NOT TRUE THEN RETURN false;END IF; IF NOT private.files_storage_allowed_before_portal_returns');
 IF next=s THEN RAISE EXCEPTION 'Missing storage gate';END IF;EXECUTE next;
 s:=pg_get_functiondef('private.files_process_claim(uuid,text,jsonb,uuid)'::regprocedure);
 next:=replace(s,'IF source_f.id IS NULL THEN','IF source_f.classification IN(''medico'',''estrategico'') THEN RAISE EXCEPTION ''FILES_FORBIDDEN'' USING ERRCODE=''PT403'';END IF; IF source_f.id IS NULL THEN');
 next:=replace(next,'IF i.created_by<>m.user_id OR','IF private.specialized_file_allowed30(f) IS NOT TRUE THEN RAISE EXCEPTION ''FILE_NOT_FOUND'' USING ERRCODE=''PT404'';END IF; IF i.created_by<>m.user_id OR');
 IF next=s THEN RAISE EXCEPTION 'Missing process gate';END IF;EXECUTE next;
END$m$;
REVOKE ALL ON FUNCTION private.specialized_file_allowed30(public.files),private.specialized_file_guard30(),private.specialized_file_reference30(),private.specialized_file_protect30(),private.files_file_json_before30(public.files,public.memberships),private.files_file_json(public.files,public.memberships) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
