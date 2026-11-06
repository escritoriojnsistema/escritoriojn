import {validCnpj} from './identifiers.js';
export type PrivacyController={controller_name:string;cnpj:string;contact_email:string;contact_phone:string;address:string};
export type PrivacySettings={configured:boolean;revision:number;controller:PrivacyController};
export const exampleController:PrivacyController={controller_name:'Escritório Exemplo — dados fictícios',cnpj:'',contact_email:'privacidade@example.com',contact_phone:'',address:'Endereço de exemplo — substituir em Configurações'};
export function validPrivacyController(v:unknown):v is PrivacyController{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const r=v as Record<string,unknown>,keys=['controller_name','cnpj','contact_email','contact_phone','address'];
 if(Object.keys(r).length!==keys.length||!keys.every(k=>typeof r[k]==='string'&&r[k]===r[k].trim()&&!/[\u0000-\u001f\u007f]/.test(r[k] as string)))return false;
 return (r.controller_name as string).length>=3&&(r.controller_name as string).length<=180&&(r.address as string).length<=500&&(r.contact_phone as string).length<=40&&(r.contact_email as string).length<=254
 &&(r.cnpj===''||typeof r.cnpj==='string'&&/^\d{14}$/.test(r.cnpj)&&validCnpj(r.cnpj))
 &&(r.contact_email===''||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.contact_email as string))
 &&((r.contact_email as string).length>0||(r.contact_phone as string).replace(/\D/g,'').length>=8);
}
export function privacySettings(value:unknown):PrivacySettings{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_PRIVACY_STATE');
 const r=value as Record<string,unknown>;
 if(typeof r.configured!=='boolean'||!Number.isSafeInteger(r.revision)||Number(r.revision)<0)throw Error('INVALID_PRIVACY_STATE');
 if(!r.configured)return{configured:false,revision:0,controller:exampleController};
 if(!validPrivacyController(r.controller))throw Error('INVALID_PRIVACY_STATE');
 const {controller_name,cnpj,contact_email,contact_phone,address}=r.controller;
 return{configured:true,revision:Number(r.revision),controller:{controller_name,cnpj,contact_email,contact_phone,address}};
}
