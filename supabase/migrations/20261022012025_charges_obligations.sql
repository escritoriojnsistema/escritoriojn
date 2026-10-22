-- Etapa13: obligations only. No payment, receipt or cash movement is created.
INSERT INTO public.permissions(code,name) VALUES
 ('charges.read','Consultar cobrancas'),('charges.create','Criar cobrancas'),('charges.adjust','Ajustar obrigacoes com motivo'),('charges.cancel','Cancelar obrigacoes com motivo') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions WHERE code LIKE 'charges.%' ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel']);




CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','charges.read','charges.create','charges.adjust','charges.cancel','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE TABLE private.charges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,request_id uuid NOT NULL,
 currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),rounding_policy text NOT NULL DEFAULT 'snapshot09_10_half_up' CHECK(rounding_policy='snapshot09_10_half_up'),
 created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,id),UNIQUE(office_id,request_id),FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
-- request_items has an immutable globally unique id; office/request association is
-- captured from the server-selected row, never provided by the caller.
CREATE TABLE private.charge_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,charge_id uuid NOT NULL,
 request_item_id uuid NOT NULL UNIQUE REFERENCES public.request_items(id) ON DELETE RESTRICT,
 snapshot jsonb NOT NULL,quantity numeric(12,3) NOT NULL CHECK(quantity>0),
 unit_price_cents bigint NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 100000000),
 total_cents bigint NOT NULL CHECK(total_cents BETWEEN 0 AND 1000000000000),
 FOREIGN KEY(office_id,charge_id) REFERENCES private.charges(office_id,id) ON DELETE RESTRICT
);
CREATE TABLE private.charge_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL,charge_id uuid NOT NULL,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 2147483646),kind text NOT NULL CHECK(kind IN('created','adjusted','cancelled')),
 delta_cents bigint NOT NULL CHECK(delta_cents BETWEEN -1000000000000 AND 1000000000000),
 reason text NOT NULL CHECK(char_length(reason) BETWEEN 5 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(office_id,charge_id,version),FOREIGN KEY(office_id,charge_id) REFERENCES private.charges(office_id,id) ON DELETE RESTRICT
);
CREATE TABLE private.charge_installments (
 office_id uuid NOT NULL,charge_id uuid NOT NULL,version integer NOT NULL,number integer NOT NULL CHECK(number BETWEEN 1 AND 12),
 due_date date NOT NULL,amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 0 AND 1000000000000),
 PRIMARY KEY(office_id,charge_id,version,number),
 FOREIGN KEY(office_id,charge_id,version) REFERENCES private.charge_events(office_id,charge_id,version) ON DELETE RESTRICT
);
CREATE TABLE private.charge_commands (
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,kind text NOT NULL CHECK(kind IN('create','mutate')),
 idempotency_key uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 payload_digest text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(office_id,kind,idempotency_key)
);
CREATE INDEX charge_items_charge_idx ON private.charge_items(office_id,charge_id);
CREATE INDEX charges_creator_idx ON private.charges(created_by);
CREATE INDEX charge_events_actor_idx ON private.charge_events(actor_id);
CREATE INDEX charge_commands_actor_idx ON private.charge_commands(actor_id);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['charges','charge_items','charge_events','charge_installments','charge_commands'] LOOP
  EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.request_immutable()',t||'_immutable',t);
 END LOOP;
END $$;

CREATE FUNCTION private.charges_actor(p_office_id uuid,p_write boolean DEFAULT false,p_capability text DEFAULT NULL) RETURNS public.memberships
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships;caps text[];
BEGIN
 m:=private.requests_actor(p_office_id,p_write);caps:=private.current_permissions(p_office_id);
 IF m.role_code='client' OR NOT caps @> ARRAY['charges.read'] OR (p_capability IS NOT NULL AND NOT caps @> ARRAY[p_capability]) THEN
  RAISE EXCEPTION 'CHARGES_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN m;
