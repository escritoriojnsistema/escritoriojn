-- Provider contract only. Fixtures never leave the disposable Docker container.
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
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
