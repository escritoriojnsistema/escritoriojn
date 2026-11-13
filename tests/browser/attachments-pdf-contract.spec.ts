import {test,expect,type Page} from '@playwright/test';
import PDFDocument from 'pdfkit';
import {createHash} from 'node:crypto';
test.skip(!process.env.TEAM_UI_CONTRACT,'Somente PDF fictício e SDK interceptado no laboratório local.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',rid='44444444-4444-4444-8444-444444444444',at='2026-11-13T12:00:00Z';
async function pdfFixture(pages=2){
 const doc=new PDFDocument({size:'A4',compress:false}),chunks:Buffer[]=[];
 const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.fontSize(24).text('PDF ficticio - primeira pagina',60,60);doc.rect(60,120,150,60).fill('#163950');
 doc.link(60,60,300,40,'https://pdf-untrusted.example.test/external');
 doc.addNamedJavaScript('never-run','globalThis.pdfExecuted = true; fetch("https://pdf-untrusted.example.test/script");');
 for(let page=2;page<=pages;page++){doc.addPage().fontSize(24).text(page===2?'PDF ficticio - segunda pagina':`Pagina ficticia ${page}`,60,60);doc.rect(60,120,150,60).fill('#bc5d20');}doc.end();return complete;
}
async function setup(page:Page,bytes:Buffer){
 await page.routeWebSocket('**',()=>{});
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,session_id:office,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:'owner',permissions:['foundation.access','files.read','requests.read'],office_name:'Laboratório local',display_name:'Pessoa fictícia'}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/auth/activity',r=>r.fulfill({json:{data:{active:true}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 const file={id,intent_id:null,request_id:rid,request_item_id:null,name:'pdf-ficticio.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'documento',status:'quarentena',scanner_status:'not_configured',validation_reason:null,created_at:at,updated_at:at,can_validate:false,can_download:false,can_copy:false,can_preview:true,can_delete:false};
 await page.route('**/api/attachments/search',r=>r.fulfill({json:{data:{items:[file],total:1,page:1,page_size:5,portal:false}}}));
 await page.route('**/api/attachments/*/preview',r=>r.fulfill({json:{data:{bucket:'request-attachments',object_path:`${office}/${id}/${id}`,name:file.name,mime_type:file.mime_type,size_bytes:file.size_bytes,sha256:file.sha256}}}));
 await page.route('https://team-ui.supabase.co/storage/v1/**',r=>r.fulfill({contentType:'application/pdf',body:bytes}));
}
async function canvasPixels(page:Page){return page.locator('.private-pdf-canvas-view canvas').evaluate((canvas:HTMLCanvasElement)=>{const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let painted=0;for(let i=0;i<data.length;i+=4)if(data[i]<200||data[i+1]<200||data[i+2]<200)painted++;return {painted,pixels:canvas.width*canvas.height};});}
for(const width of [320,1440])test(`PDF privado rasteriza, pagina e alterna texto dos mesmos bytes em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});const bytes=await pdfFixture();await setup(page,bytes);
 const requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/anexos');expect(requests.some(url=>/pdf\.worker|pdfCanvas/.test(url))).toBe(false);
 await page.getByRole('button',{name:'Visualizar pdf-ficticio.pdf'}).click();
 const nav=page.getByRole('navigation',{name:'Páginas do PDF'}),canvas=page.getByRole('img',{name:'pdf-ficticio.pdf — página 1'});
 await expect(canvas).toBeVisible();await expect(nav).toContainText('Página 1 de 2');
 const first=await canvasPixels(page);expect(first.painted).toBeGreaterThan(500);expect(first.pixels).toBeLessThanOrEqual(8_000_000);
 await expect(nav.getByRole('button',{name:'Anterior'})).toBeDisabled();await nav.getByRole('button',{name:'Próxima'}).click();
 await expect(page.getByRole('img',{name:'pdf-ficticio.pdf — página 2'})).toBeVisible();await expect(nav).toContainText('Página 2 de 2');await expect(nav.getByRole('button',{name:'Próxima'})).toBeDisabled();expect((await canvasPixels(page)).painted).toBeGreaterThan(500);
 await nav.getByRole('button',{name:'Anterior'}).click();await expect(canvas).toBeVisible();
 for(const button of await nav.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await page.getByRole('combobox',{name:'Exibição',exact:true}).selectOption('text');await expect(page.locator('.private-pdf-canvas-view')).toHaveCount(0);
 const text=page.getByLabel('Texto extraído do PDF');await expect(text).toContainText('primeira pagina');await expect(text).toContainText('segunda pagina');
 await page.getByRole('combobox',{name:'Exibição',exact:true}).selectOption('pdf');await expect(text).toHaveCount(0);await expect(canvas).toBeVisible();
 await expect(page.locator('.attachment-preview iframe,.attachment-preview a[href^="https://pdf-untrusted"]')).toHaveCount(0);
 expect(await page.evaluate(()=>Boolean((globalThis as typeof globalThis&{pdfExecuted?:boolean}).pdfExecuted))).toBe(false);
 expect(requests.filter(url=>url.includes('pdf-untrusted.example.test'))).toEqual([]);expect(requests.some(url=>/pdf\.worker/.test(url))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'Voltar aos anexos',exact:true}).click();await expect(page.locator('.private-pdf-preview')).toHaveCount(0);
});

test('PDF acima de120 páginas é recusado sem montar iframe ou canvas visível',async({page})=>{
 await setup(page,await pdfFixture(121));await page.goto('/anexos');await page.getByRole('button',{name:'Visualizar pdf-ficticio.pdf'}).click();
 await expect(page.getByRole('status').filter({hasText:'120 páginas'})).toBeVisible();await expect(page.locator('.private-pdf-canvas-view canvas')).toBeHidden();await expect(page.locator('.attachment-preview iframe')).toHaveCount(0);
});
test('fechar antes do worker terminar cancela a tentativa e permite nova visualização',async({page})=>{
 await setup(page,await pdfFixture());const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/*pdf.worker*',async route=>{await gate;await route.continue();});
 await page.goto('/anexos');await page.getByRole('button',{name:'Visualizar pdf-ficticio.pdf'}).click();
 await expect(page.getByRole('combobox',{name:'Exibição',exact:true})).toBeVisible();await page.getByRole('button',{name:'Voltar aos anexos',exact:true}).click();release();
 await expect(page.locator('.private-pdf-preview')).toHaveCount(0);await page.getByRole('button',{name:'Visualizar pdf-ficticio.pdf'}).click();await expect(page.getByRole('img',{name:'pdf-ficticio.pdf — página 1'})).toBeVisible();expect(errors).toEqual([]);
});
