import { Router, json, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { retainBackgroundTask } from '../../background.js';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { teamRoles } from '../../../shared/team.js';
import * as v from './validation.js';

export const teamRouter=Router();
teamRouter.use((_req,res,next)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();
});
teamRouter.use(async(req,res,next)=>{
  const auth=await authenticatedClient(req,res);if(!auth)return;
  res.locals.teamAuth=auth;next();
});
teamRouter.use((req,res,next)=>{
  if(!['GET','HEAD'].includes(req.method) && !req.is('application/json')) {
    errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;
  }
  next();
},json({limit:'4kb'}));
type Identity=NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
const identity=(res:Response)=>res.locals.teamAuth as Identity;
const invalid=(res:Response)=>errorResponse(res,422,'TEAM_VALIDATION','Confira os dados da solicitação.');
const emptyQuery=(req:Request)=>Object.keys(req.query).length===0;
const messages:Record<string,string>={
  AUTH_REQUIRED:'Entre novamente para continuar.',TEAM_FORBIDDEN:'Você não tem permissão para esta operação.',
  LAST_OWNER:'Mantenha ao menos um proprietário ativo.',SELF_CHANGE:'Seu próprio acesso não pode ser alterado por esta operação.',
  TEAM_CONFLICT:'Os dados foram alterados. Atualize a lista antes de continuar.',
  INVITATION_INVALID:'Este convite não está disponível. Peça um novo convite ao escritório.',
  TEAM_VALIDATION:'Confira os dados da solicitação.',TEAM_RATE_LIMIT:'Aguarde antes de tentar novamente.',
};
async function rpc(res:Response,name:string,args:Record<string,unknown>) {
  try {
    const {data,error}=await identity(res).client.rpc(name,args);
    if(error) {
      const status=Number(/^PT(401|403|409|410|422|429)$/.exec(error.code)?.[1]);
      const code=Object.hasOwn(messages,error.message)?error.message:null;
      if(status && code)errorResponse(res,status,code,messages[code]);
      else errorResponse(res,503,'TEAM_UNAVAILABLE','Não foi possível concluir a operação. Atualize a lista antes de repetir.');
      return null;
    }
    if(!v.record(data))throw new Error('Invalid provider response');
    return data;
  } catch {errorResponse(res,503,'TEAM_UNAVAILABLE','Não foi possível concluir a operação. Atualize a lista antes de repetir.');return null;}
}
async function deliver({url,key,token}:Identity,office_id:string,invitation_id:string):Promise<{delivery:'sent'|'failed'|'pending';status?:number}> {
  try {
    const response=await fetch(`${url.replace(/\/$/,'')}/functions/v1/team-invitations`,{
      method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:key,'Content-Type':'application/json'},
      body:JSON.stringify({office_id,invitation_id}),signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)return {delivery:'pending',status:[401,403,409,410,422,429].includes(response.status)?response.status:503};
    const body:unknown=await response.json();
    if(v.record(body) && v.record(body.data) && ['sent','failed','pending'].includes(String(body.data.delivery)))return {delivery:body.data.delivery as 'sent'|'failed'|'pending'};
  } catch { /* The invitation is committed; an uncertain transport must not report success. */ }
  return {delivery:'pending',status:503};
}
teamRouter.get('/',async(req,res)=>{
  const {office_id,kind='members',page='1',query='',status='all'}=req.query;
  const allowedStatus=kind==='invitations'?['all','pending','accepted','revoked','expired','blocked']:['all','active','inactive'];
  if(Object.keys(req.query).some(key=>!['office_id','kind','page','query','status'].includes(key)) || !v.uuid(office_id)
    || !['members','invitations'].includes(String(kind)) || typeof page!=='string' || !/^[1-9]\d{0,5}$/.test(page)
    || typeof query!=='string' || query.length>120 || typeof status!=='string' || !allowedStatus.includes(status)) {invalid(res);return;}
  const data=await rpc(res,'team_dashboard',{p_office_id:office_id,p_kind:kind,p_page:Number(page),p_query:query.trim(),p_status:status});
  if(data)res.json({data});
});
teamRouter.post('/invitations',async(req,res)=>{
  const b:unknown=req.body;
  if(!emptyQuery(req) || !v.fields(b,['office_id','email','full_name','cpf','role_code','permissions','expires_at']) || !v.uuid(b.office_id)
    || !v.email(b.email) || !v.fullName(b.full_name) || !v.cpf(b.cpf) || !v.role(b.role_code) || !v.permissions(b.permissions) || !v.expiry(b.expires_at,7)) {invalid(res);return;}
  const data=await rpc(res,'team_create_invitation',Object.fromEntries([...Object.entries(b).map(([key,value])=>[`p_${key}`,value]),['p_request_id',randomUUID()]]));
  if(!data)return;
  if(!v.uuid(data.id) || typeof data.expires_at!=='string') {errorResponse(res,503,'TEAM_UNAVAILABLE','Atualize a lista para conferir o convite.');return;}
  // The RPC has committed. Delivery retains its own identity and invocation lifetime,
  // while the caller can continue without waiting for Auth and SMTP round trips.
  const started=performance.now();
  retainBackgroundTask(deliver(identity(res),b.office_id,data.id).then(({delivery,status})=>{
    console.info(JSON.stringify({event:'team_invitation_delivery',delivery,status:status??200,duration_ms:Math.round(performance.now()-started)}));
  }));
  res.status(201).json({data:{id:data.id,expires_at:data.expires_at,delivery:'pending'}});
});
teamRouter.post('/invitations/:id/send',async(req,res)=>{
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(req.body,['office_id']) || !v.uuid(req.body.office_id)) {invalid(res);return;}
  const {delivery,status}=await deliver(identity(res),req.body.office_id,req.params.id);
  if(status) {
    const codes:Record<number,string>={401:'AUTH_REQUIRED',403:'TEAM_FORBIDDEN',409:'TEAM_CONFLICT',410:'INVITATION_INVALID',422:'TEAM_VALIDATION',429:'TEAM_RATE_LIMIT'};
    const code=codes[status]??'TEAM_UNAVAILABLE';errorResponse(res,status,code,messages[code]??'Não foi possível confirmar o envio. Confira a lista antes de repetir.');return;
  }
  res.json({data:{delivery}});
});
teamRouter.post('/invitations/:id/revoke',async(req,res)=>{
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(req.body,['office_id']) || !v.uuid(req.body.office_id)) {invalid(res);return;}
  const data=await rpc(res,'team_revoke_invitation',{p_office_id:req.body.office_id,p_invitation_id:req.params.id,p_request_id:randomUUID()});
  if(data)res.json({data});
});
teamRouter.patch('/members/:id',async(req,res)=>{
  const b:unknown=req.body;
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(b,['office_id','role_code','active','permissions']) || !v.uuid(b.office_id)
    || !v.role(b.role_code) || typeof b.active!=='boolean' || !v.permissions(b.permissions)) {invalid(res);return;}
  const data=await rpc(res,'team_set_member',{p_office_id:b.office_id,p_membership_id:req.params.id,p_role_code:b.role_code,p_active:b.active,p_permissions:b.permissions,p_request_id:randomUUID()});
  if(data)res.json({data});
});
teamRouter.put('/delegations/:id',async(req,res)=>{
  const b:unknown=req.body;
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(b,['office_id','allowed_roles','allowed_permissions','can_create_owner','expires_at']) || !v.uuid(b.office_id)
    || !v.list(b.allowed_roles,teamRoles) || !(b.allowed_roles as unknown[]).length || !v.permissions(b.allowed_permissions)
    || typeof b.can_create_owner!=='boolean' || !v.expiry(b.expires_at,90)) {invalid(res);return;}
  const data=await rpc(res,'team_set_delegation',{p_office_id:b.office_id,p_membership_id:req.params.id,p_allowed_roles:b.allowed_roles,p_allowed_permissions:b.allowed_permissions,p_can_create_owner:b.can_create_owner,p_expires_at:b.expires_at,p_request_id:randomUUID()});
  if(data)res.json({data});
});
teamRouter.post('/delegations/:id/revoke',async(req,res)=>{
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(req.body,['office_id']) || !v.uuid(req.body.office_id)) {invalid(res);return;}
  const data=await rpc(res,'team_revoke_delegation',{p_office_id:req.body.office_id,p_delegation_id:req.params.id,p_request_id:randomUUID()});
  if(data)res.json({data});
});
teamRouter.get('/invitations/:id/state',async(req,res)=>{
  if(!emptyQuery(req) || !v.uuid(req.params.id)) {invalid(res);return;}
  const data=await rpc(res,'team_invitation_state',{p_invitation_id:req.params.id});if(data)res.json({data});
});
teamRouter.post('/invitations/:id/verify',async(req,res)=>{
  const b:unknown=req.body;
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(b,['full_name','cpf','role_code']) || !v.fullName(b.full_name) || !v.cpf(b.cpf) || !v.role(b.role_code)) {invalid(res);return;}
  const data=await rpc(res,'team_verify_invitation',{p_invitation_id:req.params.id,p_full_name:b.full_name,p_cpf:b.cpf,p_role_code:b.role_code,p_request_id:randomUUID()});
  if(data)res.json({data});
});
teamRouter.post('/invitations/:id/accept',async(req,res)=>{
  if(!emptyQuery(req) || !v.uuid(req.params.id) || !v.fields(req.body,[])) {invalid(res);return;}
  const data=await rpc(res,'team_accept_invitation',{p_invitation_id:req.params.id,p_request_id:randomUUID()});if(data)res.json({data});
});
