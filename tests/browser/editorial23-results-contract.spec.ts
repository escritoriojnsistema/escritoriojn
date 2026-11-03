import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contrato fictício; isolamento SQL e Auth real são verificados separadamente.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',date='2026-11-03T10:00:00Z';
const request={id,protocol:'JN-2026-000001',title:'Solicitação editorial fictícia',public_status:'em_analise',created_at:date,updated_at:date,portal:true,message:'',services:['Documento fictício'],assignee_name:null};
async function setup(page:Page){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:'client',permissions:['foundation.access'],office_name:'Escritório fictício',display_name:'Cliente fictício'}]}}}));
 await page.route('**/api/categories/state',r=>r.fulfill({json:{data:{items:[],can_manage:false}}}));
 await page.route('**/api/requests**',r=>r.fulfill({json:{data:r.request().url().endsWith('/search')?{items:[request],total:1,page:1,page_size:3,portal:true}:request}}));
}
for(const width of [320,360,768,1440])test(`editorial23: resumo público paginado e seguro em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:700});await setup(page);
 const bodies:{page:number;size:number;office_id:string;request_id:string}[]=[];
 await page.route('**/api/document-workflow/request-reviews',r=>{const b=r.request().postDataJSON();bodies.push(b);return r.fulfill({json:{data:{items:[{title:b.page===1?'Contrato fictício':'Documento da próxima página',revision:2,status:b.page===1?'returned':'approved',updated_at:date,reason:'SEGREDO INTERNO',actor_name:'AUTOR PRIVADO'}],total:8,page:b.page,page_size:b.size}}});});
 await page.goto('/minhas-solicitacoes');await page.getByRole('button',{name:'Ver solicitação JN-2026-000001',exact:true}).click();
 const summary=page.getByRole('region',{name:'Revisão dos documentos',exact:true});await expect(summary).toContainText('Devolvido para correção');await expect(summary).toContainText('Revisão 2');await expect(summary).not.toContainText('SEGREDO INTERNO');await expect(summary).not.toContainText('AUTOR PRIVADO');
 expect(bodies[0]).toEqual({office_id:office,request_id:id,page:1,size:width<=900?3:5});
 await summary.getByRole('button',{name:'Próxima',exact:true}).click();await expect(summary).toContainText('Documento da próxima página');expect(bodies.at(-1)?.page).toBe(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
});
test('editorial23: falha503 permite repetição; revogação403 remove o resumo e bloqueia',async({page})=>{
 await setup(page);let count=0;
 await page.route('**/api/document-workflow/request-reviews',r=>{count++;return count===1?r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}):count===2?r.fulfill({json:{data:{items:[{title:'Documento autorizado',revision:1,status:'approved',updated_at:date}],total:7,page:1,page_size:5}}}):r.fulfill({status:403,json:{error:{code:'FORBIDDEN'}}});});
 await page.goto('/minhas-solicitacoes');await page.getByRole('button',{name:'Ver solicitação JN-2026-000001',exact:true}).click();await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();await expect(page.getByText('Documento autorizado',{exact:true})).toBeVisible();await page.getByRole('navigation',{name:'Paginação da revisão dos documentos',exact:true}).getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.getByText('Documento autorizado',{exact:true})).toHaveCount(0);await expect(page.getByRole('alert').first()).toContainText('acesso');expect(count).toBe(3);
});
