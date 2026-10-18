import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const password=process.env.AUTH_LAB_PASSWORD!,office=process.env.AUTH_LAB_OFFICE!;
const cpf='52998224725';
async function login(page:Page,name='manager') {
  await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill(`${name}@example.test`);
  await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe'}).click();
  await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();
}
async function sdkFor(name='manager') {
  const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await sdk.auth.signInWithPassword({email:`${name}@example.test`,password});expect(error).toBeNull();return sdk;
}
async function mailLink(email:string) {
  for(let i=0;i<40;i++) {
    const list=await (await fetch(`${process.env.AUTH_LAB_MAIL_URL}/api/v1/messages`)).json();
    const message=list.messages?.find((m:{To:{Address:string}[]})=>m.To.some(t=>t.Address===email));
    if(message) {const detail=await (await fetch(`${process.env.AUTH_LAB_MAIL_URL}/api/v1/message/${message.ID}`)).json();const match=String(detail.HTML).match(/href="([^"]+)"/);if(match)return match[1].replaceAll('&amp;','&');}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Expected local invitation SMTP message was not delivered.');
}
async function token(page:Page) {
  return page.evaluate(async()=>{const path='/src/features/auth/browser.ts';const {supabase}=await import(path);return (await supabase.auth.getSession()).data.session?.access_token??'';});
}
test('convite novo percorre SMTP, identidade, senha, aceite e desativação com JWT antigo',async({page,browser,request})=>{
  await login(page);await page.getByRole('navigation',{name:'Navegação da operação'}).getByRole('link',{name:'Equipe e convites',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Equipe e convites'})).toBeVisible();
  await page.getByRole('button',{name:'Novo convite',exact:true}).click();
  await page.getByLabel('Nome completo',{exact:true}).fill('Pessoa Nova Fictícia');
  await page.getByLabel('E-mail',{exact:true}).fill('newstaff@example.test');await page.getByLabel('CPF',{exact:true}).fill(cpf);
  const createdPromise=page.waitForResponse(r=>r.url().endsWith('/api/team/invitations')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Criar e enviar convite'}).click();
  const created=await createdPromise;expect(created.status()).toBe(201);const invite=(await created.json()).data;
  expect(invite.delivery).toBe('sent');await expect(page.getByRole('status').filter({hasText:'E-mail de convite enviado.'})).toBeVisible();
  const isolated=await browser.newContext();
  try {
    const recipient=await isolated.newPage();await recipient.goto(await mailLink('newstaff@example.test'));
    await expect(recipient).toHaveURL(new RegExp(`/convite\\?id=${invite.id}$`));expect(new URL(recipient.url()).hash).toBe('');
    await expect(recipient.getByLabel('Nome completo',{exact:true})).toBeVisible();await expect(recipient.getByLabel('Nova senha',{exact:true})).toHaveCount(0);
    const bearer=await token(recipient);
    const early=await request.post(`/api/team/invitations/${invite.id}/accept`,{headers:{Authorization:`Bearer ${bearer}`},data:{}});expect(early.status()).toBe(403);
    await recipient.getByLabel('Nome completo',{exact:true}).fill('Pessoa Incorreta Fictícia');await recipient.getByLabel('CPF',{exact:true}).fill(cpf);
    await recipient.getByRole('button',{name:'Conferir dados'}).click();await expect(recipient.getByRole('alert')).toContainText('Não foi possível conferir');
    await recipient.getByLabel('Nome completo',{exact:true}).fill('Pessoa Nova Fictícia');await recipient.getByRole('button',{name:'Conferir dados'}).click();
    await expect(recipient.getByLabel('Nova senha',{exact:true})).toBeVisible();await recipient.reload();await expect(recipient.getByLabel('Nova senha',{exact:true})).toBeVisible();
    await recipient.getByLabel('Nova senha',{exact:true}).fill(password);await recipient.getByLabel('Confirmar nova senha',{exact:true}).fill(password);
    await recipient.getByRole('button',{name:'Aceitar convite e entrar'}).click();await expect(recipient.getByRole('heading',{name:'Área de operação'})).toBeVisible();
    await expect(recipient.getByRole('link',{name:'Equipe e convites'})).toHaveCount(0);
    const oldToken=await token(recipient);
    expect((await request.post(`/api/team/invitations/${invite.id}/accept`,{headers:{Authorization:`Bearer ${oldToken}`},data:{}})).status()).toBe(410);
    const manager=await sdkFor();const {data:dashboard,error}=await manager.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'newstaff@example.test',p_status:'all'});expect(error).toBeNull();
    const member=dashboard.items[0];expect(member.cpf_masked).toBe('***.***.***-25');expect(JSON.stringify(dashboard)).not.toContain(cpf);
    const {error:deactivated}=await manager.rpc('team_set_member',{p_office_id:office,p_membership_id:member.id,p_role_code:'employee',p_active:false,p_permissions:['foundation.access'],p_request_id:crypto.randomUUID()});expect(deactivated).toBeNull();
    expect((await request.get('/api/auth/context',{headers:{Authorization:`Bearer ${oldToken}`}})).status()).toBe(403);
    await recipient.reload();await expect(recipient.getByRole('heading',{name:'Acesso não autorizado'})).toBeVisible();
    await manager.auth.signOut({scope:'local'});
  } finally {await isolated.close();}
});
test('conta existente recebe link SMTP e pode manter senha após conferência',async({page,request})=>{
  const sdk=await sdkFor();const {data:created,error}=await sdk.rpc('team_create_invitation',{p_office_id:office,p_email:'existingstaff@example.test',p_full_name:'Pessoa Existente Fictícia',p_cpf:cpf,p_role_code:'employee',p_permissions:['foundation.access'],p_expires_at:new Date(Date.now()+86400000).toISOString(),p_request_id:crypto.randomUUID()});expect(error).toBeNull();
  const managerToken=(await sdk.auth.getSession()).data.session!.access_token;
  const sent=await request.post(`/api/team/invitations/${created.id}/send`,{headers:{Authorization:`Bearer ${managerToken}`},data:{office_id:office}});expect(sent.status()).toBe(200);expect((await sent.json()).data.delivery).toBe('sent');
  await page.goto(await mailLink('existingstaff@example.test'));await expect(page.getByLabel('Nome completo',{exact:true})).toBeVisible();
  await page.getByLabel('Nome completo',{exact:true}).fill('Pessoa Existente Fictícia');await page.getByLabel('CPF',{exact:true}).fill(cpf);await page.getByRole('button',{name:'Conferir dados'}).click();
  await expect(page.getByLabel('Manter minha senha atual')).toBeChecked();await expect(page.getByLabel('Nova senha',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Aceitar convite e entrar'}).click();await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();await sdk.auth.signOut({scope:'local'});
});
test('delegação limita administrador e revogação vale com o mesmo token',async({request})=>{
  const owner=await sdkFor(),admin=await sdkFor('delegate'),employee=await sdkFor('worker');
  const {data:roster,error}=await owner.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'delegate@example.test',p_status:'all'});expect(error).toBeNull();
  const member=roster.items[0];
  const {data:delegation,error:grantError}=await owner.rpc('team_set_delegation',{p_office_id:office,p_membership_id:member.id,p_allowed_roles:['employee'],p_allowed_permissions:['foundation.access'],p_can_create_owner:false,p_expires_at:new Date(Date.now()+86400000).toISOString(),p_request_id:crypto.randomUUID()});expect(grantError).toBeNull();
  const adminToken=(await admin.auth.getSession()).data.session!.access_token;
  const employeeToken=(await employee.auth.getSession()).data.session!.access_token;
  const body={office_id:office,email:'scope@example.test',full_name:'Pessoa Escopo Fictícia',cpf,role_code:'admin',permissions:['foundation.access'],expires_at:new Date(Date.now()+86400000).toISOString()};
  for(const [value,role] of [[adminToken,'admin'],[adminToken,'owner'],[employeeToken,'employee']]) {
    const denied=await request.post('/api/team/invitations',{headers:{Authorization:`Bearer ${value}`},data:{...body,role_code:role}});expect(denied.status()).toBe(403);
  }
  expect((await request.get(`/api/team?office_id=${office}`,{headers:{Authorization:`Bearer ${adminToken}`}})).status()).toBe(200);
  const {error:revoke}=await owner.rpc('team_revoke_delegation',{p_office_id:office,p_delegation_id:delegation.id,p_request_id:crypto.randomUUID()});expect(revoke).toBeNull();
  expect((await request.get(`/api/team?office_id=${office}`,{headers:{Authorization:`Bearer ${adminToken}`}})).status()).toBe(403);
  await Promise.all([owner,admin,employee].map(sdk=>sdk.auth.signOut({scope:'local'})));
});
test('login preserva somente destino interno de convite UUID',async({page})=>{
  const id='00000000-0000-4000-a000-000000000002';
  await page.goto(`/login?invite=${id}`);await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe'}).click();
  await expect(page).toHaveURL(`/convite?id=${id}`);await expect(page.getByRole('alert')).toContainText('convite não está disponível');
});
