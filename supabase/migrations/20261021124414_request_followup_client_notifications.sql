-- Ajustes pós12. Preserve contas/dados e reutilize os domínios10–12.
INSERT INTO public.permissions(code,name) VALUES('requests.reclaim','Retomar atendimento para si') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES('owner','requests.reclaim') ON CONFLICT DO NOTHING;


ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive']);



CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive'],
   'can_create_owner',private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],'can_delegate',true,'delegation_id',NULL);
 END IF;
 SELECT * INTO d FROM private.team_delegations WHERE membership_id=m.id AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF m.role_code<>'admin' OR d.id IS NULL THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','admin',
  'allowed_roles',d.allowed_roles,'allowed_permissions',d.allowed_permissions,'can_create_owner',
  d.can_create_owner AND private.team_permissions_for_member(m.id) @> ARRAY['users.owners.create'],
  'can_delegate',false,'delegation_id',d.id);
END $$;

-- Existing inbox storage; a separate, minimal client event never exposes an
-- internal handoff/pending notification or derives a login from a customer file.
ALTER TABLE private.internal_notifications DROP CONSTRAINT internal_notifications_kind_check;
ALTER TABLE private.internal_notifications ADD COLUMN attendant_name text;
ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check CHECK(kind IN('handoff','pending','assignee_changed'));
ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_attendant_check CHECK(
 (kind='assignee_changed' AND attendant_name IS NOT NULL AND char_length(attendant_name) BETWEEN 1 AND 120 AND attendant_name !~ '[[:cntrl:]]')
 OR (kind<>'assignee_changed' AND attendant_name IS NULL));
CREATE INDEX internal_notifications_unread_idx ON private.internal_notifications(office_id,recipient_id) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION private.checklists_transfer_notice() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.kind='transfer' THEN PERFORM private.checklists_notice(NEW.office_id,NEW.request_id,'handoff',NEW.id,NEW.to_assignee);END IF;
 IF NEW.to_assignee IS NOT NULL AND NEW.to_assignee IS DISTINCT FROM NEW.from_assignee THEN
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id,attendant_name)
  SELECT r.office_id,r.id,recipient.id,'assignee_changed',NEW.id,private.customer_relation_display_label(p.display_name)
  FROM public.requests r JOIN public.memberships recipient ON recipient.office_id=r.office_id AND recipient.user_id=r.created_by AND recipient.role_code='client'
  JOIN public.memberships attendant ON attendant.office_id=r.office_id AND attendant.id=NEW.to_assignee
  JOIN public.profiles p ON p.id=attendant.user_id
  WHERE r.office_id=NEW.office_id AND r.id=NEW.request_id AND r.origin='portal'
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION private.notifications_actor(p_office_id uuid,p_write boolean DEFAULT false) RETURNS public.memberships LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid;m public.memberships;
BEGIN
 caller:=private.team_require_identity();
 IF p_write THEN PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE;
 ELSE PERFORM 1 FROM public.offices WHERE id=p_office_id FOR SHARE;END IF;
 caller:=private.team_require_identity();
 SELECT * INTO m FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active FOR SHARE;
 caller:=private.team_require_identity();
 IF m.id IS NULL OR private.team_user_active(caller,p_office_id) IS NOT TRUE OR (private.current_permissions(p_office_id) @> ARRAY['foundation.access']) IS NOT TRUE THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
