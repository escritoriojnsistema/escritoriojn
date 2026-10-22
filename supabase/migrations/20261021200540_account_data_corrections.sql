-- Conta: self-service for staff; reviewed client proposals reuse requests10.
-- No real identity, membership, permission grant or customer is rewritten here.
INSERT INTO public.permissions(code,name) VALUES
 ('accounts.corrections.read','Consultar correções cadastrais'),
 ('accounts.corrections.apply','Aplicar correções cadastrais') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_code,permission_code) VALUES
 ('owner','accounts.corrections.read'),('owner','accounts.corrections.apply') ON CONFLICT DO NOTHING;

CREATE TABLE private.account_data(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 cpf text CHECK(cpf IS NULL OR (cpf ~ '^[0-9]{11}$' AND private.team_normalize_cpf(cpf)=cpf)),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.requests ADD COLUMN category text NOT NULL DEFAULT 'general' CHECK(category IN('general','account_correction'));
CREATE INDEX requests_account_corrections_idx ON public.requests(office_id,updated_at DESC,id DESC) WHERE category='account_correction';
CREATE TABLE private.account_corrections(
 request_id uuid PRIMARY KEY,office_id uuid NOT NULL,
 base_version text NOT NULL CHECK(base_version ~ '^[a-f0-9]{64}$'),
 before_values jsonb NOT NULL,proposed_values jsonb NOT NULL,applied_values jsonb,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','applied','rejected')),
 reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,reviewed_at timestamptz,
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX account_corrections_office_idx ON private.account_corrections(office_id,request_id);
CREATE INDEX account_corrections_reviewer_idx ON private.account_corrections(reviewed_by);
CREATE TABLE private.account_email_intents(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 email text NOT NULL CHECK(email=lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 request_id uuid,authorized_at timestamptz NOT NULL DEFAULT clock_timestamp(),confirmed_at timestamptz,
 FOREIGN KEY(office_id,request_id) REFERENCES public.requests(office_id,id) ON DELETE RESTRICT
);
CREATE INDEX account_email_intents_request_idx ON private.account_email_intents(office_id,request_id);
DO $$DECLARE t regclass;BEGIN FOREACH t IN ARRAY ARRAY['private.account_data'::regclass,'private.account_corrections'::regclass,'private.account_email_intents'::regclass] LOOP
 EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;

CREATE FUNCTION private.account_validate(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE safe_name text;safe_email text;digits text;
BEGIN
 PERFORM private.request_shape(p_input,ARRAY['name','cpf','email']);
 safe_name:=private.request_text(p_input->'name',3,120);safe_email:=private.request_text(p_input->'email',3,254);
 IF safe_email<>lower(safe_email) OR safe_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 IF p_input->'cpf' IS DISTINCT FROM 'null'::jsonb THEN
  IF jsonb_typeof(p_input->'cpf') IS DISTINCT FROM 'string' OR p_input->>'cpf' !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
  digits:=private.team_normalize_cpf(p_input->>'cpf');IF digits IS NULL THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 END IF;
 RETURN jsonb_build_object('name',safe_name,'cpf',digits,'email',safe_email);
END $$;
CREATE FUNCTION private.account_values(p_user_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('name',private.customer_relation_display_label(coalesce(p.display_name,(SELECT i.full_name FROM private.team_member_identities i JOIN public.memberships m ON m.id=i.membership_id WHERE m.user_id=p.id ORDER BY m.id LIMIT 1),'Conta cadastrada')),'cpf',d.cpf,'email',lower(btrim(u.email)))
 FROM public.profiles p JOIN auth.users u ON u.id=p.id LEFT JOIN private.account_data d ON d.user_id=p.id WHERE p.id=p_user_id;
$$;
-- Explicit verified identity takes precedence over technical registration origin.
CREATE FUNCTION private.account_linked_customers(p_user_id uuid) RETURNS SETOF public.customers LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT customer.* FROM public.customers customer WHERE customer.id IN(
  SELECT rel.customer_id FROM private.customer_relations rel JOIN public.memberships m ON m.id=rel.membership_id
   WHERE m.user_id=p_user_id AND m.active AND m.role_code='client' AND rel.relation_type='identity' AND rel.revoked_at IS NULL AND rel.valid_from<=clock_timestamp()
  UNION
  SELECT intake.materialized_customer_id FROM private.customer_registrations intake JOIN public.memberships m ON m.id=intake.membership_id
   WHERE m.user_id=p_user_id AND NOT EXISTS(SELECT FROM private.customer_relations rel JOIN public.customers target ON target.id=rel.customer_id AND target.merged_into_id IS NULL AND target.blocked_at IS NULL
    WHERE rel.membership_id=m.id AND rel.relation_type='identity' AND rel.revoked_at IS NULL AND rel.valid_from<=clock_timestamp())
 );
$$;
CREATE FUNCTION private.account_version(p_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(extensions.digest((private.account_values(p_user_id)||jsonb_build_object('identities',coalesce((SELECT jsonb_agg(jsonb_build_array(m.id,i.full_name,i.cpf_hash) ORDER BY m.id) FROM private.team_member_identities i JOIN public.memberships m ON m.id=i.membership_id WHERE m.user_id=p_user_id),'[]'::jsonb),
 'email_intent',(SELECT jsonb_build_array(e.email,e.request_id) FROM private.account_email_intents e WHERE e.user_id=p_user_id AND e.confirmed_at IS NULL),
 'linked',coalesce((SELECT jsonb_agg(jsonb_build_array(c.id,c.version) ORDER BY c.id) FROM private.account_linked_customers(p_user_id) c),'[]'::jsonb)))::text,'sha256'),'hex');
$$;
CREATE FUNCTION private.account_record(m public.memberships) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT private.account_values(m.user_id)||jsonb_build_object('version',private.account_version(m.user_id),'can_edit',m.role_code<>'client',
 'cpf_masked',coalesce((SELECT '***.***.***-'||right(d.cpf,2) FROM private.account_data d WHERE d.user_id=m.user_id AND d.cpf IS NOT NULL),
 (SELECT i.cpf_masked FROM private.team_member_identities i JOIN public.memberships a ON a.id=i.membership_id WHERE a.user_id=m.user_id ORDER BY a.id LIMIT 1)),
 'correction_request_id',(SELECT r.id FROM public.requests r JOIN private.account_corrections c ON c.request_id=r.id WHERE r.created_by=m.user_id AND r.office_id=m.office_id AND r.status NOT IN('cancelado','concluido') ORDER BY r.created_at DESC LIMIT 1),
 'pending_email',(SELECT e.email FROM private.account_email_intents e WHERE e.user_id=m.user_id AND e.confirmed_at IS NULL AND (e.request_id IS NULL OR EXISTS(SELECT FROM public.requests r WHERE r.id=e.request_id AND r.status NOT IN('cancelado','concluido')))));
$$;
CREATE FUNCTION private.account_read(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;BEGIN m:=private.notifications_actor(p_office_id);RETURN private.account_record(m);END $$;

-- Updates only this UID and the explicit registration-origin FK, never a contact match.
-- Merged/blocked origins must be reviewed separately; no following a merge to another person.
CREATE FUNCTION private.account_write_fields(p_user_id uuid,p_values jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE old_email text;digits text:=p_values->>'cpf';linked record;
BEGIN
 SELECT email INTO old_email FROM auth.users WHERE id=p_user_id;
 IF EXISTS(SELECT FROM private.account_linked_customers(p_user_id) c WHERE(c.merged_into_id IS NOT NULL OR c.blocked_at IS NOT NULL)) THEN RAISE EXCEPTION 'ACCOUNT_CONFLICT' USING ERRCODE='PT409';END IF;
 INSERT INTO private.account_data(user_id,cpf) VALUES(p_user_id,digits) ON CONFLICT(user_id) DO UPDATE SET cpf=coalesce(EXCLUDED.cpf,private.account_data.cpf),updated_at=clock_timestamp();
 UPDATE public.profiles SET display_name=p_values->>'name' WHERE id=p_user_id;
 UPDATE private.team_member_identities i SET full_name=p_values->>'name',cpf_hash=CASE WHEN digits IS NULL THEN i.cpf_hash ELSE extensions.crypt(digits,extensions.gen_salt('bf')) END,cpf_masked=CASE WHEN digits IS NULL THEN i.cpf_masked ELSE '***.***.***-'||right(digits,2) END,updated_at=clock_timestamp()
 FROM public.memberships m WHERE m.id=i.membership_id AND m.user_id=p_user_id;
 FOR linked IN SELECT c.id,c.office_id FROM private.account_linked_customers(p_user_id) c WHERE c.kind='person' ORDER BY c.office_id,c.id LOOP
  UPDATE public.customers SET name=p_values->>'name',identifier=coalesce(digits,identifier),version=version+1,updated_at=clock_timestamp() WHERE id=linked.id;
 END LOOP;
 UPDATE private.customer_registrations r SET name=p_values->>'name' FROM public.memberships m WHERE m.id=r.membership_id AND m.user_id=p_user_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'ACCOUNT_DUPLICATE' USING ERRCODE='PT409';END $$;
CREATE FUNCTION private.account_prepare_email(p_user_id uuid,p_office_id uuid,p_email text,p_request_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM auth.users WHERE id=p_user_id AND lower(email)=p_email) THEN
  DELETE FROM private.account_email_intents WHERE user_id=p_user_id;RETURN;
 END IF;
 IF EXISTS(SELECT FROM auth.users WHERE lower(email)=p_email AND id<>p_user_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'ACCOUNT_DUPLICATE' USING ERRCODE='PT409';END IF;
 INSERT INTO private.account_email_intents(user_id,email,office_id,request_id) VALUES(p_user_id,p_email,p_office_id,p_request_id)
 ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,office_id=EXCLUDED.office_id,request_id=EXCLUDED.request_id,authorized_at=clock_timestamp(),confirmed_at=NULL;
END $$;
CREATE FUNCTION private.account_save(p_office_id uuid,p_expected_version text,p_input jsonb,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;v jsonb;
BEGIN
 m:=private.notifications_actor(p_office_id,true);IF m.role_code='client' THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 v:=private.account_validate(p_input);PERFORM pg_advisory_xact_lock(hashtextextended(m.user_id::text,7291));PERFORM 1 FROM public.profiles WHERE id=m.user_id FOR UPDATE;
 m:=private.notifications_actor(p_office_id,true);
 IF m.role_code='client' THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_expected_version IS DISTINCT FROM private.account_version(m.user_id) THEN RAISE EXCEPTION 'ACCOUNT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF v->>'cpf' IS NULL AND private.account_values(m.user_id)->>'cpf' IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 PERFORM private.account_write_fields(m.user_id,v);PERFORM private.account_prepare_email(m.user_id,p_office_id,v->>'email');
 m:=private.notifications_actor(p_office_id,true);IF m.role_code='client' THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM private.emit_business_event(p_office_id,'accounts.self_updated','profile',m.user_id,p_event_id,'{}');
 RETURN private.account_record(m);
END $$;
CREATE FUNCTION private.account_correction_create(p_office_id uuid,p_expected_version text,p_input jsonb,p_event_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;v jsonb;c private.account_corrections;before_json jsonb;
BEGIN
 m:=private.requests_actor(p_office_id,true,'requests.create');IF m.role_code<>'client' THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 v:=private.account_validate(p_input);PERFORM pg_advisory_xact_lock(hashtextextended(m.user_id::text,7291));
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND created_by=m.user_id AND idempotency_key=p_idempotency_key;
 IF r.id IS NOT NULL THEN
  SELECT * INTO c FROM private.account_corrections WHERE request_id=r.id;
  IF c.request_id IS NULL OR c.proposed_values IS DISTINCT FROM v OR c.base_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'REQUEST_IDEMPOTENCY_CONFLICT' USING ERRCODE='PT409';END IF;
  RETURN private.request_detail_record(r,m,1);
 END IF;
 IF p_expected_version IS DISTINCT FROM private.account_version(m.user_id) THEN RAISE EXCEPTION 'ACCOUNT_CONFLICT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT FROM public.requests x JOIN private.account_corrections proposal ON proposal.request_id=x.id WHERE x.created_by=m.user_id AND x.status NOT IN('cancelado','concluido')) THEN RAISE EXCEPTION 'ACCOUNT_CONFLICT' USING ERRCODE='PT409';END IF;
 before_json:=private.account_values(m.user_id);
 IF v->>'cpf' IS NULL AND before_json->>'cpf' IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 IF v=before_json THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 -- One generator, transaction and protocol for every request type.
 r.id:=(private.request_create(p_office_id,jsonb_build_object('origin','portal','title','Correção dos dados da conta','message','Solicito a correção dos dados da minha conta.'),p_idempotency_key,p_event_id)->>'id')::uuid;
 UPDATE public.requests SET category='account_correction' WHERE id=r.id RETURNING * INTO r;
 INSERT INTO private.account_corrections(request_id,office_id,base_version,before_values,proposed_values) VALUES(r.id,p_office_id,p_expected_version,before_json,v);
 INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id)
 SELECT p_office_id,r.id,a.id,'account_correction',p_event_id FROM public.memberships a WHERE a.office_id=p_office_id AND a.active AND a.role_code<>'client' AND private.team_user_active(a.user_id,p_office_id) AND private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read','accounts.corrections.read'] ON CONFLICT DO NOTHING;
 PERFORM private.emit_business_event(p_office_id,'accounts.correction_requested','request',r.id,p_event_id,'{}');
 RETURN private.request_detail_record(r,m,1);
END $$;
CREATE FUNCTION private.account_correction_json(r public.requests,m public.memberships) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('status',c.state,'before',c.before_values,'proposed',c.proposed_values,'applied',c.applied_values,
 'can_apply',m.role_code<>'client' AND c.state='pending' AND r.status NOT IN('concluido','cancelado') AND private.request_can_work(r,m) AND private.current_permissions(r.office_id) @> ARRAY['accounts.corrections.read','accounts.corrections.apply'],
 'email_pending',EXISTS(SELECT FROM private.account_email_intents e WHERE e.user_id=r.created_by AND e.request_id=r.id AND e.confirmed_at IS NULL))
 FROM private.account_corrections c WHERE c.request_id=r.id AND private.request_in_scope(r,m);
$$;
CREATE FUNCTION private.account_correction_apply(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_input jsonb,p_event_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;r public.requests;c private.account_corrections;v jsonb;pending_email boolean;
BEGIN
 m:=private.requests_actor(p_office_id,true,'accounts.corrections.apply');
 SELECT * INTO r FROM public.requests WHERE office_id=p_office_id AND id=p_request_id FOR UPDATE;
 IF r.id IS NULL OR private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.created_by::text,7291));PERFORM 1 FROM public.profiles WHERE id=r.created_by FOR UPDATE;
 m:=private.requests_actor(p_office_id,true,'accounts.corrections.apply');
 IF m.role_code='client' OR private.request_can_work(r,m) IS NOT TRUE OR NOT private.current_permissions(p_office_id) @> ARRAY['accounts.corrections.read'] THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT * INTO c FROM private.account_corrections WHERE request_id=r.id FOR UPDATE;
 IF c.request_id IS NULL OR c.state<>'pending' OR r.status IN('concluido','cancelado') OR r.version IS DISTINCT FROM p_expected_version OR c.base_version IS DISTINCT FROM private.account_version(r.created_by) THEN RAISE EXCEPTION 'ACCOUNT_CONFLICT' USING ERRCODE='PT409';END IF;
 -- A client correction never edits a staff identity, including another office.
 IF NOT EXISTS(SELECT FROM public.memberships a WHERE a.office_id=p_office_id AND a.user_id=r.created_by AND a.active AND a.role_code='client' AND private.team_user_active(a.user_id,p_office_id)) OR EXISTS(SELECT FROM public.memberships a WHERE a.user_id=r.created_by AND a.role_code<>'client') THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 v:=private.account_validate(p_input);IF v->>'cpf' IS NULL AND private.account_values(r.created_by)->>'cpf' IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;PERFORM private.account_write_fields(r.created_by,v);PERFORM private.account_prepare_email(r.created_by,p_office_id,v->>'email',r.id);
 m:=private.requests_actor(p_office_id,true,'accounts.corrections.apply');IF private.request_can_work(r,m) IS NOT TRUE OR NOT private.current_permissions(p_office_id) @> ARRAY['accounts.corrections.read'] THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT EXISTS(SELECT FROM private.account_email_intents e WHERE e.user_id=r.created_by AND e.request_id=r.id AND e.confirmed_at IS NULL) INTO pending_email;
 IF r.assignee_id IS NULL THEN
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id) VALUES(p_office_id,r.id,m.id,m.user_id);
  INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_assignee,to_assignee) VALUES(p_office_id,r.id,'transfer',m.user_id,'Correção cadastral assumida para aplicação.',NULL,m.id);
 END IF;
 UPDATE private.account_corrections SET state='applied',applied_values=v,reviewed_by=m.user_id,reviewed_at=clock_timestamp() WHERE request_id=r.id;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status) VALUES(p_office_id,r.id,'status',m.user_id,'Correção cadastral aplicada após conferência.',r.status,CASE WHEN pending_email THEN 'aguardando_cliente' ELSE 'concluido' END);
 UPDATE public.requests SET assignee_id=coalesce(assignee_id,m.id),status=CASE WHEN pending_email THEN 'aguardando_cliente' ELSE 'concluido' END,version=version+1,updated_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
 INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,kind,event_id) SELECT p_office_id,r.id,a.id,'account_updated',p_event_id FROM public.memberships a WHERE a.office_id=p_office_id AND a.user_id=r.created_by AND a.role_code='client' ON CONFLICT DO NOTHING;
 PERFORM private.emit_business_event(p_office_id,'accounts.correction_applied','request',r.id,p_event_id,'{}');
 RETURN private.request_detail_record(r,m,1);
END $$;

-- GoTrue owns credential writes. Only a saved self-edit / approved client
-- proposal authorizes a different email; editable user_metadata never does.
CREATE FUNCTION private.account_auth_email_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE proposed text;intent private.account_email_intents;
BEGIN
 IF OLD.email IS NULL OR OLD.email='' OR NOT EXISTS(SELECT FROM public.profiles WHERE id=NEW.id) THEN RETURN NEW;END IF;
 proposed:=CASE WHEN NEW.email IS DISTINCT FROM OLD.email THEN lower(NEW.email) WHEN NEW.email_change IS DISTINCT FROM OLD.email_change AND nullif(NEW.email_change,'') IS NOT NULL THEN lower(NEW.email_change) ELSE NULL END;
 IF proposed IS NULL THEN RETURN NEW;END IF;
 SELECT * INTO intent FROM private.account_email_intents WHERE user_id=NEW.id FOR UPDATE;
 IF intent.request_id IS NOT NULL THEN PERFORM 1 FROM public.requests WHERE id=intent.request_id FOR SHARE;END IF;
 IF NOT EXISTS(SELECT FROM private.account_email_intents e WHERE e.user_id=NEW.id AND e.email=proposed AND e.confirmed_at IS NULL AND private.team_user_active(NEW.id,e.office_id)
  AND(e.request_id IS NULL OR EXISTS(SELECT FROM public.requests r JOIN private.account_corrections c ON c.request_id=r.id WHERE r.id=e.request_id AND r.created_by=NEW.id AND r.status NOT IN('concluido','cancelado') AND c.state='applied'))) THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION private.account_auth_email_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent private.account_email_intents;r public.requests;member_id uuid;
BEGIN
 IF NEW.email IS NOT DISTINCT FROM OLD.email THEN RETURN NEW;END IF;
 SELECT * INTO intent FROM private.account_email_intents WHERE user_id=NEW.id AND email=lower(NEW.email) AND confirmed_at IS NULL FOR UPDATE;
 IF intent.user_id IS NULL THEN RETURN NEW;END IF;
 -- Serialize contact reconciliation with customer CRUD. If the approved email
 -- is already a secondary contact, keep it and remove only the old login contact.
 PERFORM 1 FROM public.customers c WHERE c.id IN(SELECT linked.id FROM private.account_linked_customers(NEW.id) linked WHERE linked.merged_into_id IS NULL AND linked.blocked_at IS NULL) ORDER BY c.id FOR UPDATE;
 WITH removed AS(DELETE FROM public.customer_contacts old_contact WHERE old_contact.kind='email' AND old_contact.value=lower(OLD.email)
  AND EXISTS(SELECT FROM private.account_linked_customers(NEW.id) linked WHERE linked.id=old_contact.customer_id AND linked.office_id=old_contact.office_id AND linked.merged_into_id IS NULL AND linked.blocked_at IS NULL)
  AND EXISTS(SELECT FROM public.customer_contacts destination WHERE destination.customer_id=old_contact.customer_id AND destination.kind='email' AND destination.value=lower(NEW.email))
  RETURNING old_contact.customer_id) UPDATE public.customers SET version=version+1,updated_at=clock_timestamp() WHERE id IN(SELECT customer_id FROM removed);
 -- Update the remaining connected old email without changing unrelated contacts.
 WITH updated AS(UPDATE public.customer_contacts c SET value=lower(NEW.email) WHERE c.kind='email' AND c.value=lower(OLD.email)
  AND EXISTS(SELECT FROM private.account_linked_customers(NEW.id) customer WHERE customer.id=c.customer_id AND customer.office_id=c.office_id AND customer.merged_into_id IS NULL AND customer.blocked_at IS NULL)
  RETURNING c.customer_id) UPDATE public.customers SET version=version+1,updated_at=clock_timestamp() WHERE id IN(SELECT customer_id FROM updated);
 UPDATE private.customer_registrations x SET email=lower(NEW.email) FROM public.memberships m WHERE m.id=x.membership_id AND m.user_id=NEW.id;
 UPDATE private.account_email_intents SET confirmed_at=clock_timestamp() WHERE user_id=NEW.id;
 IF intent.request_id IS NOT NULL THEN
  SELECT * INTO r FROM public.requests WHERE id=intent.request_id FOR UPDATE;
  IF r.status='aguardando_cliente' THEN
   INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status) VALUES(r.office_id,r.id,'status',NEW.id,'Titular confirmou a alteração de e-mail.','aguardando_cliente','concluido');
   UPDATE public.requests SET status='concluido',version=version+1,updated_at=clock_timestamp() WHERE id=r.id;
  END IF;
 END IF;
 -- Operator event avoids inventing a browser session inside a provider trigger.
 INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,changes)
 VALUES(intent.office_id,'operator',session_user,'accounts.email_confirmed','profile',NEW.id,'{}');
 RETURN NEW;
END $$;
CREATE TRIGGER jn_account_email_guard BEFORE UPDATE OF email,email_change ON auth.users FOR EACH ROW EXECUTE FUNCTION private.account_auth_email_guard();
CREATE TRIGGER jn_account_email_sync AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION private.account_auth_email_sync();

CREATE FUNCTION public.account_read(p_office_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.account_read(p_office_id);$$;
CREATE FUNCTION public.account_save(p_office_id uuid,p_expected_version text,p_input jsonb,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.account_save(p_office_id,p_expected_version,p_input,p_event_id);$$;
CREATE FUNCTION public.account_correction_create(p_office_id uuid,p_expected_version text,p_input jsonb,p_event_id uuid,p_idempotency_key uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.account_correction_create(p_office_id,p_expected_version,p_input,p_event_id,p_idempotency_key);$$;
CREATE FUNCTION public.account_correction_apply(p_office_id uuid,p_request_id uuid,p_expected_version integer,p_input jsonb,p_event_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.account_correction_apply(p_office_id,p_request_id,p_expected_version,p_input,p_event_id);$$;

-- Extend existing permission assignment/delegation whitelists.
ALTER TABLE private.team_member_permissions DROP CONSTRAINT team_member_permissions_permission_code_check;
ALTER TABLE private.team_member_permissions ADD CONSTRAINT team_member_permissions_permission_code_check CHECK
 (permission_code IN ('foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply'));
ALTER TABLE private.team_delegations DROP CONSTRAINT team_delegations_allowed_permissions_check;
ALTER TABLE private.team_delegations ADD CONSTRAINT team_delegations_allowed_permissions_check CHECK
 (allowed_permissions @> ARRAY['foundation.access'] AND allowed_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply']);
ALTER TABLE private.team_invitations DROP CONSTRAINT team_invitations_permissions_check;
ALTER TABLE private.team_invitations ADD CONSTRAINT team_invitations_permissions_check CHECK
 (permissions @> ARRAY['foundation.access'] AND permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply']);




CREATE OR REPLACE FUNCTION private.team_scope_for_member(p_membership_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.memberships; d private.team_delegations;
BEGIN
 SELECT * INTO m FROM public.memberships WHERE id=p_membership_id;
 IF m.id IS NULL OR NOT (private.team_permissions_for_member(m.id) @> ARRAY['foundation.access','users.manage']) THEN
  RAISE EXCEPTION 'TEAM_FORBIDDEN' USING ERRCODE='PT403'; END IF;
 IF m.role_code='owner' THEN
  RETURN jsonb_build_object('user_id',m.user_id,'membership_id',m.id,'office_id',m.office_id,'role_code','owner',
   'allowed_roles',ARRAY['employee','admin','owner'],'allowed_permissions',ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply'],
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
  OR NOT (p_permissions @> ARRAY['foundation.access']) OR NOT (p_permissions <@ ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply'])
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
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['foundation.access','audit.read','audit.export','archives.manage','customers.read','customers.create','customers.update','customers.read_all','customers.relate','customers.verify','customers.merge','services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim','files.read','files.upload','files.copy','files.manage','checklists.read','checklists.manage','checklists.update','checklists.waive','accounts.corrections.read','accounts.corrections.apply','users.manage','users.owners.create'])));
  ELSIF k='allowed_roles' AND jsonb_typeof(v)='array' THEN
   safe:=NOT EXISTS(SELECT FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x)<>'string' OR NOT (x#>>'{}'=ANY(ARRAY['owner','admin','employee','client'])));
  END IF;
  IF safe THEN result:=result||jsonb_build_object(k,v); END IF;
 END LOOP;
 RETURN result;
END $$;

ALTER TABLE private.internal_notifications DROP CONSTRAINT internal_notifications_kind_check;
ALTER TABLE private.internal_notifications ADD CONSTRAINT internal_notifications_kind_check CHECK(kind IN('handoff','pending','assignee_changed','account_correction','account_updated'));

CREATE OR REPLACE FUNCTION private.request_in_scope(r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT r.office_id=m.office_id AND CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id
 WHEN r.category='account_correction' THEN private.current_permissions(r.office_id) @> ARRAY['requests.read','accounts.corrections.read']
 ELSE r.created_by=m.user_id OR r.assignee_id=m.id OR private.current_permissions(r.office_id) @> ARRAY['requests.read_all']
 OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END;
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
  WITH candidates AS(SELECT a.id,(a.id=m.id) AS is_self,private.customer_relation_display_label(p.display_name) AS name,a.role_code,private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read'] AS eligible,private.team_permissions_for_member(a.id) @> ARRAY['foundation.access','requests.read','accounts.corrections.read'] AS corrections_eligible FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=p_office_id AND a.active AND a.role_code<>'client' AND private.team_user_active(a.user_id,p_office_id)  AND(q='' OR strpos(lower(coalesce(p.display_name,'')),q)>0 OR strpos(CASE a.role_code WHEN 'owner' THEN 'super administrador proprietário' WHEN 'admin' THEN 'administrador' ELSE 'funcionário funcionario' END,q)>0)),paginated AS(SELECT * FROM candidates ORDER BY is_self DESC,name,id LIMIT p_size OFFSET(p_page-1)*p_size)
  SELECT(SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'label',coalesce(p.name,'Membro da equipe'),'role_code',p.role_code,'eligible',p.eligible,'is_self',p.is_self,'corrections_eligible',p.corrections_eligible) ORDER BY is_self DESC,name,id)FROM paginated p),'[]'::jsonb) INTO total,result;
 END IF;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size);
END $$;

CREATE OR REPLACE FUNCTION private.request_detail_record(r public.requests,m public.memberships,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE caps text[]:=private.current_permissions(r.office_id);closed boolean:=r.status IN('concluido','cancelado');
BEGIN
 IF r.category='account_correction' AND private.request_in_scope(r,m) IS NOT TRUE THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE='PT404';END IF;
 IF m.role_code='client' THEN
 RETURN (CASE WHEN r.category='account_correction' THEN jsonb_build_object('correction',private.account_correction_json(r,m)) ELSE '{}'::jsonb END)||private.request_summary(r,true)||jsonb_build_object('portal',true,'assignee_name',(SELECT private.customer_relation_display_label(p.display_name) FROM public.memberships a JOIN public.profiles p ON p.id=a.user_id WHERE a.office_id=r.office_id AND a.id=r.assignee_id),'message',r.message,'services',coalesce((SELECT jsonb_agg(i.snapshot->'definition'->>'name' ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb));END IF;
 RETURN (CASE WHEN r.category='account_correction' THEN jsonb_build_object('correction',private.account_correction_json(r,m)) ELSE '{}'::jsonb END)||private.request_summary(r,false)||jsonb_build_object('portal',false,'customer_id',r.customer_id,'message',r.message,'priority_reason',r.priority_reason,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'snapshot',i.snapshot,'fields',i.fields,'participant_ids',i.participant_ids,'checklist',i.checklist) ORDER BY i.created_at,i.id) FROM public.request_items i WHERE i.office_id=r.office_id AND i.request_id=r.id),'[]'::jsonb),
 'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.id,'kind',h.kind,'actor_id',h.actor_id,'actor_name',private.customer_relation_display_label(p.display_name),'reason',h.reason,'from_status',h.from_status,'to_status',h.to_status,'from_assignee',h.from_assignee,'to_assignee',h.to_assignee,'created_at',h.created_at) ORDER BY h.created_at DESC,h.id DESC)
 FROM (SELECT * FROM private.request_history x WHERE x.office_id=r.office_id AND x.request_id=r.id ORDER BY x.created_at DESC,x.id DESC LIMIT 3 OFFSET (p_page-1)*3) h LEFT JOIN public.profiles p ON p.id=h.actor_id),'[]'::jsonb),
 'history_page',p_page,'history_total',(SELECT count(*) FROM private.request_history h WHERE h.office_id=r.office_id AND h.request_id=r.id),
 'can_reclaim',private.request_can_reclaim(r,m),'following_only',NOT private.request_can_work(r,m),'can_update',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.update'],'can_transfer',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.transfer'],'can_cancel',NOT closed AND private.request_can_work(r,m) AND caps @> ARRAY['requests.cancel']);
END $$;

CREATE OR REPLACE FUNCTION private.requests_page(p_office_id uuid,p_query text,p_scope text,p_status text,p_page integer,p_size integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;total bigint;q text;read_all boolean;corrections_allowed boolean;
BEGIN
 m:=private.requests_actor(p_office_id);read_all:=private.current_permissions(p_office_id) @> ARRAY['requests.read_all'];corrections_allowed:=private.current_permissions(p_office_id) @> ARRAY['accounts.corrections.read'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_scope IS NULL OR p_scope NOT IN('mine','queue') OR p_status IS NULL OR p_status NOT IN('','aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado','recebido','em_analise') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;q:=lower(btrim(p_query));
 WITH candidates AS(SELECT r.* FROM public.requests r WHERE r.office_id=p_office_id AND (CASE WHEN m.role_code='client' THEN r.origin='portal' AND r.created_by=m.user_id WHEN r.category='account_correction' THEN corrections_allowed ELSE read_all OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) END)
  AND (p_scope='queue' OR (r.category='account_correction' AND m.role_code<>'client') OR r.created_by=m.user_id OR r.assignee_id=m.id OR (m.role_code<>'client' AND EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id)))
  AND (p_status='' OR CASE WHEN m.role_code='client' THEN private.request_public_status(r.status)=p_status ELSE r.status=p_status END)
  AND (q='' OR strpos(lower(r.title),q)>0 OR strpos(lower(r.protocol),q)>0)),
 paginated AS(SELECT * FROM candidates ORDER BY updated_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT (SELECT count(*) FROM candidates),coalesce((SELECT jsonb_agg(private.request_summary(p,m.role_code='client') ORDER BY p.updated_at DESC,p.id DESC) FROM paginated p),'[]'::jsonb) INTO total,result;
 RETURN jsonb_build_object('items',result,'total',total,'page',p_page,'page_size',p_size,'portal',m.role_code='client');
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
 IF r.category='account_correction' AND (kind='triage' OR (kind='status' AND p_mutation->>'status'='concluido')) THEN RAISE EXCEPTION 'REQUEST_CONFLICT' USING ERRCODE='PT409';END IF;
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
  IF r.category='account_correction' AND NOT private.team_permissions_for_member(next_assignee) @> ARRAY['accounts.corrections.read'] THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
  PERFORM private.request_assignee(p_office_id,next_assignee);
  UPDATE private.request_assignments SET ended_at=clock_timestamp()WHERE office_id=p_office_id AND request_id=r.id AND ended_at IS NULL;
  INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES(p_office_id,r.id,next_assignee,m.user_id);
 END IF;
 UPDATE public.requests SET status=r.status,assignee_id=r.assignee_id,customer_id=r.customer_id,triaged_at=r.triaged_at,version=version+1,updated_at=clock_timestamp()WHERE office_id=p_office_id AND id=r.id RETURNING * INTO r;
 INSERT INTO private.request_history(office_id,request_id,kind,actor_id,reason,from_status,to_status,from_assignee,to_assignee,cancellation_review)VALUES(p_office_id,r.id,CASE WHEN kind='reclaim' THEN 'transfer' ELSE kind END,m.user_id,reason_text,old_status,r.status,old_assignee,r.assignee_id,review);
 IF r.category='account_correction' AND r.status='cancelado' THEN UPDATE private.account_corrections SET state='rejected',reviewed_by=m.user_id,reviewed_at=clock_timestamp() WHERE request_id=r.id AND state='pending';DELETE FROM private.account_email_intents WHERE request_id=r.id;END IF;
 PERFORM private.emit_business_event(p_office_id,'requests.'||CASE kind WHEN 'status' THEN 'status_changed' WHEN 'transfer' THEN 'transferred' WHEN 'reclaim' THEN 'reclaimed' WHEN 'note' THEN 'note_added' ELSE 'triaged' END,'request',r.id,p_event_id,'{}');
 IF NOT private.request_in_scope(r,m) THEN RETURN '{"access_lost":true}'::jsonb;END IF;
 RETURN private.request_detail_record(r,m,1);
END $$;

CREATE OR REPLACE FUNCTION private.notification_visible(n private.internal_notifications,r public.requests,m public.memberships) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT n.office_id=m.office_id AND n.recipient_id=m.id AND CASE WHEN m.role_code='client' THEN n.kind IN('assignee_changed','account_updated') AND private.request_in_scope(r,m)
 ELSE n.kind IN('handoff','pending','account_correction') AND private.current_permissions(m.office_id) @> ARRAY['requests.read'] AND (r.category<>'account_correction' OR private.request_in_scope(r,m)) END;
$$;

CREATE OR REPLACE FUNCTION private.notifications_page(p_office_id uuid,p_query text,p_read text,p_kind text,p_page integer,p_size integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;q text;caps text[];staff_allowed boolean;read_all boolean;corrections_allowed boolean;
BEGIN
 m:=private.notifications_actor(p_office_id);caps:=private.current_permissions(p_office_id);staff_allowed:=m.role_code<>'client' AND caps @> ARRAY['requests.read'];read_all:=caps @> ARRAY['requests.read_all'];corrections_allowed:=caps @> ARRAY['accounts.corrections.read'];
 IF p_query IS NULL OR char_length(p_query)>120 OR p_query ~ '[[:cntrl:]]' OR p_read IS NULL OR p_read NOT IN('all','unread','read') OR p_kind IS NULL OR p_kind NOT IN('all','handoff','pending','assignee_changed','account_correction','account_updated') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) THEN RAISE EXCEPTION 'REQUEST_VALIDATION' USING ERRCODE='PT422';END IF;
 q:=lower(btrim(p_query));
 WITH own AS(
  SELECT n.*,CASE WHEN m.role_code='client' OR r.category='account_correction' OR read_all OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) THEN r.id END AS visible_id,
  CASE WHEN m.role_code='client' OR r.category='account_correction' OR read_all OR r.created_by=m.user_id OR r.assignee_id=m.id OR EXISTS(SELECT FROM private.request_assignments a WHERE a.office_id=r.office_id AND a.request_id=r.id AND a.membership_id=m.id) THEN r.protocol END AS visible_protocol
  FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id
  WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND CASE WHEN m.role_code='client' THEN n.kind IN('assignee_changed','account_updated') AND r.origin='portal' AND r.created_by=m.user_id ELSE staff_allowed AND n.kind IN('handoff','pending','account_correction') AND (r.category<>'account_correction' OR corrections_allowed) END
 ),filtered AS(
  SELECT * FROM own WHERE (p_read='all' OR (p_read='unread' AND read_at IS NULL) OR (p_read='read' AND read_at IS NOT NULL)) AND (p_kind='all' OR kind=p_kind)
  AND (q='' OR strpos(lower(visible_protocol),q)>0 OR (kind='assignee_changed' AND strpos(lower(attendant_name),q)>0))
 ),paged AS(SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET(p_page-1)*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'unread',(SELECT count(*) FROM own WHERE read_at IS NULL),'page',p_page,'page_size',p_size,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'kind',kind,'created_at',created_at,'read_at',read_at,'can_open',visible_id IS NOT NULL,'request_id',visible_id,'protocol',visible_protocol,'attendant_name',CASE WHEN kind='assignee_changed' THEN attendant_name END) ORDER BY created_at DESC,id DESC) FROM paged),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION private.notifications_summary(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;caps text[];
BEGIN
 m:=private.notifications_actor(p_office_id);caps:=private.current_permissions(p_office_id);
 IF m.role_code='client' THEN RETURN jsonb_build_object('unread',(SELECT count(*) FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND n.read_at IS NULL AND n.kind IN('assignee_changed','account_updated') AND r.origin='portal' AND r.created_by=m.user_id));END IF;
 IF NOT caps @> ARRAY['requests.read'] THEN RETURN '{"unread":0}'::jsonb;END IF;
 RETURN jsonb_build_object('unread',(SELECT count(*) FROM private.internal_notifications n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id WHERE n.office_id=p_office_id AND n.recipient_id=m.id AND n.read_at IS NULL AND n.kind IN('handoff','pending','account_correction') AND (r.category<>'account_correction' OR caps @> ARRAY['accounts.corrections.read'])));
END $$;
CREATE OR REPLACE FUNCTION private.checklists_notifications(p_office_id uuid,p_page integer,p_size integer,p_unread_only boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.memberships;result jsonb;
BEGIN
 m:=private.requests_actor(p_office_id);
 IF m.role_code='client' THEN RAISE EXCEPTION 'CHECKLIST_FORBIDDEN' USING ERRCODE='PT403';END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_size IS NULL OR p_size NOT IN(3,5) OR p_unread_only IS NULL THEN RAISE EXCEPTION 'CHECKLIST_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH own AS(SELECT * FROM private.internal_notifications WHERE office_id=p_office_id AND recipient_id=m.id AND kind IN('handoff','pending') AND EXISTS(SELECT FROM public.requests r WHERE r.id=request_id AND(r.category<>'account_correction' OR private.request_in_scope(r,m)))),paged AS(SELECT * FROM own WHERE NOT p_unread_only OR read_at IS NULL ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM own WHERE NOT p_unread_only OR read_at IS NULL),'unread',(SELECT count(*) FROM own WHERE read_at IS NULL),'page',p_page,'page_size',p_size,
 'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'created_at',n.created_at,'read_at',n.read_at,'can_open',private.request_in_scope(r,m) IS TRUE AND private.current_permissions(p_office_id) @> ARRAY['checklists.read'],
 'request_id',CASE WHEN private.request_in_scope(r,m) IS TRUE AND private.current_permissions(p_office_id) @> ARRAY['checklists.read'] THEN r.id END,'protocol',CASE WHEN private.request_in_scope(r,m) IS TRUE AND private.current_permissions(p_office_id) @> ARRAY['checklists.read'] THEN r.protocol END) ORDER BY n.created_at DESC,n.id DESC) FROM paged n JOIN public.requests r ON r.office_id=n.office_id AND r.id=n.request_id),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION private.account_linked_customers(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_validate(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_values(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_version(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_record(public.memberships) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_read(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_read(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.account_write_fields(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_prepare_email(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_save(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_save(uuid,text,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.account_correction_create(uuid,text,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_correction_create(uuid,text,jsonb,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.account_correction_json(public.requests,public.memberships) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_correction_apply(uuid,uuid,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.account_correction_apply(uuid,uuid,integer,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.account_auth_email_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.account_auth_email_sync() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.account_read(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_read(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.account_save(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_save(uuid,text,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.account_correction_create(uuid,text,jsonb,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_correction_create(uuid,text,jsonb,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.account_correction_apply(uuid,uuid,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_correction_apply(uuid,uuid,integer,jsonb,uuid) TO authenticated;
CREATE OR REPLACE FUNCTION private.team_verify_invitation(p_invitation_id uuid,p_full_name text,p_cpf text,p_role_code text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation private.team_invitations; digits text; password_exists boolean;
BEGIN
 invitation:=private.team_recipient(p_invitation_id,true);
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'TEAM_VALIDATION' USING ERRCODE='PT422'; END IF;
 IF invitation.attempts_started_at IS NULL OR invitation.attempts_started_at<=clock_timestamp()-interval '15 minutes' THEN
  invitation.attempts:=0; invitation.attempts_started_at:=clock_timestamp();
 END IF;
 IF invitation.attempts>=5 THEN RETURN jsonb_build_object('verified',false,'code','TEAM_RATE_LIMIT'); END IF;
 digits:=private.team_normalize_cpf(p_cpf);
 IF digits IS NULL OR private.team_normalize_name(p_full_name) IS DISTINCT FROM private.team_normalize_name(invitation.full_name)
  OR p_role_code IS DISTINCT FROM invitation.role_code OR extensions.crypt(digits,invitation.cpf_hash) IS DISTINCT FROM invitation.cpf_hash THEN
  UPDATE private.team_invitations SET attempts=invitation.attempts+1,attempts_started_at=invitation.attempts_started_at,
   verified_user_id=NULL,verified_session_id=NULL,verified_until=NULL,verified_password_fingerprint=NULL WHERE id=invitation.id;
  RETURN jsonb_build_object('verified',false,'code','IDENTITY_MISMATCH');
 END IF;
 UPDATE private.team_invitations SET attempts=0,attempts_started_at=NULL,verified_user_id=auth.uid(),
  verified_session_id=(auth.jwt()->>'session_id')::uuid,verified_until=clock_timestamp()+interval '15 minutes',
  verified_password_fingerprint=CASE WHEN invitation.verified_user_id=auth.uid()
    AND invitation.verified_session_id::text=(auth.jwt()->>'session_id') AND invitation.verified_until>clock_timestamp()
    AND invitation.verified_password_fingerprint IS NOT NULL THEN invitation.verified_password_fingerprint
   ELSE (SELECT encode(extensions.digest(coalesce(encrypted_password,''),'sha256'),'hex') FROM auth.users WHERE id=auth.uid()) END
  WHERE id=invitation.id;
 PERFORM private.team_audit(invitation.office_id,auth.uid(),'team.invitation_verified','invitation',invitation.id,p_request_id,'{}');
 INSERT INTO private.account_data(user_id,cpf) VALUES(auth.uid(),digits) ON CONFLICT(user_id) DO UPDATE SET cpf=coalesce(private.account_data.cpf,EXCLUDED.cpf),updated_at=clock_timestamp();
 PERFORM private.team_require_identity();
 password_exists:=private.team_has_password(invitation.id);
 RETURN jsonb_build_object('verified',true,'has_password',password_exists);
END $$;
NOTIFY pgrst, 'reload schema';
