import { expect, test } from '@playwright/test';

for (const module of ['customers','team','governance'] as const) test(`401 antigo após renovação repete uma vez com JWT atual sem encerrar sessão: ${module}`,async({page})=>{
  await page.goto('/login');
  await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');
  await page.getByLabel('Senha',{exact:true}).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button',{name:'Entrar na área da equipe'}).click();
  await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  let release!:()=>void,held!:()=>void,calls=0;
  const gate=new Promise<void>(resolve=>{release=resolve;}),holding=new Promise<void>(resolve=>{held=resolve;});
  const pattern=module==='customers'?'**/api/customers/search':module==='team'?'**/api/team?**':'**/api/governance/audit?**';
  await page.route(pattern,async route=>{
    if (++calls===1) {held();await gate;await route.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}});}
    else await route.continue();
  });
  await page.evaluate(({module,office})=>{
    const state=window as typeof window & {renewalResult?:string};
    void (async()=>{
      try {
        const path=`/src/features/${module}/api.ts`;
        const api=await import(path);
        if(module==='customers')await api.customersApi.search({office_id:office,query:'',page:1,size:3});
        else if(module==='team')await api.teamApi.dashboard(office,'members',1,'','all');
        else await api.governanceApi.audit(office,1,3,{});
        state.renewalResult='ok';
      } catch {state.renewalResult='error';}
    })();
  },{module,office:process.env.AUTH_LAB_OFFICE!});
  await holding;
  try {
    expect(await page.evaluate(async()=>{
      const path='/src/features/auth/browser.ts';const {supabase}=await import(path);
      const before=(await supabase.auth.getSession()).data.session;
      const refresh=await supabase.auth.refreshSession();
      return !refresh.error && refresh.data.session.access_token!==before.access_token;
    })).toBe(true);
  } finally {release();}
  await expect.poll(()=>page.evaluate(()=>(window as typeof window & {renewalResult?:string}).renewalResult)).toBe('ok');
  expect(calls).toBe(2);
  await page.reload();
  await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
});