END $$;
CREATE FUNCTION private.notification_visible(n private.internal_notifications,r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT n.office_id=m.office_id AND n.recipient_id=m.id AND CASE WHEN m.role_code='client' THEN n.kind='assignee_changed' AND private.request_in_scope(r,m) IS TRUE
 ELSE n.kind IN('handoff','pending') AND private.current_permissions(m.office_id) @> ARRAY['requests.read'] END;
$$;
CREATE FUNCTION private.notifications_page(p_office_id uuid,p_query text,p_read text,p_kind text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;q text;staff_allowed boolean;read_all boolean;
BEGIN
 m:=private.notifications_actor(p_office_id);staff_allowed:=m.role_code<>'client' AND private.current_permissions(p_office_id) @> ARRAY['requests.read'];read_all:=private.current_permissions(p_office_id) @> ARRAY['requests.read_all'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_read IS NULL OR p_read NOT IN('all','unread','read') OR p_kind IS NULL OR p_kind NOT IN('all','handoff','pending','assignee_changed') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 q:=lower(btrim(p_query));
 WITH own AS(
  SELECT n.*,CASE WHEN (CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id ELSE r.created_by=m.user_id OR r.assignee_id=m.id OR read_all OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END) THEN r.id END AS visible_id,CASE WHEN (CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id ELSE r.created_by=m.user_id OR r.assignee_id=m.id OR read_all OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END) THEN r.protocol END AS visible_protocol
  FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id
  WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND (CASE WHEN m.role_code='client' THEN n.kind='assignee_changed' AND r.origin='portal' AND r.created_by=m.user_id ELSE staff_allowed AND n.kind IN('handoff','pending') END)
 ),filtered AS(
  SELECT * FROM own WHERE (p_read='all' OR (p_read='unread' AND read_at IS NULL) OR (p_read='read' AND read_at IS NOT NULL)) AND (p_kind='all' OR kind=p_kind)
  AND (q='' OR strpos(lower(visible_protocol),q)>0 OR (kind='assignee_changed' AND strpos(lower(attendant_name),q)>0))
 ),paged AS(SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'unread',(SELECT count(*) FROM own WHERE read_at IS NULL),'page',p_page,'page_size',p_size,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'created_at',created_at,'read_at',read_at,'can_open',visible_id IS NOT NULL,'request_id',visible_id,'protocol',visible_protocol,'attendant_name',CASE WHEN kind='assignee_changed' THEN attendant_name END) ORDER BY created_at DESC,id DESC) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION private.notifications_summary(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;
BEGIN
 m:=private.notifications_actor(p_office_id);
 IF m.role_code='client' THEN
  RETURN jsonb_build_object('unread',(SELECT count(*) FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND n.read_at IS NULL AND n.kind='assignee_changed' AND r.origin='portal' AND r.created_by=m.user_id));
 END IF;
 IF NOT private.current_permissions(p_office_id) @> ARRAY['requests.read'] THEN RETURN '{"unread":0}'::jsonb;END IF;
 RETURN jsonb_build_object('unread',(SELECT count(*) FROM private.internal_notifications n WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND n.read_at IS NULL AND n.kind IN('handoff','pending')));
END $$;
CREATE FUNCTION private.notifications_read(p_office_id uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;
BEGIN
 m:=private.notifications_actor(p_office_id,true);
 UPDATE private.internal_notifications n SET read_at=coalesce(n.read_at,clock_timestamp()) FROM public.requests r
 WHERE n.office_id=p_office_id AND n.id=p_id AND r.office_id=n.office_id AND r.id=n.request_id AND private.notification_visible(n,r,m) IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN '{"ok":true}'::jsonb;
END $$;
CREATE FUNCTION public.notifications_page(p_office_id uuid,p_query text,p_read text,p_kind text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.notifications_page(p_office_id,p_query,p_read,p_kind,p_page,p_size);$$;
CREATE FUNCTION public.notifications_summary(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.notifications_summary(p_office_id);$$;
CREATE FUNCTION public.notifications_read(p_office_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.notifications_read(p_office_id,p_id);$$;

CREATE OR REPLACE FUNCTION private.team_validate_assignment(p_actor jsonb,p_role text,p_permissions text[],p_creating_owner boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('employee','admin','owner') OR p_permissions IS NULL
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.request_in_scope(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.office_id=m.office_id AND CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id
 ELSE r.created_by=m.user_id OR r.assignee_id=m.id OR private.current_permissions(r.office_id) @> ARRAY['requests.read_all']
 OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END;
$$;
CREATE FUNCTION private.request_can_work(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT m.role_code<>'client' AND private.request_in_scope(r,m) IS TRUE AND (r.assignee_id IS NULL OR r.assignee_id=m.id);
$$;
CREATE FUNCTION private.request_can_reclaim(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT m.role_code IN('owner','admin') AND private.request_in_scope(r,m) IS TRUE
 AND private.current_permissions(r.office_id) @> ARRAY['requests.read','requests.reclaim']
 AND r.status NOT IN('concluido','cancelado') AND r.assignee_id IS DISTINCT FROM m.id;
$$;


CREATE OR REPLACE FUNCTION private.request_options(p_office_id uuid,p_kind text,p_query text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;catalog_at timestamptz;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_kind IS NULL OR p_kind NOT IN('services','customers','assignees') OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;q:=lower(btrim(p_query));catalog_at:=clock_timestamp();
 IF p_kind='services' THEN
  IF NOT private.current_permissions(p_office_id) @> ARRAY['services.read'] THEN RAISE EXCEPTION 'SERVICES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  WITH candidates AS(SELECT s.id,v.definition,v.definition->>'name' AS name,s.code FROM public.services s CROSS JOIN LATERAL(SELECT ver.definition FROM public.service_versions ver WHERE ver.office_id=s.office_id AND ver.service_id=s.id AND ver.effective_from<=catalog_at ORDER BY ver.effective_from DESC LIMIT 1)v
   WHERE s.office_id=p_office_id AND(q='' OR strpos(lower(v.definition->>'name'),q)>0 OR strpos(lower(s.code),q)>0)),paginated AS(SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.name||' · '||p.code,'definition',p.definition) ORDER BY name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 ELSIF p_kind='customers' THEN
  IF NOT private.current_permissions(p_office_id) @> ARRAY['customers.read'] THEN RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403';END IF;
  WITH candidates AS(SELECT c.id,c.name FROM public.customers c WHERE c.office_id=p_office_id AND private.customer_in_scope(c,m.user_id) AND(q='' OR strpos(lower(c.name),q)>0)),paginated AS(SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',p.name) ORDER BY name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 ELSE
  WITH candidates AS(SELECT a.id,private.customer_relation_display_label(p.display_name) AS name,a.role_code,private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read'] AS eligible FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=p_office_id AND a.active AND a.role_code<>'client' AND private.team_user_active(a.user_id,p_office_id)  AND(q='' OR strpos(lower(coalesce(p.display_name,'')),q)>0 OR strpos(CASE a.role_code WHEN 'owner' THEN 'super administrador proprietário' WHEN 'admin' THEN 'administrador' ELSE 'funcionário funcionario' END,q)>0)),paginated AS(SELECT * FROM candidates ORDER BY name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',coalesce(p.name,'Membro da equipe'),'role_code',p.role_code,'eligible',p.eligible) ORDER BY name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 END IF;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

CREATE OR REPLACE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caps text[]:=private.current_permissions(r.office_id);closed boolean:=r.status IN('concluido','cancelado');
BEGIN
 IF m.role_code='client' THEN
 RETURN private.request_summary(r,true)||jsonb_build_object('portal',true,'assignee_name',(SELECT private.customer_relation_display_label(p.display_name) FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=r.office_id AND a.id=r.assignee_id),'message',r.message,'services',coalesce((SELECT jsonb_agg(i.snapshot->'definition'->>'name' ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb));END IF;
 RETURN private.request_summary(r,false)||jsonb_build_object('portal',false,'customer_id',r.customer_id,'message',r.message,'priority_reason',r.priority_reason,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'snapshot',i.snapshot,'fields',i.fields,'participant_ids',i.participant_ids,'checklist',i.checklist) ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'kind',h.kind,'actor_id',h.actor_id,'actor_name',private.customer_relation_display_label(p.display_name),'reason',h.reason,'from_status',h.from_status,'to_status',h.to_status,'from_assignee',h.from_assignee,'to_assignee',h.to_assignee,'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC)
 FROM (SELECT * FROM private.request_history x WHERE x.office_id=r.office_id AND x.request_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 3 OFFSET (p_page-1)*3) h LEFT JOIN public.profiles p ON p.id=h.actor_id),'[]'::jsonb),
 'history_page',p_page,'history_total',(SELECT count(*) FROM private.request_history h WHERE h.office_id=r.office_id AND h.request_id=r.id),
 'can_reclaim',private.request_can_reclaim(r,m),'following_only',NOT private.request_can_work(r,m),'can_update',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.update'],'can_transfer',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.transfer'],'can_cancel',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.cancel']);
END $$;

CREATE OR REPLACE FUNCTION private.request_mutate(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_mutation jsonb,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;kind text;capability text;reason_text text;next_assignee uuid;customer uuid;next_status text;old_status text;old_assignee uuid;review jsonb;original public.requests;
BEGIN
 m:=private.requests_actor(p_office_id,true);
 IF m.role_code='client' THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_event_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR jsonb_typeof(p_mutation) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=p_mutation->>'kind';
 IF kind IS NULL OR kind NOT IN('status','transfer','note','triage','reclaim') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 capability:=CASE WHEN kind='reclaim' THEN 'requests.reclaim' WHEN kind='transfer' THEN 'requests.transfer' WHEN kind='status' AND p_mutation->>'status'='cancelado' THEN 'requests.cancel' ELSE 'requests.update' END;
 m:=private.requests_actor(p_office_id,true,capability);
 SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id AND private.request_in_scope(x,m) FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,capability);
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF r.version<>p_expected_version OR r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
 IF (kind='reclaim' AND private.request_can_reclaim(r,m) IS NOT TRUE) OR (kind<>'reclaim' AND private.request_can_work(r,m) IS NOT TRUE) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 original:=r;old_status:=r.status;old_assignee:=r.assignee_id;
 IF kind='status' THEN
  next_status:=p_mutation->>'status';
  IF next_status IS NULL OR next_status NOT IN('aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado') THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  IF next_status='cancelado' THEN
   PERFORM private.request_shape(p_mutation,ARRAY['kind','status','reason','cancellation_review']);review:=p_mutation->'cancellation_review';
   PERFORM private.request_shape(review,ARRAY['charges_reviewed','refunds_reviewed','deliveries_reviewed','external_reviewed']);
   IF review<>'{"charges_reviewed":true,"refunds_reviewed":true,"deliveries_reviewed":true,"external_reviewed":true}'::jsonb THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
  ELSE PERFORM private.request_shape(p_mutation,ARRAY['kind','status','reason']);END IF;
  reason_text:=private.request_text(p_mutation->'reason',1,500);
  IF next_status=r.status OR (r.triaged_at IS NULL AND next_status='concluido') THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;r.status:=next_status;
 ELSIF kind='note' THEN
  PERFORM private.request_shape(p_mutation,ARRAY['kind','note']);reason_text:=private.request_text(p_mutation->'note',1,2000,true);
 ELSIF kind='reclaim' THEN
  PERFORM private.request_shape(p_mutation,ARRAY['kind','reason']);reason_text:=private.request_text(p_mutation->'reason',1,500);next_assignee:=m.id;
  PERFORM private.request_assignee(p_office_id,next_assignee);r.assignee_id:=next_assignee;
 ELSIF kind IN('transfer','reclaim') THEN
  PERFORM private.request_shape(p_mutation,ARRAY['kind','assignee_id','reason']);reason_text:=private.request_text(p_mutation->'reason',1,500);next_assignee:=private.request_uuid(p_mutation->'assignee_id');
  PERFORM private.request_assignee(p_office_id,next_assignee);
  IF next_assignee IS NOT DISTINCT FROM r.assignee_id THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;r.assignee_id:=next_assignee;
 ELSE
  PERFORM private.request_shape(p_mutation,ARRAY['kind','customer_id','items','reason']);reason_text:=private.request_text(p_mutation->'reason',1,500);
  IF r.origin<>'portal' OR r.triaged_at IS NOT NULL OR EXISTS(SELECT FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id)THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
  customer:=private.request_uuid(p_mutation->'customer_id',true);PERFORM private.request_capture_items(p_office_id,r.id,customer,p_mutation->'items',m,capability);r.customer_id:=customer;r.triaged_at:=clock_timestamp();r.status:='em_atendimento';IF r.assignee_id IS NULL THEN r.assignee_id:=m.id;PERFORM private.request_assignee(p_office_id,m.id);END IF;
 END IF;
 m:=private.requests_actor(p_office_id,true,capability);
 -- r still carries the proposed new assignee: check original scope after all waits.
 IF private.request_in_scope(original,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF (kind='reclaim' AND private.request_can_reclaim(original,m) IS NOT TRUE) OR (kind<>'reclaim' AND private.request_can_work(original,m) IS NOT TRUE) THEN RAISE EXCEPTION 'REQUESTS_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF kind='triage' AND old_assignee IS NULL THEN
  PERFORM private.request_assignee(p_office_id,r.assignee_id);
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES(p_office_id,r.id,r.assignee_id,m.user_id);
 END IF;
 IF kind IN('transfer','reclaim') THEN
  PERFORM private.request_assignee(p_office_id,next_assignee);
  UPDATE private.request_assignments SET ended_at=clock_timestamp()WHERE office_id=p_office_id AND request_id=r.id AND ended_at IS NULL;
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES(p_office_id,r.id,next_assignee,m.user_id);
 END IF;
 UPDATE public.requests SET status=r.status,assignee_id=r.assignee_id,customer_id=r.customer_id,triaged_at=r.triaged_at,version=version+1,updated_at=clock_timestamp()WHERE office_id=p_office_id AND id=r.id RETURNING * INTO r;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status,from_assignee,to_assignee,cancellation_review)VALUES(p_office_id,r.id,CASE WHEN kind='reclaim' THEN 'transfer' ELSE kind END,m.user_id,reason_text,old_status,r.status,old_assignee,r.assignee_id,review);
 PERFORM private.emit_business_event(p_office_id,'requests.'||CASE kind WHEN 'status' THEN 'status_changed' WHEN 'transfer' THEN 'transferred' WHEN 'reclaim' THEN 'reclaimed' WHEN 'note' THEN 'note_added' ELSE 'triaged' END,'request',r.id,p_event_id,'{}');
 IF NOT private.request_in_scope(r,m) THEN RETURN '{"access_lost":true}'::jsonb;END IF;
 RETURN private.request_detail_record(r,m,1);
END $$;

CREATE OR REPLACE FUNCTION private.files_request(p_office_id uuid,p_request_id uuid,m public.memberships,p_write boolean DEFAULT false) RETURNS public.requests
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.requests;
BEGIN
 IF p_write THEN SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id FOR UPDATE;
 ELSE SELECT * INTO r FROM public.requests x WHERE x.office_id=p_office_id AND x.id=p_request_id FOR SHARE;END IF;
 m:=private.files_actor(p_office_id,p_write);
 IF r.id IS NULL OR (private.request_in_scope(r,m) IS NOT TRUE) THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_write AND m.role_code<>'client' AND private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION private.checklists_request(p_office_id uuid,p_request_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS public.requests LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;
BEGIN
 m:=private.checklists_actor(p_office_id,p_write,p_capability);
 IF p_write THEN SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 ELSE SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR SHARE;END IF;
 m:=private.checklists_actor(p_office_id,p_write,p_capability);
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF p_write AND private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CHECKLIST_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_write AND r.status IN('concluido','cancelado') THEN RAISE EXCEPTION 'CHECKLIST_CONFLICT' USING ERRCODE='PT409';END IF;RETURN r;
END $$;

CREATE OR REPLACE FUNCTION private.checklists_view(p_office_id uuid,p_request_id uuid,p_item_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;i public.request_items;c private.checklist_instances;inst jsonb:=NULL;caps text[];closed boolean;
BEGIN
 m:=private.checklists_actor(p_office_id);r:=private.checklists_request(p_office_id,p_request_id);caps:=private.current_permissions(p_office_id);closed:=r.status IN('concluido','cancelado');
 SELECT * INTO i FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id AND (p_item_id IS NULL OR id=p_item_id) ORDER BY created_at,id LIMIT 1;
 IF p_item_id IS NOT NULL AND i.id IS NULL THEN RAISE EXCEPTION 'CHECKLIST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO c FROM private.checklist_instances WHERE office_id=p_office_id AND request_id=r.id AND item_id=i.id;
 IF c.id IS NOT NULL THEN
 SELECT jsonb_build_object('id',c.id,'source',c.source,'name',c.definition->>'name','entries',coalesce(jsonb_agg(e.rule||jsonb_build_object('id',e.id,'applicable',e.applicable,'status',e.status,'file_id',e.file_id,'version',e.version,'reason',e.reason,'actor_name',private.customer_relation_display_label(p.display_name),'updated_at',e.updated_at,'file_status',f.status) ORDER BY e.position),'[]'::jsonb),
 'pending',count(*) FILTER(WHERE e.applicable AND e.rule->>'requirement'<>'optional' AND e.status='pendente'),
 'received',count(*) FILTER(WHERE e.applicable AND e.status='recebido'),
 'can_update',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['checklists.update'],'can_waive',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['checklists.update','checklists.waive'],
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'entry_id',h.entry_id,'status',h.status,'file_id',h.file_id,'reason',h.reason,'actor_name',private.customer_relation_display_label(p2.display_name),'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC)
 FROM (SELECT h.* FROM private.checklist_history h JOIN private.checklist_entries e2 ON e2.office_id=h.office_id AND e2.id=h.entry_id WHERE e2.office_id=p_office_id AND e2.instance_id=c.id ORDER BY h.created_at DESC,h.id DESC LIMIT 5) h LEFT JOIN public.profiles p2 ON p2.id=h.actor_id),'[]'::jsonb)) INTO inst
 FROM private.checklist_entries e LEFT JOIN public.profiles p ON p.id=e.actor_id LEFT JOIN public.files f ON f.office_id=e.office_id AND f.id=e.file_id WHERE e.office_id=p_office_id AND e.instance_id=c.id;
 END IF;
 RETURN jsonb_build_object('request_id',r.id,'request_version',r.version,'protocol',r.protocol,'closed',closed,'following_only',NOT private.request_can_work(r,m),'assignee_id',r.assignee_id,'can_transfer',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.transfer'],
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'service_id',service_id,'name',snapshot->'definition'->>'name') ORDER BY created_at,id) FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id),'[]'::jsonb),'selected_item_id',i.id,'instance',inst);
END $$;

REVOKE ALL ON FUNCTION private.request_can_work(public.requests,public.memberships),private.request_can_reclaim(public.requests,public.memberships),private.notifications_actor(uuid,boolean),private.notification_visible(private.internal_notifications,public.requests,public.memberships),private.notifications_page(uuid,text,text,text,integer,integer),private.notifications_summary(uuid),private.notifications_read(uuid,uuid),public.notifications_page(uuid,text,text,text,integer,integer),public.notifications_summary(uuid),public.notifications_read(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.notifications_page(uuid,text,text,text,integer,integer),private.notifications_summary(uuid),private.notifications_read(uuid,uuid),public.notifications_page(uuid,text,text,text,integer,integer),public.notifications_summary(uuid),public.notifications_read(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.files_file_json(f public.files,m public.memberships) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',f.id,'request_id',f.request_id,'request_item_id',f.request_item_id,'name',f.name,'mime_type',f.mime_type,'size_bytes',f.size_bytes,'sha256',f.sha256,'classification',f.classification,'status',f.status,'scanner_status',f.scanner_status,'validation_reason',f.validation_reason,'created_at',f.created_at,'updated_at',f.updated_at,
 'intent_id',(SELECT i.id FROM private.upload_intents i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.file_id=f.id AND i.source_file_id IS NULL AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) AND i.created_by=m.user_id AND (m.role_code='client' OR private.current_permissions(f.office_id) @> ARRAY['files.upload']) AND i.session_id::text=auth.jwt()->>'session_id' AND i.expires_at>clock_timestamp() AND f.status='aguardando_upload' AND r.status NOT IN('concluido','cancelado') AND (m.role_code='client' OR private.request_can_work(r,m) IS TRUE)),'can_validate',f.status='aguardando_upload' AND EXISTS(SELECT FROM private.upload_intents i JOIN public.requests r ON r.office_id=i.office_id AND r.id=i.request_id WHERE i.file_id=f.id AND i.source_file_id IS NULL AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) AND i.created_by=m.user_id AND (m.role_code='client' OR private.current_permissions(f.office_id) @> ARRAY['files.upload']) AND i.session_id::text=auth.jwt()->>'session_id' AND i.expires_at>clock_timestamp() AND r.status NOT IN('concluido','cancelado') AND (m.role_code='client' OR private.request_can_work(r,m) IS TRUE)),
 'can_download',f.status='disponivel' AND f.scanner_status='clean',
 'can_copy',EXISTS(SELECT FROM public.requests r WHERE r.office_id=f.office_id AND r.id=f.request_id AND private.request_can_work(r,m) IS TRUE) AND m.role_code<>'client' AND f.status='disponivel' AND f.scanner_status='clean' AND private.current_permissions(f.office_id) @> ARRAY['files.copy','files.upload']);
$$;

CREATE OR REPLACE FUNCTION private.files_requests_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;q text:=lower(btrim(coalesce(p_query,'')));answer jsonb;
BEGIN
 m:=private.files_actor(p_office_id);
 IF length(q)>100 OR p_page IS NULL OR p_page<1 OR p_page>10000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m) AND(q='' OR strpos(lower(r.title||' '||r.protocol),q)>0)),page AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'label',r.protocol||' · '||r.title,'can_work',m.role_code='client' OR private.request_can_work(r,m) IS TRUE,'closed',r.status IN('concluido','cancelado'),'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'service_id',i.service_id,'name',private.customer_relation_display_label(i.snapshot->'definition'->>'name'),'policy',private.files_policy_record(i.office_id,i.service_id)) ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb)) ORDER BY r.updated_at DESC,r.id DESC) FROM page r),'[]'::jsonb),'total',(SELECT count(*) FROM candidates),'page',p_page,'page_size',p_size) INTO answer;
 RETURN answer;
END $$;

CREATE INDEX request_assignments_follow_idx ON private.request_assignments(office_id,membership_id,request_id);
CREATE OR REPLACE FUNCTION private.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;read_all boolean;
BEGIN
 m:=private.requests_actor(p_office_id);read_all:=private.current_permissions(p_office_id) @> ARRAY['requests.read_all'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_scope IS NULL OR p_scope NOT IN('mine','queue') OR p_status IS NULL OR p_status NOT IN('','aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado','recebido','em_analise') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;q:=lower(btrim(p_query));
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND (CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id ELSE read_all OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END)
  AND (p_scope='queue' OR r.created_by=m.user_id OR r.assignee_id=m.id OR (m.role_code<>'client' AND EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id)))
  AND (p_status='' OR CASE WHEN m.role_code='client' THEN private.request_public_status(r.status)=p_status ELSE r.status=p_status END)
  AND (q='' OR strpos(lower(r.title),q)>0 OR strpos(lower(r.protocol),q)>0)),
 paginated AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.request_summary(p,m.role_code='client') ORDER BY p.updated_at DESC,p.id DESC) FROM paginated p),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size,'portal',m.role_code='client');
