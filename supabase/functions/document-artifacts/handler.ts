import {createClient} from '@supabase/supabase-js';
export type DocumentArtifactsConfig={url:string;anonKey:string;serviceRoleKey:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const headers={'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...headers,'Content-Type':'application/json'}});
const error=(status:number)=>json({error:{code:`DOCUMENT_ARTIFACT_${status}`}},status);
const rpcError=(v:{code?:string})=>error(Number(/^PT(401|403|404|409|422)$/.exec(v.code??'')?.[1]??503));
const maxBytes=3145728;
async function bounded(response:Pick<Response,'body'|'headers'>,limit:number){
 if(Number(response.headers.get('Content-Length'))>limit){await response.body?.cancel();throw Error('SIZE');}
 if(!response.body)throw Error('BODY');const reader=response.body.getReader();const parts:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('SIZE');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))).map(n=>n.toString(16).padStart(2,'0')).join('');
function artifact(v:unknown,office:string):v is Record<string,unknown>&{publication_id:string;object_path:string;bucket:string;sha256:string;size_bytes:number;filename:string}{return object(v)&&uuid(v.publication_id)&&v.bucket==='jn-document-artifacts'&&typeof v.object_path==='string'&&v.object_path.split('/').length===3&&v.object_path.split('/').every(uuid)&&v.object_path.split('/')[0]===office&&typeof v.sha256==='string'&&/^[a-f0-9]{64}$/.test(v.sha256)&&typeof v.size_bytes==='number'&&Number.isSafeInteger(v.size_bytes)&&v.size_bytes>0&&v.size_bytes<=maxBytes&&typeof v.filename==='string'&&/^DOC-[A-Za-z0-9-]+\.pdf$/.test(v.filename);}
export function createDocumentArtifactsHandler(config:DocumentArtifactsConfig){return async(request:Request):Promise<Response>=>{
 if(request.method!=='POST')return error(405);
 const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(request.headers.get('Authorization')??'')?.[1];if(!token)return error(401);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return error(415);
 let body:unknown;try{body=JSON.parse(new TextDecoder().decode(await bounded(request,2048)));}catch(e){return error(e instanceof Error&&e.message==='SIZE'?413:400);}
 if(!object(body)||Object.keys(body).length!==3||!uuid(body.office_id)||!uuid(body.publication_id)||!['generate','download','preview'].includes(String(body.action)))return error(422);
 if(!config.url||!config.anonKey||!config.serviceRoleKey)return error(503);
 const office=body.office_id,pub=body.publication_id;
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(20000),...(init?.signal?[init.signal]:[])])})}};
 try{
 const caller=createClient(config.url,config.anonKey,{...options,global:{...options.global,headers:{Authorization:'Bearer '+token}}});
 const identity=await caller.auth.getUser(token);if(identity.error||!identity.data.user)return error(identity.error?.status&&identity.error.status<429?401:503);
 const admin=createClient(config.url,config.serviceRoleKey,options);
 if(body.action==='preview'){
 const {serveDocumentPreview}=await import('./preview-handler.ts');
 return serveDocumentPreview({office,versionId:pub,caller,admin,url:config.url,serviceKey:config.serviceRoleKey,fetcher:options.global.fetch});
 }
 if(body.action==='generate'){
 const claim=await caller.rpc('document_artifact_begin',{p_office_id:office,p_publication_id:pub});if(claim.error)return rpcError(claim.error);
 const j:unknown=claim.data;
 if(!object(j)||!uuid(j.job_id)||!uuid(j.lease_token)||j.publication_id!==pub||j.office_id!==office||j.bucket!=='jn-document-artifacts'||typeof j.object_path!=='string'||j.object_path.split('/').length!==3||!j.object_path.split('/').every(uuid)||j.object_path.split('/')[0]!==office||j.object_path.split('/')[1]!==pub||typeof j.completed!=='boolean')return error(503);
 if(j.completed)return json({data:{publication_id:pub,ready:true}});
 if(typeof j.content!=='string'||typeof j.title!=='string'||typeof j.protocol!=='string'||typeof j.created_at!=='string'||typeof j.signature_policy!=='string'||await sha(new TextEncoder().encode(j.content))!==j.content_sha256)return error(503);
 const renderer=j.renderer_version??'jn-document-v1';
 if(!['jn-document-v1','jn-document-v2'].includes(String(renderer)))return error(503);
 const renderDocumentPdf=renderer==='jn-document-v2'?(await import('./renderer-v2.ts')).renderDocumentPdfV2:(await import('./renderer.ts')).renderDocumentPdf;
 let bytes:Uint8Array;try{bytes=await renderDocumentPdf({content:j.content,title:j.title,protocol:j.protocol,created_at:j.created_at,signature_policy:j.signature_policy});}catch{return error(422);}
 const digest=await sha(bytes);
 const upload=await admin.storage.from('jn-document-artifacts').upload(j.object_path,bytes,{contentType:'application/pdf',upsert:false});
 if(upload.error){const existing=await admin.storage.from('jn-document-artifacts').download(j.object_path);if(existing.error||!existing.data||existing.data.size>maxBytes||existing.data.size!==bytes.length||await sha(new Uint8Array(await existing.data.arrayBuffer()))!==digest)return error(503);}
 const done=await admin.rpc('document_artifact_complete',{p_job_id:j.job_id,p_lease_token:j.lease_token,p_sha256:digest,p_size_bytes:bytes.length,p_renderer:renderer});if(done.error)return rpcError(done.error);
 return json({data:{publication_id:pub,ready:true}});
 }
 const allowed=await caller.rpc('document_artifact_authorize',{p_office_id:office,p_publication_id:pub,p_receipt:false});if(allowed.error)return rpcError(allowed.error);
 if(!artifact(allowed.data,office)||allowed.data.publication_id!==pub)return error(503);const a=allowed.data;
 // Stream with a hard byte bound; no public/signed URL is produced.
 const response=await options.global.fetch(`${config.url}/storage/v1/object/authenticated/${a.bucket}/${a.object_path}`,{headers:{apikey:config.serviceRoleKey,Authorization:'Bearer '+config.serviceRoleKey},cache:'no-store'});
 if(!response.ok){await response.body?.cancel();return error(503);}const bytes=await bounded(response,maxBytes);
 if(bytes.length!==a.size_bytes||await sha(bytes)!==a.sha256)return error(503);
 const final=await caller.rpc('document_artifact_authorize',{p_office_id:office,p_publication_id:pub,p_receipt:true});if(final.error)return rpcError(final.error);
 if(!artifact(final.data,office)||final.data.publication_id!==pub||final.data.object_path!==a.object_path||final.data.sha256!==a.sha256||final.data.size_bytes!==a.size_bytes)return error(409);
 return new Response(bytes as Uint8Array<ArrayBuffer>,{headers:{...headers,'Content-Type':'application/pdf','Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${a.filename}"`}});
 }catch{return error(503);}
};}
