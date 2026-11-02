import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
// No hosted endpoint option. Real local GoTrue, JWT, PostgREST and PostgreSQL;
// no Storage operations: the Auth-only lab uses the Storage schema contract.
let lab;
try{
 lab=await createAuthLab({storage:false});await lab.migrate();
 const admin=createClient(lab.url,lab.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const password=`Local-${randomBytes(24).toString('hex')}!`,users={};
 for(const name of ['owner','client']){const r=await admin.auth.admin.createUser({email:`idle-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Laboratório de inatividade','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id) VALUES('${users.client}') ON CONFLICT DO NOTHING;INSERT INTO public.memberships(office_id,user_id,role_code) VALUES('${office}','${users.client}','client');`,'migrator');
 const clients={};for(const name of ['owner','client']){const c=createClient(lab.url,lab.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword({email:`idle-${name}@example.test`,password});assert.ifError(r.error);assert.ok(r.data.session);clients[name]=c;}
 const activity=async(c,human=false)=>{const r=await c.rpc('session_activity',{p_human:human});assert.ifError(r.error);return r.data;};
 const first=await activity(clients.owner);assert.equal(first.idle_minutes,30);assert.equal(first.user_id,users.owner);assert.ok(first.session_id);console.log('PASS: JWT real usa o UID e session_id emitidos pelo GoTrue');
 const second=await activity(clients.owner);assert.equal(second.expires_at,first.expires_at);console.log('PASS: consultas não renovam a atividade');
 await lab.sql(`UPDATE private.session_activities SET last_activity_at=clock_timestamp()-interval '30 seconds',expires_at=clock_timestamp()+interval '20 minutes' WHERE user_id='${users.owner}';`,'migrator');
 const renewed=await activity(clients.owner,true);assert.ok(Date.parse(renewed.expires_at)>Date.parse(second.expires_at)-1000);console.log('PASS: interação renova pelo relógio oficial');
 const changed=await clients.owner.rpc('access_policies_set',{p_office_id:office,p_audience:'client',p_idle_minutes:47,p_expected_revision:1,p_idempotency_key:randomUUID()});assert.ifError(changed.error);assert.equal(changed.data.policies.client.idle_minutes,47);assert.equal((await activity(clients.client)).idle_minutes,47);console.log('PASS: política personalizada persistida e aplicada ao cliente');
 await lab.sql(`UPDATE public.profiles SET display_name=NULL WHERE id='${users.owner}';`,'migrator');
 const report=await clients.owner.rpc('request_archives_report_begin',{p_office_id:office,p_scope:'mine',p_view:'recent',p_status:'',p_from:null,p_until:null,p_idempotency_key:randomUUID()});assert.ifError(report.error);assert.equal(report.data.actor_name,'Nome não informado');assert.equal(report.data.count,0);console.log('PASS: relatório vazio conserva autoria oficial mesmo sem nome de exibição');
 const denied=await clients.client.rpc('access_policies_state',{p_office_id:office});assert.equal(denied.error?.code,'PT403');console.log('PASS: cliente não administra acessos');
 await lab.sql(`UPDATE public.profiles SET active=false WHERE id='${users.client}';`,'migrator');
 const categories=await clients.client.rpc('service_categories_state',{p_office_id:office});assert.equal(categories.error?.code,'PT403');console.log('PASS: perfil inativo não lê categorias via JWT direto');
 await lab.sql(`UPDATE private.session_activities SET last_activity_at=clock_timestamp()-interval '40 minutes',expires_at=clock_timestamp()-interval '10 minutes' WHERE user_id='${users.owner}';`,'migrator');
 assert.ifError((await clients.owner.auth.getUser()).error);
 for(const human of [false,true])assert.equal((await clients.owner.rpc('session_activity',{p_human:human})).error?.code,'PT401');console.log('PASS: JWT válido no provedor não contorna inatividade e interação tardia não reativa');
 assert.equal((await clients.owner.rpc('access_policies_state',{p_office_id:office})).error?.code,'PT401');console.log('PASS: RPC de negócio bloqueada após expiração');
 const context=await clients.owner.rpc('my_access_context');assert.ok(context.error?.code==='PT401'||context.data?.length===0);console.log('PASS: contexto oficial não concede capacidades após expiração');
 await lab.sql(`UPDATE private.access_policies SET idle_minutes=180,revision=revision+1 WHERE office_id='${office}' AND audience='team';`,'migrator');
 assert.equal((await clients.owner.rpc('session_activity',{p_human:true})).error?.code,'PT401');console.log('PASS: aumentar prazo não revive sessão encerrada');
 const login=await clients.owner.auth.signInWithPassword({email:'idle-owner@example.test',password});assert.ifError(login.error);const fresh=await activity(clients.owner);assert.notEqual(fresh.session_id,first.session_id);assert.equal(fresh.idle_minutes,180);console.log('PASS: novo login cria sessão independente com prazo vigente');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await lab?.close();}