END $$;

CREATE OR REPLACE FUNCTION private.files_storage_allowed(p_bucket text,p_path text,p_operation text,p_metadata jsonb DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE i private.upload_intents;f public.files;m public.memberships;r public.requests;
BEGIN
 IF p_bucket<>'request-attachments' THEN RETURN false;END IF;
 SELECT * INTO i FROM private.upload_intents WHERE bucket=p_bucket AND object_path=p_path;
 IF i.id IS NULL THEN RETURN false;END IF;
 m:=private.files_actor(i.office_id,false,CASE WHEN p_operation='insert' THEN 'files.upload' ELSE NULL END);
 r:=private.files_request(i.office_id,i.request_id,m);
 SELECT * INTO f FROM public.files WHERE office_id=i.office_id AND id=i.file_id;
 IF f.id IS NULL OR(m.role_code='client' AND f.created_by<>m.user_id) OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) THEN RETURN false;END IF;
 IF p_operation='select' THEN RETURN f.status='disponivel' AND f.scanner_status='clean' AND storage.allow_any_operation(ARRAY['object.get_authenticated','object.get_authenticated_info']);END IF;
 IF p_operation='insert' AND m.role_code<>'client' AND private.request_can_work(r,m) IS NOT TRUE THEN RETURN false;END IF;
 IF p_operation<>'insert' OR NOT storage.allow_any_operation(ARRAY['object.upload']) THEN RETURN false;END IF;
 RETURN i.created_by=m.user_id AND i.session_id::text=auth.jwt()->>'session_id' AND i.source_file_id IS NULL AND i.expires_at>clock_timestamp() AND f.status='aguardando_upload' AND r.status NOT IN('concluido','cancelado')
  AND(p_metadata->>'size' IS NULL OR((p_metadata->>'size')::bigint BETWEEN 1 AND(i.policy_snapshot->>'max_bytes')::bigint))
  AND(p_metadata->>'mimetype' IS NULL OR i.policy_snapshot->'mime_types' ? (p_metadata->>'mimetype'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION private.files_cleanup_plan(p_office_id uuid,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;plan private.file_cleanup_plans;f public.files;orphans integer;count_files integer;items jsonb;
BEGIN
 m:=private.files_actor(p_office_id,true,'files.manage');
 IF p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 -- Existing reservations remain exact and recoverable. Never expire a deletion reservation silently.
 SELECT p.* INTO plan FROM private.file_cleanup_plans p WHERE office_id=p_office_id AND(created_by=m.user_id OR m.role_code='owner') AND EXISTS(SELECT FROM private.file_cleanup_reservations WHERE plan_id=p.id AND removed_at IS NULL) ORDER BY (created_by=m.user_id) DESC,created_at LIMIT 1 FOR UPDATE;
 IF plan.id IS NOT NULL THEN
  -- Reviewed names remain private after a transfer, including retries by the original planner.
  PERFORM 1 FROM public.requests r WHERE r.office_id=p_office_id AND EXISTS(SELECT FROM public.files f JOIN private.file_cleanup_reservations x ON x.file_id=f.id WHERE f.request_id=r.id AND x.plan_id=plan.id AND x.removed_at IS NULL) ORDER BY r.id FOR UPDATE;
  m:=private.files_actor(p_office_id,true,'files.manage');
  IF EXISTS(SELECT FROM private.file_cleanup_reservations x JOIN public.files f ON f.id=x.file_id JOIN public.requests r ON r.id=f.request_id AND r.office_id=f.office_id WHERE x.plan_id=plan.id AND x.removed_at IS NULL AND (private.request_in_scope(r,m) IS NOT TRUE OR private.request_can_work(r,m) IS NOT TRUE)) THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF plan.created_by<>m.user_id THEN
   IF m.role_code<>'owner' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
   UPDATE private.file_process_leases SET token=gen_random_uuid()::text,expires_at=clock_timestamp() WHERE action='cleanup' AND target_id=plan.id AND completed_at IS NULL;
   PERFORM private.team_audit(p_office_id,m.user_id,'files.cleanup_taken_over','file_cleanup',plan.id,p_event_id,'{}');
  END IF;
  UPDATE private.file_cleanup_plans SET created_by=m.user_id,session_id=(auth.jwt()->>'session_id')::uuid,expires_at=clock_timestamp()+interval '15 minutes' WHERE id=plan.id RETURNING * INTO plan;
 ELSE
  SELECT count(*) INTO orphans FROM storage.objects o WHERE o.bucket_id='request-attachments' AND split_part(o.name,'/',1)=p_office_id::text AND NOT EXISTS(SELECT FROM private.upload_intents i WHERE i.bucket=o.bucket_id AND i.object_path=o.name);
  INSERT INTO private.file_cleanup_plans(office_id,created_by,session_id,orphan_count)VALUES(p_office_id,m.user_id,(auth.jwt()->>'session_id')::uuid,orphans)RETURNING * INTO plan;
  -- Office lock serializes app writers; order request locks before file locks.
  PERFORM 1 FROM public.requests r WHERE r.office_id=p_office_id AND private.request_in_scope(r,m) ORDER BY r.id FOR UPDATE;
  m:=private.files_actor(p_office_id,true,'files.manage');
  FOR f IN SELECT f.* FROM public.files f JOIN public.requests r ON r.office_id=f.office_id AND r.id=f.request_id WHERE f.office_id=p_office_id AND private.request_in_scope(r,m) AND private.request_can_work(r,m) IS TRUE AND private.files_cleanup_eligible(f) AND NOT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) ORDER BY f.id LIMIT 20 FOR UPDATE OF f LOOP
   IF private.files_cleanup_eligible(f) THEN INSERT INTO private.file_cleanup_reservations(file_id,office_id,plan_id)VALUES(f.id,p_office_id,plan.id);END IF;
  END LOOP;
  PERFORM private.team_audit(p_office_id,m.user_id,'files.cleanup_planned','file_cleanup',plan.id,p_event_id,jsonb_build_object('count',(SELECT count(*) FROM private.file_cleanup_reservations WHERE plan_id=plan.id)));
 END IF;
 SELECT count(*),coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'status',f.status) ORDER BY f.id),'[]'::jsonb) INTO count_files,items
 FROM private.file_cleanup_reservations x JOIN public.files f ON f.office_id=x.office_id AND f.id=x.file_id WHERE x.office_id=p_office_id AND x.plan_id=plan.id AND x.removed_at IS NULL;
 RETURN jsonb_build_object('id',plan.id,'expires_at',plan.expires_at,'count',count_files,'orphan_count',plan.orphan_count,'items',items);
