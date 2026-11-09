import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {app} from '../server/app.ts';
// Disposable Auth/PostgREST/Express authority journey; no hosted override or message delivery.
let lab,server;const clients=[];
try{
 lab=await createAuthLab({storage:false,artifacts:false});await lab.migrate();process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;};
 const admin=sdk(lab.serviceRoleKey),users={},sessions={},password='Local-'+randomBytes(24).toString('hex')+'!';
 for(const name of ['owner','employee']){const r=await admin.auth.admin.createUser({email:`permissions-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Permissões laboratório','${randomUUID()}');`,'migrator')).trim();
 const member=(await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users.employee}','Funcionário local');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users.employee}','employee') RETURNING id;`,'migrator')).trim();
 for(const name of ['owner','employee']){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`permissions-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);sessions[name]=r.data.session.access_token;}
 server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api/`;
 const send=async(name,path,body,status=200,method='POST')=>{const r=await fetch(base+path,{method,headers:{Authorization:'Bearer '+sessions[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});assert.equal(r.status,status,`${path}: ${await r.clone().text()}`);return r;};
 const data=async(path,body,status=200)=>(await(await send('owner',path,body,status)).json()).data;
 const customer=await data('customers',{customer:{kind:'person',name:'Cliente local de permissões',identifier:'',contacts:[]}},201);
 const oldRights=['foundation.access','customers.read','customers.create','customers.read_all'];
 const grant=(permissions,role_code='employee')=>send('owner','team/members/'+member,{role_code,active:true,permissions,permissions_source:'direct-v1'},200,'PATCH');
 await grant(oldRights,'admin');await send('employee','rural/state',{property_id:null,page:1},403);
 await grant([...oldRights,'rural.read','rural.read_all','rural.create']);
 const create={kind:'create',customer_id:customer.id,name:'Imóvel autorizado',municipality:'Cidade local',state:'MG',location:'',identifiers:{}};
 const r=await send('employee','rural/command',{property_id:null,command:create,key:randomUUID()});const property=(await r.json()).data;
 await send('employee','rural/state',{property_id:property.id,page:1});
 await send('employee','team/members/'+member,{role_code:'owner',active:true,permissions:oldRights,permissions_source:'direct-v1'},403,'PATCH');
 await grant(oldRights);await send('employee','rural/state',{property_id:property.id,page:1},403);
 await send('employee','customers/search',{query:'',page:1,size:5});await send('owner','rural/state',{property_id:property.id,page:1});

 await grant(oldRights,'admin');
 const delegated=await (await send('owner','team/delegations/'+member,{allowed_roles:['employee'],allowed_permissions:['foundation.access','customers.read','rural.read'],can_create_owner:false,expires_at:new Date(Date.now()+86400000).toISOString()},200,'PUT')).json();
 await send('employee','rural/state',{property_id:property.id,page:1});
 const dashboard=await fetch(base+'team?office_id='+office+'&kind=members&page=1&query=&status=all',{headers:{Authorization:'Bearer '+sessions.owner}});assert.equal(dashboard.status,200);const row=(await dashboard.json()).data.items.find(m=>m.id===member);assert.ok(row.permissions.includes('rural.read'));assert.ok(!row.direct_permissions.includes('rural.read'));
 await send('owner','team/members/'+member,{role_code:'admin',active:true,permissions:row.direct_permissions},409,'PATCH');
 await grant(row.direct_permissions,'admin');
 await send('owner','team/delegations/'+delegated.data.id+'/revoke',{});
 await send('employee','rural/state',{property_id:property.id,page:1},403);
 console.log(JSON.stringify({proof:'permissions-real-local',auth:true,rest:true,express:true,grant_via_team_api:true,admin_without_cap_denied:true,employee_authorized:true,self_escalation_denied:true,revocation_same_session:true,legacy_customer_access_preserved:true,owner_preserved:true,storage_unchanged:true,temporary_rights_not_materialized:true,legacy_form_rejected:true}));
}catch(e){console.error('Permissões real local: '+e.message);process.exitCode=1;}finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await lab?.close();}
