import {Router,json} from 'express';
import {createClient} from '@supabase/supabase-js';
import {validPublicConnection} from '../../../shared/connection.js';
import {privacySettings,validPrivacyController} from '../../../shared/privacySettings.js';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
export const privacyRouter=Router();
privacyRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('CDN-Cache-Control','no-store');next();});
privacyRouter.get('/public',async(req,res)=>{
 if(Object.keys(req.query).length){errorResponse(res,422,'PRIVACY_VALIDATION','Consulta inválida.');return;}
 const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 if(!validPublicConnection(url,key)){errorResponse(res,503,'PRIVACY_UNAVAILABLE','Aviso indisponível.');return;}
 try{const client=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})}});const{data,error}=await client.rpc('privacy_controller_public');if(error)throw error;res.json({data:privacySettings(data)});}catch{errorResponse(res,503,'PRIVACY_UNAVAILABLE','Aviso indisponível.');}
});
privacyRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.privacyAuth=auth;next();}});
privacyRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'PRIVACY_VALIDATION','Envie JSON.');return;}next();},json({limit:'6kb'}));
privacyRouter.post('/:action',async(req,res)=>{
 const b=req.body,save=req.params.action==='save';
 if(Object.keys(req.query).length||!(save?fields(b,['office_id','expected_revision','controller'])&&uuid(b.office_id)&&Number.isSafeInteger(b.expected_revision)&&Number(b.expected_revision)>=0&&validPrivacyController(b.controller):req.params.action==='state'&&fields(b,['office_id'])&&uuid(b.office_id))){errorResponse(res,422,'PRIVACY_VALIDATION','Confira os dados do responsável.');return;}
 try{const auth=res.locals.privacyAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const{data,error}=await auth.client.rpc(save?'privacy_settings_save':'privacy_settings_state',{p_office_id:b.office_id,...(save?{p_expected_revision:b.expected_revision,p_controller:b.controller}:{})});if(error){const status=Number(/^PT(401|403|409|422)$/.exec(error.code??'')?.[1]??503);errorResponse(res,status,'PRIVACY_'+status,status===409?'A configuração mudou. Atualize antes de salvar.':'Não foi possível acessar esta configuração.');return;}res.json({data:privacySettings(data)});}catch{errorResponse(res,503,'PRIVACY_UNAVAILABLE','Não foi possível concluir.');}
});
