import {reportInputV4} from '../../server/modules/governance/reportV4';
import {reportInputV3} from '../../server/modules/governance/reportV3';
import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createAuditPdf} from '../../server/modules/governance/auditPdf';
import {reportInputV1} from '../../server/modules/governance/reportV1';
import {reportInputV2} from '../../server/modules/governance/reportV2';
import type {AuditReport} from '../../shared/governance';
const office=process.env.AUTH_LAB_OFFICE!;
async function actor(name:string){const sdk=createClient(process.env.AUTH_LAB_URL!,process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password:process.env.AUTH_LAB_PASSWORD!})).error).toBeNull();return{sdk,headers:{Authorization:`Bearer ${(await sdk.auth.getSession()).data.session!.access_token}`}};}
test('Auth real: prazo persiste, arquivo é interno, PDF canônico ignora selo forjado e revogação bloqueia histórico',async({page,request})=>{
 const owner=await actor('manager'),admin=await actor('delegate');let previous:{id:string;role_code:string;active:boolean;permissions:string[]}|undefined;
 try{
  const roster=await owner.sdk.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'delegate@example.test',p_status:'all'});expect(roster.error).toBeNull();previous=roster.data.items[0];
  const set=(permissions:string[])=>owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:previous!.id,p_role_code:'admin',p_active:true,p_permissions:permissions,p_request_id:randomUUID()});
  expect((await request.get(`/api/governance/audit?office_id=${office}&view=archived`,{headers:admin.headers})).status()).toBe(403);
  const capabilities=['foundation.access','audit.read','audit.export','audit.manage','audit.archives'];expect((await set(capabilities)).error).toBeNull();
  const database=process.env.AUTH_LAB_DB_CONTAINER!;expect(database).toMatch(/^jn-auth-/);expect(office).toMatch(/^[a-f0-9-]{36}$/);
  const uid=(await owner.sdk.auth.getUser()).data.user!.id;expect(uid).toMatch(/^[a-f0-9-]{36}$/);
  const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
  execFileSync('docker',['--host=unix:///var/run/docker.sock','exec','-i',database,'psql','-X','-v','ON_ERROR_STOP=1','-q','-U','postgres','-d','auth_lab'],{env,stdio:['pipe','ignore','pipe'],input:`INSERT INTO public.audit_events(office_id,actor_id,actor_kind,action,target_type,occurred_at)SELECT '${office}','${uid}','user','test.archive_fixture','office',clock_timestamp()-make_interval(days=>d)FROM unnest(ARRAY[91,61])d;`});
  await page.setViewportSize({width:360,height:640});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('delegate@example.test');await page.getByLabel('Senha',{exact:true}).fill(process.env.AUTH_LAB_PASSWORD!);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.goto('/auditoria');
  await page.getByRole('button',{name:'Relatórios e prazo'}).click();await expect(page.getByLabel('Arquivar após')).toHaveValue('90');await page.getByLabel('Arquivar após').selectOption('60');await page.getByRole('button',{name:'Salvar prazo'}).click();await expect(page.getByRole('status').filter({hasText:'Prazo salvo'})).toBeVisible();
  await page.reload();await page.getByRole('button',{name:'Relatórios e prazo'}).click();await expect(page.getByLabel('Arquivar após')).toHaveValue('60');await page.getByLabel('Arquivar após').selectOption('90');await page.getByRole('button',{name:'Salvar prazo'}).click();await expect(page.getByRole('status').filter({hasText:'Prazo salvo'})).toBeVisible();await page.getByRole('button',{name:'Relatórios e prazo'}).click();await page.getByRole('button',{name:'Arquivados',exact:true}).click();await expect(page.getByRole('list',{name:'Eventos de auditoria'}).locator('li')).toHaveCount(2);
  const {data:report,error}=await admin.sdk.rpc('audit_report_begin',{p_office_id:office,p_action:'test.archive_fixture',p_actor:null,p_from:null,p_until:null,p_view:'archived',p_request_id:randomUUID()});expect(error).toBeNull();expect(report.count).toBe(2);
  const chunk=await admin.sdk.rpc('audit_report_chunk',{p_office_id:office,p_report_id:report.id,p_offset:0});expect(chunk.error).toBeNull();
  const canonical=await createAuditPdf((report.renderer_version===4?reportInputV4:report.renderer_version===3?reportInputV3:report.renderer_version===2?reportInputV2:reportInputV1)(report as AuditReport,chunk.data.items));const digest=createHash('sha256').update(canonical).digest('hex');
  expect((await admin.sdk.rpc('audit_report_seal',{p_office_id:office,p_report_id:report.id,p_sha256:'f'.repeat(64),p_bytes:123})).error).toBeNull();
  const verify=async(sha256:string)=>request.post('/api/governance/audit/verify',{headers:admin.headers,data:{office_id:office,report_id:report.id,sha256}});
  const good=await verify(digest);expect(good.status()).toBe(200);expect((await good.json()).data.match).toBe(true);expect((await (await verify('f'.repeat(64))).json()).data.match).toBe(false);
  expect((await admin.sdk.rpc('audit_report_seal',{p_office_id:office,p_report_id:report.id,p_sha256:digest,p_bytes:canonical.length})).error).toBeNull();
  expect((await set(capabilities.filter(p=>p!=='audit.archives'))).error).toBeNull();expect((await verify(digest)).status()).toBe(403);expect((await admin.sdk.rpc('audit_report_chunk',{p_office_id:office,p_report_id:report.id,p_offset:0})).error?.code).toBe('PT403');
 }finally{if(previous)await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:previous.id,p_role_code:previous.role_code,p_active:previous.active,p_permissions:previous.permissions,p_request_id:randomUUID()});await admin.sdk.auth.dispose();await owner.sdk.auth.dispose();}
});
