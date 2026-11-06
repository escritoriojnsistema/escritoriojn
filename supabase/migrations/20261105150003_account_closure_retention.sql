-- Closure is an access decision. It never deletes business/Auth FK history.
CREATE TABLE private.account_closures(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(reason IN('privacy','unused','service','other')),
 observation text CHECK(char_length(observation)<=1000),notice_version text NOT NULL DEFAULT '2026-11-05',
 acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.closed_account_offices(
 user_id uuid NOT NULL REFERENCES private.account_closures(user_id),office_id uuid NOT NULL REFERENCES public.offices(id),
 membership_id uuid NOT NULL REFERENCES public.memberships(id),customer_id uuid REFERENCES public.customers(id),
 PRIMARY KEY(user_id,office_id)
);
CREATE TABLE private.closed_account_documents(
 user_id uuid NOT NULL,office_id uuid NOT NULL,publication_id uuid NOT NULL REFERENCES private.document_publications(id),
 PRIMARY KEY(user_id,office_id,publication_id),FOREIGN KEY(user_id,office_id) REFERENCES private.closed_account_offices(user_id,office_id)
);
-- No legal periods are seeded: prescription is not a universal retention mandate.
CREATE TABLE private.account_retention_policies(
 office_id uuid NOT NULL REFERENCES public.offices(id),data_class text NOT NULL CHECK(data_class IN('registration','request','signed_document','financial','tax','audit','optional')),
 document_type text NOT NULL,legal_basis text,justification text,start_event text,period_days integer CHECK(period_days BETWEEN 0 AND 36525),
 approved_by uuid REFERENCES auth.users(id),approved_at timestamptz,review_at timestamptz,backup_disposition text,
 revision integer NOT NULL DEFAULT 1,PRIMARY KEY(office_id,data_class,document_type),
 CHECK(approved_at IS NULL OR(legal_basis IS NOT NULL AND justification IS NOT NULL AND start_event IS NOT NULL AND period_days IS NOT NULL AND approved_by IS NOT NULL AND review_at IS NOT NULL AND backup_disposition IS NOT NULL))
);
CREATE TABLE private.account_retention_holds(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),office_id uuid NOT NULL REFERENCES public.offices(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 data_class text NOT NULL,reason text NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),released_at timestamptz
);
CREATE INDEX account_retention_holds_active_idx ON private.account_retention_holds(office_id,user_id,data_class) WHERE released_at IS NULL;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['account_closures','closed_account_offices','closed_account_documents','account_retention_policies','account_retention_holds'] LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END$$;
CREATE FUNCTION private.closed_account_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 -- Serialize a new membership with account closure before its FK lock. Existing
 -- updates are serialized by account_close's ordered membership locks/recheck.
 IF TG_OP='INSERT' AND NEW.active THEN PERFORM 1 FROM public.profiles WHERE id=NEW.user_id FOR UPDATE;END IF;
 IF NEW.active AND EXISTS(SELECT FROM private.account_closures WHERE user_id=NEW.user_id) THEN RAISE EXCEPTION 'ACCOUNT_CLOSED' USING ERRCODE='PT403';END IF;RETURN NEW;END$$;
CREATE TRIGGER account_closed_membership BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.closed_account_guard();
-- Wrap the shared deadline predicate too, covering direct current_permissions/RLS callers.
ALTER FUNCTION private.session_activity_valid(uuid,uuid) RENAME TO session_activity_valid_before_closure;
CREATE FUNCTION private.session_activity_valid(p_user_id uuid,p_session_id uuid) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$SELECT NOT EXISTS(SELECT FROM private.account_closures WHERE user_id=p_user_id) AND private.session_activity_valid_before_closure(p_user_id,p_session_id);$$;
CREATE OR REPLACE FUNCTION private.team_require_identity() RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE caller uuid:=auth.uid();sid uuid;BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';END;
 IF caller IS NULL OR sid IS NULL OR NOT private.session_activity_valid(caller,sid) THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='PT401';END IF;RETURN caller;END$$;
