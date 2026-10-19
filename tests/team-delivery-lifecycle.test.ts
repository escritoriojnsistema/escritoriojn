import test from 'node:test';
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { app } from '../server/app.js';
import { drainBackgroundTasks, retainBackgroundTask } from '../server/background.js';
import { createTeamInvitationHandler } from '../supabase/functions/team-invitations/handler.ts';

test('criação confirma commit sem aguardar SMTP e retém entrega no ciclo de vida Vercel',async()=>{
  const office='00000000-0000-4000-b000-000000000001',id='00000000-0000-4000-a000-000000000002',lease='00000000-0000-4000-a000-000000000003';
  const calls:{path:string;authorization:string|undefined}[]=[];
  let delivery='pending',releaseMail=()=>{},mailStarted=()=>{},mailFinished=false,smtpFailure=false;
  const gate=new Promise<void>(resolve=>{releaseMail=resolve;});
  const started=new Promise<void>(resolve=>{mailStarted=resolve;});
  let handler:ReturnType<typeof createTeamInvitationHandler>;
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    const path=req.url!.split('?')[0];calls.push({path,authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(path==='/functions/v1/team-invitations') {
      const response=await handler(new Request('http://fixture'+req.url,{method:'POST',headers:{Authorization:req.headers.authorization!,'Content-Type':'application/json'},body:raw}));
      res.statusCode=response.status;res.end(await response.text());return;
    }
    if(path==='/auth/v1/user') {res.end(JSON.stringify({id,aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'}));return;}
    if(path==='/rest/v1/rpc/team_create_invitation') {res.end(JSON.stringify({id,expires_at:new Date(Date.now()+86400000).toISOString()}));return;}
    if(path==='/rest/v1/rpc/team_claim_delivery') {delivery='sending';res.end(JSON.stringify({email:'recipient@example.test',invitation_id:id,lease_id:lease}));return;}
    if(path==='/auth/v1/invite') {
      mailStarted();await gate;
      if(smtpFailure) {res.statusCode=400;res.end('{"code":"unexpected_failure","msg":"Private SMTP detail"}');return;}
      res.end(JSON.stringify({id,aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'}));return;
    }
    if(path==='/rest/v1/rpc/team_finish_delivery') {delivery=body.p_sent?'sent':'failed';mailFinished=true;res.end('{"recorded":true}');return;}
    if(path==='/rest/v1/rpc/team_dashboard') {res.end(JSON.stringify({items:[{id,delivery_status:delivery}]}));return;}
    res.statusCode=404;res.end('{}');
  });
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
  handler=createTeamInvitationHandler({url:process.env.VITE_SUPABASE_URL,anonKey:process.env.VITE_SUPABASE_PUBLISHABLE_KEY,serviceRoleKey:'server-fixture-key'});
  const retained:Promise<unknown>[]=[];
  const context=new AsyncLocalStorage<{waitUntil:(task:Promise<unknown>)=>void}>();
  const symbol=Symbol.for('@vercel/request-context');
  const globals=globalThis as typeof globalThis & {[symbol]?:{get:()=>unknown}};
  const oldContext=globals[symbol];globals[symbol]={get:()=>context.getStore()};
  const server=createServer((req,res)=>context.run({waitUntil:task=>{retained.push(task);}},()=>app(req,res)));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/team`;
  const headers={Authorization:'Bearer verified-fixture-token','Content-Type':'application/json'};
  const create=()=>fetch(base+'/invitations',{method:'POST',headers,body:JSON.stringify({office_id:office,email:'recipient@example.test',full_name:'Pessoa Fictícia',cpf:'52998224725',role_code:'employee',permissions:['foundation.access'],expires_at:new Date(Date.now()+86400000).toISOString()})});
  const creating=create();
  try {
    await started;
    const early=await Promise.race([creating.then(response=>response),delay(150).then(()=>null)]);
    assert.ok(early,'o 201 deve chegar enquanto SMTP está pendente');
    assert.equal(early.status,201);const data=(await early.json()).data;
    assert.equal(data.id,id);assert.equal(data.delivery,'pending');assert.equal(mailFinished,false);
    assert.equal(retained.length,1,'o SDK real deve registrar a Promise no contexto Vercel');
    let settled=false;void retained[0].then(()=>{settled=true;});await delay(0);
    assert.equal(settled,false,'a Promise retida deve incluir SMTP e finish, não só o disparo HTTP');
    const during=await fetch(`${base}?office_id=${office}&kind=invitations`,{headers});
    assert.equal((await during.json()).data.items[0].delivery_status,'sending');
    releaseMail();await Promise.all(retained);
    assert.equal(mailFinished,true);assert.equal(settled,true);
    const after=await fetch(`${base}?office_id=${office}&kind=invitations`,{headers});
    assert.equal((await after.json()).data.items[0].delivery_status,'sent');
    const pipeline=calls.filter(call=>call.path!=='/auth/v1/user' && !call.path.includes('dashboard'));
    assert.deepEqual(pipeline.map(call=>call.path),['/rest/v1/rpc/team_create_invitation','/functions/v1/team-invitations','/rest/v1/rpc/team_claim_delivery','/auth/v1/invite','/rest/v1/rpc/team_finish_delivery']);
    assert.equal(calls.find(call=>call.path.includes('team_claim_delivery'))!.authorization,'Bearer verified-fixture-token');
    smtpFailure=true;
    const queued=await create();assert.equal(queued.status,201);assert.equal((await queued.json()).data.delivery,'pending');
    await Promise.all(retained);
    const failed=await fetch(`${base}?office_id=${office}&kind=invitations`,{headers});
    assert.equal((await failed.json()).data.items[0].delivery_status,'failed');
    smtpFailure=false;
    const retry=await fetch(`${base}/invitations/${id}/send`,{method:'POST',headers,body:JSON.stringify({office_id:office})});
    assert.equal(retry.status,200);assert.equal((await retry.json()).data.delivery,'sent');
    assert.equal(delivery,'sent','a entrega assíncrona com falha continua reenviável');
  } finally {
    releaseMail();await creating.catch(()=>{});await Promise.allSettled(retained);
    if(oldContext===undefined)delete globals[symbol];else globals[symbol]=oldContext;
    if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;
    server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
  }
});

test('Express local aguarda tarefas pendentes durante drenagem',async()=>{
  let release=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  retainBackgroundTask(gate);
  let drained=false;
  const draining=drainBackgroundTasks().then(()=>{drained=true;});
  try {
    await delay(0);assert.equal(drained,false);
    release();await draining;assert.equal(drained,true);
    await drainBackgroundTasks();
  } finally {release();await draining;}
});
