import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { CustomerDetail, CustomerPage } from '../../shared/customers';

const office = process.env.AUTH_LAB_OFFICE!;
const password = process.env.AUTH_LAB_PASSWORD!;

async function signup(page: Page, email: string, name: string) {
  await page.goto('/cadastro');
  await page.getByLabel('Nome',{exact:true}).fill(name);
  await page.getByLabel('E-mail',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Criar conta de cliente'}).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');
}
async function confirm(page: Page, email: string) {
  const mail = process.env.AUTH_LAB_MAIL_URL!;
  const list = await (await fetch(`${mail}/api/v1/messages`)).json();
  const message = list.messages.find((m:{To:{Address:string}[]})=>m.To.some(t=>t.Address===email));
  expect(message).toBeTruthy();
  const detail = await (await fetch(`${mail}/api/v1/message/${message.ID}`)).json();
  const link = String(detail.HTML).match(/href="([^"]+)"/)?.[1].replaceAll('&amp;','&');
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
}
async function staff() {
  const sdk = createClient(process.env.AUTH_LAB_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  expect((await sdk.auth.signInWithPassword({email:'manager@example.test',password})).error).toBeNull();
  return sdk;
}

test('cadastro público confirmado já é ficha reutilizável sem conceder acervo ou permissão administrativa',async({page,request})=>{
  const sdk = await staff();
  try {
    const email = 'registered-new@example.test', name = 'Cliente Portal Novo';
    await signup(page,email,name);
    const before = await sdk.rpc('customers_page',{p_office_id:office,p_query:name,p_page:1,p_size:5});
    expect(before.error).toBeNull();expect(before.data.total).toBe(0);
    await confirm(page,email);
    const {data,error} = await sdk.rpc('customers_page',{p_office_id:office,p_query:name,p_page:1,p_size:5});
    expect(error).toBeNull();expect(data.total).toBe(1);
    const summary = (data as CustomerPage).items[0];
    expect(summary).toMatchObject({source:'client_registration',association_status:'pending',identifier_masked:null});
    const detail = await sdk.rpc('customer_detail',{p_office_id:office,p_customer_id:summary.id});
    expect(detail.error).toBeNull();
    expect(detail.data).toMatchObject({name,materialized:true,can_update:true,contacts:[{kind:'email',value:email}],association_status:'pending'});
    const token = await page.evaluate(()=>{const v=Object.entries(localStorage).find(([k])=>k.endsWith('-auth-token'));return v ? JSON.parse(v[1]).access_token : '';});
    expect((await request.post('/api/customers/search',{headers:{Authorization:`Bearer ${token}`},data:{office_id:office,query:name,page:1,size:3}})).status()).toBe(403);
    await page.reload();
    const again = await sdk.rpc('customers_page',{p_office_id:office,p_query:name,p_page:1,p_size:5});
    expect(again.data.total).toBe(1);expect(again.data.items[0].id).toBe(summary.id);
  } finally { await sdk.auth.signOut({scope:'local'});await sdk.auth.dispose(); }
});

test('cadastro interno anterior conserva ficha e exige conferência, sem duplicar ficha nem associar por email',async({page})=>{
  const sdk = await staff();
  try {
    const email = 'registered-existing@example.test', name = 'Nome Declarado no Portal';
    const created = await sdk.rpc('customer_create',{p_office_id:office,p_customer:{kind:'person',name:'Ficha Interna Anterior',identifier:'',contacts:[{kind:'email',value:email}]},p_request_id:crypto.randomUUID()});
    expect(created.error).toBeNull();const original = created.data as CustomerDetail;
    await signup(page,email,name);await confirm(page,email);
    const pending = await sdk.rpc('customers_page',{p_office_id:office,p_query:name,p_page:1,p_size:5});
    expect(pending.error).toBeNull();expect(pending.data.total).toBe(1);
    const entry = pending.data.items[0];expect(entry.id).not.toBe(original.id);
    const detail = await sdk.rpc('customer_detail',{p_office_id:office,p_customer_id:entry.id});
    expect(detail.error).toBeNull();
    expect(detail.data).toMatchObject({name,materialized:false,can_update:false,association_status:'pending',contacts:[{kind:'email',value:email}]});
    expect(detail.data).not.toHaveProperty('candidate_customer_id');
    const old = await sdk.rpc('customer_detail',{p_office_id:office,p_customer_id:original.id});
    expect(old.data).toMatchObject({id:original.id,name:'Ficha Interna Anterior',version:1});
    // The verified SDK/Bearer path also exercises the API DTO and private POST transport.
    await page.getByRole('button',{name:'Sair da conta'}).click();
    await page.goto('/login');
    await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');
    await page.getByLabel('Senha',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Entrar na área da equipe'}).click();
    await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
    await page.goto('/clientes');
    await page.getByLabel('Buscar por nome, CPF ou CNPJ').fill(name);
    await page.getByRole('button',{name:'Buscar',exact:true}).click();
    await page.getByRole('button',{name:`Ver ficha de ${name}`,exact:true}).click();
    await expect(page.getByRole('note')).toContainText('a associação depende de conferência');
    await expect(page.getByRole('button',{name:'Editar cliente',exact:true})).toHaveCount(0);
    await expect(page.getByRole('region',{name:'Dados da ficha'})).toContainText(email);
  } finally { await sdk.auth.signOut({scope:'local'});await sdk.auth.dispose(); }
});
