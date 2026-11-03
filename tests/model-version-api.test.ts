import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
import {office,user,templateId,versionId,declaration,detail} from './fixtures/templates.js';

test('modelos: editar e excluir a mesma versão autentica, valida e projeta o detalhe',async()=>{
  const calls:{path:string;body:Record<string,unknown>}[]=[];
  const provider=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    calls.push({path:req.url??'',body:raw?JSON.parse(raw):{}});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id:user,aud:'authenticated'}));return;}
    if(req.url?.endsWith('model_version_command')){res.end(JSON.stringify({...detail,secret:'hidden'}));return;}
    res.statusCode=500;res.end('{}');
  });
  await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
  const previous=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/document-commercial/version-command`;
  const send=(body:unknown,auth=true)=>fetch(base,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(body)});
  const edit={office_id:office,template_id:templateId,command:{kind:'edit',version_id:versionId,definition:declaration,reason:'Ajuste editorial fictício'},expected_version:1,idempotency_key:versionId};
  const remove={office_id:office,template_id:templateId,command:{kind:'delete',version_id:versionId,reason:'Exclusão fictícia'},expected_version:1,idempotency_key:versionId};
  try{
    const rpcCalls=()=>calls.filter(call=>call.path.includes('/rpc/')).length;
    assert.equal((await send(edit,false)).status,401);
    assert.equal(rpcCalls(),0);
    assert.equal((await send({...edit,command:{...edit.command,reason:''}})).status,422);
    assert.equal((await send({...edit,expected_version:0})).status,422);
    assert.equal((await send({...edit,command:{...edit.command,extra:true}})).status,422);
    assert.equal(rpcCalls(),0);
    const response=await send(edit);
    assert.equal(response.status,200);
    const data=(await response.json()).data;
    assert.equal(data.versions[0].secret,undefined);
    assert.equal(calls.at(-1)?.path,'/rest/v1/rpc/model_version_command');
    assert.equal((calls.at(-1)?.body.p_command as Record<string,unknown>).kind,'edit');
    assert.equal((await send(remove)).status,200);
    assert.equal((calls.at(-1)?.body.p_command as Record<string,unknown>).kind,'delete');
  }finally{
    server.closeAllConnections();provider.closeAllConnections();
    await Promise.all([new Promise<void>(resolve=>server.close(()=>resolve())),new Promise<void>(resolve=>provider.close(()=>resolve()))]);
    for(const [index,key] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(previous[index]===undefined)delete process.env[key];else process.env[key]=previous[index];
  }
});
