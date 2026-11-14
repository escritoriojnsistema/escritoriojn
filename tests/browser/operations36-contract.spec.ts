import {test,expect,type Page} from '@playwright/test';
import {defaultOperationsPolicy} from '../../shared/operations36';
test.skip(!process.env.TEAM_UI_CONTRACT,'Local UI contract; real authority verified separately.');
const user='22222222-2222-4222-8222-222222222222',office='11111111-1111-4111-8111-111111111111';
const state={revision:0,policy:null,observed_at:new Date().toISOString(),usage:{customers:4,requests:2,files:1,declared_file_bytes:100},provider_usage:null,production_backup_verified:false};
async function setup(page:Page,role='owner'){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions:role==='client'?[]:['foundation.access','settings.access'],office_name:'Laboratório',display_name:'Fictício'}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/operations/state',r=>r.fulfill({json:{data:state}}));
}
for(const width of [320,390,768,1440])test(`36: configuração posterior, pendências e layout ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 await page.goto('/configuracoes/continuidade');await expect(page.getByRole('heading',{name:'Continuidade',exact:true})).toBeVisible();await expect(page.getByText('Backup de produção ainda não validado.',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Configuração',exact:true}).click();await page.getByLabel('Responsável operacional',{exact:true}).fill('Responsável configurado depois');await page.getByLabel('Teto mensal (centavos)',{exact:true}).fill('10000');
 let saved:any;await page.route('**/api/operations/save',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{data:{...state,revision:1,policy:saved.policy}}});});
 await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();await expect(page.getByRole('status')).toContainText('não executa nem valida');expect(saved.policy.external_folder_id).toBe('');expect(saved.policy.recipient_public_key).toBe('');
 await page.getByLabel('Grupo de configuração',{exact:true}).selectOption('backup');await expect(page.getByLabel('ID da pasta externa no Drive',{exact:true})).toHaveValue('');await expect(page.getByLabel('Meta RPO (horas)',{exact:true})).toHaveValue('24');
 await page.getByRole('tab',{name:'Visão geral',exact:true}).click();await expect(page.getByText('Responsável configurado depois',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);await expect(page.locator('[role=progressbar],.spinner,.loader')).toHaveCount(0);
 await page.screenshot({path:`/workspace/scratch/operations36-${width}.png`,fullPage:true});
 await page.addStyleTag({content:'html{zoom:2}'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
for(const role of ['admin','employee','client'])test(`36: configuração técnica não é concedida a ${role}`,async({page})=>{
 await setup(page,role);let calls=0;await page.route('**/api/operations/state',r=>{calls++;return r.fulfill({json:{data:state}});});await page.goto('/configuracoes/continuidade');await expect(page.getByRole('button',{name:'Salvar configuração'})).toHaveCount(0);expect(calls).toBe(0);
});
test('36:503 mantém chave e corpo exatos, impede logout/rota e não aceita editar tentativa incerta',async({page})=>{
 await setup(page);await page.goto('/configuracoes/continuidade');await page.getByRole('tab',{name:'Configuração',exact:true}).click();await page.getByLabel('Responsável operacional',{exact:true}).fill('Responsável de teste');
 const calls:any[]=[];await page.route('**/api/operations/save',r=>{calls.push(r.request().postDataJSON());return calls.length===1?r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}):r.fulfill({json:{data:{...state,revision:1,policy:{...defaultOperationsPolicy,responsible:'Responsável de teste'}}}});});
 await page.getByRole('button',{name:'Salvar configuração',exact:true}).click();await expect(page.getByRole('alert')).toContainText('mesma tentativa');await expect(page.getByLabel('Responsável operacional',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Cancelar alterações'})).toBeDisabled();await expect(page.getByRole('button',{name:'Sair da conta'}).first()).toBeDisabled();
 const back=page.getByRole('link',{name:'Voltar às configurações',exact:true});await back.dispatchEvent('click');await expect(page).toHaveURL(/continuidade$/);await page.getByRole('button',{name:'Repetir confirmação',exact:true}).click();await expect(page.getByRole('status')).toContainText('salva');expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);
});
