import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {emptyService} from '../../shared/services.ts';
import {emptyTemplate} from '../../shared/templates.ts';
// Every business row is created through the real local API. This fixture does
// not mark scanner results/signatures/settlement/identity as approved by SQL.
export async function correctionDocuments({post,lab,users,office,categoryName}){
 const data=async(path,body,status=200)=>(await(await post('owner',path,body,status)).json()).data;
 const suffix=randomUUID().slice(0,8).toUpperCase(),title='Documento local '+suffix;
 const customer=await data('customers',{customer:{kind:'person',name:'Titular exportação local',identifier:'',contacts:[]}},201);
 const membership=(await lab.sql(`SELECT id FROM public.memberships WHERE office_id='${office}' AND user_id='${users.closing}';`,'migrator')).trim();
 await data('customer-relations/command',{customer_id:customer.id,action:'identity.verify',payload:{membership_id:membership,evidence:'Conferência humana FICTÍCIA exclusivamente local'}});
 const template=await data('templates/save',{template_id:null,definition:{...emptyTemplate,code:'EXP-'+suffix,name:title,content:'Documento FICTÍCIO de laboratório para exportação exata.',demonstration:false,review_required:false,signature_policy:'none'},expected_version:0,reason:'Fixture local de exportação',idempotency_key:randomUUID()});
 const templateVersion=template.versions[0].id;
 await data('templates/approve',{template_id:template.id,version_id:templateVersion,expected_version:1,reason:'Aprovação exclusivamente local',idempotency_key:randomUUID()});
 const service=await data('services',{service:{...emptyService,code:'EXP-'+suffix,name:title,category:categoryName,price_cents:100},reason:'Fixture local de exportação'},201);
 const attendance=await data('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title,customer_id:customer.id,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 const charge=await data('charges/create',{request_id:attendance.id,installments:[{due_date:new Date().toISOString().slice(0,10),amount_cents:100}],idempotency_key:randomUUID()});
 const configure=async(configuration)=>(await data('cash/configure',{configuration,idempotency_key:randomUUID()})).resource.id;
 const unit=await configure({kind:'unit',id:null,expected_version:null,name:'Unidade local '+suffix,active:true});
 const account=await configure({kind:'account',id:null,expected_version:null,name:'Espécie local '+suffix,active:true,unit_id:unit,type:'cash'});
 const method=await configure({kind:'payment_method',id:null,expected_version:null,name:'Forma local '+suffix,active:true,unit_id:unit,type:'cash',destination_account_id:account});
 const opened=await data('cash/open',{unit_id:unit,cash_account_id:account,opening_cents:0,idempotency_key:randomUUID()}),cash=opened.sessions.find(s=>s.unit_id===unit).id;
 await data('cash/payment',{operation:{kind:'record',session_id:cash,expected_version:1,idempotency_key:randomUUID(),evidence:'Pagamento FICTÍCIO local',payment_method_id:method,status:'confirmed',allocations:[{charge_id:charge.charge.id,expected_charge_version:1,amount_cents:100}],presented_cents:100,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null}});
 const documents=[];
 async function createDocument(){
  let doc=await data('documents/create',{request_id:attendance.id,request_item_id:attendance.items[0].id,template_version_id:templateVersion,participants:[],idempotency_key:randomUUID()});
  doc=await data('documents/operate',{document_id:doc.id,operation:{kind:'prepare',expected_revision:doc.revision,idempotency_key:randomUUID()}});
  const workflow=async(command)=>data('document-workflow/command',{document_id:doc.id,command:{expected_revision:doc.revision,reason:'Publicação local de exportação',...command},idempotency_key:randomUUID()});
  const frozen=await workflow({kind:'freeze'}),publication=frozen.publications[0];
  await data('document-workflow/artifact',{publication_id:publication.id,action:'generate'});
  await workflow({kind:'handoff',publication_id:publication.id});
  const response=await post('owner','document-workflow/artifact',{publication_id:publication.id,action:'download'});
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),response.headers.get('x-document-sha256'));
  documents.push({id:publication.id,documentId:doc.id,bytes});return publication.id;
 }
 await createDocument();
 const pdf=await post('closing','account-closure/export',{});assert.match(pdf.headers.get('content-type'),/^application\/pdf/);assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),documents[0].bytes);
 await createDocument();
 const zip=await post('closing','account-closure/export',{});assert.match(zip.headers.get('content-type'),/^application\/zip/);
 const archive=Buffer.from(await zip.arrayBuffer()),unpacked=[];let offset=0;
 while(archive.readUInt32LE(offset)===0x04034b50){assert.equal(archive.readUInt16LE(offset+8),0);const length=archive.readUInt32LE(offset+18),nameLength=archive.readUInt16LE(offset+26),extraLength=archive.readUInt16LE(offset+28),start=offset+30+nameLength+extraLength;unpacked.push(archive.subarray(start,start+length));offset=start+length;}
 assert.equal(unpacked.length,2);assert.deepEqual(unpacked.map(b=>createHash('sha256').update(b).digest('hex')).sort(),documents.map(d=>createHash('sha256').update(d.bytes).digest('hex')).sort());
 async function verifyRetention({worker,admin}){
  const detail=await data(`requests/${attendance.id}/detail`,{page:1});
  await data(`requests/${attendance.id}/actions`,{expected_version:detail.version,mutation:{kind:'status',status:'concluido',reason:'Conclusão FICTÍCIA local para teste de retenção'}});
  const target=documents[0],other=documents[1],documentType='laboratory-pdf-'+suffix;
  const read=async(sql)=>JSON.parse((await lab.sql(sql,'migrator')).trim());
  const paths=await read(`SELECT coalesce(json_agg(object_path),'[]') FROM private.document_artifact_jobs WHERE publication_id='${target.id}';`);
  assert.ok(paths.length>0);
  for(const path of paths){const object=await admin.storage.from('jn-document-artifacts').download(path);assert.ifError(object.error);assert.deepEqual(Buffer.from(await object.data.arrayBuffer()),target.bytes);}
  const unchanged=()=>read(`SELECT json_build_object('ledger',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM private.cash_entries x WHERE office_id='${office}'),'history',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM private.document_publication_events x WHERE office_id='${office}'),'artifacts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM private.document_artifact_jobs x WHERE office_id='${office}'),'revisions',(SELECT coalesce(jsonb_agg(to_jsonb(x)-ARRAY['input','source','source_customer_id','author_name'] ORDER BY document_id,revision),'[]') FROM private.document_revisions x WHERE office_id='${office}'),'publications',(SELECT coalesce(jsonb_agg(to_jsonb(x)-ARRAY['title','content'] ORDER BY id),'[]') FROM private.document_publications x WHERE office_id='${office}'));`);
  const before=await unchanged();
  await data('retention/policy',{input:{data_class:'optional',document_type:documentType,legal_basis:'EXCLUSIVAMENTE fixture local descartável; sem fundamento jurídico real',justification:'Prazo zero exclusivo para provar expurgo local',start_event:'account_closed',period_days:0,review_at:new Date(Date.now()+86400000).toISOString(),backup_disposition:'Laboratório descartável sem backup; não representa política real',revision:0,approved:true}});
  await data('retention/classify',{input:{user_id:users.closing,target_kind:'document',target_id:target.documentId,data_class:'optional',document_type:documentType,revision:0}});
  const hold=await data('retention/hold',{input:{user_id:users.closing,data_class:'optional',reason:'Hold FICTÍCIO local impede auto agendamento',release_id:null}});
  assert.deepEqual((await worker()).body.data,{processed:0,pending:0});
  assert.equal((await lab.sql(`SELECT count(*) FROM private.retention_purges;`,'migrator')).trim(),'0');
  for(const path of paths)assert.ifError((await admin.storage.from('jn-document-artifacts').download(path)).error);
  await data('retention/hold',{input:{user_id:users.closing,data_class:'optional',reason:'Liberação FICTÍCIA local para testar auto agendamento',release_id:hold.id}});
  // No retention/reserve invocation: the real service-role claim schedules due work.
  const completed=await worker();assert.equal(completed.status,200);assert.deepEqual(completed.body.data,{processed:1,pending:0});
  for(const path of paths){const gone=await admin.storage.from('jn-document-artifacts').download(path);assert.ok(gone.error);assert.equal(gone.data,null);}
  const redacted=await read(`SELECT json_build_object('purged',EXISTS(SELECT FROM private.retention_items WHERE target_id='${target.documentId}' AND purged_at IS NOT NULL),'completed',EXISTS(SELECT FROM private.retention_purges j JOIN private.retention_items i ON i.id=j.item_id WHERE i.target_id='${target.documentId}' AND j.completed_at IS NOT NULL),'document',EXISTS(SELECT FROM public.documents WHERE id='${target.documentId}' AND title='Documento eliminado'),'revisions',NOT EXISTS(SELECT FROM private.document_revisions WHERE document_id='${target.documentId}' AND (input<>'{}' OR source<>'{}' OR author_name<>'Registro preservado')),'publication',EXISTS(SELECT FROM private.document_publications WHERE id='${target.id}' AND content='[Documento eliminado]' AND title='Documento eliminado'),'versions',NOT EXISTS(SELECT FROM private.document_versions WHERE document_id='${target.documentId}' AND (content<>'' OR snapshot<>'{}' OR title<>'Documento eliminado' OR author_name<>'Registro preservado')));`);
  assert.deepEqual(redacted,{purged:true,completed:true,document:true,revisions:true,publication:true,versions:true});
  assert.deepEqual(await unchanged(),before);
  assert.deepEqual((await worker()).body.data,{processed:0,pending:0});
  assert.deepEqual(await unchanged(),before);
  const otherPaths=await read(`SELECT json_agg(object_path) FROM private.document_artifact_jobs WHERE publication_id='${other.id}';`);
  for(const path of otherPaths){const retained=await admin.storage.from('jn-document-artifacts').download(path);assert.ifError(retained.error);assert.deepEqual(Buffer.from(await retained.data.arrayBuffer()),other.bytes);}
  const otherDocument=await post('owner','document-workflow/artifact',{publication_id:other.id,action:'download'});assert.deepEqual(Buffer.from(await otherDocument.arrayBuffer()),other.bytes);
 }
 return{documents,createDocument,verifyRetention,customerId:customer.id};
}
