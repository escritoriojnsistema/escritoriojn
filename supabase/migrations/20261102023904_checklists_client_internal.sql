-- Checklist do cliente (o que enviar) e checklist interno (o que conferir).
-- The existing per-service model becomes the internal scope, preserving every
-- published version. New client models sit beside it; both remain versioned
-- and linked to the service used by a document offering.
ALTER TABLE private.checklist_model_versions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'internal';
ALTER TABLE private.checklist_model_versions DROP CONSTRAINT IF EXISTS checklist_model_versions_scope_check;
ALTER TABLE private.checklist_model_versions ADD CONSTRAINT checklist_model_versions_scope_check CHECK(scope IN('client','internal'));
ALTER TABLE private.checklist_model_versions DROP CONSTRAINT IF EXISTS checklist_model_versions_pkey;
ALTER TABLE private.checklist_model_versions ADD PRIMARY KEY(office_id,service_id,scope,version);

ALTER TABLE private.checklist_entries ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'internal';
ALTER TABLE private.checklist_entries DROP CONSTRAINT IF EXISTS checklist_entries_scope_check;
ALTER TABLE private.checklist_entries ADD CONSTRAINT checklist_entries_scope_check CHECK(scope IN('client','internal'));
DO $migration$ DECLARE c text;BEGIN
 SELECT conname INTO c FROM pg_constraint WHERE conrelid='private.checklist_entries'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%position%';
 IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE private.checklist_entries DROP CONSTRAINT %I',c);END IF;
END $migration$;
ALTER TABLE private.checklist_entries ADD CONSTRAINT checklist_entries_position_check CHECK(position BETWEEN 1 AND 24);

CREATE OR REPLACE FUNCTION private.checklist_scope(p_scope text) RETURNS text LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_scope IS NULL OR p_scope NOT IN('client','internal') THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN p_scope;
END $$;

DROP FUNCTION public.checklists_model(uuid,uuid);
DROP FUNCTION public.checklists_publish(uuid,uuid,integer,jsonb,text,uuid);
DROP FUNCTION private.checklists_model(uuid,uuid);
DROP FUNCTION private.checklists_publish(uuid,uuid,integer,jsonb,text,uuid);

CREATE FUNCTION private.checklists_model(p_office_id uuid,p_service_id uuid,p_scope text DEFAULT 'internal') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM private.checklist_scope(p_scope);
 PERFORM private.checklists_actor(p_office_id,false,'checklists.manage');
 IF NOT EXISTS(SELECT FROM public.services WHERE office_id=p_office_id AND id=p_service_id) THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT jsonb_build_object('service_id',p_service_id,'scope',p_scope,'version',coalesce(max(version),0),'definition',(SELECT definition FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id AND scope=p_scope ORDER BY version DESC LIMIT 1),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('version',v.version,'name',v.definition->>'name','reason',v.reason,'actor_name',private.customer_relation_display_label(p.display_name),'created_at',v.created_at) ORDER BY v.version DESC)
 FROM (SELECT * FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id AND scope=p_scope ORDER BY version DESC LIMIT 5) v LEFT JOIN public.profiles p ON p.id=v.actor_id),'[]'::jsonb)) INTO result FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id AND scope=p_scope;
 RETURN result;
END $$;
CREATE FUNCTION private.checklists_publish(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_definition jsonb,p_reason text,p_event_id uuid,p_scope text DEFAULT 'internal') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;current_version integer;
BEGIN
 PERFORM private.checklist_scope(p_scope);
 m:=private.checklists_actor(p_office_id,true,'checklists.manage');
 PERFORM 1 FROM public.services WHERE office_id=p_office_id AND id=p_service_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SERVICE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 m:=private.checklists_actor(p_office_id,true,'checklists.manage');
 IF p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 2147483645 OR p_event_id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.checklists_definition(p_definition);p_reason:=private.request_text(to_jsonb(p_reason),5,500);
 SELECT coalesce(max(version),0) INTO current_version FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id AND scope=p_scope;
 IF current_version<>p_expected_version THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.checklist_model_versions(office_id,service_id,scope,version,definition,reason,actor_id)VALUES(p_office_id,p_service_id,p_scope,current_version+1,p_definition,p_reason,m.user_id);
 PERFORM private.emit_business_event(p_office_id,'checklists.model_published','service',p_service_id,p_event_id,'{}');RETURN private.checklists_model(p_office_id,p_service_id,p_scope);
