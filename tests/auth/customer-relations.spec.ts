import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { CustomerRelationsState } from '../../shared/customerRelations';
const office=process.env.AUTH_LAB_OFFICE!, password=process.env.AUTH_LAB_PASSWORD!;
async function sdkFor(name:string){ const sdk=createClient(process.env.AUTH_LAB_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();return sdk; }
async function headers(sdk:Awaited<ReturnType<typeof sdkFor>>) { return {Authorization:`Bearer ${(await sdk.auth.getSession()).data.session!.access_token}`}; }
async function login(page:Page,name='manager') { await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(`${name}@example.test`);await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe'}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible(); }
async function open(page:Page,name:string){await page.goto('/clientes');await page.getByLabel('Buscar por nome, CPF ou CNPJ').fill(name);await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:`Ver ficha de ${name}`,exact:true}).click();await page.getByRole('button',{name:'Vínculos',exact:true}).click();}
async function pick(page:Page,query:string){await page.getByLabel('Buscar pessoa').fill(query);await page.getByRole('button',{name:'Buscar candidatos'}).click();const select=page.getByLabel('Selecionar pessoa');await expect(select.locator('option')).toHaveCount(2);await select.selectOption({index:1});}
async function create(request:APIRequestContext,auth:Record<string,string>,name:string){const r=await request.post('/api/customers',{headers:auth,data:{office_id:office,customer:{kind:'person',name,identifier:'',contacts:[]}}});expect(r.status()).toBe(201);return(await r.json()).data;}
async function command(request:APIRequestContext,auth:Record<string,string>,id:string,action:string,payload:unknown){return request.post('/api/customer-relations/command',{headers:auth,data:{office_id:office,customer_id:id,action,payload}});}

for(const legacy of [
 {account:'relationclientnull',kind:'client',label:'Nome não informado'},
 {account:'relationclientcontrol',kind:'client',label:'Ana Silva'},
 {account:'relationclientspace',kind:'client',label:'Nome não informado'},
 {account:'relationteamnull',kind:'team',label:'Nome não informado'},
 {account:'relationteamcontrol',kind:'team',label:'João Silva'},
] as const)test(`relações reais: nome legado ${legacy.account} em candidatos, comando e histórico`,async({page,request})=>{
 test.setTimeout(90_000);const owner=await sdkFor('manager');
 try{
  const auth=await headers(owner),contact=`${legacy.account}@example.test`,customer=await create(request,auth,`R08 Legado ${legacy.account}`);
  // The real RPC proves the projection separately from the Express decoder.
  const projection=await owner.rpc('customer_relation_candidates',{p_office_id:office,p_kind:legacy.kind,p_query:contact});expect(projection.error).toBeNull();expect.soft(projection.data.items[0]).toMatchObject({name:legacy.label,contact_masked:'r***@***'});
  await login(page);await open(page,customer.name);await page.getByRole('button',{name:legacy.kind==='client'?'Identidade 0 registros':'Acesso operacional 0 registros'}).click();await page.getByRole('button',{name:legacy.kind==='client'?'Conferir identidade':'Adicionar vínculo'}).click();
  // A broad search must survive every legacy profile in the collection.
  const broad=page.waitForResponse('**/api/customer-relations/candidates');await page.getByRole('button',{name:'Buscar candidatos'}).click();const broadResponse=await broad;expect(broadResponse.status()).toBe(200);const broadData=(await broadResponse.json()).data;expect(broadData.items).toContainEqual(projection.data.items[0]);expect(JSON.stringify(broadData)).not.toContain('@example.test');
  await page.getByLabel('Buscar pessoa').fill(contact);const found=page.waitForResponse('**/api/customer-relations/candidates');await page.getByRole('button',{name:'Buscar candidatos'}).click();const candidates=await found;expect(candidates.status()).toBe(200);const items=(await candidates.json()).data.items;expect(items).toHaveLength(1);expect(items[0]).toMatchObject({name:legacy.label,contact_masked:'r***@***'});expect(JSON.stringify(items)).not.toContain(contact);await page.getByLabel('Selecionar pessoa').selectOption(items[0].id);
  if(legacy.kind==='client')await page.getByLabel('Referência da conferência').fill('REF-R08-LEGADO');
  const saved=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:legacy.kind==='client'?'Confirmar conferência':'Salvar vínculo'}).click();const response=await saved;expect(response.status()).toBe(200);const collection=legacy.kind==='client'?'identities':'assignments',state=(await response.json()).data;expect(state[collection][0]).toMatchObject({name:legacy.label,membership_id:items[0].id});expect(JSON.stringify(state)).not.toContain(contact);await expect(page.getByRole('status')).toContainText('Vínculo atualizado');
  const list=page.getByRole('list',{name:legacy.kind==='client'?'Identidade':'Acesso operacional'});await expect(list).toContainText(legacy.label);await page.getByRole('button',{name:`Revogar vínculo de ${legacy.label}`}).click();const revoked=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:'Confirmar revogação'}).click();const revokeResponse=await revoked;expect(revokeResponse.status()).toBe(200);expect((await revokeResponse.json()).data[collection][0]).toMatchObject({name:legacy.label,status:'revoked'});
  const read=await request.post('/api/customer-relations/state',{headers:auth,data:{office_id:office,customer_id:customer.id}});expect(read.status()).toBe(200);const history=(await read.json()).data;expect(history[collection][0]).toMatchObject({name:legacy.label,status:'revoked'});expect(JSON.stringify(history)).not.toContain(contact);
 }finally{await owner.auth.dispose();}
});

