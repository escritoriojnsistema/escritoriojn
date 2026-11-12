import {useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {Archive,Clock3,History,Layers3,UsersRound,CircleUserRound,ShieldCheck} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import {settingsNavigation} from '../operation/navigation';
import {paths} from '../../app/routes';
import {CategoriesSettings} from './CategoriesSettings';
import {PrivacySettings} from './PrivacySettings';
import {AccessSettings} from './AccessSettings';
import '../team/team.css';
import './settings.css';
export default function SettingsPage({section='home',client=false}:{section?:'home'|'categories'|'access'|'privacy';client?:boolean}){
 const auth=useAuth(),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
 const contexts=auth.contexts.filter(c=>client?c.role_code==='client':c.role_code!=='client');
 const eligible=contexts.filter(c=>section==='home'||c.permissions.includes('settings.access')&&(section==='privacy'?c.role_code==='owner':['owner','admin'].includes(c.role_code)&&c.permissions.includes(section==='categories'?'categories.manage':'access.manage')));
 const context=eligible.find(c=>c.office_id===selected)??eligible[0]??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={client?paths.client:paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 const icons={privacy:ShieldCheck,audit:History,archives:Archive,team:UsersRound,categories:Layers3,access:Clock3,account:CircleUserRound};
 const descriptions:Record<string,string>={privacy:'Identificação e contato publicados no aviso de privacidade.',audit:'Histórico, relatórios e prazo de arquivo.',archives:'Solicitações encerradas e referências preservadas.',team:'Pessoas, funções e permissões de acesso.',categories:'Categorias compartilhadas pelos serviços e solicitações.',access:'Saída automática por inatividade da equipe e dos clientes.',account:'Dados pessoais, segurança e preferências da sua conta.'};
 const items=settingsNavigation(context,client).map(item=>({...item,description:descriptions[item.key],icon:icons[item.key as keyof typeof icons]}));
 const allowed=section==='home'||items.some(i=>i.path===(section==='categories'?paths.settingsCategories:section==='privacy'?paths.settingsPrivacy:paths.settingsAccess));
 return <OperationLayout client={client} busy={busy}><div className="settings-main">
 <OperationHeading context={context} showRole={false} title={section==='categories'?'Categorias':section==='access'?'Acessos':section==='privacy'?'Privacidade':'Configurações'} description={section==='home'?client?'Dados e preferências da sua conta.':'Organização, pessoas e regras do escritório.':'Configuração oficial deste escritório.'}/>
 {eligible.length>1&&<label className="team-field">Escritório<select disabled={busy} value={context.office_id} onChange={e=>setSelected(e.target.value)}>{eligible.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
 {!allowed?<p role="alert" className="form-feedback error">Seu acesso não permite alterar esta configuração.</p>:section==='home'?<nav aria-label="Opções de configurações" className="settings-destinations">{items.map(({label,description,path,icon:Icon})=><Link key={path} to={path}><Icon size={22} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span></Link>)}{!items.length&&<p>Nenhuma configuração adicional foi concedida ao seu acesso.</p>}</nav>:section==='categories'?<CategoriesSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:section==='privacy'?<PrivacySettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:<AccessSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>}
 </div></OperationLayout>;
}
