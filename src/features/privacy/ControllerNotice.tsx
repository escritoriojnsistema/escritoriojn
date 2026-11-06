import {useEffect,useState} from 'react';
import {exampleController,privacySettings,type PrivacySettings} from '../../../shared/privacySettings';
import {formatCnpj} from '../../../shared/identifiers';
export function ControllerNotice(){
 const [state,setState]=useState<PrivacySettings>({configured:false,revision:0,controller:exampleController});
 useEffect(()=>{const c=new AbortController();void fetch('/api/privacy/public',{cache:'no-store',signal:c.signal}).then(async r=>{if(!r.ok)throw Error('UNAVAILABLE');const body=await r.json();const value=privacySettings(body.data);if(!c.signal.aborted)setState(value);}).catch(()=>{});return()=>c.abort();},[]);
 const data=state.controller;
 return <section aria-label="Responsável pelo tratamento"><h2>Responsável e contato de privacidade</h2>{!state.configured&&<p role="note">Dados fictícios de exemplo. O superadministrador deve substituí-los em Configurações → Privacidade. O endereço example.com não recebe pedidos reais do escritório; utilize seu canal habitual de atendimento enquanto a configuração não estiver publicada.</p>}<dl><div><dt>Nome ou razão social</dt><dd>{data.controller_name}</dd></div>{data.cnpj&&<div><dt>CNPJ</dt><dd>{formatCnpj(data.cnpj)}</dd></div>}{data.contact_email&&<div><dt>E-mail</dt><dd>{state.configured?<a href={'mailto:'+data.contact_email}>{data.contact_email}</a>:data.contact_email}</dd></div>}{data.contact_phone&&<div><dt>Telefone</dt><dd>{data.contact_phone}</dd></div>}{data.address&&<div><dt>Endereço</dt><dd>{data.address}</dd></div>}</dl>{state.configured&&<p>Identificação publicada pelo superadministrador · revisão {state.revision}.</p>}</section>;
}
