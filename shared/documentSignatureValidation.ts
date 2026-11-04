import {documentExact as exact,documentObject as object,documentUuid as uuid} from './documents.js';
import {workflowBlockers} from './documentWorkflow.js';
import type {SignatureCommand,SignatureState,SignatureEvent,SignatureFile} from './documentSignatures.js';
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<2147483647;
const text=(v:unknown,max:number,min=1):v is string=>typeof v==='string'&&Array.from(v.trim()).length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const signers=(v:unknown,min=0):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=20&&v.every(s=>text(s,120)&&s===s.trim())&&new Set(v).size===v.length;
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function validSignatureCommand(v:unknown):v is SignatureCommand{
 if(!object(v)||!integer(v.expected_revision,1)||!(v.expected_event_id===null||uuid(v.expected_event_id))||!text(v.reason,500))return false;
 const base=['kind','expected_revision','expected_event_id','reason'];
 switch(v.kind){
 case'configure':return exact(v,[...base,'mode','exit_policy','expected_signers'])&&['none','physical','external'].includes(String(v.mode))&&['after_settlement','before_settlement'].includes(String(v.exit_policy))&&signers(v.expected_signers,v.mode==='none'?0:1)&&(v.mode!=='none'||v.expected_signers.length===0);
 case'import':return exact(v,[...base,'file_id'])&&uuid(v.file_id);
 case'validate':return exact(v,[...base,'result','verified_signers','evidence','sha256'])&&['validated','invalid'].includes(String(v.result))&&signers(v.verified_signers,v.result==='validated'?1:0)&&text(v.evidence,2000,5)&&hash(v.sha256);
 case'physical':return exact(v,[...base,'verified_signers','evidence','signed_on','custody','notary_reference'])&&signers(v.verified_signers,1)&&text(v.evidence,2000,5)&&date(v.signed_on)&&text(v.custody,500)&&text(v.notary_reference,500,0);
 case'revoke':return exact(v,base);
 default:return false;
 }
}
export function projectSignatureState(v:unknown):SignatureState{
 if(!object(v)||!uuid(v.publication_id)||!uuid(v.document_id)||!uuid(v.request_id)||!integer(v.revision,1)||!['none','physical','external'].includes(String(v.mode))||!['after_settlement','before_settlement'].includes(String(v.exit_policy))||!signers(v.expected_signers)||!signers(v.verified_signers)||!['not_required','pending','in_validation','validated','invalid'].includes(String(v.status))||!(v.last_event_id===null||uuid(v.last_event_id))||['can_manage','can_validate','can_exit'].some(k=>typeof v[k]!=='boolean')||!Array.isArray(v.exit_blockers)||v.exit_blockers.some(b=>typeof b!=='string'||!Object.hasOwn(workflowBlockers,b))||v.can_exit===true&&v.exit_blockers.length>0||!Array.isArray(v.history)||v.history.length>5||!integer(v.history_total)||!integer(v.page,1)||v.page_size!==5)throw Error('Invalid signature state');
 for(const [key,max]of[['evidence',2000],['custody',500],['notary_reference',500]]as const)if(!(v[key]===null||text(v[key],max,key==='notary_reference'?0:1)))throw Error('Invalid signature evidence');
 if(!(v.signed_on===null||date(v.signed_on)))throw Error('Invalid physical date');
 let file:SignatureFile|null=null;
 if(v.file!==null){const f=v.file;if(!object(f)||!uuid(f.id)||!text(f.name,180)||!hash(f.sha256)||!integer(f.size_bytes,1)||f.size_bytes>3145728||!['aguardando_upload','quarentena','disponivel','rejeitado','removido'].includes(String(f.status))||!['not_configured','pending','clean','infected'].includes(String(f.scanner_status)))throw Error('Invalid signature file');file={id:f.id,name:f.name,sha256:f.sha256,size_bytes:f.size_bytes,status:String(f.status),scanner_status:String(f.scanner_status)};}
 const history:SignatureEvent[]=v.history.map(e=>{if(!object(e)||!uuid(e.id)||!['configure','import','validate','physical','physical_legacy','revoke','exit'].includes(String(e.kind))||!text(e.actor_name,160)||typeof e.created_at!=='string'||!Number.isFinite(Date.parse(e.created_at))||!text(e.reason,500))throw Error('Invalid signature history');return{id:e.id,kind:String(e.kind),actor_name:e.actor_name,created_at:e.created_at,reason:e.reason};});
 return {publication_id:v.publication_id,document_id:v.document_id,request_id:v.request_id,revision:v.revision,mode:v.mode as SignatureState['mode'],exit_policy:v.exit_policy as SignatureState['exit_policy'],expected_signers:[...v.expected_signers],verified_signers:[...v.verified_signers],status:v.status as SignatureState['status'],last_event_id:v.last_event_id,can_manage:v.can_manage as boolean,can_validate:v.can_validate as boolean,can_exit:v.can_exit as boolean,exit_blockers:[...v.exit_blockers]as string[],file,evidence:v.evidence as string|null,signed_on:v.signed_on as string|null,custody:v.custody as string|null,notary_reference:v.notary_reference as string|null,history,history_total:v.history_total,page:v.page,page_size:5};
}
