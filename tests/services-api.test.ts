import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

const office='00000000-0000-4000-e000-000000000091';
const id='00000000-0000-4000-d000-000000000091';
const versionId='00000000-0000-4000-f000-000000000091';
export const serviceFixture={code:'XEROX-TESTE',name:'Xerox de Teste',category:'Cópias',unit:'página',price_cents:50,effective_from:null,
  person_required:false,participants_min:0,approval_required:false,signature_required:false,settlement_required:true,
  required_capabilities:['services.perform'],fields:[],checklist:[],quantity_min:1,quantity_max:1000,
  max_discount_bps:0,max_surcharge_bps:0,allow_courtesy:false,allow_price_override:false};

test('catálogo09: API autenticada, contratos e erros seguros',async t=>{
  let mode='ok';const calls:{url:string;authorization?:string;body:Record<string,unknown>}[]=[];
  const version={...serviceFixture,effective_from:'2026-10-20T12:00:00.000Z',id:versionId,number:1,created_at:'2026-10-20T12:00:00.000Z',reason:'Cadastro fictício',created_by:id};
  const summary={id,code:serviceFixture.code,name:serviceFixture.name,category:serviceFixture.category,unit:serviceFixture.unit,price_cents:50,version:1,effective_from:version.effective_from};
  const detail={id,code:serviceFixture.code,latest_version:1,can_manage:true,current:version,versions:[version],history_page:1,history_total:1};
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const c of req)raw+=c;
    const body=raw?JSON.parse(raw):{};calls.push({url:req.url??'',authorization:req.headers.authorization,body});res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated',email:'fixture@example.test'}));return;}
    if(mode!=='ok' && mode!=='malformed') {const status=mode==='forbidden'?403:mode==='conflict'?409:mode==='validation'?422:500;res.statusCode=status;res.end(JSON.stringify({code:`PT${status}`,message:mode==='forbidden'?'SERVICES_FORBIDDEN':mode==='conflict'?'SERVICE_CONFLICT':mode==='validation'?'SERVICES_VALIDATION':'SQL private secret'}));return;}
    if(mode==='malformed'){res.end(JSON.stringify({...detail,latest_version:'1'}));return;}
    const result=req.url?.endsWith('services_page')?{items:[{...summary,private:'secret'}],total:1,page:body.p_page,page_size:body.p_size}:detail;
    res.end(JSON.stringify({...result,private:'secret'}));
  });
  await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  const previous=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/services`;
  const headers={Authorization:'Bearer services-test-token','Content-Type':'application/json'};
  const send=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
  const search={office_id:office,query:'',page:1,size:3};
  try{
    await t.test('anônimo não consulta; contexto não é buscado duas vezes',async()=>{
      calls.length=0;assert.equal((await fetch(base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(search)})).status,401);assert.equal(calls.length,0);
      const response=await send('/search',search);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/private.*no-store/);
      assert.deepEqual(calls.map(x=>x.url),['/auth/v1/user','/rest/v1/rpc/services_page']);assert.ok(calls.every(x=>x.authorization==='Bearer services-test-token'));
      assert.equal((await response.json()).data.items[0].private,undefined);
    });
    await t.test('cadastro e publicação enviam motivo/versão e request_id próprio',async()=>{
      const result=await send('',{office_id:office,service:serviceFixture,reason:'Cadastro fictício'});assert.equal(result.status,201);assert.equal((await result.json()).data.private,undefined);
      assert.match(String(calls.at(-1)?.body.p_request_id),/^[a-f0-9-]{36}$/);
      assert.equal((await send(`/${id}/versions`,{office_id:office,service:{...serviceFixture,price_cents:75},expected_version:1,reason:'Reajuste fictício'})).status,201);
      assert.equal((await send(`/${id}/detail`,{office_id:office,page:1})).status,200);
    });
    await t.test('centavos, quantidades, políticas e campos são estritos',async()=>{
      for(const change of [{price_cents:0.5},{price_cents:-1},{quantity_min:0},{quantity_max:0},{max_discount_bps:10001},{participants_min:2},{fields:[{key:'cpf',label:'CPF',type:'text',required:'sim'}]},{required_capabilities:['users.manage']},{name:['forjado']},{effective_from:'2026-02-31'},{allow_courtesy:'true'},{signature_required:true}]){
        assert.equal((await send('',{office_id:office,service:{...serviceFixture,...change},reason:'Teste fictício'})).status,422,JSON.stringify(change));
      }
      for(const change of [{reason:''},{actor_id:id},{service:{...serviceFixture,office_id:office}}])assert.equal((await send('',{office_id:office,service:serviceFixture,reason:'Teste fictício',...change})).status,422);
      assert.equal((await send('/search',{...search,size:100})).status,422);
      assert.equal((await send(`/${id}/quote`,{office_id:office,quantity:1.5,adjustment:{kind:'none',value:0,reason:''}})).status,422);
      assert.equal((await send(`/${id}/quote`,{office_id:office,quantity:2,adjustment:{kind:'discount',value:10,reason:''}})).status,422);
      assert.equal((await send(`/${id}/versions`,{office_id:office,service:serviceFixture,expected_version:0,reason:'Teste'})).status,422);
    });
    await t.test('falhas de capacidade/conflito/validação e provedor são distintas',async()=>{
      for(const [value,status] of [['forbidden',403],['conflict',409],['validation',422],['internal',503],['malformed',503]] as const){mode=value;const r=await send(`/${id}/detail`,{office_id:office,page:1});assert.equal(r.status,status);assert.ok(!(await r.text()).includes('SQL private'));}
    });
  }finally{
    for(const [i,key] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];
    server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
  }
});
