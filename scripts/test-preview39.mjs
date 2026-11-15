import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from '@playwright/test';
import express from 'express';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stage=join(root,'docs/evidencias/etapa-39');
const screenshots=join(root,'test-results/release39/telas');
const temporary=await mkdtemp(join(tmpdir(),'jn-preview39-'));
const build=join(temporary,'dist');
const host='mcsuoxnubpqenyvbefee.supabase.co',key='sb_publishable_preview39_probe';
const checks=[],blockedExternal=[];
let server,browser;
try{
 // Build only. This probe key is deliberately fictional; no provider is contacted.
 await promisify(execFile)(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',build],{cwd:root,env:{...process.env,VERCEL_ENV:'preview',VITE_SUPABASE_URL:'https://'+host,VITE_SUPABASE_PUBLISHABLE_KEY:key},maxBuffer:2*1024*1024});
 async function scan(directory){for(const entry of await readdir(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())await scan(path);else if(/\.(js|html|map)$/.test(path)){const text=await readFile(path,'utf8');assert.ok(!text.includes(host),'preview bundle contém host de produção');assert.ok(!text.includes(key),'preview bundle contém chave herdada');}}}
 await scan(build);checks.push('build preview elimina URL e chave herdadas de produção');
 // Static build only: no fake private API success, no provider, no hosted writes.
 const site=express();site.use(express.static(build));site.use((_req,res)=>res.sendFile(join(build,'index.html')));
 server=site.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true});
 const context=await browser.newContext();
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){blockedExternal.push(new URL(route.request().url()).origin);return route.abort();}return route.continue();});
 const page=await context.newPage();
 for(const width of [320,1440]){
  await page.setViewportSize({width,height:width===320?740:900});
  for(const path of ['/login','/login-cliente','/cadastro','/recuperar-senha']){
   await page.goto(origin+path);
   await page.getByText('Acesso indisponível',{exact:true}).waitFor();
   assert.equal(await page.locator('button[type=submit]').isDisabled(),true,path);
   assert.equal(await page.locator('link[rel=preconnect]').count(),0,path+' preconnect');
   assert.equal(await page.locator('[role=progressbar],.spinner,.loader').count(),0,path+' loader');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path+' reflow');
   if(path==='/login'){await mkdir(screenshots,{recursive:true});await page.screenshot({path:join(screenshots,`preview-${width}.png`),fullPage:true});}
   checks.push(`${width}px ${path}: acesso desabilitado, sem preconnect/loader/overflow`);
  }
 }
 assert.deepEqual(blockedExternal,[],'nenhuma tentativa externa do navegador');
 console.log('PASS39: preview build + 8 navegações sem conexão externa.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 await browser?.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await rm(temporary,{recursive:true,force:true});await mkdir(stage,{recursive:true});
 await writeFile(join(stage,'preview-local.json'),JSON.stringify({date:new Date().toISOString(),passed:!process.exitCode,checks,external_requests:blockedExternal.length,environment:'build Vite real servido localmente; sem backend privado interceptado ou conexão hospedada',remote_preview_verified:false},null,2)+'\n');
}
