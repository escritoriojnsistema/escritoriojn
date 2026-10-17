import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const images = {
  postgres: 'postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826',
  auth: 'public.ecr.aws/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',
  rest: 'public.ecr.aws/supabase/postgrest:v16.4@sha256:d155c6718ed9a9f990d159a2ab7c0a3f16944dbb6d0a0344557421042acfe0df',
  mail: 'public.ecr.aws/supabase/mailpit:v1.31.3@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d',
};

/** Disposable local Auth, REST and SMTP. It cannot connect to a hosted database. */
export async function createAuthLab() {
  const id = randomUUID();
  const network = `jn-auth-lab-${id}`;
  const names = Object.fromEntries(Object.keys(images).map(key => [key, `${network}-${key}`]));
  const passwords = Object.fromEntries(['postgres', 'auth', 'rest'].map(key => [key, randomBytes(24).toString('hex')]));
  const jwtSecret = randomBytes(48).toString('hex');
  const secrets = [jwtSecret, ...Object.values(passwords)];
  const redact = value => secrets.reduce((text, secret) => text.replaceAll(secret, '[redacted]'), String(value));
  const issuedAt = Math.floor(Date.now() / 1000);
  const keyFor = role => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: issuedAt, exp: issuedAt + 86400 })).toString('base64url');
    const body = `${header}.${payload}`;
    return `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`;
  };
  const anonKey = keyFor('anon');
  const serviceRoleKey = keyFor('service_role');
  const schemaKey = keyFor('authenticated');
  secrets.push(anonKey, serviceRoleKey, schemaKey);
  const containers = new Set();
  const upstreams = {};
  let networkCreated = false;
  let closing;
  let closed = false;

  // Keep session proxy/CA settings, but never inherit a remote Docker selector.
  const docker = (args, { input, env = {}, timeout = 60000 } = {}) => new Promise((resolve, reject) => {
    const commandEnv = { ...process.env, ...env };
    for (const key of Object.keys(commandEnv)) if (key.startsWith('DOCKER_')) delete commandEnv[key];
    const child = spawn('docker', ['--host=unix:///var/run/docker.sock', ...args], {
      env: commandEnv, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let size = 0;
    let failure;
    const timer = setTimeout(() => {
      failure = new Error('Local Auth laboratory Docker command timed out.');
      child.kill('SIGKILL');
    }, timeout);
    for (const [stream, append] of [[child.stdout, text => { stdout += text; }], [child.stderr, text => { stderr += text; }]]) {
      stream.setEncoding('utf8');
      stream.on('data', text => {
        size += Buffer.byteLength(text);
        if (size > 4 * 1024 * 1024) {
          failure = new Error('Local Auth laboratory command exceeded its output limit.');
          child.kill('SIGKILL');
        } else append(text);
      });
    }
    child.on('error', error => { clearTimeout(timer); reject(new Error(redact(error.message))); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(redact(stderr.trim() || `Local Docker command exited with status ${code}.`)));
      else resolve(stdout);
    });
    child.stdin.on('error', () => { /* A failed command can close stdin before receiving SQL. */ });
    child.stdin.end(input);
  });

  const sql = async (query, user = 'postgres') => {
    if (closed) throw new Error('Local Auth laboratory is closed.');
    if (!['postgres', 'migrator', 'anon', 'authenticated', 'service_role', 'supabase_auth_admin', 'authenticator'].includes(user)) {
      throw new Error('Unknown local laboratory database role.');
    }
    return docker(['exec', '-i', names.postgres, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t',
      '-U', user, '-d', 'auth_lab'], { input: query });
  };

  const gateway = createServer((request, response) => {
    const origin = request.headers.origin;
    const cors = ['http://127.0.0.1:3005', 'http://localhost:3005'].includes(origin)
      ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
    const target = request.url?.match(/^\/(auth|rest)\/v1(?=\/|\?|$)/);
    if (!target) { response.writeHead(404).end(); return; }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...cors,
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info, x-supabase-api-version, prefer, accept-profile, content-profile',
      }).end();
      return;
    }
    const port = upstreams[target[1]];
    if (!port) { response.writeHead(503).end(); return; }
    let path = request.url.slice(target[0].length);
    if (!path || path.startsWith('?')) path = `/${path}`;
    const proxy = httpRequest({ hostname: '127.0.0.1', port, method: request.method, path,
      headers: { ...request.headers, 'x-forwarded-host': request.headers.host, 'x-forwarded-proto': 'http' },
      timeout: 15000,
    }, upstream => {
      response.writeHead(upstream.statusCode ?? 502, { ...upstream.headers, ...cors });
      upstream.pipe(response);
    });
    proxy.on('timeout', () => proxy.destroy());
    proxy.on('error', () => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json', ...cors });
      response.end('{"error":"Local Auth laboratory upstream unavailable."}');
    });
    request.on('aborted', () => proxy.destroy());
    request.pipe(proxy);
  });

  const close = () => {
    if (closing) return closing;
    closed = true;
    closing = (async () => {
      if (gateway.listening) {
        const stopped = new Promise(resolve => gateway.close(resolve));
        gateway.closeAllConnections();
        await stopped;
      }
      const removed = await Promise.allSettled([...containers].map(name => docker(['rm', '--force', name])));
      const errors = removed.filter(result => result.status === 'rejected').map(result => result.reason.message);
      if (networkCreated) {
        try { await docker(['network', 'rm', network]); } catch (error) { errors.push(error.message); }
      }
      if (errors.length) throw new Error(`Local Auth laboratory cleanup failed: ${errors.join('; ')}`);
    })();
    return closing;
  };

  const run = async (kind, env, extra = []) => {
    const name = names[kind];
    const result = await docker(['run', '--detach', '--pull=missing', '--name', name,
      '--label', `jn.auth-lab=${id}`, '--network', network, '--network-alias', kind,
      ...Object.keys(env).flatMap(key => ['--env', key]), ...extra, images[kind]], { env });
    containers.add(name);
    return result;
  };
  const portFor = async (kind, port) => {
    const mapping = (await docker(['port', names[kind], `${port}/tcp`])).trim();
    const match = mapping.match(/^127\.0\.0\.1:(\d+)$/);
    if (!match) throw new Error('Local laboratory port was not restricted to loopback.');
    return Number(match[1]);
  };
  const ready = async (label, check, kind) => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try { if (await check()) return; } catch { /* Service is still starting. */ }
      if ((await docker(['inspect', '--format', '{{.State.Running}}', names[kind]])).trim() !== 'true') {
        const logs = await docker(['logs', '--tail', '30', names[kind]]);
        throw new Error(`${label} stopped during local startup: ${redact(logs)}`);
      }
      await delay(250);
    }
    throw new Error(`${label} did not become ready within 60 seconds.`);
  };
  const healthy = async url => (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok;

  try {
    await new Promise((resolve, reject) => {
      gateway.once('error', reject);
      gateway.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${gateway.address().port}`;
    await docker(['network', 'create', '--label', `jn.auth-lab=${id}`, network]);
    networkCreated = true;
    await run('postgres', { POSTGRES_PASSWORD: passwords.postgres, POSTGRES_DB: 'auth_lab' },
      ['--tmpfs', '/var/lib/postgresql/data:rw,nosuid,noexec,size=512m']);
    await ready('PostgreSQL', async () => {
      const logs = await docker(['logs', names.postgres]);
      if (!logs.includes('PostgreSQL init process complete; ready for start up.')) return false;
      await sql('SELECT 1;');
      return true;
    }, 'postgres');
    await sql(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE ROLE migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
      CREATE ROLE supabase_auth_admin LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${passwords.auth}';
      CREATE ROLE authenticator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${passwords.rest}';
      GRANT anon, authenticated, service_role TO authenticator;
      ALTER DATABASE auth_lab OWNER TO migrator;
      ALTER SCHEMA public OWNER TO migrator;
      CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
      ALTER ROLE supabase_auth_admin SET search_path = auth;
      GRANT CONNECT ON DATABASE auth_lab TO supabase_auth_admin, authenticator;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    await run('mail', { MP_MAX_MESSAGES: '100' }, ['--publish', '127.0.0.1::8025']);
    const mailUrl = `http://127.0.0.1:${await portFor('mail', 8025)}`;
    await ready('Mailpit', () => healthy(`${mailUrl}/api/v1/messages`), 'mail');
    await run('auth', {
      GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: url,
      GOTRUE_SITE_URL: 'http://127.0.0.1:3005',
      GOTRUE_URI_ALLOW_LIST: 'http://127.0.0.1:3005/auth/callback,http://127.0.0.1:3005/auth/callback?**,http://localhost:3005/auth/callback,http://localhost:3005/auth/callback?**',
      GOTRUE_DB_DRIVER: 'postgres',
      GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${passwords.auth}@postgres:5432/auth_lab?sslmode=disable`,
      GOTRUE_DB_NAMESPACE: 'auth', GOTRUE_JWT_SECRET: jwtSecret, GOTRUE_JWT_EXP: '3600',
      GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_ISSUER: `${url}/auth/v1`,
      GOTRUE_DISABLE_SIGNUP: 'false', GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'false',
      GOTRUE_EXTERNAL_PHONE_ENABLED: 'false', GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: 'false',
      GOTRUE_MFA_ENABLED: 'false', GOTRUE_MFA_MAX_ENROLLED_FACTORS: '0',
      GOTRUE_MFA_TOTP_ENROLL_ENABLED: 'false', GOTRUE_MFA_TOTP_VERIFY_ENABLED: 'false',
      GOTRUE_MFA_PHONE_ENROLL_ENABLED: 'false', GOTRUE_MFA_PHONE_VERIFY_ENABLED: 'false',
      GOTRUE_MFA_WEB_AUTHN_ENROLL_ENABLED: 'false', GOTRUE_MFA_WEB_AUTHN_VERIFY_ENABLED: 'false',
      GOTRUE_SMTP_HOST: 'mail', GOTRUE_SMTP_PORT: '1025', GOTRUE_SMTP_ADMIN_EMAIL: 'noreply@example.test',
      GOTRUE_SMTP_SENDER_NAME: 'Local Auth Lab', GOTRUE_SMTP_MAX_FREQUENCY: '0s',
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_INVITE: '/auth/v1/verify',
      GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify', GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: '/auth/v1/verify',
      GOTRUE_RATE_LIMIT_EMAIL_SENT: '10000', GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '10000',
      GOTRUE_RATE_LIMIT_VERIFY: '10000', GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UP: '10000',
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true', GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL: '10',
      GOTRUE_LOG_LEVEL: 'error',
    }, ['--publish', '127.0.0.1::9999']);
    upstreams.auth = await portFor('auth', 9999);
    await ready('GoTrue', () => healthy(`${url}/auth/v1/health`), 'auth');
    // Auth is owned and migrated by GoTrue; the app migrator gets only its provider contract.
    await sql(`
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
      $$;
      CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT coalesce(nullif(current_setting('request.jwt.claim', true), ''),
          nullif(current_setting('request.jwt.claims', true), ''))::jsonb;
      $$;
      GRANT USAGE ON SCHEMA auth TO migrator, anon, authenticated, service_role;
      GRANT SELECT, REFERENCES, TRIGGER ON auth.users TO migrator;
      GRANT SELECT ON auth.sessions TO migrator;
      -- GoTrue enables RLS with no policies. Hosted operator-owned helpers can
      -- read these provider rows; model that contract for this restricted local
      -- migrator explicitly, without granting BYPASSRLS or exposing Auth to API roles.
      CREATE POLICY auth_lab_migrator_users_read ON auth.users FOR SELECT TO migrator USING (true);
      CREATE POLICY auth_lab_migrator_sessions_read ON auth.sessions FOR SELECT TO migrator USING (true);
      GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO migrator, anon, authenticated, service_role;
    `);
    await run('rest', {
      PGRST_DB_URI: `postgres://authenticator:${passwords.rest}@postgres:5432/auth_lab?sslmode=disable`,
      PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: jwtSecret,
      PGRST_SERVER_PORT: '3000', PGRST_LOG_LEVEL: 'error',
    }, ['--publish', '127.0.0.1::3000']);
    upstreams.rest = await portFor('rest', 3000);
    await ready('PostgREST', () => healthy(`${url}/rest/v1/`), 'rest');

    const migrate = async () => {
      const directory = `${root}supabase/migrations`;
      const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
      const migrations = await Promise.all(files.map(name => readFile(`${directory}/${name}`, 'utf8')));
      await sql(`BEGIN;\n${migrations.join('\n')}\nNOTIFY pgrst, 'reload schema';\nCOMMIT;`, 'migrator');
      // PostgREST processes NOTIFY asynchronously. Wait for its own schema cache to see the app RPCs.
      const expected = [...new Set(migrations.flatMap(text => [...text.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.([a-z_][a-z0-9_]*)\s*\(/gi)].map(match => match[1])))];
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        const response = await fetch(`${url}/rest/v1/`, { headers: { Authorization: `Bearer ${schemaKey}` }, signal: AbortSignal.timeout(2000) });
        if (response.ok) {
          const schema = await response.json();
          if (expected.every(name => schema.paths?.[`/rpc/${name}`])) return;
        }
        await delay(100);
      }
      throw new Error('Application migrations committed, but PostgREST schema cache did not refresh in 10 seconds.');
    };
    return { url, anonKey, serviceRoleKey, mailUrl, sql, migrate, close };
  } catch (error) {
    try { await close(); } catch (cleanupError) {
      throw new Error(`${redact(error.message)} Cleanup: ${cleanupError.message}`);
    }
    throw new Error(redact(error.message));
  }
}
