import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

test('Express conserva entrega já confirmada durante SIGTERM local',async()=>{
  const id='00000000-0000-4000-a000-000000000002',office='00000000-0000-4000-b000-000000000001';
  let release=()=>{},started=()=>{},finished=false;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const delivering=new Promise<void>(resolve=>{started=resolve;});
  const provider=createServer(async(req,res)=>{
    for await(const _chunk of req) { /* synthetic requests only */ }
    res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user') {res.end(JSON.stringify({id,aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z'}));return;}
    if(req.url?.includes('team_create_invitation')) {res.end(JSON.stringify({id,expires_at:new Date(Date.now()+86400000).toISOString()}));return;}
    started();await gate;finished=true;res.end('{"data":{"delivery":"sent"}}');
  });
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const portProbe=createServer();await new Promise<void>(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
  const port=(portProbe.address() as {port:number}).port;
  await new Promise<void>(resolve=>portProbe.close(()=>resolve()));
  const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{cwd:process.cwd(),env:{...process.env,HOST:'127.0.0.1',PORT:String(port),VITE_SUPABASE_URL:`http://127.0.0.1:${(provider.address() as {port:number}).port}`,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=String(chunk);});child.stderr.on('data',()=>{});
  const exited=once(child,'exit');
  let creating:Promise<Response>|undefined;
  try {
    const deadline=Date.now()+10000;
    while(!output.includes('API disponível')) {
      if(child.exitCode!==null || Date.now()>deadline)throw new Error('A API local não iniciou.');
      await delay(20);
    }
    creating=fetch(`http://127.0.0.1:${port}/api/team/invitations`,{method:'POST',headers:{Authorization:'Bearer synthetic-fixture-token','Content-Type':'application/json'},body:JSON.stringify({office_id:office,email:'nobody@example.test',full_name:'Pessoa Fictícia',cpf:'52998224725',role_code:'employee',permissions:['foundation.access'],expires_at:new Date(Date.now()+86400000).toISOString()})});
    await delivering;
    const response=await creating;assert.equal(response.status,201);assert.equal((await response.json()).data.delivery,'pending');
    child.kill('SIGTERM');
    assert.equal(await Promise.race([exited.then(()=>true),delay(100).then(()=>false)]),false,'SIGTERM não abandona a entrega já confirmada');
    release();
    const result=await Promise.race([exited,delay(5000,undefined,{ref:false}).then(()=>null)]);
    assert.ok(result,'o processo encerra depois da entrega');assert.equal(result[0],0);assert.equal(result[1],null);
    assert.equal(finished,true);assert.match(output,/"delivery":"sent"/);
  } finally {
    release();if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');
    await creating?.catch(()=>{});await exited;
    provider.closeAllConnections();provider.close();
  }
});
