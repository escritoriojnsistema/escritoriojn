-- Etapa12: additive immutable checklist snapshots and recipient-scoped notices.
INSERT INTO public.permissions(code,name) VALUES ('checklists.read','Consultar pendencias'),('checklists.manage','Publicar modelos de checklist'),('checklists.update','Atualizar e avisar pendencias'),('checklists.waive','Dispensar itens com motivo') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code IN('checklists.read','checklists.manage','checklists.update','checklists.waive') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive']);

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive'],
   'can_create_owner',private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],'can_delegate',true,'delegation_id',NULL);
 END IF;
 SELECT * INTO d FROM private.team_delegations WHERE membership_id=m.id AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF m.role_code<>'admin' OR d.id IS NULL THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','admin',
  'allowed_roles',d.allowed_roles,'allowed_permissions',d.allowed_permissions,'can_create_owner',
  d.can_create_owner AND private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],
  'can_delegate',false,'delegation_id',d.id);
END $$;


CREATE OR REPLACE FUNCTION private.team_validate_assignment(p_actor jsonb,p_role text,p_permissions text[],p_creating_owner boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('employee','admin','owner') OR p_permissions IS NULL
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive'])
  OR cardinality(p_permissions)<>(SELECT count(DISTINCT x) FROM unnest(p_permissions) x)
  OR NOT EXISTS (SELECT FROM public.roles WHERE code=p_role AND active)
  OR EXISTS (SELECT FROM unnest(p_permissions) x WHERE NOT EXISTS(SELECT FROM public.permissions WHERE code=x AND active)) THEN
  RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF NOT (p_actor->'allowed_roles' ? p_role) OR NOT (p_actor->'allowed_permissions' @> to_jsonb(p_permissions))
  OR (p_role='owner' AND p_creating_owner AND NOT (p_actor->>'can_create_owner')::boolean) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
END $$;


CREATE OR REPLACE FUNCTION private.safe_audit_changes(p_changes jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE k text; v jsonb; result jsonb:='{}'; safe boolean;
BEGIN
 IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' THEN RETURN result; END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_changes) LOOP
  safe:=false;
  IF k IN ('active','can_create_owner') THEN safe:=jsonb_typeof(v)='boolean';
  ELSIF k='role_code' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}'=ANY(ARRAY['owner','admin','employee','client']);
  ELSIF k IN ('membership_id','archive_id','customer_id','source_id','target_id','relation_id','merge_id') THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ELSIF k='expires_at' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9TZ:+. -]{20,35}$';
  ELSIF k='count' AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN 0 AND 1000;
  ELSIF k IN ('permissions','allowed_permissions') AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE TABLE private.checklist_model_versions(
 office_id uuid NOT NULL,service_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),
 definition jsonb NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,service_id,version),FOREIGN KEY(office_id,service_id) REFERENCES public.services(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX checklist_models_actor_idx ON private.checklist_model_versions(actor_id);
CREATE TABLE private.checklist_instances(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,item_id uuid NOT NULL,
 source text NOT NULL,definition jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,id),UNIQUE(office_id,request_id,item_id),
 FOREIGN KEY(office_id,request_id,item_id) REFERENCES public.request_items(office_id,request_id,id) ON DELETE RESTRICT
);
CREATE INDEX checklist_instances_actor_idx ON private.checklist_instances(actor_id);
CREATE TABLE private.checklist_entries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,instance_id uuid NOT NULL,
 position integer NOT NULL CHECK(position BETWEEN 1 AND 12),rule jsonb NOT NULL,applicable boolean NOT NULL,
 status text NOT NULL DEFAULT 'pendente' CHECK(status IN('pendente','recebido','validado','dispensado')),
 file_id uuid,version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 2147483646),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,id),UNIQUE(office_id,instance_id,position),
 FOREIGN KEY(office_id,instance_id) REFERENCES private.checklist_instances(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT,
 CHECK((status IN('recebido','validado'))=(file_id IS NOT NULL))
);
CREATE UNIQUE INDEX checklist_entries_file_unique ON private.checklist_entries(instance_id,file_id) WHERE file_id IS NOT NULL;
CREATE INDEX checklist_entries_file_idx ON private.checklist_entries(office_id,file_id);
CREATE INDEX checklist_entries_actor_idx ON private.checklist_entries(actor_id);
CREATE TABLE private.checklist_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,entry_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN('pendente','recebido','validado','dispensado')),file_id uuid,
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,entry_id) REFERENCES private.checklist_entries(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,file_id) REFERENCES public.files(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX checklist_history_entry_idx ON private.checklist_history(office_id,entry_id,created_at DESC,id DESC);
CREATE INDEX checklist_history_file_idx ON private.checklist_history(office_id,file_id);
CREATE INDEX checklist_history_actor_idx ON private.checklist_history(actor_id);
CREATE TABLE private.internal_notifications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,
 recipient_id uuid NOT NULL,event_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('handoff','pending')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),read_at timestamptz,
 UNIQUE(office_id,recipient_id,kind,event_id),
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,recipient_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX internal_notifications_recipient_idx ON private.internal_notifications(office_id,recipient_id,created_at DESC,id DESC);
CREATE INDEX internal_notifications_request_idx ON private.internal_notifications(office_id,request_id);
DO $$DECLARE t regclass;BEGIN FOREACH t IN ARRAY ARRAY['private.checklist_model_versions'::regclass,'private.checklist_instances'::regclass,'private.checklist_entries'::regclass,'private.checklist_history'::regclass,'private.internal_notifications'::regclass] LOOP
 EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP;END $$;
