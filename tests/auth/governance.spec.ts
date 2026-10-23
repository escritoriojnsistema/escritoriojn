import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const office=process.env.AUTH_LAB_OFFICE!,otherOffice=process.env.AUTH_LAB_OTHER_OFFICE!;
async function sdkFor(name:string){const sdk=createClient(process.env.AUTH_LAB_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});const {error}=await sdk.auth.signInWithPassword({email:`${name}@example.test`,password:process.env.AUTH_LAB_PASSWORD!});expect(error).toBeNull();return sdk;}
test('Auth real conecta Equipe → Arquivados → Auditoria → exportação com histórico e restauração inativa',async({page})=>{
 await page.setViewportSize({width:360,height:640});
 await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(process.env.AUTH_LAB_PASSWORD!);await page.getByRole('button',{name:'Entrar na área da equipe'}).click();await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();
 await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('dialog',{name:'Menu de navegação'}).getByRole('link',{name:'Equipe e convites',exact:true}).click();
 await page.getByLabel('Buscar por nome ou e-mail').fill('archiveworker@example.test');await page.getByRole('button',{name:'Buscar',exact:true}).click();await expect(page.getByText('Arquivo de teste',{exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Arquivar acesso de Arquivo de teste'}).click();await expect(page.getByRole('status').filter({hasText:'Acesso arquivado'})).toContainText('Acesso arquivado');
 await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('dialog',{name:'Menu de navegação'}).getByRole('link',{name:'Arquivados',exact:true}).click();await expect(page.getByRole('list',{name:'Referências arquivadas'}).locator('li')).toHaveCount(1);await expect(page.getByText('Arquivo de teste',{exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Restaurar referência',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'O acesso continua inativo'})).toContainText('O acesso continua inativo');
 const sdk=await sdkFor('manager');
 try {
  const {data:roster,error}=await sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'archiveworker@example.test',p_status:'all'});expect(error).toBeNull();expect(roster.items[0].active).toBe(false);expect(roster.items[0].archived).toBe(false);
  const member=roster.items[0];await page.getByRole('button',{name:'Abrir menu'}).click();await page.getByRole('dialog',{name:'Menu de navegação'}).getByRole('link',{name:'Auditoria',exact:true}).click();
  await page.getByRole('button',{name:'Filtros',exact:true}).click();await page.getByRole('combobox',{name:'Ação',exact:true}).selectOption('archives.restored');await page.getByRole('button',{name:'Aplicar filtros'}).click();
  await page.getByRole('button',{name:'Ver evento',exact:true}).first().click();await expect(page.getByText('Gestor de teste',{exact:true})).toBeVisible();await page.getByText('Referências para rastreabilidade',{exact:true}).click();await expect(page.getByText(member.id,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Voltar à lista'}).click();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exporta'}).click();const file=await (await download).path();expect(file).toBeTruthy();const bytes=await readFile(file!);expect(bytes.subarray(0,5).toString()).toBe('%PDF-');const text=execFileSync('pdftotext',[file!,'-'],{encoding:'utf8'});expect(text).toContain(member.id);expect(text).toContain('Referência restaurada');const protocol=/JN-AUD-[a-f0-9-]{36}/.exec(text)![0];await page.getByRole('button',{name:'Relatórios e prazo'}).click();await page.getByLabel('Protocolo do relatório').fill(protocol);await page.getByLabel('Arquivo PDF').setInputFiles(file!);await page.getByRole('button',{name:'Verificar PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Integridade confirmada'})).toBeVisible();const verify=await page.request.post('/api/governance/audit/verify',{headers:{Authorization:`Bearer ${(await sdk.auth.getSession()).data.session!.access_token}`},data:{office_id:office,report_id:protocol.slice(7),sha256:createHash('sha256').update(Buffer.concat([bytes,Buffer.from('alterado')])).digest('hex')}});expect(verify.status()).toBe(200);expect((await verify.json()).data.match).toBe(false);
  const {data:history,error:historyError}=await sdk.rpc('audit_page',{p_office_id:office,p_page:1,p_size:5,p_action:'audit.exported',p_actor:null,p_from:null,p_until:null});expect(historyError).toBeNull();expect(history.total).toBeGreaterThan(0);
 }finally{await sdk.auth.signOut({scope:'local'});await sdk.auth.dispose();}
});
test('JWT real: capacidade de exportar separada, revogação imediata, escritórios e cliente isolados',async({request})=>{
 const owner=await sdkFor('manager'),reader=await sdkFor('auditreader'),client=await sdkFor('portalclient'),other=await sdkFor('other');
 const header=async(sdk:typeof owner)=>({Authorization:`Bearer ${(await sdk.auth.getSession()).data.session!.access_token}`});
 try {
  const readerHeaders=await header(reader);
  expect((await request.get(`/api/governance/audit?office_id=${office}`,{headers:readerHeaders})).status()).toBe(200);
  expect((await request.post('/api/governance/audit/export',{headers:readerHeaders,data:{office_id:office,action:'',actor_id:'',from:'',until:''}})).status()).toBe(403);
  expect((await reader.from('audit_events').select('*')).error).not.toBeNull();
  expect((await request.get(`/api/governance/audit?office_id=${otherOffice}`,{headers:readerHeaders})).status()).toBe(403);
  expect((await request.get(`/api/governance/audit?office_id=${office}`,{headers:await header(other)})).status()).toBe(403);
  for(const endpoint of ['audit','archives'])expect((await request.get(`/api/governance/${endpoint}?office_id=${office}`,{headers:await header(client)})).status()).toBe(403);
  const {data:roster}=await owner.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'auditreader@example.test',p_status:'all'});
  const {error}=await owner.rpc('team_set_member',{p_office_id:office,p_membership_id:roster.items[0].id,p_role_code:'employee',p_active:true,p_permissions:['foundation.access'],p_request_id:crypto.randomUUID()});expect(error).toBeNull();
  expect((await request.get(`/api/governance/audit?office_id=${office}`,{headers:readerHeaders})).status()).toBe(403);
 }finally{for(const sdk of [owner,reader,client,other]){await sdk.auth.signOut({scope:'local'});await sdk.auth.dispose();}}
});
