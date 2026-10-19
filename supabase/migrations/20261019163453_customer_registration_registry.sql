-- Pós07. Auth provenance is operational intake, never proof of identity or document access.
-- A contact match only holds the intake for future review; it never selects an internal dossier.
CREATE TABLE private.customer_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 membership_id uuid NOT NULL UNIQUE,
 name text NOT NULL CHECK (name=btrim(name) AND char_length(name) BETWEEN 1 AND 120 AND name !~ '[[:cntrl:]]'),
 email text NOT NULL CHECK (email=lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254
  AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 materialized_customer_id uuid UNIQUE,
 association_status text NOT NULL DEFAULT 'pending' CHECK (association_status='pending'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (office_id,membership_id) REFERENCES public.memberships(office_id,id) ON DELETE RESTRICT,
 FOREIGN KEY (office_id,materialized_customer_id) REFERENCES public.customers(office_id,id) ON DELETE RESTRICT,
 UNIQUE (office_id,id)
);
-- The membership already uniquely identifies (office_id,user_id); do not duplicate its UID here.
CREATE INDEX customer_registrations_office_time_idx ON private.customer_registrations(office_id,created_at DESC,id DESC);
CREATE INDEX customer_contacts_office_email_idx ON public.customer_contacts(office_id,value) WHERE kind='email';
ALTER TABLE private.customer_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.customer_registrations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.sync_customer_registration(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; origin record; intake private.customer_registrations; customer_id uuid; safe_name text; safe_email text;
BEGIN
 -- Only a trusted historical bootstrap event establishes public-registration provenance.
 -- Skip ineligible intake before taking an office lock. Unconfirmed signup
 -- already holds KEY SHARE through its FKs; needless promotion can deadlock.
 -- Eligibility is checked again below after the lock for confirmed accounts.
 FOR candidate IN SELECT m.id,m.office_id FROM public.memberships m
  JOIN public.profiles p ON p.id=m.user_id AND p.active
  JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
   AND NOT u.is_anonymous AND u.invited_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
  WHERE m.user_id=p_user_id AND m.active AND m.role_code='client' AND EXISTS(SELECT FROM public.audit_events e WHERE e.office_id=m.office_id
   AND e.action='auth.client_registered' AND e.target_type='membership' AND e.target_id=m.id)
  ORDER BY m.office_id,m.id LOOP
  -- Same lock as internal CRUD: concurrent contact creation and confirmations cannot race this hint.
  PERFORM 1 FROM public.offices o WHERE o.id=candidate.office_id AND o.active FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT m.id AS membership_id,m.office_id,m.user_id,p.display_name,u.email,
   (SELECT min(e.occurred_at) FROM public.audit_events e WHERE e.office_id=m.office_id
    AND e.action='auth.client_registered' AND e.target_type='membership' AND e.target_id=m.id) AS registered_at
   INTO origin FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id AND p.active
   JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND NOT u.is_anonymous AND u.invited_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
   WHERE m.id=candidate.id AND m.office_id=candidate.office_id AND m.user_id=p_user_id AND m.active AND m.role_code='client';
  IF NOT FOUND OR origin.registered_at IS NULL THEN CONTINUE; END IF;
  safe_email:=lower(btrim(origin.email));
  IF safe_email IS NULL OR char_length(safe_email) NOT BETWEEN 3 AND 254
   OR safe_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN CONTINUE; END IF;
  -- Name is presentation only. Malformed editable metadata must not break confirmation.
  safe_name:=nullif(btrim(regexp_replace(coalesce(origin.display_name,''),'[[:cntrl:]]',' ','g')),'');
  safe_name:=coalesce(left(safe_name,120),'Cliente cadastrado');
  INSERT INTO private.customer_registrations(office_id,membership_id,name,email,created_at)
   VALUES(origin.office_id,origin.membership_id,safe_name,safe_email,origin.registered_at)
   ON CONFLICT(membership_id) DO NOTHING RETURNING * INTO intake;
  IF intake.id IS NULL THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT FROM public.customer_contacts c WHERE c.office_id=origin.office_id AND c.kind='email' AND c.value=safe_email) THEN
   INSERT INTO public.customers(office_id,kind,name,created_by,created_at)
    VALUES(origin.office_id,'person',safe_name,origin.user_id,intake.created_at) RETURNING id INTO customer_id;
   INSERT INTO public.customer_contacts(office_id,customer_id,position,kind,value)
    VALUES(origin.office_id,customer_id,0,'email',safe_email);
   -- Technical origin only: association_status remains pending and no portal capability changes.
   UPDATE private.customer_registrations SET materialized_customer_id=customer_id WHERE id=intake.id;
  END IF;
  INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,changes)
   VALUES(origin.office_id,'operator',session_user,'auth.customer_registration_received','customer_registration',intake.id,'{}');
 END LOOP;
