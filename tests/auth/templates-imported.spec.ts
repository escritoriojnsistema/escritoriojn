import {test,expect} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {emptyTemplate,type TemplateInput} from '../../shared/templates';
import {emptyService} from '../../shared/services';
import {resolveDocument} from '../../shared/documentRender';
import type {DocumentDetail} from '../../shared/documents';

const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
function importLocal(definition:TemplateInput){
 const container=process.env.AUTH_LAB_DB_CONTAINER;
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!/^jn-auth-lab-[0-9a-f-]{36}-postgres$/.test(container??''))throw Error('This fixture requires the disposable local laboratory.');
 const env={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[name];
 const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
 const result=execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',container!,'psql','-X','-v','ON_ERROR_STOP=1','-q','-A','-t','-U','postgres','-d','auth_lab'],{env,timeout:10000,encoding:'utf8',input:`BEGIN;SET LOCAL ROLE migrator;SELECT private.import_template_drafts('${office}','local-${randomUUID()}','https://example.test/reviewed-fixture',${quote(JSON.stringify([definition]))}::jsonb);COMMIT;`});
 return JSON.parse(result.trim()).items[0] as {id:string;version_id:string};
}

test('pós21 real: minuta técnica, aprovação explícita e sete campos manuais atravessam navegador/API/banco',async({page,request})=>{
 test.setTimeout(90000);
 const suffix=randomUUID().slice(0,8).toUpperCase(),name='Minuta local importada '+suffix;
 const types=['text','date','money','number','cpf','cnpj','tax_id'] as const;
 const labels=['Texto livre','Data contratual','Valor contratual','Quantidade contratual','CPF específico','CNPJ específico','CPF ou CNPJ'];
 const variables=types.map((type,i)=>({key:'documento.campo_'+i,label:labels[i],type,required:true}));
 const definition:TemplateInput={...emptyTemplate,code:'IMP-'+suffix,name,demonstration:true,review_required:true,content:variables.map(v=>v.label+': {{'+v.key+'}}').join('\n'),variables};
 const imported=importLocal(definition);
 const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  expect((await sdk.auth.signInWithPassword({email:'manager@example.test',password})).error).toBeNull();
  const session=(await sdk.auth.getSession()).data.session!,headers={Authorization:'Bearer '+session.access_token};
  async function post(path:string,body:unknown,status=200){const r=await request.post(path,{headers,data:body});expect(r.status(),path).toBe(status);return (await r.json()).data;}
  let detail=await post('/api/templates/detail',{office_id:office,template_id:imported.id,page:1});
  expect(detail.versions[0].created_by).toBeNull();expect(detail.versions[0].source_import_id).toMatch(/^[0-9a-f-]{36}$/);expect(detail.versions[0].approved_at).toBeNull();
  const options={office_id:office,kind:'templates',request_id:null,query:name,page:1};expect((await post('/api/documents/options',options)).total).toBe(0);
  await page.setViewportSize({width:360,height:740});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.goto('/modelos');await page.getByLabel('Buscar modelo',{exact:true}).fill(name);await page.getByRole('button',{name:'Buscar',exact:true}).click();await page.getByRole('button',{name:'Ver modelo '+name,exact:true}).click();await expect(page.getByText('Importação técnica não substitui revisão e aprovação humana desta versão.',{exact:true})).toBeVisible();
  await page.getByLabel('Motivo da aprovação',{exact:true}).fill('Revisão humana explícita de fixture local sem validade operacional');const approval=page.waitForResponse(r=>r.url().endsWith('/api/templates/approve'));await page.getByRole('button',{name:'Aprovar versão',exact:true}).click();expect((await approval).status()).toBe(200);
  expect((await post('/api/documents/options',options)).total).toBe(1);
  const customer=await post('/api/customers',{office_id:office,customer:{kind:'person',name:'Pessoa fictícia importada '+suffix,identifier:'',contacts:[]}},201);
  const service=await post('/api/services',{office_id:office,service:{...emptyService,code:'IMP-'+suffix,name:'Serviço fictício importado '+suffix,category:'Homologação',price_cents:1050},reason:'Fixture local de integração'},201);
  const attendance=await post('/api/requests',{office_id:office,idempotency_key:randomUUID(),request:{origin:'presencial',title:name,customer_id:customer.id,assignee_id:null,priority:'normal',priority_reason:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}],internal_note:''}},201);
  let document:DocumentDetail=await post('/api/documents/create',{office_id:office,request_id:attendance.id,request_item_id:attendance.items[0].id,template_version_id:imported.version_id,participants:[],idempotency_key:randomUUID()});expect(document.issues.filter(i=>i.code==='required')).toHaveLength(7);
  await page.goto('/documentos');await page.getByRole('button',{name:'Abrir documento '+name,exact:true}).click();await page.getByRole('tab',{name:'Dados',exact:true}).click();
  const values=['😀'.repeat(2000),'2026-10-27','200.50','12.5','52998224725','11222333000181','11222333000181'];
  for(let i=0;i<values.length;i++)await page.getByLabel(labels[i]+' *',{exact:true}).fill(values[i]);
  await expect(page.getByLabel('CPF ou CNPJ *',{exact:true})).toHaveValue('11.222.333/0001-81');
  await expect.poll(async()=>{const d=await post('/api/documents/detail',{office_id:office,document_id:document.id,revision:null,history_page:1});return d.input.overrides['documento.campo_6'];}).toBe(values[6]);
  document=await post('/api/documents/detail',{office_id:office,document_id:document.id,revision:null,history_page:1});expect(document.issues).toEqual([]);expect(document.input.overrides['documento.campo_0']).toBe(values[0]);expect(document.source.service.total_cents).toBe(1050);expect(document.values['documento.campo_2']).toBe('200.50');
  const resolved=resolveDocument(definition,document.input,document.source,[]);expect(document.values).toEqual(resolved.values);expect(document.formatted).toEqual(resolved.formatted);expect(document.rendered_content).toBe(resolved.rendered_content);
  await page.getByRole('tab',{name:'Revisão',exact:true}).click();const prepared=page.waitForResponse(r=>r.url().endsWith('/api/documents/operate'));await page.getByRole('button',{name:'Concluir preenchimento',exact:true}).click();expect((await prepared).status()).toBe(200);expect((await (await prepared).json()).data.status).toBe('prepared');
  detail=await post('/api/templates/save',{office_id:office,template_id:imported.id,definition:{...definition,content:definition.content+'\nNova versão humana.'},expected_version:1,reason:'Edição humana local posterior à importação',idempotency_key:randomUUID()});expect(detail.versions[0].created_by).toBe(session.user.id);expect(detail.versions[0].source_import_id).toBeNull();expect(detail.versions[0].approved_at).toBeNull();expect(detail.versions[1].id).toBe(imported.version_id);expect(detail.versions[1].created_by).toBeNull();
 }finally{await sdk.auth.dispose();}
});
