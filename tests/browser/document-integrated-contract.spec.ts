import {test,expect,type Page} from '@playwright/test';
import {office,user,templateId,versionId,detail,declaration} from '../fixtures/templates';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contratos locais de apresentação, sem credenciais reais.');
const folder='00000000-0000-4000-8000-000000000001';
async function setup(page:Page,client:boolean){
 const state={name:declaration.name,folder:'',bookings:[] as any[],moves:[] as any[]};
 const permissions=client?['foundation.access']:['foundation.access','templates.read','templates.manage','templates.approve','services.read','services.manage'];
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório de teste',display_name:'Pessoa de teste',role_code:client?'client':'owner',permissions}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 const offer={template_id:templateId,template_version_id:versionId,service_version_id:versionId,offer_revision:1,name:state.name,template_code:declaration.code,folder_id:folder,folder_name:'Contratos rurais',folder_category:'Contratos',instructions:'Informe o CPF e o endereço do imóvel.',price_cents:12345,service_id:folder,service_code:'DOC-001',service_category:'Documentos',service_checklist:[],variables:[{key:'documento.cpf',label:'CPF do solicitante',type:'cpf',required:true}]};
 await page.route('**/api/document-commercial/**',async r=>{const path=new URL(r.request().url()).pathname.split('/').at(-1),b=r.request().postDataJSON();let data:unknown;
 if(path==='templates-search')data={items:[{id:templateId,code:declaration.code,name:state.name,kind:declaration.kind,demonstration:false,latest_version:1,current_version:1}],page:1,page_size:b.size,total:1};
 else if(path==='folders'||path==='folder-command'){if(path==='folder-command')state.moves.push(b);data={folders:[{id:folder,name:'Contratos rurais',revision:1,category:'Contratos'}],locations:[{template_id:templateId,folder_id:state.folder||null,revision:0}],can_manage:true};}
 else if(path==='model-state')data={metadata:{template_id:templateId,display_name:state.name,archived_at:null,revision:0},offer:null,can_manage:false,can_manage_metadata:true};
 else if(path==='metadata-command'){state.name=b.command.name;data={template_id:templateId,display_name:state.name,archived_at:null,revision:1};}
 else if(path==='offers')data={items:[offer],folders:[{id:folder,name:'Contratos rurais',category:'Contratos'}],total:1,page:1,page_size:5};
 else if(path==='offer-form')data=offer;
 else if(path==='booking'){state.bookings.push(b);data={request_id:templateId,protocol:'AT-000001',status:'recebido',waiting:true};}
 else return r.fulfill({status:404,json:{error:{code:'FIXTURE_NOT_FOUND'}}});
 return r.fulfill({json:{data}});});
 await page.route('**/api/templates/detail',r=>r.fulfill({json:{data:detail}}));
 return state;
}
for(const width of [320,360,768,1440]){
 test(`integrado: cliente encontra pasta, preço e campos e entra na espera em ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const state=await setup(page,true);await page.goto('/modelos-disponiveis');await page.getByRole('combobox',{name:'Pasta',exact:true}).selectOption(folder);await expect(page.getByText('R$ 123,45',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Solicitar',exact:true}).click();await expect(page.getByText('Informe o CPF e o endereço do imóvel.')).toBeVisible();await page.getByLabel('CPF do solicitante *',{exact:true}).fill('52998224725');await page.getByRole('button',{name:'Enviar solicitação',exact:true}).click();await expect(page.getByRole('status')).toContainText('fila');expect(state.bookings[0].value.answers).toEqual({'documento.cpf':'52998224725'});expect(state.bookings[0].value).toMatchObject({origin:'portal',customer_id:null,assignee_id:null,service_version_id:versionId});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`integrado: gestor organiza e renomeia modelo preservando versão em ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const state=await setup(page,false);await page.goto('/modelos');await page.getByRole('button',{name:`Ver modelo ${declaration.name}`,exact:true}).click();await page.getByText('Nome, duplicação e exclusão',{exact:true}).click();await page.getByLabel('Título do modelo',{exact:true}).fill('Contrato rural atualizado');await page.getByRole('button',{name:'Renomear modelo',exact:true}).click();await expect(page.getByRole('heading',{name:'Contrato rural atualizado',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Mover este modelo para',exact:true}).selectOption(folder);await expect.poll(()=>state.moves.length).toBe(1);expect(state.moves[0].command).toMatchObject({kind:'move',template_id:templateId,folder_id:folder,expected_revision:0});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[role="progressbar"],.loader,.spinner')).toHaveCount(0);
 });
}
