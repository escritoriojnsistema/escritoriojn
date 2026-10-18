import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTeamInvitationHandler } from '../supabase/functions/team-invitations/handler.ts';

test('transporte SMTP restringe segredo e destino ao convite autorizado',async t=>{
  const office='00000000-0000-4000-b000-000000000001',invitation='00000000-0000-4000-a000-000000000002',lease='00000000-0000-4000-a000-000000000003';
  let mode='new';
  const calls:{path:string;authorization:string|undefined;body:Record<string,unknown>}[]=[];
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;
    const body=raw?JSON.parse(raw):{};calls.push({path:req.url!,authorization:req.headers.authorization,body});
    res.setHeader('Content-Type','application/json');res.setHeader('X-Supabase-Api-Version','2024-01-01');
    if(req.url==='/auth/v1/user') {res.end(JSON.stringify({id:invitation,aud:'authenticated',role:'authenticated',user_metadata:{role:'owner'},created_at:'2026-01-01T00:00:00Z'}));return;}
    if(req.url==='/rest/v1/rpc/team_claim_delivery') {
      if(mode==='forbidden') {res.statusCode=403;res.end('{"code":"PT403","message":"TEAM_FORBIDDEN"}');return;}
      res.end(JSON.stringify({email:'recipient@example.test',invitation_id:invitation,lease_id:lease}));return;
    }
    if(req.url?.startsWith('/auth/v1/invite')) {
      if(mode==='existing') {res.statusCode=422;res.end('{"code":"email_exists","msg":"Private existing identity"}');return;}
      if(mode==='smtp-failed') {res.statusCode=400;res.end('{"code":"unexpected_failure","msg":"Private SMTP detail"}');return;}
      res.end(JSON.stringify({id:invitation,email:'recipient@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'}));return;
    }
    if(req.url==='/rest/v1/rpc/team_finish_delivery') {res.end(JSON.stringify({recorded:mode!=='lease-stale'}));return;}
    res.end('{}');
  });
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const handler=createTeamInvitationHandler({url:`http://127.0.0.1:${(provider.address() as {port:number}).port}`,anonKey:'sb_publishable_fixture',serviceRoleKey:'server-fixture-key'});
  const send=(body:unknown={office_id:office,invitation_id:invitation},auth=true)=>handler(new Request('https://example.test/functions/v1/team-invitations',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer caller-fixture-token'}:{})},body:JSON.stringify(body)}));
  try {
    await t.test('anônimo e payload de redirecionamento arbitrário não chegam ao provedor',async()=>{
      calls.length=0;assert.equal((await send(undefined,false)).status,401);assert.equal(calls.length,0);
      assert.equal((await send({office_id:office,invitation_id:invitation,redirect_to:'https://evil.test'})).status,422);
      assert.equal(calls.filter(c=>c.path.includes('claim')).length,0);
    });
    await t.test('função da metadata não supera a autorização vigente da RPC',async()=>{
      mode='forbidden';calls.length=0;assert.equal((await send()).status,403);
      assert.equal(calls.filter(c=>c.path.includes('/invite')).length,0);mode='new';
    });
    await t.test('novo destinatário usa segredo só no Auth admin e conclusão estreita',async()=>{
      calls.length=0;const response=await send();assert.equal(response.status,200);const responseText=await response.text();assert.equal(JSON.parse(responseText).data.delivery,'sent');
      const invited=calls.find(c=>c.path.startsWith('/auth/v1/invite'))!;
      assert.equal(invited.authorization,'Bearer server-fixture-key');
      assert.equal(new URL('http://fixture'+invited.path).searchParams.get('redirect_to'),`https://escritoriojn.vercel.app/auth/callback?area=team&invite=${invitation}`);
      assert.ok(!('data' in invited.body),'sem papel em metadata');
      const claim=calls.find(c=>c.path.includes('team_claim_delivery'))!;assert.equal(claim.authorization,'Bearer caller-fixture-token');
      const finish=calls.find(c=>c.path.includes('team_finish_delivery'))!;assert.equal(finish.authorization,'Bearer server-fixture-key');
      assert.deepEqual(finish.body,{p_invitation_id:invitation,p_lease_id:lease,p_sent:true});
      assert.ok(!responseText.includes('server-fixture-key'));
    });
    await t.test('conta existente recebe recuperação implicit pelo mesmo SMTP',async()=>{
      mode='existing';calls.length=0;const response=await send();assert.equal(response.status,200);assert.equal((await response.json()).data.delivery,'sent');
      const recovery=calls.find(c=>c.path.startsWith('/auth/v1/recover'))!;assert.ok(recovery);
      assert.equal(recovery.authorization,'Bearer sb_publishable_fixture');assert.equal(recovery.body.code_challenge,null);
      assert.equal(new URL('http://fixture'+recovery.path).searchParams.get('redirect_to'),`https://escritoriojn.vercel.app/auth/callback?area=team&invite=${invitation}`);
    });
    await t.test('falha de envio e lease vencido não produzem falso sucesso',async()=>{
      mode='smtp-failed';calls.length=0;const failed=await send();const body=await failed.text();assert.ok(!body.includes('Private SMTP'));assert.equal(JSON.parse(body).data.delivery,'failed');
      assert.equal(calls.find(c=>c.path.includes('team_finish_delivery'))!.body.p_sent,false);
      mode='lease-stale';const uncertain=await send();assert.equal((await uncertain.json()).data.delivery,'pending');
    });
  } finally {provider.closeAllConnections();provider.close();}
});
