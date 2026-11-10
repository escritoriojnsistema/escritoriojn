import {test,expect} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contrato local com sessão e HTTP fictícios.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
for(const status of [200,403,503])test(`imóveis preserva URL ao restaurar sessão com contexto pendente ${status}`,async({page})=>{
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 let release=()=>{};const held=new Promise<void>(resolve=>release=resolve);let requested=false,reads=0;
 await page.route('**/api/auth/context',async r=>{requested=true;await held;await r.fulfill(status===200?{json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Equipe fictícia',role_code:'owner',permissions:['foundation.access','customers.read','rural.read','requests.read']}]}}}:{status,json:{error:{code:'FIXTURE'}}});});
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/rural/state',r=>{reads++;return r.fulfill({json:{data:{items:[{id:office,name:'Imóvel privado de teste',municipality:'Cidade',state:'MG',version:1}],page:1,page_size:5}}});});
 // Signal the real component render, then allow its commit/effects to settle.
 // This avoids a fixed sleep racing the lazy module download.
 await page.route('**/src/features/rural/RuralPage.tsx*',async r=>{const response=await r.fetch(),body=await response.text();expect(body).toMatch(/function RuralPage\(\)\s*\{/);await r.fulfill({response,body:body.replace(/function RuralPage\(\)\s*\{/,'function RuralPage(){globalThis.__ruralRendered=true;')});});
 await page.goto('/imoveis-rurais');await expect.poll(()=>requested).toBe(true);
 await page.waitForFunction(()=>(globalThis as typeof globalThis&{__ruralRendered?:boolean}).__ruralRendered);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 try{
  expect(new URL(page.url()).pathname).toBe('/imoveis-rurais');expect(reads).toBe(0);await expect(page.getByText('Imóvel privado de teste')).toHaveCount(0);
 }finally{release();}
 if(status===200){await expect(page.getByRole('heading',{name:'Imóveis rurais',exact:true})).toBeVisible();await expect(page.getByText('Imóvel privado de teste')).toBeVisible();}
 else await expect(page.getByRole('heading',{name:status===403?'Acesso não autorizado':'Acesso indisponível',exact:true})).toBeVisible();
 expect(new URL(page.url()).pathname).toBe('/imoveis-rurais');
});
