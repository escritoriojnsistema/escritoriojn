import { createClient } from '@supabase/supabase-js';
import type { Request, Response } from 'express';
import { validPublicConnection } from '../../../shared/connection.js';
import { errorResponse } from '../../errors.js';

/** A verified provider identity, never a role inferred from user metadata. */
export async function authenticatedClient(req: Request, res: Response) {
  const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(req.get('Authorization')??'')?.[1];
  if (!token) {errorResponse(res,401,'AUTH_REQUIRED','Entre novamente para continuar.');return null;}
  const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!validPublicConnection(url,key)) {errorResponse(res,503,'AUTH_NOT_CONFIGURED','O serviço de acesso está indisponível.');return null;}
  try {
    const client=createClient(url!,key!,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${token}`},fetch:(input,init)=>fetch(input,{
        ...init,signal:AbortSignal.any([AbortSignal.timeout(8000),...(init?.signal?[init.signal]:[])]),
      })},
    });
    const {data,error}=await client.auth.getUser(token);
    if (error || !data.user) {
      const unavailable=error && (!error.status || error.status>=429);
      errorResponse(res,unavailable?503:401,unavailable?'AUTH_UNAVAILABLE':'AUTH_REQUIRED',
        unavailable?'Não foi possível verificar o acesso. Tente novamente.':'Entre novamente para continuar.');return null;
    }
    return {client,token,url:url!,key:key!,userId:data.user.id};
  } catch {errorResponse(res,503,'AUTH_UNAVAILABLE','Não foi possível verificar o acesso. Tente novamente.');return null;}
}
