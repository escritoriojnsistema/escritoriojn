// Run with: node --import tsx scripts/benchmark-auth-context.mjs
// Disposable fictitious HTTP provider. This measures overlap, not a network SLA.
import {createServer} from 'node:http';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {app} from '../server/app.ts';
const uid='00000000-0000-4000-a000-000000000001',token='benchmark-fixture-token',delayMs=125,samples=7;
const row={user_id:uid,office_id:'00000000-0000-4000-b000-000000000001',role_code:'owner',permissions:['foundation.access'],office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'};
const provider=createServer((req,res)=>setTimeout(()=>{
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/auth/v1/user'?{id:uid,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}:[row]));
},delayMs));
await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${provider.address().port}`,key='sb_publishable_benchmark_fixture';
process.env.VITE_SUPABASE_URL=url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=key;
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
try{
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 const sequential=[],parallel=[];
 for(let i=0;i<samples+1;i++){
  let t=performance.now();const identity=await client.auth.getUser(token),context=await client.rpc('my_access_context');
  if(identity.error||context.error)throw Error('Fixture reference failed');if(i)sequential.push(performance.now()-t);
  t=performance.now();const r=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/context`,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok||(await r.json()).data.user.id!==uid)throw Error('Endpoint verification failed');if(i)parallel.push(performance.now()-t);
 }
 const stats=values=>{const v=values.toSorted((a,b)=>a-b);return {median_ms:+v[Math.floor(v.length/2)].toFixed(3),min_ms:+v[0].toFixed(3),max_ms:+v.at(-1).toFixed(3)};};
 const result={kind:'controlled-local-http-provider',independent_provider_delay_ms:delayMs,samples_per_case:samples,sequential_sdk_reference:stats(sequential),current_context_endpoint:stats(parallel),limits:'Fictitious local provider; demonstrates removal of serial wait. Does not measure hosted login or guarantee internet latency.'};
 await writeFile('docs/evidencias/ajuste-pos13/latencia-controlada.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
