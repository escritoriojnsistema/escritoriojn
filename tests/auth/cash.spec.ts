import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import type {CashConfigurationResult,CashDashboard,CashConfigure} from '../../shared/cash';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
async function actor(name:string){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();const session=(await sdk.auth.getSession()).data.session!;return{sdk,headers:{Authorization:`Bearer ${session.access_token}`}};}
async function result<T>(r:{status:()=>number;text:()=>Promise<string>;json:()=>Promise<unknown>},status=200):Promise<T>{expect(r.status(),await r.text()).toBe(status);return ((await r.json()) as {data:T}).data;}
test('cash14 real: A abre100, B vê só próprio, gestor consolida, PIX separado e identidade não vem do payload',async({page,request})=>{
 const owner=await actor('manager'),a=await actor('worker'),b=await actor('serviceworker'),client=await actor('portalclient'),other=await actor('other');
 const restore:{id:string;role_code:string;active:boolean;permissions:string[]}[]=[];
 const post=(who:typeof owner,path:string,body:Record<string,unknown>)=>request.post(`/api/cash/${path}`,{headers:who.headers,data:{office_id:office,...body}});
 try{
  for(const email of ['worker@example.test','serviceworker@example.test']){
   const roster=await owner.sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:email,p_status:'all'});expect(roster.error).toBeNull();const member=roster.data.items[0];restore.push(member);
   expect((await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:member.id,p_role_code:'employee',p_active:true,p_permissions:['foundation.access','cash.read','cash.open'],p_request_id:randomUUID()})).error).toBeNull();
  }
  const configure=async(configuration:CashConfigure)=>result<CashConfigurationResult>(await post(owner,'configure',{configuration,idempotency_key:randomUUID()}));
  const unit=(await configure({kind:'unit',id:null,expected_version:null,name:`Unidade Fictícia ${randomUUID().slice(0,8)}`,active:true})).resource;
  const cash=(await configure({kind:'account',id:null,expected_version:null,unit_id:unit.id,type:'cash',name:'Espécie A/B Fictícia',active:true})).resource;
  const bank=(await configure({kind:'account',id:null,expected_version:null,unit_id:unit.id,type:'digital',name:'Destino Digital Fictício',active:true})).resource;
  const pix=await configure({kind:'payment_method',id:null,expected_version:null,unit_id:unit.id,type:'pix',destination_account_id:bank.id,name:'PIX Manual Fictício',active:true});expect(pix.resource).toMatchObject({type:'pix',destination_account_id:bank.id});
  await page.setViewportSize({width:360,height:640});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('worker@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.goto('/caixa');await page.getByLabel('Fundo inicial (R$)',{exact:true}).fill('100,00');
  const openedResponse=page.waitForResponse('**/api/cash/open');await page.getByRole('button',{name:'Abrir meu caixa',exact:true}).click();const response=await openedResponse,opened=await result<CashDashboard>(response),body=response.request().postDataJSON();expect(opened.sessions).toHaveLength(1);expect(opened.sessions[0]).toMatchObject({is_self:true,opening_cents:10000,numerario_cents:10000,received_cents:0,cash_account_id:cash.id});await expect(page.getByText('Dinheiro em espécie',{exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'Consolidação',exact:true})).toHaveCount(0);expect(await page.locator('.operation-mobile-nav a').count()).toBeLessThanOrEqual(4);
  expect(await result<CashDashboard>(await request.post('/api/cash/open',{headers:a.headers,data:body}))).toEqual(opened);
  const dashboard=(who:typeof owner,scope='own')=>post(who,'dashboard',{scope,page:1,page_size:3});
  expect((await result<CashDashboard>(await dashboard(a))).sessions[0]).toMatchObject({opening_cents:10000,numerario_cents:10000,received_cents:0});expect((await result<CashDashboard>(await dashboard(b))).sessions).toEqual([]);expect((await dashboard(b,'all')).status()).toBe(403);
  expect((await result<CashDashboard>(await dashboard(owner))).sessions).toEqual([]);const all=await result<CashDashboard>(await dashboard(owner,'all'));expect(all.sessions).toHaveLength(1);expect(all.sessions[0].is_self).toBe(false);
  expect((await post(b,'open',{unit_id:unit.id,cash_account_id:cash.id,opening_cents:2000,idempotency_key:randomUUID(),operator_id:opened.sessions[0].id})).status()).toBe(422);
  const bOpened=await result<CashDashboard>(await post(b,'open',{unit_id:unit.id,cash_account_id:cash.id,opening_cents:2000,idempotency_key:randomUUID()}));expect(bOpened.sessions).toHaveLength(1);expect(bOpened.sessions[0]).toMatchObject({is_self:true,opening_cents:2000,numerario_cents:2000});expect(bOpened.sessions[0].id).not.toBe(opened.sessions[0].id);
  expect((await post(a,'open',{unit_id:unit.id,cash_account_id:cash.id,opening_cents:10000,idempotency_key:randomUUID()})).status()).toBe(409);
  for(const who of [client,other]){expect((await dashboard(who)).status()).toBe(403);expect((await post(who,'configuration',{unit_id:null,page:1,page_size:50})).status()).toBe(403);}
  expect((await owner.sdk.schema('private').from('cash_sessions').select('*')).error).not.toBeNull();expect(JSON.stringify(opened)).not.toMatch(/operator_id|session_id|payload_digest|permissions|auth\.users/);
 }finally{
  for(const original of restore)expect((await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:original.id,p_role_code:original.role_code,p_active:original.active,p_permissions:original.permissions,p_request_id:randomUUID()})).error).toBeNull();
  await Promise.all([owner,a,b,client,other].map(who=>who.sdk.auth.dispose()));
 }
});
