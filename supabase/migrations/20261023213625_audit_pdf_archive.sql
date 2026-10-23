-- Auditoria: arquivamento lógico sem expurgo, relatórios completos e integridade verificável.
-- Nenhuma concessão individual, dado financeiro ou conta Auth é criada.
INSERT INTO public.permissions(code,name) VALUES ('audit.archives','Consultar históricos arquivados de auditoria (administradores)'),('audit.manage','Configurar arquivamento de auditoria (administradores)') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES ('owner','audit.archives'),('owner','audit.manage') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK (permission_code IN ('foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage']);
CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage'])
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
  ELSIF k IN ('membership_id','archive_id','customer_id','source_id','target_id','relation_id','merge_id','report_id','notification_id','entry_id','unit_id','session_id','charge_id','request_id','file_id','item_id','model_id') THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  ELSIF k='expires_at' THEN safe:=jsonb_typeof(v)='string' AND v#>>'{}' ~ '^[0-9TZ:+. -]{20,35}$';
  ELSIF k='count' AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN 0 AND 10000;
  ELSIF k IN ('amount_cents','due_cents','delta_cents','counted_cents','expected_cents','version') AND jsonb_typeof(v)='number' THEN safe:=(v#>>'{}')::numeric BETWEEN -9007199254740991 AND 9007199254740991 AND trunc((v#>>'{}')::numeric)=(v#>>'{}')::numeric;
  ELSIF k IN ('days','previous_days') THEN safe:=v IN ('30'::jsonb,'60'::jsonb,'90'::jsonb);
  ELSIF k='view' THEN safe:=v IN ('"recent"'::jsonb,'"archived"'::jsonb);
  ELSIF k IN ('permissions','allowed_permissions') AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','audit.archives','audit.manage','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE TABLE private.audit_policies (
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),days integer NOT NULL CHECK(days IN(30,60,90)),
 effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),archive_floor timestamptz NOT NULL CHECK(isfinite(archive_floor)),
 changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,request_id uuid NOT NULL DEFAULT gen_random_uuid(),
 PRIMARY KEY(office_id,version),UNIQUE(office_id,request_id)
);
CREATE INDEX audit_policies_actor_idx ON private.audit_policies(changed_by);
CREATE TRIGGER audit_policies_immutable BEFORE UPDATE OR DELETE ON private.audit_policies FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
ALTER TABLE private.audit_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.audit_policies FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO private.audit_policies(office_id,version,days,archive_floor) SELECT id,1,90,clock_timestamp()-interval '90 days' FROM public.offices;
CREATE FUNCTION private.audit_policy_initialize() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN INSERT INTO private.audit_policies(office_id,version,days,archive_floor) VALUES(NEW.id,1,90,clock_timestamp()-interval '90 days');RETURN NEW;END $$;
CREATE TRIGGER office_audit_policy AFTER INSERT ON public.offices FOR EACH ROW EXECUTE FUNCTION private.audit_policy_initialize();

CREATE FUNCTION private.audit_privileged(p_office_id uuid,p_capability text) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE caller uuid;
BEGIN
 caller:=private.governance_actor(p_office_id,'audit.read');
 PERFORM private.governance_actor(p_office_id,p_capability);
 IF NOT EXISTS(SELECT FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active AND role_code IN('owner','admin')) THEN RAISE EXCEPTION 'GOVERNANCE_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN caller;
END $$;
CREATE FUNCTION private.audit_policy_record(p_office_id uuid) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
 SELECT jsonb_build_object('days',days,'version',version,'effective_at',effective_at,'cutoff',greatest(archive_floor,clock_timestamp()-make_interval(days=>days))) FROM private.audit_policies WHERE office_id=p_office_id ORDER BY version DESC LIMIT 1;
