import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from '@playwright/test';
import {createAuthLab} from '../tests/auth/lab.mjs';
// Disposable local Auth/PostgREST/Postgres/Express only. Never accepts hosted URLs.
let lab,server,browser;const sdks=[],proof=[];
try{
 lab=await createAuthLab({storage:false,frontendOrigins:['http://127.0.0.1:3006']});await lab.migrate();assert.match(lab.url,/^http:\/\/127\.0\.0\.1:\d+$/);
 const sdk=key=>{const s=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});sdks.push(s);return s;};
 const admin=sdk(lab.serviceRoleKey),password='Local-isolation-'+randomBytes(24).toString('hex')+'!',users={};
 for(const name of ['owner','admin','employee','client','sponsor']){const r=await admin.auth.admin.createUser({email:`isolation-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Escritório A fictício','${randomUUID()}');`,'migrator')).trim();
 const other=randomUUID();
 await lab.sql(`INSERT INTO public.offices(id,name)VALUES('${other}','Escritório B fictício');`,'migrator');
 for(const name of ['owner','admin','employee','client']){
  await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users[name]}','Pessoa fictícia ${name}') ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name;${name==='owner'?'':`INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users[name]}','${name}');`}INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${other}','${users[name]}','${name==='client'?'employee':'client'}');`,'migrator');
 }
 const env={...process.env,VITE_SUPABASE_URL:lab.url,VITE_SUPABASE_PUBLISHABLE_KEY:lab.anonKey};
 server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','3006','--strictPort'],{env,stdio:'ignore'});
 for(let i=0;i<200;i++){try{if((await fetch('http://127.0.0.1:3006/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true});
 for(const role of ['owner','admin','employee','client'])for(const width of [360,1440]){
  const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),client=role==='client',home=client?'/area-cliente':'/painel';
  await page.goto('http://127.0.0.1:3006'+(client?'/login-cliente':'/login'));await page.getByLabel('E-mail',{exact:true}).fill(`isolation-${role}@example.test`);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:client?'Entrar na área do cliente':'Entrar na área da equipe',exact:true}).click();await expect(page).toHaveURL(new RegExp(home+'$'),{timeout:20000});await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  const first=await page.evaluate(async()=>{const {supabase}=await import('/src/features/auth/browser.ts');return(await supabase.auth.getSession()).data.session;});assert.ok(first);
  const scoped=await page.request.get('http://127.0.0.1:3006/api/auth/context?area='+(client?'client':'team'),{headers:{Authorization:'Bearer '+first.access_token}});assert.equal(scoped.status(),200);const rows=(await scoped.json()).data.contexts;assert.ok(rows.every(c=>client?c.role_code==='client':c.role_code!=='client'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.reload();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.evaluate(async()=>{const {supabase}=await import('/src/features/auth/browser.ts');const r=await supabase.auth.refreshSession();if(r.error)throw Error('Local refresh failed');});await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  let oppositeReads=0;page.on('request',r=>{if(r.url().includes('/api/account/read'))oppositeReads++;});await page.goto('http://127.0.0.1:3006'+(client?'/conta':'/minha-conta'));await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();assert.equal(oppositeReads,0);await expect(page.getByRole('link',{name:'Ir para minha área'})).toHaveAttribute('href',home);
  await page.getByRole('link',{name:'Ir para minha área'}).click();await expect(page.locator('.operation-area').first()).toHaveText(client?'Área do cliente':'Área da equipe');assert.ok(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()<=4);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // A fresh login of the same UID must be free to select its other legitimate portal.
  await page.goto('http://127.0.0.1:3006'+(client?'/login':'/login-cliente'));await page.getByLabel('E-mail',{exact:true}).fill(`isolation-${role}@example.test`);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:client?'Entrar na área da equipe':'Entrar na área do cliente',exact:true}).click();await expect(page).toHaveURL(new RegExp((client?'/painel':'/area-cliente')+'$'),{timeout:20000});await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  proof.push({role,width,real_login:true,scoped_api:true,reload:true,token_refresh:true,opposite_module_not_mounted:true,new_session_can_select_portal:true});console.log(`PASS local ${role} ${width}: real login, REST/Express, refresh/reload, portal boundary and new session.`);await context.close();
 }
 await writeFile('docs/evidencias/correcoes-pos33/auth-real-local.json',JSON.stringify({checked_utc:new Date().toISOString(),scope:'Disposable local GoTrue/PostgREST/Postgres/Express + Chromium; no hosted accounts, tokens or fixtures.',proof},null,2)+'\n');
}catch(e){console.error('Local portal isolation: '+e.message);process.exitCode=1;}finally{await browser?.close();if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));}for(const s of sdks)await s.auth.dispose();await lab?.close();}
