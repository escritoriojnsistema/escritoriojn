import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

test('API07 mantém pesquisa privada, contratos mínimos e autoridade no banco', async t => {
  const office='00000000-0000-4000-b000-000000000001',id='00000000-0000-4000-a000-000000000002';
  const customer={kind:'person',name:'Maria de Teste',identifier:'529.982.247-25',contacts:[{kind:'email',value:'MARIA@example.test'}]};
  const detail={id,kind:'person',name:'Maria de Teste',identifier_masked:'***.***.***-25',created_at:'2026-10-19T00:00:00Z',identifier:'52998224725',contacts:[{kind:'email',value:'maria@example.test'}],version:1,can_update:true};
  let mode='valid';const calls:{path:string;body:Record<string,unknown>;authorization:string|undefined}[]=[];
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};
    calls.push({path:req.url!,body,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated',role:'authenticated',user_metadata:{role:'owner'},app_metadata:{}}));return;}
    if(mode==='forbidden'||mode==='duplicate'||mode==='conflict'||mode==='missing'||mode==='internal'){
      res.statusCode=mode==='forbidden'?403:mode==='missing'?404:mode==='internal'?500:409;
      res.end(JSON.stringify({code:`PT${res.statusCode}`,message:mode==='forbidden'?'CUSTOMERS_FORBIDDEN':mode==='missing'?'CUSTOMER_NOT_FOUND':mode==='duplicate'?'CUSTOMER_DUPLICATE':mode==='conflict'?'CUSTOMER_CONFLICT':'private SQL PII'}));return;
    }
    if(mode==='malformed'){res.end(JSON.stringify({...detail,kind:['person']}));return;}
    res.end(JSON.stringify(req.url?.endsWith('customers_page')?{items:[{...detail,contacts:detail.contacts,identifier:detail.identifier,private:'secret'}],total:1,page:body.p_page,page_size:body.p_size}:{...detail,private:'secret'}));
  });
  await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
  const previous=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_fixture';
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/customers`;
  const headers={Authorization:'Bearer verified-test-token','Content-Type':'application/json'};
  const send=(path:string,body:unknown,method='POST')=>fetch(base+path,{method,headers,body:JSON.stringify(body)});
  const search={office_id:office,query:'529.982.247-25',page:1,size:3};
  try{
    await t.test('anônimo/cookie não chegam ao provedor; busca não aceita GET ou identificador na URL',async()=>{
      calls.length=0;const denied=await fetch(base+'/search',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'session=forged'},body:JSON.stringify(search)});
      assert.equal(denied.status,401);assert.equal(calls.length,0);assert.match(denied.headers.get('cache-control')??'',/private.*no-store/);assert.match(denied.headers.get('vary')??'',/Authorization/);
      assert.equal((await fetch(base+`/search?office_id=${office}&query=52998224725`,{headers})).status,404);
    });
    await t.test('busca usa uma identidade/Bearer e retorna somente candidatos mascarados',async()=>{
      calls.length=0;const response=await send('/search',search);assert.equal(response.status,200);
      assert.deepEqual(calls.map(c=>c.path),['/auth/v1/user','/rest/v1/rpc/customers_page']);assert.ok(calls.every(c=>c.authorization==='Bearer verified-test-token'));
      assert.equal(calls[1].body.p_query,search.query);assert.equal(calls[1].body.p_size,3);
      const result=await response.json();assert.equal(result.data.items[0].identifier_masked,'***.***.***-25');assert.deepEqual(Object.keys(result.data.items[0]).sort(),['created_at','id','identifier_masked','kind','name']);
      assert.ok(!JSON.stringify(result).includes('52998224725'));assert.ok(!JSON.stringify(result).includes('maria@example.test'));
    });
    await t.test('criação/detalhe/edição geram request_id próprio e não aceitam ator ou office em customer',async()=>{
      const response=await send('',{office_id:office,customer});assert.equal(response.status,201);
      const result=await response.json();assert.equal(result.data.version,1);assert.ok(!('private' in result.data));
      assert.match(String(calls.at(-1)!.body.p_request_id),/^[0-9a-f-]{36}$/);
      assert.equal((await send(`/${id}/detail`,{office_id:office})).status,200);
      assert.equal((await send(`/${id}`,{office_id:office,customer,version:1},'PATCH')).status,200);
      assert.equal(calls.at(-1)!.body.p_version,1);
      assert.equal((await send('',{office_id:office,customer,actor_id:id})).status,422);
      assert.equal((await send('',{office_id:office,customer:{...customer,created_by:id}})).status,422);
    });
    await t.test('identificador ausente é permitido; CPF/CNPJ, contatos e paginação inválidos são recusados',async()=>{
      assert.equal((await send('',{office_id:office,customer:{...customer,identifier:'',contacts:[]}})).status,201);
      assert.equal((await send('',{office_id:office,customer:{kind:'company',name:'Empresa de Teste',identifier:'11.222.333/0001-81',contacts:[{kind:'phone',value:'(11) 99999-9999'}]}})).status,201);
      for(const value of [{...customer,name:''},{...customer,identifier:'11111111111'},{...customer,kind:'company',identifier:'52998224725'},{...customer,contacts:[{kind:'email',value:'bad'}]},{...customer,contacts:[{kind:'phone',value:'123'}]},{...customer,contacts:Array(5).fill({kind:'email',value:'a@b.test'})}])assert.equal((await send('',{office_id:office,customer:value})).status,422);
      assert.equal((await send('',{office_id:office,customer:{...customer,kind:['person'],identifier:''}})).status,422);
      for(const value of [{...search,page:0},{...search,size:100},{...search,query:'x'.repeat(121)},{...search,office_id:'forged'},{...search,actor_id:id}])assert.equal((await send('/search',value)).status,422);
      assert.equal((await send(`/${id}`,{office_id:office,customer,version:0},'PATCH')).status,422);
      assert.equal((await send('/search?query=private',search)).status,422);
      assert.equal((await send('',{office_id:office,customer:{...customer,name:'x'.repeat(5000)}})).status,413);
      assert.equal((await fetch(base,{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{}'})).status,415);
    });
    await t.test('capacidade, duplicidade e versão vêm da RPC; não vaza diagnóstico interno',async()=>{
      for(const [value,status,code] of [['forbidden',403,'CUSTOMERS_FORBIDDEN'],['duplicate',409,'CUSTOMER_DUPLICATE'],['conflict',409,'CUSTOMER_CONFLICT'],['missing',404,'CUSTOMER_NOT_FOUND']] as const){mode=value;const r=await send('',{office_id:office,customer});assert.equal(r.status,status);assert.equal((await r.json()).error.code,code);}
      mode='internal';const failed=await send('/search',search);assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private SQL'));
      mode='malformed';assert.equal((await send(`/${id}/detail`,{office_id:office})).status,503);
    });
  }finally{
    for(const [i,key] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];
    server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
  }
});
