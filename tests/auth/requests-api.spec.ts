import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {emptyService} from '../../shared/services';

const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
async function sdkFor(name:string){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();const {data}=await sdk.auth.getSession();return {sdk,headers:{Authorization:`Bearer ${data.session!.access_token}`},uid:data.session!.user.id};}
test('pedidos reais API: snapshot, protocolo, repetição, escopo e transferência',async({request})=>{
 const owner=await sdkFor('manager'),worker=await sdkFor('serviceworker'),other=await sdkFor('other');
 try{
  const roster=await owner.sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'serviceworker@example.test',p_status:'all'});expect(roster.error).toBeNull();const membership=roster.data.items[0].id;
  const caps=['foundation.access','services.read','services.perform','requests.read','requests.create','requests.update','requests.transfer'];
  expect((await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:membership,p_role_code:'employee',p_active:true,p_permissions:caps,p_request_id:crypto.randomUUID()})).error).toBeNull();
  const service={...emptyService,code:'R10-API-XEROX',name:'R10 API Xerox de Teste',category:'Cópias',price_cents:50};
  const serviceResult=await request.post('/api/services',{headers:owner.headers,data:{office_id:office,service,reason:'Fixture local10'}});expect(serviceResult.status()).toBe(201);const catalog=(await serviceResult.json()).data;
  const item={service_id:catalog.id,quantity:3,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]};
  const body={office_id:office,idempotency_key:crypto.randomUUID(),request:{origin:'whatsapp',title:'R10 API WhatsApp fictício',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',items:[item],internal_note:'Nota restrita fictícia'}};
  const result=await request.post('/api/requests',{headers:worker.headers,data:body});expect(result.status()).toBe(201);let current=(await result.json()).data;const original=current;expect(current.items[0].snapshot.total_cents).toBe(150);expect(current.created_by).toBe(worker.uid);
  const repeated=await request.post('/api/requests',{headers:worker.headers,data:body});expect(repeated.status()).toBe(201);expect((await repeated.json()).data.id).toBe(current.id);
  const conflict=await request.post('/api/requests',{headers:worker.headers,data:{...body,request:{...body.request,title:'Mudou'}}});expect(conflict.status()).toBe(409);
  expect((await request.post(`/api/services/${catalog.id}/versions`,{headers:owner.headers,data:{office_id:office,service:{...service,price_cents:75},reason:'Nova tabela fictícia',expected_version:1}})).status()).toBe(201);
  const stable=await request.post(`/api/requests/${current.id}/detail`,{headers:worker.headers,data:{office_id:office,page:1}});expect(stable.status()).toBe(200);expect((await stable.json()).data.items[0].snapshot.total_cents).toBe(150);
  expect((await request.post(`/api/requests/${current.id}/detail`,{headers:other.headers,data:{office_id:office,page:1}})).status()).toBe(403);
  const target=await owner.sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'manager@example.test',p_status:'all'});expect(target.error).toBeNull();
  const moved=await request.post(`/api/requests/${current.id}/actions`,{headers:worker.headers,data:{office_id:office,expected_version:current.version,mutation:{kind:'transfer',assignee_id:target.data.items[0].id,reason:'Encaminhamento fictício'}}});expect(moved.status()).toBe(200);current=(await moved.json()).data;expect(current.created_by).toBe(original.created_by);expect(current.history_total).toBe(2);
  const done=await request.post(`/api/requests/${current.id}/actions`,{headers:owner.headers,data:{office_id:office,expected_version:current.version,mutation:{kind:'status',status:'concluido',reason:'Execução fictícia concluída'}}});expect(done.status()).toBe(200);const closed=(await done.json()).data;expect(closed.status).toBe('concluido');expect(closed.items[0].snapshot.definition.settlement_required).toBe(true);expect(closed).not.toHaveProperty('settled');
  expect((await worker.sdk.from('requests').select('*')).error).not.toBeNull();
 }finally{await Promise.all([owner.sdk.auth.dispose(),worker.sdk.auth.dispose(),other.sdk.auth.dispose()]);}
});

test('pedidos reais API: portal confirmado antes de conferência e projeção sem dados internos',async({request})=>{
 const owner=await sdkFor('manager'),a=await sdkFor('portalclient'),b=await sdkFor('relationclient');
 try{
  const opened=await request.post('/api/requests',{headers:a.headers,data:{office_id:office,idempotency_key:crypto.randomUUID(),request:{origin:'portal',title:'R10 Portal fictício',message:'Preciso de triagem antes da conferência'}}});expect(opened.status()).toBe(201);const own=(await opened.json()).data;expect(own.portal).toBe(true);
  const read=await request.post(`/api/requests/${own.id}/detail`,{headers:owner.headers,data:{office_id:office,page:1}});expect(read.status()).toBe(200);const internal=(await read.json()).data;
  expect((await request.post(`/api/requests/${own.id}/actions`,{headers:owner.headers,data:{office_id:office,expected_version:internal.version,mutation:{kind:'note',note:'Nota restrita10 que cliente nunca recebe'}}})).status()).toBe(200);
  const visible=await request.post(`/api/requests/${own.id}/detail`,{headers:a.headers,data:{office_id:office,page:1}});expect(visible.status()).toBe(200);const text=await visible.text();expect(text).not.toContain('Nota restrita10');for(const field of ['created_by','assignee_id','history','customer_id','price_cents','version_id'])expect(text).not.toContain(`"${field}"`);
  expect((await request.post(`/api/requests/${own.id}/detail`,{headers:b.headers,data:{office_id:office,page:1}})).status()).toBe(404);
  expect((await request.post('/api/requests/options',{headers:a.headers,data:{office_id:office,kind:'services',query:'',page:1,size:3}})).status()).toBe(403);
  const list=await request.post('/api/requests/search',{headers:a.headers,data:{office_id:office,query:'R10 Portal',scope:'mine',status:'',page:1,size:3}});expect(list.status()).toBe(200);expect((await list.json()).data.items.every((x:{id:string})=>x.id===own.id)).toBe(true);
 }finally{await Promise.all([owner.sdk.auth.dispose(),a.sdk.auth.dispose(),b.sdk.auth.dispose()]);}
});