END $$;

CREATE OR REPLACE FUNCTION private.files_process_claim(p_office_id uuid,p_action text,p_args jsonb,p_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
DECLARE m public.memberships;r public.requests;source_r public.requests;f public.files;source_f public.files;i private.upload_intents;source_i private.upload_intents;plan private.file_cleanup_plans;l private.file_process_leases;target uuid;objects_json jsonb;intent jsonb;upload jsonb;
BEGIN
 m:=private.files_actor(p_office_id,true,CASE p_action WHEN 'copy' THEN 'files.copy' WHEN 'cleanup' THEN 'files.manage' ELSE 'files.upload' END);
 IF p_action IS NULL OR p_action NOT IN('validate','copy','cleanup') OR jsonb_typeof(p_args) IS DISTINCT FROM 'object' OR p_event_id IS NULL THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_action='validate' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT p_args ? 'intent_id' THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO i FROM private.upload_intents WHERE office_id=p_office_id AND id=(p_args->>'intent_id')::uuid;
  IF i.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  r:=private.files_request(p_office_id,i.request_id,m,true);m:=private.files_actor(p_office_id,true,'files.upload');
  SELECT * INTO f FROM public.files WHERE office_id=p_office_id AND id=i.file_id FOR UPDATE;
  IF i.created_by<>m.user_id OR i.session_id::text<>auth.jwt()->>'session_id' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF i.source_file_id IS NOT NULL OR r.status IN('concluido','cancelado') OR i.expires_at<=clock_timestamp() OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=f.id) THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  target:=i.id;objects_json:=jsonb_build_array(private.files_object_json(f,i));
 ELSIF p_action='copy' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>4 OR NOT p_args ?& ARRAY['source_file_id','target_request_id','target_item_id','idempotency_key'] THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO source_f FROM public.files WHERE office_id=p_office_id AND id=(p_args->>'source_file_id')::uuid;
  IF source_f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  PERFORM 1 FROM public.requests WHERE office_id=p_office_id AND id IN(source_f.request_id,(p_args->>'target_request_id')::uuid) ORDER BY id FOR UPDATE;
  source_r:=private.files_request(p_office_id,source_f.request_id,m,true);r:=private.files_request(p_office_id,(p_args->>'target_request_id')::uuid,m,true);m:=private.files_actor(p_office_id,true,'files.copy');
  SELECT * INTO source_f FROM public.files WHERE office_id=p_office_id AND id=source_f.id FOR SHARE;
  IF source_f.status<>'disponivel' OR source_f.scanner_status<>'clean' OR EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=source_f.id) THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
  IF jsonb_typeof(p_args->'idempotency_key') IS DISTINCT FROM 'string' OR length(p_args->>'idempotency_key') NOT BETWEEN 1 AND 95 THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  upload:=jsonb_build_object('request_id',r.id,'request_item_id',p_args->'target_item_id','name',source_f.name,'mime_type',source_f.mime_type,'size_bytes',source_f.size_bytes,'sha256',source_f.sha256,'classification',source_f.classification,'idempotency_key','copy:'||(p_args->>'idempotency_key'));
  intent:=private.files_begin_upload(p_office_id,upload,p_event_id);
  SELECT * INTO i FROM private.upload_intents WHERE id=(intent->>'intent_id')::uuid FOR UPDATE;
  IF i.source_file_id IS NOT NULL AND i.source_file_id<>source_f.id THEN RAISE EXCEPTION 'FILE_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  IF i.source_file_id IS NULL THEN
   UPDATE private.upload_intents SET source_file_id=source_f.id WHERE id=i.id RETURNING * INTO i;
   INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES(p_office_id,source_f.id,'copy');
  END IF;
  SELECT * INTO f FROM public.files WHERE id=i.file_id AND office_id=p_office_id FOR UPDATE;
  IF i.created_by<>m.user_id OR i.session_id::text<>auth.jwt()->>'session_id' OR i.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  target:=i.id;objects_json:=jsonb_build_array(private.files_object_json(f,i));
 ELSE
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT p_args ? 'plan_id' THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO plan FROM private.file_cleanup_plans WHERE office_id=p_office_id AND id=(p_args->>'plan_id')::uuid FOR UPDATE;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF plan.created_by<>m.user_id OR plan.session_id::text<>auth.jwt()->>'session_id' THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  IF plan.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FILE_CONFLICT' USING ERRCODE='PT409';END IF;
  PERFORM 1 FROM public.requests r WHERE r.office_id=p_office_id AND EXISTS(SELECT FROM public.files f JOIN private.file_cleanup_reservations x ON x.file_id=f.id WHERE f.request_id=r.id AND x.plan_id=plan.id) ORDER BY r.id FOR UPDATE;
  m:=private.files_actor(p_office_id,true,'files.manage');
  IF EXISTS(SELECT FROM public.files f JOIN private.file_cleanup_reservations x ON x.file_id=f.id JOIN public.requests r ON r.office_id=f.office_id AND r.id=f.request_id WHERE x.plan_id=plan.id AND (private.request_in_scope(r,m) IS NOT TRUE OR private.request_can_work(r,m) IS NOT TRUE)) THEN RAISE EXCEPTION 'FILES_FORBIDDEN' USING ERRCODE='PT403';END IF;
  SELECT coalesce(jsonb_agg(private.files_object_json(f,i) ORDER BY f.id),'[]'::jsonb) INTO objects_json FROM private.file_cleanup_reservations x JOIN public.files f ON f.id=x.file_id JOIN private.upload_intents i ON i.file_id=f.id WHERE x.plan_id=plan.id AND x.removed_at IS NULL;
  target:=plan.id;
 END IF;
 SELECT * INTO l FROM private.file_process_leases WHERE office_id=p_office_id AND actor_id=m.user_id AND session_id::text=auth.jwt()->>'session_id' AND action=p_action AND target_id=target FOR UPDATE;
 IF l.id IS NOT NULL THEN
  IF l.completed_at IS NULL AND l.expires_at<=clock_timestamp() THEN UPDATE private.file_process_leases SET token=gen_random_uuid()::text,expires_at=clock_timestamp()+interval '5 minutes',objects=objects_json WHERE id=l.id RETURNING * INTO l;END IF;
 ELSE
  IF p_action IN('validate','copy') AND f.status<>'aguardando_upload' THEN RAISE EXCEPTION 'FILE_NOT_READY' USING ERRCODE='PT409';END IF;
  INSERT INTO private.file_process_leases(office_id,actor_id,session_id,action,target_id,objects)VALUES(p_office_id,m.user_id,(auth.jwt()->>'session_id')::uuid,p_action,target,objects_json)RETURNING * INTO l;
  PERFORM private.team_audit(p_office_id,m.user_id,'files.process_claimed','file_process',l.id,p_event_id,'{}');
 END IF;
 RETURN private.files_lease_json(l);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FILE_VALIDATION' USING ERRCODE='PT422';END $$;

-- Refresh the API signature cache only after this transaction commits.
NOTIFY pgrst, 'reload schema';
