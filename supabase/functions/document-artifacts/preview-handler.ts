import type {SupabaseClient} from '@supabase/supabase-js';
import {renderDocumentPreview} from './preview-renderer.ts';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const digest=async(b:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b as Uint8Array<ArrayBuffer>))).map(x=>x.toString(16).padStart(2,'0')).join('');
const max=3145728;
const headers={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
class PreviewError extends Error{constructor(public status:number){super('Preview unavailable');}}
function checkRpc(e:{code?:string}|null){if(e)throw new PreviewError(Number(/^PT(401|403|404|409|422)$/.exec(e.code??'')?.[1]??503));}
function path(v:unknown,office:string,id:string):v is string{return typeof v==='string'&&v.split('/').length===3&&v.split('/').every(uuid)&&v.startsWith(office+'/'+id+'/');}
async function bounded(r:Response){if(!r.ok||Number(r.headers.get('Content-Length'))>max||!r.body){await r.body?.cancel();throw new PreviewError(503);}const reader=r.body.getReader(),parts:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new PreviewError(503);}parts.push(value);}}finally{reader.releaseLock();}const b=new Uint8Array(size);let n=0;for(const p of parts){b.set(p,n);n+=p.length;}return b;}
function metadata(v:unknown,office:string,id:string){if(!object(v)||v.version_id!==id||v.bucket!=='jn-document-artifacts'||!path(v.object_path,office,id)||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||typeof v.size_bytes!=='number'||!Number.isSafeInteger(v.size_bytes)||v.size_bytes<1||v.size_bytes>max||typeof v.filename!=='string'||!/^DOC-[A-Za-z0-9-]+\.pdf$/.test(v.filename)||!Number.isSafeInteger(v.revision)||Number(v.revision)<1)throw new PreviewError(503);return {object_path:v.object_path,sha256:v.sha256,size_bytes:v.size_bytes,filename:v.filename,revision:v.revision};}
export async function serveDocumentPreview({office,versionId,caller,admin,url,serviceKey,fetcher}:{office:string;versionId:string;caller:SupabaseClient;admin:SupabaseClient;url:string;serviceKey:string;fetcher:typeof fetch}):Promise<Response>{
 try{
  const begin=await caller.rpc('document_version_begin',{p_office_id:office,p_version_id:versionId});checkRpc(begin.error);const j:unknown=begin.data;
  if(!object(j)||!uuid(j.job_id)||!uuid(j.lease_token)||j.version_id!==versionId||j.office_id!==office||j.bucket!=='jn-document-artifacts'||!path(j.object_path,office,versionId)||typeof j.completed!=='boolean')throw new PreviewError(503);
  if(!j.completed){
   if(typeof j.content!=='string'||typeof j.title!=='string'||typeof j.protocol!=='string'||typeof j.created_at!=='string'||typeof j.revision!=='number'||await digest(new TextEncoder().encode(j.content))!==j.content_sha256)throw new PreviewError(503);
   let bytes:Uint8Array;try{bytes=await renderDocumentPreview({title:j.title,protocol:j.protocol,content:j.content||'(Documento sem conteúdo)',created_at:j.created_at,revision:j.revision});}catch{throw new PreviewError(422);}
   const sha=await digest(bytes);const upload=await admin.storage.from('jn-document-artifacts').upload(j.object_path,bytes,{contentType:'application/pdf',upsert:false});
   if(upload.error){const existing=await bounded(await fetcher(`${url}/storage/v1/object/authenticated/jn-document-artifacts/${j.object_path}`,{headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},cache:'no-store'}));if(existing.length!==bytes.length||await digest(existing)!==sha)throw new PreviewError(503);}
   const complete=await admin.rpc('document_version_complete',{p_job_id:j.job_id,p_lease_token:j.lease_token,p_sha256:sha,p_size_bytes:bytes.length});checkRpc(complete.error);
  }
  const args={p_office_id:office,p_version_id:versionId,p_receipt:false};
  const allowed=await caller.rpc('document_version_authorize',args);checkRpc(allowed.error);const a=metadata(allowed.data,office,versionId);
  const bytes=await bounded(await fetcher(`${url}/storage/v1/object/authenticated/jn-document-artifacts/${a.object_path}`,{headers:{apikey:serviceKey,Authorization:'Bearer '+serviceKey},cache:'no-store'}));
  if(bytes.length!==a.size_bytes||await digest(bytes)!==a.sha256)throw new PreviewError(503);
  const final=await caller.rpc('document_version_authorize',{...args,p_receipt:true});checkRpc(final.error);const b=metadata(final.data,office,versionId);
  if(JSON.stringify(a)!==JSON.stringify(b))throw new PreviewError(409);
  return new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{...headers,'Content-Type':'application/pdf','Content-Length':String(bytes.length),'Content-Disposition':`inline; filename="${a.filename}"`,'X-Document-SHA256':a.sha256,'X-Document-Version':versionId}});
 }catch(e){const status=e instanceof PreviewError?e.status:503;return new Response(JSON.stringify({error:{code:`DOCUMENT_PREVIEW_${status}`}}),{status,headers:{...headers,'Content-Type':'application/json'}});}
}
