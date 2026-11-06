import {useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {Archive,Clock3,History,Layers3,UsersRound} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import {paths} from '../../app/routes';
import {CategoriesSettings} from './CategoriesSettings';
import {PrivacySettings} from './PrivacySettings';
import {AccessSettings} from './AccessSettings';
import '../team/team.css';
import './settings.css';
export default function SettingsPage({section='home'}:{section?:'home'|'categories'|'access'|'privacy'}){
 const auth=useAuth(),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
 const contexts=auth.contexts.filter(c=>c.role_code!=='client'&&c.permissions.includes('settings.access'));
 const context=contexts.find(c=>c.office_id===selected)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 const admin=context.role_code==='owner'||context.role_code==='admin';
 const items=[{label:'Privacidade',description:'Identificação e contato publicados no aviso de privacidade.',path:paths.settingsPrivacy,icon:UsersRound,allowed:context.role_code==='owner'},{label:'Auditoria',description:'Histórico, relatórios e prazo de arquivo.',path:paths.audit,icon:History,allowed:context.permissions.includes('audit.read')},
 {label:'Arquivados',description:'Solicitações encerradas e referências preservadas.',path:paths.settingsArchives,icon:Archive,allowed:context.permissions.includes('archives.manage')||admin&&context.permissions.includes('requests.archives.manage')},
 {label:'Equipe e convites',description:'Pessoas, funções e permissões de acesso.',path:paths.teamManagement,icon:UsersRound,allowed:context.permissions.includes('users.manage')},
 {label:'Categorias',description:'Categorias compartilhadas pelos serviços e solicitações.',path:paths.settingsCategories,icon:Layers3,allowed:admin&&context.permissions.includes('categories.manage')},
 {label:'Acessos',description:'Saída automática por inatividade da equipe e dos clientes.',path:paths.settingsAccess,icon:Clock3,allowed:admin&&context.permissions.includes('access.manage')}].filter(i=>i.allowed);
 const allowed=section==='home'||items.some(i=>i.path===(section==='categories'?paths.settingsCategories:section==='privacy'?paths.settingsPrivacy:paths.settingsAccess));
 return <OperationLayout busy={busy} contextActions={section!=='home'?<Link to={paths.settings}>Voltar às configurações</Link>:undefined}><div className="settings-main">
 <OperationHeading context={context} showRole={false} title={section==='categories'?'Categorias':section==='access'?'Acessos':section==='privacy'?'Privacidade':'Configurações'} description={section==='home'?'Organização, pessoas e regras do escritório.':'Configuração oficial deste escritório.'}/>
 {contexts.length>1&&<label className="team-field">Escritório<select disabled={busy} value={context.office_id} onChange={e=>setSelected(e.target.value)}>{contexts.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
 {!allowed?<p role="alert" className="form-feedback error">Seu acesso não permite alterar esta configuração.</p>:section==='home'?<nav aria-label="Opções de configurações" className="settings-destinations">{items.map(({label,description,path,icon:Icon})=><Link key={path} to={path}><Icon size={22} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span></Link>)}{!items.length&&<p>Nenhuma configuração adicional foi concedida ao seu acesso.</p>}</nav>:section==='categories'?<CategoriesSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:section==='privacy'?<PrivacySettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:<AccessSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>}
 </div></OperationLayout>;
}
