import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {app} from '../server/app.ts';

// No remote URL/database option: users and grants exist only in this disposable lab.
let lab,server;const clients=[];
let report={date:new Date().toISOString(),passed:false,hosted_load:false,hosted_fixtures:false};
try{
 lab=await createAuthLab({storage:false,artifacts:false});await lab.migrate();
 assert.match(lab.url,/^http:\/\/127\.0\.0\.1:\d+$/);
 process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;};
 const admin=sdk(lab.serviceRoleKey),password='Local38-'+randomBytes(24).toString('hex')+'!',users=[],tokens=[];
 for(let i=0;i<10;i++){
  const r=await admin.auth.admin.createUser({email:`load38-${i}@example.test`,password,email_confirm:true});assert.ifError(r.error);users.push(r.data.user.id);
 }
 const office=(await lab.sql(`SELECT private.provision_owner('${users[0]}','Carga FICTÍCIA38','${randomUUID()}');`,'migrator')).trim();
 for(const user of users.slice(1))await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${user}','Responsável FICTÍCIO38');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${user}','owner');`,'migrator');
 for(let i=0;i<10;i++){
  const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`load38-${i}@example.test`,password});assert.ifError(r.error);tokens.push(r.data.session.access_token);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);
 }
 assert.equal(new Set(tokens).size,10);assert.equal(new Set(users).size,10);
 await lab.sql(`INSERT INTO public.customers(office_id,kind,name,created_by) SELECT '${office}','person','Cadastro SINTÉTICO38 '||lpad(n::text,5,'0'),'${users[0]}' FROM generate_series(1,10000)n;ANALYZE public.customers;`,'migrator');
 server=createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const endpoint=`http://127.0.0.1:${server.address().port}/api/customers/search`,samples=[];
 async function search(token,query,page=1){
  const start=performance.now();const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({office_id:office,query,page,size:5}),signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('x-request-id'),/^[0-9a-f-]{36}$/);
  const result=(await response.json()).data;assert.equal(result.page,page);assert.equal(result.items.length,5);assert.ok(result.items.every(x=>!('identifier' in x)&&!('contacts' in x)));
  return {ms:performance.now()-start,total:result.total};
 }
 // Cold wave is retained separately rather than discarded as a successful warm-up.
 const cold=await Promise.all(tokens.map(t=>search(t,'',1)));assert.ok(cold.every(x=>x.total===10000));
 for(let wave=0;wave<5;wave++){
  const result=await Promise.all(tokens.map((t,i)=>search(t,wave%2?'SINTÉTICO38 0':'',i+1)));
  assert.ok(result.every(x=>x.total===(wave%2?9999:10000)));samples.push(...result.map(x=>x.ms));
 }
 const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
 report={...report,environment:'Disposable local GoTrue/PostgREST/Express/PostgreSQL17',distinct_users:10,distinct_sessions:10,concurrent_requests:10,synthetic_customers:10000,cold_samples:10,cold_p95_ms:+percentile(cold.map(x=>x.ms),.95).toFixed(2),samples:samples.length,p50_ms:+percentile(samples,.5).toFixed(2),p95_ms:+percentile(samples,.95).toFixed(2),max_ms:+Math.max(...samples).toFixed(2),target_p95_ms:2000,passed:percentile(samples,.95)<=2000&&percentile(cold.map(x=>x.ms),.95)<=2000,limits:'Local search/list only; ten authorized owner sessions in the same synthetic office. No hosted SLA, mobile network, write/PDF throughput or zero physical latency claim.'};
 console.log(JSON.stringify(report));
 assert.ok(report.passed,'RNF-04 proposed local p95 target was exceeded; preserve the failed measurement.');
}catch(error){report={...report,passed:false,error:'LOAD38_FAILED'};console.error('Carga38: '+error.message);process.exitCode=1;}
finally{
 try{await mkdir('docs/evidencias/etapa-38',{recursive:true});await writeFile('docs/evidencias/etapa-38/carga-local.json',JSON.stringify(report,null,2)+'\n');}
 finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
}
