import {test,expect,type Page} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
async function controlled(page:Page){
 await page.goto('/instalar');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
for(const width of [320,390,1440])test(`35: instruções, foco e layout público ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/instalar');
 await expect(page.getByRole('heading',{name:'Instalar aplicativo',exact:true})).toBeVisible();
 await page.getByLabel('Dispositivo', {exact:true}).selectOption('android');await expect(page.getByRole('heading',{name:'Android · Chrome',exact:true})).toBeVisible();
 await page.getByLabel('Dispositivo', {exact:true}).selectOption('ios');await expect(page.getByRole('heading',{name:'iPhone · Safari',exact:true})).toBeVisible();
 await expect(page.locator('main')).toContainText('feche todas as abas');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await expect(page.locator('[role=progressbar],.spinner,.loader')).toHaveCount(0);
 await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Pular para o conteúdo'})).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
 await page.screenshot({path:`/workspace/scratch/pwa35-${width}.png`,fullPage:true});
 await page.addStyleTag({content:'html{zoom:2}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test('35: prompt de instalação só executa por ação explícita e tem fallback',async({page})=>{
 await page.goto('/instalar');await expect(page.locator('h1')).toBeVisible();
 await page.evaluate(()=>{const event=new Event('beforeinstallprompt',{cancelable:true});Object.assign(event,{prompt:()=>{(window as any).promptCalls=((window as any).promptCalls||0)+1;return Promise.reject(new Error('unsupported'));},userChoice:Promise.resolve({outcome:'dismissed'})});window.dispatchEvent(event);});
 expect(await page.evaluate(()=>(window as any).promptCalls||0)).toBe(0);
 await page.getByRole('button',{name:'Instalar neste dispositivo',exact:true}).click();await expect(page.getByRole('alert')).toContainText('menu do navegador');expect(await page.evaluate(()=>(window as any).promptCalls)).toBe(1);
});
test('35: manifesto, worker e reabertura offline usam somente arquivos públicos',async({page,context,request})=>{
 test.skip(!process.env.PWA35_BUILD_TEST,'Service worker é registrado só em build de produção.');
 await controlled(page);
 const manifest=await request.get('/manifest.webmanifest');expect(manifest.headers()['content-type']).toContain('manifest');expect((await manifest.json()).start_url).toBe('/');
 const shell=await request.get('/offline.html');expect(shell.headers()['cache-control']).not.toContain('no-store');
 const worker=await request.get('/sw.js');expect(await worker.text()).not.toContain('__BUILD_VERSION__');expect(worker.headers()['content-type']).toMatch(/javascript/);
 await page.goto('/login-cliente');await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
 await page.evaluate(async()=>{await fetch('/api/health');await fetch('/api/account/read',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});});
 const cached=await page.evaluate(async()=>Promise.all((await caches.keys()).map(async name=>({name,urls:(await (await caches.open(name)).keys()).map(r=>new URL(r.url).pathname)}))));
 expect(cached).toHaveLength(1);expect(cached[0].name).toMatch(/^jn-public-35-[a-f0-9]{20}$/);expect(cached[0].urls.sort()).toEqual(['/offline.html','/icons/app-192.png','/icons/app-512.png','/icons/apple-touch-icon.png'].sort());
 await context.setOffline(true);await page.goto('/clientes');await expect(page.getByRole('heading',{name:'Você está sem conexão'})).toBeVisible();await expect(page.getByRole('button')).toHaveCount(0);await expect(page.locator('body')).not.toContainText('fixture@example.test');
 await page.reload();await expect(page.getByRole('heading',{name:'Você está sem conexão'})).toBeVisible();
 await context.setOffline(false);await page.getByRole('link',{name:'Voltar ao início'}).click();await expect(page.getByRole('heading',{level:1})).toBeVisible();await expect(page.getByRole('heading',{name:'Você está sem conexão'})).toHaveCount(0);
});
test('35: navegador reconhece manifesto instalável e ícone em viewport Android',async({page,context,browserName})=>{
 test.skip(!process.env.PWA35_BUILD_TEST||browserName!=='chromium','Inspeção Chromium do build; não comprova instalação física.');
 await page.setViewportSize({width:390,height:844});await controlled(page);
 const cdp=await context.newCDPSession(page);const result=await cdp.send('Page.getAppManifest');expect(result.errors).toEqual([]);expect(result.data).toContain('standalone');
 const installability=await cdp.send('Page.getInstallabilityErrors');expect(installability.installabilityErrors).toEqual([]);
});
test('35: atualização aguarda todas as abas sem perder comando ou File em memória',async({browser})=>{
 test.skip(!process.env.PWA35_BUILD_TEST,'Usa build real em origem local isolada.');
 let nextVersion=false;
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url!,'http://localhost').pathname;
   const file=path==='/sw.js'?'sw.js':path==='/manifest.webmanifest'?'manifest.webmanifest':path.startsWith('/assets/')||path.startsWith('/icons/')||path==='/offline.html'?path.slice(1):'index.html';
   const full=resolve('dist',file);if(!full.startsWith(resolve('dist')+'/')){res.writeHead(404).end();return;}
   let data=await readFile(full);
   if(path==='/sw.js'&&nextVersion)data=Buffer.from(data.toString().replace(/jn-public-35-([a-f0-9]+)/,'jn-public-35-$1-next'));
   const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html';
   const publicFile=path==='/offline.html'||path.startsWith('/icons/');
   res.writeHead(200,{'Content-Type':type,'Cache-Control':publicFile?'public, max-age=0, must-revalidate':'no-store'}).end(data);
  }catch{res.writeHead(404).end();}
 });
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const context=await browser.newContext();
 try{
  const first=await context.newPage();await first.goto(origin+'/instalar');await first.evaluate(()=>navigator.serviceWorker.ready);await first.reload();
  const second=await context.newPage();await second.goto(origin+'/instalar');await second.getByRole('heading',{name:'Instalar aplicativo',exact:true}).waitFor();
  await first.evaluate(()=>{(window as any).pendingCommand={key:'exact-retry-key',file:new File(['pending-private-bytes'],'test.txt')};});
  nextVersion=true;await first.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration())!.update();});
  await expect.poll(()=>first.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  expect(await first.evaluate(()=>(window as any).pendingCommand.key)).toBe('exact-retry-key');expect(await first.evaluate(()=>(window as any).pendingCommand.file.text())).toBe('pending-private-bytes');
  await second.close();expect(await first.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting)).toBe(true);
  await first.close();const reopened=await context.newPage();await reopened.goto(origin+'/instalar');await reopened.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>reopened.evaluate(()=>caches.keys())).toEqual([expect.stringMatching(/-next$/)]);
 }finally{await context.close();await new Promise<void>(r=>server.close(()=>r()));}
});
