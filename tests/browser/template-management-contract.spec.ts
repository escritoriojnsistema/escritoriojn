import {test,expect,type Page} from '@playwright/test';
import {office,user,templateId,declaration,detail,version} from '../fixtures/templates';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contratos fictícios locais.');

async function setup(page:Page,reader=false){
 const folderId='00000000-0000-4000-d000-000000000701';
 const approved={...version,approved_at:'2026-10-26T02:00:00.000Z',approved_by:user,approved_by_name:'Revisor',approval_reason:'Conferido'};
 const state={name:'Título renomeado',archived:false,folderCalls:0,refreshFailure:0,metadataFailures:[] as number[],metadataPosts:[] as any[],searches:[] as any[],saves:[] as any[],value:{...structuredClone(detail),latest_version:2,history_total:2,can_manage:!reader,can_approve:!reader,versions:[{...version,id:'00000000-0000-4000-f000-000000000702',number:2,content:'Rascunho novo'},approved]}};
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Equipe fictícia',role_code:reader?'employee':'owner',permissions:reader?['foundation.access','templates.read']:['foundation.access','templates.read','templates.manage','templates.approve']}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/folders',r=>{state.folderCalls++;if(state.refreshFailure)return r.fulfill({status:state.refreshFailure,json:{error:{}}});return r.fulfill({json:{data:{folders:[{id:folderId,name:'Pasta compartilhada',category:'Declarações',revision:1}],locations:[{template_id:templateId,folder_id:folderId,revision:1}],can_manage:!reader}}});});
 await page.route('**/api/document-commercial/templates-search',r=>{const body=r.request().postDataJSON();state.searches.push(body);return r.fulfill({json:{data:{items:state.archived?[]:[{id:templateId,code:declaration.code,name:state.name,kind:declaration.kind,demonstration:true,latest_version:2,current_version:1}],page:body.page,page_size:body.size,total:state.archived?0:1}}});});
 const metadata=()=>({template_id:templateId,display_name:state.name,archived_at:state.archived?'2026-11-02T12:00:00.000Z':null,revision:1});
 await page.route('**/api/document-commercial/model-state',r=>r.fulfill({json:{data:{metadata:metadata(),offer:null,can_manage:false,can_manage_metadata:!reader}}}));
 await page.route('**/api/document-commercial/metadata-command',r=>{const body=r.request().postDataJSON();state.metadataPosts.push(body);const failure=state.metadataFailures.shift();if(failure)return r.fulfill({status:failure,json:{error:{}}});if(body.command.kind==='archive')state.archived=true;if(body.command.kind==='rename')state.name=body.command.name;return r.fulfill({json:{data:metadata()}});});
 await page.route('**/api/templates/detail',r=>r.fulfill({json:{data:state.value}}));
 await page.route('**/api/templates/save',r=>{const body=r.request().postDataJSON();state.saves.push(body);state.value={...state.value,latest_version:3,history_total:3,versions:[{...version,...body.definition,number:3,id:'00000000-0000-4000-f000-000000000703'},...state.value.versions]};return r.fulfill({json:{data:state.value}});});
 return {state,folderId};
}
test('modelos: abas conservam a pasta e atualizar pastas renova a lista com retorno',async({page})=>{
 const {state,folderId}=await setup(page);await page.goto('/modelos');
 await expect(page.getByRole('checkbox',{name:'Mostrar excluídos'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Pasta',exact:true}).selectOption(folderId);
 await page.getByRole('tab',{name:'Aprovados',exact:true}).click();
 await expect.poll(()=>state.searches.at(-1)?.state).toBe('approved');expect(state.searches.at(-1).folder_id).toBe(folderId);
 await page.getByRole('tab',{name:'Rascunhos',exact:true}).click();await expect.poll(()=>state.searches.at(-1)?.state).toBe('draft');
 const previous=state.searches.length;await page.getByRole('button',{name:'Atualizar pastas',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Pastas e modelos atualizados');expect(state.searches.length).toBeGreaterThan(previous);expect(state.folderCalls).toBe(2);
 state.refreshFailure=503;await page.getByRole('button',{name:'Atualizar pastas',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('combobox',{name:'Pasta',exact:true})).toHaveValue(folderId);
});
for(const tab of ['Rascunhos','Aprovados'])test(`modelos: excluir em ${tab} retorna à lista sem modelo`,async({page})=>{
 const {state}=await setup(page);await page.goto('/modelos');await page.getByRole('tab',{name:tab,exact:true}).click();await page.getByRole('button',{name:'Ver modelo Título renomeado',exact:true}).click();
 await page.getByText('Nome, duplicação e exclusão',{exact:true}).click();await page.getByRole('button',{name:'Excluir da biblioteca ativa',exact:true}).click();
 await expect(page.getByText('Nenhum modelo encontrado.',{exact:false})).toBeVisible();expect(state.archived).toBe(true);await expect(page.getByRole('button',{name:'Restaurar modelo',exact:true})).toHaveCount(0);
});
test('modelos: editar aprovado usa a versão aprovada e título renomeado, sem alterar aprovação',async({page})=>{
 const {state}=await setup(page);await page.goto('/modelos');await page.getByRole('tab',{name:'Aprovados',exact:true}).click();await page.getByRole('button',{name:'Ver modelo Título renomeado',exact:true}).click();
 await expect(page.getByLabel('Texto preservado da versão',{exact:true})).toHaveText(declaration.content);
 await expect(page.getByRole('heading',{name:'Título renomeado',exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Nova versão',exact:true}).click();
 await expect(page.getByLabel('Nome do modelo',{exact:true})).toHaveValue('Título renomeado');await expect(page.getByLabel('Texto do modelo',{exact:true})).toHaveValue(declaration.content);
 await page.getByLabel('Motivo da versão',{exact:true}).fill('Revisão autorizada');await page.getByRole('button',{name:'Salvar versão',exact:true}).click();await expect(page.getByText('Versão salva.',{exact:false})).toBeVisible();
 expect(state.saves[0].expected_version).toBe(2);expect(state.value.versions[2].approved_at).toBeTruthy();expect(state.value.versions[0].approved_at).toBeNull();
});
test('modelos: funcionário leitor abre aprovados e não recebe aba de rascunho',async({page})=>{
 const {state}=await setup(page,true);await page.goto('/modelos');await expect(page.getByRole('tab',{name:'Aprovados',exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'Rascunhos',exact:true})).toHaveCount(0);await expect.poll(()=>state.searches.at(-1)?.state).toBe('approved');
});
test('modelos: aprovação anterior fora da primeira página abre o texto aprovado',async({page})=>{
 await setup(page);const requested:number[]=[];
 await page.route('**/api/document-commercial/templates-search',r=>r.fulfill({json:{data:{items:[{id:templateId,code:declaration.code,name:'Título renomeado',kind:declaration.kind,demonstration:true,latest_version:7,current_version:1}],page:1,page_size:r.request().postDataJSON().size,total:1}}}));
 await page.route('**/api/templates/detail',r=>{const body=r.request().postDataJSON();requested.push(body.page);const versions=body.page===2?[{...version,approved_at:'2026-10-26T02:00:00.000Z',approved_by:user,approved_by_name:'Revisor',approval_reason:'Conferido'}]:[7,6,5,4,3].map(number=>({...version,number,id:`00000000-0000-4000-f000-00000000070${number}`,content:'Rascunho '+number}));return r.fulfill({json:{data:{...detail,latest_version:7,history_total:7,history_page:body.page,versions}}});});
 await page.goto('/modelos');await page.getByRole('tab',{name:'Aprovados',exact:true}).click();await page.getByRole('button',{name:'Ver modelo Título renomeado',exact:true}).click();
 await expect(page.getByLabel('Texto preservado da versão',{exact:true})).toHaveText(declaration.content);expect(requested).toEqual([2]);
});
