import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Fictitious presentation contract, not proof of hosted Auth.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',target='33333333-3333-4333-8333-333333333333';
const capabilities=['foundation.access','users.manage','audit.read','audit.export','archives.manage'];
async function setup(page:Page,permissions=capabilities,role='owner'){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions,office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'}]}}}));
 await page.route('**/api/governance/**',route=>{
  const url=new URL(route.request().url());const size=Number(url.searchParams.get('size')||5),pageNo=Number(url.searchParams.get('page')||1);
  expect(route.request().headers().authorization).toMatch(/^Bearer /);
  if(url.pathname.endsWith('/export'))return route.fulfill({json:{data:{items:[],count:0,office_id:office,exported_at:'2026-10-18T10:00:00Z',request_id:target}}});
  if(url.pathname.endsWith('/restore'))return route.fulfill({json:{data:{ok:true}}});
  const archive=url.pathname.endsWith('/archives');
  const items=Array.from({length:pageNo===1?size:1},(_,i)=>archive?{id:`44444444-4444-4444-8444-44444444444${i}`,target_id:target,target_label:`Pessoa Arquivada ${i+1}`,target_type:'membership',archived_at:'2026-10-18T10:00:00Z',restored_at:url.searchParams.get('status')==='restored'?'2026-10-18T11:00:00Z':null}:{id:`44444444-4444-4444-8444-44444444444${i}`,actor_id:user,actor_name:'Responsável Fictício',action:'team.member_updated',target_type:'membership',target_id:target,outcome:'success',occurred_at:'2026-10-18T10:00:00Z',request_id:target,changes:{active:false,role_code:'employee'}});
  return route.fulfill({json:{data:{items,total:6,page:pageNo,page_size:size}}});
 });
}
test('consulta lenta de auditoria continua após rotação do token da mesma sessão',async({page})=>{
 await setup(page);await page.goto('/auditoria');
 await expect(page.getByRole('list',{name:'Eventos de auditoria'})).toBeVisible();
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/governance/audit?**',async route=>{await pending;await route.fallback();});
 await Promise.all([page.waitForRequest('**/api/governance/audit?**'),page.getByRole('button',{name:'Próxima',exact:true}).click()]);
 try{
  // Fictitious provider transport: exercise the official SDK event/storage path.
  // Only token bytes rotate; the provider session and user remain the same.
  expect(await page.evaluate(async()=>{
   const modulePath='/src/features/auth/browser.ts';const {supabase}=await import(modulePath);
   const {data}=await supabase.auth.getSession();const parts=data.session.access_token.split('.');
   const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
   parts[1]=btoa(JSON.stringify({...claims,jti:'rotation-fixture'})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   const {error}=await supabase.auth.setSession({access_token:parts.join('.'),refresh_token:'rotated-fixture'});return !error;
  })).toBe(true);
  await expect(page.getByRole('complementary',{name:'Navegação principal'})).toBeVisible();
 }finally{release();}
 await expect(page.getByText(/Página 2/)).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const change of ['logout','nova sessão'])test(`resposta antiga de auditoria é recusada após ${change}`,async({page})=>{
 await setup(page);await page.goto('/auditoria');
 await expect(page.getByRole('list',{name:'Eventos de auditoria'})).toBeVisible();
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/governance/audit?**',async route=>{await pending;await route.fallback();});
 const requested=page.waitForRequest('**/api/governance/audit?**');
 const result=page.evaluate(async office=>{
  const modulePath='/src/features/governance/api.ts';const {governanceApi}=await import(modulePath);
  try{await governanceApi.audit(office,1,5,{});return 200;}catch(error){return (error as {status:number}).status;}
 },office);
 await requested;
 try{
  expect(await page.evaluate(async change=>{
   const modulePath='/src/features/auth/browser.ts';const {supabase}=await import(modulePath);
   if(change==='logout')return !(await supabase.auth.signOut({scope:'local'})).error;
   const {data}=await supabase.auth.getSession();const parts=data.session.access_token.split('.');
   const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
   parts[1]=btoa(JSON.stringify({...claims,session_id:'99999999-9999-4999-8999-999999999999'})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
   return !(await supabase.auth.setSession({access_token:parts.join('.'),refresh_token:'new-session-fixture'})).error;
  },change)).toBe(true);
 }finally{release();}
 expect(await result).toBe(401);
});
for(const [width,height] of [[320,568],[360,640],[768,1024],[1440,900]])test(`auditoria e arquivados compactos, ícones e foco em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page);await page.goto('/auditoria');
 await expect(page.getByRole('heading',{name:'Auditoria',exact:true})).toBeVisible();
 await expect(page.getByRole('list',{name:'Eventos de auditoria'}).locator('li')).toHaveCount(width<=900?3:5);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===360||width===1440)expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 if(width<=900){await page.getByRole('button',{name:'Abrir menu'}).click();const dialog=page.getByRole('dialog',{name:'Menu de navegação'});await dialog.getByRole('link',{name:'Arquivados',exact:true}).click();}else await page.getByRole('navigation',{name:'Navegação da operação'}).getByRole('link',{name:'Arquivados',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Arquivados',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const controls=await page.locator('.operation-icon-button:visible, .governance-main button:visible').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;}));expect(controls).toBe(true);
 if(process.env.TEAM_UI_CAPTURE&&[360,1440].includes(width))await page.screenshot({path:`/workspace/shared/etapa-06-arquivados-${width}.png`,fullPage:true});
});
test('auditoria filtra, pagina, mostra referência e exporta com capacidade',async({page})=>{
 await page.setViewportSize({width:360,height:640});await setup(page);await page.goto('/auditoria');
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.getByText(/Página 2/)).toBeVisible();
 await page.getByRole('button',{name:'Filtros',exact:true}).click();
 await page.getByRole('combobox',{name:'Ação',exact:true}).selectOption('team.member_updated');
 const from=page.getByLabel('De', {exact:true});await from.fill('2026-10-01');await from.focus();await expect(from).toHaveCSS('box-shadow','none');await expect(from).toHaveCSS('font-size','16px');
 await page.getByRole('button',{name:'Aplicar filtros'}).click();await expect(page.getByText(/Página 1/)).toBeVisible();
 await page.getByRole('button',{name:'Ver evento',exact:true}).first().click();await expect(page.getByRole('heading',{name:'Detalhes do evento'})).toBeVisible();await expect(page.getByText(target,{exact:true}).first()).toBeVisible();
 await page.getByRole('button',{name:'Voltar à lista'}).click();
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar JSON'}).click();expect((await downloaded).suggestedFilename()).toMatch(/^auditoria-.*\.json$/);await expect(page.getByRole('status').filter({hasText:'Exportação registrada'})).toContainText('Exportação registrada');
});
test('restaurar referência exige confirmação e nunca envia active; histórico restaurado disponível',async({page})=>{
 await setup(page);await page.goto('/arquivados');
 let sent=false;await page.route('**/api/governance/archives/*/restore',route=>{sent=true;expect(route.request().postDataJSON()).toEqual({office_id:office});return route.fulfill({json:{data:{ok:true}}});});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restaurar referência',exact:true}).first().click();await expect(page.getByRole('status').filter({hasText:'O acesso continua inativo'})).toContainText('O acesso continua inativo');expect(sent).toBe(true);
 await page.getByLabel('Estado do arquivo').selectOption('restored');await expect(page.getByRole('button',{name:'Restaurar referência',exact:true})).toHaveCount(0);
});
for(const role of ['employee','client'])test(`sem capacidade: ${role} não vê módulos nem rota restrita`,async({page})=>{
 await setup(page,['foundation.access'],role);await page.goto(role==='client'?'/area-cliente':'/painel');await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();await expect(page.getByRole('link',{name:'Auditoria',exact:true})).toHaveCount(0);await page.goto('/auditoria');await expect(page.getByRole('heading',{name:'Acesso não autorizado'})).toBeVisible();await page.goto('/arquivados');await expect(page.getByRole('heading',{name:'Acesso não autorizado'})).toBeVisible();
});
test('audit.read permite consultar sem botão de exportação; falha e revogação escondem lista',async({page})=>{
 await setup(page,['foundation.access','audit.read'],'employee');await page.goto('/auditoria');await expect(page.getByRole('list',{name:'Eventos de auditoria'})).toBeVisible();await expect(page.getByRole('button',{name:'Exportar JSON'})).toHaveCount(0);
 await page.route('**/api/governance/audit?**',r=>r.fulfill({status:503,json:{error:{code:'GOVERNANCE_UNAVAILABLE'}}}));await page.getByRole('button',{name:'Atualizar lista'}).click();await expect(page.getByRole('alert')).toContainText('Serviço indisponível');await expect(page.getByRole('list',{name:'Eventos de auditoria'})).toHaveCount(0);
 await page.route('**/api/governance/audit?**',r=>r.fulfill({status:403,json:{error:{code:'GOVERNANCE_FORBIDDEN'}}}));await page.getByRole('button',{name:'Tentar novamente'}).click();await expect(page.getByRole('alert')).toContainText('Seu acesso não permite');
});
for(const viewport of [{width:720,height:450},{width:880,height:720}])test(`auditoria mantém menu e filtros acessíveis em ${viewport.width}px com zoom/toque`,async({page})=>{
 await page.setViewportSize(viewport);await setup(page);await page.goto('/auditoria');await expect(page.getByRole('list',{name:'Eventos de auditoria'})).toBeVisible();
 await page.getByRole('button',{name:'Abrir menu'}).click();await expect(page.getByRole('dialog',{name:'Menu de navegação'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Abrir menu'})).toBeFocused();
 await page.getByRole('button',{name:'Filtros',exact:true}).click();await page.getByRole('button',{name:'Aplicar filtros'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Aplicar filtros'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('arquivo identifica duas pessoas antes de escolher a restauração',async({page})=>{
 await setup(page);await page.goto('/arquivados');await expect(page.getByText('Pessoa Arquivada 1',{exact:true})).toBeVisible();await expect(page.getByText('Pessoa Arquivada 2',{exact:true})).toBeVisible();
});
for(const reason of ['navegar','revogar'])test(`exportação abandonada não baixa dados após ${reason}`,async({page})=>{
 await page.setViewportSize({width:360,height:640});await setup(page);
 await page.addInitScript(()=>{
  const state=window as typeof window&{exportSettled?:boolean;exportDownloads?:number};
  state.exportDownloads=0;
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download.startsWith('auditoria-'))state.exportDownloads!++;click.call(this);};
  const original=window.fetch;window.fetch=async(...args)=>{
   const target=String(args[0]);try {const response=await original(...args);if(target.includes('/audit/export')){const json=response.json.bind(response);response.json=async()=>{try{return await json();}finally{queueMicrotask(()=>{state.exportSettled=true;});}};}return response;}
   catch(error){if(target.includes('/audit/export'))state.exportSettled=true;throw error;}
  };
 });
 let release!:()=>void,holding!:()=>void,done!:()=>void;const pending=new Promise<void>(r=>release=r),held=new Promise<void>(r=>holding=r),complete=new Promise<void>(r=>done=r);
 await page.route('**/api/governance/audit/export',async route=>{holding();await pending;try{await route.fulfill({json:{data:{items:[],count:0,office_id:office,exported_at:'2026-10-18',request_id:target}}});}catch{/* Abort is the expected fix. */}finally{done();}});
 await page.goto('/auditoria');await expect(page.getByRole('list',{name:'Eventos de auditoria'})).toBeVisible();await page.getByRole('button',{name:'Exportar JSON'}).click();await held;
 if(reason==='navegar'){await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link',{name:'Início',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();}
 else {await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:'owner',permissions:['foundation.access','audit.read'],office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'}]}}}));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'Exportar JSON'})).toHaveCount(0);}
 release();await complete;
 await expect.poll(()=>page.evaluate(()=>(window as typeof window&{exportSettled?:boolean}).exportSettled)).toBe(true);
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 expect(await page.evaluate(()=>(window as typeof window&{exportDownloads?:number}).exportDownloads)).toBe(0);
});
