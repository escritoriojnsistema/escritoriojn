-- Public client signup acknowledgments are captured once by the existing Auth
-- INSERT trigger. User metadata is only a declaration, never authority or grants.
-- Deploy the signup UI sending this exact declaration before enabling this gate.
CREATE TABLE private.client_registration_acceptances (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
 office_id uuid NOT NULL REFERENCES public.offices(id) ON DELETE RESTRICT,
 policy_version text NOT NULL CHECK (policy_version='2026-11-12.1'),
 terms_accepted boolean NOT NULL CHECK (terms_accepted),
 privacy_accepted boolean NOT NULL CHECK (privacy_accepted),
 necessary_cookies_acknowledged boolean NOT NULL CHECK (necessary_cookies_acknowledged),
 optional_cookies boolean NOT NULL CHECK (NOT optional_cookies),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX client_registration_acceptances_office_idx ON private.client_registration_acceptances(office_id);
ALTER TABLE private.client_registration_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.client_registration_acceptances FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE private.client_registration_acceptances IS
 'Immutable new-public-registration declarations only; no backfill or permission source. Cookies acknowledge the necessary-only notice, never optional tracking.';
COMMENT ON COLUMN private.client_registration_acceptances.policy_version IS
 'Common version of the Terms, Privacy notice and necessary-only Cookies/preferences notice shown at signup.';

CREATE FUNCTION private.guard_client_registration_acceptance() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Registration acknowledgment is immutable.' USING ERRCODE='55000';
END $$;
CREATE TRIGGER client_registration_acceptances_immutable
 BEFORE UPDATE OR DELETE ON private.client_registration_acceptances
 FOR EACH ROW EXECUTE FUNCTION private.guard_client_registration_acceptance();
CREATE TRIGGER client_registration_acceptances_no_truncate
 BEFORE TRUNCATE ON private.client_registration_acceptances
 FOR EACH STATEMENT EXECUTE FUNCTION private.guard_client_registration_acceptance();
REVOKE ALL ON FUNCTION private.guard_client_registration_acceptance() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve trusted team invitations and the disabled/unconfigured bootstrap.
-- Validation fails the entire Auth INSERT transaction before any profile or
-- membership is created. Later metadata updates never create or rewrite evidence.
CREATE OR REPLACE FUNCTION private.register_new_client() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target_office uuid; membership_uuid uuid; safe_name text;
BEGIN
 IF NEW.email IS NOT NULL AND EXISTS (SELECT FROM private.team_invitations i WHERE i.email=lower(btrim(NEW.email))
  AND i.status='pending' AND i.expires_at>clock_timestamp() AND private.team_invitation_authority(i.id)) THEN RETURN NEW; END IF;
 SELECT c.office_id INTO target_office FROM private.client_registration_settings c
  JOIN public.offices o ON o.id=c.office_id AND o.active WHERE c.singleton AND c.enabled;
 IF target_office IS NULL OR NEW.email IS NULL OR NEW.is_anonymous THEN RETURN NEW; END IF;
 IF (NEW.raw_user_meta_data->'jn_client_acceptance') IS DISTINCT FROM
  '{"version":"2026-11-12.1","terms":true,"privacy":true,"cookies":true,"optional_cookies":false}'::jsonb THEN
  RAISE EXCEPTION 'REGISTRATION_ACCEPTANCE_REQUIRED' USING ERRCODE='PT422';
 END IF;
 IF jsonb_typeof(NEW.raw_user_meta_data->'display_name')='string' THEN safe_name:=nullif(left(btrim(NEW.raw_user_meta_data->>'display_name'),120),''); END IF;
 INSERT INTO public.profiles(id,display_name,created_by,created_by_db_role) VALUES(NEW.id,safe_name,NULL,session_user);
 INSERT INTO public.memberships(office_id,user_id,role_code,created_by,created_by_db_role)
 VALUES(target_office,NEW.id,'client',NULL,session_user) RETURNING id INTO membership_uuid;
 INSERT INTO private.client_registration_acceptances(user_id,office_id,policy_version,terms_accepted,privacy_accepted,necessary_cookies_acknowledged,optional_cookies)
 VALUES(NEW.id,target_office,'2026-11-12.1',true,true,true,false);
 INSERT INTO public.audit_events(office_id,actor_kind,actor_db_role,action,target_type,target_id,changes)
 VALUES(target_office,'operator',session_user,'auth.client_registered','membership',membership_uuid,jsonb_build_object('role_code','client'));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.register_new_client() FROM PUBLIC,anon,authenticated,service_role;
