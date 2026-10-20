import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { emptyService, type ServiceQuote } from '../../shared/services';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
async function sdkFor(name:string){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();return sdk;}
async function headers(sdk:Awaited<ReturnType<typeof sdkFor>>){const {data}=await sdk.auth.getSession();return {Authorization:`Bearer ${data.session!.access_token}`};}
async function login(page:Page,name='manager'){
 await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(`${name}@example.test`);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.goto('/servicos');await expect(page.getByRole('heading',{name:'Serviços',exact:true})).toBeVisible();
}
test('serviços reais: Xerox R$0,50, nova versão e histórico/snapshot preservados',async({page,request})=>{
 const owner=await sdkFor('manager');try{
  const auth=await headers(owner);const input={...emptyService,code:'XEROX-REAL-TESTE',name:'Xerox Real de Teste',category:'Cópias',unit:'página',price_cents:50,max_discount_bps:1000};
  const created=await request.post('/api/services',{headers:auth,data:{office_id:office,service:input,reason:'Cadastro fictício local'}});expect(created.status()).toBe(201);const initial=(await created.json()).data;
  const before=await request.post(`/api/services/${initial.id}/quote`,{headers:auth,data:{office_id:office,quantity:3,adjustment:{kind:'none',value:0,reason:''}}});expect(before.status()).toBe(200);const old:ServiceQuote=(await before.json()).data;expect(old.total_cents).toBe(150);expect(old.definition.person_required).toBe(false);
  await login(page);await page.getByLabel('Buscar serviço').fill(input.name);await page.getByRole('button',{name:`Ver serviço ${input.name}`,exact:true}).click();await page.getByRole('button',{name:'Nova versão',exact:true}).click();await page.getByLabel('Preço (R$)',{exact:true}).fill('0,75');await page.getByLabel('Motivo da versão',{exact:true}).fill('Reajuste fictício local');
  const published=page.waitForResponse(r=>r.url().endsWith('/versions'));await page.getByRole('button',{name:'Publicar versão',exact:true}).click();expect((await published).status()).toBe(201);await expect(page.getByRole('status')).toContainText('Versão publicada');
  await page.getByText('Histórico de versões',{exact:true}).click();await expect(page.getByRole('list',{name:'Versões do serviço'})).toContainText('0,50');await expect(page.getByRole('list',{name:'Versões do serviço'})).toContainText('0,75');
  await page.getByText('Simular valor',{exact:true}).click();await page.getByLabel('Quantidade',{exact:true}).fill('3');const simulated=page.waitForResponse(r=>r.url().endsWith('/quote'));await page.getByRole('button',{name:'Calcular valor',exact:true}).click();expect((await simulated).status()).toBe(200);await expect(page.getByText(/Total:.*2,25/)).toBeVisible();expect(old.total_cents).toBe(150);expect(old.version).toBe(1);
  const duplicate=await request.post('/api/services',{headers:auth,data:{office_id:office,service:input,reason:'Duplicado fictício'}});expect(duplicate.status()).toBe(409);
  const stale=await request.post(`/api/services/${initial.id}/versions`,{headers:auth,data:{office_id:office,service:input,reason:'Obsoleto fictício',expected_version:1}});expect(stale.status()).toBe(409);
 }finally{await owner.auth.dispose();}
});
test('serviços reais: contrato com dados, checklist, pessoa e participantes',async({page})=>{
 await page.setViewportSize({width:360,height:640});await login(page);await page.getByRole('button',{name:'Novo serviço',exact:true}).click();
 await page.getByLabel('Nome do serviço',{exact:true}).fill('Contrato Real de Teste');await page.getByLabel('Código',{exact:true}).fill('CONTRATO-REAL-TESTE');await page.getByLabel('Categoria',{exact:true}).fill('Contratos');await page.getByLabel('Preço (R$)',{exact:true}).fill('100,00');
 await page.getByText('Políticas de atendimento e cobrança',{exact:true}).click();await page.getByLabel('Exigir pessoa',{exact:true}).check();await page.getByLabel('Participantes mínimos',{exact:true}).fill('2');await page.getByLabel('Exigir aprovação',{exact:true}).check();await page.getByLabel('Exigir assinatura',{exact:true}).check();
 await page.getByText('Campos e checklist (0/0)',{exact:true}).click();await page.getByRole('button',{name:'Adicionar campo',exact:true}).click();await page.getByLabel('Chave 1',{exact:true}).fill('objeto');await page.getByLabel('Rótulo 1',{exact:true}).fill('Objeto do contrato');await page.getByLabel('Checklist (um item por linha)',{exact:true}).fill('Conferir participantes');
 const created=page.waitForResponse(r=>r.url().endsWith('/api/services'));await page.getByRole('button',{name:'Cadastrar serviço',exact:true}).click();const response=await created;expect(response.status()).toBe(201);const v=(await response.json()).data.current;expect(v).toMatchObject({price_cents:10000,person_required:true,participants_min:2,approval_required:true,signature_required:true});expect(v.fields[0]).toMatchObject({key:'objeto',required:true});
 await page.getByText('Regras, campos e checklist',{exact:true}).click();await expect(page.getByRole('region',{name:'Definição do serviço'})).toContainText('Objeto do contrato');
});
test('serviços reais: funcionário consulta e simula; não publica nem concede ajuste',async({page,request})=>{
 const owner=await sdkFor('manager'),worker=await sdkFor('serviceworker');try{
  const ownerAuth=await headers(owner),workerAuth=await headers(worker);const input={...emptyService,code:'PERMISSAO-REAL-TESTE',name:'Permissão Real de Teste',category:'Cópias',price_cents:50,allow_courtesy:true};
  const created=await request.post('/api/services',{headers:ownerAuth,data:{office_id:office,service:input,reason:'Fictício'}});expect(created.status()).toBe(201);const {id}=(await created.json()).data;
  expect((await request.post(`/api/services/${id}/versions`,{headers:workerAuth,data:{office_id:office,service:{...input,price_cents:1,approval_required:false},reason:'Tentativa',expected_version:1}})).status()).toBe(403);
  expect((await request.post(`/api/services/${id}/quote`,{headers:workerAuth,data:{office_id:office,quantity:2,adjustment:{kind:'courtesy',value:0,reason:'Tentativa'}}})).status()).toBe(403);
  expect((await request.post(`/api/services/${id}/quote`,{headers:workerAuth,data:{office_id:office,quantity:2,adjustment:{kind:'none',value:0,reason:''}}})).status()).toBe(200);
  expect((await worker.rpc('service_create',{p_office_id:office,p_service:input,p_reason:'Bypass',p_request_id:crypto.randomUUID()})).error?.message).toBe('SERVICES_FORBIDDEN');
  await login(page,'serviceworker');await expect(page.getByRole('button',{name:'Novo serviço',exact:true})).toHaveCount(0);
 }finally{await owner.auth.dispose();await worker.auth.dispose();}
});
