import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

test('API06 valida filtros, protege eventos e preserva identidade única por request', async t => {
  const office='00000000-0000-4000-b000-000000000001', id='00000000-0000-4000-a000-000000000002';
  const calls:{path:string;body:Record<string,unknown>;authorization:string|undefined}[]=[];
  let mode='valid';let canonicalHash='';
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;
    const body=raw?JSON.parse(raw):{};calls.push({path:req.url!,body,authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user') {res.end(JSON.stringify({id,aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{role:'owner'}}));return;}
    if(mode==='revoked-at-seal'&&req.url?.endsWith('audit_report_seal')){res.statusCode=403;res.end(JSON.stringify({code:'PT403',message:'GOVERNANCE_FORBIDDEN'}));return;}
    if(!['valid','revoked-at-seal','conflicting-seal','volume','incomplete','revoked-chunk'].includes(mode)) {res.statusCode=mode==='forbidden'?403:mode==='limit'?422:500;res.end(JSON.stringify({code:mode==='forbidden'?'PT403':mode==='limit'?'PT422':'XX000',message:mode==='forbidden'?'GOVERNANCE_FORBIDDEN':mode==='limit'?'EXPORT_LIMIT':'private SQL content'}));return;}
    if(req.url?.endsWith('audit_report_chunk')&&['volume','revoked-chunk'].includes(mode)){
      const offset=Number(body.p_offset),total=mode==='volume'?1001:501;
      if(mode==='revoked-chunk'&&offset>=500){res.statusCode=403;res.end(JSON.stringify({code:'PT403',message:'GOVERNANCE_FORBIDDEN'}));return;}
      const items=Array.from({length:Math.min(500,total-offset)},(_,i)=>({id:`evento-${offset+i}`,actor_id:id,actor_name:'Pessoa de teste',action:'team.member_updated',target_type:'membership',target_id:id,outcome:'success',occurred_at:'2026-10-23T10:00:00Z',request_id:id,changes:{active:true}}));
      res.end(JSON.stringify({items,offset,total}));return;
    }
    res.end(JSON.stringify((req.url?.endsWith('audit_report_begin')||req.url?.endsWith('audit_report_reference'))?{id,protocol:`JN-AUD-${id}`,count:mode==='volume'?1001:mode==='revoked-chunk'?501:mode==='incomplete'?1:0,office_id:office,office_name:'Escritório Fictício',actor_name:'Responsável Fictício',created_at:'2026-10-23T10:00:00Z',view:'recent',cutoff:'2026-07-25T10:00:00Z',filters:{action:'',actor_id:'',from:'',until:''},renderer_version:1,contract_version:1}:req.url?.endsWith('audit_report_chunk')?{items:[],offset:0,total:0}:req.url?.endsWith('audit_report_seal')?{id,sha256:'f'.repeat(64),registered_digest_match:false}:req.url?.endsWith('audit_report_check')?{match:true,count:0,protocol:`JN-AUD-${id}`,created_at:'2026-10-23T10:00:00Z'}:req.url?.endsWith('archive_membership')?{id}:req.url?.endsWith('restore_archive')?{ok:true}:{items:[],total:0,page:body.p_page,page_size:body.p_size}));
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
      assert.equal(r.status,200);assert.deepEqual(calls.map(c=>c.path),['/auth/v1/user','/rest/v1/rpc/audit_history_page']);
      assert.equal(calls[1].body.p_until,'2026-10-19T00:00:00.000Z');assert.equal(calls[1].body.p_actor,id);assert.equal(calls[1].body.p_size,3);assert.ok(calls.every(c=>c.authorization==='Bearer verified-test-token'));
    });
    await t.test('query repetida, paginação ilimitada, ator/data/ação inválidos e extras são recusados',async()=>{
      for(const q of ['page=1&page=2','size=1000','page=0','actor_id=forged','from=2026-02-30','from=2026-11-01&until=2026-10-01','action=bad%20value','actor_role=owner']) assert.equal((await fetch(base+`/audit?office_id=${office}&${q}`,{headers})).status,422,q);
    });
    await t.test('exportação gera request_id no servidor, nega ator enviado e limita o corpo',async()=>{
      assert.equal((await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:'',actor:id})).status,422);
      const r=await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:''});assert.equal(r.status,200);
      assert.match(r.headers.get('content-type')??'',/application\/pdf/);const pdf=Buffer.from(await r.arrayBuffer());assert.equal(pdf.subarray(0,5).toString(),'%PDF-');canonicalHash=createHash('sha256').update(pdf).digest('hex');const call=[...calls].reverse().find(c=>c.path.endsWith('audit_report_begin'))!;assert.equal(call.path,'/rest/v1/rpc/audit_report_begin');assert.ok(calls.some(c=>c.path.endsWith('audit_report_seal')&&/^[a-f0-9]{64}$/.test(String(c.body.p_sha256))));assert.match(String(call.body.p_request_id),/^[0-9a-f-]{36}$/);assert.ok(!('p_actor_id' in call.body));
      assert.equal((await fetch(base+'/audit/export',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status,415);
      assert.equal((await send('/audit/export',{payload:'x'.repeat(2000)})).status,413);
    });
    await t.test('verificação regenera canônico e ignora hash forjado registrado por chamada direta',async()=>{
      calls.length=0;
      const matched=await send('/audit/verify',{office_id:office,report_id:id,sha256:canonicalHash});assert.equal(matched.status,200);assert.equal((await matched.json()).data.match,true);
      const forged=await send('/audit/verify',{office_id:office,report_id:id,sha256:'f'.repeat(64)});assert.equal(forged.status,200);assert.equal((await forged.json()).data.match,false);
      assert.equal((await send('/audit/verify',{office_id:office,report_id:id,sha256:canonicalHash,events:[]})).status,422);
      assert.equal((await send('/audit/verify',{office_id:office,report_id:id,sha256:'not-a-hash'})).status,422);
      assert.ok(!calls.some(c=>c.path.endsWith('audit_report_seal')));
    });
    await t.test('selo antecipado divergente nao veta download do PDF canonico',async()=>{mode='conflicting-seal';const r=await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:'',view:'recent'});assert.equal(r.status,200);assert.equal(createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),canonicalHash);mode='valid';});
    await t.test('revogação ao concluir impede liberar qualquer byte do PDF',async()=>{
      mode='revoked-at-seal';const r=await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:'',view:'archived'});assert.equal(r.status,403);assert.match(r.headers.get('content-type')??'',/json/);mode='valid';
    });
    await t.test('política aceita apenas escritório/prazo/versão; view é estrita',async()=>{
      for(const days of [0,45,120,'30'])assert.equal((await send('/audit/policy',{office_id:office,days,version:1})).status,422);
      assert.equal((await send('/audit/policy',{office_id:office,days:30,version:1,actor_id:id})).status,422);
      assert.equal((await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:'',view:['recent']})).status,422);
      assert.equal((await fetch(base+`/audit?office_id=${office}&view=all`,{headers})).status,422);
      assert.equal((await send('/audit/policy',{office_id:office,days:30,version:1})).status,200);assert.equal(calls.at(-1)?.path,'/rest/v1/rpc/audit_policy_set');
    });
    await t.test('PDF usa todos os1001 eventos e pagina snapshot por ordinais estáveis',async()=>{
      mode='volume';calls.length=0;const r=await send('/audit/export',{office_id:office,action:'team.member_updated',actor_id:'',from:'',until:'',view:'recent'});assert.equal(r.status,200);assert.equal(r.headers.get('X-Audit-Count'),'1001');assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),'%PDF-');assert.deepEqual(calls.filter(c=>c.path.endsWith('audit_report_chunk')).map(c=>c.body.p_offset),[0,500,1000]);mode='valid';
    });
    await t.test('snapshot incompleto ou revogação entre lotes não libera relatório parcial',async()=>{
      for(const state of ['incomplete','revoked-chunk']){mode=state;calls.length=0;const r=await send('/audit/export',{office_id:office,action:'',actor_id:'',from:'',until:'',view:'recent'});assert.equal(r.status,state==='incomplete'?503:403);assert.match(r.headers.get('content-type')??'',/json/);assert.ok(!calls.some(c=>c.path.endsWith('audit_report_seal')));}
      mode='valid';
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
