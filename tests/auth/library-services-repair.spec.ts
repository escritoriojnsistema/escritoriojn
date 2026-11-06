import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {emptyTemplate,type TemplateInput} from '../../shared/templates';
import {emptyService} from '../../shared/services';

const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
function importLocal(definition:TemplateInput){
 const container=process.env.AUTH_LAB_DB_CONTAINER;
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!/^jn-auth-lab-[0-9a-f-]{36}-postgres$/.test(container??''))throw Error('This fixture requires the disposable local laboratory.');
 const env={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
 const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
 const result=execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container!,'psql','-X','-v','ON_ERROR_STOP=1','-q','-A','-t','-U','postgres','-d','auth_lab'],{env,timeout:10000,encoding:'utf8',input:`BEGIN;SET LOCAL ROLE migrator;SELECT private.import_template_drafts('${office}','local-${randomUUID()}','https://example.test/reviewed-fixture',${quote(JSON.stringify([definition]))}::jsonb);COMMIT;`});
 return JSON.parse(result.trim()).items[0] as {id:string;version_id:string};
}

test('revisão real: importado abre, edita sem nova versão, catálogo protege conteúdo e serviço excluído some',async({page,request})=>{
 test.setTimeout(120000);
 const suffix=randomUUID().slice(0,8).toUpperCase(),name='Modelo real local '+suffix;
 const definition:TemplateInput={...emptyTemplate,code:'FIX-'+suffix,name,demonstration:false,variables:[],content:'TEXTO PRIVADO DO MODELO DE TESTE'};
 const imported=importLocal(definition);
 const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const clientSdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  expect((await sdk.auth.signInWithPassword({email:'manager@example.test',password})).error).toBeNull();
  const session=(await sdk.auth.getSession()).data.session!,headers={Authorization:'Bearer '+session.access_token};
  async function post(path:string,body:unknown,status=200,auth=headers){const result=await request.post(path,{headers:auth,data:body});expect(result.status(),path+' '+await result.text()).toBe(status);return(await result.json()).data;}
  let detail=await post('/api/templates/detail',{office_id:office,template_id:imported.id,page:1});
  expect(detail.versions[0].source_import_id).toMatch(/^[0-9a-f-]{36}$/);expect(detail.versions[0].created_by).toBeNull();
  await page.setViewportSize({width:360,height:740});await page.goto('/login');
  await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.goto('/modelos');await page.getByLabel('Buscar modelo',{exact:true}).fill(name);await page.getByRole('button',{name:'Ver modelo '+name,exact:true}).click();
  await expect(page.getByLabel('Texto preservado da versão',{exact:true})).toHaveText(definition.content);
  await page.getByRole('button',{name:'Editar conteúdo desta versão',exact:true}).click();
  await page.getByLabel('Nome do modelo',{exact:true}).fill(name+' corrigido');await page.getByLabel('Motivo da edição',{exact:true}).fill('Correção local sem nova versão');
  const editedResponse=page.waitForResponse(r=>r.url().endsWith('/version-command'));
  await page.getByRole('button',{name:'Salvar alterações nesta versão',exact:true}).click();expect((await editedResponse).status()).toBe(200);
  detail=await post('/api/templates/detail',{office_id:office,template_id:imported.id,page:1,selected_number:1});expect(detail.latest_version).toBe(1);expect(detail.history_total).toBe(1);expect(detail.versions[0].name).toBe(name+' corrigido');
  await post('/api/templates/approve',{office_id:office,template_id:imported.id,version_id:imported.version_id,expected_version:1,reason:'Revisão local explícita',idempotency_key:randomUUID()});
  await page.goto('/modelos');await page.getByRole('tab',{name:'Aprovados',exact:true}).click();await page.getByLabel('Buscar modelo',{exact:true}).fill(name);await page.getByRole('button',{name:'Ver modelo '+name+' corrigido',exact:true}).click();
  await expect(page.getByLabel('Texto preservado da versão',{exact:true})).toHaveText(definition.content);
  await page.setViewportSize({width:1440,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const service=await post('/api/services',{office_id:office,service:{...emptyService,code:'FIX-'+suffix,name:'Serviço local '+suffix,category:'Rural',price_cents:2000,required_capabilities:[],quantity_max:1},reason:'Cadastro local'},201);
  for(const scope of ['client','internal']){const {error}=await sdk.rpc('checklists_publish',{p_office_id:office,p_service_id:service.id,p_expected_version:0,p_definition:{name:scope==='client'?'Externo':'Interno',items:[{key:'conferencia',label:scope==='client'?'Enviar dados solicitados':'CONFERENCIA INTERNA PRIVADA',condition:null,requirement:'required'}]},p_reason:'Configuração local',p_event_id:randomUUID(),p_scope:scope});expect(error).toBeNull();}
  await post('/api/document-commercial/offer-manage',{office_id:office,template_id:imported.id,value:{service_id:service.id,instructions:'Orientação local',execution_level:1,portal_enabled:true,intake_keys:[],required_intake_keys:[],allow_self_approval:false},expected_revision:0,idempotency_key:randomUUID()});
  expect((await clientSdk.auth.signInWithPassword({email:'portalclient@example.test',password})).error).toBeNull();
  const clientHeaders={Authorization:'Bearer '+(await clientSdk.auth.getSession()).data.session!.access_token};
  const categories=await post('/api/categories/state',{office_id:office},200,clientHeaders),documents=categories.items.find((c:{is_documents:boolean})=>c.is_documents);
  const catalog=await post('/api/document-commercial/offers',{office_id:office,folder_id:null,unfiled:false,query:name,page:1,size:5,category:documents.id},200,clientHeaders);
  expect(catalog.total).toBe(1);expect(catalog.items[0].price_cents).toBe(2000);expect(JSON.stringify(catalog)).not.toContain(definition.content);expect(JSON.stringify(catalog)).not.toContain('CONFERENCIA INTERNA PRIVADA');expect(catalog.items[0].service_checklist).toContain('Enviar dados solicitados');
  await post('/api/services/'+service.id+'/archive',{office_id:office,expected_version:1,reason:'Exclusão local',idempotency_key:randomUUID()});
  const removed=await post('/api/document-commercial/offers',{office_id:office,folder_id:null,unfiled:false,query:name,page:1,size:5,category:documents.id},200,clientHeaders);expect(removed.total).toBe(0);
  const detached=await post('/api/document-commercial/model-state',{office_id:office,template_id:imported.id});
  expect(detached.offer).toBeNull();expect(detached.offer_revision).toBe(1);
  await page.goto('/modelos');await page.getByRole('tab',{name:'Aprovados',exact:true}).click();await page.getByLabel('Buscar modelo',{exact:true}).fill(name);await page.getByRole('button',{name:'Ver modelo '+name+' corrigido',exact:true}).click();
  await page.getByText('Serviço, preço e campos da solicitação',{exact:true}).click();
  await expect(page.getByRole('combobox',{name:/Serviço vinculado/})).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const replacement=await post('/api/services',{office_id:office,service:{...emptyService,code:'NEW-'+suffix,name:'Novo serviço local '+suffix,category:'Rural',price_cents:3500,required_capabilities:[],quantity_max:1},reason:'Novo serviço após exclusão'},201);
  const folderState=await post('/api/document-commercial/folder-command',{office_id:office,command:{kind:'create',name:'Pasta de relink '+suffix},idempotency_key:randomUUID()});
  const relinkFolder=folderState.folders.find((f:{name:string})=>f.name==='Pasta de relink '+suffix);
  for(let index=0;index<5;index++){
   const filler=importLocal({...definition,code:'AAA-'+index+'-'+suffix,name:'A modelo anterior '+index+' '+suffix});
   await post('/api/templates/approve',{office_id:office,template_id:filler.id,version_id:filler.version_id,expected_version:1,reason:'Revisão explícita da fixture de paginação',idempotency_key:randomUUID()});
   await post('/api/document-commercial/folder-command',{office_id:office,command:{kind:'move',template_id:filler.id,folder_id:relinkFolder.id,expected_revision:0},idempotency_key:randomUUID()});
  }
  await post('/api/document-commercial/folder-command',{office_id:office,command:{kind:'move',template_id:imported.id,folder_id:relinkFolder.id,expected_revision:0},idempotency_key:randomUUID()});
  await test.step('Abrir novo serviço para vincular modelo da segunda página',async()=>{
   await page.goto('/servicos',{waitUntil:'domcontentloaded'});
   await page.getByRole('searchbox',{name:'Buscar serviço',exact:true}).fill('Novo serviço local '+suffix);await page.getByRole('button',{name:'Buscar',exact:true}).click();
   await page.getByRole('button',{name:'Ver serviço Novo serviço local '+suffix,exact:true}).click();
  });
  const linkSection=page.getByRole('region',{name:'Documento vinculado ao serviço',exact:true});
  await linkSection.getByRole('combobox',{name:/^Pasta/}).selectOption(relinkFolder.id);
  const documentPicker=linkSection.getByRole('combobox',{name:/^Documento/});
  await expect(documentPicker.locator('option')).toHaveCount(6);
  await expect(documentPicker.locator(`option[value="${imported.id}"]`)).toHaveCount(0);
  await linkSection.getByRole('navigation',{name:'Paginação de documentos para vínculo'}).getByRole('button',{name:'Próxima',exact:true}).click();
  await expect(documentPicker.locator(`option[value="${imported.id}"]`)).toHaveCount(1);
  await linkSection.getByRole('navigation',{name:'Paginação de documentos para vínculo'}).getByRole('button',{name:'Anterior',exact:true}).click();
  await linkSection.getByLabel('Buscar documento',{exact:true}).fill(name);
  await expect(documentPicker.locator(`option[value="${imported.id}"]`)).toHaveCount(1);
  await documentPicker.selectOption(imported.id);
  const attachResponse=page.waitForResponse(r=>r.url().endsWith('/offer-attach'));
  await linkSection.getByRole('button',{name:'Vincular documento',exact:true}).click();
  const attached=await attachResponse;expect(attached.status()).toBe(200);const relink=(await attached.json()).data;
  await expect(linkSection.getByText('Documento vinculado ao serviço.',{exact:true})).toBeVisible();
  expect(relink.service_id).toBe(replacement.id);expect(relink.offer_revision).toBe(2);
  const visibleAgain=await post('/api/document-commercial/offers',{office_id:office,folder_id:null,unfiled:false,query:name,page:1,size:5,category:documents.id},200,clientHeaders);
  expect(visibleAgain.total).toBe(1);expect(visibleAgain.items[0].service_id).toBe(replacement.id);expect(visibleAgain.items[0].price_cents).toBe(3500);
  const managerCategories=await post('/api/categories/state',{office_id:office}),rural=managerCategories.items.find((c:{name:string})=>c.name==='Rural');
  const archivedCategories=await post('/api/categories/command',{office_id:office,command:{kind:'delete',category_id:rural.id,expected_revision:rural.revision,reason:'Arquivar categoria de teste conservando histórico'},idempotency_key:randomUUID()});
  expect(archivedCategories.archived_items.some((c:{id:string})=>c.id===rural.id)).toBe(true);
  const hiddenCategory=await post('/api/document-commercial/offers',{office_id:office,folder_id:null,unfiled:false,query:name,page:1,size:5,category:null},200,clientHeaders);
  expect(hiddenCategory.total).toBe(0);expect(hiddenCategory.categories.some((c:{id:string})=>c.id===rural.id)).toBe(false);
  await page.goto('/configuracoes/categorias');await page.getByRole('button',{name:'Ver categorias arquivadas',exact:true}).click();
  await expect(page.getByRole('button',{name:'Editar Rural',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Editar Rural',exact:true}).click();
  await page.getByLabel('Nome da categoria',{exact:true}).fill('Rural arquivada');await page.getByRole('combobox',{name:/Nível de execução/}).selectOption('3');await page.getByLabel('Motivo',{exact:true}).fill('Correção de metadados de categoria arquivada');
  await page.getByRole('button',{name:'Salvar categoria',exact:true}).click();await expect(page.getByRole('status')).toContainText('renomeada');
  for(const width of [360,1440]){await page.setViewportSize({width,height:900});await expect(page.getByRole('button',{name:'Editar Rural arquivada',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}


 }finally{await sdk.auth.signOut();await clientSdk.auth.signOut();}
});
