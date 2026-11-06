import {RetentionSettingsPanel} from '../operation/RetentionSettingsPanel';
import {DeletedAccountsPanel} from '../operation/DeletedAccountsPanel';
import {useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import GovernancePage from '../governance/GovernancePage';
import {RequestArchivesPanel} from '../requests/RequestArchivesPanel';
import {paths} from '../../app/routes';
import './settings.css';
export default function ArchivesHubPage(){
 const auth=useAuth(),[selected,setSelected]=useState(''),[tab,setTab]=useState(''),[busy,setBusy]=useState(false);
 const contexts=auth.contexts.filter(c=>c.role_code!=='client'&&(c.permissions.includes('archives.manage')||['owner','admin'].includes(c.role_code)&&c.permissions.includes('requests.archives.manage')&&c.permissions.includes('requests.read')));
 const context=contexts.find(c=>c.office_id===selected)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 const options=[{id:'deleted-accounts',label:'Contas excluídas',allowed:context.permissions.includes('archives.manage')},{id:'requests',label:'Solicitações',allowed:['owner','admin'].includes(context.role_code)&&context.permissions.includes('requests.archives.manage')&&context.permissions.includes('requests.read')},{id:'records',label:'Cadastros e referências',allowed:context.permissions.includes('archives.manage')},{id:'retention',label:'Retenção documental',allowed:context.permissions.includes('archives.manage')&&['owner','admin'].includes(context.role_code)}].filter(x=>x.allowed);
 const current=options.some(x=>x.id===tab)?tab:options[0].id;
 return <OperationLayout busy={busy} contextActions={<Link to={paths.settings}>Voltar às configurações</Link>}><div className="settings-main"><OperationHeading context={context} title="Arquivados" showRole={false} description="Registros preservados com seu histórico e permissões."/>
 {contexts.length>1&&<label className="team-field">Escritório<select disabled={busy} value={context.office_id} onChange={e=>{setSelected(e.target.value);setTab('');}}>{contexts.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
 {options.length>1&&<div className="settings-tabs" role="tablist" aria-label="Tipos de arquivados">{options.map(o=><button key={o.id} role="tab" disabled={busy} aria-selected={current===o.id} onClick={()=>setTab(o.id)}>{o.label}</button>)}</div>}
 {current==='retention'?<RetentionSettingsPanel key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:current==='deleted-accounts'?<DeletedAccountsPanel key={context.office_id} office={context.office_id}/>:current==='requests'?<RequestArchivesPanel key={context.office_id} office={context.office_id} onPendingChange={setBusy} archiveOnly/>:<GovernancePage mode="archives" embedded officeId={context.office_id}/>}
 </div></OperationLayout>;
}