END $$;

CREATE FUNCTION private.sync_new_customer_registration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.sync_customer_registration(NEW.id);
 RETURN NEW;
END $$;
-- Alphabetically after jn_register_new_client, including signups already confirmed by the provider.
CREATE TRIGGER jn_sync_customer_registration AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
 FOR EACH ROW EXECUTE FUNCTION private.sync_new_customer_registration();

CREATE FUNCTION private.customer_registration_active(p_registration private.customer_registrations) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.memberships m JOIN public.profiles p ON p.id=m.user_id AND p.active
  JOIN auth.users u ON u.id=m.user_id AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
   AND NOT u.is_anonymous AND u.invited_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
  WHERE m.id=p_registration.membership_id AND m.office_id=p_registration.office_id AND m.active AND m.role_code='client');
$$;
CREATE FUNCTION private.customer_registration_summary(p_registration private.customer_registrations) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_registration.id,'kind','person','name',p_registration.name,'identifier_masked',NULL,
  'created_at',p_registration.created_at,'source','client_registration','association_status','pending');
$$;

CREATE OR REPLACE FUNCTION private.customers_summary(p_customer public.customers) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_customer.id,'kind',p_customer.kind,'name',p_customer.name,
  'identifier_masked',CASE WHEN p_customer.identifier IS NULL THEN NULL WHEN p_customer.kind='person' THEN '***.***.***-'||right(p_customer.identifier,2)
   ELSE '**.***.***/****-'||right(p_customer.identifier,2) END,'created_at',p_customer.created_at)
  || CASE WHEN EXISTS(SELECT FROM private.customer_registrations r WHERE r.office_id=p_customer.office_id AND r.materialized_customer_id=p_customer.id)
   THEN jsonb_build_object('source','client_registration','association_status','pending') ELSE '{}'::jsonb END;
$$;
CREATE OR REPLACE FUNCTION private.customers_detail_record(p_customer public.customers,p_can_update boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.customers_summary(p_customer)||jsonb_build_object('identifier',p_customer.identifier,'version',p_customer.version,'can_update',p_can_update,
  'contacts',coalesce((SELECT jsonb_agg(jsonb_build_object('kind',c.kind,'value',c.value) ORDER BY c.position)
   FROM public.customer_contacts c WHERE c.office_id=p_customer.office_id AND c.customer_id=p_customer.id),'[]'::jsonb))
  || CASE WHEN EXISTS(SELECT FROM private.customer_registrations r WHERE r.office_id=p_customer.office_id AND r.materialized_customer_id=p_customer.id)
   THEN jsonb_build_object('materialized',true) ELSE '{}'::jsonb END;
$$;
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
   WHERE c.office_id=p_office_id AND (all_records OR c.created_by=caller)
  UNION ALL
  SELECT r.id,r.name,NULL::text,r.created_at,private.customer_registration_summary(r) FROM private.customer_registrations r
   WHERE r.office_id=p_office_id AND all_records AND r.materialized_customer_id IS NULL AND private.customer_registration_active(r)
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
  AND (c.created_by=caller OR capabilities @> ARRAY['customers.read_all']);
 IF customer.id IS NOT NULL THEN RETURN private.customers_detail_record(customer,capabilities @> ARRAY['customers.update']); END IF;
 IF capabilities @> ARRAY['customers.read_all'] THEN
  SELECT * INTO intake FROM private.customer_registrations r WHERE r.office_id=p_office_id AND r.id=p_customer_id
   AND r.materialized_customer_id IS NULL AND private.customer_registration_active(r);
  IF intake.id IS NOT NULL THEN
   RETURN private.customer_registration_summary(intake)||jsonb_build_object('identifier',NULL,'version',1,'can_update',false,'materialized',false,
    'contacts',jsonb_build_array(jsonb_build_object('kind','email','value',intake.email)));
  END IF;
 END IF;
 RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE='PT404';
END $$;

REVOKE ALL ON FUNCTION private.sync_customer_registration(uuid),private.sync_new_customer_registration(),
 private.customer_registration_active(private.customer_registrations),private.customer_registration_summary(private.customer_registrations)
 FROM PUBLIC,anon,authenticated,service_role;
-- Existing RPC ACLs are preserved by CREATE OR REPLACE. No new public endpoint or portal grant.
-- Backfill is exact-provenance based and idempotent; unrelated/legacy identities are untouched.
SELECT private.sync_customer_registration(u.id) FROM auth.users u WHERE EXISTS(SELECT FROM public.memberships m
 JOIN public.audit_events e ON e.office_id=m.office_id AND e.target_id=m.id AND e.target_type='membership' AND e.action='auth.client_registered'
 WHERE m.user_id=u.id) ORDER BY u.id;
