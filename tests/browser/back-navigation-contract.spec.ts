import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'UI com sessão e dados fictícios; não comprova Auth real.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const permissions=['foundation.access','settings.access','users.manage','audit.read','archives.manage','categories.manage','access.manage','requests.read','requests.archives.manage'];
async function setup(page:Page,role='owner',caps=permissions){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Pessoa fictícia',role_code:role,permissions:caps}]}}}));
 await page.route('**/api/auth/activity',r=>r.fulfill({json:{data:{user_id:user,session_id:office,idle_minutes:30,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString()}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/account-closure/archives',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5}}}));
 await page.route('**/api/privacy/state',r=>r.fulfill({json:{data:{configured:false,controller:{controller_name:'',cnpj:'',contact_email:'',contact_phone:'',address:''},revision:1}}}));
 await page.route('**/api/categories/**',r=>r.fulfill({json:{data:{items:[],can_manage:true}}}));
 await page.route('**/api/access-settings/**',r=>r.fulfill({json:{data:{can_manage:true,audience:'team',policies:Object.fromEntries(['team','client'].map(a=>[a,{audience:a,idle_minutes:30,revision:1,updated_at:new Date().toISOString()}]))}}}));
 await page.route('**/api/team?**',r=>r.fulfill({json:{data:{kind:'members',scope:{role_code:role,allowed_roles:['employee'],allowed_permissions:['foundation.access'],can_create_owner:false,can_delegate:false},items:[],total:0,page:1,page_size:3,counts:{members:0,invitations:0}}}}));
 await page.route('**/api/governance/**',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:3}}}));
 await page.route('**/api/account/read',r=>r.fulfill({json:{data:{name:'Pessoa fictícia',cpf:null,email:'fixture@example.test',version:'a'.repeat(64),cpf_masked:null,pending_email:null,can_edit:role!=='client'}}}));
}
for(const width of [320,360,1440])for(const route of ['/configuracoes','/configuracoes/categorias','/configuracoes/acessos','/configuracoes/privacidade','/equipe','/auditoria','/configuracoes/arquivados']){
 test(`retorno visível e seguro ${route} em ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);await page.goto(route);await expect(page.getByRole('heading',{level:1})).toBeVisible();
  if(process.env.BACK_BASELINE){await page.screenshot({path:`/workspace/scratch/retornos-before-${width}-${route.split('/').at(-1)}.png`,fullPage:true});return;}
  const back=page.getByRole('main').getByRole('link',{name:route==='/configuracoes'?'Voltar ao início':'Voltar às configurações',exact:true});
  await expect(back).toBeVisible();expect(await back.evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  if(route==='/configuracoes/acessos')await page.screenshot({path:`/workspace/scratch/retornos-after-${width}-acessos.png`,fullPage:true});
  const geometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,cls:String(e.className),right:e.getBoundingClientRect().right})).slice(0,8)}));
  expect(geometry.scrollWidth,JSON.stringify(geometry)).toBeLessThanOrEqual(width);
  if(route==='/configuracoes/arquivados'&&width===320)await page.screenshot({path:'/workspace/scratch/retornos-after-320-arquivados.png',fullPage:true});
  await back.click();await expect(page).toHaveURL(new RegExp(`${route==='/configuracoes'?'/painel':'/configuracoes'}$`));
  if(width<900)expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);
 });
}
for(const role of ['owner','admin','employee','client'])test(`retorno direto da conta respeita portal ${role}`,async({page})=>{
 await setup(page,role,['foundation.access']);await page.goto(role==='client'?'/minha-conta':'/conta');
 const back=page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true});await expect(back).toBeVisible();await back.click();await expect(page).toHaveURL(new RegExp(`${role==='client'?'/minhas-configuracoes':'/configuracoes'}$`));
 await expect(page.getByRole('heading',{name:'Configurações',exact:true})).toBeVisible();
});
test('convite mantém Fechar local e o rascunho protegido sem retorno duplicado',async({page})=>{
 await setup(page);await page.goto('/equipe');await page.getByRole('button',{name:'Novo convite',exact:true}).click();await page.getByLabel('Nome completo',{exact:true}).fill('Rascunho fictício');
 await expect(page.getByRole('main').getByRole('link',{name:/^Voltar/})).toBeHidden();
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Fechar',exact:true}).click();await expect(page.getByLabel('Nome completo',{exact:true})).toHaveValue('Rascunho fictício');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Fechar',exact:true}).click();await expect(page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true})).toBeVisible();
});

test('categoria incerta503 mantém Cancelar local bloqueado e não cria saída de rota',async({page})=>{
 await setup(page);await page.route('**/api/categories/command',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));
 await page.goto('/configuracoes/categorias');await page.getByRole('button',{name:'Nova categoria',exact:true}).click();
 await page.getByLabel('Nome da categoria').fill('Categoria fictícia');await page.getByLabel('Nível de execução').selectOption('1');await page.getByLabel('Motivo').fill('Organização fictícia');
 await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();await expect(page.getByText('Repita a operação para confirmar o resultado.',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();await expect(page.getByRole('main').getByRole('link',{name:/^Voltar/})).toBeHidden();
});
test('retorno principal aguarda a mutação da configuração antes de navegar',async({page})=>{
 await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/access-settings/policy',async r=>{await gate;return r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}});});
 await page.goto('/configuracoes/acessos');await page.locator('#idle-team').selectOption('15');await page.getByRole('button',{name:'Salvar prazo da equipe',exact:true}).click();
 const back=page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true});
 await expect(back).toHaveAttribute('aria-disabled','true');await back.dispatchEvent('click');await expect(page).toHaveURL(/\/configuracoes\/acessos$/);release();await expect(back).not.toHaveAttribute('aria-disabled','true');
});

test('cartão Arquivados exige leitura de solicitações quando só há gestão de arquivo de solicitações',async({page})=>{
 await setup(page,'admin',['foundation.access','settings.access','requests.archives.manage']);await page.goto('/configuracoes');
 await expect(page.getByRole('navigation',{name:'Opções de configurações'}).getByRole('link',{name:/Arquivados/})).toHaveCount(0);
});
test('consulta de conta excluída retorna localmente à lista de contas',async({page})=>{
 await setup(page);await page.route('**/api/account-closure/archives',r=>r.fulfill({json:{data:{items:[{id:user,name:'Conta fictícia',closed_at:'2026-11-01T00:00:00Z'}],total:1,page:1,page_size:5}}}));
 await page.route('**/api/account-closure/documents',r=>r.fulfill({json:{data:{items:[]}}}));
 await page.goto('/configuracoes/arquivados');await page.getByRole('button',{name:'Consultar acervo',exact:true}).click();
 const back=page.getByRole('button',{name:'Voltar às contas excluídas',exact:true});await expect(back).toBeVisible();
 await expect(page.getByRole('main').getByRole('link',{name:/^Voltar/})).toBeHidden();await back.click();await expect(page.getByRole('heading',{name:'Documentos conservados',exact:true})).toHaveCount(0);await expect(page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true})).toBeVisible();
});

test('conta conserva Cancelar local e bloqueia retorno enquanto salva',async({page})=>{
 await page.setViewportSize({width:360,height:640});await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/account/save',async r=>{await gate;return r.fulfill({json:{data:{name:'Nome alterado',cpf:null,email:'fixture@example.test',version:'b'.repeat(64),pending_email:null,can_edit:true}}});});
 await page.goto('/conta');await expect(page.getByLabel('E-mail de acesso',{exact:true})).toHaveValue('fixture@example.test');await page.screenshot({path:'/workspace/scratch/retornos-after-360-conta.png',fullPage:true});await page.getByLabel('Nome completo',{exact:true}).fill('Nome alterado');
 await expect(page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();const back=page.locator('.operation-back-control');
 try{await expect(back).toHaveAttribute('aria-disabled','true');await back.dispatchEvent('click');await expect(page).toHaveURL(/\/conta$/);}finally{release();}
 await expect(page.getByRole('status')).toContainText('Dados pessoais atualizados');await expect(back).not.toHaveAttribute('aria-disabled','true');
});

test('restauro em Arquivados integrado mantém retorno bloqueado até a resposta',async({page})=>{
 await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/governance/archives?**',r=>r.fulfill({json:{data:{items:[{id:user,target_id:user,target_label:'Referência fictícia',target_type:'membership',archived_at:'2026-11-01T00:00:00Z',restored_at:null}],total:1,page:1,page_size:3}}}));
 await page.route('**/api/governance/archives/*/restore',async r=>{await gate;return r.fulfill({json:{data:{ok:true}}});});
 await page.goto('/configuracoes/arquivados');await page.getByRole('tab',{name:'Cadastros e referências',exact:true}).click();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:/Restaurar/}).click();
 const back=page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true});
 try{await expect(back).toHaveAttribute('aria-disabled','true');await back.dispatchEvent('click');await expect(page).toHaveURL(/\/configuracoes\/arquivados$/);}finally{release();}
 await expect(page.getByRole('status')).toContainText('Referência restaurada');await expect(back).not.toHaveAttribute('aria-disabled','true');
});

test('conta mantém retorno bloqueado durante confirmação do e-mail após salvar',async({page})=>{
 await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),email='novo@example.test';
 await page.route('**/api/account/save',r=>r.fulfill({json:{data:{name:'Pessoa fictícia',cpf:null,email:'fixture@example.test',version:'b'.repeat(64),pending_email:email,can_edit:true}}}));
 await page.route('https://team-ui.supabase.co/auth/v1/user*',async r=>{if(r.request().method()!=='PUT')return r.fulfill({json:{id:user,aud:'authenticated'}});await gate;return r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}});});
 await page.goto('/conta');await expect(page.getByLabel('E-mail de acesso',{exact:true})).toHaveValue('fixture@example.test');await page.getByLabel('E-mail de acesso',{exact:true}).fill(email);await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
 const back=page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true});
 try{await expect(back).toBeVisible();await expect(back).toHaveAttribute('aria-disabled','true');await back.dispatchEvent('click');await expect(page).toHaveURL(/\/conta$/);}finally{release();}
 await expect(back).not.toHaveAttribute('aria-disabled','true');await expect(page.getByRole('status')).toContainText('Confira as instruções de confirmação');
});
