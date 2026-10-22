-- Etapa14: isolated financial configuration and immutable opening only. No hosted fixtures.
INSERT INTO public.permissions(code,name) VALUES ('cash.read','Consultar meu caixa'),('cash.open','Abrir meu caixa'),('cash.read_all','Consultar consolidacao'),('cash.manage','Gerenciar destinos financeiros') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code LIKE 'cash.%' ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage']);




CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','cash.read','cash.open','cash.read_all','cash.manage','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE TABLE private.cash_units(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 120 AND name=btrim(name) AND name !~ '[[:cntrl:]]'),active boolean NOT NULL,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),UNIQUE(office_id,id)
);
CREATE TABLE private.financial_accounts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,unit_id uuid NOT NULL,name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 120 AND name=btrim(name) AND name !~ '[[:cntrl:]]'),
 type text NOT NULL CHECK(type IN('cash','bank','digital')),active boolean NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),
 UNIQUE(office_id,unit_id,id),FOREIGN KEY(office_id,unit_id) REFERENCES private.cash_units(office_id,id) ON DELETE RESTRICT
);
CREATE TABLE private.payment_methods(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,unit_id uuid NOT NULL,name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 120 AND name=btrim(name) AND name !~ '[[:cntrl:]]'),
 type text NOT NULL CHECK(type IN('cash','pix','card','transfer')),destination_account_id uuid NOT NULL,active boolean NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),
 FOREIGN KEY(office_id,unit_id) REFERENCES private.cash_units(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,unit_id,destination_account_id) REFERENCES private.financial_accounts(office_id,unit_id,id) ON DELETE RESTRICT
);
CREATE TABLE private.cash_commands(
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,kind text NOT NULL CHECK(kind IN('configure','open')),idempotency_key uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,payload_digest text NOT NULL,result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(office_id,kind,idempotency_key)
);
CREATE TABLE private.cash_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,unit_id uuid NOT NULL,cash_account_id uuid NOT NULL,
 operator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,operator_name text NOT NULL,unit_name text NOT NULL,account_name text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN('open','closed')),opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 opening_cents bigint NOT NULL CHECK(opening_cents BETWEEN 0 AND 1000000000000),command_key uuid NOT NULL,
 UNIQUE(office_id,unit_id,id),UNIQUE(office_id,unit_id,id,cash_account_id),
 FOREIGN KEY(office_id,unit_id,cash_account_id) REFERENCES private.financial_accounts(office_id,unit_id,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX cash_sessions_one_open_idx ON private.cash_sessions(office_id,operator_id,unit_id) WHERE status='open';
CREATE INDEX cash_sessions_page_idx ON private.cash_sessions(office_id,opened_at DESC,id DESC);
CREATE INDEX cash_sessions_own_page_idx ON private.cash_sessions(office_id,operator_id,opened_at DESC,id DESC);
CREATE INDEX cash_sessions_account_idx ON private.cash_sessions(office_id,unit_id,cash_account_id);
CREATE INDEX cash_sessions_operator_idx ON private.cash_sessions(operator_id);
CREATE TABLE private.cash_movements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,unit_id uuid NOT NULL,session_id uuid NOT NULL,cash_account_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind='opening'),amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 0 AND 1000000000000),
 applied_cents bigint NOT NULL DEFAULT 0 CHECK(applied_cents=0),actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(office_id,session_id,kind),
 FOREIGN KEY(office_id,unit_id,session_id,cash_account_id) REFERENCES private.cash_sessions(office_id,unit_id,id,cash_account_id) ON DELETE RESTRICT
);
CREATE INDEX cash_movements_session_idx ON private.cash_movements(office_id,unit_id,session_id,cash_account_id);
CREATE INDEX cash_movements_account_idx ON private.cash_movements(office_id,unit_id,cash_account_id);
CREATE INDEX cash_movements_actor_idx ON private.cash_movements(actor_id);
CREATE INDEX financial_accounts_unit_idx ON private.financial_accounts(office_id,unit_id,name,id);
CREATE INDEX payment_methods_unit_idx ON private.payment_methods(office_id,unit_id,name,id);
CREATE INDEX payment_methods_destination_idx ON private.payment_methods(office_id,unit_id,destination_account_id);
CREATE INDEX cash_commands_actor_idx ON private.cash_commands(actor_id);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['cash_units','financial_accounts','payment_methods','cash_commands','cash_sessions','cash_movements'] LOOP
 EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
