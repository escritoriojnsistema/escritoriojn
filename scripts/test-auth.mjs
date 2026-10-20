import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@supabase/supabase-js';
import { createAuthLab } from '../tests/auth/lab.mjs';
const children = new Set();
let lab;
const password = `Local-${randomBytes(20).toString('hex')}!`;
try {
  lab = await createAuthLab();
  await lab.migrate();
  const admin = createClient(lab.url, lab.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = {};
  // Registration has no office yet: identities do not acquire permissions here.
  for (const name of ['owner','unlinked','inactive','other','expired','manager','existingstaff','delegate','worker','portalclient','archiveworker','auditreader','customerworker','relationworker','relationclient','relationclientnull','relationclientcontrol','relationclientspace','relationteamnull','relationteamcontrol','serviceworker']) {
    const { data, error } = await admin.auth.admin.createUser({ email: `${name}@example.test`, password, email_confirm: true });
    if (error || !data.user) throw new Error('Could not create local Auth fixture.');
    users[name] = data.user.id;
  }
  const office = (await lab.sql(`SELECT private.provision_owner('${users.owner}', 'Escritório de teste A', '${randomUUID()}');`, 'migrator')).trim();
  const otherOffice = randomUUID();
  await lab.sql(`
    UPDATE public.profiles SET display_name='Proprietário de teste' WHERE id='${users.owner}';
    INSERT INTO public.offices(id,name) VALUES ('${otherOffice}','Escritório de teste B');
    INSERT INTO public.profiles(id,display_name,active) VALUES ('${users.inactive}','Conta inativa',false),('${users.other}','Pessoa B',true);
    INSERT INTO public.memberships(office_id,user_id,role_code) VALUES ('${office}','${users.inactive}','employee'),('${otherOffice}','${users.other}','owner');
    INSERT INTO public.profiles(id,display_name) VALUES ('${users.manager}','Gestor de teste'),('${users.delegate}','Administrador de teste'),('${users.worker}','Funcionário de teste'),('${users.portalclient}','Cliente de teste'),('${users.archiveworker}','Arquivo de teste'),('${users.auditreader}','Auditor de teste');
    INSERT INTO public.memberships(office_id,user_id,role_code) VALUES ('${office}','${users.manager}','owner'),('${office}','${users.delegate}','admin'),('${office}','${users.worker}','employee'),('${office}','${users.portalclient}','client'),('${office}','${users.archiveworker}','employee'),('${office}','${users.auditreader}','employee');
    INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT id,'audit.read' FROM public.memberships WHERE user_id='${users.auditreader}';
    INSERT INTO public.profiles(id,display_name) VALUES ('${users.customerworker}','Funcionário de clientes');
    INSERT INTO public.memberships(office_id,user_id,role_code) VALUES ('${office}','${users.customerworker}','employee');
    INSERT INTO private.team_member_permissions(membership_id,permission_code)
      SELECT m.id,p.code FROM public.memberships m
      CROSS JOIN unnest(ARRAY['customers.read','customers.create','customers.update']) p(code)
      WHERE m.office_id='${office}' AND m.user_id='${users.customerworker}';
    INSERT INTO public.profiles(id,display_name) VALUES ('${users.relationworker}','Funcionário relações'),('${users.relationclient}','Cliente relações');
    INSERT INTO public.memberships(office_id,user_id,role_code) VALUES ('${office}','${users.relationworker}','employee'),('${office}','${users.relationclient}','client');
    -- Synthetic legacy names remain untouched in profiles; only08 presentation may normalize them.
    INSERT INTO public.profiles(id,display_name) VALUES ('${users.relationclientnull}',NULL),('${users.relationclientcontrol}','Ana'||chr(9)||'Silva'),('${users.relationclientspace}',chr(160)||chr(8199)||chr(65279)),('${users.relationteamnull}',NULL),('${users.relationteamcontrol}','João'||chr(1)||chr(133)||'Silva');
    INSERT INTO public.memberships(office_id,user_id,role_code) VALUES ('${office}','${users.relationclientnull}','client'),('${office}','${users.relationclientcontrol}','client'),('${office}','${users.relationclientspace}','client'),('${office}','${users.relationteamnull}','employee'),('${office}','${users.relationteamcontrol}','employee');
    INSERT INTO private.team_member_permissions(membership_id,permission_code)
      SELECT m.id,p.code FROM public.memberships m CROSS JOIN unnest(ARRAY['customers.read','customers.relate']) p(code)
      WHERE m.office_id='${office}' AND m.user_id='${users.relationworker}';
    INSERT INTO public.profiles(id,display_name) VALUES ('${users.serviceworker}','Funcionário de serviços');
    INSERT INTO public.memberships(office_id,user_id,role_code) VALUES ('${office}','${users.serviceworker}','employee');
    INSERT INTO private.team_member_permissions(membership_id,permission_code)
      SELECT m.id,p.code FROM public.memberships m CROSS JOIN unnest(ARRAY['services.read','services.perform']) p(code)
      WHERE m.office_id='${office}' AND m.user_id='${users.serviceworker}';
    SELECT private.configure_client_registration('${office}',true);
  `, 'migrator');
  const expiredClient = createClient(lab.url, lab.anonKey, { auth: { flowType: 'pkce', persistSession: false, autoRefreshToken: false } });
  const { error: recoveryError } = await expiredClient.auth.resetPasswordForEmail('expired@example.test', { redirectTo: 'http://127.0.0.1:3005/auth/callback?area=team' });
  if (recoveryError) throw new Error('Could not prepare expired recovery fixture.');
  const messages = await (await fetch(`${lab.mailUrl}/api/v1/messages`)).json();
  const expiredMessage = messages.messages.find(m => m.To.some(t => t.Address === 'expired@example.test'));
  const detail = await (await fetch(`${lab.mailUrl}/api/v1/message/${expiredMessage.ID}`)).json();
  const expiredLink = detail.HTML.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
  await lab.sql(`UPDATE auth.users SET recovery_sent_at=now()-interval '2 days' WHERE id='${users.expired}';`);
  const env = { ...process.env, VITE_SUPABASE_URL: lab.url, VITE_SUPABASE_PUBLISHABLE_KEY: lab.anonKey };
  const server = spawn('node', ['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3005','--strictPort'], { env, stdio: 'ignore' });
  children.add(server); server.on('exit', () => children.delete(server));
  const deadline = Date.now() + 20000;
  while (true) {
    try { if ((await fetch('http://127.0.0.1:3005/api/health')).ok) break; } catch { /* starting */ }
    if (Date.now() > deadline) throw new Error('Auth frontend failed to start.');
    await delay(250);
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn('node', ['node_modules/@playwright/test/cli.js','test','--config','playwright.auth.config.ts',...process.argv.slice(2)], {
      env: { ...env, AUTH_LAB_EXPIRED_LINK: expiredLink, AUTH_LAB_URL: lab.url, AUTH_LAB_MAIL_URL: lab.mailUrl, AUTH_LAB_PASSWORD: password, AUTH_LAB_OFFICE: office, AUTH_LAB_OTHER_OFFICE: otherOffice }, stdio: 'inherit',
    });
    children.add(child); child.on('error', reject); child.on('exit', code => { children.delete(child); resolve(code); });
  });
  if (code !== 0) process.exitCode = 1;
  if (code === 0) {
    // A browser merge fixture is optional for filtered runs; when present its real
    // source row, immutable snapshots and revoked authority must remain intact.
    await lab.sql(`DO $check$ BEGIN
      IF EXISTS(SELECT 1 FROM public.customers WHERE name='R08 Origem Mesclada') THEN
        IF NOT EXISTS(SELECT 1 FROM public.customers s JOIN public.customers t ON t.id=s.merged_into_id
          JOIN private.customer_merges m ON m.source_id=s.id AND m.target_id=t.id
          JOIN private.customer_snapshots a ON a.id=m.source_snapshot_id
          JOIN private.customer_snapshots b ON b.id=m.target_snapshot_id
          JOIN private.customer_snapshots c ON c.id=m.result_snapshot_id
          WHERE s.name='R08 Origem Mesclada' AND t.name='R08 Destino Mesclado')
          OR EXISTS(SELECT 1 FROM private.customer_relations r JOIN public.customers s ON s.id=r.customer_id WHERE s.name='R08 Origem Mesclada' AND r.revoked_at IS NULL)
        THEN RAISE EXCEPTION 'R08 history or revocation invariant failed'; END IF;
      END IF;
    END $check$;`, 'migrator');
    console.log('Auth laboratory post-check: merged source, snapshots and revoked rights preserved when merge fixture exists.');
  }
} catch (error) {
  // SDK/network errors can include sensitive payloads; do not dump objects or URLs.
  console.error('Local Auth verification failed:', String(error.message).replaceAll(password, '[redacted]'));
  process.exitCode = 1;
} finally {
  for (const child of children) child.kill('SIGTERM');
  if (lab) await lab.close();
}
