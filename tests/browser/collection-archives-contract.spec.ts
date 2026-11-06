import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Fictitious SDK/API contracts; authority requires database/Auth suites.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
const date='2026-11-05T10:00:00.000Z';
const permissions=['foundation.access','requests.read','requests.update','requests.transfer','archives.manage'];
const staff={id,protocol:'JN-2026-000888',title:'Coleta inicial',public_status:'recebido',created_at:date,updated_at:date,status:'aberto',origin:'presencial',priority:'normal',created_by:user,assignee_id:user,assignee_name:'Pessoa local',customer_name:null,version:1,portal:false,customer_id:null,message:'Informação inicial',priority_reason:'',items:[],history:[],history_page:1,history_total:0,can_update:false,can_transfer:true,can_cancel:false,preintake:true,can_collect:true,can_handoff:true,execution_level:2};
async function setup(page:Page,{caps=permissions,role='owner'}:{caps?:string[];role?:string}={}){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions:caps,office_name:'Local',display_name:'Pessoa local'}]}}}));
 await page.route('**/api/requests/search',r=>r.fulfill({json:{data:{items:[staff],total:1,page:1,page_size:5,portal:false}}}));
 await page.route('**/api/requests/*/detail',r=>r.fulfill({json:{data:staff}}));
 await page.route('**/api/requests/options',r=>{const b=r.request().postDataJSON();return r.fulfill({json:{data:{items:[{id:other,label:b.kind==='customers'?'Cliente local':'Responsável local',eligible:true}],total:1,page:1,page_size:5}}});});
}
async function open(page:Page){await page.goto('/solicitacoes');await page.getByRole('button',{name:`Ver solicitação ${staff.protocol}`,exact:true}).click();}
async function layout(page:Page,width:number){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);if(width===360){const nav=page.getByRole('navigation',{name:'Atalhos do aplicativo'});expect(await nav.getByRole('link').count()).toBeLessThanOrEqual(4);}}
for(const width of [360,1440]){
 test(`coleta salva dados oficiais e encaminha limpando detalhe access_lost ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);await open(page);
  const region=page.getByRole('region',{name:'Pré-atendimento'}),handoff=region.getByRole('button',{name:'Encaminhar à equipe habilitada'});
  await region.getByLabel('Motivo do encaminhamento').fill('Equipe habilitada');await expect(handoff).toBeEnabled();
  await region.getByLabel('Título da coleta').fill('Coleta salva');await region.getByLabel('Observação da coleta').fill('Nota reservada');await expect(handoff).toBeDisabled();
  const commands:unknown[]=[];let release!:()=>void;const held=new Promise<void>(r=>release=r);
  await page.route('**/api/request-levels/update-preintake',async r=>{commands.push(r.request().postDataJSON());await held;return r.fulfill({json:{data:{...staff,title:'Coleta salva',version:2}}});});
  const save=region.getByRole('button',{name:'Salvar coleta'});await save.click();await expect(save).toBeDisabled();await expect(save).toHaveText('Salvar coleta');release();await expect(handoff).toBeEnabled();
  expect(commands).toEqual([{office_id:office,request_id:id,expected_version:1,value:{title:'Coleta salva',message:'Informação inicial',customer_id:null,internal_note:'Nota reservada'}}]);
  await page.route('**/api/request-levels/handoff',r=>{commands.push(r.request().postDataJSON());return r.fulfill({json:{data:{access_lost:true}}});});
  await layout(page,width);await handoff.click();await expect(page.getByRole('list',{name:'Solicitações do escritório'})).toBeVisible();await expect(region).toHaveCount(0);await expect(page.getByText('Nota reservada',{exact:true})).toHaveCount(0);
  expect(commands[1]).toEqual({office_id:office,request_id:id,expected_version:2,reason:'Equipe habilitada'});
 });
 test(`exceção transfere e revoga somente solicitação selecionada ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);await open(page);await page.getByText('Transferência excepcional por nível',{exact:true}).click();
  await expect(page.getByText(/Autoriza somente a solicitação selecionada/)).toBeVisible();
  await page.getByRole('button',{name:'Selecionar destinatário da exceção'}).click();await page.getByRole('button',{name:'Escolher Responsável local'}).click();await page.getByLabel('Motivo da exceção').fill('Autorização pontual');
  const commands:unknown[]=[];await page.route('**/api/request-levels/transfer-exception',r=>{commands.push(r.request().postDataJSON());return r.fulfill({json:{data:{...staff,version:2,assignee_id:other}}});});
  await page.getByRole('button',{name:'Registrar transferência excepcional'}).click();await expect(page.getByLabel('Motivo da exceção')).toHaveValue('');
  await page.getByLabel('Operação excepcional').selectOption('revoke');await page.getByLabel('Motivo da exceção').fill('Fim da autorização');
  await page.route('**/api/request-levels/revoke-exception',r=>{commands.push(r.request().postDataJSON());return r.fulfill({json:{data:{access_lost:true}}});});
  await layout(page,width);await page.getByRole('button',{name:'Registrar transferência excepcional'}).click();await expect(page.getByRole('list',{name:'Solicitações do escritório'})).toBeVisible();
  expect(commands).toEqual([{office_id:office,request_id:id,expected_version:1,assignee_id:other,reason:'Autorização pontual'},{office_id:office,request_id:id,expected_version:2,reason:'Fim da autorização'}]);
 });
 test(`arquivo busca nome por POST e baixa apenas publicação pronta autorizada ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);
  const searches:unknown[]=[];await page.route('**/api/account-closure/archives',r=>{searches.push(r.request().postDataJSON());return r.fulfill({json:{data:{items:[{id:other,name:'Cliente encerrado',closed_at:date}],total:1,page:1}}});});
  await page.route('**/api/account-closure/documents',r=>{expect(r.request().postDataJSON()).toEqual({office_id:office,user_id:other});return r.fulfill({json:{data:{items:[{id,title:'Documento pronto',ready:true},{id:other,title:'Documento bloqueado',ready:false}]}}});});
  const downloads:unknown[]=[];await page.route('**/api/document-workflow/artifact',r=>{downloads.push(r.request().postDataJSON());return r.fulfill({contentType:'application/pdf',body:Buffer.from('%PDF-1.4\nfixture')});});
  await page.goto('/configuracoes/arquivados');const region=page.getByRole('region',{name:'Contas excluídas'});await region.getByLabel('Buscar nome ou documento').fill('Cliente encerrado');await region.getByRole('button',{name:'Buscar',exact:true}).click();await expect.poll(()=>searches.length).toBe(2);expect(searches[1]).toEqual({office_id:office,query:'Cliente encerrado',page:1});expect(page.url()).not.toContain('Cliente');
  await region.getByRole('button',{name:'Consultar acervo'}).click();const ready=region.getByRole('listitem').filter({hasText:'Documento pronto'}),blocked=region.getByRole('listitem').filter({hasText:'Documento bloqueado'});await expect(blocked.getByRole('button')).toBeDisabled();
  const downloaded=page.waitForEvent('download');await ready.getByRole('button').click();expect((await downloaded).suggestedFilename()).toBe('documento.pdf');expect(downloads).toEqual([{office_id:office,publication_id:id,action:'download'}]);
  for(const button of await region.getByRole('button').all()){expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);}
  await layout(page,width);if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`/workspace/scratch/corrections-ui-archives-${width}.png`,fullPage:true});
 });
 test(`arquivo403 limpa acervo e bloqueia nova tentativa ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);
  await page.route('**/api/account-closure/archives',r=>r.fulfill({json:{data:{items:[{id:other,name:'Cliente encerrado',closed_at:date}],total:1,page:1}}}));
  await page.route('**/api/account-closure/documents',r=>r.fulfill({json:{data:{items:[{id,title:'Documento restrito',ready:true}]}}}));
  let calls=0;await page.route('**/api/document-workflow/artifact',r=>{calls++;return r.fulfill({status:403,json:{error:{code:'FORBIDDEN'}}});});
  await page.goto('/configuracoes/arquivados');const region=page.getByRole('region',{name:'Contas excluídas'});await region.getByRole('button',{name:'Consultar acervo'}).click();await region.getByRole('button',{name:'Consultar PDF e imprimir'}).click();await expect(region.getByRole('alert')).toContainText('acesso');await expect(region.getByRole('button',{name:'Consultar PDF e imprimir'})).toHaveCount(0);await expect(region.getByRole('button',{name:'Buscar',exact:true})).toBeDisabled();expect(calls).toBe(1);
 });
}
test('consulta sem transferência não oferece exceção; sem arquivos.manage não expõe contas excluídas',async({page})=>{
 await setup(page,{caps:['foundation.access','requests.read','requests.archives.manage'],role:'admin'});await open(page);await expect(page.getByText('Transferência excepcional por nível',{exact:true})).toHaveCount(0);await page.goto('/configuracoes/arquivados');await expect(page.getByRole('heading',{name:'Arquivados',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Contas excluídas'})).toHaveCount(0);
});
for(const width of [360,1440])test(`arquivo permite repetir a mesma busca após503 ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);let calls=0;
 await page.route('**/api/account-closure/archives',r=>{calls++;return calls===1?r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}):r.fulfill({json:{data:{items:[{id:other,name:'Cliente recuperado',closed_at:date}],total:1,page:1}}});});
 await page.goto('/configuracoes/arquivados');const region=page.getByRole('region',{name:'Contas excluídas'});await expect(region.getByRole('alert')).toContainText('indisponível');await region.getByRole('button',{name:'Buscar',exact:true}).click();await expect(region.getByText('Cliente recuperado',{exact:true})).toBeVisible();await expect(region.getByRole('alert')).toHaveCount(0);expect(calls).toBe(2);
});
