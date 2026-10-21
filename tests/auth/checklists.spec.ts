import {test,expect,type APIRequestContext} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {emptyService} from '../../shared/services';
import type {ChecklistView,ChecklistNotices} from '../../shared/checklists';
import type {AttachmentIntent} from '../../shared/attachments';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
async function actor(name:string){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();const {data}=await sdk.auth.getSession();return {sdk,headers:{Authorization:`Bearer ${data.session!.access_token}`}};}
async function result<T>(r:Awaited<ReturnType<APIRequestContext['post']>>,status=200):Promise<T>{expect(r.status(),await r.text()).toBe(status);return ((await r.json()) as {data:T}).data;}
test('checklists reais12: navegador, dois uploads privados, snapshot, aviso deduplicado e encaminhamento',async({page,request})=>{
 const owner=await actor('manager'),worker=await actor('serviceworker'),portal=await actor('portalclient'),other=await actor('other');
 const post=(path:string,data:unknown)=>request.post(`/api/checklists${path}`,{headers:owner.headers,data});
 try{
  const roster=await owner.sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'serviceworker@example.test',p_status:'all'});expect(roster.error).toBeNull();const member=roster.data.items[0].id;
  expect((await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:member,p_role_code:'employee',p_active:true,p_permissions:['foundation.access','requests.read','requests.transfer','checklists.read','checklists.update','files.read'],p_request_id:randomUUID()})).error).toBeNull();
  const service=await result<{id:string}>(await request.post('/api/services',{headers:owner.headers,data:{office_id:office,service:{...emptyService,code:`C12-${randomUUID().slice(0,8).toUpperCase()}`,name:'Serviço checklist fictício',category:'Teste local',price_cents:50},reason:'Laboratório checklist12'}}),201);
  const definition={name:'Documentos fictícios12',items:['a','b','c'].map(x=>({key:x,label:`Arquivo ${x.toUpperCase()}`,requirement:'required',condition:null}))};
  await result(await post('/model/publish',{office_id:office,service_id:service.id,expected_version:0,definition,reason:'Três arquivos fictícios'}));
  const own=await result<{id:string;protocol:string;version:number;items:{id:string}[]}>(await request.post('/api/requests',{headers:owner.headers,data:{office_id:office,idempotency_key:randomUUID(),request:{origin:'presencial',title:'Checklist12 fictício integrado',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'Nota interna privada',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}}}),201);
  const item=own.items[0].id;const files:string[]=[];
  for(const letter of ['a','b']){
   const pdf=Buffer.from(`%PDF-1.4\n% Arquivo ${letter} inteiramente ficticio local12\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`);
   const intent=await result<AttachmentIntent>(await request.post('/api/attachments/intents',{headers:owner.headers,data:{office_id:office,input:{request_id:own.id,request_item_id:item,name:`ficticio12-${letter}.pdf`,mime_type:'application/pdf',size_bytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex'),classification:'documento',idempotency_key:randomUUID()}}}),201);
   expect((await owner.sdk.storage.from(intent.bucket).upload(intent.object_path,pdf,{contentType:'application/pdf',upsert:false})).error).toBeNull();
   const processed=await result<{file:{status:string}}>(await request.post('/api/attachments/process',{headers:owner.headers,data:{office_id:office,action:'validate',args:{intent_id:intent.intent_id}}}));expect(processed.file.status).toBe('quarentena');files.push(intent.file.id);
  }
  await page.setViewportSize({width:360,height:640});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.goto('/pendencias');await page.getByRole('searchbox',{name:'Buscar solicitação'}).fill(own.protocol);await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:`Escolher solicitação ${own.protocol}`}).click();await page.getByRole('button',{name:'Aplicar checklist'}).click();await expect(page.getByText('3 itens necessários pendentes',{exact:true})).toBeVisible();
  for(const [n,letter]of ['A','B'].entries()){
   await page.getByRole('button',{name:`Editar Arquivo ${letter}`}).click();await page.getByRole('combobox',{name:'Estado do item',exact:true}).selectOption('recebido');await expect(page.getByRole('combobox',{name:'Arquivo do mesmo item'}).getByRole('option',{name:`ficticio12-${letter.toLowerCase()}.pdf · Quarentena`})).toHaveCount(1);await page.getByRole('combobox',{name:'Arquivo do mesmo item'}).selectOption(files[n]);await page.getByLabel('Motivo da decisão').fill('Recebimento fictício local');const response=page.waitForResponse('**/api/checklists/entries/update');await page.getByRole('button',{name:'Registrar decisão'}).click();expect((await response).status()).toBe(200);
  }
  await expect(page.getByText('1 item necessário pendente',{exact:true})).toBeVisible();await expect(page.getByText('2 recebidos aguardam validação',{exact:true})).toBeVisible();
  const current=await result<ChecklistView>(await post('/view',{office_id:office,request_id:own.id,item_id:item}));const entry=current.instance!.entries[0];
  expect((await post('/entries/update',{office_id:office,entry_id:entry.id,expected_version:entry.version,status:'validado',file_id:files[0],reason:'Tentativa sem scanner'})).status()).toBe(409);
  await result(await post('/model/publish',{office_id:office,service_id:service.id,expected_version:1,definition:{...definition,items:[{...definition.items[0],label:'Modelo novo não altera antigo'}]},reason:'Versão posterior fictícia'}));
  expect((await result<ChecklistView>(await post('/view',{office_id:office,request_id:own.id,item_id:item}))).instance!.entries).toHaveLength(3);
  // Reuse the existing transfer10, whose transaction now emits the generic handoff.
  expect((await request.post(`/api/requests/${own.id}/actions`,{headers:owner.headers,data:{office_id:office,expected_version:own.version,mutation:{kind:'transfer',assignee_id:member,reason:'Encaminhamento fictício12'}}})).status()).toBe(200);
  for(let n=0;n<2;n++)await result(await post('/notify',{office_id:office,instance_id:current.instance!.id}));
  const notices=await result<ChecklistNotices>(await request.post('/api/checklists/notifications',{headers:worker.headers,data:{office_id:office,page:1,size:5,unread_only:false}}));const ownNotices=notices.items.filter(n=>n.request_id===own.id);expect(ownNotices.map(n=>n.kind).sort()).toEqual(['handoff','pending']);expect(JSON.stringify(ownNotices)).not.toMatch(/Arquivo|privada|fictício|reason|title|cpf/);
  await result(await request.post('/api/checklists/notifications/read',{headers:worker.headers,data:{office_id:office,id:ownNotices[0].id}}));
  expect((await request.post('/api/checklists/notifications/read',{headers:owner.headers,data:{office_id:office,id:ownNotices[0].id}})).status()).toBe(404);
  for(const a of [portal,other])expect((await request.post('/api/checklists/view',{headers:a.headers,data:{office_id:office,request_id:own.id,item_id:item}})).status()).toBe(403);
  expect((await owner.sdk.schema('private').from('checklist_entries').select('*')).error).not.toBeNull();
 }finally{await Promise.all([owner,worker,portal,other].map(a=>a.sdk.auth.dispose()));}
});
