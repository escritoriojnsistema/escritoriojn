import {test,expect,type Page} from '@playwright/test';

test.skip(!process.env.TEAM_UI_CONTRACT,'Local UI contract.');
const user='22222222-2222-4222-8222-222222222222',office='11111111-1111-4111-8111-111111111111';
async function prepare(page:Page,role:string,permissions:string[]){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({
  access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,
  user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}},
 })),{token,user});
 await page.route('https://team-ui.supabase.co/**',route=>route.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',route=>route.fulfill({json:{data:{user:{id:user},contexts:[{
  office_id:office,user_id:user,role_code:role,permissions:['foundation.access',...permissions],office_name:'Laboratório',display_name:'Teste',
 }]}}}));
 await page.route('**/api/notifications/summary',route=>route.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/privacy/copyright-state',route=>route.fulfill({json:{data:{notice:'© Empresa fictícia.',revision:4}}}));
}

for(const [role,editable] of [['owner',true],['admin',true],['admin',false],['employee',false],['client',false]] as const){
 test(`${role} ${editable?'edita':'consulta'} direitos autorais em Configurações`,async({page})=>{
  await page.setViewportSize({width:role==='owner'?1440:360,height:740});
  await prepare(page,role,editable?['settings.access']:[]);
  const client=role==='client';
  await page.goto(client?'/minhas-configuracoes':'/configuracoes');
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  await page.getByRole('link',{name:editable?/^Privacidade /:/^Leis e privacidade /}).click();
  await expect(page.getByRole('link',{name:'Voltar às configurações',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Termos de uso',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Termos de uso'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Fechar',exact:true}).click();
  await page.getByRole('button',{name:'Escritório JN',exact:true}).click();
  if(editable){
   const input=page.getByRole('textbox',{name:'Direitos autorais do sistema'});
   await expect(input).toHaveValue('© Empresa fictícia.');
   await page.route('**/api/privacy/copyright-save',route=>{
    expect(route.request().postDataJSON()).toEqual({office_id:office,expected_revision:4,notice:'© Texto atualizado.'});
    return route.fulfill({json:{data:{notice:'© Texto atualizado.',revision:5}}});
   });
   await input.fill('© Texto atualizado.');
   await page.getByRole('button',{name:'Salvar direitos autorais'}).click();
   await expect(page.getByRole('status')).toContainText('Direitos autorais atualizados.');
  }else{
   await expect(page.getByText('© Empresa fictícia.',{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Salvar direitos autorais'})).toHaveCount(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('app instalado oculta instalação e conserva versão e data em Configurações',async({page})=>{
 await prepare(page,'client',[]);
 await page.goto('/minhas-configuracoes');
 const app=page.getByRole('button',{name:/^App Instalação/});
 await expect(app).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
 await page.reload();
 await expect(page.getByRole('button',{name:'Instalar aplicativo',exact:true})).toHaveCount(0);
 await app.click();
 const dialog=page.getByRole('dialog',{name:'App',exact:true});
 await expect(dialog.getByText('Confirmada',{exact:true})).toBeVisible();
 await expect(dialog.getByText('Data de instalação',{exact:true})).toBeVisible();
 await expect(dialog.getByText(/0\.2\.0/)).toBeVisible();
});

for(const role of ['owner','client'])test(`painel mostra totais autorizados e atualiza clientes para ${role}`,async({page})=>{
 const client=role==='client';
 await page.setViewportSize({width:client?320:1440,height:740});
 await prepare(page,role,client?[]:['requests.read','requests.read_all','customers.read']);
 await page.route('**/api/requests/home-counts',route=>{
  expect(route.request().postDataJSON()).toEqual({office_id:office});
  return route.fulfill({json:{data:client?{recebido:1}:{aberto:3,concluido:1}}});
 });
 let customers=2;
 await page.route('**/api/customers/search',route=>route.fulfill({json:{data:{items:[],total:customers,page:1,page_size:3}}}));
 await page.goto(client?'/area-cliente':'/painel');
 await expect(page.getByRole('list',{name:'Solicitações por situação'})).toContainText(client?'Recebido para triagem':'Concluído');
 await expect(page.locator('.home-request-chart > p')).toHaveText(client?'1 solicitação':'4 solicitações');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(!client){
  await expect(page.getByText('2 clientes disponíveis')).toBeVisible();
  customers=1;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('1 cliente disponível')).toBeVisible();
  await expect(page.locator('.operation-avatar-chip')).toHaveCount(0);
 }
});
