import { Router, json } from 'express';
import { createClient } from '@supabase/supabase-js';
import { projectAccessContexts, uuidPattern, type AccessResponse } from '../../../shared/access.js';
import { validPublicConnection } from '../../../shared/connection.js';
import { errorResponse } from '../../errors.js';
import { authenticatedClient } from './client.js';
import { activitySnapshot } from '../../../shared/sessionActivity.js';

export const authRouter=Router();
authRouter.use((_req,res,next)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('CDN-Cache-Control','no-store');
  res.vary('Authorization'); next();
});
authRouter.get('/context',async(req,res)=>{
  const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(req.get('Authorization')??'')?.[1];
  if (!token) {errorResponse(res,401,'AUTH_REQUIRED','Entre novamente para continuar.');return;}
  const area=req.query.area;
  const office=req.query.office_id;
  if (Object.keys(req.query).some(key=>!['area','office_id'].includes(key))
    || (area!==undefined && area!=='team' && area!=='client')
    || (office!==undefined && (typeof office!=='string' || !uuidPattern.test(office)))) {
    errorResponse(res,422,'VALIDATION_ERROR','Solicitação de acesso inválida.');return;
  }
  const url=process.env.VITE_SUPABASE_URL;
  const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!validPublicConnection(url,key)) {
    errorResponse(res,503,'AUTH_NOT_CONFIGURED','O serviço de acesso está indisponível.');return;
  }
  try {
    const client=createClient(url!,key!,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{
        ...init,signal:AbortSignal.any([AbortSignal.timeout(8000),...(init?.signal?[init.signal]:[])]),
      })},
    });
    // Both operations are independent reads with the same Bearer. RLS/session
    // guards still run in the database; release nothing until BOTH checks pass.
    // Never apply this overlap to a mutation, which must follow verification.
    const [{data:identity,error:identityError},{data,error}]=await Promise.all([
      client.auth.getUser(token),
      client.rpc('my_access_context'),
    ]);
    if (identityError || !identity.user) {
      const unavailable=identityError && (!('status' in identityError) || !identityError.status || identityError.status>=429);
      errorResponse(res,unavailable?503:401,unavailable?'AUTH_UNAVAILABLE':'AUTH_REQUIRED',
        unavailable?'Não foi possível verificar o acesso. Tente novamente.':'Entre novamente para continuar.');return;
    }
    const contexts=error?null:projectAccessContexts(data,identity.user.id,
      area==='team'||area==='client'?area:undefined,typeof office==='string'?office:undefined);
    if (contexts===null) {
      if(error?.code==='PT401'&&error.message==='AUTH_REQUIRED'){errorResponse(res,401,'AUTH_REQUIRED','Entre novamente para continuar.');return;}
      errorResponse(res,503,'AUTH_UNAVAILABLE','Não foi possível verificar as permissões. Tente novamente.');return;
    }
    if (!contexts.length) {
      errorResponse(res,403,'ACCESS_DENIED','Seu acesso a esta área não está liberado.');return;
    }
    res.json({data:{user:{id:identity.user.id},contexts}} satisfies AccessResponse);
  } catch {
    errorResponse(res,503,'AUTH_UNAVAILABLE','Não foi possível verificar o acesso. Tente novamente.');
  }
});
authRouter.route('/activity').all((req,res,next)=>{
  if(Object.keys(req.query).length){errorResponse(res,422,'ACTIVITY_VALIDATION','Solicitação de atividade inválida.');return;}
  if(req.method!=='GET'&&req.method!=='POST'){res.sendStatus(405);return;}
  if(req.method==='POST'&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}
  next();
},json({limit:'1kb'}),async(req,res)=>{
  const auth=await authenticatedClient(req,res);if(!auth)return;
  if(req.method==='POST'&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length)){errorResponse(res,422,'ACTIVITY_VALIDATION','Solicitação de atividade inválida.');return;}
  try{
    const {data,error}=await auth.client.rpc('session_activity',{p_human:req.method==='POST'});
    if(error){if(error.code==='PT401'&&error.message==='AUTH_REQUIRED'){errorResponse(res,401,'AUTH_REQUIRED','Sua sessão expirou. Entre novamente para continuar.');return;}throw error;}
    const snapshot=activitySnapshot(data);if(snapshot.user_id!==auth.userId)throw new Error('ACTIVITY_IDENTITY');
    res.json({data:snapshot});
  }catch{errorResponse(res,503,'ACTIVITY_UNAVAILABLE','Não foi possível verificar o prazo da sessão. Tente novamente.');}
});
