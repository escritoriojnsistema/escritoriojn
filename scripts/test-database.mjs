import { execFileSync, spawn } from 'node:child_process';
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

const openSql = database => {
  const child = spawn('docker', ['--host=unix:///var/run/docker.sock', 'exec', '-i', name,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t', '-U', 'postgres', '-d', database],
  { env: dockerEnv, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { errors += chunk.toString(); });
  const result = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors || `psql terminou ${code}`)));
  });
  // Install a rejection handler immediately, including while waiting on the other connection.
  result.catch(() => {});
  return { child, result, output: () => output };
};

const until = async predicate => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await delay(20);
  }
  throw new Error('Barreira de concorrência não foi observada em 2s.');
};

const raceLastOwners = async database => {
  const first = openSql(database);
  let second;
  try {
    first.child.stdin.write(`SET application_name='jn_team_race_a';
      BEGIN;
      SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000021","session_id":"00000000-0000-4000-c000-000000000021"}';
      SELECT public.team_set_member('00000000-0000-4000-e000-000000000021','00000000-0000-4000-b000-000000000021','employee',false,ARRAY['foundation.access'],gen_random_uuid());
      \\echo RACE_LOCK_HELD
    `);
    await until(() => first.output().includes('RACE_LOCK_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_team_race_b';
      SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000022","session_id":"00000000-0000-4000-c000-000000000022"}';
      SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000021','00000000-0000-4000-b000-000000000022','employee',false,ARRAY['foundation.access'],gen_random_uuid())$q$,'PT409','segunda mutacao concorrente preserva ultimo owner');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_team_race_b' AND wait_event_type='Lock');").trim() === 't');
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    const secondResult = await second.result;
    return `PASS: lock de escritorio serializa duas conexoes reais\n${secondResult}` + sql(database, 'postgres', `
      SELECT test.assert_true((SELECT count(*) FROM public.memberships WHERE office_id='00000000-0000-4000-e000-000000000021' AND active AND role_code='owner')=1
        AND (SELECT count(*) FROM public.audit_events WHERE office_id='00000000-0000-4000-e000-000000000021' AND action='team.member_updated')=1,
        'corrida conserva um owner ativo e audita somente mutacao confirmada');
    `);
  } finally {
    first.child.kill();
    second?.child.kill();
  }
};

const raceRevokedSession = async database => {
  const first = openSql(database);
  let second;
  try {
    first.child.stdin.write(`BEGIN;
      SELECT id FROM public.offices WHERE id='00000000-0000-4000-e000-000000000021' FOR UPDATE;
      \\echo SESSION_LOCK_HELD
    `);
    await until(() => first.output().includes('SESSION_LOCK_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_team_session_b';
      SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000022","session_id":"00000000-0000-4000-c000-000000000022"}';
      SELECT test.expect_error($q$SELECT public.team_set_member('00000000-0000-4000-e000-000000000021','00000000-0000-4000-b000-000000000021','employee',true,ARRAY['foundation.access'],gen_random_uuid())$q$,'PT401','logout durante espera no lock nega mutacao');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_team_session_b' AND wait_event_type='Lock');").trim() === 't');
    sql(database, 'postgres', "DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000022';");
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    const result = await second.result;
    return result + sql(database, 'postgres', `SELECT test.assert_true(
      NOT (SELECT active FROM public.memberships WHERE id='00000000-0000-4000-b000-000000000021'),
      'sessao revogada enquanto aguardava lock nao alterou vinculo');`);
  } finally {
    first.child.kill();
    second?.child.kill();
  }
};

const raceRecipientEmail = async database => {
  const invitation = sql(database, 'postgres', "SELECT id FROM private.team_invitations WHERE email='lock-email@example.test';").trim();
  if (!/^[0-9a-f-]{36}$/.test(invitation)) throw new Error('Fixture de convite concorrente ausente.');
  const first = openSql(database);
  let second;
  try {
    first.child.stdin.write(`BEGIN;
      SELECT id FROM public.offices WHERE id='00000000-0000-4000-e000-000000000011' FOR UPDATE;
      \\echo EMAIL_LOCK_HELD
    `);
    await until(() => first.output().includes('EMAIL_LOCK_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_team_email_b';
      SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000019","session_id":"00000000-0000-4000-c000-000000000019"}';
      SELECT test.expect_error($q$SELECT public.team_verify_invitation('${invitation}','Email Ficticio','52998224725','employee',gen_random_uuid())$q$,'PT410','mudanca de email enquanto aguarda lock nega conferencia');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_team_email_b' AND wait_event_type='Lock');").trim() === 't');
    sql(database, 'postgres', "UPDATE auth.users SET email='changed-while-waiting@example.test' WHERE id='00000000-0000-4000-a000-000000000019';");
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    const result = await second.result;
    return result + sql(database, 'postgres', `SELECT test.assert_true(
      (SELECT verified_user_id IS NULL FROM private.team_invitations WHERE id='${invitation}'),
      'email divergente apos lock nao gerou autorizacao de aceite');`);
  } finally {
    first.child.kill();
    second?.child.kill();
  }
};

let started = false;
try {
  docker('run', '--rm', '--detach', '--network=none', '--name', name, '--tmpfs', '/var/lib/postgresql/data:rw,nosuid,noexec,size=512m',
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
    const result = sql(database, 'postgres', readFileSync(`${root}tests/database/access.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/auth.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/team.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/team-concurrency.sql`, 'utf8'))
      + await raceLastOwners(database)
      + await raceRevokedSession(database)
      + await raceRecipientEmail(database);
    console.log(`${database} (${result.split('\n').filter(line => line.startsWith('PASS:')).length} verificações):\n${result.trim()}`);
  }
  console.log('PASS: dois replays vazios, migrador sem superusuário/BYPASSRLS e ACL/RLS/RPC reais.');
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) docker('rm', '--force', name);
}
