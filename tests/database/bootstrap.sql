-- Provider contract only. Fixtures never leave the disposable Docker container.
CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO migrator, anon, authenticated;
GRANT SELECT, REFERENCES ON auth.users TO migrator;
GRANT EXECUTE ON FUNCTION auth.uid() TO migrator, anon, authenticated;
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
