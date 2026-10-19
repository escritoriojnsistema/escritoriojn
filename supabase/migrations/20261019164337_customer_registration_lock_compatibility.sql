-- Keep signup FK KEY SHARE locks compatible while serializing confirmed intake.
CREATE OR REPLACE FUNCTION private.sync_customer_registration(p_user_id uuid) RETURNS void
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
  -- Serializes with the FOR UPDATE mutex used by internal CRUD while remaining
  -- compatible with KEY SHARE already held by the signup bootstrap FKs.
  PERFORM 1 FROM public.offices o WHERE o.id=candidate.office_id AND o.active FOR NO KEY UPDATE;
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