END $$;

CREATE OR REPLACE FUNCTION private.checklists_view(p_office_id uuid,p_request_id uuid,p_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;i public.request_items;c private.checklist_instances;inst jsonb:=NULL;caps text[];closed boolean;
BEGIN
 r:=private.checklists_request(p_office_id,p_request_id);caps:=private.current_permissions(p_office_id);closed:=r.status IN('concluido','cancelado');
 SELECT * INTO i FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND (p_item_id IS NULL OR id=p_item_id) ORDER BY created_at,id LIMIT 1;
 IF p_item_id IS NOT NULL AND i.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO c FROM private.checklist_instances WHERE office_id=p_office_id AND request_id=r.id AND item_id=i.id;
 IF c.id IS NOT NULL THEN
 SELECT jsonb_build_object('id',c.id,'source',c.source,'name',c.definition->>'name','entries',coalesce(jsonb_agg(e.rule||jsonb_build_object('id',e.id,'scope',e.scope,'applicable',e.applicable,'status',e.status,'file_id',e.file_id,'version',e.version,'reason',e.reason,'actor_name',private.customer_relation_display_label(p.display_name),'updated_at',e.updated_at,'file_status',f.status) ORDER BY e.position),'[]'::jsonb),
 'pending',count(*) FILTER(WHERE e.applicable AND e.rule->>'requirement'<>'optional' AND e.status='pendente'),
 'received',count(*) FILTER(WHERE e.applicable AND e.status='recebido'),
 'can_update',NOT closed AND caps @> ARRAY['checklists.update'],'can_waive',NOT closed AND caps @> ARRAY['checklists.update','checklists.waive'],
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'entry_id',h.entry_id,'status',h.status,'file_id',h.file_id,'reason',h.reason,'actor_name',private.customer_relation_display_label(p2.display_name),'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC)
 FROM (SELECT h.* FROM private.checklist_history h JOIN private.checklist_entries e2 ON e2.office_id=h.office_id AND e2.id=h.entry_id WHERE e2.office_id=p_office_id AND e2.instance_id=c.id ORDER BY h.created_at DESC,h.id DESC LIMIT 5) h LEFT JOIN public.profiles p2 ON p2.id=h.actor_id),'[]'::jsonb)) INTO inst
 FROM private.checklist_entries e LEFT JOIN public.profiles p ON p.id=e.actor_id LEFT JOIN public.files f ON f.office_id=e.office_id AND f.id=e.file_id WHERE e.office_id=p_office_id AND e.instance_id=c.id;
 END IF;
 RETURN jsonb_build_object('request_id',r.id,'request_version',r.version,'protocol',r.protocol,'closed',closed,'origin',r.origin,'assignee_id',r.assignee_id,'can_transfer',NOT closed AND caps @> ARRAY['requests.transfer'],
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'service_id',service_id,'name',snapshot->'definition'->>'name') ORDER BY created_at,id) FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id),'[]'::jsonb),'selected_item_id',i.id,'instance',inst);
END $$;