CREATE FUNCTION private.account_close(p_office_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;rec record;BEGIN
 actor:=private.team_require_identity();
 PERFORM 1 FROM public.profiles WHERE id=actor FOR UPDATE;
 IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR NOT p_input ?& ARRAY['reason','observation','acknowledged','export_offered'] OR(SELECT count(*) FROM jsonb_object_keys(p_input))<>4 OR p_input->>'reason' NOT IN('privacy','unused','service','other') OR jsonb_typeof(p_input->'reason')<>'string' OR jsonb_typeof(p_input->'observation')<>'string' OR char_length(p_input->>'observation')>1000 OR p_input->'acknowledged' IS DISTINCT FROM 'true'::jsonb OR p_input->'export_offered' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 IF NOT EXISTS(SELECT FROM public.memberships WHERE user_id=actor AND office_id=p_office_id AND active AND role_code='client') OR EXISTS(SELECT FROM public.memberships WHERE user_id=actor AND active AND role_code<>'client') THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 PERFORM 1 FROM public.memberships WHERE user_id=actor ORDER BY office_id FOR UPDATE;
 PERFORM private.team_require_identity();
 IF NOT EXISTS(SELECT FROM public.memberships WHERE user_id=actor AND office_id=p_office_id AND active AND role_code='client') OR EXISTS(SELECT FROM public.memberships WHERE user_id=actor AND active AND role_code<>'client') THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 FOR m IN SELECT * FROM public.memberships WHERE user_id=actor AND role_code='client' LOOP
 PERFORM private.emit_business_event(m.office_id,'account.closed','membership',m.id,gen_random_uuid(),'{}');
 END LOOP;
 INSERT INTO private.account_closures(user_id,reason,observation)VALUES(actor,p_input->>'reason',nullif(btrim(p_input->>'observation'),''));
 FOR m IN SELECT * FROM public.memberships WHERE user_id=actor AND role_code='client' LOOP
 INSERT INTO private.closed_account_offices(user_id,office_id,membership_id,customer_id)VALUES(actor,m.office_id,m.id,(SELECT customer_id FROM private.customer_relations WHERE office_id=m.office_id AND membership_id=m.id AND relation_type='identity' AND revoked_at IS NULL LIMIT 1));
 INSERT INTO private.closed_account_documents SELECT actor,m.office_id,p.id FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE p.office_id=m.office_id AND private.wf_recipient(r,m);
 END LOOP;
 UPDATE public.memberships SET active=false,updated_at=clock_timestamp() WHERE user_id=actor AND active;
 -- Shared DB guards revoke every old/future session immediately; provider cleanup is retriable Edge work.
 DELETE FROM private.session_activities WHERE user_id=actor;
 DELETE FROM private.account_email_intents WHERE user_id=actor AND confirmed_at IS NULL;
 -- Observation has no business/legal purpose after recording the reason category.
 UPDATE private.account_closures SET observation=NULL WHERE user_id=actor;
 RETURN jsonb_build_object('closed',true);
END$$;
CREATE FUNCTION private.account_export_manifest(p_office_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;result jsonb;BEGIN
 actor:=private.team_require_identity();m:=private.requests_actor(p_office_id);
 IF m.role_code<>'client' THEN RAISE EXCEPTION 'ACCOUNT_FORBIDDEN' USING ERRCODE='PT403';END IF;
 SELECT coalesce(jsonb_agg(p.id ORDER BY p.id),'[]') INTO result FROM private.document_publications p JOIN public.documents d ON d.office_id=p.office_id AND d.id=p.document_id JOIN public.requests r ON r.office_id=d.office_id AND r.id=d.request_id WHERE p.office_id=p_office_id AND p.revision=d.revision AND private.wf_recipient(r,m) AND cardinality(private.wf_gate(p,m))=0;
 IF jsonb_array_length(result)>1000 THEN RAISE EXCEPTION 'ACCOUNT_EXPORT_LIMIT' USING ERRCODE='PT422';END IF;
 RETURN jsonb_build_object('ids',result);
END$$;
CREATE FUNCTION private.deleted_accounts_page(p_office_id uuid,p_query text,p_page integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;result jsonb;BEGIN
 actor:=private.governance_actor(p_office_id,'archives.manage');PERFORM private.customers_actor(p_office_id);
 IF p_query IS NULL OR char_length(p_query)>120 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'ACCOUNT_VALIDATION' USING ERRCODE='PT422';END IF;
 WITH eligible AS(SELECT a.user_id id,p.display_name name,c.closed_at FROM private.closed_account_offices a JOIN private.account_closures c USING(user_id) JOIN public.profiles p ON p.id=a.user_id LEFT JOIN public.customers cu ON cu.id=a.customer_id AND cu.office_id=a.office_id WHERE a.office_id=p_office_id AND(a.customer_id IS NULL OR private.customer_in_scope(cu,actor)) AND(p_query='' OR strpos(lower(p.display_name),lower(p_query))>0)) SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM(SELECT * FROM eligible ORDER BY closed_at DESC,id LIMIT 5 OFFSET(p_page-1)*5)v),'[]'),'total',(SELECT count(*) FROM eligible),'page',p_page) INTO result;RETURN result;
