-- Etapa08. Additive private relations; no Auth accounts or existing records rewritten.
-- No existing identity, membership, grant or customer data is rewritten.
INSERT INTO public.permissions(code,name) VALUES
 ('customers.relate','Relacionar clientes'),('customers.verify','Conferir identidade'),('customers.merge','Mesclar clientes') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) SELECT 'owner',code FROM public.permissions
 WHERE code IN ('customers.relate','customers.verify','customers.merge') ON CONFLICT DO NOTHING;
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge']);

CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

ALTER TABLE public.customers ADD COLUMN merged_into_id uuid, ADD COLUMN blocked_at timestamptz,
 ADD CONSTRAINT customers_merge_target_fk FOREIGN KEY(office_id,merged_into_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT customers_not_self_merged CHECK (merged_into_id IS DISTINCT FROM id);
CREATE INDEX customers_merge_target_idx ON public.customers(office_id,merged_into_id) WHERE merged_into_id IS NOT NULL;
DROP INDEX public.customers_office_kind_identifier_idx;
CREATE UNIQUE INDEX customers_office_kind_identifier_idx ON public.customers(office_id,kind,identifier)
 WHERE identifier IS NOT NULL AND merged_into_id IS NULL AND blocked_at IS NULL;
CREATE TABLE private.customer_relations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL,
 customer_id uuid NOT NULL, relation_type text NOT NULL CHECK (relation_type IN ('assignment','representation','identity')),
 membership_id uuid, representative_customer_id uuid,
 representation_kind text CHECK (representation_kind IN ('proxy','representative','guardian')),
 evidence text CHECK (evidence IS NULL OR (evidence=btrim(evidence) AND char_length(evidence) BETWEEN 1 AND 500 AND evidence !~ '[[:cntrl:]]')),
 valid_from timestamptz NOT NULL DEFAULT clock_timestamp(), valid_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 revoked_at timestamptz, revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,membership_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,representative_customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 CHECK (representative_customer_id IS DISTINCT FROM customer_id),
 CHECK (isfinite(valid_from) AND (valid_until IS NULL OR (isfinite(valid_until) AND valid_until>valid_from))),
 CHECK ((revoked_at IS NULL)=(revoked_by IS NULL)),
 CHECK ((relation_type='assignment' AND membership_id IS NOT NULL AND representative_customer_id IS NULL AND representation_kind IS NULL AND evidence IS NULL)
  OR (relation_type='representation' AND membership_id IS NULL AND representative_customer_id IS NOT NULL AND representation_kind IS NOT NULL AND evidence IS NOT NULL)
  OR (relation_type='identity' AND membership_id IS NOT NULL AND representative_customer_id IS NULL AND representation_kind IS NULL AND evidence IS NOT NULL AND valid_until IS NULL))
);
CREATE INDEX customer_relations_scope_idx ON private.customer_relations(office_id,customer_id,relation_type,created_at DESC);
CREATE INDEX customer_relations_member_idx ON private.customer_relations(office_id,membership_id,customer_id) WHERE revoked_at IS NULL;
CREATE INDEX customer_relations_representative_idx ON private.customer_relations(office_id,representative_customer_id);
CREATE INDEX customer_relations_created_by_idx ON private.customer_relations(created_by);
CREATE INDEX customer_relations_revoked_by_idx ON private.customer_relations(revoked_by);
CREATE UNIQUE INDEX customer_relations_identity_customer_idx ON private.customer_relations(customer_id) WHERE relation_type='identity' AND revoked_at IS NULL;
CREATE UNIQUE INDEX customer_relations_identity_member_idx ON private.customer_relations(membership_id) WHERE relation_type='identity' AND revoked_at IS NULL;
CREATE UNIQUE INDEX customer_relations_assignment_idx ON private.customer_relations(customer_id,membership_id) WHERE relation_type='assignment' AND revoked_at IS NULL;
CREATE UNIQUE INDEX customer_relations_representation_idx ON private.customer_relations(customer_id,representative_customer_id,representation_kind) WHERE relation_type='representation' AND revoked_at IS NULL;
CREATE TABLE private.customer_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL, customer_id uuid NOT NULL,
 version integer NOT NULL CHECK(version>=1), data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(office_id,customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 UNIQUE(office_id,id)
);
CREATE INDEX customer_snapshots_customer_idx ON private.customer_snapshots(office_id,customer_id);
CREATE TABLE private.customer_merges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), office_id uuid NOT NULL, source_id uuid NOT NULL UNIQUE, target_id uuid NOT NULL,
 source_snapshot_id uuid NOT NULL, target_snapshot_id uuid NOT NULL, result_snapshot_id uuid NOT NULL,
 evidence text NOT NULL CHECK(evidence=btrim(evidence) AND char_length(evidence) BETWEEN 1 AND 500 AND evidence !~ '[[:cntrl:]]'),
 actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT, request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), CHECK(source_id<>target_id),
 FOREIGN KEY(office_id,source_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,target_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,source_snapshot_id) REFERENCES private.customer_snapshots(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,target_snapshot_id) REFERENCES private.customer_snapshots(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(office_id,result_snapshot_id) REFERENCES private.customer_snapshots(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX customer_merges_target_idx ON private.customer_merges(office_id,target_id,created_at DESC);
CREATE INDEX customer_merges_source_snapshot_idx ON private.customer_merges(office_id,source_snapshot_id);
CREATE INDEX customer_merges_target_snapshot_idx ON private.customer_merges(office_id,target_snapshot_id);
CREATE INDEX customer_merges_result_snapshot_idx ON private.customer_merges(office_id,result_snapshot_id);
CREATE INDEX customer_merges_actor_idx ON private.customer_merges(actor_id);
ALTER TABLE private.customer_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.customer_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.customer_merges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.customer_relations,private.customer_snapshots,private.customer_merges FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.customer_history_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'CUSTOMER_HISTORY_IMMUTABLE' USING ERRCODE='PT403'; END $$;
CREATE TRIGGER customer_snapshots_immutable BEFORE UPDATE OR DELETE ON private.customer_snapshots FOR EACH ROW EXECUTE FUNCTION private.customer_history_immutable();
CREATE TRIGGER customer_merges_immutable BEFORE UPDATE OR DELETE ON private.customer_merges FOR EACH ROW EXECUTE FUNCTION private.customer_history_immutable();

-- NO KEY UPDATE serializes all customer writes and is compatible with signup FK KEY SHARE.
CREATE OR REPLACE FUNCTION private.customers_actor(p_office_id uuid,p_write text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caller uuid; member_id uuid; capabilities text[]; member_role text;
BEGIN
 caller:=private.team_require_identity();
 IF p_write IS NULL THEN PERFORM 1 FROM public.offices WHERE id=p_office_id FOR SHARE;
 ELSE PERFORM 1 FROM public.offices WHERE id=p_office_id FOR NO KEY UPDATE; END IF;
 caller:=private.team_require_identity();
 SELECT id,role_code INTO member_id,member_role FROM public.memberships WHERE office_id=p_office_id AND user_id=caller AND active AND role_code<>'client' FOR SHARE;
 caller:=private.team_require_identity(); capabilities:=private.current_permissions(p_office_id);
 IF member_id IS NULL OR NOT (capabilities @> ARRAY['foundation.access','customers.read'])
  OR (p_write IS NOT NULL AND (p_write NOT IN ('customers.create','customers.update','customers.relate','customers.verify','customers.merge') OR NOT capabilities @> ARRAY[p_write]))
  OR (p_write='customers.merge' AND member_role NOT IN ('owner','admin')) THEN
  RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 RETURN caller;
END $$;
CREATE FUNCTION private.customer_in_scope(p_customer public.customers,p_caller uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p_customer.merged_into_id IS NULL AND p_customer.blocked_at IS NULL AND
 (p_customer.created_by=p_caller OR private.current_permissions(p_customer.office_id) @> ARRAY['customers.read_all'] OR EXISTS(
  SELECT FROM private.customer_relations r JOIN public.memberships m ON m.id=r.membership_id AND m.office_id=r.office_id
  WHERE r.office_id=p_customer.office_id AND r.customer_id=p_customer.id AND r.relation_type='assignment'
   AND r.revoked_at IS NULL AND r.valid_from<=clock_timestamp() AND (r.valid_until IS NULL OR r.valid_until>clock_timestamp())
   AND m.user_id=p_caller AND m.active AND m.role_code<>'client'));
$$;
CREATE FUNCTION private.customer_relation_member_active(p_office_id uuid,p_member_id uuid,p_client boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.memberships m WHERE m.office_id=p_office_id AND m.id=p_member_id AND m.active
  AND (CASE WHEN p_client THEN m.role_code='client' ELSE m.role_code IN ('owner','admin','employee') END)
  AND private.team_user_active(m.user_id,m.office_id));
$$;
CREATE FUNCTION private.customer_relation_status(p_relation private.customer_relations) RETURNS text
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$
 SELECT CASE WHEN p_relation.revoked_at IS NOT NULL THEN 'revoked'
 WHEN NOT EXISTS(SELECT FROM public.customers c WHERE c.id=p_relation.customer_id AND c.office_id=p_relation.office_id AND c.merged_into_id IS NULL AND c.blocked_at IS NULL)
  OR (p_relation.membership_id IS NOT NULL AND NOT private.customer_relation_member_active(p_relation.office_id,p_relation.membership_id,p_relation.relation_type='identity'))
  OR (p_relation.representative_customer_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.customers c WHERE c.id=p_relation.representative_customer_id AND c.office_id=p_relation.office_id AND c.merged_into_id IS NULL AND c.blocked_at IS NULL)) THEN 'unavailable'
 WHEN p_relation.valid_from>clock_timestamp() THEN 'future'
 WHEN p_relation.valid_until<=clock_timestamp() THEN 'expired' ELSE 'active' END;
$$;
CREATE FUNCTION private.customer_intake_resolved(p_registration private.customer_registrations) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM private.customer_relations r JOIN public.customers c ON c.id=r.customer_id AND c.office_id=r.office_id
  WHERE r.office_id=p_registration.office_id AND r.membership_id=p_registration.membership_id AND r.relation_type='identity'
   AND r.revoked_at IS NULL AND c.merged_into_id IS NULL AND c.blocked_at IS NULL
   AND private.customer_relation_member_active(r.office_id,r.membership_id,true));
$$;

-- Preserve the complete latest registration-aware list/detail and CRUD locking.
CREATE OR REPLACE FUNCTION private.customers_page(p_office_id uuid,p_query text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; all_records boolean; result jsonb; query_text text; query_digits text;
BEGIN
 caller:=private.customers_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN (3,5) THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 all_records:=private.current_permissions(p_office_id) @> ARRAY['customers.read_all'];
 query_text:=btrim(p_query);
 IF query_text ~ '^[0-9 ./-]+$' THEN query_digits:=nullif(regexp_replace(query_text,'[^0-9]','','g'),''); END IF;
 WITH candidates AS (
  SELECT c.id,c.name,c.identifier,c.created_at,private.customers_summary(c) AS summary FROM public.customers c
   WHERE c.office_id=p_office_id AND private.customer_in_scope(c,caller)
  UNION ALL
  SELECT r.id,r.name,NULL::text,r.created_at,private.customer_registration_summary(r) FROM private.customer_registrations r
   WHERE r.office_id=p_office_id AND all_records AND r.materialized_customer_id IS NULL AND private.customer_registration_active(r) AND NOT private.customer_intake_resolved(r)
 ), filtered AS (
  SELECT * FROM candidates WHERE query_text='' OR strpos(lower(name),lower(query_text))>0
   OR (query_digits IS NOT NULL AND strpos(identifier,query_digits)>0)
 ) SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'page',p_page,'page_size',p_size,
  'items',coalesce((SELECT jsonb_agg(page.summary ORDER BY page.created_at DESC,page.id DESC)
   FROM (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size) page),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION private.customer_detail(p_office_id uuid,p_customer_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; customer public.customers; intake private.customer_registrations; capabilities text[];
BEGIN
 caller:=private.customers_actor(p_office_id); capabilities:=private.current_permissions(p_office_id);
 SELECT * INTO customer FROM public.customers c WHERE c.office_id=p_office_id AND c.id=p_customer_id
  AND private.customer_in_scope(c,caller);
 IF customer.id IS NOT NULL THEN RETURN private.customers_detail_record(customer,capabilities @> ARRAY['customers.update']); END IF;
 IF capabilities @> ARRAY['customers.read_all'] THEN
  SELECT * INTO intake FROM private.customer_registrations r WHERE r.office_id=p_office_id AND r.id=p_customer_id
   AND r.materialized_customer_id IS NULL AND private.customer_registration_active(r) AND NOT private.customer_intake_resolved(r);
  IF intake.id IS NOT NULL THEN
   RETURN private.customer_registration_summary(intake)||jsonb_build_object('identifier',NULL,'version',1,'can_update',false,'materialized',false,
    'contacts',jsonb_build_array(jsonb_build_object('kind','email','value',intake.email)));
  END IF;
 END IF;
 RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404';
END $$;


CREATE OR REPLACE FUNCTION private.customer_update(p_office_id uuid,p_customer_id uuid,p_customer jsonb,p_version integer,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; normalized jsonb; customer public.customers; capabilities text[]; violated_constraint text;
BEGIN
 caller:=private.customers_actor(p_office_id,'customers.update'); capabilities:=private.current_permissions(p_office_id);
 IF p_request_id IS NULL OR p_version IS NULL OR p_version NOT BETWEEN 1 AND 2147483646 THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 SELECT * INTO customer FROM public.customers c WHERE c.office_id=p_office_id AND c.id=p_customer_id
  AND private.customer_in_scope(c,caller) FOR UPDATE;
 IF customer.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 caller:=private.customers_actor(p_office_id,'customers.update');
 IF NOT private.customer_in_scope(customer,caller) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF customer.version<>p_version THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409'; END IF;
 normalized:=private.customers_normalize_input(p_customer);
 UPDATE public.customers SET kind=normalized->>'kind',name=normalized->>'name',identifier=normalized->>'identifier',version=version+1,updated_at=clock_timestamp()
  WHERE id=customer.id AND office_id=p_office_id RETURNING * INTO customer;
 DELETE FROM public.customer_contacts WHERE office_id=p_office_id AND customer_id=customer.id;
 INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value)
  SELECT p_office_id,customer.id,(ordinality-1)::smallint,value->>'kind',value->>'value' FROM jsonb_array_elements(normalized->'contacts') WITH ORDINALITY;
 PERFORM private.emit_business_event(p_office_id,'customers.updated','customer',customer.id,p_request_id,'{}');
 RETURN private.customers_detail_record(customer,true);
EXCEPTION WHEN unique_violation THEN
 GET STACKED DIAGNOSTICS violated_constraint=CONSTRAINT_NAME;
 IF violated_constraint='customers_office_kind_identifier_idx' THEN RAISE EXCEPTION 'CUSTOMER_DUPLICATE' USING ERRCODE='PT409'; END IF;
 RAISE;
END $$;

-- Presentation only: legacy profiles may be NULL or contain Unicode whitespace/C0/C1.
-- Spell out the character set so normalization does not depend on database locale.
CREATE FUNCTION private.customer_relation_display_label(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(nullif(left(btrim(regexp_replace(p_name,
  U&'[\0001-\0020\007F-\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',' ','g')),120),''),'Nome não informado');
$$;
CREATE FUNCTION private.customer_relations_state(p_office_id uuid,p_customer_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; c public.customers; caps text[]; a jsonb; r jsonb; i jsonb; h jsonb; counts jsonb;
BEGIN
 caller:=private.customers_actor(p_office_id); caps:=private.current_permissions(p_office_id);
 SELECT * INTO c FROM public.customers x WHERE x.office_id=p_office_id AND x.id=p_customer_id AND private.customer_in_scope(x,caller);
 IF c.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 WITH rows AS (SELECT x.*,private.customer_relation_status(x) AS status,
   CASE WHEN x.relation_type IN ('assignment','identity') THEN private.customer_relation_display_label(p.display_name)
    ELSE coalesce(rc.name,'Cadastro indisponível') END AS name,
   row_number() OVER(PARTITION BY x.relation_type ORDER BY (x.revoked_at IS NULL) DESC,x.created_at DESC,x.id) AS n
  FROM private.customer_relations x LEFT JOIN public.memberships m ON m.id=x.membership_id AND m.office_id=x.office_id
  LEFT JOIN public.profiles p ON p.id=m.user_id LEFT JOIN public.customers rc ON rc.id=x.representative_customer_id AND rc.office_id=x.office_id
  WHERE x.office_id=p_office_id AND x.customer_id=p_customer_id), dto AS (
  SELECT relation_type,n,jsonb_build_object('id',id,'version',version,'created_at',created_at,'created_by',created_by,
   'revoked_at',revoked_at,'revoked_by',revoked_by,'name',name,'status',CASE WHEN relation_type='identity' AND status='active' THEN 'verified' ELSE status END)
   || CASE relation_type WHEN 'assignment' THEN jsonb_build_object('membership_id',membership_id,'valid_from',valid_from,'valid_until',valid_until)
   WHEN 'representation' THEN jsonb_build_object('representative_customer_id',representative_customer_id,'kind',representation_kind,
    'evidence',evidence,'valid_from',valid_from,'valid_until',valid_until,'authorization_status',CASE WHEN status='active' THEN 'valid' ELSE 'invalid' END,
    'grants_customer_access',false,'portal_enabled',false)
   ELSE jsonb_build_object('membership_id',membership_id,'evidence',evidence,'portal_enabled',false) END AS value FROM rows)
 SELECT coalesce(jsonb_agg(value ORDER BY n) FILTER(WHERE relation_type='assignment' AND n<=50),'[]'),
  coalesce(jsonb_agg(value ORDER BY n) FILTER(WHERE relation_type='representation' AND n<=50),'[]'),
  coalesce(jsonb_agg(value ORDER BY n) FILTER(WHERE relation_type='identity' AND n<=50),'[]'),
  jsonb_build_object('assignments',count(*) FILTER(WHERE relation_type='assignment')>50,
   'representations',count(*) FILTER(WHERE relation_type='representation')>50,'identities',count(*) FILTER(WHERE relation_type='identity')>50)
 INTO a,r,i,counts FROM dto;
 SELECT coalesce(jsonb_agg(value ORDER BY created_at DESC,id),'[]') INTO h FROM (
  SELECT x.id,x.created_at,jsonb_build_object('id',x.id,'source_id',x.source_id,'target_id',x.target_id,
   'source_snapshot_id',x.source_snapshot_id,'target_snapshot_id',x.target_snapshot_id,'result_snapshot_id',x.result_snapshot_id,
   'created_at',x.created_at,'actor_id',x.actor_id) AS value FROM private.customer_merges x
  WHERE x.office_id=p_office_id AND x.target_id=p_customer_id ORDER BY x.created_at DESC,x.id LIMIT 50) bounded;
 RETURN jsonb_build_object('customer',private.customers_summary(c)||jsonb_build_object('version',c.version),
  'capabilities',jsonb_build_object('can_relate',caps @> ARRAY['customers.relate'],'can_verify',caps @> ARRAY['customers.verify'],
   'can_merge',caps @> ARRAY['customers.merge'] AND EXISTS(SELECT FROM public.memberships m WHERE m.office_id=p_office_id AND m.user_id=caller AND m.active AND m.role_code IN ('owner','admin'))),
  'assignments',a,'representations',r,'identities',i,'merges',h,
  'truncated',counts||jsonb_build_object('merges',(SELECT count(*)>50 FROM private.customer_merges x WHERE x.office_id=p_office_id AND x.target_id=p_customer_id)),
  'portal_enabled',false,'access_lost',false);
END $$;
CREATE FUNCTION private.customer_relation_candidates(p_office_id uuid,p_kind text,p_query text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; caps text[]; result jsonb; query_text text;
BEGIN
 caller:=private.customers_actor(p_office_id); caps:=private.current_permissions(p_office_id);
 IF p_kind IS NULL OR p_kind NOT IN ('team','client','customers') OR p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF (p_kind='team' AND NOT caps @> ARRAY['customers.relate']) OR (p_kind='client' AND NOT caps @> ARRAY['customers.verify'])
  OR (p_kind='customers' AND NOT (caps && ARRAY['customers.relate','customers.merge'])) THEN RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 query_text:=lower(btrim(p_query));
 IF p_kind='customers' THEN
  SELECT coalesce(jsonb_agg(value ORDER BY name,id),'[]') INTO result FROM (
   SELECT c.id,c.name,jsonb_build_object('id',c.id,'name',c.name,'kind',c.kind,'identifier_masked',private.customers_summary(c)->'identifier_masked','contact_masked',NULL) AS value
   FROM public.customers c WHERE c.office_id=p_office_id AND private.customer_in_scope(c,caller)
    AND (query_text='' OR strpos(lower(c.name),query_text)>0 OR strpos(c.identifier,query_text)>0)
   ORDER BY c.name,c.id LIMIT 20) bounded;
 ELSE
  SELECT coalesce(jsonb_agg(value ORDER BY name,id),'[]') INTO result FROM (
   SELECT m.id,private.customer_relation_display_label(p.display_name) AS name,jsonb_build_object('id',m.id,'name',private.customer_relation_display_label(p.display_name),'kind',m.role_code,
    'contact_masked',CASE WHEN u.email IS NULL THEN NULL ELSE left(u.email,1)||'***@***' END,'identifier_masked',NULL) AS value
   FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id JOIN auth.users u ON u.id=m.user_id
   WHERE m.office_id=p_office_id AND private.customer_relation_member_active(p_office_id,m.id,p_kind='client')
    AND (query_text='' OR strpos(lower(p.display_name),query_text)>0 OR strpos(lower(u.email),query_text)>0)
   ORDER BY p.display_name,m.id LIMIT 20) bounded;
 END IF;
 RETURN jsonb_build_object('kind',p_kind,'items',result,'limit',20);
END $$;
-- Validation helpers are not executable by application roles.
CREATE FUNCTION private.customer_relation_payload(p_payload jsonb,p_keys text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NOT p_payload ?& p_keys
  OR EXISTS(SELECT FROM jsonb_object_keys(p_payload) k WHERE NOT k=ANY(p_keys)) THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
END $$;
CREATE FUNCTION private.customer_relation_uuid(p_value jsonb) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR p_value#>>'{}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 RETURN (p_value#>>'{}')::uuid;
END $$;
CREATE FUNCTION private.customer_relation_time(p_value jsonb,p_nullable boolean) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result timestamptz;
BEGIN
 IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR p_value#>>'{}' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 result:=(p_value#>>'{}')::timestamptz;
 IF NOT isfinite(result) THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 RETURN result;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422';
END $$;
CREATE FUNCTION private.customer_relation_evidence(p_value jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE result text;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 result:=btrim(p_value#>>'{}');
 IF char_length(result) NOT BETWEEN 1 AND 500 OR result ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 RETURN result;
END $$;
CREATE FUNCTION private.customer_relation_command(p_office_id uuid,p_customer_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; capability text; v_type text; c public.customers; target public.customers;
 member_id uuid; rep_id uuid; relation_id uuid; evidence text; starts timestamptz; ends timestamptz; previous private.customer_relations; expected_version integer;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('assignment.grant','assignment.revoke','representation.grant','representation.revoke','identity.verify','identity.revoke') OR p_request_id IS NULL THEN
  RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 v_type:=split_part(p_action,'.',1); capability:=CASE WHEN v_type='identity' THEN 'customers.verify' ELSE 'customers.relate' END;
 caller:=private.customers_actor(p_office_id,capability);
 SELECT * INTO c FROM public.customers x WHERE x.office_id=p_office_id AND x.id=p_customer_id AND private.customer_in_scope(x,caller) FOR UPDATE;
 caller:=private.customers_actor(p_office_id,capability);
 IF c.id IS NULL OR NOT private.customer_in_scope(c,caller) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF right(p_action,6)='revoke' THEN
  PERFORM private.customer_relation_payload(p_payload,ARRAY['id','version']); relation_id:=private.customer_relation_uuid(p_payload->'id');
  IF jsonb_typeof(p_payload->'version') IS DISTINCT FROM 'number' OR p_payload->>'version' !~ '^[1-9][0-9]{0,9}$'
   OR (p_payload->>'version')::numeric>2147483646 THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  expected_version:=(p_payload->>'version')::integer;
  SELECT * INTO previous FROM private.customer_relations x WHERE x.id=relation_id AND x.office_id=p_office_id AND x.customer_id=p_customer_id AND x.relation_type=v_type FOR UPDATE;
  IF previous.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  caller:=private.customers_actor(p_office_id,capability);
  IF NOT private.customer_in_scope(c,caller) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF previous.version<>expected_version OR previous.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409'; END IF;
  UPDATE private.customer_relations SET revoked_at=clock_timestamp(),revoked_by=caller,version=version+1 WHERE id=relation_id;
 ELSE
  IF v_type='assignment' THEN
   PERFORM private.customer_relation_payload(p_payload,ARRAY['membership_id','valid_from','valid_until']);
  ELSIF v_type='representation' THEN
   PERFORM private.customer_relation_payload(p_payload,ARRAY['representative_customer_id','kind','evidence','valid_from','valid_until']);
  ELSE PERFORM private.customer_relation_payload(p_payload,ARRAY['membership_id','evidence']); END IF;
  IF v_type IN ('assignment','identity') THEN
   member_id:=private.customer_relation_uuid(p_payload->'membership_id');
   PERFORM 1 FROM public.memberships m WHERE m.office_id=p_office_id AND m.id=member_id FOR SHARE;
   IF NOT private.customer_relation_member_active(p_office_id,member_id,v_type='identity') THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  ELSE
   rep_id:=private.customer_relation_uuid(p_payload->'representative_customer_id');
   SELECT * INTO target FROM public.customers x WHERE x.id=rep_id AND x.office_id=p_office_id AND private.customer_in_scope(x,caller) FOR SHARE;
   IF target.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
   IF rep_id=c.id OR jsonb_typeof(p_payload->'kind') IS DISTINCT FROM 'string' OR p_payload->>'kind' NOT IN ('proxy','representative','guardian') THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  END IF;
  IF v_type<>'assignment' THEN evidence:=private.customer_relation_evidence(p_payload->'evidence'); END IF;
  IF v_type<>'identity' THEN
   starts:=private.customer_relation_time(p_payload->'valid_from',false); ends:=private.customer_relation_time(p_payload->'valid_until',true);
   IF ends IS NOT NULL AND ends<=starts THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  ELSE starts:=clock_timestamp(); END IF;
  IF (SELECT count(*) FROM private.customer_relations x WHERE x.office_id=p_office_id AND x.customer_id=p_customer_id AND x.relation_type=v_type AND x.revoked_at IS NULL)>=20 THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409'; END IF;
  -- After every potentially waiting lock, check session, capabilities, scope and target eligibility again.
  caller:=private.customers_actor(p_office_id,capability);
  IF NOT private.customer_in_scope(c,caller) OR (target.id IS NOT NULL AND NOT private.customer_in_scope(target,caller)) THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
  IF member_id IS NOT NULL AND NOT private.customer_relation_member_active(p_office_id,member_id,v_type='identity') THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
  INSERT INTO private.customer_relations(office_id,customer_id,relation_type,membership_id,representative_customer_id,representation_kind,evidence,valid_from,valid_until,created_by)
   VALUES(p_office_id,p_customer_id,v_type,member_id,rep_id,p_payload->>'kind',evidence,starts,ends,caller) RETURNING id INTO relation_id;
 END IF;
 UPDATE public.customers SET version=version+1,updated_at=clock_timestamp() WHERE id=p_customer_id AND office_id=p_office_id;
 PERFORM private.emit_business_event(p_office_id,'customers.'||replace(p_action,'.','_'),'customer',p_customer_id,p_request_id,jsonb_build_object('relation_id',relation_id));
 -- An actor may revoke their own only assignment. Commit the revocation and return
 -- a redacted terminal state, rather than rolling back because the subsequent read is denied.
 IF NOT private.customer_in_scope(c,caller) THEN
  RETURN jsonb_build_object('customer',private.customers_summary(c)||jsonb_build_object('version',c.version+1),
   'capabilities',jsonb_build_object('can_relate',false,'can_verify',false,'can_merge',false),
   'assignments','[]'::jsonb,'representations','[]'::jsonb,'identities','[]'::jsonb,'merges','[]'::jsonb,
   'truncated',jsonb_build_object('assignments',false,'representations',false,'identities',false,'merges',false),
   'portal_enabled',false,'access_lost',true);
 END IF;
 RETURN private.customer_relations_state(p_office_id,p_customer_id);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409';
END $$;
CREATE FUNCTION private.customer_snapshot_capture(p_customer public.customers) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE snapshot_id uuid;
BEGIN
 INSERT INTO private.customer_snapshots(office_id,customer_id,version,data)
  VALUES(p_customer.office_id,p_customer.id,p_customer.version,jsonb_build_object('kind',p_customer.kind,'name',p_customer.name,'identifier',p_customer.identifier,
   'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',x.kind,'value',x.value) ORDER BY x.position) FROM public.customer_contacts x WHERE x.office_id=p_customer.office_id AND x.customer_id=p_customer.id),'[]'::jsonb))) RETURNING id INTO snapshot_id;
 RETURN snapshot_id;
END $$;
CREATE FUNCTION private.customer_merge_preview(p_office_id uuid,p_source_id uuid,p_target_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; source public.customers; target public.customers; conflicts jsonb:='[]'; contact_count integer; caps text[];
BEGIN
 caller:=private.customers_actor(p_office_id); caps:=private.current_permissions(p_office_id);
 IF NOT caps @> ARRAY['customers.merge'] OR NOT EXISTS(SELECT FROM public.memberships m WHERE m.office_id=p_office_id AND m.user_id=caller AND m.active AND m.role_code IN ('owner','admin')) THEN RAISE EXCEPTION 'CUSTOMERS_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 SELECT * INTO source FROM public.customers c WHERE c.id=p_source_id AND c.office_id=p_office_id AND private.customer_in_scope(c,caller);
 SELECT * INTO target FROM public.customers c WHERE c.id=p_target_id AND c.office_id=p_office_id AND private.customer_in_scope(c,caller);
 IF source.id IS NULL OR target.id IS NULL THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404'; END IF;
 IF source.id=target.id THEN conflicts:=conflicts||'"same_customer"'::jsonb; END IF;
 IF source.kind<>target.kind THEN conflicts:=conflicts||'"kind"'::jsonb; END IF;
 IF source.identifier IS NOT NULL AND target.identifier IS NOT NULL AND source.identifier<>target.identifier THEN conflicts:=conflicts||'"identifier"'::jsonb; END IF;
 SELECT count(*) INTO contact_count FROM (SELECT DISTINCT kind,value FROM public.customer_contacts WHERE office_id=p_office_id AND customer_id IN (p_source_id,p_target_id)) contacts;
 IF contact_count>4 THEN conflicts:=conflicts||'"contacts"'::jsonb; END IF;
 -- Any two different live verified accounts conflict. A source-only identity is revoked, never moved.
 IF EXISTS(SELECT FROM private.customer_relations a JOIN private.customer_relations b ON a.office_id=b.office_id
  WHERE a.office_id=p_office_id AND a.customer_id=p_source_id AND b.customer_id=p_target_id AND a.relation_type='identity' AND b.relation_type='identity'
   AND a.revoked_at IS NULL AND b.revoked_at IS NULL AND a.membership_id<>b.membership_id) THEN conflicts:=conflicts||'"identity"'::jsonb; END IF;
 RETURN jsonb_build_object('source',private.customers_summary(source)||jsonb_build_object('version',source.version),
  'target',private.customers_summary(target)||jsonb_build_object('version',target.version),'expected',jsonb_build_object('name',target.name,'kind',target.kind,
   'identifier_masked',coalesce(private.customers_summary(target)->>'identifier_masked',private.customers_summary(source)->>'identifier_masked'),
   'contact_count',contact_count,'copies_identifier',target.identifier IS NULL AND source.identifier IS NOT NULL,'transfers_authority',false),
  'conflicts',conflicts,'can_merge',jsonb_array_length(conflicts)=0,'portal_enabled',false);
END $$;
CREATE FUNCTION private.customer_merge(p_office_id uuid,p_source_id uuid,p_target_id uuid,p_source_version integer,p_target_version integer,p_evidence text,p_confirm boolean,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid; source public.customers; target public.customers; preview jsonb; evidence text; source_snapshot uuid; target_snapshot uuid; result_snapshot uuid; merge_id uuid; contacts jsonb;
BEGIN
 caller:=private.customers_actor(p_office_id,'customers.merge');
 IF p_request_id IS NULL OR p_confirm IS DISTINCT FROM true OR p_source_version IS NULL OR p_target_version IS NULL
  OR p_source_version NOT BETWEEN 1 AND 2147483646 OR p_target_version NOT BETWEEN 1 AND 2147483646 THEN RAISE EXCEPTION 'CUSTOMERS_VALIDATION' USING ERRCODE='PT422'; END IF;
 evidence:=private.customer_relation_evidence(to_jsonb(p_evidence));
 PERFORM 1 FROM public.customers WHERE office_id=p_office_id AND id IN(p_source_id,p_target_id) ORDER BY id FOR UPDATE;
 caller:=private.customers_actor(p_office_id,'customers.merge');
 preview:=private.customer_merge_preview(p_office_id,p_source_id,p_target_id);
 IF NOT (preview->>'can_merge')::boolean THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409'; END IF;
 SELECT * INTO source FROM public.customers WHERE id=p_source_id AND office_id=p_office_id;
 SELECT * INTO target FROM public.customers WHERE id=p_target_id AND office_id=p_office_id;
 IF source.version<>p_source_version OR target.version<>p_target_version THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409'; END IF;
 source_snapshot:=private.customer_snapshot_capture(source); target_snapshot:=private.customer_snapshot_capture(target);
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'value',value) ORDER BY first_position,kind,value),'[]') INTO contacts FROM (
  SELECT kind,value,min(CASE WHEN customer_id=p_target_id THEN position ELSE position+4 END) AS first_position
  FROM public.customer_contacts WHERE office_id=p_office_id AND customer_id IN(p_source_id,p_target_id) GROUP BY kind,value) combined;
 -- Release only active uniqueness; retain the original identifier, contacts and every existing FK.
 UPDATE public.customers SET merged_into_id=p_target_id,version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=p_source_id;
 UPDATE public.customers SET identifier=coalesce(identifier,source.identifier),version=version+1,updated_at=clock_timestamp() WHERE office_id=p_office_id AND id=p_target_id RETURNING * INTO target;
 DELETE FROM public.customer_contacts WHERE office_id=p_office_id AND customer_id=p_target_id;
 INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value)
  SELECT p_office_id,p_target_id,(ordinality-1)::smallint,value->>'kind',value->>'value' FROM jsonb_array_elements(contacts) WITH ORDINALITY;
 -- Revoke source grants, verified identity and both directions of representation; never union authority.
 UPDATE private.customer_relations SET revoked_at=clock_timestamp(),revoked_by=caller,version=version+1
  WHERE office_id=p_office_id AND revoked_at IS NULL AND (customer_id=p_source_id OR representative_customer_id=p_source_id);
 result_snapshot:=private.customer_snapshot_capture(target);
 INSERT INTO private.customer_merges(office_id,source_id,target_id,source_snapshot_id,target_snapshot_id,result_snapshot_id,evidence,actor_id,request_id)
  VALUES(p_office_id,p_source_id,p_target_id,source_snapshot,target_snapshot,result_snapshot,evidence,caller,p_request_id) RETURNING id INTO merge_id;
 PERFORM private.emit_business_event(p_office_id,'customers.merged','customer',p_target_id,p_request_id,jsonb_build_object('source_id',p_source_id,'target_id',p_target_id,'merge_id',merge_id));
 RETURN jsonb_build_object('merge_id',merge_id,'source_id',p_source_id,'target_id',p_target_id,'target_version',target.version,'state',private.customer_relations_state(p_office_id,p_target_id));
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CUSTOMER_CONFLICT' USING ERRCODE='PT409';
END $$;
CREATE FUNCTION public.customer_relations_state(p_office_id uuid,p_customer_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_relations_state(p_office_id,p_customer_id); $$;
CREATE FUNCTION public.customer_relation_candidates(p_office_id uuid,p_kind text,p_query text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_relation_candidates(p_office_id,p_kind,p_query); $$;
CREATE FUNCTION public.customer_relation_command(p_office_id uuid,p_customer_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_relation_command(p_office_id,p_customer_id,p_action,p_payload,p_request_id); $$;
CREATE FUNCTION public.customer_merge_preview(p_office_id uuid,p_source_id uuid,p_target_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_merge_preview(p_office_id,p_source_id,p_target_id); $$;
CREATE FUNCTION public.customer_merge(p_office_id uuid,p_source_id uuid,p_target_id uuid,p_source_version integer,p_target_version integer,p_evidence text,p_confirm boolean,p_request_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.customer_merge(p_office_id,p_source_id,p_target_id,p_source_version,p_target_version,p_evidence,p_confirm,p_request_id); $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('private','public') AND (p.proname LIKE 'customer_relation%' OR p.proname LIKE 'customer_merge%' OR p.proname IN ('customer_history_immutable','customer_snapshot_capture','customer_in_scope','customer_intake_resolved'))
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.customer_relations_state(uuid,uuid),private.customer_relations_state(uuid,uuid),
 public.customer_relation_candidates(uuid,text,text),private.customer_relation_candidates(uuid,text,text),
 public.customer_relation_command(uuid,uuid,text,jsonb,uuid),private.customer_relation_command(uuid,uuid,text,jsonb,uuid),
 public.customer_merge_preview(uuid,uuid,uuid),private.customer_merge_preview(uuid,uuid,uuid),
 public.customer_merge(uuid,uuid,uuid,integer,integer,text,boolean,uuid),private.customer_merge(uuid,uuid,uuid,integer,integer,text,boolean,uuid) TO authenticated;
