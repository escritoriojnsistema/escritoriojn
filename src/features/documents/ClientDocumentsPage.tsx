import {useState} from 'react';
import {Navigate,useSearchParams} from 'react-router-dom';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import DocumentCatalogPage from '../documentCommercial/DocumentCatalogPage';
import PortalDocumentsPage from '../documentWorkflow/PortalDocumentsPage';
import './documents.css';

type Tab='models'|'mine';
/**
 * Client counterpart of Documentos: folders, prices and categories plus the
 * documents already issued to the signed-in account, in a single destination.
 */
export default function ClientDocumentsPage(){
 const auth=useAuth(),[selected,setSelected]=useState(''),[params,setParams]=useSearchParams();
 const contexts=auth.contexts.filter(context=>context.role_code==='client');
 const context=contexts.find(item=>item.office_id===selected)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.client}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 const tab:Tab=params.get('aba')==='meus'?'mine':'models';
 return <OperationLayout client><div className="team-main documents-hub">
  <OperationHeading context={context} showRole={false} title="Documentos" description="Consulte pastas, modelos, categorias e preços. O conteúdo dos modelos não é exibido."/>
  {contexts.length>1&&<label className="team-field">Escritório<select value={context.office_id} onChange={event=>setSelected(event.target.value)}>{contexts.map(item=><option key={item.office_id} value={item.office_id}>{item.office_name}</option>)}</select></label>}
  <div role="tablist" aria-label="Áreas de documentos" className="team-tabs">
   <button role="tab" aria-selected={tab==='models'} onClick={()=>setParams({},{replace:true})}>Modelos e preços</button>
   <button role="tab" aria-selected={tab==='mine'} onClick={()=>setParams({aba:'meus'},{replace:true})}>Meus documentos</button>
  </div>
  {tab==='models'?<DocumentCatalogPage client embedded/>:<PortalDocumentsPage embedded/>}
 </div></OperationLayout>;
}
