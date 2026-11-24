import {useState,type ReactNode} from 'react';
import {importPermissions37} from '../../../shared/imports37';
import {ImportSettings} from './ImportSettings';
import {Link,Navigate,useLocation} from 'react-router-dom';
import {Archive,Building2,ChevronRight,Clock3,History,Layers3,UsersRound,CircleUserRound,ShieldCheck,Smartphone} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import {settingsNavigation} from '../operation/navigation';
import {paths} from '../../app/routes';
import {CategoriesSettings} from './CategoriesSettings';
import {LegalSettings} from './LegalSettings';
import {InfoTrigger} from '../privacy/InfoTrigger';
import {OperationsSettings} from './OperationsSettings';
import {AccessSettings} from './AccessSettings';
import {PaymentProvidersSettings} from './PaymentProvidersSettings';
import '../team/team.css';
import './settings.css';
export default function SettingsPage({section='home',client=false}:{section?:'home'|'categories'|'access'|'privacy'|'legal'|'operations'|'imports'|'payments';client?:boolean}){
 const auth=useAuth(),location=useLocation(),[selected,setSelected]=useState(typeof location.state?.office_id==='string'?location.state.office_id:''),[busy,setBusy]=useState(false),[actions,setActions]=useState<ReactNode>(),[headerAction,setHeaderAction]=useState<ReactNode>();
 const contexts=auth.contexts.filter(c=>client?c.role_code==='client':c.role_code!=='client');
 const eligible=contexts.filter(c=>{if(section==='home'||section==='legal')return true;if(section==='privacy')return ['owner','admin'].includes(c.role_code)&&c.permissions.includes('settings.access');if(section==='imports')return c.role_code==='owner'&&importPermissions37.every(p=>c.permissions.includes(p));if(section==='payments')return ['owner','admin'].includes(c.role_code)&&c.permissions.includes('settings.access')&&c.permissions.includes('payments.providers.manage');return c.permissions.includes('settings.access')&&(section==='operations'?c.role_code==='owner':['owner','admin'].includes(c.role_code)&&c.permissions.includes(section==='categories'?'categories.manage':'access.manage'));});
 const legal=section==='privacy'||section==='legal';
 const context=eligible.find(c=>c.office_id===selected)??eligible[0]??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={client?paths.client:paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 const icons={paymentsConfig:Building2,imports:Archive,operations:ShieldCheck,privacy:ShieldCheck,legal:ShieldCheck,audit:History,archives:Archive,team:UsersRound,categories:Layers3,access:Clock3,account:CircleUserRound};
 const descriptions:Record<string,string>={paymentsConfig:'Bancos, Pix, cartões online, maquininhas e diagnósticos de cobrança.',imports:'Lotes, rejeições, origem e conferência de saldos iniciais.',operations:'Limites, responsáveis e preparação para backup e recuperação.',privacy:'Avisos legais e direitos autorais do sistema.',legal:'Consulte os avisos legais e as preferências do navegador.',audit:'Histórico, relatórios e prazo de arquivo.',archives:'Solicitações encerradas e referências preservadas.',team:'Pessoas, funções e permissões de acesso.',categories:'Categorias compartilhadas pelos serviços e solicitações.',access:'Saída automática por inatividade da equipe e dos clientes.',account:'Dados pessoais, segurança e preferências da sua conta.'};
 const items=settingsNavigation(context,client).map(item=>({...item,description:descriptions[item.key],icon:icons[item.key as keyof typeof icons]}));
 const allowed=section==='home'||section==='legal'||items.some(i=>i.path===(section==='payments'?paths.settingsPayments:section==='imports'?paths.settingsImports:section==='operations'?paths.settingsOperations:section==='categories'?paths.settingsCategories:section==='privacy'?paths.settingsPrivacy:paths.settingsAccess));
 return <OperationLayout client={client} busy={busy} contextActions={actions}><div className="settings-main">
 <OperationHeading context={context} showRole={false} action={section==='categories'?headerAction:undefined} title={section==='payments'?'Bancos e Pagamentos':section==='imports'?'Importação':section==='operations'?'Continuidade':section==='categories'?'Categorias':section==='access'?'Acessos':section==='privacy'?'Privacidade':section==='legal'?'Leis e privacidade':'Configurações'} description={section==='home'?client?'Dados e preferências da sua conta.':'Organização, pessoas e regras do escritório.':section==='payments'?'Integração agnóstica com bancos, Pix, cartões online e maquininhas.':legal?undefined:'Configuração oficial deste escritório.'}/>
 {eligible.length>1&&<label className="team-field">Escritório<select disabled={busy} value={context.office_id} onChange={e=>setSelected(e.target.value)}>{eligible.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
 {!allowed?<p role="alert" className="form-feedback error">Seu acesso não permite alterar esta configuração.</p>:section==='home'?<nav aria-label="Opções de configurações" className="settings-destinations">{items.map(({label,description,path,icon:Icon})=><Link key={path} to={path} state={{office_id:context.office_id}}><Icon size={22} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span><ChevronRight className="settings-chevron" size={18} aria-hidden="true"/></Link>)}<InfoTrigger section="app"><Smartphone size={22} aria-hidden="true"/><span><strong>App</strong><small>Instalação e versão neste dispositivo.</small></span><ChevronRight className="settings-chevron" size={18} aria-hidden="true"/></InfoTrigger></nav>:section==='payments'?<PaymentProvidersSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:section==='imports'?<ImportSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy} onActionsChange={setActions}/>:section==='operations'?<OperationsSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>:section==='categories'?<CategoriesSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy} onHeaderAction={setHeaderAction}/>:legal?<LegalSettings key={context.office_id} office={context.office_id} busy={busy} canEditCopyright={section==='privacy'&&eligible.includes(context)} canEditController={section==='privacy'&&context.role_code==='owner'} onPendingChange={setBusy}/>:<AccessSettings key={context.office_id} office={context.office_id} onPendingChange={setBusy}/>}
 </div></OperationLayout>;
}
