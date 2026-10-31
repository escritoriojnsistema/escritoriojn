import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
import {office,user,templateId,versionId,detail,declaration} from './fixtures/templates.js';

const folderId='c6bf12ec-6523-4a31-8f3e-528763fca9b3';
const serviceId='6c0eae31-0c70-4e94-9d91-a5c356b6c8d0';

test('modelos22: pastas e vínculos usam autenticação, DTO fechado e revisão de configuração',async t=>{
 let mode='ok';
 const calls:{path:string;body:Record<string,unknown>}[]=[];
 const folder={id:folderId,name:'Contratos rurais',level:2,latest_version:1,templates_count:0,secret:'never expose'};
 const service={id:serviceId,code:'RURAL',name:'Compra e venda rural',version_id:versionId,price_cents:35000};
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;
  const body=raw?JSON.parse(raw):{};
  calls.push({path:req.url??'',body});
  res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id:user,aud:'authenticated'}));return;}
  if(mode==='folder-not-empty'){res.statusCode=409;res.end(JSON.stringify({code:'PT409',message:'TEMPLATE_FOLDER_NOT_EMPTY'}));return;}
  if(mode==='malformed'){res.end(JSON.stringify({...folder,level:99,secret:'private'}));return;}
  let result:unknown;
  if(req.url?.endsWith('/template_folders_page'))result={items:[folder],page:1,page_size:5,total:1,secret:'private'};
  else if(req.url?.endsWith('/template_folder_save'))result=body.p_reason==='__delete__'?{deleted:true}:{...folder,secret:'private'};
  else if(req.url?.endsWith('/template_link'))result={...detail,folder_id:folderId,level:1,config_version:2,service,secret:'private'};
  else result={items:[{id:templateId,code:declaration.code,name:declaration.name,kind:declaration.kind,demonstration:true,latest_version:1,current_version:null,folder_id:folderId,folder_name:folder.name,level:1,service,secret:'private'}],page:1,page_size:5,total:1,secret:'private'};
  res.end(JSON.stringify(result));
 });
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const saved=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
 process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 const server=app.listen(0,'127.0.0.1');
 await new Promise<void>(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/templates`;
 const send=(path:string,body:unknown,authorized=true)=>fetch(base+path,{method:'POST',headers:{...(authorized?{Authorization:'Bearer fixture'}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)});
 const page={office_id:office,page:1,size:5};
 const save={office_id:office,folder_id:folderId,name:folder.name,level:2,expected_version:1,reason:'Organização atualizada',idempotency_key:versionId};
 const link={office_id:office,template_id:templateId,service_id:serviceId,folder_id:folderId,level:1,expected_version:1,expected_config_version:0,reason:'Vínculo validado',idempotency_key:versionId};
 try{
  await t.test('anônimo não consulta pastas nem muda vínculos',async()=>{
   assert.equal((await send('/folders/page',page,false)).status,401);
   assert.equal((await send('/link',link,false)).status,401);
  });
  await t.test('páginas e mutações projetam somente campos autorizados',async()=>{
   const list=await send('/folders/page',page);assert.equal(list.status,200);
   const data=(await list.json()).data;assert.equal(data.secret,undefined);assert.equal(data.items[0].secret,undefined);
   const savedFolder=await send('/folders/save',save);assert.equal(savedFolder.status,200);
   assert.equal((await savedFolder.json()).data.secret,undefined);
   const linked=await send('/link',link);assert.equal(linked.status,200);
   const linkedData=(await linked.json()).data;
   assert.equal(linkedData.secret,undefined);assert.equal(linkedData.config_version,2);
   assert.equal(calls.at(-1)?.body.p_expected_config_version,0);
   assert.equal(calls.at(-1)?.body.p_level,1);
   const catalog=await send('/folder-search',{...page,query:'rural',folder_id:folderId,level:1});
   assert.equal(catalog.status,200);assert.equal((await catalog.json()).data.items[0].secret,undefined);
  });
  await t.test('exclusão conserva resposta mínima e pasta não vazia devolve conflito',async()=>{
   const removed=await send('/folders/save',{...save,reason:'__delete__'});
   assert.equal(removed.status,200);assert.deepEqual((await removed.json()).data,{deleted:true});
   mode='folder-not-empty';const conflict=await send('/folders/save',{...save,reason:'__delete__'});
   assert.equal(conflict.status,409);assert.match(await conflict.text(),/contém modelos/);
   mode='ok';
  });
  await t.test('campos forjados, níveis e revisões inválidas são recusados antes de SQL',async()=>{
   for(const body of [{...link,expected_config_version:-1},{...link,level:4},{...link,actor_id:user},{...save,level:0},{...page,size:50}]){
    const before=calls.filter(c=>c.path.includes('/rpc/')).length;
    const path='template_id' in body?'/link':'name' in body?'/folders/save':'/folders/page';
    assert.equal((await send(path,body)).status,422);
    assert.equal(calls.filter(c=>c.path.includes('/rpc/')).length,before);
   }
  });
  await t.test('dados inesperados do banco não vazam ao navegador',async()=>{
   mode='malformed';assert.equal((await send('/folders/save',save)).status,503);
  });
 }finally{
  server.closeAllConnections();provider.closeAllConnections();
  await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>provider.close(()=>r()))]);
  for(const [i,k] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];
 }
});