END $$;
CREATE FUNCTION private.charges_plan(p_plan jsonb,p_total bigint) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE x jsonb;d date;previous_date date;total numeric:=0;n numeric;
BEGIN
 IF p_plan IS NULL OR jsonb_typeof(p_plan)<>'array' OR jsonb_array_length(p_plan) NOT BETWEEN 1 AND 12 OR p_total IS NULL OR p_total NOT BETWEEN 0 AND 1000000000000 THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_plan) LOOP
  IF jsonb_typeof(x)<>'object' OR NOT x ?& ARRAY['due_date','amount_cents'] OR (SELECT count(*) FROM jsonb_object_keys(x))<>2
   OR jsonb_typeof(x->'due_date')<>'string' OR (x->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR jsonb_typeof(x->'amount_cents')<>'number' THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
  BEGIN d:=(x->>'due_date')::date;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END;
  n:=(x->>'amount_cents')::numeric;
  IF to_char(d,'YYYY-MM-DD')<>x->>'due_date' OR d<date '0001-01-01' OR n<>trunc(n) OR n<0 OR n>1000000000000
   OR (p_total>0 AND n=0) OR (p_total=0 AND (n<>0 OR jsonb_array_length(p_plan)<>1)) OR (previous_date IS NOT NULL AND d<=previous_date) THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
  total:=total+n;previous_date:=d;
 END LOOP;
 IF total<>p_total THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
END $$;
CREATE FUNCTION private.charges_items(p_office_id uuid,p_request_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('request_item_id',i.id,'name',i.snapshot->'definition'->>'name',
  'quantity',((i.snapshot->>'quantity')::numeric(12,3))::text,'unit_price_cents',(i.snapshot->>'unit_price_cents')::bigint,
  'total_cents',(i.snapshot->>'total_cents')::bigint,'adjustment',i.snapshot->'adjustment') ORDER BY i.created_at,i.id),'[]'::jsonb)
 FROM public.request_items i WHERE i.office_id=p_office_id AND i.request_id=p_request_id;
