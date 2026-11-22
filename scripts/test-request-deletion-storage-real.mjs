import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createAuthLab } from '../tests/auth/lab.mjs';
import { createRequestDeletionCleanupHandler } from '../supabase/functions/request-deletion-cleanup/handler.ts';

const lab = await createAuthLab({ storage: true, storageRootfs: process.env.AUTH_LAB_STORAGE_ROOTFS });
const makeClient = key => createClient(lab.url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const service = makeClient(lab.serviceRoleKey);
const query = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  assert.ifError(error);
  return data;
};

try {
  assert.match(lab.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  await lab.migrate();
  const password = 'Local-' + randomBytes(24).toString('hex') + '!';
  const suffix = randomUUID();
  async function createUser(name) {
    const email = `${name}-${suffix}@example.test`;
    const result = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(result.error);
    return { id: result.data.user.id, email };
  }
  async function session(user) {
    const client = makeClient(lab.anonKey);
    const loggedIn = await client.auth.signInWithPassword({ email: user.email, password });
    assert.ifError(loggedIn.error);
    await query(client, 'session_activity', { p_human: false });
    return { client, token: loggedIn.data.session.access_token };
  }

  const owner = await createUser('owner');
  const customer = await createUser('customer');
  const unrelated = await createUser('unrelated');
  const office = (await lab.sql(
    `SELECT private.provision_owner('${owner.id}','Escritório FICTÍCIO','${randomUUID()}');`,
    'migrator',
  )).trim();
  for (const user of [customer, unrelated]) {
    await lab.sql(`
      INSERT INTO public.profiles(id,display_name) VALUES('${user.id}','Cliente FICTÍCIO');
      INSERT INTO public.memberships(office_id,user_id,role_code) VALUES('${office}','${user.id}','client');
    `, 'migrator');
  }
  const customerSession = await session(customer);
  const unrelatedSession = await session(unrelated);
  const ownerSession = await session(owner);

  const args = { p_office_id: office };
  const categories = await query(ownerSession.client, 'service_categories_command', {
    ...args,
    p_command: {
      kind: 'create', name: 'Categoria FICTÍCIA', execution_level: 3, reason: 'Somente teste local',
    },
    p_idempotency_key: randomUUID(),
  });
  const category = categories.items.find(item => item.name === 'Categoria FICTÍCIA').id;
  const request = await query(customerSession.client, 'request_create', {
    ...args,
    p_request: { origin: 'portal', title: 'Solicitação FICTÍCIA', message: 'Teste local fictício', category_id: category },
    p_idempotency_key: randomUUID(),
    p_request_id: randomUUID(),
  });
  await lab.sql(`UPDATE public.requests SET status='aberto',assignee_id=NULL WHERE id='${request.id}';`, 'migrator');

  const bucket = 'request-attachments';
  const bytes = Buffer.from('%PDF-1.4\n% FICTICIO\n%%EOF\n');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const sessionId = JSON.parse(Buffer.from(customerSession.token.split('.')[1], 'base64url').toString()).session_id;
  async function attach() {
    const fileId = randomUUID();
    const intentId = randomUUID();
    const path = `${office}/${intentId}/${fileId}`;
    await lab.sql(`
      INSERT INTO public.files(id,office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by,scanner_status)
      VALUES('${fileId}','${office}','${request.id}','ficticio.pdf','application/pdf',${bytes.length},'${digest}',
        'documento','disponivel','${customer.id}','clean');
      INSERT INTO private.upload_intents(id,office_id,request_id,file_id,created_by,session_id,idempotency_key,
        payload_digest,bucket,object_path,policy_snapshot,expires_at)
      VALUES('${intentId}','${office}','${request.id}','${fileId}','${customer.id}','${sessionId}','${randomUUID()}',
        '${digest}','${bucket}','${path}','{}',clock_timestamp()+interval '1 hour');
    `, 'migrator');
    assert.ifError((await service.storage.from(bucket).upload(path, bytes, { contentType: 'application/pdf' })).error);
    return { fileId, path };
  }

  const first = await attach();
  const second = await attach();
  await lab.sql(`INSERT INTO private.file_references(office_id,file_id,reference_kind)
    VALUES('${office}','${second.fileId}','ficticio_compartilhado');`, 'migrator');
  const requestArgs = { ...args, p_request_id: request.id };
  assert.equal((await query(customerSession.client, 'request_deletion_eligibility', requestArgs)).eligible, false);
  assert.ifError((await service.storage.from(bucket).download(second.path)).error);
  await lab.sql(`DELETE FROM private.file_references WHERE file_id='${second.fileId}';`, 'migrator');

  const eligibility = await query(customerSession.client, 'request_deletion_eligibility', requestArgs);
  assert.equal(eligibility.eligible, true);
  const key = randomUUID();
  const command = {
    ...requestArgs,
    p_expected_version: eligibility.version,
    p_expected_status: eligibility.status,
    p_idempotency_key: key,
    p_confirmation_ack: true,
  };
  const [operation, retry] = await Promise.all([
    query(customerSession.client, 'request_delete_permanently', command),
    query(customerSession.client, 'request_delete_permanently', command),
  ]);
  assert.equal(operation.operation_id, retry.operation_id);
  assert.equal(operation.status, 'processing');
  assert.equal(operation.db_deleted, false);
  assert.equal((await lab.sql(`SELECT count(*) FROM public.files WHERE request_id='${request.id}';`)).trim(), '2');
  assert.ok((await customerSession.client.storage.from(bucket).download(second.path)).error);
  assert.ifError((await service.storage.from(bucket).download(second.path)).error);

  let failSecond = true;
  const handler = createRequestDeletionCleanupHandler({
    url: lab.url,
    anonKey: lab.anonKey,
    serviceRoleKey: lab.serviceRoleKey,
    createAdminClient: () => ({
      rpc: async (...call) => service.rpc(...call),
      storage: { from: name => ({
        remove: paths => failSecond && paths.includes(second.path)
          ? Promise.resolve({ data: null, error: { message: 'Falha de transporte local simulada' } })
          : service.storage.from(name).remove(paths),
      }) },
    }),
  });
  function processAs(token, operationId = operation.operation_id) {
    return handler(new Request('http://127.0.0.1/cleanup', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ office_id: office, operation_id: operationId }),
    }));
  }
  assert.equal((await processAs(unrelatedSession.token)).status, 403);
  assert.equal((await processAs(ownerSession.token)).status, 403);
  const failed = (await (await processAs(customerSession.token)).json()).data.results[0].result;
  assert.equal(failed.status, 'storage_cleanup_failed');
  assert.equal(failed.attachments_removed, 1);
  assert.ok((await service.storage.from(bucket).download(first.path)).error);
  assert.ifError((await service.storage.from(bucket).download(second.path)).error);
  assert.equal((await lab.sql(`SELECT count(*) FROM public.files WHERE request_id='${request.id}';`)).trim(), '2');

  failSecond = false;
  const completed = (await (await processAs(customerSession.token)).json()).data.results[0].result;
  assert.equal(completed.status, 'completed');
  assert.equal(completed.attachments_removed, 2);
  assert.equal(completed.audit_recorded, false);
  assert.equal(completed.client_notified, false);
  for (const file of [first, second]) assert.ok((await service.storage.from(bucket).download(file.path)).error);
  assert.equal((await lab.sql(`
    SELECT NOT EXISTS(SELECT FROM public.requests WHERE id='${request.id}')
      AND NOT EXISTS(SELECT FROM public.files WHERE request_id='${request.id}')
      AND NOT EXISTS(SELECT FROM private.upload_intents WHERE request_id='${request.id}')
      AND NOT EXISTS(SELECT FROM public.audit_events WHERE target_id='${request.id}' AND action='requests.deleted');
  `)).trim(), 't');
  assert.equal((await query(customerSession.client, 'request_delete_permanently', command)).idempotent_replay, true);
  console.log('PASS: real Auth, REST, Storage, concurrent retry, private bytes, shared preservation, partial failure and eventual physical removal');
} finally {
  await lab.close();
}