END LOOP;END $$;
CREATE FUNCTION private.cash_actor(p_office_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid;caps text[];BEGIN
 caller:=private.team_require_identity();
 IF p_write THEN PERFORM 1 FROM public.offices WHERE id=p_office_id FOR UPDATE;ELSE PERFORM 1 FROM public.offices WHERE id=p_office_id FOR SHARE;END IF;
 caller:=private.team_require_identity();
 PERFORM 1 FROM public.memberships WHERE user_id=caller AND office_id=p_office_id AND active AND role_code<>'client' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 caller:=private.team_require_identity();caps:=private.current_permissions(p_office_id);
 IF NOT private.team_user_active(caller,p_office_id) OR NOT caps @> ARRAY['foundation.access','cash.read'] OR (p_capability IS NOT NULL AND NOT caps @> ARRAY[p_capability]) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN caller;
END $$;
CREATE FUNCTION private.cash_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c private.cash_commands;s private.cash_sessions;BEGIN
 SELECT * INTO c FROM private.cash_commands WHERE office_id=NEW.office_id AND kind='open' AND idempotency_key=nullif(current_setting('jn.cash_command',true),'')::uuid AND actor_id=auth.uid() AND result IS NULL;
 IF c.idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF TG_TABLE_NAME='cash_sessions' THEN
  IF NEW.command_key<>c.idempotency_key OR NEW.operator_id<>c.actor_id OR NEW.status<>'open' THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 ELSE
  SELECT * INTO s FROM private.cash_sessions WHERE id=NEW.session_id AND office_id=NEW.office_id AND unit_id=NEW.unit_id;
  IF s.id IS NULL OR s.command_key<>c.idempotency_key OR NEW.actor_id<>s.operator_id OR NEW.amount_cents<>s.opening_cents OR NEW.created_at<>s.opened_at OR NEW.kind<>'opening' OR NEW.applied_cents<>0 THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER cash_sessions_insert_guard BEFORE INSERT ON private.cash_sessions FOR EACH ROW EXECUTE FUNCTION private.cash_insert_guard();
CREATE TRIGGER cash_movements_insert_guard BEFORE INSERT ON private.cash_movements FOR EACH ROW EXECUTE FUNCTION private.cash_insert_guard();
CREATE TRIGGER cash_sessions_immutable BEFORE UPDATE OR DELETE ON private.cash_sessions FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE TRIGGER cash_movements_immutable BEFORE UPDATE OR DELETE ON private.cash_movements FOR EACH ROW EXECUTE FUNCTION private.request_immutable();
CREATE FUNCTION private.cash_command_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF OLD.result IS NOT NULL OR NEW.result IS NULL OR (to_jsonb(NEW)-'result')<>(to_jsonb(OLD)-'result') OR NEW.actor_id IS DISTINCT FROM auth.uid() OR NEW.idempotency_key::text IS DISTINCT FROM current_setting('jn.cash_command',true) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN NEW;
END $$;
CREATE TRIGGER cash_commands_immutable BEFORE UPDATE OR DELETE ON private.cash_commands FOR EACH ROW EXECUTE FUNCTION private.cash_command_guard();
CREATE FUNCTION private.cash_configuration_record(p_office_id uuid,p_unit_id uuid,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'units',coalesce((SELECT jsonb_agg(to_jsonb(x)-'office_id' ORDER BY name,id) FROM(SELECT * FROM private.cash_units WHERE office_id=p_office_id AND(p_unit_id IS NULL OR id=p_unit_id) ORDER BY name,id LIMIT p_page_size OFFSET(p_page-1)*p_page_size)x),'[]'::jsonb),
 'accounts',coalesce((SELECT jsonb_agg(to_jsonb(x)-'office_id' ORDER BY name,id) FROM(SELECT * FROM private.financial_accounts WHERE office_id=p_office_id AND(p_unit_id IS NULL OR unit_id=p_unit_id) ORDER BY name,id LIMIT p_page_size OFFSET(p_page-1)*p_page_size)x),'[]'::jsonb),
 'payment_methods',coalesce((SELECT jsonb_agg(to_jsonb(x)-'office_id' ORDER BY name,id) FROM(SELECT * FROM private.payment_methods WHERE office_id=p_office_id AND(p_unit_id IS NULL OR unit_id=p_unit_id) ORDER BY name,id LIMIT p_page_size OFFSET(p_page-1)*p_page_size)x),'[]'::jsonb),
 'units_total',(SELECT count(*) FROM private.cash_units WHERE office_id=p_office_id AND(p_unit_id IS NULL OR id=p_unit_id)),
 'accounts_total',(SELECT count(*) FROM private.financial_accounts WHERE office_id=p_office_id AND(p_unit_id IS NULL OR unit_id=p_unit_id)),
 'payment_methods_total',(SELECT count(*) FROM private.payment_methods WHERE office_id=p_office_id AND(p_unit_id IS NULL OR unit_id=p_unit_id)),
 'unit_id',p_unit_id,'page',p_page,'page_size',p_page_size);
$$;
CREATE FUNCTION private.cash_configuration(p_office_id uuid,p_unit_id uuid,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 PERFORM private.cash_actor(p_office_id);
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS DISTINCT FROM 50 THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_unit_id IS NOT NULL AND NOT EXISTS(SELECT FROM private.cash_units WHERE office_id=p_office_id AND id=p_unit_id) THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.cash_configuration_record(p_office_id,p_unit_id,p_page,p_page_size);
END $$;
CREATE FUNCTION private.cash_dashboard_record(p_office_id uuid,p_actor uuid,p_scope text,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('scope',p_scope,'page',p_page,'page_size',p_page_size,
 'can_open',private.current_permissions(p_office_id) @> ARRAY['cash.open'],'can_manage',private.current_permissions(p_office_id) @> ARRAY['cash.manage'],'can_read_all',private.current_permissions(p_office_id) @> ARRAY['cash.read_all'],
 'total',(SELECT count(*) FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor)),
 'sessions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'unit_id',s.unit_id,'unit_name',s.unit_name,'cash_account_id',s.cash_account_id,'account_name',s.account_name,'operator_name',s.operator_name,'is_self',s.operator_id=p_actor,'status',s.status,'opened_at',s.opened_at,'opening_cents',s.opening_cents,'numerario_cents',(SELECT coalesce(sum(amount_cents),0) FROM private.cash_movements m WHERE m.office_id=s.office_id AND m.unit_id=s.unit_id AND m.session_id=s.id),'received_cents',0) ORDER BY opened_at DESC,id DESC) FROM(SELECT * FROM private.cash_sessions WHERE office_id=p_office_id AND(p_scope='all' OR operator_id=p_actor) ORDER BY opened_at DESC,id DESC LIMIT p_page_size OFFSET(p_page-1)*p_page_size)s),'[]'::jsonb));
$$;
CREATE FUNCTION private.cash_dashboard(p_office_id uuid,p_scope text,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid;BEGIN
 caller:=private.cash_actor(p_office_id,false,CASE p_scope WHEN 'all' THEN 'cash.read_all' ELSE NULL END);
 IF p_scope IS NULL OR p_scope NOT IN('own','all') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_page_size IS NULL OR p_page_size NOT IN(3,5) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 RETURN private.cash_dashboard_record(p_office_id,caller,p_scope,p_page,p_page_size);
END $$;
CREATE FUNCTION private.cash_configuration_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF NOT EXISTS(SELECT FROM private.cash_commands WHERE office_id=NEW.office_id AND kind='configure' AND actor_id=auth.uid() AND idempotency_key::text=current_setting('jn.cash_command',true) AND result IS NULL) THEN RAISE EXCEPTION 'CASH_FORBIDDEN' USING ERRCODE='PT403';END IF;RETURN NEW;
END $$;
CREATE TRIGGER cash_units_guard BEFORE INSERT OR UPDATE OR DELETE ON private.cash_units FOR EACH ROW EXECUTE FUNCTION private.cash_configuration_guard();
CREATE TRIGGER financial_accounts_guard BEFORE INSERT OR UPDATE OR DELETE ON private.financial_accounts FOR EACH ROW EXECUTE FUNCTION private.cash_configuration_guard();
CREATE TRIGGER payment_methods_guard BEFORE INSERT OR UPDATE OR DELETE ON private.payment_methods FOR EACH ROW EXECUTE FUNCTION private.cash_configuration_guard();
CREATE FUNCTION private.cash_configure(p_office_id uuid,p_configuration jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<cash_configure>>
DECLARE caller uuid;c private.cash_commands;digest text;k text;name text;active boolean;rid uuid;uid uuid;aid uuid;ver integer;oldv integer;resource jsonb;result jsonb;u private.cash_units;a private.financial_accounts;m private.payment_methods;keys text[];BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.manage');
 IF p_configuration IS NULL OR jsonb_typeof(p_configuration)<>'object' OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 k:=p_configuration->>'kind';keys:=ARRAY['kind','id','expected_version','name','active'];
 IF k='account' THEN keys:=keys||ARRAY['unit_id','type'];ELSIF k='payment_method' THEN keys:=keys||ARRAY['unit_id','type','destination_account_id'];ELSIF k IS DISTINCT FROM 'unit' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT p_configuration ?& keys OR (SELECT count(*) FROM jsonb_object_keys(p_configuration))<>cardinality(keys) OR jsonb_typeof(p_configuration->'name')<>'string' OR jsonb_typeof(p_configuration->'active')<>'boolean' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 name:=p_configuration->>'name';active:=(p_configuration->>'active')::boolean;
 IF char_length(name) NOT BETWEEN 2 AND 120 OR name<>btrim(name) OR name ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 BEGIN
 rid:=(p_configuration->>'id')::uuid;ver:=(p_configuration->>'expected_version')::integer;
 IF rid IS NULL THEN IF p_configuration->'id'<>'null'::jsonb OR p_configuration->'expected_version'<>'null'::jsonb THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 ELSIF jsonb_typeof(p_configuration->'id')<>'string' OR jsonb_typeof(p_configuration->'expected_version')<>'number' OR ver IS NULL OR ver NOT BETWEEN 1 AND 2147483645 OR (p_configuration->>'expected_version')::numeric<>ver THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 IF k<>'unit' THEN uid:=(p_configuration->>'unit_id')::uuid;IF uid IS NULL OR jsonb_typeof(p_configuration->'unit_id')<>'string' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 IF k='payment_method' THEN aid:=(p_configuration->>'destination_account_id')::uuid;IF aid IS NULL OR jsonb_typeof(p_configuration->'destination_account_id')<>'string' THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;END IF;
 EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END;
 IF k='account' AND(p_configuration->>'type' IS NULL OR p_configuration->>'type' NOT IN('cash','bank','digital')) OR k='payment_method' AND(p_configuration->>'type' IS NULL OR p_configuration->>'type' NOT IN('cash','pix','card','transfer')) THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(p_configuration::text,'sha256'),'hex');
 SELECT * INTO c FROM private.cash_commands WHERE office_id=p_office_id AND kind='configure' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF c.actor_id<>caller OR c.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN c.result;END IF;
 IF k='unit' AND rid IS NOT NULL THEN SELECT version INTO oldv FROM private.cash_units WHERE office_id=p_office_id AND id=rid FOR UPDATE;
 ELSIF k='account' AND rid IS NOT NULL THEN SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND id=rid FOR UPDATE;oldv:=a.version;
 ELSIF k='payment_method' AND rid IS NOT NULL THEN SELECT * INTO m FROM private.payment_methods WHERE office_id=p_office_id AND id=rid FOR UPDATE;oldv:=m.version;END IF;
 IF rid IS NOT NULL AND oldv IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF rid IS NOT NULL AND oldv<>ver THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k<>'unit' THEN
  SELECT * INTO u FROM private.cash_units WHERE office_id=p_office_id AND id=uid FOR UPDATE;
  IF u.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF active AND NOT u.active THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 IF k='account' AND a.id IS NOT NULL AND (a.unit_id<>uid OR a.type<>p_configuration->>'type') AND (EXISTS(SELECT FROM private.cash_sessions WHERE office_id=p_office_id AND cash_account_id=a.id) OR EXISTS(SELECT FROM private.payment_methods WHERE office_id=p_office_id AND destination_account_id=a.id)) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 IF k='payment_method' THEN
  SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=uid AND id=aid FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
  IF (active AND NOT a.active) OR (p_configuration->>'type'='cash')<>(a.type='cash') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 END IF;
 -- Explicit policy14: no deactivation of a unit/account/method while its unit's affected cash is open.
 IF rid IS NOT NULL AND NOT active AND EXISTS(SELECT FROM private.cash_sessions WHERE office_id=p_office_id AND status='open' AND CASE k WHEN 'unit' THEN unit_id=rid WHEN 'account' THEN cash_account_id=rid ELSE unit_id=m.unit_id END) THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 caller:=private.cash_actor(p_office_id,true,'cash.manage');
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'configure',p_idempotency_key,caller,digest);
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 IF k='unit' THEN
  IF rid IS NULL THEN INSERT INTO private.cash_units(office_id,name,active,version)VALUES(p_office_id,name,active,1)RETURNING to_jsonb(cash_units)-'office_id' INTO resource;
  ELSE UPDATE private.cash_units SET name=cash_configure.name,active=cash_configure.active,version=version+1 WHERE office_id=p_office_id AND id=rid RETURNING to_jsonb(cash_units)-'office_id' INTO resource;END IF;
 ELSIF k='account' THEN
  IF rid IS NULL THEN INSERT INTO private.financial_accounts(office_id,unit_id,name,type,active,version)VALUES(p_office_id,uid,name,p_configuration->>'type',active,1)RETURNING to_jsonb(financial_accounts)-'office_id' INTO resource;
  ELSE UPDATE private.financial_accounts SET unit_id=uid,name=cash_configure.name,type=p_configuration->>'type',active=cash_configure.active,version=version+1 WHERE office_id=p_office_id AND id=rid RETURNING to_jsonb(financial_accounts)-'office_id' INTO resource;END IF;
 ELSE
  IF rid IS NULL THEN INSERT INTO private.payment_methods(office_id,unit_id,name,type,destination_account_id,active,version)VALUES(p_office_id,uid,name,p_configuration->>'type',aid,active,1)RETURNING to_jsonb(payment_methods)-'office_id' INTO resource;
  ELSE UPDATE private.payment_methods SET unit_id=uid,name=cash_configure.name,type=p_configuration->>'type',destination_account_id=aid,active=cash_configure.active,version=version+1 WHERE office_id=p_office_id AND id=rid RETURNING to_jsonb(payment_methods)-'office_id' INTO resource;END IF;
 END IF;
 PERFORM private.emit_business_event(p_office_id,'cash.configured','cash_'||k,(resource->>'id')::uuid,p_idempotency_key,'{}');
 result:=jsonb_build_object('resource',resource,'configuration',private.cash_configuration_record(p_office_id,NULL,1,50));
 UPDATE private.cash_commands SET result=cash_configure.result WHERE office_id=p_office_id AND kind='configure' AND idempotency_key=p_idempotency_key;
 PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;
CREATE FUNCTION private.cash_open(p_office_id uuid,p_unit_id uuid,p_cash_account_id uuid,p_opening_cents bigint,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<cash_open>>
DECLARE caller uuid;c private.cash_commands;digest text;u private.cash_units;a private.financial_accounts;s private.cash_sessions;result jsonb;operator_name text;BEGIN
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF p_unit_id IS NULL OR p_cash_account_id IS NULL OR p_opening_cents IS NULL OR p_opening_cents NOT BETWEEN 0 AND 1000000000000 OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'CASH_VALIDATION' USING ERRCODE='PT422';END IF;
 digest:=encode(extensions.digest(jsonb_build_object('unit_id',p_unit_id,'cash_account_id',p_cash_account_id,'opening_cents',p_opening_cents)::text,'sha256'),'hex');
 SELECT * INTO c FROM private.cash_commands WHERE office_id=p_office_id AND kind='open' AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF c.actor_id<>caller OR c.payload_digest<>digest THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;RETURN c.result;END IF;
 SELECT * INTO u FROM private.cash_units WHERE office_id=p_office_id AND id=p_unit_id FOR UPDATE;
 SELECT * INTO a FROM private.financial_accounts WHERE office_id=p_office_id AND unit_id=p_unit_id AND id=p_cash_account_id FOR UPDATE;
 caller:=private.cash_actor(p_office_id,true,'cash.open');
 IF u.id IS NULL OR a.id IS NULL THEN RAISE EXCEPTION 'CASH_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF NOT u.active OR NOT a.active OR a.type<>'cash' OR EXISTS(SELECT FROM private.cash_sessions WHERE office_id=p_office_id AND unit_id=p_unit_id AND operator_id=caller AND status='open') THEN RAISE EXCEPTION 'CASH_CONFLICT' USING ERRCODE='PT409';END IF;
 SELECT coalesce(private.customer_relation_display_label(display_name),'Operador') INTO operator_name FROM public.profiles WHERE id=caller;
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES(p_office_id,'open',p_idempotency_key,caller,digest);
 PERFORM set_config('jn.cash_command',p_idempotency_key::text,true);
 INSERT INTO private.cash_sessions(office_id,unit_id,cash_account_id,operator_id,operator_name,unit_name,account_name,opening_cents,command_key)VALUES(p_office_id,p_unit_id,p_cash_account_id,caller,operator_name,u.name,a.name,p_opening_cents,p_idempotency_key)RETURNING * INTO s;
 INSERT INTO private.cash_movements(office_id,unit_id,session_id,cash_account_id,kind,amount_cents,actor_id,created_at)VALUES(p_office_id,p_unit_id,s.id,p_cash_account_id,'opening',p_opening_cents,caller,s.opened_at);
 PERFORM private.emit_business_event(p_office_id,'cash.opened','cash_session',s.id,p_idempotency_key,'{}');
 result:=private.cash_dashboard_record(p_office_id,caller,'own',1,5);
 UPDATE private.cash_commands SET result=cash_open.result WHERE office_id=p_office_id AND kind='open' AND idempotency_key=p_idempotency_key;
 PERFORM set_config('jn.cash_command','',true);RETURN result;
END $$;
CREATE FUNCTION public.cash_dashboard(p_office_id uuid,p_scope text,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_dashboard(p_office_id,p_scope,p_page,p_page_size);$$;
CREATE FUNCTION public.cash_configuration(p_office_id uuid,p_unit_id uuid,p_page integer,p_page_size integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_configuration(p_office_id,p_unit_id,p_page,p_page_size);$$;
CREATE FUNCTION public.cash_configure(p_office_id uuid,p_configuration jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_configure(p_office_id,p_configuration,p_idempotency_key);$$;
CREATE FUNCTION public.cash_open(p_office_id uuid,p_unit_id uuid,p_cash_account_id uuid,p_opening_cents bigint,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.cash_open(p_office_id,p_unit_id,p_cash_account_id,p_opening_cents,p_idempotency_key);$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname LIKE 'cash_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.cash_dashboard(uuid,text,integer,integer),private.cash_dashboard(uuid,text,integer,integer),public.cash_configuration(uuid,uuid,integer,integer),private.cash_configuration(uuid,uuid,integer,integer),public.cash_configure(uuid,jsonb,uuid),private.cash_configure(uuid,jsonb,uuid),public.cash_open(uuid,uuid,uuid,bigint,uuid),private.cash_open(uuid,uuid,uuid,bigint,uuid) TO authenticated;
