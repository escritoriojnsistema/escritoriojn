// Real, disposable GoTrue/PostgREST/PostgreSQL; never accepts a hosted URL.
// node --import tsx scripts/measure-entry-pos28.mjs --baseline-root /tmp/jn-pos28-baseline-source
// Prepare that root with git archive 9772f32 and a node_modules symlink.
// Default measures edited source; --baseline-root runs an uninterrupted pair.
// --compare captures current source, waits for /tmp/jn-pos28-after-ready, then
// rebuilds edited source against the SAME provider and repeats identical cases.
import {createAuthLab} from '../tests/auth/lab.mjs';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,writeFile,access,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import express from 'express';
import {app} from '../server/app.ts';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3090',out='docs/evidencias/correcoes-pos28',marker='/tmp/jn-pos28-after-ready';
const samples=3,roles=['owner','admin','employee','client'];
const baselineRoot=process.argv.includes('--baseline-root')?process.argv[process.argv.indexOf('--baseline-root')+1]:undefined;
let lab,browser,server,dist;
const result={baselineCommit:baselineRoot?'9772f32':undefined,kind:'local-real-provider-production-build',conditions:{samples,viewport:'1440x900',network:{latency_ms:60,download_bits_per_second:10000000,upload_bits_per_second:10000000},cpuSlowdown:4,cacheDisabled:true,transport:'Express static uncompressed; not hosted Vercel compression/RTT',roles,auth:'real local GoTrue; actual SDK password + live RPC + official adoption; Storage omitted'},runs:{}};
const run=(args,env)=>new Promise((resolve,reject)=>{const c=spawn('node',args,{env,stdio:['ignore','pipe','pipe']});let output='';c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>output+=b);c.once('error',reject);c.once('exit',code=>code?reject(Error('Production build failed: '+output.slice(-3000))):resolve());});
const context=async(storageState)=>{const c=await browser.newContext({viewport:{width:1440,height:900},storageState});const p=await c.newPage(),cdp=await c.newCDPSession(p);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:60,downloadThroughput:10000000/8,uploadThroughput:10000000/8});await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});return {c,p};};
const paint=page=>page.evaluate(()=>({fcp_ms:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,resource_bytes:performance.getEntriesByType('resource').reduce((a,r)=>a+r.transferSize,0),js_bytes:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).reduce((a,r)=>a+r.transferSize,0),js_resources:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).map(r=>({name:new URL(r.name).pathname,bytes:r.transferSize}))}));
const panel=page=>page.getByRole('heading',{name:'Área de operação',exact:true});
async function measure(label){
 dist=`/tmp/jn-pos28-${label}-dist`;
 await run(['node_modules/vite/bin/vite.js','build',...(label==='before'&&baselineRoot?[baselineRoot]:[]),'--outDir',dist],{...process.env,VITE_SUPABASE_URL:lab.url,VITE_SUPABASE_PUBLISHABLE_KEY:lab.anonKey});
 const data={public:[],profiles:{}};console.log('MEASURING',label);
 for(let i=0;i<samples;i++){
  const {c,p}=await context();await p.goto(origin,{waitUntil:'networkidle'});await p.getByRole('heading',{name:'Bem-vindo ao Escritório JN'}).waitFor();data.public.push(await paint(p));if(i===0)await p.screenshot({path:`${out}/${label}-public.png`,fullPage:true});await c.close();
 }
 for(const role of roles){
  const entries=[];
  for(let i=0;i<samples;i++){
   const {c,p}=await context();const phases=[];p.on('requestfinished',req=>{const u=new URL(req.url());if(u.origin===lab.url||u.pathname==='/api/auth/context'){const t=req.timing();phases.push({path:u.pathname,method:req.method(),duration_ms:t.responseEnd-t.requestStart});}});
   const start=performance.now();await p.goto(origin+(role==='client'?'/login-cliente':'/login'),{waitUntil:'networkidle'});await p.getByLabel('E-mail',{exact:true}).fill(`perf-${role}@example.test`);await p.getByLabel('Senha',{exact:true}).fill(password);
   const loginPage=await paint(p),form_ready_ms=performance.now()-start;
   const submit=performance.now();await p.getByRole('button',{name:role==='client'?'Entrar na área do cliente':'Entrar na área da equipe',exact:true}).click();await panel(p).waitFor();const login_to_panel_ms=performance.now()-submit;
   await p.waitForLoadState('networkidle');if(i===0)await p.screenshot({path:`${out}/${label}-${role}-panel.png`,fullPage:true});
   const login_phases=[...phases];phases.length=0;
   const refresh=performance.now();await p.reload({waitUntil:'domcontentloaded'});await panel(p).waitFor();const refresh_ms=performance.now()-refresh;await p.waitForLoadState('networkidle');const refreshPaint=await paint(p),refresh_phases=[...phases];
   const state=await c.storageState();await c.close();
   const restored=await context(state),reopen=performance.now();await restored.p.goto(origin,{waitUntil:'domcontentloaded'});await panel(restored.p).waitFor();const reopen_ms=performance.now()-reopen;await restored.p.waitForLoadState('networkidle');const reopenPaint=await paint(restored.p);
   if(i===0)await restored.p.screenshot({path:`${out}/${label}-${role}-reopen.png`,fullPage:true});
   // A cold reopened session must still obtain live authority from the API.
   const names=await restored.p.evaluate(()=>performance.getEntriesByType('resource').map(r=>new URL(r.name).pathname));assert(names.includes('/api/auth/context'));
   entries.push({form_ready_ms,loginPage,login_to_panel_ms,login_phases,refresh_ms,refreshPaint,refresh_phases,reopen_ms,reopenPaint});await restored.c.close();
  }
  data.profiles[role]=entries;console.log(label,role,entries.map(e=>({login:Math.round(e.login_to_panel_ms),refresh:Math.round(e.refresh_ms),reopen:Math.round(e.reopen_ms)})));
 }
 result.runs[label]=data;await writeFile(`${out}/performance.json`,JSON.stringify(result,null,2)+'\n');console.log('CAPTURED',label);
}
const password=`Local-${randomBytes(24).toString('hex')}!`;
try{
 await mkdir(out,{recursive:true});await rm(marker,{force:true});lab=await createAuthLab({storage:false,frontendOrigins:[origin]});await lab.migrate();
 process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const admin=createClient(lab.url,lab.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}}),users={};
 for(const role of roles){const r=await admin.auth.admin.createUser({email:`perf-${role}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[role]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Performance local fictícia','${randomUUID()}');`,'migrator')).trim();
 for(const role of roles.slice(1))await lab.sql(`INSERT INTO public.profiles(id,display_name) VALUES('${users[role]}','Perfil fictício ${role}');INSERT INTO public.memberships(office_id,user_id,role_code) VALUES('${office}','${users[role]}','${role}');`,'migrator');
 const host=express();host.use(app);host.use((req,res,next)=>express.static(dist)(req,res,next));host.use((req,res)=>res.sendFile(`${dist}/index.html`));server=host.listen(3090,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 await measure(process.argv.includes('--compare')||baselineRoot?'before':'after');
 if(baselineRoot){
  await measure('after');
  for(const role of roles){
   const before=result.runs.before.profiles[role],after=result.runs.after.profiles[role];
   assert(after.every(e=>e.loginPage.js_bytes<before[0].loginPage.js_bytes*.65),'Initial operation code must omit unrelated features');
   for(const entry of after){
    for(const [path,method]of [['/auth/v1/token','POST'],['/rest/v1/rpc/my_access_context','POST'],['/auth/v1/user','GET']])assert.equal(entry.login_phases.filter(p=>p.path===path&&p.method===method).length,1);
    assert.equal(entry.login_phases.filter(p=>p.path==='/api/auth/context').length,0);
   }
  }
  result.assertions='PASS: four roles each retain one password/RPC/adoption, no duplicate API context on login; live context required on cold restored sessions; initial JS <65% of baseline';
  await writeFile(`${out}/performance.json`,JSON.stringify(result,null,2)+'\n');
 }
 else if(process.argv.includes('--compare')){console.log('WAITING_AFTER_MARKER');for(;;){try{await access(marker);break;}catch{await delay(1000);}}await measure('after');}
}catch(error){console.error('Local performance proof failed:',String(error.message).replaceAll(password,'[redacted]'));process.exitCode=1;}finally{await browser?.close();server?.closeAllConnections();server?.close();await lab?.close();}