END$$;
CREATE FUNCTION private.deleted_account_documents(p_office_id uuid,p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;m public.memberships;result jsonb;BEGIN
 actor:=private.governance_actor(p_office_id,'archives.manage');
 SELECT mb.* INTO m FROM private.closed_account_offices a JOIN public.memberships mb ON mb.id=a.membership_id AND mb.office_id=a.office_id WHERE a.office_id=p_office_id AND a.user_id=p_user_id;
 IF m.id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND' USING ERRCODE='PT404';END IF;
 -- Staff access revalidates the current identity relation without reactivating access.
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title,'ready',cardinality(private.wf_gate(p,NULL))=0)),'[]') INTO result FROM private.closed_account_documents a JOIN private.document_publications p ON p.id=a.publication_id AND p.office_id=a.office_id JOIN public.documents d ON d.id=p.document_id AND d.office_id=p.office_id WHERE a.user_id=p_user_id AND a.office_id=p_office_id AND private.documents_accessible_for_closure(p_office_id,d.id) AND EXISTS(SELECT FROM private.customer_relations cr WHERE cr.office_id=d.office_id AND cr.customer_id=(SELECT customer_id FROM public.requests WHERE id=d.request_id AND office_id=d.office_id) AND cr.membership_id=m.id AND cr.relation_type='identity' AND cr.revoked_at IS NULL AND cr.valid_from<=clock_timestamp());
 RETURN jsonb_build_object('items',result);
