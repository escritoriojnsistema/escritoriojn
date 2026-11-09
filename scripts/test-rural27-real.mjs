import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {correctionDocuments} from '../tests/auth/corrections-document-fixture.mjs';
import {app} from '../server/app.ts';
// LOCAL disposable GoTrue/PostgREST/Storage + actual Express/Edge handler; no hosted override.
let lab,server;const clients=[];
try{
 lab=await createAuthLab({storage:true,artifacts:true,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});await lab.migrate();
 process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;};
 const admin=sdk(lab.serviceRoleKey),users={},sessions={},password='Local-'+randomBytes(24).toString('hex')+'!';
 for(const name of ['owner','closing']){const r=await admin.auth.admin.createUser({email:`delivery26-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Entregas26 laboratório','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users.closing}','Cliente local26');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users.closing}','client');`,'migrator');
 for(const name of ['owner','closing']){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`delivery26-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);sessions[name]=r.data.session.access_token;}
 server=createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${server.address().port}/api/`;
 const post=async(name,path,body,status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+sessions[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});assert.equal(r.status,status,`${path}: ${r.status} ${r.status!==status?await r.clone().text():''}`);return r;};
 const data=async(path,body,status=200)=>(await(await post('owner',path,body,status)).json()).data;
 const categoryName='Entrega26 '+randomUUID().slice(0,8);await data('categories/command',{command:{kind:'create',name:categoryName,execution_level:3,reason:'Categoria sintética exclusiva do laboratório'},idempotency_key:randomUUID()});
 const fixture=await correctionDocuments({post,lab,users,office,categoryName});

 const create={kind:'create',customer_id:fixture.customerId,name:'Imóvel rural local27',municipality:'Cidade de teste',state:'MG',location:'Localização sintética',identifiers:{cafir:'Referência não oficial'}};
 const key=randomUUID(),body={property_id:null,command:create,key};const first=await data('rural/command',body);assert.deepEqual(await data('rural/command',body),first);
 const second=await data('rural/command',{...body,command:{...create,name:'Segundo imóvel local27'},key:randomUUID()});assert.notEqual(first.id,second.id);
 await data('rural/command',{property_id:first.id,command:{kind:'party',expected_version:1,customer_id:fixture.customerId,role:'holder',valid_from:'2020-01-01',valid_until:null},key:randomUUID()});
 const requestId=(await lab.sql(`SELECT request_id FROM public.documents WHERE office_id='${office}' AND id='${fixture.documents[0].documentId}';`)).trim();
 const itemId=(await lab.sql(`SELECT request_item_id FROM public.documents WHERE office_id='${office}' AND id='${fixture.documents[0].documentId}';`)).trim();
 const bytes=fixture.documents[0].bytes;const intent=await data('attachments/intents',{input:{request_id:requestId,request_item_id:itemId,name:'rural-local.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'documento',idempotency_key:randomUUID()}},201);
 assert.ifError((await clients[1].storage.from(intent.bucket).upload(intent.object_path,bytes,{contentType:'application/pdf',upsert:false})).error);
 const validated=await data('attachments/process',{action:'validate',args:{intent_id:intent.intent_id}});assert.equal(validated.file.status,'quarentena');
 const source={id:intent.file.id,request_id:requestId};
 await data('rural/command',{property_id:first.id,command:{kind:'link',expected_version:2,request_id:source.request_id,file_id:source.id,exercise:2026},key:randomUUID()});
 const state=await data('rural/state',{property_id:first.id,page:1});assert.equal(state.parties.length,1);assert.equal(state.records[0].file_id,source.id);
 await post('closing','rural/state',{property_id:first.id,page:1},403);
 console.log(JSON.stringify({proof:'etapa27-real-local',auth:true,rest:true,express:true,storage_fixture:true,two_properties:true,period:true,request_file_link:true,client_denied:true,idempotency:true}));
}catch(e){console.error('Etapa27 real local: '+e.message);process.exitCode=1;}finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
