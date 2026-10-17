import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

// No URL or remote database option: this runner can only mutate its own disposable container.
const root = fileURLToPath(new URL('../', import.meta.url));
const image = 'postgres:17-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826';
const name = `jn-foundation-test-${randomUUID()}`;
const dockerEnv = { ...process.env };
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnv[key];
const docker = (...args) => execFileSync('docker', ['--host=unix:///var/run/docker.sock', ...args], {
  env: dockerEnv, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
});
const sql = (database, user, input) => execFileSync('docker', [
  '--host=unix:///var/run/docker.sock', 'exec', '-i', name,
  'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-U', user, '-d', database,
], { env: dockerEnv, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 });

let started = false;
try {
  docker('run', '--rm', '--detach', '--network=none', '--name', name,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if (docker('logs', name).includes('PostgreSQL init process complete; ready for start up.')) {
        docker('exec', name, 'pg_isready', '-U', 'postgres');
        ready = true;
        break;
      }
    } catch { /* Container initialization is still in progress. */ }
    await delay(500);
  }
  if (!ready) throw new Error('PostgreSQL descartável não iniciou em 60s.');
  sql('postgres', 'postgres', `
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  `);
  const migrations = readdirSync(`${root}supabase/migrations`).filter(name => name.endsWith('.sql')).sort();
  for (const database of ['foundation_replay_a', 'foundation_replay_b']) {
    sql('postgres', 'postgres', `CREATE DATABASE ${database} OWNER migrator;`);
    sql(database, 'postgres', readFileSync(`${root}tests/database/bootstrap.sql`, 'utf8'));
    for (const migration of migrations) {
      sql(database, 'migrator', `BEGIN;\n${readFileSync(`${root}supabase/migrations/${migration}`, 'utf8')}\nCOMMIT;`);
    }
    const result = sql(database, 'postgres', readFileSync(`${root}tests/database/access.sql`, 'utf8'));
    console.log(`${database} (${result.split('\n').filter(line => line.startsWith('PASS:')).length} verificações):\n${result.trim()}`);
  }
  console.log('PASS: dois replays vazios, migrador sem superusuário/BYPASSRLS e ACL/RLS/RPC reais.');
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) docker('rm', '--force', name);
}
