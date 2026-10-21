import {test,expect,type APIRequestContext} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
async function actor(name:string){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();const {data}=await sdk.auth.getSession();return {sdk,headers:{Authorization:`Bearer ${data.session!.access_token}`}};}
async function value(r:Awaited<ReturnType<APIRequestContext['post']>>,status=200){expect(r.status(),await r.text()).toBe(status);return ((await r.json()) as {data:any}).data;}
test('ajustes reais: delegação, retomada, Storage revogado, cliente avisado e link até seu pedido',async({page,request})=>{
 const owner=await actor('manager'),worker=await actor('serviceworker'),client=await actor('portalclient'),other=await actor('relationclient');
 const post=(a:typeof owner,path:string,body:Record<string,unknown>)=>request.post(`/api${path}`,{headers:a.headers,data:{office_id:office,...body}});
 try{
  const roster=await owner.sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'serviceworker@example.test',p_status:'all'});expect(roster.error).toBeNull();const member=roster.data.items[0].id;
  expect((await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:member,p_role_code:'employee',p_active:true,p_permissions:['foundation.access','requests.read','requests.update','requests.transfer','files.read','files.upload','checklists.read','checklists.update'],p_request_id:randomUUID()})).error).toBeNull();
  const created=await value(await post(client,'/requests',{idempotency_key:randomUUID(),request:{origin:'portal',title:'Delegação local fictícia',message:'Mensagem própria sem dados reais.'}}),201);
  const action=(a:typeof owner,version:number,mutation:unknown)=>post(a,`/requests/${created.id}/actions`,{expected_version:version,mutation});
  const delegated=await value(await action(owner,1,{kind:'transfer',assignee_id:member,reason:'Delegação privada fictícia'}));expect(delegated.following_only).toBe(true);expect(delegated.can_reclaim).toBe(true);
  const bytes=Buffer.from('%PDF-1.4\n% Local fictício sem dados pessoais\n%%EOF\n');
  const intention=await value(await post(worker,'/attachments/intents',{input:{request_id:created.id,request_item_id:null,name:'ficticio.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'documento',idempotency_key:randomUUID()}}),201);
  await value(await action(owner,2,{kind:'reclaim',reason:'Retomada privada fictícia'}));
  const following=await value(await post(worker,`/requests/${created.id}/detail`,{page:1}));expect(following).toMatchObject({following_only:true,can_update:false,can_transfer:false,can_cancel:false,can_reclaim:false});
  expect((await action(worker,3,{kind:'note',note:'Tentativa privada'})).status()).toBe(403);
  expect((await action(worker,3,{kind:'transfer',assignee_id:member,reason:'Tentativa de retorno'})).status()).toBe(403);
  expect((await worker.sdk.storage.from(intention.bucket).upload(intention.object_path,bytes,{contentType:'application/pdf'})).error).not.toBeNull();
  expect((await post(worker,'/attachments/process',{action:'validate',args:{intent_id:intention.intent_id}})).status()).toBe(403);
  expect((await post(worker,'/checklists/apply',{request_id:created.id,item_id:randomUUID()})).status()).toBe(403);
  const mine=await value(await post(worker,'/requests/search',{query:created.protocol,scope:'mine',status:'',page:1,size:3}));expect(mine.items.map((r:{id:string})=>r.id)).toContain(created.id);
  const notices=await value(await post(client,'/notifications/search',{query:created.protocol,read:'all',kind:'all',page:1,size:3}));expect(notices.total).toBe(2);expect(notices.items.map((n:{attendant_name:string})=>n.attendant_name).sort()).toEqual(['Funcionário de serviços','Gestor de teste']);expect(JSON.stringify(notices)).not.toMatch(/role_code|actor_id|reason|private|privada|customer_id/);
  const foreign=await value(await post(other,'/notifications/search',{query:created.protocol,read:'all',kind:'all',page:1,size:3}));expect(foreign.total).toBe(0);expect((await post(other,'/notifications/read',{id:notices.items[0].id})).status()).toBe(404);
  await page.setViewportSize({width:360,height:760});await page.goto('/login-cliente');await page.getByLabel('E-mail',{exact:true}).fill('portalclient@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área do cliente',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.getByRole('link',{name:/Abrir notificações/}).click();await page.getByRole('searchbox',{name:'Buscar solicitação'}).fill(created.protocol);await page.getByRole('button',{name:'Buscar',exact:true}).click();
  await expect(page.getByRole('list',{name:'Notificações do atendimento'})).toContainText('Gestor de teste assumiu');await page.getByRole('link',{name:`Abrir ${created.protocol}`}).first().click();await expect(page.getByRole('heading',{name:'Delegação local fictícia',exact:true})).toBeVisible();await expect(page.getByText('Gestor de teste',{exact:true})).toBeVisible();await expect(page.getByText(/Carregando|Aguarde|Salvando/)).toHaveCount(0);
 }finally{await Promise.all([owner,worker,client,other].map(a=>a.sdk.auth.dispose()));}
});