test('relações reais: UI atribui, funcionário lê e autorrevogação retorna à lista',async({page,request})=>{
 test.setTimeout(90_000);const owner=await sdkFor('manager'),worker=await sdkFor('relationworker');
 try{const auth=await headers(owner),workerAuth=await headers(worker);const customer=await create(request,auth,'R08 Acesso Local');
 expect((await request.post(`/api/customers/${customer.id}/detail`,{headers:workerAuth,data:{office_id:office}})).status()).toBe(404);
 await page.setViewportSize({width:360,height:640});await login(page);await open(page,customer.name);await page.getByRole('button',{name:'Acesso operacional 0 registros'}).click();await page.getByRole('button',{name:'Adicionar vínculo'}).click();await pick(page,'Funcionário relações');
 const granted=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:'Salvar vínculo'}).click();expect((await granted).status()).toBe(200);await expect(page.getByRole('list',{name:'Acesso operacional'})).toContainText('Vigente');
 expect((await request.post(`/api/customers/${customer.id}/detail`,{headers:workerAuth,data:{office_id:office}})).status()).toBe(200);
 const workerContext=await page.context().browser()!.newContext();const workerPage=await workerContext.newPage();
 try{await login(workerPage,'relationworker');await open(workerPage,customer.name);await workerPage.getByRole('button',{name:'Acesso operacional 1 registros'}).click();await workerPage.getByRole('button',{name:'Revogar vínculo de Funcionário relações'}).click();const revoked=workerPage.waitForResponse('**/api/customer-relations/command');await workerPage.getByRole('button',{name:'Confirmar revogação'}).click();const response=await revoked;expect(response.status()).toBe(200);expect((await response.json()).data).toMatchObject({access_lost:true,assignments:[]});await expect(workerPage.getByRole('list',{name:'Clientes do escritório'})).toHaveCount(0);await expect(workerPage.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();await expect(workerPage.getByRole('region',{name:'Vínculos do cliente'})).toHaveCount(0);}finally{await workerContext.close();}
 expect((await request.post(`/api/customers/${customer.id}/detail`,{headers:workerAuth,data:{office_id:office}})).status()).toBe(404);
 }finally{await owner.auth.dispose();await worker.auth.dispose();}
});

test('relações reais: representante vigente, expirado e revogado; identidade humana e colisão sem portal',async({page,request})=>{
 test.setTimeout(90_000);const owner=await sdkFor('manager'),client=await sdkFor('relationclient');
 try{const auth=await headers(owner);const customer=await create(request,auth,'R08 Conferência Local'),representative=await create(request,auth,'R08 Representante Local'),collision=await create(request,auth,'R08 Colisão Local');
 await login(page);await open(page,customer.name);await page.getByRole('button',{name:'Representantes 0 registros'}).click();await page.getByRole('button',{name:'Adicionar vínculo'}).click();await pick(page,representative.name);await page.getByLabel('Referência da conferência').fill('REF-R08-PROC');
 const grant=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:'Salvar vínculo'}).click();const granted=(await(await grant).json()).data as CustomerRelationsState;expect(granted.representations[0]).toMatchObject({authorization_status:'valid',grants_customer_access:false,portal_enabled:false});
 await page.getByRole('button',{name:`Revogar vínculo de ${representative.name}`}).click();const revoke=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:'Confirmar revogação'}).click();expect((await(await revoke).json()).data.representations[0]).toMatchObject({status:'revoked',authorization_status:'invalid'});
 const expired=await command(request,auth,customer.id,'representation.grant',{representative_customer_id:representative.id,kind:'guardian',evidence:'REF-R08-EXP',valid_from:'2020-01-01T00:00:00Z',valid_until:'2021-01-01T00:00:00Z'});expect(expired.status()).toBe(200);expect((await expired.json()).data.representations[0]).toMatchObject({status:'expired',authorization_status:'invalid',portal_enabled:false});
 await page.getByRole('button',{name:'Vínculos',exact:true}).click();await page.getByRole('button',{name:'Identidade 0 registros'}).click();await page.getByRole('button',{name:'Conferir identidade'}).click();await pick(page,'Cliente relações');await page.getByLabel('Referência da conferência').fill('REF-R08-ID');
 const verified=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:'Confirmar conferência'}).click();const identity=(await(await verified).json()).data.identities[0];expect(identity).toMatchObject({status:'verified',portal_enabled:false,evidence:'REF-R08-ID'});await page.getByText('Autor e data da decisão').click();await expect(page.getByRole('list',{name:'Identidade'})).toContainText(identity.created_by);
 const duplicate=await command(request,auth,collision.id,'identity.verify',{membership_id:identity.membership_id,evidence:'REF-R08-COLLISION'});expect(duplicate.status()).toBe(409);
 expect((await request.post(`/api/customers/${customer.id}/detail`,{headers:await headers(client),data:{office_id:office}})).status()).toBe(403);
 await page.getByRole('button',{name:'Revogar vínculo de Cliente relações'}).click();const revoked=page.waitForResponse('**/api/customer-relations/command');await page.getByRole('button',{name:'Confirmar revogação'}).click();expect((await(await revoked).json()).data.identities[0].status).toBe('revoked');await expect(page.getByRole('list',{name:'Identidade'})).toContainText('Revogado');
 }finally{await owner.auth.dispose();await client.auth.dispose();}
});

