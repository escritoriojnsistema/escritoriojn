import {raceCharges,benchmarkCharges} from './database-charges.mjs';
import {raceAccount} from './database-account.mjs';
import {raceReclaim} from './database-adjustments.mjs';
import { raceChecklists, benchmarkChecklists } from './database-checklists.mjs';
import { raceAttachments, benchmarkAttachments } from './database-attachments.mjs';
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

// Customer mutations must serialize both authority and optimistic versions across real connections.
const customerOffice = '00000000-0000-4000-e000-000000000041';
const customerClaims = '{"sub":"00000000-0000-4000-a000-000000000042","session_id":"00000000-0000-4000-c000-000000000042"}';
const customerRecord = database => {
  const id = sql(database, 'postgres', "SELECT id FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000042' ORDER BY created_at LIMIT 1;").trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Fixture de cliente concorrente ausente.');
  return id;
};
const raceCustomerVersion = async database => {
  const id = customerRecord(database);
  const first = openSql(database);
  let second;
  try {
    first.child.stdin.write(`BEGIN;
      SET ROLE authenticated;
      SET request.jwt.claims='${customerClaims}';
      SELECT public.customer_update('${customerOffice}','${id}','{"kind":"person","name":"Vencedor Concorrente Ficticio","contacts":[{"kind":"phone","value":"11999990000"}]}',2,gen_random_uuid());
      \\echo CUSTOMER_VERSION_HELD
    `);
    await until(() => first.output().includes('CUSTOMER_VERSION_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_customer_version_b';
      SET ROLE authenticated;
      SET request.jwt.claims='${customerClaims}';
      SELECT test.expect_error($q$SELECT public.customer_update('${customerOffice}','${id}','{"kind":"person","name":"Perdedor Concorrente Ficticio","contacts":[]}',2,gen_random_uuid())$q$,'PT409','clientes: duas conexoes nao sobrescrevem a mesma versao');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_customer_version_b' AND wait_event_type='Lock');").trim() === 't');
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    return await second.result + sql(database, 'postgres', `SELECT test.assert_true(
      (SELECT version=3 AND name='Vencedor Concorrente Ficticio' FROM public.customers WHERE id='${id}')
      AND (SELECT count(*) FROM public.customer_contacts WHERE customer_id='${id}' AND value='11999990000')=1
      AND (SELECT count(*) FROM public.audit_events WHERE target_id='${id}' AND action='customers.updated')=2,
      'clientes: corrida conserva vencedor contatos versao e somente auditoria confirmada');`);
  } finally { first.child.kill(); second?.child.kill(); }
};
const raceCustomerDuplicate = async database => {
  const first = openSql(database);
  let second;
  try {
    first.child.stdin.write(`BEGIN;
      SET ROLE authenticated;
      SET request.jwt.claims='${customerClaims}';
      SELECT public.customer_create('${customerOffice}','{"kind":"person","name":"Unico Concorrente Ficticio","identifier":"11144477735","contacts":[]}',gen_random_uuid());
      \\echo CUSTOMER_DUPLICATE_HELD
    `);
    await until(() => first.output().includes('CUSTOMER_DUPLICATE_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_customer_duplicate_b';
      SET ROLE authenticated;
      SET request.jwt.claims='${customerClaims}';
      SELECT test.expect_error($q$SELECT public.customer_create('${customerOffice}','{"kind":"person","name":"Duplicado Concorrente Ficticio","identifier":"111.444.777-35","contacts":[]}',gen_random_uuid())$q$,'PT409','clientes: duas conexoes nao duplicam CPF canonico');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_customer_duplicate_b' AND wait_event_type='Lock');").trim() === 't');
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    return await second.result + sql(database, 'postgres', `SELECT test.assert_true(
      (SELECT count(*) FROM public.customers WHERE office_id='${customerOffice}' AND identifier='11144477735')=1
      AND (SELECT count(*) FROM public.audit_events e JOIN public.customers c ON c.id=e.target_id WHERE c.identifier='11144477735' AND e.action='customers.created')=1,
      'clientes: duplicidade concorrente persiste uma ficha e um evento');`);
  } finally { first.child.kill(); second?.child.kill(); }
};
const raceCustomerRegistration = async database => {
  const first = openSql(database);
  let second;
  try {
    sql(database, 'migrator', `SELECT private.configure_client_registration('${customerOffice}',true);`);
    first.child.stdin.write(`BEGIN;
      SET ROLE authenticated;
      SET request.jwt.claims='${customerClaims}';
      SELECT public.customer_create('${customerOffice}','{"kind":"person","name":"Contato Concorrente Ficticio","contacts":[{"kind":"email","value":"race-registration@example.test"}]}',gen_random_uuid());
      \\echo CUSTOMER_REGISTRATION_HELD
    `);
    await until(() => first.output().includes('CUSTOMER_REGISTRATION_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_customer_registration_b';
      INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
      ('00000000-0000-4000-a000-000000000070','race-registration@example.test',clock_timestamp(),'{"display_name":"Cadastro Concorrente Ficticio"}');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_customer_registration_b' AND wait_event_type='Lock');").trim() === 't');
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    await second.result;
    return sql(database, 'postgres', `SELECT test.assert_true(
      NOT EXISTS(SELECT FROM public.customers WHERE created_by='00000000-0000-4000-a000-000000000070')
      AND (SELECT count(*) FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id
       WHERE m.user_id='00000000-0000-4000-a000-000000000070' AND r.materialized_customer_id IS NULL)=1
      AND (SELECT count(*) FROM public.customer_contacts WHERE office_id='${customerOffice}' AND value='race-registration@example.test')=1,
      'cadastro integrado: contato interno concorrente deixa entrada pendente sem duplicar ficha');`);
  } finally {
    first.child.kill(); second?.child.kill();
    sql(database, 'migrator', `SELECT private.configure_client_registration('${customerOffice}',false);`);
  }
};
const raceUnconfirmedRegistration = async database => {
  const first = openSql(database);
  const user = '00000000-0000-4000-a000-000000000071';
  try {
    sql(database, 'migrator', `SELECT private.configure_client_registration('${customerOffice}',true);`);
    sql(database, 'postgres', `INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
      ('${user}','unconfirmed-lock@example.test','{"display_name":"Cadastro Nao Confirmado"}');`);
    // Bootstrap FKs use KEY SHARE. Intake must not promote that compatible lock
    // to FOR UPDATE before confirmation, which can deadlock concurrent signups.
    first.child.stdin.write(`BEGIN;
      SELECT id FROM public.offices WHERE id='${customerOffice}' FOR KEY SHARE;
      \\echo UNCONFIRMED_KEY_SHARE_HELD
    `);
    await until(() => first.output().includes('UNCONFIRMED_KEY_SHARE_HELD'));
    sql(database, 'migrator', `SET statement_timeout='750ms'; SELECT private.sync_customer_registration('${user}');`);
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    return sql(database, 'postgres', `SELECT test.assert_true(
      NOT EXISTS(SELECT FROM public.customers WHERE created_by='${user}')
      AND NOT EXISTS(SELECT FROM private.customer_registrations r JOIN public.memberships m ON m.id=r.membership_id WHERE m.user_id='${user}'),
      'cadastro integrado: nao confirmado dispensa upgrade de lock e continua sem ficha');`);
  } finally {
    first.child.kill();
    sql(database, 'migrator', `SELECT private.configure_client_registration('${customerOffice}',false);`);
  }
};
const raceCustomerAuthority = async (database, kind) => {
  const id = customerRecord(database);
  const first = openSql(database);
  let second;
  const read = kind === 'read';
  const capability = kind === 'capability';
  const statement = read ? `SELECT public.customers_page('${customerOffice}','',1,3)`
    : `SELECT public.customer_update('${customerOffice}','${id}','{"kind":"person","name":"Sessao Revogada Ficticia","contacts":[]}',3,gen_random_uuid())`;
  try {
    first.child.stdin.write(`BEGIN;
      SELECT id FROM public.offices WHERE id='${customerOffice}' FOR UPDATE;
      \\echo CUSTOMER_AUTHORITY_HELD
    `);
    await until(() => first.output().includes('CUSTOMER_AUTHORITY_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_customer_authority_b';
      SET ROLE authenticated;
      SET request.jwt.claims='${customerClaims}';
      SELECT test.expect_error($q$${statement}$q$,'${capability ? 'PT403' : 'PT401'}','clientes: ${capability ? 'capacidade revogada' : 'logout'} durante lock nega ${read ? 'leitura' : 'mutacao'}');
    `);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_customer_authority_b' AND wait_event_type='Lock');").trim() === 't');
    sql(database, 'postgres', capability
      ? "DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000042' AND permission_code='customers.update';"
      : "DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000042';");
    first.child.stdin.end('COMMIT;\n');
    await first.result;
    return await second.result + sql(database, 'postgres', `SELECT test.assert_true(
      (SELECT version=3 AND name='Vencedor Concorrente Ficticio' FROM public.customers WHERE id='${id}')
      AND (SELECT count(*) FROM public.audit_events WHERE target_id='${id}' AND action='customers.updated')=2,
      'clientes: autoridade revogada nao altera dados ou auditoria');`);
  } finally {
    first.child.kill(); second?.child.kill();
    sql(database, 'postgres', capability
      ? "INSERT INTO private.team_member_permissions VALUES ('00000000-0000-4000-b000-000000000042','customers.update') ON CONFLICT DO NOTHING;"
      : "INSERT INTO auth.sessions(id,user_id) VALUES('00000000-0000-4000-c000-000000000042','00000000-0000-4000-a000-000000000042') ON CONFLICT DO NOTHING;");
  }
};

const raceConfirmedRegistration = async database => {
  const first = openSql(database);
  const second = openSql(database);
  const firstUser = '00000000-0000-4000-a000-000000000066';
  const secondUser = '00000000-0000-4000-a000-000000000061';
  try {
    first.child.stdin.write(`SET application_name='jn_confirmed_registration_a';
      BEGIN;
      SET LOCAL ROLE migrator;
      SET LOCAL statement_timeout='750ms';
      SELECT id FROM public.offices WHERE id='${customerOffice}' FOR KEY SHARE;
      \\echo CONFIRMED_A_KEY_SHARE_HELD
    `);
    second.child.stdin.write(`SET application_name='jn_confirmed_registration_b';
      BEGIN;
      SET LOCAL ROLE migrator;
      SELECT id FROM public.offices WHERE id='${customerOffice}' FOR KEY SHARE;
      \\echo CONFIRMED_B_KEY_SHARE_HELD
    `);
    await until(() => first.output().includes('CONFIRMED_A_KEY_SHARE_HELD')
      && second.output().includes('CONFIRMED_B_KEY_SHARE_HELD'));

    // The old FOR UPDATE stalls on B's FK-compatible KEY SHARE; NO KEY UPDATE
    // must complete while B is still inside its original transaction.
    first.child.stdin.write(`SELECT private.sync_customer_registration('${firstUser}');
      \\echo CONFIRMED_A_SYNC_HELD
    `);
    await Promise.race([
      first.result,
      until(() => first.output().includes('CONFIRMED_A_SYNC_HELD')),
    ]);
    if (!first.output().includes('CONFIRMED_A_SYNC_HELD')) throw new Error('O primeiro sincronizador terminou antes da barreira.');

    second.child.stdin.write(`SELECT private.sync_customer_registration('${secondUser}');
      \\echo CONFIRMED_B_SYNC_DONE
    `);
    await until(() => sql(database, 'postgres', `SELECT EXISTS(
      SELECT FROM pg_stat_activity waiter
      JOIN pg_stat_activity holder ON holder.pid=ANY(pg_blocking_pids(waiter.pid))
      WHERE waiter.datname=current_database() AND holder.datname=current_database()
       AND waiter.application_name='jn_confirmed_registration_b'
       AND holder.application_name='jn_confirmed_registration_a'
       AND waiter.wait_event_type='Lock');`).trim() === 't');
    if (second.output().includes('CONFIRMED_B_SYNC_DONE')) throw new Error('O segundo sincronizador ignorou o mutex do escritorio.');

    first.child.stdin.end('COMMIT;\n');
    await first.result;
    await Promise.race([
      second.result,
      until(() => second.output().includes('CONFIRMED_B_SYNC_DONE')),
    ]);
    if (!second.output().includes('CONFIRMED_B_SYNC_DONE')) throw new Error('O segundo sincronizador terminou antes da barreira.');
    second.child.stdin.end('COMMIT;\n');
    await second.result;

    return 'PASS: cadastros confirmados conservam KEY SHARE e serializam o mutex em duas conexoes reais\n'
      + sql(database, 'postgres', `SELECT test.assert_true(
        (SELECT count(*) FROM public.customers WHERE created_by IN ('${firstUser}','${secondUser}'))=2
        AND (SELECT count(*) FROM private.customer_registrations r
          JOIN public.memberships m ON m.id=r.membership_id
          WHERE m.user_id IN ('${firstUser}','${secondUser}') AND r.materialized_customer_id IS NOT NULL)=2
        AND (SELECT count(*) FROM public.audit_events e
          JOIN private.customer_registrations r ON r.id=e.target_id AND r.office_id=e.office_id
          JOIN public.memberships m ON m.id=r.membership_id
          WHERE m.user_id IN ('${firstUser}','${secondUser}')
           AND e.action='auth.customer_registration_received' AND e.target_type='customer_registration')=2,
        'cadastros confirmados concorrentes preservam duas fichas, origens e eventos idempotentes');`);
  } finally {
    first.child.kill();
    second.child.kill();
  }
};

const relationOffice = '00000000-0000-4000-e000-000000000081';
const relationOwner = '{"sub":"00000000-0000-4000-a000-000000000081","session_id":"00000000-0000-4000-c000-000000000081"}';
const relationStaff = '{"sub":"00000000-0000-4000-a000-000000000086","session_id":"00000000-0000-4000-c000-000000000086"}';
const relationFixture = n => `00000000-0000-4000-f000-${String(n).padStart(12, '0')}`;
const prepareRelationRaces = database => sql(database, 'postgres', `
  INSERT INTO public.customers(id,office_id,kind,name,created_by) SELECT
  ('00000000-0000-4000-f000-'||lpad(n::text,12,'0'))::uuid,'${relationOffice}','person','Corrida Relacao '||n,
  '00000000-0000-4000-a000-000000000081' FROM generate_series(81,85) n;
`);
const raceRelationAuthority = async (database, kind) => {
  const id = relationFixture(81);
  const first = openSql(database);
  let second;
  try {
    // Block after office/membership checks, specifically testing the second check after customer row lock.
    first.child.stdin.write(`BEGIN; SELECT id FROM public.customers WHERE id='${id}' FOR UPDATE; \\echo RELATION_ROW_HELD\n`);
    await until(() => first.output().includes('RELATION_ROW_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_relation_authority'; SET ROLE authenticated;
      SET request.jwt.claims='${relationStaff}';
      SELECT test.expect_error($q$SELECT public.customer_relation_command('${relationOffice}','${id}','assignment.grant',
      '{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())$q$,
      '${kind === 'session' ? 'PT401' : 'PT403'}','relacionamentos: ${kind} revogada depois do lock de ficha nega comando');`);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_relation_authority' AND wait_event_type='Lock');").trim() === 't');
    sql(database, 'postgres', kind === 'session'
      ? "DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000086';"
      : "DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000086' AND permission_code='customers.relate';");
    first.child.stdin.end('COMMIT;\n'); await first.result;
    return await second.result + sql(database, 'postgres', `SELECT test.assert_true(NOT EXISTS(SELECT FROM private.customer_relations WHERE customer_id='${id}'),
      'relacionamentos: corrida de autoridade nao persiste grant');`);
  } finally {
    first.child.kill(); second?.child.kill();
    sql(database, 'postgres', kind === 'session'
      ? "INSERT INTO auth.sessions(id,user_id) VALUES('00000000-0000-4000-c000-000000000086','00000000-0000-4000-a000-000000000086') ON CONFLICT DO NOTHING;"
      : "INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000086','customers.relate') ON CONFLICT DO NOTHING;");
  }
};
const raceRelationScope = async database => {
  const id = relationFixture(81);
  const grant = sql(database, 'postgres', `SET ROLE authenticated; SET request.jwt.claims='${relationOwner}';
    SELECT public.customer_relation_command('${relationOffice}','${id}','assignment.grant',
    '{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid())->'assignments'->0->>'id';`).trim();
  if (!/^[0-9a-f-]{36}$/.test(grant)) throw new Error('Fixture de atribuicao concorrente ausente.');
  const first = openSql(database); let second;
  try {
    first.child.stdin.write(`BEGIN; SET ROLE authenticated; SET request.jwt.claims='${relationOwner}';
      SELECT public.customer_relation_command('${relationOffice}','${id}','assignment.revoke','{"id":"${grant}","version":1}',gen_random_uuid());
      \\echo RELATION_REVOKE_HELD\n`);
    await until(() => first.output().includes('RELATION_REVOKE_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_relation_scope'; SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000084","session_id":"00000000-0000-4000-c000-000000000084"}';
      SELECT test.expect_error($q$SELECT public.customer_relations_state('${relationOffice}','${id}')$q$,'PT404','relacionamentos: revogacao concorrente nega leitura apos lock');`);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_relation_scope' AND wait_event_type='Lock');").trim() === 't');
    first.child.stdin.end('COMMIT;\n'); await first.result; return await second.result;
  } finally { first.child.kill(); second?.child.kill(); }
};
const raceCustomerMerge = async database => {
  const target = relationFixture(82), sourceA = relationFixture(83), sourceB = relationFixture(84);
  const first = openSql(database); let second;
  try {
    first.child.stdin.write(`BEGIN; SET ROLE authenticated; SET request.jwt.claims='${relationOwner}';
      SELECT public.customer_merge('${relationOffice}','${sourceA}','${target}',1,1,'Corrida A',true,gen_random_uuid());
      \\echo MERGE_HELD\n`);
    await until(() => first.output().includes('MERGE_HELD'));
    second = openSql(database);
    second.child.stdin.end(`SET application_name='jn_customer_merge'; SET ROLE authenticated; SET request.jwt.claims='${relationOwner}';
      SELECT test.expect_error($q$SELECT public.customer_merge('${relationOffice}','${sourceB}','${target}',1,1,'Corrida B',true,gen_random_uuid())$q$,
      'PT409','mesclagem: concorrente com destino obsoleto nao sobrescreve decisao');`);
    await until(() => sql(database, 'postgres', "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_customer_merge' AND wait_event_type='Lock');").trim() === 't');
    first.child.stdin.end('COMMIT;\n'); await first.result;
    return await second.result + sql(database, 'postgres', `SELECT test.assert_true(
      (SELECT count(*)=1 FROM private.customer_merges WHERE target_id='${target}')
      AND (SELECT version=1 AND merged_into_id IS NULL FROM public.customers WHERE id='${sourceB}'),
      'mesclagem: corrida conserva apenas vencedor historia e snapshots');`);
  } finally { first.child.kill(); second?.child.kill(); }
};
const raceRelationRegistrationLock = async database => {
  const first = openSql(database);
  try {
    first.child.stdin.write(`BEGIN; SELECT id FROM public.offices WHERE id='${relationOffice}' FOR KEY SHARE; \\echo RELATION_FK_HELD\n`);
    await until(() => first.output().includes('RELATION_FK_HELD'));
    sql(database, 'postgres', `SET statement_timeout='750ms'; SET ROLE authenticated; SET request.jwt.claims='${relationOwner}';
      SELECT public.customer_relation_command('${relationOffice}','${relationFixture(85)}','assignment.grant',
      '{"membership_id":"00000000-0000-4000-b000-000000000084","valid_from":"2020-01-01T00:00:00Z","valid_until":null}',gen_random_uuid());`);
    first.child.stdin.end('COMMIT;\n'); await first.result;
    return 'PASS: relacionamentos: escrita compativel com KEY SHARE de cadastro publico em outra conexao\n';
  } finally { first.child.kill(); }
};

const benchmarkCustomerRelations = async database => {
  if (process.env.JN_RELATIONS_BENCHMARK !== '1') return;
  sql(database, 'postgres', `INSERT INTO public.customers(office_id,kind,name,created_by)
    SELECT '${relationOffice}','person','Benchmark Pessoa '||lpad(n::text,5,'0'),'00000000-0000-4000-a000-000000000082'
    FROM generate_series(1,10000) n; ANALYZE public.customers; ANALYZE private.customer_relations;`);
  const queries = [
    ['search', `SELECT public.customers_page('${relationOffice}','Benchmark Pessoa 099',1,5);`],
    ['state', `SELECT public.customer_relations_state('${relationOffice}','${relationFixture(82)}');`],
    ['candidates', `SELECT public.customer_relation_candidates('${relationOffice}','customers','Benchmark Pessoa 099');`],
  ];
  const callers = Array.from({ length: 10 }, () => openSql(database));
  try {
    const results = await Promise.all(callers.map(async connection => {
      connection.child.stdin.end(`SET statement_timeout='30s'; SET ROLE authenticated; SET request.jwt.claims='${relationStaff}';
        \\timing on
        ${Array.from({ length: 10 }, () => queries.map(([, query]) => query).join('\n')).join('\n')}`);
      const output = await connection.result;
      const values = [...output.matchAll(/Time: ([\d.]+) ms/g)].map(match => Number(match[1]));
      if (values.length !== 30) throw new Error(`Benchmark incompleto: ${values.length}/30 amostras por conexao.`);
      return values;
    }));
    const percentile = values => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
    const measurements = queries.map(([operation], index) => {
      const samples = results.flatMap(values => values.filter((_, position) => position % 3 === index));
      return { operation, samples: samples.length, p95_ms: percentile(samples), max_ms: Math.max(...samples) };
    });
    const result = { fixture_customers: 10000, concurrent_callers: 10, samples: 300, target_p95_ms: 2000,
      passed: measurements.every(item => item.p95_ms <= 2000), measurements,
      scope: 'Disposable local Docker PostgreSQL17; psql statement timing includes query roundtrip; no hosted SLA.' };
    console.log(`RELATIONS_BENCHMARK ${JSON.stringify(result)}`);
    if (!result.passed) throw new Error('Meta local p95<=2s nao atingida; ver RELATIONS_BENCHMARK.');
  } finally { for (const connection of callers) connection.child.kill(); }
};

const raceServiceAuthority = async (database, capability = false) => {
  const actor = capability ? '092' : '096';
  const [serviceId, definition] = JSON.parse(sql(database,'postgres',"SELECT jsonb_build_array(s.id,v.definition||'{\"effective_from\":null}'::jsonb) FROM public.services s JOIN public.service_versions v ON v.service_id=s.id AND v.number=2 WHERE s.code='XEROX-TESTE';").trim());
  const lock = openSql(database);
  let mutation;
  try {
    lock.child.stdin.write(`BEGIN;
      SELECT id FROM public.services WHERE office_id='00000000-0000-4000-e000-000000000091' AND code='XEROX-TESTE' FOR UPDATE;
      \\echo SERVICE_LOCK_HELD
    `);
    await until(() => lock.output().includes('SERVICE_LOCK_HELD'));
    mutation = openSql(database);
    mutation.child.stdin.end(`SET application_name='jn_service_authority';
      SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000${actor}","session_id":"00000000-0000-4000-c000-000000000${actor}"}';
      SELECT test.expect_error($q$SELECT public.service_publish('00000000-0000-4000-e000-000000000091','${serviceId}','${JSON.stringify(definition).replaceAll("'","''")}'::jsonb,2,'Concorrente ficticio',gen_random_uuid())$q$,'${capability?'PT403':'PT401'}','servicos: autoridade revogada depois do lock nega publicacao');
    `);
    // Raw SELECT is deliberately denied: resolve args before switching to API role.
    // Rebuild command with literal fixture arguments, never grant test API table access.
    await until(() => sql(database,'postgres',"SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_service_authority' AND wait_event_type='Lock');").trim()==='t');
    if (capability) sql(database,'postgres',"DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='services.manage';");
    else sql(database,'postgres',"DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000096';");
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    const result=await mutation.result;
    return result+sql(database,'postgres',"SELECT test.assert_true((SELECT latest_version FROM public.services WHERE code='XEROX-TESTE')=2,'servicos: corrida nao publicou versao sem autoridade');");
  } finally {lock.child.kill();mutation?.child.kill();}
};

const raceServiceEffective = async database => {
  const definition=JSON.parse(sql(database,'postgres',"SELECT definition||'{\"code\":\"TIME-TESTE\",\"name\":\"Fronteira Ficticia\",\"effective_from\":null}'::jsonb FROM public.service_versions v JOIN public.services s ON s.id=v.service_id WHERE s.code='XEROX-TESTE' AND v.number=2;").trim());
  const literal=JSON.stringify(definition).replaceAll("'","''");
  const auth=`SET ROLE authenticated; SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';`;
  const id=sql(database,'postgres',`${auth} SELECT public.service_create('00000000-0000-4000-e000-000000000091','${literal}'::jsonb,'Fronteira ficticia',gen_random_uuid())->>'id';`).trim();
  sql(database,'postgres',`${auth} SELECT public.service_publish('00000000-0000-4000-e000-000000000091','${id}', '${literal}'::jsonb||jsonb_build_object('price_cents',99,'effective_from',to_char((clock_timestamp()+interval '2 seconds') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),1,'Agendamento ficticio',gen_random_uuid());`);
  const lock=openSql(database);let reader;
  try{
    lock.child.stdin.write(`BEGIN; SELECT id FROM public.offices WHERE id='00000000-0000-4000-e000-000000000091' FOR UPDATE; \\echo EFFECTIVE_LOCK_HELD\n`);
    await until(()=>lock.output().includes('EFFECTIVE_LOCK_HELD'));
    reader=openSql(database);reader.child.stdin.end(`SET application_name='jn_service_effective'; ${auth} SELECT public.services_page('00000000-0000-4000-e000-000000000091','TIME-TESTE',1,3)->'items'->0->>'version';`);
    await until(()=>sql(database,'postgres',"SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_service_effective' AND wait_event_type='Lock');").trim()==='t');
    sql(database,'postgres',`SELECT pg_sleep(greatest(extract(epoch FROM effective_from-clock_timestamp())+.1,0)) FROM public.service_versions WHERE service_id='${id}' AND number=2;`);
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    const result=(await reader.result).trim();if(result!=='2')throw Error(`FAIL: catalogo apos lock devolveu versao vencida ${result}, esperada2.`);
    return 'PASS: servicos: fronteira de vigencia durante lock seleciona versao atual\n';
  }finally{lock.child.kill();reader?.child.kill();}
};

const benchmarkServices = async database => {
  if(process.env.JN_SERVICES_BENCHMARK!=='1')return;
  sql(database,'postgres',`WITH inserted AS (
    INSERT INTO public.services(office_id,code,created_by)
    SELECT '00000000-0000-4000-e000-000000000091','BENCH-'||lpad(n::text,6,'0'),'00000000-0000-4000-a000-000000000091' FROM generate_series(1,10000) n RETURNING *)
    INSERT INTO public.service_versions(office_id,service_id,number,definition,effective_from,created_by,reason)
    SELECT i.office_id,i.id,1,v.definition||jsonb_build_object('code',i.code,'name','Servico Ficticio '||i.code),v.effective_from,i.created_by,'Benchmark ficticio'
    FROM inserted i CROSS JOIN public.services s JOIN public.service_versions v ON v.service_id=s.id AND v.number=2 WHERE s.code='XEROX-TESTE';
    ANALYZE public.services; ANALYZE public.service_versions;`);
  const serviceId=sql(database,'postgres',"SELECT id FROM public.services WHERE code='XEROX-TESTE';").trim();
  const connections=Array.from({length:10},()=>openSql(database));
  try {
    const started=Date.now();
    for(const connection of connections) connection.child.stdin.end(`SET ROLE authenticated;
      SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';
      CREATE TEMP TABLE catalog_measurements(operation text,ms numeric);
      DO $bench$ DECLARE t timestamptz; n integer; BEGIN
        FOR n IN 1..10 LOOP
          t:=clock_timestamp(); PERFORM public.services_page('00000000-0000-4000-e000-000000000091','',1,3); INSERT INTO catalog_measurements VALUES('list',extract(epoch from clock_timestamp()-t)*1000);
          t:=clock_timestamp(); PERFORM public.service_detail('00000000-0000-4000-e000-000000000091','${serviceId}',1); INSERT INTO catalog_measurements VALUES('detail',extract(epoch from clock_timestamp()-t)*1000);
          t:=clock_timestamp(); PERFORM public.service_quote('00000000-0000-4000-e000-000000000091','${serviceId}',2,'{"kind":"none","value":0,"reason":""}'); INSERT INTO catalog_measurements VALUES('quote',extract(epoch from clock_timestamp()-t)*1000);
        END LOOP;
      END $bench$;
      SELECT jsonb_agg(to_jsonb(m)) FROM catalog_measurements m;
    `);
    const samples=(await Promise.all(connections.map(c=>c.result))).flatMap(output=>JSON.parse(output.trim()));
    const measurements=Object.fromEntries(['list','detail','quote'].map(operation=>{
      const values=samples.filter(x=>x.operation===operation).map(x=>Number(x.ms)).sort((a,b)=>a-b);
      return [operation,{samples:values.length,median_ms:values[Math.floor(values.length/2)],p95_ms:values[Math.ceil(values.length*.95)-1],max_ms:values.at(-1)}];
    }));
    console.log(`SERVICES_BENCHMARK ${JSON.stringify({environment:'disposable local PostgreSQL17; API role authenticated',additional_services:10000,connections:10,samples:samples.length,wall_ms:Date.now()-started,measurements})}`);
    if(Object.values(measurements).some(x=>x.p95_ms>2000))throw Error('Catalog benchmark exceeded local p95 target2s.');
  }finally{for(const c of connections)c.child.kill();}
};

// Etapa10: exercise genuine independent PostgreSQL sessions, never a hosted database.
const requestOffice = '00000000-0000-4000-e000-000000000091';
const requestOwner = `SET ROLE authenticated; SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';`;
const requestFixture = database => JSON.parse(sql(database,'postgres',`SELECT jsonb_build_object('origin','presencial','title','Corrida ficticia','customer_id',NULL,'assignee_id',NULL,'priority','normal','priority_reason','','internal_note','','items',jsonb_build_array(jsonb_build_object('service_id',s.id,'quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))) FROM public.services s WHERE code='REQUEST-TESTE';`).trim());
const raceRequestCreate = async (database, sameKey) => {
  const lock=openSql(database);const callers=[];const key=randomUUID();const payload=JSON.stringify(requestFixture(database)).replaceAll("'","''");
  const before=Number(sql(database,'postgres',`SELECT last_number FROM private.request_counters WHERE office_id='${requestOffice}';`).trim());
  try {
    lock.child.stdin.write(`BEGIN; SELECT id FROM public.offices WHERE id='${requestOffice}' FOR NO KEY UPDATE; \\echo REQUEST_CREATE_HELD\n`);
    await until(()=>lock.output().includes('REQUEST_CREATE_HELD'));
    for(let n=0;n<2;n++){
      const connection=openSql(database);callers.push(connection);
      connection.child.stdin.end(`SET application_name='jn_request_create_${n}'; ${requestOwner} SELECT public.request_create('${requestOffice}','${payload}','${sameKey?key:randomUUID()}',gen_random_uuid())->>'id';`);
    }
    await until(()=>sql(database,'postgres',"SELECT count(*)=2 FROM pg_stat_activity WHERE application_name LIKE 'jn_request_create_%' AND wait_event_type='Lock';").trim()==='t');
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    const ids=(await Promise.all(callers.map(c=>c.result))).map(v=>v.trim());
    if((ids[0]===ids[1])!==sameKey)throw Error('Request idempotency/protocol race returned unexpected IDs.');
    return sql(database,'postgres',`SELECT test.assert_true((SELECT last_number FROM private.request_counters WHERE office_id='${requestOffice}')=${before+(sameKey?1:2)} AND (SELECT count(*)=count(DISTINCT protocol) FROM public.requests WHERE office_id='${requestOffice}'),'pedidos: corrida ${sameKey?'idempotente cria uma unica abertura':'protocolos distintos sem colisao'}');`);
  }finally{lock.child.kill();for(const c of callers)c.child.kill();}
};
const raceRequestVersion = async database => {
  const [id,version]=JSON.parse(sql(database,'postgres',`SELECT jsonb_build_array(id,version) FROM public.requests WHERE title='Copias ficticias';`).trim());
  sql(database,'postgres',`CREATE FUNCTION test.request_version_result(p_id uuid,p_version integer) RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $test$ BEGIN PERFORM public.request_mutate('${requestOffice}',p_id,p_version,'{"kind":"note","note":"Corrida ficticia"}',gen_random_uuid());RETURN 'winner';EXCEPTION WHEN SQLSTATE 'PT409' THEN RETURN 'conflict';END $test$;`);
  const callers=[openSql(database),openSql(database)];
  try{
    for(const c of callers)c.child.stdin.end(`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000094","session_id":"00000000-0000-4000-c000-000000000094"}'; SELECT test.request_version_result('${id}',${version});`);
    const results=(await Promise.all(callers.map(c=>c.result))).map(v=>v.trim()).sort();
    if(JSON.stringify(results)!==JSON.stringify(['conflict','winner']))throw Error('Request version race did not produce exactly one winner.');
    return sql(database,'postgres',`SELECT test.assert_true((SELECT version FROM public.requests WHERE id='${id}')=${version+1},'pedidos: versao concorrente conserva somente um vencedor');`);
  }finally{for(const c of callers)c.child.kill();}
};
const raceRequestAuthority = async (database, capability) => {
  const [id,version]=JSON.parse(sql(database,'postgres',`SELECT jsonb_build_array(id,version) FROM public.requests WHERE title='Copias ficticias';`).trim());
  const lock=openSql(database);let mutation;
  try{
    lock.child.stdin.write(`BEGIN; SELECT id FROM public.requests WHERE id='${id}' FOR UPDATE; \\echo REQUEST_AUTHORITY_HELD\n`);
    await until(()=>lock.output().includes('REQUEST_AUTHORITY_HELD'));
    mutation=openSql(database);mutation.child.stdin.end(`SET application_name='jn_request_authority';SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000094","session_id":"00000000-0000-4000-c000-000000000094"}'; SELECT test.expect_error($q$SELECT public.request_mutate('${requestOffice}','${id}',${version},'{"kind":"note","note":"Revogacao durante lock"}',gen_random_uuid())$q$,'${capability?'PT403':'PT401'}','pedidos: ${capability?'capacidade':'sessao'} revogada durante lock bloqueia escrita');`);
    await until(()=>sql(database,'postgres',"SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_request_authority' AND wait_event_type='Lock');").trim()==='t');
    if(capability)sql(database,'postgres',"DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000094' AND permission_code='requests.update';");
    else sql(database,'postgres',"DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000094';");
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    return await mutation.result;
  }finally{
    lock.child.kill();mutation?.child.kill();
    if(capability)sql(database,'postgres',"INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000094','requests.update') ON CONFLICT DO NOTHING;");
    else sql(database,'postgres',"INSERT INTO auth.sessions(id,user_id)VALUES('00000000-0000-4000-c000-000000000094','00000000-0000-4000-a000-000000000094') ON CONFLICT DO NOTHING;");
  }
};

const raceRequestServiceAuthority = async (database,capability) => {
  const customer=sql(database,'postgres',`INSERT INTO public.customers(office_id,kind,name,created_by)VALUES('${requestOffice}','person','Participante da corrida','00000000-0000-4000-a000-000000000092')RETURNING id;`).trim();
  sql(database,'postgres',"INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','customers.read') ON CONFLICT DO NOTHING;");
  const definition=JSON.parse(sql(database,'postgres',"SELECT definition||'{\"code\":\"REQ-RACE-EMPTY\",\"effective_from\":null,\"required_capabilities\":[]}'::jsonb FROM public.service_versions v JOIN public.services s ON s.id=v.service_id WHERE s.code='REQUEST-TESTE' AND v.number=1;").trim());
  const service=sql(database,'postgres',`SELECT id FROM public.services WHERE code='REQ-RACE-EMPTY';`).trim()||sql(database,'postgres',`${requestOwner}SELECT public.service_create('${requestOffice}','${JSON.stringify(definition).replaceAll("'","''")}','Corrida de capacidade',gen_random_uuid())->>'id';`).trim();
  const payload=requestFixture(database);payload.items[0].service_id=service;payload.items[0].participant_ids=[customer];
  const lock=openSql(database);let opening;
  try{
    lock.child.stdin.write(`BEGIN;SELECT id FROM public.customers WHERE id='${customer}' FOR UPDATE; \\echo REQUEST_PARTICIPANT_HELD\n`);
    await until(()=>lock.output().includes('REQUEST_PARTICIPANT_HELD'));
    opening=openSql(database);opening.child.stdin.end(`SET application_name='jn_request_participant';SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000092","session_id":"00000000-0000-4000-c000-000000000092"}';SELECT test.expect_error($q$SELECT public.request_create('${requestOffice}','${JSON.stringify(payload).replaceAll("'","''")}',gen_random_uuid(),gen_random_uuid())$q$,'PT403','pedidos: ${capability} revogada apos selecao do catalogo bloqueia snapshot');`);
    await until(()=>sql(database,'postgres',"SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_request_participant' AND wait_event_type='Lock');").trim()==='t');
    sql(database,'postgres',`DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000092' AND permission_code='${capability}';`);
    lock.child.stdin.end('COMMIT;\n');await lock.result;return await opening.result;
  }finally{
    lock.child.kill();opening?.child.kill();sql(database,'postgres',`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000092','${capability}') ON CONFLICT DO NOTHING;`);
  }
};
const raceRequestEffective = async database => {
  const customer=sql(database,'postgres',`SELECT id FROM public.customers WHERE name='Participante da corrida' ORDER BY id LIMIT 1;`).trim();
  const [id,version,definition]=JSON.parse(sql(database,'postgres',"SELECT jsonb_build_array(s.id,s.latest_version,v.definition||jsonb_build_object('price_cents',999,'effective_from',to_char((clock_timestamp()+interval '2 seconds')AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) FROM public.services s JOIN public.service_versions v ON v.service_id=s.id AND v.number=s.latest_version WHERE s.code='REQ-RACE-EMPTY';").trim());
  sql(database,'postgres',`${requestOwner}SELECT public.service_publish('${requestOffice}','${id}','${JSON.stringify(definition).replaceAll("'","''")}',${version},'Fronteira de pedido',gen_random_uuid());`);
  const payload=requestFixture(database);payload.title='Vigencia apos participante';payload.items[0].service_id=id;payload.items[0].participant_ids=[customer];
  const lock=openSql(database);let opening;
  try{
    lock.child.stdin.write(`BEGIN;SELECT id FROM public.customers WHERE id='${customer}' FOR UPDATE; \\echo REQUEST_EFFECTIVE_HELD\n`);await until(()=>lock.output().includes('REQUEST_EFFECTIVE_HELD'));
    opening=openSql(database);opening.child.stdin.end(`SET application_name='jn_request_effective';${requestOwner}SELECT public.request_create('${requestOffice}','${JSON.stringify(payload).replaceAll("'","''")}',gen_random_uuid(),gen_random_uuid())->'items'->0->'snapshot'->>'version';`);
    await until(()=>sql(database,'postgres',"SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_request_effective' AND wait_event_type='Lock');").trim()==='t');
    sql(database,'postgres',`SELECT pg_sleep(greatest(extract(epoch FROM effective_from-clock_timestamp())+.1,0)) FROM public.service_versions WHERE service_id='${id}' AND number=${version+1};`);
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    if((await opening.result).trim()!==String(version+1))throw Error('Request chose stale catalog version before participant wait.');
    return 'PASS: pedidos: vigencia apos lock de participante usa snapshot vigente\n';
  }finally{lock.child.kill();opening?.child.kill();}
};
const benchmarkRequests = async database => {
  if(process.env.JN_REQUESTS_BENCHMARK!=='1')return;
  const [customerRequest]=JSON.parse(sql(database,'postgres',`SELECT jsonb_build_array(id) FROM public.requests WHERE title='Copias ficticias';`).trim());
  sql(database,'postgres',`INSERT INTO public.requests(office_id,protocol,title,origin,created_by,assignee_id,priority,idempotency_key,payload_digest,triaged_at)
    SELECT '${requestOffice}','BENCH-'||lpad(n::text,6,'0'),'Pedido Ficticio '||n,'presencial','00000000-0000-4000-a000-000000000091','00000000-0000-4000-b000-000000000094','normal',gen_random_uuid(),'benchmark',clock_timestamp() FROM generate_series(1,10000)n;
    ANALYZE public.requests;ANALYZE public.request_items;ANALYZE private.request_history;`);
  const callers=Array.from({length:10},()=>openSql(database));
  try{
    for(const c of callers)c.child.stdin.end(`${requestOwner}CREATE TEMP TABLE request_measurements(operation text,ms numeric);DO $bench$DECLARE t timestamptz;n int;BEGIN FOR n IN 1..10 LOOP
      t:=clock_timestamp();PERFORM public.requests_page('${requestOffice}','','queue','',1,3);INSERT INTO request_measurements VALUES('list',extract(epoch FROM clock_timestamp()-t)*1000);
      t:=clock_timestamp();PERFORM public.request_detail('${requestOffice}','${customerRequest}',1);INSERT INTO request_measurements VALUES('detail',extract(epoch FROM clock_timestamp()-t)*1000);
    END LOOP;END $bench$;SELECT jsonb_agg(to_jsonb(m)) FROM request_measurements m;`);
    const samples=(await Promise.all(callers.map(c=>c.result))).flatMap(v=>JSON.parse(v.trim()));
    const measurements=Object.fromEntries(['list','detail'].map(operation=>{const values=samples.filter(v=>v.operation===operation).map(v=>Number(v.ms)).sort((a,b)=>a-b);return [operation,{samples:values.length,median_ms:values[Math.floor(values.length/2)],p95_ms:values[Math.ceil(values.length*.95)-1],max_ms:values.at(-1)}];}));
    console.log(`REQUESTS_BENCHMARK ${JSON.stringify({environment:'disposable local PostgreSQL17; API role authenticated; no hosted SLA',additional_requests:10000,connections:10,samples:samples.length,measurements})}`);
    if(Object.values(measurements).some(v=>v.p95_ms>2000))throw Error('Request benchmark exceeded local p95 target2s.');
  }finally{for(const c of callers)c.child.kill();}
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
      + sql(database, 'postgres', readFileSync(`${root}tests/database/governance.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/customers.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/customer-registration.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/customer-relations.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/services.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/requests.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/attachments.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/checklists.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/adjustments.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/account.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/charges.sql`, 'utf8'))
      + sql(database, 'postgres', readFileSync(`${root}tests/database/team-concurrency.sql`, 'utf8'))
      + await raceLastOwners(database)
      + await raceRevokedSession(database)
      + await raceRecipientEmail(database)
      + await raceCustomerVersion(database)
      + await raceCustomerDuplicate(database)
      + await raceCustomerRegistration(database)
      + await raceUnconfirmedRegistration(database)
      + await raceConfirmedRegistration(database)
      + await raceCustomerAuthority(database, 'session')
      + await raceCustomerAuthority(database, 'read')
      + await raceCustomerAuthority(database, 'capability')
      + prepareRelationRaces(database)
      + await raceRelationAuthority(database, 'session')
      + await raceRelationAuthority(database, 'capability')
      + await raceRelationScope(database)
      + await raceCustomerMerge(database)
      + await raceRelationRegistrationLock(database)
      + await raceServiceAuthority(database)
      + await raceServiceAuthority(database,true)
      + await raceServiceEffective(database)
      + await raceRequestCreate(database,true)
      + await raceRequestCreate(database,false)
      + await raceRequestVersion(database)
      + await raceReclaim({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database),until})
      + await raceAccount({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database),until})
      + await raceCharges({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database),until})
      + await raceRequestAuthority(database,false)
      + await raceRequestAuthority(database,true)
      + await raceRequestServiceAuthority(database,'services.perform')
      + await raceRequestServiceAuthority(database,'services.read')
      + await raceRequestEffective(database)
      + await raceChecklists({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database),until})
      + await raceAttachments({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database),until});
    if (database === 'foundation_replay_b') {await benchmarkChecklists({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database)});
    await benchmarkCharges({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database)});await benchmarkCustomerRelations(database);await benchmarkServices(database);await benchmarkRequests(database);await benchmarkAttachments({sql:input=>sql(database,'postgres',input),openSql:()=>openSql(database)});}
    console.log(`${database} (${result.split('\n').filter(line => line.startsWith('PASS:')).length} verificações):\n${result.trim()}`);
  }
  console.log('PASS: dois replays vazios, migrador sem superusuário/BYPASSRLS e ACL/RLS/RPC reais.');
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
} finally {
  if (started) docker('rm', '--force', name);
}