$$;
-- Allocation seam: Etapa13 exposes no write path and records no fictitious money.
-- Payment module must replace this helper with confirmed allocations net of reversals.
CREATE FUNCTION private.charges_amounts(p_office_id uuid,p_charge_id uuid) RETURNS TABLE(original_cents bigint,due_cents bigint,allocated_cents bigint,balance_cents bigint,version integer,cancelled boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (SELECT sum(i.total_cents)::bigint FROM private.charge_items i WHERE i.office_id=p_office_id AND i.charge_id=p_charge_id),
  sum(e.delta_cents)::bigint,0::bigint,sum(e.delta_cents)::bigint,max(e.version),bool_or(e.kind='cancelled')
 FROM private.charge_events e WHERE e.office_id=p_office_id AND e.charge_id=p_charge_id;
$$;
CREATE FUNCTION private.charges_view_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c private.charges;a record;caps text[]:=private.current_permissions(r.office_id);can_work boolean:=private.request_can_work(r,m);charge jsonb:=NULL;
BEGIN
 SELECT * INTO c FROM private.charges WHERE office_id=r.office_id AND request_id=r.id;
 IF c.id IS NOT NULL THEN
  SELECT * INTO a FROM private.charges_amounts(r.office_id,c.id);
  charge:=jsonb_build_object('id',c.id,'version',a.version,'currency',c.currency,'status',CASE WHEN a.cancelled THEN 'cancelada' WHEN a.due_cents=0 THEN 'sem_valor' ELSE 'aberta' END,
   'original_cents',a.original_cents,'due_cents',a.due_cents,'allocated_cents',a.allocated_cents,'balance_cents',a.balance_cents,
   'can_adjust',can_work AND r.status<>'cancelado' AND NOT a.cancelled AND caps @> ARRAY['charges.adjust'],
   'can_discount',can_work AND r.status<>'cancelado' AND NOT a.cancelled AND caps @> ARRAY['charges.adjust','services.discount'],
   'can_surcharge',can_work AND r.status<>'cancelado' AND NOT a.cancelled AND caps @> ARRAY['charges.adjust','services.surcharge'],
   'can_cancel',can_work AND r.status<>'cancelado' AND NOT a.cancelled AND caps @> ARRAY['charges.cancel'],
   'installments',coalesce((SELECT jsonb_agg(jsonb_build_object('number',i.number,'due_date',to_char(i.due_date,'YYYY-MM-DD'),'amount_cents',i.amount_cents) ORDER BY i.number) FROM private.charge_installments i WHERE i.office_id=r.office_id AND i.charge_id=c.id AND i.version=a.version),'[]'::jsonb),
   'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'version',e.version,'delta_cents',e.delta_cents,'reason',e.reason,'actor_name',(SELECT private.customer_relation_display_label(p.display_name) FROM public.profiles p WHERE p.id=e.actor_id),'created_at',e.created_at) ORDER BY e.version DESC) FROM (SELECT * FROM private.charge_events WHERE office_id=r.office_id AND charge_id=c.id ORDER BY version DESC LIMIT 5 OFFSET(p_page-1)*5)e),'[]'::jsonb),
   'history_page',p_page,'history_total',a.version);
 END IF;
 RETURN jsonb_build_object('request_id',r.id,'protocol',r.protocol,'closed',r.status IN('concluido','cancelado'),'following_only',NOT can_work,
  'can_create',can_work AND r.status NOT IN('concluido','cancelado') AND c.id IS NULL AND caps @> ARRAY['charges.create'] AND EXISTS(SELECT FROM public.request_items WHERE office_id=r.office_id AND request_id=r.id),
  'items',private.charges_items(r.office_id,r.id),'charge',charge);
END $$;
CREATE FUNCTION private.charges_view(p_office_id uuid,p_request_id uuid,p_history_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;
BEGIN
 m:=private.charges_actor(p_office_id);
 IF p_request_id IS NULL OR p_history_page IS NULL OR p_history_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'CHARGE_VALIDATION' USING ERRCODE='PT422';END IF;
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR SHARE;
 m:=private.charges_actor(p_office_id);
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 RETURN private.charges_view_record(r,m,p_history_page);
END $$;
CREATE FUNCTION private.charges_create(p_office_id uuid,p_request_id uuid,p_installments jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 PERFORM private.emit_business_event(p_office_id,'charges.created','charge',c,p_idempotency_key,'{}');
 result:=private.charges_view_record(r,m,1);
 INSERT INTO private.charge_commands(office_id,kind,idempotency_key,actor_id,payload_digest,result)VALUES(p_office_id,'create',p_idempotency_key,m.user_id,digest,result);
 RETURN result;
END $$;
CREATE FUNCTION private.charges_mutate(p_office_id uuid,p_charge_id uuid,p_expected_version integer,p_mutation jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
 PERFORM private.emit_business_event(p_office_id,'charges.'||CASE kind WHEN 'cancel' THEN 'cancelled' ELSE 'adjusted' END,'charge',c.id,p_idempotency_key,'{}');
 result:=private.charges_view_record(r,m,1);
 INSERT INTO private.charge_commands(office_id,kind,idempotency_key,actor_id,payload_digest,result)VALUES(p_office_id,'mutate',p_idempotency_key,m.user_id,digest,result);
 RETURN result;
END $$;
-- Same request row lock used by create/mutate/transfer; never silently cancel a debt.
CREATE FUNCTION private.charges_request_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.status='cancelado' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(
  SELECT FROM private.charges c CROSS JOIN LATERAL private.charges_amounts(NEW.office_id,c.id) a WHERE c.office_id=NEW.office_id AND c.request_id=NEW.id AND a.due_cents>0
 ) THEN RAISE EXCEPTION 'CHARGE_CONFLICT' USING ERRCODE='PT409';END IF;RETURN NEW;
END $$;
CREATE TRIGGER charges_request_cancel_guard BEFORE UPDATE OF status ON public.requests FOR EACH ROW EXECUTE FUNCTION private.charges_request_cancel_guard();
CREATE FUNCTION public.charges_view(p_office_id uuid,p_request_id uuid,p_history_page integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.charges_view(p_office_id,p_request_id,p_history_page);$$;
CREATE FUNCTION public.charges_create(p_office_id uuid,p_request_id uuid,p_installments jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.charges_create(p_office_id,p_request_id,p_installments,p_idempotency_key);$$;
CREATE FUNCTION public.charges_mutate(p_office_id uuid,p_charge_id uuid,p_expected_version integer,p_mutation jsonb,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.charges_mutate(p_office_id,p_charge_id,p_expected_version,p_mutation,p_idempotency_key);$$;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public') AND p.proname LIKE 'charges_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.charges_view(uuid,uuid,integer),private.charges_view(uuid,uuid,integer),public.charges_create(uuid,uuid,jsonb,uuid),private.charges_create(uuid,uuid,jsonb,uuid),public.charges_mutate(uuid,uuid,integer,jsonb,uuid),private.charges_mutate(uuid,uuid,integer,jsonb,uuid) TO authenticated;