test('relações reais: prévia, confirmação e histórico preservam origem e não transferem direitos',async({page,request})=>{
 test.setTimeout(90_000);const owner=await sdkFor('manager'),worker=await sdkFor('relationworker');
 try{const auth=await headers(owner);const source=await create(request,auth,'R08 Origem Mesclada'),target=await create(request,auth,'R08 Destino Mesclado');const candidates=await request.post('/api/customer-relations/candidates',{headers:auth,data:{office_id:office,kind:'team',query:'Funcionário relações'}});const membership=(await candidates.json()).data.items[0].id;expect((await command(request,auth,source.id,'assignment.grant',{membership_id:membership,valid_from:'2020-01-01T00:00:00Z',valid_until:null})).status()).toBe(200);
 await login(page);await open(page,source.name);await page.getByRole('button',{name:'Duplicidades 0 registros'}).click();await page.getByRole('button',{name:'Revisar duplicidade'}).click();await pick(page,target.name);const previewed=page.waitForResponse('**/api/customer-relations/merge/preview');await page.getByRole('button',{name:'Ver prévia da mesclagem'}).click();const preview=(await(await previewed).json()).data;expect(preview.expected.transfers_authority).toBe(false);await page.getByLabel('Referência da conferência').fill('REF-R08-MERGE');const merged=page.waitForResponse('**/api/customer-relations/merge');await page.getByRole('button',{name:'Confirmar mesclagem'}).click();const response=await merged;expect(response.status()).toBe(200);const result=(await response.json()).data;expect(result.state.assignments).toEqual([]);expect(result.state.merges[0]).toMatchObject({source_id:source.id,target_id:target.id});expect(result.state.merges[0].source_snapshot_id).toBeTruthy();await expect(page.getByRole('list',{name:'Duplicidades'})).toContainText(source.id);await expect(page.getByRole('status')).toContainText('Mesclagem concluída');
 expect((await request.post(`/api/customers/${source.id}/detail`,{headers:auth,data:{office_id:office}})).status()).toBe(404);
 for(const id of [source.id,target.id])expect((await request.post(`/api/customers/${id}/detail`,{headers:await headers(worker),data:{office_id:office}})).status()).toBe(404);
 const stale=await request.post('/api/customer-relations/merge',{headers:auth,data:{office_id:office,source_id:source.id,target_id:target.id,source_version:preview.source.version,target_version:preview.target.version,evidence:'REF-STALE',confirm:true}});expect(stale.status()).toBe(404);
 }finally{await owner.auth.dispose();await worker.auth.dispose();}
});

test('relações reais: resposta confirmada da sessão anterior não reaparece na nova conta',async({page,request})=>{
 test.setTimeout(90_000);const owner=await sdkFor('manager');
 try{const auth=await headers(owner);const customer=await create(request,auth,'R08 Troca de Sessão');await login(page);await open(page,customer.name);await page.getByRole('button',{name:'Acesso operacional 0 registros'}).click();await page.getByRole('button',{name:'Adicionar vínculo'}).click();await pick(page,'Funcionário relações');
 let release!:()=>void,confirmed!:()=>void;const held=new Promise<void>(r=>release=r),committed=new Promise<void>(r=>confirmed=r);
 await page.route('**/api/customer-relations/command',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);confirmed();await held;try{await route.fulfill({response});}catch{/* old browser session canceled */}});
 await page.getByRole('button',{name:'Salvar vínculo'}).click();await committed;
 try{expect(await page.evaluate(async password=>{const modulePath='/src/features/auth/browser.ts';const {supabase}=await import(modulePath);await supabase.auth.signOut({scope:'local'});return !(await supabase.auth.signInWithPassword({email:'relationworker@example.test',password})).error;},password)).toBe(true);}finally{release();}
 await expect(page.getByRole('region',{name:'Vínculos do cliente'})).toHaveCount(0);await expect(page.getByText('Vínculo atualizado.',{exact:true})).toHaveCount(0);
 // Cancellation protects the screen; it does not pretend to roll back a committed command.
 const persisted=await request.post('/api/customer-relations/state',{headers:auth,data:{office_id:office,customer_id:customer.id}});expect((await persisted.json()).data.assignments).toHaveLength(1);
 }finally{await owner.auth.dispose();}
});
