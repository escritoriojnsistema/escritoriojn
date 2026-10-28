import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';

const url=process.env.AUTH_LAB_URL!;
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const password=process.env.AUTH_LAB_PASSWORD!;
const profiles=[{name:'manager',client:false},{name:'delegate',client:false},{name:'worker',client:false},{name:'portalclient',client:true}];
function sql(statement:string){
 const container=process.env.AUTH_LAB_DB_CONTAINER;
 if(!container||!/^jn-auth-lab-[a-f0-9-]+-postgres$/.test(container))throw Error('A mutação exige o banco descartável do laboratório.');
 const env={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
 try{execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-q','-U','postgres','-d','auth_lab'],{env,timeout:10000,stdio:['pipe','ignore','pipe'],input:statement});}
 catch{throw Error('A alteração controlada da fixture local falhou.');}
}
async function submit(page:Page,name='manager',client=false){
 await page.goto(client?'/login-cliente':'/login');
 await page.getByLabel('E-mail',{exact:true}).fill(`${name}@example.test`);
 await page.getByLabel('Senha',{exact:true}).fill(password);
 await page.getByRole('button',{name:client?'Entrar na área do cliente':'Entrar na área da equipe',exact:true}).click();
}
async function sessionPresent(page:Page){return page.evaluate(async()=>{
 const path='/src/features/auth/browser.ts';const {supabase}=await import(path);
 return Boolean((await supabase.auth.getSession()).data.session);
});}

for(const profile of profiles)test(`login direto consulta RPC uma vez e mantém adoção oficial: ${profile.name}`,async({page})=>{
 const counts={password:0,context:0,identity:0,api:0};
 const timing:Record<string,number>={};
 page.on('request',request=>{
  const u=new URL(request.url());
  if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password'){counts.password++;timing.passwordStart=performance.now();}
  if(u.pathname==='/rest/v1/rpc/my_access_context'){counts.context++;timing.contextStart=performance.now();}
  if(u.origin===url&&u.pathname==='/auth/v1/user'){counts.identity++;timing.adoptionStart=performance.now();}
  if(u.pathname==='/api/auth/context')counts.api++;
 });
 page.on('response',response=>{
  const u=new URL(response.url());
  if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password')timing.passwordEnd=performance.now();
  if(u.pathname==='/rest/v1/rpc/my_access_context')timing.contextEnd=performance.now();
  if(u.origin===url&&u.pathname==='/auth/v1/user')timing.adoptionEnd=performance.now();
 });
 // API outage cannot stall the isolated login; later focus/reload still use it.
 const apiContext=(u:URL)=>u.pathname==='/api/auth/context';
 await page.route(apiContext,route=>route.abort('failed'));
 await submit(page,profile.name,profile.client);
 await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 expect(counts).toEqual({password:1,context:1,identity:1,api:0});
 expect(timing.contextStart).toBeGreaterThanOrEqual(timing.passwordEnd);
 expect(timing.adoptionStart).toBeGreaterThanOrEqual(timing.contextEnd);
 console.log('login phases ms',JSON.stringify({profile:profile.name,password:Math.round(timing.passwordEnd-timing.passwordStart),context:Math.round(timing.contextEnd-timing.contextStart),adoption:Math.round(timing.adoptionEnd-timing.adoptionStart),toPanel:Math.round(performance.now()-timing.passwordStart),counts}));
 await page.unroute(apiContext);
 const focus=page.waitForResponse('**/api/auth/context');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect((await focus).status()).toBe(200);
 await page.reload();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 expect(counts.api).toBe(2);
});

const negatives=[
 {name:'sessão vencida',mutate:(uid:string)=>`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE user_id='${uid}';`,restore:(uid:string)=>`UPDATE auth.sessions SET not_after=NULL WHERE user_id='${uid}';`},
 {name:'conta banida',mutate:(uid:string)=>`UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id='${uid}';`,restore:(uid:string)=>`UPDATE auth.users SET banned_until=NULL WHERE id='${uid}';`},
 {name:'e-mail não confirmado',mutate:(uid:string)=>`UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${uid}';`,restore:(uid:string)=>`UPDATE auth.users SET email_confirmed_at=clock_timestamp() WHERE id='${uid}';`},
 {name:'conta excluída',mutate:(uid:string)=>`UPDATE auth.users SET deleted_at=clock_timestamp() WHERE id='${uid}';`,restore:(uid:string)=>`UPDATE auth.users SET deleted_at=NULL WHERE id='${uid}';`},
 {name:'conta anônima',mutate:(uid:string)=>`UPDATE auth.users SET is_anonymous=true WHERE id='${uid}';`,restore:(uid:string)=>`UPDATE auth.users SET is_anonymous=false WHERE id='${uid}';`},
 {name:'perfil inativo',mutate:(uid:string)=>`UPDATE public.profiles SET active=false WHERE id='${uid}';`,restore:(uid:string)=>`UPDATE public.profiles SET active=true WHERE id='${uid}';`},
 {name:'vínculo inativo',mutate:(uid:string)=>`UPDATE public.memberships SET active=false WHERE user_id='${uid}';`,restore:(uid:string)=>`UPDATE public.memberships SET active=true WHERE user_id='${uid}';`},
 {name:'escritório inativo',mutate:()=>`UPDATE public.offices SET active=false WHERE id='${process.env.AUTH_LAB_OFFICE}';`,restore:()=>`UPDATE public.offices SET active=true WHERE id='${process.env.AUTH_LAB_OFFICE}';`},
 {name:'função inativa',mutate:()=>`UPDATE public.roles SET active=false WHERE code='owner';`,restore:()=>`UPDATE public.roles SET active=true WHERE code='owner';`},
 {name:'capacidade inativa',mutate:()=>`UPDATE public.permissions SET active=false WHERE code='foundation.access';`,restore:()=>`UPDATE public.permissions SET active=true WHERE code='foundation.access';`},
 {name:'sessão revogada',mutate:(uid:string)=>`DELETE FROM auth.sessions WHERE user_id='${uid}';`,restore:()=>''},
];
for(const scenario of negatives)test(`RPC e API negam autoridade real após login do provedor: ${scenario.name}`,async({page,request})=>{
 const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data,error}=await sdk.auth.signInWithPassword({email:'manager@example.test',password});
 expect(error).toBeNull();expect(data.session).toBeTruthy();
 const uid=data.user!.id;expect(uid).toMatch(/^[a-f0-9-]{36}$/);
 const original=await sdk.rpc('my_access_context');expect(original.error).toBeNull();expect(original.data).toHaveLength(1);
 let mutated=false;
 await page.route(`${url}/rest/v1/rpc/my_access_context`,async route=>{
  if(route.request().method()==='POST'&&!mutated){sql(scenario.mutate(uid));mutated=true;}
  await route.continue();
 });
 try{
  // Only the real RPC request is held; Auth responses and sessions stay real.
  await submit(page);
  await expect(page.getByRole('alert')).toContainText('Este portal não está disponível para esta conta');
  expect(mutated).toBe(true);expect(await sessionPresent(page)).toBe(false);
  const denied=await sdk.rpc('my_access_context');expect(denied.error).toBeNull();expect(denied.data).toEqual([]);
  const api=await request.get('/api/auth/context?area=team',{headers:{Authorization:`Bearer ${data.session!.access_token}`}});
  expect([401,403]).toContain(api.status());expect((await api.json()).data).toBeUndefined();
 }finally{
  sql(scenario.restore(uid));await sdk.auth.signOut({scope:'local'});await sdk.auth.dispose();
 }
});

test('falha de rede no getUser final recusa adoção mesmo com RPC real autorizada',async({page})=>{
 let contexts=0;page.on('response',response=>{if(new URL(response.url()).pathname==='/rest/v1/rpc/my_access_context'&&response.status()===200)contexts++;});
 await page.route(`${url}/auth/v1/user`,route=>route.abort('failed'));
 await submit(page);
 await expect(page.getByRole('alert')).toContainText('Serviço indisponível');
 expect(contexts).toBe(1);expect(await sessionPresent(page)).toBe(false);
 await expect(page.locator('.operation-layout')).toHaveCount(0);
});

test('getUser final indisponível preserva outra sessão real já verificada',async({page})=>{
 await submit(page,'worker');await expect(page.locator('.operation-role')).toHaveText('Funcionário');
 await page.route(`${url}/auth/v1/user`,route=>route.abort('failed'));
 const adopted=await page.evaluate(async password=>{
  const path='/src/features/auth/portalLogin.ts';const {portalLogin}=await import(path);
  try{await portalLogin('manager@example.test',password,true,null,new AbortController().signal);return true;}catch{return false;}
 },password);
 expect(adopted).toBe(false);await page.unroute(`${url}/auth/v1/user`);
 expect(await page.evaluate(async()=>{
  const path='/src/features/auth/browser.ts';const {supabase}=await import(path);
  return (await supabase.auth.getUser()).data.user?.email==='worker@example.test';
 })).toBe(true);
 await page.reload();await expect(page.locator('.operation-role')).toHaveText('Funcionário');
});

test('RPC atrasada não adota tentativa antiga depois de novo login real',async({page})=>{
 await submit(page,'worker');await expect(page.locator('.operation-role')).toHaveText('Funcionário');
 let held!:()=>void,release!:()=>void,first=true;
 const holding=new Promise<void>(resolve=>{held=resolve;}),pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`${url}/rest/v1/rpc/my_access_context`,async route=>{
  if(route.request().method()==='POST'&&first){first=false;held();await pending;}
  try{await route.continue();}catch{/* The superseded request can already be aborted. */}
 });
 const old=page.evaluate(async password=>{
  const path='/src/features/auth/portalLogin.ts';const {portalLogin}=await import(path);
  try{await portalLogin('manager@example.test',password,true,null,new AbortController().signal);return true;}catch{return false;}
 },password);
 await holding;
 try{
  await page.evaluate(async password=>{
   const path='/src/features/auth/portalLogin.ts';const {portalLogin}=await import(path);
   await portalLogin('delegate@example.test',password,true,null,new AbortController().signal);
  },password);
  await expect(page.locator('.operation-role')).toHaveText('Administrador');
 }finally{release();}
 expect(await old).toBe(false);
 await page.unroute(`${url}/rest/v1/rpc/my_access_context`);
 await page.reload();await expect(page.locator('.operation-role')).toHaveText('Administrador');
});
