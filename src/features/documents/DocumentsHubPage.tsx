import {useEffect,useState} from 'react';
import {Navigate,useLocation,useSearchParams} from 'react-router-dom';
import type {AccessContext} from '../../../shared/access';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import TemplatesPage from '../templates/TemplatesPage';
import DocumentsPage,{type DocumentsLayout} from './DocumentsPage';
import './documents.css';
import {ReviewQueue} from '../documentWorkflow/ReviewQueue';

type Tab='models'|'issued'|'reviews';
const canModels=(context:AccessContext)=>context.role_code!=='client'&&context.permissions.includes('templates.read');
const canIssued=(context:AccessContext)=>context.role_code!=='client'&&['documents.read','requests.read','customers.read'].every(permission=>context.permissions.includes(permission));

/**
 * One Documentos screen for the team: models and issued documents share the
 * same destination, so the menu never repeats "Modelos documentais" and
 * "Documentos" separately. The document request flow lives in Solicitações.
 */
export default function DocumentsHubPage(){
 const [modelsBusy,setModelsBusy]=useState(false);
 const location=useLocation(),auth=useAuth(),[selected,setSelected]=useState<string>(()=>location.state?.office_id??''),[params,setParams]=useSearchParams(),[documentLayout,setDocumentLayout]=useState<DocumentsLayout>({actions:undefined,busy:false});
 useEffect(()=>{if(typeof location.state?.office_id==='string')setSelected(location.state.office_id);},[location.key]);
 const contexts=auth.contexts.filter(context=>canModels(context)||canIssued(context));
 const requested=params.get('aba') as Tab|null;
 const context=contexts.find(item=>item.office_id===selected)??contexts.find(item=>requested==='models'?canModels(item):requested==='issued'||requested==='reviews'?canIssued(item):false)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 const tabs:[Tab,string,boolean][]=[
  ['models','Modelos',canModels(context)],
  ['issued','Documentos emitidos',canIssued(context)],
  ['reviews','Revisões',canIssued(context)],
 ];
 const available=tabs.filter(([, ,show])=>show);
 const tab=available.some(([key])=>key===requested)?requested as Tab:available[0][0];
 return <OperationLayout busy={tab==='issued'?documentLayout.busy:modelsBusy} contextActions={tab==='issued'?documentLayout.actions:undefined}><div className="documents-main documents-hub">
  <OperationHeading context={context} showRole={false} title="Documentos" description="Modelos, documentos emitidos e revisão editorial no mesmo lugar."/>
  {contexts.length>1&&<label className="team-field customer-office">Escritório<select value={context.office_id} disabled={tab==='issued'?documentLayout.busy:modelsBusy} onChange={event=>setSelected(event.target.value)}>{contexts.map(item=><option key={item.office_id} value={item.office_id}>{item.office_name}</option>)}</select></label>}
  <div role="tablist" aria-label="Áreas de documentos" className="team-tabs">
   {available.map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} disabled={tab==='issued'?documentLayout.busy:modelsBusy} onClick={()=>setParams(key==='models'?{}:{aba:key},{replace:true})}>{label}</button>)}
  </div>
  {tab==='models'?<TemplatesPage embedded fixedOffice={context.office_id} onPendingChange={setModelsBusy}/>:tab==='reviews'?<ReviewQueue key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${context.permissions.join(',')}`} office={context.office_id}/>:<DocumentsPage embedded fixedOffice={context.office_id} onLayout={setDocumentLayout}/>}
 </div></OperationLayout>;
}