CREATE TRIGGER checklist_models_immutable BEFORE UPDATE OR DELETE ON private.checklist_model_versions FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER checklist_instances_immutable BEFORE UPDATE OR DELETE ON private.checklist_instances FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER checklist_history_immutable BEFORE UPDATE OR DELETE ON private.checklist_history FOR EACH ROW EXECUTE FUNCTION private.request_immutable();

CREATE FUNCTION private.checklists_actor(p_office_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;caps text[];
BEGIN
 m:=private.requests_actor(p_office_id,p_write);caps:=private.current_permissions(p_office_id);
 IF m.role_code='client' OR NOT caps @> ARRAY['checklists.read'] OR (p_capability IS NOT NULL AND NOT caps @> ARRAY[p_capability]) THEN RAISE EXCEPTION 'CHECKLIST_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN m;
END $$;
CREATE FUNCTION private.checklists_request(p_office_id uuid,p_request_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS public.requests LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;
BEGIN
 m:=private.checklists_actor(p_office_id,p_write,p_capability);
 IF p_write THEN SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 ELSE SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR SHARE;END IF;
 m:=private.checklists_actor(p_office_id,p_write,p_capability);
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_write AND r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;RETURN r;
END $$;
CREATE FUNCTION private.checklists_definition(p_definition jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE x jsonb;c jsonb;
BEGIN
 PERFORM private.request_shape(p_definition,ARRAY['name','items']);PERFORM private.request_text(p_definition->'name',1,80);
 IF jsonb_typeof(p_definition->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 IF jsonb_array_length(p_definition->'items') NOT BETWEEN 1 AND 12 OR (SELECT count(DISTINCT elt->>'key') FROM jsonb_array_elements(p_definition->'items') elt)<>jsonb_array_length(p_definition->'items') THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(p_definition->'items') LOOP
  PERFORM private.request_shape(x,ARRAY['key','label','requirement','condition']);PERFORM private.request_text(x->'label',1,120);
  IF jsonb_typeof(x->'key') IS DISTINCT FROM 'string' OR x->>'key' !~ '^[a-z][a-z0-9_]{0,31}$' OR x->>'requirement' IS NULL OR x->>'requirement' NOT IN('required','optional','conditional') THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
  c:=x->'condition';
  IF x->>'requirement'='conditional' THEN
   PERFORM private.request_shape(c,ARRAY['field','equals']);
   IF jsonb_typeof(c->'field') IS DISTINCT FROM 'string' OR jsonb_typeof(c->'equals') IS DISTINCT FROM 'string' OR
    NOT ((c->>'field'='origin' AND c->>'equals' IN('presencial','whatsapp','portal')) OR (c->>'field'='priority' AND c->>'equals' IN('normal','urgent'))) THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
  ELSIF c IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.checklists_model(p_office_id uuid,p_service_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM private.checklists_actor(p_office_id,false,'checklists.manage');
 IF NOT EXISTS(SELECT FROM public.services WHERE office_id=p_office_id AND id=p_service_id) THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT jsonb_build_object('service_id',p_service_id,'version',coalesce(max(version),0),'definition',(SELECT definition FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id ORDER BY version DESC LIMIT 1),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('version',v.version,'name',v.definition->>'name','reason',v.reason,'actor_name',private.customer_relation_display_label(p.display_name),'created_at',v.created_at) ORDER BY v.version DESC)
 FROM (SELECT * FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id ORDER BY version DESC LIMIT 5) v LEFT JOIN public.profiles p ON p.id=v.actor_id),'[]'::jsonb)) INTO result FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id;
 RETURN result;
END $$;
CREATE FUNCTION private.checklists_publish(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_definition jsonb,p_reason text,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;current_version integer;
BEGIN
 m:=private.checklists_actor(p_office_id,true,'checklists.manage');
 PERFORM 1 FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.checklists_actor(p_office_id,true,'checklists.manage');
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483645 OR p_event_id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.checklists_definition(p_definition);p_reason:=private.request_text(to_jsonb(p_reason),5,500);
 SELECT coalesce(max(version),0) INTO current_version FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id;
 IF current_version<>p_expected_version THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.checklist_model_versions(office_id,service_id,version,definition,reason,actor_id)VALUES(p_office_id,p_service_id,current_version+1,p_definition,p_reason,m.user_id);
 PERFORM private.emit_business_event(p_office_id,'checklists.model_published','service',p_service_id,p_event_id,'{}');RETURN private.checklists_model(p_office_id,p_service_id);
END $$;
CREATE FUNCTION private.checklists_view(p_office_id uuid,p_request_id uuid,p_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;i public.request_items;c private.checklist_instances;inst jsonb:=NULL;caps text[];closed boolean;
BEGIN
 r:=private.checklists_request(p_office_id,p_request_id);caps:=private.current_permissions(p_office_id);closed:=r.status IN('concluido','cancelado');
 SELECT * INTO i FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND (p_item_id IS NULL OR id=p_item_id) ORDER BY created_at,id LIMIT 1;
 IF p_item_id IS NOT NULL AND i.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO c FROM private.checklist_instances WHERE office_id=p_office_id AND request_id=r.id AND item_id=i.id;
 IF c.id IS NOT NULL THEN
 SELECT jsonb_build_object('id',c.id,'source',c.source,'name',c.definition->>'name','entries',coalesce(jsonb_agg(e.rule||jsonb_build_object('id',e.id,'applicable',e.applicable,'status',e.status,'file_id',e.file_id,'version',e.version,'reason',e.reason,'actor_name',private.customer_relation_display_label(p.display_name),'updated_at',e.updated_at,'file_status',f.status) ORDER BY e.position),'[]'::jsonb),
 'pending',count(*) FILTER(WHERE e.applicable AND e.rule->>'requirement'<>'optional' AND e.status='pendente'),
 'received',count(*) FILTER(WHERE e.applicable AND e.status='recebido'),
 'can_update',NOT closed AND caps @> ARRAY['checklists.update'],'can_waive',NOT closed AND caps @> ARRAY['checklists.update','checklists.waive'],
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'entry_id',h.entry_id,'status',h.status,'file_id',h.file_id,'reason',h.reason,'actor_name',private.customer_relation_display_label(p2.display_name),'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC)
 FROM (SELECT h.* FROM private.checklist_history h JOIN private.checklist_entries e2 ON e2.office_id=h.office_id AND e2.id=h.entry_id WHERE e2.office_id=p_office_id AND e2.instance_id=c.id ORDER BY h.created_at DESC,h.id DESC LIMIT 5) h LEFT JOIN public.profiles p2 ON p2.id=h.actor_id),'[]'::jsonb)) INTO inst
 FROM private.checklist_entries e LEFT JOIN public.profiles p ON p.id=e.actor_id LEFT JOIN public.files f ON f.office_id=e.office_id AND f.id=e.file_id WHERE e.office_id=p_office_id AND e.instance_id=c.id;
 END IF;
 RETURN jsonb_build_object('request_id',r.id,'request_version',r.version,'protocol',r.protocol,'closed',closed,'assignee_id',r.assignee_id,'can_transfer',NOT closed AND caps @> ARRAY['requests.transfer'],
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'service_id',service_id,'name',snapshot->'definition'->>'name') ORDER BY created_at,id) FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id),'[]'::jsonb),'selected_item_id',i.id,'instance',inst);
END $$;
CREATE FUNCTION private.checklists_apply(p_office_id uuid,p_request_id uuid,p_item_id uuid,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;i public.request_items;d jsonb;rule jsonb;source text;v integer;c uuid;e uuid;applicable boolean;pos integer:=0;
BEGIN
 r:=private.checklists_request(p_office_id,p_request_id,true,'checklists.update');m:=private.checklists_actor(p_office_id,true,'checklists.update');
 SELECT * INTO i FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND id=p_item_id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF EXISTS(SELECT FROM private.checklist_instances WHERE office_id=p_office_id AND request_id=r.id AND item_id=i.id) THEN RETURN private.checklists_view(p_office_id,r.id,i.id);END IF;
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT version,definition INTO v,d FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=i.service_id ORDER BY version DESC LIMIT 1;
 source:='Modelo v'||v;
 IF d IS NULL THEN
  SELECT jsonb_build_object('name','Checklist do servico','items',coalesce(jsonb_agg(jsonb_build_object('key','legacy_'||ord,'label',x,'requirement','required','condition',NULL) ORDER BY ord),'[]'::jsonb)) INTO d FROM jsonb_array_elements_text(i.snapshot->'definition'->'checklist') WITH ORDINALITY AS t(x,ord);
  source:='Catalogo capturado';
 END IF;
 PERFORM private.checklists_definition(d);
 INSERT INTO private.checklist_instances(office_id,request_id,item_id,source,definition,actor_id)VALUES(p_office_id,r.id,i.id,source,d,m.user_id) RETURNING id INTO c;
 FOR rule IN SELECT * FROM jsonb_array_elements(d->'items') LOOP
  pos:=pos+1;applicable:=rule->>'requirement'<>'conditional' OR CASE WHEN rule->'condition'->>'field'='origin' THEN r.origin ELSE r.priority END=rule->'condition'->>'equals';
  INSERT INTO private.checklist_entries(office_id,instance_id,position,rule,applicable,reason,actor_id)VALUES(p_office_id,c,pos,rule,applicable,CASE WHEN applicable THEN 'Checklist aplicado; item pendente' ELSE 'Condicao nao atendida neste pedido' END,m.user_id)RETURNING id INTO e;
  INSERT INTO private.checklist_history(office_id,entry_id,status,reason,actor_id)SELECT office_id,id,status,reason,actor_id FROM private.checklist_entries WHERE id=e;
 END LOOP;
 PERFORM private.emit_business_event(p_office_id,'checklists.applied','request',r.id,p_event_id,'{}');RETURN private.checklists_view(p_office_id,r.id,i.id);
END $$;
CREATE FUNCTION private.checklists_update(p_office_id uuid,p_entry_id uuid,p_expected_version integer,p_status text,p_file_id uuid,p_reason text,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;e private.checklist_entries;c private.checklist_instances;r public.requests;f public.files;
BEGIN
 m:=private.checklists_actor(p_office_id,true,'checklists.update');
 SELECT c1.* INTO c FROM private.checklist_instances c1 JOIN private.checklist_entries e1 ON e1.office_id=c1.office_id AND e1.instance_id=c1.id WHERE e1.office_id=p_office_id AND e1.id=p_entry_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 r:=private.checklists_request(p_office_id,c.request_id,true,'checklists.update');
 SELECT * INTO e FROM private.checklist_entries WHERE office_id=p_office_id AND id=p_entry_id FOR UPDATE;
 IF p_event_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR p_status IS NULL OR p_status NOT IN('pendente','recebido','validado','dispensado') THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 p_reason:=private.request_text(to_jsonb(p_reason),5,500);
 IF e.version<>p_expected_version OR NOT e.applicable THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;
 IF p_status IN('recebido','validado') THEN
  IF p_file_id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
  PERFORM private.files_actor(p_office_id,true);
  SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=p_file_id AND request_id=c.request_id AND request_item_id=c.item_id FOR UPDATE;
  IF f.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF f.status NOT IN('quarentena','disponivel') OR (p_status='validado' AND (f.status<>'disponivel' OR f.scanner_status<>'clean')) OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE office_id=p_office_id AND file_id=f.id) THEN RAISE EXCEPTION 'CHECKLIST_FILE_NOT_READY' USING ERRCODE='PT409';END IF;
  IF EXISTS(SELECT FROM private.checklist_history h JOIN private.checklist_entries e2 ON e2.office_id=h.office_id AND e2.id=h.entry_id WHERE h.office_id=p_office_id AND e2.instance_id=c.id AND e2.id<>e.id AND h.file_id=f.id) THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSIF p_file_id IS NOT NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 r:=private.checklists_request(p_office_id,c.request_id,true,'checklists.update');m:=private.checklists_actor(p_office_id,true,CASE WHEN p_status='dispensado' THEN 'checklists.waive' ELSE 'checklists.update' END);
 IF p_status IN('recebido','validado') THEN
  PERFORM private.files_actor(p_office_id,true);
  IF NOT EXISTS(SELECT FROM private.file_references WHERE office_id=p_office_id AND file_id=f.id AND reference_kind='checklist12:'||e.id::text) THEN INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(p_office_id,f.id,'checklist12:'||e.id::text);END IF;
 END IF;
 UPDATE private.checklist_entries SET status=p_status,file_id=p_file_id,reason=p_reason,actor_id=m.user_id,version=version+1,updated_at=clock_timestamp()WHERE id=e.id;
 INSERT INTO private.checklist_history(office_id,entry_id,status,file_id,reason,actor_id)VALUES(p_office_id,e.id,p_status,p_file_id,p_reason,m.user_id);
 PERFORM private.emit_business_event(p_office_id,'checklists.item_updated','request',r.id,p_event_id,'{}');RETURN private.checklists_view(p_office_id,r.id,c.item_id);
END $$;
-- Producers never accept preview text and cannot be invoked by the API roles.
CREATE FUNCTION private.checklists_notice(p_office_id uuid,p_request_id uuid,p_kind text,p_event_id uuid,p_recipient_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
 SELECT p_office_id,p_request_id,m.id,p_kind,p_event_id FROM public.memberships m WHERE m.office_id=p_office_id AND m.id=p_recipient_id AND m.active AND m.role_code<>'client' AND private.team_user_active(m.user_id,p_office_id) AND private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','requests.read']
 ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
$$;
CREATE FUNCTION private.checklists_transfer_notice() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN IF NEW.kind='transfer' THEN PERFORM private.checklists_notice(NEW.office_id,NEW.request_id,'handoff',NEW.id,NEW.to_assignee);END IF;RETURN NEW;END $$;
CREATE TRIGGER checklists_transfer_notice AFTER INSERT ON private.request_history FOR EACH ROW EXECUTE FUNCTION private.checklists_transfer_notice();
CREATE FUNCTION private.checklists_notify(p_office_id uuid,p_instance_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c private.checklist_instances;r public.requests;event_id uuid;
BEGIN
 PERFORM private.checklists_actor(p_office_id,true,'checklists.update');SELECT * INTO c FROM private.checklist_instances WHERE office_id=p_office_id AND id=p_instance_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 r:=private.checklists_request(p_office_id,c.request_id,true,'checklists.update');
 IF r.assignee_id IS NULL OR NOT EXISTS(SELECT FROM private.checklist_entries WHERE office_id=p_office_id AND instance_id=c.id AND applicable AND rule->>'requirement'<>'optional' AND status IN('pendente','recebido')) THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.request_assignee(p_office_id,r.assignee_id);
 SELECT h.id INTO event_id FROM private.checklist_history h JOIN private.checklist_entries e ON e.office_id=h.office_id AND e.id=h.entry_id WHERE e.office_id=p_office_id AND e.instance_id=c.id ORDER BY h.created_at DESC,h.id DESC LIMIT 1;
 PERFORM private.checklists_notice(p_office_id,r.id,'pending',event_id,r.assignee_id);RETURN '{"ok":true}'::jsonb;
END $$;
CREATE FUNCTION private.checklists_notifications(p_office_id uuid,p_page integer,p_size integer,p_unread_only boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN RAISE EXCEPTION 'CHECKLIST_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR p_unread_only IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH own AS(SELECT * FROM private.internal_notifications WHERE office_id=p_office_id AND recipient_id=m.id),paged AS(SELECT * FROM own WHERE NOT p_unread_only OR read_at IS NULL ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM own WHERE NOT p_unread_only OR read_at IS NULL),'unread',(SELECT count(*) FROM own WHERE read_at IS NULL),'page',p_page,'page_size',p_size,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'created_at',n.created_at,'read_at',n.read_at,'can_open',private.request_in_scope(r,m) IS TRUE AND private.current_permissions(p_office_id) @> ARRAY['checklists.read'],
 'request_id',CASE WHEN private.request_in_scope(r,m) IS TRUE AND private.current_permissions(p_office_id) @> ARRAY['checklists.read'] THEN r.id END,'protocol',CASE WHEN private.request_in_scope(r,m) IS TRUE AND private.current_permissions(p_office_id) @> ARRAY['checklists.read'] THEN r.protocol END) ORDER BY n.created_at DESC,n.id DESC) FROM paged n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION private.checklists_read(p_office_id uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;
BEGIN
 m:=private.requests_actor(p_office_id,true);IF m.role_code='client' THEN RAISE EXCEPTION 'CHECKLIST_FORBIDDEN' USING ERRCODE='PT403';END IF;
 UPDATE private.internal_notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE office_id=p_office_id AND id=p_id AND recipient_id=m.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;RETURN '{"ok":true}'::jsonb;
END $$;
CREATE FUNCTION public.checklists_model(p_office_id uuid,p_service_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_model(p_office_id,p_service_id);$$;
CREATE FUNCTION public.checklists_publish(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_definition jsonb,p_reason text,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_publish(p_office_id,p_service_id,p_expected_version,p_definition,p_reason,p_event_id);$$;
CREATE FUNCTION public.checklists_view(p_office_id uuid,p_request_id uuid,p_item_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_view(p_office_id,p_request_id,p_item_id);$$;
CREATE FUNCTION public.checklists_apply(p_office_id uuid,p_request_id uuid,p_item_id uuid,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_apply(p_office_id,p_request_id,p_item_id,p_event_id);$$;
CREATE FUNCTION public.checklists_update(p_office_id uuid,p_entry_id uuid,p_expected_version integer,p_status text,p_file_id uuid,p_reason text,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_update(p_office_id,p_entry_id,p_expected_version,p_status,p_file_id,p_reason,p_event_id);$$;
CREATE FUNCTION public.checklists_notify(p_office_id uuid,p_instance_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_notify(p_office_id,p_instance_id);$$;
CREATE FUNCTION public.checklists_notifications(p_office_id uuid,p_page integer,p_size integer,p_unread_only boolean) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_notifications(p_office_id,p_page,p_size,p_unread_only);$$;
CREATE FUNCTION public.checklists_read(p_office_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_read(p_office_id,p_id);$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname LIKE 'checklists_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.checklists_model(uuid,uuid),private.checklists_model(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_publish(uuid,uuid,integer,jsonb,text,uuid),private.checklists_publish(uuid,uuid,integer,jsonb,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_view(uuid,uuid,uuid),private.checklists_view(uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_apply(uuid,uuid,uuid,uuid),private.checklists_apply(uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_update(uuid,uuid,integer,text,uuid,text,uuid),private.checklists_update(uuid,uuid,integer,text,uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_notify(uuid,uuid),private.checklists_notify(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_notifications(uuid,integer,integer,boolean),private.checklists_notifications(uuid,integer,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.checklists_read(uuid,uuid),private.checklists_read(uuid,uuid) TO authenticated;
