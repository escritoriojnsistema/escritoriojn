import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

test('acesso verifica identidade, contexto vigente e escopo no servidor', async () => {
  const userId='00000000-0000-4000-a000-000000000001';
  const officeId='00000000-0000-4000-b000-000000000001';
  let mode='valid';
  let role='owner';
  const calls:string[]=[];
  const provider=createServer((req,res)=>{
    res.setHeader('Content-Type','application/json');
    calls.push(`${req.url} ${req.headers.authorization}`);
    if (mode==='outage') { res.statusCode=503; res.end(JSON.stringify({message:'provider internal detail'})); return; }
    if (req.url==='/auth/v1/user') {
      if (req.headers.authorization!=='Bearer verified-test-token') {
        res.statusCode=401; res.end(JSON.stringify({code:'bad_jwt',msg:'invalid'})); return;
      }
      res.end(JSON.stringify({id:userId,email:'ficticio@example.test',aud:'authenticated',role:'authenticated',
        app_metadata:{},user_metadata:{role:'owner'},created_at:'2026-01-01T00:00:00Z'})); return;
    }
    if (mode==='unlinked') {res.end('[]');return;}
    if (mode==='malformed') {res.end('[{"role_code":"owner"}]');return;}
    res.end(JSON.stringify([{user_id:userId,office_id:officeId,role_code:role,permissions:['foundation.access'],
      office_name:'Escritorio Ficticio',display_name:'Pessoa Ficticia'}]));
  });
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const providerPort=(provider.address() as {port:number}).port;
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${providerPort}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_fixture';
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const api=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/auth/context`;
  const auth={Authorization:'Bearer verified-test-token'};
  try {
    const anonymous=await fetch(api);
    assert.equal(anonymous.status,401);
    assert.equal((await anonymous.json()).error.code,'AUTH_REQUIRED');
    assert.match(anonymous.headers.get('cache-control')??'',/no-store/);
    const cookie=await fetch(api,{headers:{Cookie:'session=unverified-value'}});
    assert.equal(cookie.status,401);
    const valid=await fetch(api,{headers:auth});
    assert.equal(valid.status,200);
    assert.equal((await valid.json()).data.contexts[0].office_id,officeId);
    assert.ok(calls.some(call=>call.startsWith('/auth/v1/user Bearer verified-test-token')));
    assert.ok(calls.some(call=>call.startsWith('/rest/v1/rpc/my_access_context Bearer verified-test-token')));
    const invalid=await fetch(api,{headers:{Authorization:'Bearer expired-test-token'}});
    assert.equal(invalid.status,401);
    mode='unlinked';
    assert.equal((await fetch(api,{headers:auth})).status,403,'metadata owner nao concede acesso sem vinculo');
    mode='valid';
    assert.equal((await fetch(`${api}?office_id=00000000-0000-4000-b000-000000000002`,{headers:auth})).status,403);
    assert.equal((await fetch(`${api}?role=owner`,{headers:auth})).status,422);
    for (const teamRole of ['owner','admin','employee']) {
      role=teamRole;
      assert.equal((await fetch(`${api}?area=client`,{headers:auth})).status,403);
      assert.equal((await fetch(`${api}?area=team`,{headers:auth})).status,200);
    }
    role='client';
    assert.equal((await fetch(`${api}?area=team`,{headers:auth})).status,403);
    assert.equal((await fetch(`${api}?area=client`,{headers:auth})).status,200);
    mode='malformed';
    assert.equal((await fetch(api,{headers:auth})).status,503);
    mode='outage';
    const failed=await fetch(api,{headers:auth});
    assert.equal(failed.status,503);
    assert.ok(!JSON.stringify(await failed.json()).includes('provider internal detail'));
  } finally {
    delete process.env.VITE_SUPABASE_URL; delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    server.closeAllConnections(); server.close(); provider.closeAllConnections();provider.close();
  }
});
