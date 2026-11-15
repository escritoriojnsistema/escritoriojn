import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
let lab;const clients=[];let report={date:new Date().toISOString(),passed:false,hosted_fixtures:false};
try{
 lab=await createAuthLab({storage:false});await lab.migrate();assert.match(lab.url,/^http:\/\/127\.0\.0\.1:\d+$/);
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;};
 const admin=sdk(lab.serviceRoleKey),users=[],actors=[],password='Scope38-'+randomBytes(24).toString('hex')+'!';
 for(const name of ['owner','reader']){const r=await admin.auth.admin.createUser({email:`scope38-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users.push(r.data.user.id);}
 const office=(await lab.sql(`SELECT private.provision_owner('${users[0]}','Escopo FICTÍCIO38','${randomUUID()}');`,'migrator')).trim(),other=randomUUID();
 const member=(await lab.sql(`INSERT INTO public.offices(id,name)VALUES('${other}','Outro escritório FICTÍCIO38');INSERT INTO public.profiles(id,display_name)VALUES('${users[1]}','Leitor FICTÍCIO38');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users[1]}','admin')RETURNING id;`,'migrator')).trim();
 for(const name of ['owner','reader']){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`scope38-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);actors.push(c);}
 const call=async(name,args)=>{const r=await actors[0].rpc(name,{p_office_id:office,...args});assert.ifError(r.error);return r.data;};
 const base=['foundation.access','customers.read'];
 const rights=permissions=>call('team_set_member',{p_membership_id:member,p_role_code:'admin',p_active:true,p_permissions:permissions,p_request_id:randomUUID()});
 await rights(base);
 await lab.sql(`INSERT INTO public.customers(office_id,kind,name,created_by) SELECT '${office}','person','Pessoa FICTÍCIA38 '||n,'${users[0]}' FROM generate_series(1,5)n;
 INSERT INTO public.customers(office_id,kind,name,created_by,blocked_at)VALUES('${office}','person','Bloqueada FICTÍCIA38','${users[0]}',clock_timestamp());
 INSERT INTO public.customers(office_id,kind,name,created_by,merged_into_id)SELECT '${office}','person','Mesclada FICTÍCIA38','${users[0]}',id FROM public.customers WHERE office_id='${office}' AND blocked_at IS NULL LIMIT 1;
 INSERT INTO public.customers(office_id,kind,name,created_by)VALUES('${other}','person','Alheia FICTÍCIA38','${users[0]}');`,'migrator');
 const page=actor=>actors[actor].rpc('customers_page',{p_office_id:office,p_query:'',p_page:1,p_size:5});
 let r=await page(0);assert.ifError(r.error);assert.equal(r.data.total,5);assert.equal(r.data.items.length,5);const customer=r.data.items[0].id;
 r=await page(1);assert.ifError(r.error);assert.equal(r.data.total,0);
 const relation=await call('customer_relation_command',{p_customer_id:customer,p_action:'assignment.grant',p_payload:{membership_id:member,valid_from:'2020-01-01T00:00:00Z',valid_until:null},p_request_id:randomUUID()});
 r=await page(1);assert.ifError(r.error);assert.equal(r.data.total,1);assert.equal(r.data.items[0].id,customer);
 await call('customer_relation_command',{p_customer_id:customer,p_action:'assignment.revoke',p_payload:{id:relation.assignments[0].id,version:1},p_request_id:randomUUID()});
 r=await page(1);assert.ifError(r.error);assert.equal(r.data.total,0);
 await rights([...base,'customers.read_all']);r=await page(1);assert.ifError(r.error);assert.equal(r.data.total,5);await rights(base);r=await page(1);assert.ifError(r.error);assert.equal(r.data.total,0);
 const delegated=await call('team_set_delegation',{p_membership_id:member,p_allowed_roles:['employee'],p_allowed_permissions:[...base,'customers.read_all'],p_can_create_owner:false,p_expires_at:new Date(Date.now()+60000).toISOString(),p_request_id:randomUUID()});
 r=await page(1);assert.ifError(r.error);assert.equal(r.data.total,5);
 const original=(await lab.sql("SELECT pg_get_functiondef('private.customers_summary(public.customers)'::regprocedure);",'migrator')).trim();
 try{
  // Delay ONLY this disposable laboratory's renderer, so the real delegated
  // permission expires after capture but before return. No production hook.
  await lab.sql(`CREATE OR REPLACE FUNCTION private.customers_summary(p_customer public.customers)RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$BEGIN PERFORM pg_sleep(0.5);RETURN jsonb_build_object('id',p_customer.id,'name',p_customer.name,'kind',p_customer.kind,'identifier_masked',NULL,'created_at',p_customer.created_at);END$$;
  UPDATE private.team_delegations SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id='${delegated.id}';`,'migrator');
  const started=performance.now();r=await page(1);assert.ok(performance.now()-started>=2400,'Expiry must occur during materialization, not before entry.');
  assert.equal(r.error?.code,'PT403','An expired delegated read_all must not release the captured customer page.');assert.equal(r.data,null);
 }finally{await lab.sql(original,'migrator');}
 // Exercise the second UNION branch after optimization: an unmaterialized,
 // active client registration stays visible only with current read_all.
 const pending=await admin.auth.admin.createUser({email:'pending38@example.test',password,email_confirm:true});assert.ifError(pending.error);
 const pendingMember=(await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${pending.data.user.id}','Cadastro pendente FICTÍCIO38')ON CONFLICT DO NOTHING;INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${pending.data.user.id}','client')RETURNING id;`,'migrator')).trim();
 await lab.sql(`INSERT INTO private.customer_registrations(office_id,membership_id,name,email)VALUES('${office}','${pendingMember}','Somente cadastro pendente38','pending38@example.test');`,'migrator');
 const pendingArgs={p_office_id:office,p_query:'Somente cadastro pendente38',p_page:1,p_size:3};
 r=await actors[0].rpc('customers_page',pendingArgs);assert.ifError(r.error);assert.equal(r.data.total,1);assert.equal(r.data.items[0].source,'client_registration');assert.equal(r.data.items[0].association_status,'pending');assert.ok(!JSON.stringify(r.data).includes('pending38@example.test'));assert.ok(!('identifier' in r.data.items[0]));
 r=await actors[1].rpc('customers_page',pendingArgs);assert.ifError(r.error);assert.equal(r.data.total,0);
 report={...report,passed:true,merged_blocked_and_other_office_excluded:true,canonical_assignment_grant_and_revoke:true,direct_read_all_revocation_same_session:true,delegation_expires_during_materialization_denied:true,pending_registration_preserved_and_masked:true};console.log(JSON.stringify(report));
}catch(error){report={...report,passed:false,error:'CUSTOMERS38_FAILED'};console.error('Escopo38: '+error.message);process.exitCode=1;}
finally{try{await mkdir('docs/evidencias/etapa-38',{recursive:true});await writeFile('docs/evidencias/etapa-38/escopo-clientes.json',JSON.stringify(report,null,2)+'\n');}finally{for(const c of clients)await c.auth.dispose();await lab?.close();}}
