import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { projectAccessContexts, uuidPattern, type AccessResponse } from '../../../shared/access.js';
import { validPublicConnection } from '../../../shared/connection.js';
import { errorResponse } from '../../errors.js';

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
