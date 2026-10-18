import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

test('API06 valida filtros, protege eventos e preserva identidade única por request', async t => {
  const office='00000000-0000-4000-b000-000000000001', id='00000000-0000-4000-a000-000000000002';
  const calls:{path:string;body:Record<string,unknown>;authorization:string|undefined}[]=[];
  let mode='valid';
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;
    const body=raw?JSON.parse(raw):{};calls.push({path:req.url!,body,authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user') {res.end(JSON.stringify({id,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{role:'owner'}}));return;}
    if(mode!=='valid') {res.statusCode=mode==='forbidden'?403:mode==='limit'?422:500;res.end(JSON.stringify({code:mode==='forbidden'?'PT403':mode==='limit'?'PT422':'XX000',message:mode==='forbidden'?'GOVERNANCE_FORBIDDEN':mode==='limit'?'EXPORT_LIMIT':'private SQL content'}));return;}
    res.end(JSON.stringify(req.url?.endsWith('audit_export')?{items:[],count:0,office_id:office,request_id:body.p_request_id}:req.url?.endsWith('archive_membership')?{id}:req.url?.endsWith('restore_archive')?{ok:true}:{items:[],total:0,page:body.p_page,page_size:body.p_size}));
  });
  await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  const before=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_fixture';
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/governance`;
  const headers={Authorization:'Bearer verified-test-token','Content-Type':'application/json'};
  const send=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  try {
    await t.test('anônimo não chega ao provedor e resposta privada não é cacheada',async()=>{
      calls.length=0;const r=await fetch(base+`/audit?office_id=${office}`);assert.equal(r.status,401);assert.equal(calls.length,0);assert.match(r.headers.get('cache-control')??'',/private.*no-store/);
    });
    await t.test('consulta paginada usa Bearer e uma identidade/RPC; data final inclusiva vira limite exclusivo UTC',async()=>{
      calls.length=0;const r=await fetch(base+`/audit?office_id=${office}&page=2&size=3&action=team.member_updated&actor_id=${id}&from=2026-10-01&until=2026-10-18`,{headers});
      assert.equal(r.status,200);assert.deepEqual(calls.map(c=>c.path),['/auth/v1/user','/rest/v1/rpc/audit_page']);
      assert.equal(calls[1].body.p_until,'2026-10-19T00:00:00.000Z');assert.equal(calls[1].body.p_actor,id);assert.equal(calls[1].body.p_size,3);assert.ok(calls.every(c=>c.authorization==='Bearer verified-test-token'));
    });
    await t.test('query repetida, paginação ilimitada, ator/data/ação inválidos e extras são recusados',async()=>{
      for(const q of ['page=1&page=2','size=1000','page=0','actor_id=forged','from=2026-02-30','from=2026-11-01&until=2026-10-01','action=bad%20value','actor_role=owner']) assert.equal((await fetch(base+`/audit?office_id=${office}&${q}`,{headers})).status,422,q);
    });
    await t.test('exportação gera request_id no servidor, nega ator enviado e limita o corpo',async()=>{
      assert.equal((await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:'',actor:id})).status,422);
      const r=await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:''});assert.equal(r.status,200);
      const call=calls.at(-1)!;assert.equal(call.path,'/rest/v1/rpc/audit_export');assert.match(String(call.body.p_request_id),/^[0-9a-f-]{36}$/);assert.ok(!('p_actor_id' in call.body));
      assert.equal((await fetch(base+'/audit/export',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status,415);
      assert.equal((await send('/audit/export',{payload:'x'.repeat(2000)})).status,413);
    });
    await t.test('arquivo/restauração só recebem referência e escritório, nunca ativar/excluir',async()=>{
      assert.equal((await send(`/members/${id}/archive`,{office_id:office})).status,201);
      assert.equal(calls.at(-1)!.path,'/rest/v1/rpc/archive_membership');
      assert.equal((await fetch(base+`/archives?office_id=${office}&status=restored`,{headers})).status,200);
      assert.equal((await send(`/archives/${id}/restore`,{office_id:office})).status,200);
      assert.equal((await send(`/archives/${id}/restore`,{office_id:office,active:true})).status,422);
      assert.equal((await fetch(base+`/archives?office_id=${office}&status=deleted`,{headers})).status,422);
    });
    await t.test('capacidade/limite vêm da RPC, erro interno não vaza e usuário não edita evento',async()=>{
      mode='forbidden';assert.equal((await fetch(base+`/audit?office_id=${office}`,{headers})).status,403);
      mode='limit';const limited=await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:''});assert.equal(limited.status,422);assert.equal((await limited.json()).error.code,'EXPORT_LIMIT');
      mode='internal';const r=await fetch(base+`/audit?office_id=${office}`,{headers});assert.equal(r.status,503);assert.ok(!(await r.text()).includes('private SQL'));
      assert.equal((await fetch(base+`/audit/${id}`,{method:'DELETE',headers,body:'{}'})).status,404);
    });
  } finally {
    for(const [i,key] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];
    server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
  }
});