END$$;
CREATE FUNCTION private.documents_accessible_for_closure(p_office_id uuid,p_document_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN PERFORM private.documents_access21(p_office_id,(SELECT request_id FROM public.documents WHERE office_id=p_office_id AND id=p_document_id),NULL,p_document_id);RETURN true;EXCEPTION WHEN SQLSTATE 'PT403' OR SQLSTATE 'PT404' THEN RETURN false;END$$;
-- Keep deleted customers out of ordinary lists/options; detail/history retain scope.
DO $$DECLARE signature regprocedure;body text;changed text;BEGIN
 FOR signature IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN('customers_page','request_options','document_options','customer_relation_candidates') LOOP
 body:=pg_get_functiondef(signature);
 changed:=replace(body,'c.office_id=p_office_id AND private.customer_in_scope(c,','c.office_id=p_office_id AND NOT EXISTS(SELECT FROM private.closed_account_offices ca WHERE ca.office_id=c.office_id AND ca.customer_id=c.id) AND private.customer_in_scope(c,');
 changed:=replace(changed,'WHERE office_id=p_office_id AND private.customer_in_scope(customers,','WHERE office_id=p_office_id AND NOT EXISTS(SELECT FROM private.closed_account_offices ca WHERE ca.office_id=customers.office_id AND ca.customer_id=customers.id) AND private.customer_in_scope(customers,');
 IF changed<>body THEN EXECUTE changed;END IF;
 END LOOP;
END$$;
DO $$DECLARE n text;args text;BEGIN FOR n,args IN SELECT * FROM(VALUES
 ('account_close','p_office_id uuid,p_input jsonb'),('account_export_manifest','p_office_id uuid'),('deleted_accounts_page','p_office_id uuid,p_query text,p_page integer'),('deleted_account_documents','p_office_id uuid,p_user_id uuid'))f(n,args) LOOP
 EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='''' AS $f$SELECT private.%I(%s);$f$',n,args,n,CASE n WHEN 'account_close' THEN 'p_office_id,p_input' WHEN 'account_export_manifest' THEN 'p_office_id' WHEN 'deleted_accounts_page' THEN 'p_office_id,p_query,p_page' ELSE 'p_office_id,p_user_id' END);
 EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s),private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',n,args,n,args);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s),private.%I(%s) TO authenticated',n,args,n,args);
 END LOOP;END$$;
REVOKE ALL ON FUNCTION private.closed_account_guard(),private.documents_accessible_for_closure(uuid,uuid),private.session_activity_valid_before_closure(uuid,uuid),private.session_activity_valid(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Existing invoker permission helpers require this predicate, which exposes no PII.
GRANT EXECUTE ON FUNCTION private.session_activity_valid(uuid,uuid) TO authenticated;
ALTER TABLE private.account_closures ADD COLUMN provider_disabled_at timestamptz;
CREATE FUNCTION private.account_provider_pending(p_user_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT jsonb_build_object('ids',coalesce((SELECT jsonb_agg(user_id) FROM(SELECT user_id FROM private.account_closures WHERE provider_disabled_at IS NULL AND(p_user_id IS NULL OR user_id=p_user_id) ORDER BY closed_at LIMIT 20)v),'[]'));$$;
CREATE FUNCTION private.account_provider_complete(p_user_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN UPDATE private.account_closures SET provider_disabled_at=clock_timestamp() WHERE user_id=p_user_id AND provider_disabled_at IS NULL;RETURN jsonb_build_object('recorded',true);END$$;
CREATE FUNCTION public.account_provider_pending(p_user_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.account_provider_pending(p_user_id);$$;
CREATE FUNCTION public.account_provider_complete(p_user_id uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT private.account_provider_complete(p_user_id);$$;
REVOKE ALL ON FUNCTION public.account_provider_pending(uuid),private.account_provider_pending(uuid),public.account_provider_complete(uuid),private.account_provider_complete(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_provider_pending(uuid),private.account_provider_pending(uuid),public.account_provider_complete(uuid),private.account_provider_complete(uuid) TO service_role;

-- GoTrue soft deletion scrubs email/password as well as revoking sessions. Permit
-- that provider mutation only after our committed closure, never for active users.
DO $m$ DECLARE body text;updated text;BEGIN
 body:=pg_get_functiondef('private.account_auth_email_guard()'::regprocedure);
 updated:=replace(body,'IF OLD.email IS NULL', 'IF to_jsonb(NEW)->>''deleted_at'' IS NOT NULL AND nullif(to_jsonb(NEW)->>''encrypted_password'','''') IS NULL AND EXISTS(SELECT FROM private.account_closures WHERE user_id=NEW.id) THEN RETURN NEW;END IF;IF OLD.email IS NULL');
 IF updated=body THEN RAISE EXCEPTION 'Provider closure guard target missing';END IF;EXECUTE updated;
END$m$;
