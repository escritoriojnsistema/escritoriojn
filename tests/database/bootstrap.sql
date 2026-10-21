-- Provider contract only. Fixtures never leave the disposable Docker container.
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  encrypted_password text,
  invited_at timestamptz,
  is_anonymous boolean NOT NULL DEFAULT false,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);
CREATE TABLE auth.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  not_after timestamptz
);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO migrator, anon, authenticated;
GRANT SELECT, REFERENCES, TRIGGER ON auth.users TO migrator;
GRANT SELECT ON auth.sessions TO migrator;
GRANT EXECUTE ON FUNCTION auth.uid() TO migrator, anon, authenticated;
-- Existing hosted event-trigger function, including its overly broad defaults.
SET ROLE migrator;
CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN RETURN; END; $$;
RESET ROLE;
CREATE EVENT TRIGGER test_provider_rls_default ON ddl_command_end WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.rls_auto_enable();
-- Simulate broad hosted defaults. The migration must revoke them explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA test;
CREATE FUNCTION test.assert_true(actual boolean, label text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF actual IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: %', label;
  END IF;
  RETURN 'PASS: ' || label;
END;
$$;
GRANT USAGE ON SCHEMA test TO anon, authenticated, migrator, service_role;
GRANT EXECUTE ON FUNCTION test.assert_true(boolean, text) TO anon, authenticated, migrator, service_role;
CREATE FUNCTION test.expect_error(statement text, expected_state text, label text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'FAIL: % (expected %, actual %)', label, expected_state, actual_state;
  END IF;
  RETURN 'PASS: ' || label;
END;
$$;
GRANT EXECUTE ON FUNCTION test.expect_error(text,text,text) TO authenticated,anon,service_role,migrator;

-- Provider-shaped Storage stub. The provider grants the local limited migrator
-- table ownership here; the application migration never changes provider roles/owners.
CREATE SCHEMA storage;
GRANT USAGE,CREATE ON SCHEMA storage TO migrator;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
SET ROLE migrator;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text NOT NULL,owner_id text,metadata jsonb,UNIQUE(bucket_id,name));
CREATE FUNCTION storage.operation()RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('storage.operation',true);$$;
CREATE FUNCTION storage.allow_any_operation(operations text[])RETURNS boolean LANGUAGE sql STABLE AS $$SELECT coalesce(regexp_replace(storage.operation(),'^storage\.','')=ANY(operations),false);$$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
GRANT SELECT ON storage.buckets TO anon,authenticated,service_role;
RESET ROLE;