CREATE OR REPLACE FUNCTION private.checklists_apply(p_office_id uuid,p_request_id uuid,p_item_id uuid,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.requests;m public.memberships;i public.request_items;d jsonb;rule jsonb;source text;v integer;c uuid;e uuid;applicable boolean;pos integer:=0;scopes text[];s text;compiled jsonb:='[]'::jsonb;legacy jsonb;legacy_scope text;used integer:=0;name text;parts text[]:='{}';item jsonb;entry_scope text;
BEGIN
 r:=private.checklists_request(p_office_id,p_request_id,true,'checklists.update');m:=private.checklists_actor(p_office_id,true,'checklists.update');
 SELECT * INTO i FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND id=p_item_id;
 IF i.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF EXISTS(SELECT FROM private.checklist_instances WHERE office_id=p_office_id AND request_id=r.id AND item_id=i.id) THEN RETURN private.checklists_view(p_office_id,r.id,i.id);END IF;
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 scopes:=CASE WHEN r.origin='presencial' THEN ARRAY['internal']::text[] ELSE ARRAY['client','internal']::text[] END;
 FOREACH s IN ARRAY scopes LOOP
  SELECT version,definition INTO v,d FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=i.service_id AND scope=s ORDER BY version DESC LIMIT 1;
  IF d IS NOT NULL THEN
   compiled:=compiled||coalesce((SELECT jsonb_agg(jsonb_build_object('scope',s,'rule',x)) FROM jsonb_array_elements(d->'items') x),'[]'::jsonb);
   used:=used+1;
   parts:=array_append(parts,(CASE s WHEN 'client' THEN 'Cliente v' ELSE 'Interno v' END)||v);
   IF name IS NULL THEN name:=d->>'name';END IF;
  END IF;
 END LOOP;
 IF jsonb_array_length(compiled)=0 THEN
  legacy_scope:=CASE WHEN r.origin='presencial' THEN 'internal' ELSE 'client' END;
  SELECT jsonb_build_object('name','Checklist do serviço','items',coalesce(jsonb_agg(jsonb_build_object('key','legacy_'||ord,'label',x,'requirement','required','condition',NULL) ORDER BY ord),'[]'::jsonb)) INTO legacy FROM jsonb_array_elements_text(i.snapshot->'definition'->'checklist') WITH ORDINALITY AS t(x,ord);
  PERFORM private.checklists_definition(legacy);
  compiled:=coalesce((SELECT jsonb_agg(jsonb_build_object('scope',legacy_scope,'rule',x)) FROM jsonb_array_elements(legacy->'items') x),'[]'::jsonb);
  used:=1;parts:=ARRAY['Catálogo capturado'];name:='Checklist do serviço';
 END IF;
 IF jsonb_array_length(compiled)=0 OR name IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_CONFIGURED' USING ERRCODE='PT422';END IF;
 IF used>1 THEN name:='Checklist do cliente e interno';END IF;
 source:=left(array_to_string(parts,' + '),80);
 INSERT INTO private.checklist_instances(office_id,request_id,item_id,source,definition,actor_id)VALUES(p_office_id,r.id,i.id,source,jsonb_build_object('name',left(name,80),'items',coalesce((SELECT jsonb_agg(x->'rule') FROM jsonb_array_elements(compiled) x),'[]'::jsonb)),m.user_id) RETURNING id INTO c;
 FOR item IN SELECT * FROM jsonb_array_elements(compiled) LOOP
  pos:=pos+1;rule:=item->'rule';entry_scope:=item->>'scope';
  applicable:=rule->>'requirement'<>'conditional' OR CASE WHEN rule->'condition'->>'field'='origin' THEN r.origin ELSE r.priority END=rule->'condition'->>'equals';
  INSERT INTO private.checklist_entries(office_id,instance_id,position,rule,scope,applicable,reason,actor_id)VALUES(p_office_id,c,pos,rule,entry_scope,applicable,CASE WHEN applicable THEN 'Checklist aplicado; item pendente' ELSE 'Condicao nao atendida neste pedido' END,m.user_id)RETURNING id INTO e;
  INSERT INTO private.checklist_history(office_id,entry_id,status,reason,actor_id)SELECT office_id,id,status,reason,actor_id FROM private.checklist_entries WHERE id=e;
 END LOOP;
 PERFORM private.emit_business_event(p_office_id,'checklists.applied','request',r.id,p_event_id,'{}');RETURN private.checklists_view(p_office_id,r.id,i.id);
END $$;

CREATE FUNCTION public.checklists_model(p_office_id uuid,p_service_id uuid,p_scope text DEFAULT 'internal') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_model(p_office_id,p_service_id,p_scope);$$;
CREATE FUNCTION public.checklists_publish(p_office_id uuid,p_service_id uuid,p_expected_version integer,p_definition jsonb,p_reason text,p_event_id uuid,p_scope text DEFAULT 'internal') RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.checklists_publish(p_office_id,p_service_id,p_expected_version,p_definition,p_reason,p_event_id,p_scope);$$;
REVOKE ALL ON FUNCTION private.checklists_model(uuid,uuid,text),private.checklists_publish(uuid,uuid,integer,jsonb,text,uuid,text),public.checklists_model(uuid,uuid,text),public.checklists_publish(uuid,uuid,integer,jsonb,text,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.checklists_model(uuid,uuid,text),private.checklists_publish(uuid,uuid,integer,jsonb,text,uuid,text),public.checklists_model(uuid,uuid,text),public.checklists_publish(uuid,uuid,integer,jsonb,text,uuid,text) TO authenticated;

-- The public document catalog shows the client checklist linked to the service.
CREATE OR REPLACE FUNCTION private.checklist_client_labels(p_office_id uuid,p_service_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_agg(x->>'label' ORDER BY ord) FROM (SELECT definition->'items' items FROM private.checklist_model_versions WHERE office_id=p_office_id AND service_id=p_service_id AND scope='client' ORDER BY version DESC LIMIT 1) m, LATERAL jsonb_array_elements(m.items) WITH ORDINALITY t(x,ord)),'[]'::jsonb);
$$;
CREATE OR REPLACE FUNCTION private.document_offer_projection(o private.document_offerings,at_time timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE tv public.template_versions;sv public.service_versions;s public.services;t public.templates;nm text;vars jsonb;folder uuid;folder_name text;folder_category text; BEGIN
 IF NOT o.portal_enabled OR EXISTS(SELECT FROM private.model_metadata WHERE office_id=o.office_id AND template_id=o.template_id AND archived_at IS NOT NULL) THEN RETURN NULL;END IF;
 SELECT v.* INTO tv FROM public.template_versions v JOIN private.template_approvals a ON a.office_id=v.office_id AND a.template_id=v.template_id AND a.version_id=v.id
 WHERE v.office_id=o.office_id AND v.template_id=o.template_id AND a.approved_at<=at_time AND ((v.definition->>'effective_from') IS NULL OR (v.definition->>'effective_from')::timestamptz<=at_time) AND ((v.definition->>'effective_until') IS NULL OR (v.definition->>'effective_until')::timestamptz>at_time) ORDER BY v.number DESC LIMIT 1;
 SELECT * INTO sv FROM public.service_versions WHERE office_id=o.office_id AND service_id=o.service_id AND effective_from<=at_time ORDER BY effective_from DESC LIMIT 1;
 SELECT * INTO s FROM public.services WHERE office_id=o.office_id AND id=o.service_id;
 SELECT * INTO t FROM public.templates WHERE office_id=o.office_id AND id=o.template_id;
 IF tv.id IS NULL OR sv.id IS NULL OR s.id IS NULL OR t.id IS NULL OR (tv.definition->>'demonstration')::boolean OR (sv.definition->>'quantity_min')::integer>1 OR (sv.definition->>'quantity_max')::integer<1 OR (sv.definition->>'participants_min')::integer>0 OR jsonb_array_length(sv.definition->'checklist')>0 OR jsonb_array_length(sv.definition->'fields')>0 OR EXISTS(SELECT FROM jsonb_array_elements_text(o.intake_keys) k WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(tv.definition->'variables') v WHERE v->>'key'=k)) THEN RETURN NULL;END IF;
 SELECT coalesce(m.display_name,tv.definition->>'name'),l.folder_id,f.name INTO nm,folder,folder_name FROM (SELECT 1)x LEFT JOIN private.model_metadata m ON m.office_id=o.office_id AND m.template_id=o.template_id LEFT JOIN private.model_locations l ON l.office_id=o.office_id AND l.template_id=o.template_id LEFT JOIN private.model_folders f ON f.office_id=o.office_id AND f.id=l.folder_id;
 IF folder IS NOT NULL THEN folder_category:=private.model_folder_category(o.office_id,folder);END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',v->>'key','label',v->>'label','type',v->>'type','required',o.required_intake_keys @> jsonb_build_array(v->>'key')) ORDER BY ord),'[]'::jsonb) INTO vars FROM jsonb_array_elements(tv.definition->'variables') WITH ORDINALITY x(v,ord) WHERE o.intake_keys @> jsonb_build_array(v->>'key');
 RETURN jsonb_build_object('template_id',o.template_id,'template_version_id',tv.id,'service_version_id',sv.id,'offer_revision',o.revision,'name',nm,'template_code',t.code,'folder_id',folder,'folder_name',folder_name,'folder_category',folder_category,'instructions',o.instructions,'price_cents',sv.price_cents,'service_id',s.id,'service_code',s.code,'service_category',sv.definition->>'category','service_checklist',coalesce(nullif(private.checklist_client_labels(o.office_id,o.service_id),'[]'::jsonb),sv.definition->'checklist','[]'::jsonb),'variables',vars);
END $$;
REVOKE ALL ON FUNCTION private.checklist_client_labels(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
