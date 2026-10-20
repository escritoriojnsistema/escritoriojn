import { test, expect, type Page } from '@playwright/test';
import type { CustomerRelationsState } from '../../shared/customerRelations';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Synthetic presentation fixtures only; real integration is tested in the Auth laboratory.');
const office = '11111111-1111-4111-8111-111111111111', user = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333', target = '44444444-4444-4444-8444-444444444444';
const customer = { id, kind: 'person', name: 'Pessoa Sintética', identifier: null, identifier_masked: null, contacts: [], created_at: '2026-10-20T12:00:00Z', version: 1, can_update: true };
const permissions = ['foundation.access','customers.read','customers.read_all','customers.relate','customers.verify','customers.merge','audit.read'];
function fixture(): CustomerRelationsState { return { customer: { ...customer, kind: 'person' }, capabilities: { can_relate: true, can_verify: true, can_merge: true }, assignments: [], representations: [], identities: [], merges: [], truncated: { assignments:false,representations:false,identities:false,merges:false }, portal_enabled:false,access_lost:false }; }
async function setup(page:Page, state = fixture(), role = 'owner', materialized = true) {
 const token = `e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user}) => localStorage.setItem('sb-team-ui-auth-token', JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})), {token,user});
 await page.route('https://team-ui.supabase.co/**', r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions,office_name:'Escritório Sintético',display_name:'Pessoa Sintética'}]}}}));
 await page.route('**/api/customers**',r=>r.fulfill({json:{data:r.request().url().endsWith('/search')?{items:[customer],total:1,page:1,page_size:3}:{...customer,...(!materialized?{source:'client_registration',materialized:false,can_update:false}:{})}}}));
 await page.route('**/api/customer-relations/**',r=>{
  expect(r.request().method()).toBe('POST'); expect(new URL(r.request().url()).search).toBe('');
  const path = new URL(r.request().url()).pathname, body=r.request().postDataJSON();
  if(path.endsWith('/state'))return r.fulfill({json:{data:state}});
  if(path.endsWith('/candidates'))return r.fulfill({json:{data:{kind:body.kind,limit:20,items:[{id:target,name:'Destino Sintético',kind:body.kind==='customers'?'person':body.kind==='client'?'client':'employee',contact_masked:body.kind==='customers'?null:'d***@***',identifier_masked:null}]}}});
  if(path.endsWith('/preview'))return r.fulfill({json:{data:{source:state.customer,target:{...state.customer,id:target,name:'Destino Sintético'},expected:{name:'Destino Sintético',kind:'person',identifier_masked:null,contact_count:0,copies_identifier:false,transfers_authority:false},conflicts:[],can_merge:true,portal_enabled:false}}});
  if(path.endsWith('/merge'))return r.fulfill({json:{data:{merge_id:target,source_id:id,target_id:target,target_version:2,state:{...state,customer:{...state.customer,id:target,name:'Destino Sintético',version:2},merges:[{id:target,source_id:id,target_id:target,source_snapshot_id:id,target_snapshot_id:id,result_snapshot_id:id,actor_id:user,created_at:customer.created_at}]}}}});
  return r.fulfill({json:{data:state}});
 });
}
async function open(page:Page) { await page.goto('/clientes'); await page.getByRole('button',{name:'Ver ficha de Pessoa Sintética',exact:true}).click(); await page.getByRole('button',{name:'Vínculos',exact:true}).click(); await expect(page.getByRole('button',{name:'Acesso operacional 0 registros'})).toBeVisible(); }
async function select(page:Page) { await page.getByRole('button',{name:'Buscar candidatos',exact:true}).click(); await page.getByLabel('Selecionar pessoa').selectOption(target); }
async function measure(page:Page) { const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width}))}));expect(dimensions.scroll,JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.width); expect(await page.locator('.relations-panel button:visible,.relations-panel input:visible,.relations-panel select:visible').evaluateAll(es=>es.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44;}))).toBe(true); await expect(page.getByText(/Carregando|Salvando|Aguarde|Processando/)).toHaveCount(0); }
for(const [width,height] of [[320,568],[360,640],[768,1024],[1440,900]]) test(`synthetic vínculos compactos e formulários ${width}x${height}`,async({page})=>{
 await page.setViewportSize({width,height}); await setup(page); await open(page); await measure(page);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`/workspace/shared/etapa08/relations-overview-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Representantes 0 registros'}).click(); await page.getByRole('button',{name:'Adicionar vínculo'}).click(); await select(page);
 await page.getByLabel('Referência da conferência').fill('REF-INTERNA-08'); await measure(page);
 if(width<=768) { await expect(page.getByLabel('Referência da conferência')).toHaveCSS('font-size','16px'); await expect(page.getByLabel('Referência da conferência')).toHaveCSS('box-shadow','none'); }
 if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`/workspace/shared/etapa08/relations-form-${width}.png`,fullPage:true});
 await page.getByLabel('Referência da conferência').fill('REFERÊNCIA '.repeat(40)); await page.setViewportSize({width,height:Math.min(height,360)}); await page.getByLabel('Referência da conferência').focus(); await measure(page);
 await page.evaluate(()=>{document.documentElement.style.zoom='1.5';}); await page.getByRole('button',{name:'Salvar vínculo'}).scrollIntoViewIfNeeded(); await measure(page);
});
test('synthetic prévia separada, confirmação e histórico consomem estado sem refetch',async({page})=>{
 await setup(page); let reads=0;page.on('request',r=>{if(r.url().endsWith('/api/customer-relations/state'))reads++;});await open(page);
 await page.getByRole('button',{name:'Duplicidades 0 registros'}).click();await page.getByRole('button',{name:'Revisar duplicidade'}).click();await select(page);
 await expect(page.getByRole('button',{name:'Confirmar mesclagem'})).toHaveCount(0);await page.getByRole('button',{name:'Ver prévia da mesclagem'}).click();
 await expect(page.getByText('Origem preservada no histórico')).toBeVisible();await page.getByLabel('Referência da conferência').fill('REF-08');
 const req=page.waitForRequest(r=>r.url().endsWith('/api/customer-relations/merge'));await page.getByRole('button',{name:'Confirmar mesclagem'}).click();expect((await req).postDataJSON()).toMatchObject({source_id:id,target_id:target,source_version:1,target_version:1,confirm:true,evidence:'REF-08'});
 await expect(page.getByRole('status')).toContainText('Mesclagem concluída');await expect(page.getByRole('list',{name:'Duplicidades'})).toContainText(id);expect(reads).toBe(1);
});
test('synthetic capacidades, paginação 3/5, truncamento e revogação deliberada',async({page})=>{
 const state=fixture();state.assignments=Array.from({length:7},(_,i)=>({id:`relation-${i}`,membership_id:target,name:`Funcionário ${i}`,version:1,created_at:customer.created_at,created_by:user,revoked_at:null,revoked_by:null,valid_from:customer.created_at,valid_until:null,status:i===1?'expired':'active'}));state.truncated.assignments=true;
 await page.setViewportSize({width:360,height:640});await setup(page,state);await page.goto('/clientes');await page.getByRole('button',{name:/Ver ficha/}).click();await page.getByRole('button',{name:'Vínculos',exact:true}).click();await page.getByRole('button',{name:'Acesso operacional 7+ registros'}).click();
 const list=page.getByRole('list',{name:'Acesso operacional'});await expect(list.locator('li')).toHaveCount(3);await expect(list).toContainText('Expirado');await expect(page.getByRole('link',{name:'Auditoria',exact:true}).last()).toBeVisible();await page.getByRole('button',{name:'Próxima',exact:true}).click();await expect(list).toContainText('Funcionário 3');
 await page.setViewportSize({width:1440,height:900});await expect(list.locator('li')).toHaveCount(5);await page.getByRole('button',{name:'Revogar vínculo de Funcionário 0'}).click();await expect(page.getByRole('button',{name:'Confirmar revogação'})).toBeVisible();await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(list).toBeVisible();
});
test('synthetic autorrevogação terminal descarta ficha e volta à lista',async({page})=>{
 const state=fixture();state.assignments=[{id:target,membership_id:target,name:'Funcionário',version:1,created_at:customer.created_at,created_by:user,revoked_at:null,revoked_by:null,valid_from:customer.created_at,valid_until:null,status:'active'}];await setup(page,state);await page.route('**/api/customer-relations/command',r=>r.fulfill({json:{data:{...fixture(),access_lost:true,capabilities:{can_relate:false,can_verify:false,can_merge:false}}}}));
 await page.goto('/clientes');await page.getByRole('button',{name:/Ver ficha/}).click();await page.getByRole('button',{name:'Vínculos',exact:true}).click();await page.getByRole('button',{name:'Acesso operacional 1 registros'}).click();await page.getByRole('button',{name:'Revogar vínculo de Funcionário'}).click();await page.getByRole('button',{name:'Confirmar revogação'}).click();await expect(page.getByRole('list',{name:'Clientes do escritório'})).toBeVisible();await expect(page.getByRole('region',{name:'Vínculos do cliente'})).toHaveCount(0);
});
test('synthetic resposta tardia de candidatos e mutação cancelada não reaparecem',async({page})=>{
 await setup(page);await open(page);await page.getByRole('button',{name:'Identidade 0 registros'}).click();await page.getByRole('button',{name:'Conferir identidade'}).click();
 let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/customer-relations/candidates',async r=>{await held;try{await r.fulfill({json:{data:{kind:'client',limit:20,items:[{id:target,name:'RESPOSTA ANTIGA',kind:'client',contact_masked:'a***@***',identifier_masked:null}]}}});}catch{/* canceled */}});
 const req=page.waitForRequest('**/api/customer-relations/candidates');await page.getByRole('button',{name:'Buscar candidatos'}).click();await req;await page.getByLabel('Buscar pessoa').fill('Nova busca');release();await expect(page.getByLabel('Selecionar pessoa')).toHaveCount(0);
 await page.unroute('**/api/customer-relations/candidates');await select(page);await page.getByLabel('Referência da conferência').fill('REF-08');
 let finish!:()=>void;const hold=new Promise<void>(r=>finish=r);await page.route('**/api/customer-relations/command',async r=>{await hold;try{await r.fulfill({json:{data:fixture()}});}catch{/* canceled */}});
 const command=page.waitForRequest('**/api/customer-relations/command');await page.getByRole('button',{name:'Confirmar conferência'}).click();await command;await expect(page.getByRole('button',{name:'Confirmar conferência'})).toBeDisabled();await measure(page);await page.getByRole('button',{name:'Voltar à lista'}).click();finish();await expect(page.getByRole('list',{name:'Clientes do escritório'})).toBeVisible();await expect(page.getByRole('status')).toHaveCount(0);
});
test('synthetic 403 bloqueia dados sem repetir busca de clientes',async({page})=>{
 await setup(page);await open(page);let searches=0;page.on('request',r=>{if(r.url().endsWith('/api/customers/search'))searches++;});await page.route('**/api/customer-relations/candidates',r=>r.fulfill({status:403,json:{error:{code:'RELATIONS_FORBIDDEN'}}}));await page.getByRole('button',{name:'Identidade 0 registros'}).click();await page.getByRole('button',{name:'Conferir identidade'}).click();await page.getByRole('button',{name:'Buscar candidatos'}).click();await expect(page.getByRole('alert')).toContainText('Seu acesso');await expect(page.getByRole('region',{name:'Vínculos do cliente'})).toHaveCount(0);await page.waitForTimeout(200);expect(searches).toBe(0);
});
test('synthetic pendência sem ficha não recebe Vínculos e leitura não inventa ações',async({page})=>{
 await setup(page,fixture(),'owner',false);await page.goto('/clientes');await page.getByRole('button',{name:/Ver ficha/}).click();await expect(page.getByRole('region',{name:'Dados da ficha'})).toBeVisible();await expect(page.getByRole('button',{name:'Vínculos',exact:true})).toHaveCount(0);
 const state=fixture();state.capabilities={can_relate:false,can_verify:false,can_merge:false};await setup(page,state);await open(page);await page.getByRole('button',{name:'Identidade 0 registros'}).click();await expect(page.getByRole('button',{name:'Conferir identidade'})).toHaveCount(0);
});
for(const role of ['owner','admin','employee','client'])test(`synthetic ${role}: no máximo quatro atalhos`,async({page})=>{
 await page.setViewportSize({width:360,height:640});await setup(page,fixture(),role);await page.goto(role==='client'?'/area-cliente':'/painel');const nav=page.getByRole('navigation',{name:'Atalhos do aplicativo'});await expect(nav).toBeVisible();expect(await nav.getByRole('link').count()).toBeLessThanOrEqual(4);await expect(nav.getByRole('link',{name:'Início',exact:true})).toBeVisible();await expect(nav.getByRole('link',{name:'Conta',exact:true})).toBeVisible();await expect(nav.getByRole('link',{name:'Vínculos',exact:true})).toHaveCount(0);
});
for(const change of ['logout','nova sessão'])test(`synthetic estado tardio descarta dados após ${change}`,async({page})=>{
 await setup(page);await page.goto('/clientes');await page.getByRole('button',{name:/Ver ficha/}).click();let release!:()=>void;const held=new Promise<void>(r=>release=r);
 await page.route('**/api/customer-relations/state',async r=>{await held;try{await r.fulfill({json:{data:fixture()}});}catch{/* canceled */}});
 const req=page.waitForRequest('**/api/customer-relations/state');await page.getByRole('button',{name:'Vínculos',exact:true}).click();await req;
 expect(await page.evaluate(async change=>{const modulePath='/src/features/auth/browser.ts';const {supabase}=await import(modulePath);if(change==='logout')return !(await supabase.auth.signOut({scope:'local'})).error;const {data}=await supabase.auth.getSession();const parts=data.session.access_token.split('.');const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));parts[1]=btoa(JSON.stringify({...claims,session_id:'99999999-9999-4999-8999-999999999999'})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');return !(await supabase.auth.setSession({access_token:parts.join('.'),refresh_token:'new-session'})).error;},change)).toBe(true);
 release();await expect(page.getByRole('region',{name:'Vínculos do cliente'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Acesso operacional 0 registros'})).toHaveCount(0);
});
test('synthetic voltar à seleção descarta candidato e exige escolha visível',async({page})=>{
 await setup(page);await open(page);await page.getByRole('button',{name:'Duplicidades 0 registros'}).click();await page.getByRole('button',{name:'Revisar duplicidade'}).click();await select(page);
 await page.getByRole('button',{name:'Ver prévia da mesclagem'}).click();await page.getByLabel('Referência da conferência').fill('REF-VOLTAR');await page.getByRole('button',{name:'Voltar à seleção'}).click();
 await expect(page.getByLabel('Buscar pessoa')).toHaveValue('');await expect(page.getByLabel('Selecionar pessoa')).toHaveCount(0);await expect(page.getByText('Destino Sintético',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Ver prévia da mesclagem'})).toBeDisabled();await expect(page.getByRole('button',{name:'Confirmar mesclagem'})).toHaveCount(0);
 await select(page);await page.getByRole('button',{name:'Ver prévia da mesclagem'}).click();await expect(page.getByLabel('Referência da conferência')).toHaveValue('');
});
test('synthetic conflito de mesclagem exige nova seleção e prévia sem reenvio automático',async({page})=>{
 await setup(page);await page.route('**/api/customer-relations/merge',r=>r.fulfill({status:409,json:{error:{code:'CUSTOMER_RELATIONS_CONFLICT'}}}));await open(page);await page.getByRole('button',{name:'Duplicidades 0 registros'}).click();await page.getByRole('button',{name:'Revisar duplicidade'}).click();await select(page);await page.getByRole('button',{name:'Ver prévia da mesclagem'}).click();await page.getByLabel('Referência da conferência').fill('REF-CONFLITO');let calls=0;page.on('request',r=>{if(r.url().endsWith('/api/customer-relations/merge'))calls++;});await page.getByRole('button',{name:'Confirmar mesclagem'}).click();await expect(page.getByRole('alert')).toContainText('Conflito');await expect(page.getByRole('button',{name:'Ver prévia da mesclagem'})).toBeDisabled();await expect(page.getByRole('button',{name:'Confirmar mesclagem'})).toHaveCount(0);expect(calls).toBe(1);
});
