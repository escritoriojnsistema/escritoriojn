import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

test('API de equipe conserva autorização e resultado real do envio', async t => {
  const office='00000000-0000-4000-b000-000000000001';
  const id='00000000-0000-4000-a000-000000000002';
  let mode='valid';
  const calls:{path:string;body:Record<string,unknown>;authorization:string|undefined}[]=[];
  const provider=createServer(async(req,res)=>{
    let raw=''; for await (const part of req) raw+=part;
    const body=raw?JSON.parse(raw):{};
    calls.push({path:req.url!,body,authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if (req.url==='/auth/v1/user') {
      if (mode==='expired') {res.statusCode=401;res.end('{"code":"bad_jwt","msg":"expired"}');return;}
      res.end(JSON.stringify({id,email:'example@example.test',aud:'authenticated',role:'authenticated',user_metadata:{role:'owner'},app_metadata:{},created_at:'2026-01-01T00:00:00Z'}));return;
    }
    if (req.url?.startsWith('/functions/v1/')) {
      if (mode==='mail-denied') {res.statusCode=403;res.end('{"error":{"code":"TEAM_FORBIDDEN"}}');return;}
      if (mode==='mail-failed') {res.statusCode=503;res.end('{"error":"private SMTP diagnostic"}');return;}
      res.end('{"data":{"delivery":"sent"}}');return;
    }
    if (mode==='forbidden' || mode==='last-owner' || mode==='internal') {
      res.statusCode=mode==='internal'?500:mode==='last-owner'?409:403;
      res.end(JSON.stringify({code:mode==='internal'?'XX000':mode==='last-owner'?'PT409':'PT403',message:mode==='internal'?'private SQL diagnostic':mode==='last-owner'?'LAST_OWNER':'TEAM_FORBIDDEN'}));return;
    }
    const name=req.url?.split('/').at(-1);
    const data=name==='team_dashboard'?{kind:'members',items:[],total:0,page:1,page_size:5,counts:{members:0,invitations:0},scope:{role_code:'owner',allowed_roles:['employee','admin','owner'],allowed_permissions:['foundation.access','audit.read'],can_create_owner:true,can_delegate:true}}
      :name==='team_create_invitation'?{id,expires_at:new Date(Date.now()+86400000).toISOString()}
      :name==='team_invitation_state'?{id,office_name:'Teste',verified:false,has_password:false,verified_until:null}
      :name==='team_verify_invitation'?{verified:false,code:'IDENTITY_MISMATCH'}
      :name==='team_accept_invitation'?{office_id:office,role_code:'employee'}:{ok:true};
    res.end(JSON.stringify(data));
  });
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_fixture';
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/team`;
  const headers={Authorization:'Bearer verified-test-token','Content-Type':'application/json'};
  const send=(path:string,body:unknown,method='POST')=>fetch(base+path,{method,headers,body:JSON.stringify(body)});
  const invitation={office_id:office,email:'recipient@example.test',full_name:'Pessoa Fictícia',cpf:'52998224725',role_code:'employee',permissions:['foundation.access'],expires_at:new Date(Date.now()+86400000).toISOString()};
  try {
    await t.test('nega anônimo e cookie sem consultar provedor',async()=>{
      calls.length=0;
      for (const h of [{},{Cookie:'session=unverified'}] as Record<string,string>[]) {
        const response=await fetch(base,{headers:h});
        assert.equal(response.status,401); assert.equal((await response.json()).error.code,'AUTH_REQUIRED');
        assert.match(response.headers.get('cache-control')??'',/private.*no-store/);
        assert.match(response.headers.get('vary')??'',/Authorization/);
      }
      assert.equal(calls.length,0);
    });
    await t.test('consulta só identidade e RPC de negócio com mesmo Bearer',async()=>{
      calls.length=0;
      const response=await fetch(`${base}?office_id=${office}&kind=members&page=1&status=all`,{headers});
      assert.equal(response.status,200); assert.equal((await response.json()).data.page_size,5);
      assert.deepEqual(calls.map(c=>c.path),['/auth/v1/user','/rest/v1/rpc/team_dashboard']);
      assert.ok(calls.every(c=>c.authorization==='Bearer verified-test-token'));
    });
    await t.test('valida corpo, campos extras, CPF e query antes da RPC',async()=>{
      for (const body of [{...invitation,role_code:'client'},{...invitation,cpf:'11111111111'},{...invitation,actor_id:id},{...invitation,permissions:['users.manage']},{...invitation,full_name:'Só'},{...invitation,expires_at:'invalid'}]) {
        const response=await send('/invitations',body);assert.equal(response.status,422);
      }
      assert.equal((await fetch(`${base}?office_id=${office}&page=1&page=2`,{headers})).status,422);
      assert.equal((await send('/invitations',invitation).then(r=>r.status)),201);
      assert.equal((await fetch(base+'/invitations',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status,415);
      assert.equal((await send('/invitations',{...invitation,full_name:'x'.repeat(5000)})).status,413);
    });
    await t.test('poder não vem de metadata e erro SQL não vaza',async()=>{
      mode='forbidden';const denied=await fetch(`${base}?office_id=${office}`,{headers});
      assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'TEAM_FORBIDDEN');
      mode='last-owner';const owner=await send(`/members/${id}`,{office_id:office,role_code:'employee',active:false,permissions:['foundation.access']},'PATCH');
      assert.equal(owner.status,409);assert.equal((await owner.json()).error.code,'LAST_OWNER');
      mode='internal';const failed=await fetch(`${base}?office_id=${office}`,{headers});
      assert.equal(failed.status,503);assert.ok(!JSON.stringify(await failed.json()).includes('private SQL'));
      mode='valid';
    });
    await t.test('envio incerto preserva convite sem prometer e-mail enviado',async()=>{
      mode='mail-failed';const response=await send('/invitations',invitation);
      assert.equal(response.status,201);const result=await response.json();assert.equal(result.data.id,id);assert.equal(result.data.delivery,'pending');
      mode='valid';
      const sent=await send(`/invitations/${id}/send`,{office_id:office});assert.equal(sent.status,200);assert.equal((await sent.json()).data.delivery,'sent');
      const edge=calls.filter(c=>c.path==='/functions/v1/team-invitations').at(-1)!;
      assert.equal(edge.body.office_id,office);assert.equal(edge.body.invitation_id,id);
      assert.equal(edge.authorization,'Bearer verified-test-token');
      assert.ok(!('email' in edge.body) && !('redirect_to' in edge.body));
      mode='mail-denied';const denied=await send(`/invitations/${id}/send`,{office_id:office});assert.equal(denied.status,403);
      mode='valid';
    });
    await t.test('destinatário verifica e aceita sem contexto de equipe anterior',async()=>{
      const state=await fetch(`${base}/invitations/${id}/state`,{headers});assert.equal(state.status,200);
      const check=await send(`/invitations/${id}/verify`,{full_name:'Pessoa Fictícia',cpf:'52998224725',role_code:'employee'});
      assert.deepEqual((await check.json()).data,{verified:false,code:'IDENTITY_MISMATCH'});
      assert.equal((await send(`/invitations/${id}/accept`,{})).status,200);
      assert.equal((await send(`/invitations/${id}/accept`,{role_code:'owner'})).status,422);
      mode='expired';assert.equal((await fetch(`${base}/invitations/${id}/state`,{headers})).status,401);
      mode='valid';
    });
  } finally {
    if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;
    server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
  }
});
