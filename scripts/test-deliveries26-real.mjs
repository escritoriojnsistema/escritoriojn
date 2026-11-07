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
 const target=fixture.documents[0],other=fixture.documents[1],sha=createHash('sha256').update(target.bytes).digest('hex');
 let state=await data('document-workflow/delivery-state',{publication_id:target.id,page:1});assert.ok(state.ready);assert.equal(state.items[0].channel,'download');assert.equal(state.items[0].status,'available');assert.equal(state.items[0].sha256,sha);
 const command={kind:'begin',channel:'print',expected_revision:state.revision,recipient_customer_id:fixture.customerId,contact_position:null,expected_phone:null,recipient_checked:true},key=randomUUID();
 state=await data('document-workflow/delivery-command',{publication_id:target.id,command,idempotency_key:key});const delivery=state.items[0];assert.equal(delivery.status,'attempt');
 const replay=await data('document-workflow/delivery-command',{publication_id:target.id,command,idempotency_key:key});assert.equal(replay.items[0].id,delivery.id);
 const event=(kind,item,reason)=>({publication_id:target.id,command:{kind,delivery_id:item.id,expected_event_id:item.last_event_id,reason},idempotency_key:randomUUID()});
 await post('owner','document-workflow/delivery-command',event('available',delivery,'Sem obtenção privada após esta tentativa'),409);
 const obtained=await post('owner','document-workflow/artifact',{publication_id:target.id,delivery_id:delivery.id,action:'download'});assert.deepEqual(Buffer.from(await obtained.arrayBuffer()),target.bytes);assert.equal(obtained.headers.get('x-document-sha256'),sha);
 state=await data('document-workflow/delivery-command',event('available',delivery,'Impressão de laboratório disponibilizada; sem entrega física real'));let current=state.items.find(x=>x.id===delivery.id);assert.equal(current.status,'available');
 state=await data('document-workflow/delivery-command',event('confirm',current,'Confirmação humana FICTÍCIA exclusivamente em laboratório'));current=state.items.find(x=>x.id===delivery.id);assert.equal(current.status,'confirmed');
 await data('document-workflow/delivery-command',event('revoke',current,'Revogação de teste bloqueia acessos finais futuros'));
 await post('owner','document-workflow/artifact',{publication_id:target.id,action:'download'},403);await post('closing','document-workflow/artifact',{publication_id:target.id,action:'download'},403);
 const preserved=await post('closing','document-workflow/artifact',{publication_id:other.id,action:'download'});assert.deepEqual(Buffer.from(await preserved.arrayBuffer()),other.bytes);
 console.log(JSON.stringify({proof:'etapa26-real-local',auth:true,rest:true,express:true,storage:true,edge_handler:true,pdf_bytes_identical:true,print_attempt_separate:true,manual_availability_requires_private_release:true,confirmation_explicit:true,revocation_denies_team_and_portal:true,other_publication_preserved:true,external_whatsapp_sent:false,physical_print:false,scanner:false}));
}catch(e){console.error('Etapa26 real local: '+e.message);process.exitCode=1;}finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
