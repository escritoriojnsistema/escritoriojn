import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {emptyService} from '../../shared/services';
import type {ChargeView} from '../../shared/charges';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
async function actor(name:string){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();const {data}=await sdk.auth.getSession();return {sdk,headers:{Authorization:`Bearer ${data.session!.access_token}`}};}
async function result<T>(r:{status:()=>number;text:()=>Promise<string>;json:()=>Promise<unknown>},status=200):Promise<T>{expect(r.status(),await r.text()).toBe(status);return ((await r.json()) as {data:T}).data;}
test('cobranças13 reais: navegador→API→RPC→banco, 60+40 aberto, ajuste e cancelamento com histórico',async({page,request})=>{
 const owner=await actor('manager'),portal=await actor('portalclient'),other=await actor('other');
 try{
  const services:string[]=[];
  for(const price of [6000,4000]){
   const service=await result<{id:string}>(await request.post('/api/services',{headers:owner.headers,data:{office_id:office,service:{...emptyService,code:`C13-${randomUUID().slice(0,8).toUpperCase()}`,name:`Servico ficticio ${price/100}`,category:'Teste local13',price_cents:price},reason:'Laboratorio financeiro13'}}),201);services.push(service.id);
  }
  const own=await result<{id:string;protocol:string;version:number}>(await request.post('/api/requests',{headers:owner.headers,data:{office_id:office,idempotency_key:randomUUID(),request:{origin:'presencial',title:'Cobranca13 integrada ficticia',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'Nota privada13',items:services.map(service_id=>({service_id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}))}}}),201);
  const view=()=>request.post('/api/charges/view',{headers:owner.headers,data:{office_id:office,request_id:own.id,history_page:1}});
  expect((await result<ChargeView>(await view())).charge).toBeNull();
  await page.setViewportSize({width:360,height:640});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.goto('/cobrancas');await page.getByRole('searchbox',{name:'Buscar solicitação'}).fill(own.protocol);await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:`Escolher solicitação ${own.protocol}`}).click();
  await expect(page.getByText('Total dos itens:')).toBeVisible();
  const createdResponse=page.waitForResponse('**/api/charges/create');await page.getByRole('button',{name:'Registrar cobrança',exact:true}).click();const created=await result<ChargeView>(await createdResponse);expect(created.charge).toMatchObject({status:'aberta',original_cents:10000,due_cents:10000,balance_cents:10000,allocated_cents:0,version:1});
  await expect(page.getByText('Saldo em aberto',{exact:true})).toBeVisible();await expect(page.locator('.operation-mobile-nav a')).toHaveCount(4);
  const createBody={office_id:office,request_id:own.id,installments:[{due_date:'2026-11-01',amount_cents:10000}],idempotency_key:randomUUID()};
  expect((await request.post('/api/charges/create',{headers:owner.headers,data:createBody})).status()).toBe(409);
  const adjust={office_id:office,charge_id:created.charge!.id,expected_version:1,mutation:{kind:'adjust',delta_cents:-1000,reason:'Desconto autorizado ficticio',installments:[{due_date:'2026-11-01',amount_cents:9000}]},idempotency_key:randomUUID()};
  const adjusted=await result<ChargeView>(await request.post('/api/charges/mutate',{headers:owner.headers,data:adjust}));expect(adjusted.charge).toMatchObject({due_cents:9000,balance_cents:9000,original_cents:10000,history_total:2});
  expect(await result<ChargeView>(await request.post('/api/charges/mutate',{headers:owner.headers,data:adjust}))).toEqual(adjusted);
  const cancelled=await result<ChargeView>(await request.post('/api/charges/mutate',{headers:owner.headers,data:{office_id:office,charge_id:created.charge!.id,expected_version:2,mutation:{kind:'cancel',reason:'Cancelamento autorizado ficticio'},idempotency_key:randomUUID()}}));expect(cancelled.charge).toMatchObject({status:'cancelada',balance_cents:0,due_cents:0,allocated_cents:0,history_total:3,installments:[]});
  expect((await result<ChargeView>(await view())).charge?.history).toHaveLength(3);
  for(const a of [portal,other])expect((await request.post('/api/charges/view',{headers:a.headers,data:{office_id:office,request_id:own.id,history_page:1}})).status()).toBe(403);
  expect((await owner.sdk.schema('private').from('charge_events').select('*')).error).not.toBeNull();
  expect(JSON.stringify(created)).not.toMatch(/Nota privada13|participant_ids|fields/);
 }finally{await Promise.all([owner,portal,other].map(a=>a.sdk.auth.dispose()));}
});
