import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {checklistScopeDescriptions,checklistScopeNames,type ChecklistModel,type ChecklistScope} from '../../../shared/checklists';
import {paths} from '../../app/routes';
import {checklistsApi,checklistsError} from '../checklists/api';

export function ServiceChecklists({office,serviceId}:{office:string;serviceId:string}){
 const [models,setModels]=useState<Partial<Record<ChecklistScope,ChecklistModel>>>(),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();setModels(undefined);setError('');void Promise.all((['client','internal'] as const).map(scope=>checklistsApi.model(office,serviceId,scope,controller.signal))).then(values=>{if(!controller.signal.aborted)setModels({client:values[0],internal:values[1]});}).catch(cause=>{if(!controller.signal.aborted)setError(checklistsError(cause).message);});return()=>controller.abort();},[office,serviceId]);
 return <details className="service-section"><summary>Checklists do cliente e interno</summary>
  {error?<p role="alert" className="form-feedback error">{error}</p>:models?<dl className="service-facts">{models.client&&<div><dt>{checklistScopeNames.client}</dt><dd>{models.client.definition?`${models.client.definition.name} · versão ${models.client.version}`:'Ainda não publicado'} <small className="customer-note">{checklistScopeDescriptions.client}</small></dd></div>}{models.internal&&<div><dt>{checklistScopeNames.internal}</dt><dd>{models.internal.definition?`${models.internal.definition.name} · versão ${models.internal.version}`:'Ainda não publicado'} <small className="customer-note">{checklistScopeDescriptions.internal}</small></dd></div>}</dl>:<p className="customer-note">Consultando checklists vinculados…</p>}
  <p className="customer-note">O vínculo vale para os próximos atendimentos deste serviço. Atendimentos já abertos preservam a versão capturada. <Link to={paths.checklists} state={{office_id:office,service_id:serviceId}}>Criar ou atualizar em Checklist</Link></p>
 </details>;
}