$$;
CREATE FUNCTION private.audit_policy_get(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN PERFORM private.governance_actor(p_office_id,'audit.read');RETURN private.audit_policy_record(p_office_id);END $$;
CREATE FUNCTION private.audit_policy_set(p_office_id uuid,p_days integer,p_version integer,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE caller uuid;old private.audit_policies;cut timestamptz;at_time timestamptz;
BEGIN
 PERFORM private.governance_actor(p_office_id,'audit.read',true);caller:=private.audit_privileged(p_office_id,'audit.manage');
 SELECT * INTO old FROM private.audit_policies WHERE office_id=p_office_id ORDER BY version DESC LIMIT 1;
 IF p_days IS NULL OR p_days NOT IN(30,60,90) OR p_version IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF old.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'ARCHIVE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF old.days=p_days THEN RETURN private.audit_policy_record(p_office_id);END IF;
 at_time:=clock_timestamp();cut:=greatest(old.archive_floor,at_time-make_interval(days=>old.days),at_time-make_interval(days=>p_days));
 INSERT INTO private.audit_policies(office_id,version,days,effective_at,archive_floor,changed_by,request_id) VALUES(p_office_id,old.version+1,p_days,at_time,cut,caller,p_request_id);
 PERFORM private.emit_business_event(p_office_id,'audit.policy_changed','office',p_office_id,p_request_id,jsonb_build_object('days',p_days,'previous_days',old.days));
 RETURN private.audit_policy_record(p_office_id);
END $$;
CREATE FUNCTION private.audit_view_access(p_office_id uuid,p_view text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
BEGIN
 PERFORM private.governance_actor(p_office_id,'audit.read');
 IF p_view IS NULL OR p_view NOT IN('recent','archived') THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_view='archived' THEN PERFORM private.audit_privileged(p_office_id,'audit.archives');END IF;
END $$;
CREATE FUNCTION private.audit_history_page(p_office_id uuid,p_page integer,p_size integer,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz,p_view text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE result jsonb;total bigint;cut timestamptz;
BEGIN
 PERFORM private.audit_view_access(p_office_id,p_view);PERFORM private.audit_filters(p_page,p_size,p_action,p_from,p_until);
 cut:=(private.audit_policy_record(p_office_id)->>'cutoff')::timestamptz;
 SELECT count(*) INTO total FROM private.audit_rows(p_office_id,p_action,p_actor,p_from,p_until) WHERE (occurred_at<cut)=(p_view='archived');
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC),'[]') INTO result FROM(SELECT * FROM private.audit_rows(p_office_id,p_action,p_actor,p_from,p_until) WHERE (occurred_at<cut)=(p_view='archived') ORDER BY occurred_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)x;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size,'cutoff',cut);
END $$;
-- The previous page RPC is retained for compatible clients, restricted to recent events.
CREATE OR REPLACE FUNCTION private.audit_page(p_office_id uuid,p_page integer,p_size integer,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$SELECT private.audit_history_page(p_office_id,p_page,p_size,p_action,p_actor,p_from,p_until,'recent');$$;
-- Old JSON bulk RPC is disabled; snapshots below are the only report source.
REVOKE ALL ON FUNCTION public.audit_export(uuid,text,uuid,timestamptz,timestamptz,uuid),private.audit_export(uuid,text,uuid,timestamptz,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.audit_reports (
 id uuid PRIMARY KEY,office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,session_id uuid NOT NULL,
 created_at timestamptz NOT NULL,oldest_at timestamptz,view text NOT NULL CHECK(view IN('recent','archived')),cutoff timestamptz NOT NULL,
 filters jsonb NOT NULL CHECK(jsonb_typeof(filters)='object'),office_name text NOT NULL,actor_name text NOT NULL,
 event_count integer NOT NULL CHECK(event_count BETWEEN 0 AND 10000),renderer_version integer NOT NULL DEFAULT 1 CHECK(renderer_version=1),contract_version integer NOT NULL DEFAULT 1 CHECK(contract_version=1),
 UNIQUE(office_id,id)
);
CREATE INDEX audit_reports_actor_idx ON private.audit_reports(actor_id);
CREATE INDEX audit_reports_office_time_idx ON private.audit_reports(office_id,created_at DESC);
CREATE TABLE private.audit_report_events (
 report_id uuid NOT NULL REFERENCES private.audit_reports(id) ON DELETE RESTRICT,ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 10000),event jsonb NOT NULL CHECK(jsonb_typeof(event)='object'),PRIMARY KEY(report_id,ordinal)
);
-- Hashes here are an immutable record of registration, not a trust boundary.
-- Verification MUST regenerate the canonical PDF from the DB snapshot and compare its hash.
CREATE TABLE private.audit_report_seals (
 report_id uuid PRIMARY KEY REFERENCES private.audit_reports(id) ON DELETE RESTRICT,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 5 AND 3145728),registered_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER audit_reports_immutable BEFORE UPDATE OR DELETE ON private.audit_reports FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER audit_report_events_immutable BEFORE UPDATE OR DELETE ON private.audit_report_events FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER audit_report_seals_immutable BEFORE UPDATE OR DELETE ON private.audit_report_seals FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
ALTER TABLE private.audit_reports ENABLE ROW LEVEL SECURITY;ALTER TABLE private.audit_report_events ENABLE ROW LEVEL SECURITY;ALTER TABLE private.audit_report_seals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.audit_reports,private.audit_report_events,private.audit_report_seals FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.audit_report_json(r private.audit_reports) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
 SELECT jsonb_build_object('id',r.id,'protocol','JN-AUD-'||r.id::text,'count',r.event_count,'office_id',r.office_id,'office_name',r.office_name,'actor_name',r.actor_name,'created_at',r.created_at,'view',r.view,'cutoff',r.cutoff,'filters',r.filters,'renderer_version',r.renderer_version,'contract_version',r.contract_version);
$$;
CREATE FUNCTION private.audit_report_begin(p_office_id uuid,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz,p_view text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE caller uuid;cut timestamptz;rows jsonb;r private.audit_reports;
BEGIN
 caller:=private.governance_actor(p_office_id,'audit.read',true);PERFORM private.audit_view_access(p_office_id,p_view);PERFORM private.governance_actor(p_office_id,'audit.export');
 PERFORM private.audit_filters(1,5,p_action,p_from,p_until);
 IF (p_from IS NOT NULL AND p_from IS DISTINCT FROM (date_trunc('day',p_from AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) OR (p_until IS NOT NULL AND p_until IS DISTINCT FROM (date_trunc('day',p_until AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 cut:=(private.audit_policy_record(p_office_id)->>'cutoff')::timestamptz;
 -- One statement/MVCC snapshot freezes events, actor names and ordinal order together.
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC,x.id DESC),'[]') INTO rows FROM(SELECT * FROM private.audit_rows(p_office_id,p_action,p_actor,p_from,p_until) WHERE (occurred_at<cut)=(p_view='archived') ORDER BY occurred_at DESC,id DESC LIMIT 10001)x;
 IF jsonb_array_length(rows)>10000 OR octet_length(rows::text)>16000000 THEN RAISE EXCEPTION 'EXPORT_LIMIT' USING ERRCODE='PT422';END IF;
 INSERT INTO private.audit_reports(id,office_id,actor_id,session_id,created_at,oldest_at,view,cutoff,filters,office_name,actor_name,event_count)
 SELECT p_request_id,p_office_id,caller,(auth.jwt()->>'session_id')::uuid,clock_timestamp(),(rows->-1->>'occurred_at')::timestamptz,p_view,cut,jsonb_build_object('action',p_action,'actor_id',coalesce(p_actor::text,''),'from',coalesce(to_char(p_from AT TIME ZONE 'UTC','YYYY-MM-DD'),''),'until',coalesce(to_char((p_until AT TIME ZONE 'UTC')-interval '1 day','YYYY-MM-DD'),'')),o.name,coalesce(p.display_name,'Pessoa sem nome informado'),jsonb_array_length(rows)
 FROM public.offices o JOIN public.profiles p ON p.id=caller WHERE o.id=p_office_id RETURNING * INTO r;
 INSERT INTO private.audit_report_events(report_id,ordinal,event) SELECT r.id,ordinality::integer,value FROM jsonb_array_elements(rows) WITH ORDINALITY;
 PERFORM private.emit_business_event(p_office_id,'audit.report_started','audit',r.id,p_request_id,jsonb_build_object('count',r.event_count,'report_id',r.id,'view',p_view));
 RETURN private.audit_report_json(r);
END $$;
CREATE FUNCTION private.audit_report_access(p_office_id uuid,p_report_id uuid) RETURNS private.audit_reports LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE r private.audit_reports;
BEGIN
 PERFORM private.governance_actor(p_office_id,'audit.read');PERFORM private.governance_actor(p_office_id,'audit.export');
 SELECT * INTO r FROM private.audit_reports WHERE office_id=p_office_id AND id=p_report_id;
 IF r.id IS NULL THEN RAISE EXCEPTION 'GOVERNANCE_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.audit_view_access(p_office_id,r.view);
 IF r.oldest_at<(private.audit_policy_record(p_office_id)->>'cutoff')::timestamptz THEN PERFORM private.audit_privileged(p_office_id,'audit.archives');END IF;RETURN r;
END $$;
CREATE FUNCTION private.audit_report_reference(p_office_id uuid,p_report_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE r private.audit_reports;
BEGIN r:=private.audit_report_access(p_office_id,p_report_id);RETURN private.audit_report_json(r);END $$;
CREATE FUNCTION private.audit_report_chunk(p_office_id uuid,p_report_id uuid,p_offset integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE r private.audit_reports;items jsonb;
BEGIN
 r:=private.audit_report_access(p_office_id,p_report_id);
 IF p_offset IS NULL OR p_offset<0 OR p_offset>r.event_count OR p_offset%500<>0 THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT coalesce(jsonb_agg(event ORDER BY ordinal),'[]') INTO items FROM private.audit_report_events WHERE report_id=r.id AND ordinal>p_offset AND ordinal<=p_offset+500;
 RETURN jsonb_build_object('items',items,'offset',p_offset,'total',r.event_count);
END $$;
CREATE FUNCTION private.audit_report_seal(p_office_id uuid,p_report_id uuid,p_sha256 text,p_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE r private.audit_reports;s private.audit_report_seals;caller uuid;
BEGIN
 caller:=private.governance_actor(p_office_id,'audit.read',true);r:=private.audit_report_access(p_office_id,p_report_id);
 IF r.actor_id<>caller OR r.session_id IS DISTINCT FROM (auth.jwt()->>'session_id')::uuid THEN RAISE EXCEPTION 'GOVERNANCE_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_bytes IS NULL OR p_bytes NOT BETWEEN 5 AND 3145728 THEN RAISE EXCEPTION 'GOVERNANCE_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.audit_report_seals WHERE report_id=r.id;
 IF s.report_id IS NOT NULL THEN
  -- A user can pre-register an arbitrary digest. It cannot veto the canonical API PDF.
  -- Keep the original cache immutable; verification ignores it and regenerates the reference.
  RETURN jsonb_build_object('id',r.id,'registered_digest_match',s.sha256=p_sha256 AND s.bytes=p_bytes);
 END IF;
 INSERT INTO private.audit_report_seals(report_id,sha256,bytes) VALUES(r.id,p_sha256,p_bytes);
 PERFORM private.emit_business_event(p_office_id,'audit.exported','audit',r.id,gen_random_uuid(),jsonb_build_object('report_id',r.id,'count',r.event_count,'view',r.view));
 RETURN jsonb_build_object('id',r.id);
END $$;
-- A real missing producer: idempotent first read, without copying notification text or recipient PII.
CREATE FUNCTION private.audit_notification_read() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
BEGIN
 PERFORM private.emit_business_event(NEW.office_id,'notifications.read','notification',NEW.id,gen_random_uuid(),jsonb_build_object('notification_id',NEW.id));RETURN NEW;
END $$;
CREATE TRIGGER notification_read_audit AFTER UPDATE OF read_at ON private.internal_notifications FOR EACH ROW WHEN(OLD.read_at IS NULL AND NEW.read_at IS NOT NULL) EXECUTE FUNCTION private.audit_notification_read();

CREATE FUNCTION public.audit_policy_get(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_policy_get(p_office_id);$$;
CREATE FUNCTION public.audit_policy_set(p_office_id uuid,p_days integer,p_version integer,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_policy_set(p_office_id,p_days,p_version,p_request_id);$$;
CREATE FUNCTION public.audit_history_page(p_office_id uuid,p_page integer,p_size integer,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz,p_view text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_history_page(p_office_id,p_page,p_size,p_action,p_actor,p_from,p_until,p_view);$$;
CREATE FUNCTION public.audit_report_begin(p_office_id uuid,p_action text,p_actor uuid,p_from timestamptz,p_until timestamptz,p_view text,p_request_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_report_begin(p_office_id,p_action,p_actor,p_from,p_until,p_view,p_request_id);$$;
CREATE FUNCTION public.audit_report_reference(p_office_id uuid,p_report_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_report_reference(p_office_id,p_report_id);$$;
CREATE FUNCTION public.audit_report_chunk(p_office_id uuid,p_report_id uuid,p_offset integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_report_chunk(p_office_id,p_report_id,p_offset);$$;
CREATE FUNCTION public.audit_report_seal(p_office_id uuid,p_report_id uuid,p_sha256 text,p_bytes integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.audit_report_seal(p_office_id,p_report_id,p_sha256,p_bytes);$$;
DO $$DECLARE f record;BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,n.nspname,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname IN('audit_policy_initialize','audit_privileged','audit_policy_record','audit_policy_get','audit_policy_set','audit_view_access','audit_history_page','audit_report_json','audit_report_begin','audit_report_access','audit_report_reference','audit_report_chunk','audit_report_seal','audit_notification_read') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN('audit_policy_get','audit_policy_set','audit_history_page','audit_report_begin','audit_report_reference','audit_report_chunk','audit_report_seal') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END $$;

-- Existing mutation preserved; add only technical/financial facts to its transactional audit.
CREATE OR REPLACE FUNCTION private.cash_operate(p_office_id uuid,p_operation jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;s private.cash_sessions;c private.charges;r public.requests;m public.memberships;method private.payment_methods;account private.financial_accounts;original private.cash_entries;a record;cmd private.cash_commands;entry private.cash_entries;
 k text;key uuid;sid uuid;expected integer;amount bigint;counted bigint;physical bigint;remaining bigint;reason text;digest text;operation_result jsonb;keys text[];
BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF p_operation IS NULL OR jsonb_typeof(p_operation)<>'object' OR NOT p_operation ?& ARRAY['kind','session_id','expected_version','idempotency_key'] THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_operation->>'kind';
 keys:=CASE WHEN k='receive' THEN ARRAY['kind','session_id','expected_version','idempotency_key','charge_id','expected_charge_version','payment_method_id','amount_cents'] WHEN k IN('refund','reverse') THEN ARRAY['kind','session_id','expected_version','idempotency_key','entry_id','amount_cents','reason'] WHEN k IN('reconcile','close') THEN ARRAY['kind','session_id','expected_version','idempotency_key','counted_cents','reason'] END;
 IF keys IS NULL OR NOT p_operation ?& keys OR(SELECT count(*) FROM jsonb_object_keys(p_operation))<>cardinality(keys) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
  IF jsonb_typeof(p_operation->'expected_version')<>'number' OR (p_operation->>'expected_version')::numeric<>trunc((p_operation->>'expected_version')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
  sid:=(p_operation->>'session_id')::uuid;key:=(p_operation->>'idempotency_key')::uuid;expected:=(p_operation->>'expected_version')::integer;
  IF k IN('receive','refund','reverse') THEN
   IF jsonb_typeof(p_operation->'amount_cents')<>'number' OR(p_operation->>'amount_cents')::numeric<>trunc((p_operation->>'amount_cents')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;amount:=(p_operation->>'amount_cents')::bigint;
  ELSE
   IF jsonb_typeof(p_operation->'counted_cents')<>'number' OR(p_operation->>'counted_cents')::numeric<>trunc((p_operation->>'counted_cents')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;counted:=(p_operation->>'counted_cents')::bigint;
  END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 IF sid IS NULL OR key IS NULL OR expected NOT BETWEEN 1 AND 2147483645 OR(k IN('receive','refund','reverse') AND amount NOT BETWEEN 1 AND 1000000000000) OR(k IN('reconcile','close') AND counted NOT BETWEEN 0 AND 1000000000000) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 reason:=CASE WHEN k='receive' THEN 'Recebimento manual confirmado pelo operador' ELSE p_operation->>'reason' END;
 IF(k<>'receive' AND jsonb_typeof(p_operation->'reason') IS DISTINCT FROM 'string') OR reason IS NULL OR reason<>btrim(reason) OR char_length(reason) NOT BETWEEN 5 AND 500 OR reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO s FROM private.cash_sessions WHERE office_id=p_office_id AND id=sid FOR UPDATE;
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF s.id IS NULL OR s.operator_id<>caller THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 -- Current permissions and request scope are checked even before replaying a completed command.
 IF k IN('receive','refund','reverse') THEN
  m:=private.charges_actor(p_office_id,true,CASE WHEN k='receive' THEN NULL ELSE 'charges.adjust' END);
  IF k='receive' THEN
   BEGIN SELECT * INTO c FROM private.charges WHERE office_id=p_office_id AND id=(p_operation->>'charge_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
  ELSE
   BEGIN SELECT * INTO original FROM private.cash_entries WHERE office_id=p_office_id AND id=(p_operation->>'entry_id')::uuid AND kind='received';EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
   IF original.id IS NULL OR original.unit_id<>s.unit_id THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
   SELECT * INTO c FROM private.charges WHERE office_id=p_office_id AND id=original.charge_id;
  END IF;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
  SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=c.request_id FOR UPDATE;
  caller:=private.cash_actor(p_office_id,true,'cash.open');m:=private.charges_actor(p_office_id,true,CASE WHEN k='receive' THEN NULL ELSE 'charges.adjust' END);
  IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;
 digest:=encode(extensions.digest(p_operation::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.cash_commands WHERE office_id=p_office_id AND kind='operate' AND idempotency_key=key;
 IF FOUND THEN IF cmd.actor_id<>caller OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;END IF;
 IF s.status<>'open' OR s.version<>expected OR NOT EXISTS(SELECT FROM private.cash_units u JOIN private.financial_accounts f ON f.office_id=u.office_id AND f.unit_id=u.id WHERE u.office_id=p_office_id AND u.id=s.unit_id AND f.id=s.cash_account_id AND u.active AND f.active) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT s.opening_cents+coalesce(sum(e.cash_cents),0) INTO physical FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.session_id=s.id;
 IF k='receive' THEN
  IF jsonb_typeof(p_operation->'expected_charge_version') IS DISTINCT FROM 'number' OR(p_operation->>'expected_charge_version')::numeric<>trunc((p_operation->>'expected_charge_version')::numeric) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
  SELECT * INTO a FROM private.charges_amounts(p_office_id,c.id);
  IF a.cancelled OR r.status='cancelado' OR a.version::numeric<>(p_operation->>'expected_charge_version')::numeric OR amount>a.balance_cents THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
  BEGIN SELECT * INTO method FROM private.payment_methods WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=(p_operation->>'payment_method_id')::uuid FOR SHARE;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
  SELECT * INTO account FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=s.unit_id AND id=method.destination_account_id FOR SHARE;
  IF method.id IS NULL OR account.id IS NULL OR NOT method.active OR NOT account.active OR(method.type='cash')<>(account.type='cash') OR(method.type='cash' AND account.id<>s.cash_account_id) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 ELSEIF k IN('refund','reverse') THEN
  SELECT original.amount_cents-coalesce(sum(e.amount_cents),0) INTO remaining FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.original_entry_id=original.id;
  IF amount>remaining OR(k='reverse' AND amount<>remaining) OR(original.payment_type='cash' AND (s.cash_account_id<>original.account_id OR amount>physical)) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 IF k='receive' AND method.type='cash' AND physical+amount>1000000000000 THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF (k='receive' AND (SELECT coalesce(sum(e.amount_cents),0)+amount FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.session_id=s.id AND e.kind='received')>9007199254740991) OR(k IN('refund','reverse') AND (SELECT coalesce(sum(e.amount_cents),0)+amount FROM private.cash_entries e WHERE e.office_id=p_office_id AND e.session_id=s.id AND e.kind IN('refunded','reversed'))>9007199254740991) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'operate',key,caller,digest);
 PERFORM set_config('jn.cash_command',key::text,true);
 INSERT INTO private.cash_entries(office_id,unit_id,session_id,kind,charge_id,request_id,payment_method_id,account_id,original_entry_id,payment_method_name,account_name,payment_type,amount_cents,cash_cents,applied_cents,counted_cents,expected_cents,reason,actor_id,command_key)
 VALUES(p_office_id,s.unit_id,s.id,CASE k WHEN 'receive' THEN 'received' WHEN 'refund' THEN 'refunded' WHEN 'reverse' THEN 'reversed' WHEN 'reconcile' THEN 'reconciled' ELSE 'closed' END,
 c.id,r.id,CASE WHEN k='receive' THEN method.id ELSE original.payment_method_id END,CASE WHEN k='receive' THEN account.id ELSE original.account_id END,original.id,
 CASE WHEN k='receive' THEN method.name ELSE original.payment_method_name END,CASE WHEN k='receive' THEN account.name ELSE original.account_name END,CASE WHEN k='receive' THEN method.type ELSE original.payment_type END,
 coalesce(amount,counted),CASE WHEN k='receive' AND method.type='cash' THEN amount WHEN k IN('refund','reverse') AND original.payment_type='cash' THEN -amount ELSE 0 END,CASE WHEN k='receive' THEN amount WHEN k IN('refund','reverse') THEN -amount ELSE 0 END,
 counted,CASE WHEN k IN('reconcile','close') THEN physical END,reason,caller,key)RETURNING * INTO entry;
 UPDATE private.cash_sessions SET version=version+1,status=CASE WHEN k='close' THEN 'closed' ELSE 'open' END,closed_at=CASE WHEN k='close' THEN entry.created_at END WHERE office_id=p_office_id AND id=s.id RETURNING * INTO s;
 PERFORM private.emit_business_event(p_office_id,CASE k WHEN 'receive' THEN 'cash.payment_received' WHEN 'refund' THEN 'cash.payment_refunded' WHEN 'reverse' THEN 'cash.payment_reversed' WHEN 'reconcile' THEN 'cash.reconciliation_recorded' ELSE 'cash.session_closed' END,'cash_session',s.id,key,jsonb_strip_nulls(jsonb_build_object('entry_id',entry.id,'charge_id',c.id,'request_id',r.id,'amount_cents',entry.amount_cents,'counted_cents',entry.counted_cents,'expected_cents',entry.expected_cents,'version',s.version)));
 IF k IN('receive','refund','reverse') THEN
  INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
  SELECT p_office_id,r.id,recipient.id,CASE k WHEN 'receive' THEN 'payment_received' WHEN 'refund' THEN 'payment_refunded' ELSE 'payment_reversed' END,entry.id FROM public.memberships recipient WHERE recipient.office_id=p_office_id AND recipient.role_code='client' AND recipient.active AND private.finance_client_request(r,recipient)
  ON CONFLICT(office_id,recipient_id,kind,event_id) DO NOTHING;
 END IF;
 operation_result:=private.cash_statement_record(s,caller,1);
 UPDATE private.cash_commands SET result=operation_result WHERE office_id=p_office_id AND kind='operate' AND idempotency_key=key;
 PERFORM set_config('jn.cash_command','',true);RETURN operation_result;
END $$;

-- Existing mutation preserved; add only technical/financial facts to its transactional audit.
CREATE OR REPLACE FUNCTION private.charges_create(p_office_id uuid,p_request_id uuid,p_installments jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;c uuid;total bigint;digest text;cmd private.charge_commands;result jsonb;
BEGIN
 m:=private.charges_actor(p_office_id,true,'charges.create');
 IF p_request_id IS NULL OR p_idempotency_key IS NULL OR p_installments IS NULL THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 m:=private.charges_actor(p_office_id,true,'charges.create');
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CHARGES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('request_id',p_request_id,'installments',p_installments)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.charge_commands WHERE office_id=p_office_id AND kind='create' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF cmd.actor_id<>m.user_id OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;
 END IF;
 IF r.status IN('concluido','cancelado') OR EXISTS(SELECT FROM private.charges WHERE office_id=p_office_id AND request_id=r.id) THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT sum((snapshot->>'total_cents')::bigint) INTO total FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id;
 IF total IS NULL THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;
 PERFORM private.charges_plan(p_installments,total);
 INSERT INTO private.charges(office_id,request_id,created_by)VALUES(p_office_id,r.id,m.user_id)RETURNING id INTO c;
 INSERT INTO private.charge_items(office_id,charge_id,request_item_id,snapshot,quantity,unit_price_cents,total_cents)
 SELECT p_office_id,c,id,snapshot,(snapshot->>'quantity')::numeric(12,3),(snapshot->>'unit_price_cents')::bigint,(snapshot->>'total_cents')::bigint FROM public.request_items WHERE office_id=p_office_id AND request_id=r.id;
 INSERT INTO private.charge_events(office_id,charge_id,version,kind,delta_cents,reason,actor_id)VALUES(p_office_id,c,1,'created',total,'Obrigacao dos itens do atendimento',m.user_id);
 INSERT INTO private.charge_installments SELECT p_office_id,c,1,ord::integer,(x->>'due_date')::date,(x->>'amount_cents')::bigint FROM jsonb_array_elements(p_installments) WITH ORDINALITY p(x,ord);
 PERFORM private.emit_business_event(p_office_id,'charges.created','charge',c,p_idempotency_key,jsonb_build_object('request_id',r.id,'due_cents',total,'version',1));
 result:=private.charges_view_record(r,m,1);
 INSERT INTO private.charge_commands(office_id,kind,idempotency_key,actor_id,payload_digest,result)VALUES(p_office_id,'create',p_idempotency_key,m.user_id,digest,result);
 RETURN result;
END $$;

-- Existing mutation preserved; add only technical/financial facts to its transactional audit.
CREATE OR REPLACE FUNCTION private.charges_mutate(p_office_id uuid,p_charge_id uuid,p_expected_version integer,p_mutation jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;c private.charges;a record;delta bigint;amount numeric;kind text;reason text;digest text;cmd private.charge_commands;result jsonb;cap text;
BEGIN
 m:=private.charges_actor(p_office_id,true);
 IF p_charge_id IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 2147483645 OR p_idempotency_key IS NULL OR p_mutation IS NULL OR jsonb_typeof(p_mutation)<>'object' THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 kind:=p_mutation->>'kind';cap:=CASE kind WHEN 'adjust' THEN 'charges.adjust' WHEN 'cancel' THEN 'charges.cancel' ELSE NULL END;
 IF cap IS NULL THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 m:=private.charges_actor(p_office_id,true,cap);
 SELECT * INTO c FROM private.charges WHERE office_id=p_office_id AND id=p_charge_id;
 IF c.id IS NULL THEN RAISE EXCEPTION 'CHARGE_NOT_FOUND' USING ERRCODE='PT404';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=c.request_id FOR UPDATE;
 m:=private.charges_actor(p_office_id,true,cap);
 IF private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF private.request_can_work(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'CHARGES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 reason:=btrim(p_mutation->>'reason');
 IF jsonb_typeof(p_mutation->'reason') IS DISTINCT FROM 'string' OR reason IS NULL OR char_length(reason) NOT BETWEEN 5 AND 500 OR reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 IF kind='adjust' THEN
  IF NOT p_mutation ?& ARRAY['kind','delta_cents','reason','installments'] OR (SELECT count(*) FROM jsonb_object_keys(p_mutation))<>4 OR jsonb_typeof(p_mutation->'delta_cents') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
  amount:=(p_mutation->>'delta_cents')::numeric;
  IF amount<>trunc(amount) OR amount=0 OR amount NOT BETWEEN -1000000000000 AND 1000000000000 THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;delta:=amount::bigint;
  IF NOT private.current_permissions(p_office_id) @> ARRAY[CASE WHEN delta<0 THEN 'services.discount' ELSE 'services.surcharge' END] THEN RAISE EXCEPTION 'CHARGES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE
  IF NOT p_mutation ?& ARRAY['kind','reason'] OR (SELECT count(*) FROM jsonb_object_keys(p_mutation))<>2 THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;
 digest:=encode(extensions.digest(jsonb_build_object('charge_id',p_charge_id,'expected_version',p_expected_version,'mutation',p_mutation)::text,'sha256'),'hex');
 SELECT * INTO cmd FROM private.charge_commands cc WHERE cc.office_id=p_office_id AND cc.kind='mutate' AND cc.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF cmd.actor_id<>m.user_id OR cmd.payload_digest<>digest THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN cmd.result;
 END IF;
 SELECT * INTO a FROM private.charges_amounts(r.office_id,c.id);
 IF a.version<>p_expected_version OR a.cancelled OR r.status='cancelado' THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;
 IF kind='cancel' THEN delta:=-a.due_cents;
 ELSE PERFORM private.charges_plan(p_mutation->'installments',a.due_cents+delta);END IF;
 INSERT INTO private.charge_events(office_id,charge_id,version,kind,delta_cents,reason,actor_id)VALUES(p_office_id,c.id,a.version+1,CASE kind WHEN 'cancel' THEN 'cancelled' ELSE 'adjusted' END,delta,reason,m.user_id);
 IF kind='adjust' THEN
  INSERT INTO private.charge_installments SELECT p_office_id,c.id,a.version+1,ord::integer,(x->>'due_date')::date,(x->>'amount_cents')::bigint FROM jsonb_array_elements(p_mutation->'installments') WITH ORDINALITY p(x,ord);
 END IF;
 PERFORM private.emit_business_event(p_office_id,'charges.'||CASE kind WHEN 'cancel' THEN 'cancelled' ELSE 'adjusted' END,'charge',c.id,p_idempotency_key,jsonb_build_object('request_id',r.id,'delta_cents',delta,'due_cents',a.due_cents+delta,'version',a.version+1));
 result:=private.charges_view_record(r,m,1);
 INSERT INTO private.charge_commands(office_id,kind,idempotency_key,actor_id,payload_digest,result)VALUES(p_office_id,'mutate',p_idempotency_key,m.user_id,digest,result);
 RETURN result;
END $$;
