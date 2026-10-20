import { test, expect, type Page } from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Fictitious presentation contract; real Auth/database tested separately.');
const office='11111111-1111-4111-8111-111111111111', user='22222222-2222-4222-8222-222222222222', id='33333333-3333-4333-8333-333333333333';
const permissions=['foundation.access','services.read','services.manage','services.perform','services.discount','services.surcharge','services.courtesy','services.price_override','customers.read','users.manage','audit.read'];
const definition={code:'XEROX-TESTE',name:'Xerox de Teste',category:'Cópias',unit:'página',price_cents:50,effective_from:'2026-10-20T10:00:00.000Z',person_required:false,participants_min:0,approval_required:false,signature_required:false,settlement_required:true,required_capabilities:['services.perform'],fields:[],checklist:[],quantity_min:1,quantity_max:1000,max_discount_bps:1000,max_surcharge_bps:1000,allow_courtesy:true,allow_price_override:true};
const version={...definition,id,number:1,created_at:definition.effective_from,created_by:user,reason:'Cadastro fictício'};
const detail={id,code:definition.code,latest_version:1,can_manage:true,current:version,versions:[version],history_page:1,history_total:1};
async function setup(page:Page,caps=permissions,empty=false,role='owner'){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions:caps,office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'}]}}}));
 await page.route('**/api/services**',r=>{
  const url=r.request().url(),b=r.request().postDataJSON();
  expect(r.request().headers().authorization).toMatch(/^Bearer /);
  if(url.endsWith('/search'))return r.fulfill({json:{data:{items:empty?[]:[{id,...definition,version:1}],total:empty?0:1,page:b.page,page_size:b.size}}});
  if(url.endsWith('/quote'))return r.fulfill({json:{data:{service_id:id,version_id:id,version:1,effective_from:definition.effective_from,quoted_at:definition.effective_from,definition,quantity:b.quantity,unit_price_cents:50,base_cents:50*b.quantity,total_cents:50*b.quantity,adjustment:b.adjustment}}});
  if(url.endsWith('/detail'))return r.fulfill({json:{data:{...detail,can_manage:caps.includes('services.manage')}}});
  const number=url.endsWith('/versions')?2:1;const v={...version,...b.service,effective_from:definition.effective_from,number,reason:b.reason};
  return r.fulfill({json:{data:{...detail,latest_version:number,current:v,versions:number===2?[v,version]:[v],history_total:number}}});
 });
}
for(const [width,height] of [[320,568],[360,640],[768,1024],[1440,900]])test(`serviços: lista/formulário/histórico em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height});await setup(page);await page.goto('/servicos');
 await expect(page.getByRole('heading',{name:'Serviços',exact:true})).toBeVisible();
 await expect(page.getByRole('list',{name:'Serviços do escritório'})).toContainText('Xerox de Teste');
 await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`docs/evidencias/etapa-09/lista-${width}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width<=900)expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);
 await page.getByRole('button',{name:'Ver serviço Xerox de Teste',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Xerox de Teste',exact:true})).toBeVisible();
 await page.getByText('Histórico de versões',{exact:true}).click();await expect(page.getByRole('list',{name:'Versões do serviço'})).toContainText('Cadastro fictício');
 await page.getByRole('button',{name:'Nova versão',exact:true}).click();
 const formHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
 if(height>=640)expect(formHeight).toBeLessThanOrEqual(height+1);
 if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`docs/evidencias/etapa-09/formulario-${width}.png`,fullPage:true});
 await page.getByLabel('Preço (R$)',{exact:true}).fill('0,75');await page.getByLabel('Motivo da versão',{exact:true}).fill('Reajuste fictício');
 const changed=page.waitForRequest(r=>r.url().endsWith('/versions'));
 await page.getByRole('button',{name:'Publicar versão',exact:true}).click();
 const request=await changed;expect(request.postDataJSON().service.price_cents).toBe(75);expect(request.postDataJSON().expected_version).toBe(1);
 await expect(page.getByRole('status')).toContainText('Versão publicada');
 await page.getByText('Histórico de versões',{exact:true}).click();await expect(page.getByRole('list',{name:'Versões do serviço'}).locator('li')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`docs/evidencias/etapa-09/historico-${width}.png`,fullPage:true});
});
test('serviços: vazio permite cadastro e políticas no mesmo formulário',async({page})=>{
 await page.setViewportSize({width:360,height:640});await setup(page,permissions,true);await page.goto('/servicos');
 await expect(page.getByText('Nenhum serviço encontrado. Cadastre o primeiro serviço ou ajuste a busca.')).toBeVisible();
 await page.getByRole('button',{name:'Novo serviço',exact:true}).click();
 await page.getByLabel('Nome do serviço',{exact:true}).fill('Contrato de Teste');await page.getByLabel('Código',{exact:true}).fill('CONTRATO-TESTE');await page.getByLabel('Categoria',{exact:true}).fill('Contratos');await page.getByLabel('Preço (R$)',{exact:true}).fill('100,00');
 await page.getByText('Políticas de atendimento e cobrança',{exact:true}).click();await page.getByLabel('Exigir pessoa').check();await page.getByLabel('Participantes mínimos').fill('2');await page.getByLabel('Exigir aprovação').check();await page.getByLabel('Exigir assinatura').check();
 const sent=page.waitForRequest(r=>r.url().endsWith('/api/services'));await page.getByRole('button',{name:'Cadastrar serviço',exact:true}).click();
 const b=(await sent).postDataJSON();expect(b.service).toMatchObject({price_cents:10000,person_required:true,participants_min:2,approval_required:true,signature_required:true});await expect(page.getByRole('status')).toContainText('Serviço cadastrado');
});
test('serviços: funcionário sem gestão consulta, sem editar',async({page})=>{
 await setup(page,['foundation.access','services.read'],false,'employee');await page.goto('/servicos');
 await expect(page.getByRole('list',{name:'Serviços do escritório'})).toBeVisible();await expect(page.getByRole('button',{name:'Novo serviço',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Ver serviço Xerox de Teste',exact:true}).click();await expect(page.getByRole('heading',{name:'Xerox de Teste',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Nova versão',exact:true})).toHaveCount(0);
});
test('serviços: pendência mantém rótulo e erro de conexão preserva formulário',async({page})=>{
 await setup(page);await page.goto('/servicos');await page.getByRole('button',{name:'Novo serviço',exact:true}).click();await page.getByLabel('Nome do serviço',{exact:true}).fill('Xerox de Teste');await page.getByLabel('Código',{exact:true}).fill('XEROX-TESTE');await page.getByLabel('Categoria',{exact:true}).fill('Cópias');
 let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/services',async r=>{await held;await r.fulfill({status:503,json:{error:{code:'SERVICES_UNAVAILABLE'}}});});
 const button=page.getByRole('button',{name:'Cadastrar serviço',exact:true});await button.click();await expect(button).toBeDisabled();await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);release();await expect(page.getByRole('alert')).toContainText('indisponível');await expect(page.getByLabel('Nome do serviço',{exact:true})).toHaveValue('Xerox de Teste');
});
test('serviços: atualização em segundo plano conserva lista e contexto',async({page})=>{
 await setup(page);await page.goto('/servicos');const list=page.getByRole('list',{name:'Serviços do escritório'});await expect(list).toBeVisible();
 let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/services/search',async r=>{await held;await r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5}}});});
 try{await page.getByRole('button',{name:'Atualizar lista',exact:true}).click();await expect(list).toBeVisible();await expect(page.getByRole('heading',{name:'Serviços',exact:true})).toBeVisible();}finally{release();}
});
test('serviços: editar quantidade invalida resultado de simulação anterior',async({page})=>{
 await setup(page);await page.goto('/servicos');await page.getByRole('button',{name:'Ver serviço Xerox de Teste',exact:true}).click();await page.getByText('Simular valor',{exact:true}).click();await page.getByRole('button',{name:'Calcular valor',exact:true}).click();await expect(page.getByText(/Total:/)).toBeVisible();await page.getByLabel('Quantidade',{exact:true}).fill('4');await expect(page.getByText(/Total:/)).toHaveCount(0);
});
test('serviços: simulação rejeita preço manual vazio ou fração de centavo',async({page})=>{
 await setup(page);await page.goto('/servicos');await page.getByRole('button',{name:'Ver serviço Xerox de Teste',exact:true}).click();await page.getByText('Simular valor',{exact:true}).click();await page.getByRole('combobox',{name:'Ajuste',exact:true}).selectOption('override');await page.getByLabel('Motivo do ajuste',{exact:true}).fill('Ajuste fictício');
 let calls=0;page.on('request',r=>{if(r.url().endsWith('/quote'))calls++;});
 for(const value of ['',' ','0,001','-0,001','1,005']){await page.getByLabel('Preço unitário (R$)',{exact:true}).fill(value);await page.getByRole('button',{name:'Calcular valor',exact:true}).click();await expect(page.getByRole('alert')).toContainText('duas casas');expect(calls).toBe(0);}
});
test('serviços: adicionar campo após remover intermediário gera chave disponível',async({page})=>{
 await setup(page);await page.goto('/servicos');await page.getByRole('button',{name:'Novo serviço',exact:true}).click();await page.getByText('Campos e checklist (0/0)',{exact:true}).click();for(let i=0;i<3;i++)await page.getByRole('button',{name:'Adicionar campo',exact:true}).click();await page.getByRole('button',{name:'Remover campo 2',exact:true}).click();await page.getByRole('button',{name:'Adicionar campo',exact:true}).click();
 const values=await page.getByLabel(/^Chave \d$/).evaluateAll(elements=>elements.map(x=>(x as HTMLInputElement).value));expect(new Set(values).size).toBe(3);
});
test('serviços: troca de escritório descarta rascunho e resultado tardio',async({page})=>{
 await setup(page);const other='99999999-9999-4999-8999-999999999999';
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[office,other].map(id=>({office_id:id,user_id:user,role_code:'owner',permissions,office_name:id===office?'Escritório Fictício':'Outro Escritório',display_name:'Pessoa Fictícia'}))}}}));
 await page.goto('/servicos');await page.getByRole('button',{name:'Novo serviço',exact:true}).click();await page.getByLabel('Nome do serviço',{exact:true}).fill('Rascunho do escritório A');await page.getByLabel('Código',{exact:true}).fill('RASCUNHO-A');await page.getByLabel('Categoria',{exact:true}).fill('Fictício');
 let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/services',async r=>{await held;try{await r.fulfill({json:{data:detail}});}catch{/* canceled on office change */}});
 await page.getByRole('button',{name:'Cadastrar serviço',exact:true}).click();await page.getByRole('combobox',{name:'Escritório',exact:true}).selectOption(other);release();await expect(page.getByRole('list',{name:'Serviços do escritório'})).toBeVisible();await expect(page.getByText('Serviço cadastrado.',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Novo serviço',exact:true}).click();await expect(page.getByLabel('Nome do serviço',{exact:true})).toHaveValue('');
});
test('serviços: zoom e altura reduzida permitem rolagem sem corte horizontal',async({page})=>{
 await page.setViewportSize({width:360,height:400});await setup(page);await page.goto('/servicos');await page.getByRole('button',{name:'Novo serviço',exact:true}).click();await page.getByLabel('Nome do serviço',{exact:true}).fill('Nome fictício longo '.repeat(6));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight)).toBe(true);await page.getByRole('button',{name:'Cadastrar serviço',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Cadastrar serviço',exact:true})).toBeInViewport();
 await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>document.documentElement.style.zoom='2');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('button',{name:'Cadastrar serviço',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Cadastrar serviço',exact:true})).toBeInViewport();
});
