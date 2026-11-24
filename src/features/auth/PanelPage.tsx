import {useEffect,useState,type ReactNode} from 'react';
import {ArrowRight,CircleUserRound,MessagesSquare,Paperclip,UserRoundSearch,UsersRound} from 'lucide-react';
import {Link,Navigate,useLocation} from 'react-router-dom';
import type {AccessContext} from '../../../shared/access';
import {requestStatusLabels,publicRequestStatusLabels,type RequestHomeCounts} from '../../../shared/requests';
import {normalizePathname,paths} from '../../app/routes';
import {useAuth} from './AuthProvider';
import {OperationalAccess,OperationalFeedback} from '../operation/OperationalAccess';
import {OperationHeading} from '../operation/OperationLayout';
import {customersApi} from '../customers/api';
import {commercialRequest} from '../documentCommercial/api';

function RequestsChart({counts,client}:{counts:RequestHomeCounts;client:boolean}){
 const labels=client?publicRequestStatusLabels:requestStatusLabels;
 const rows=Object.entries(labels).map(([status,label])=>({label,total:counts[status as keyof RequestHomeCounts]??0}));
 const total=rows.reduce((sum,row)=>sum+row.total,0);
 const maximum=Math.max(1,...rows.map(row=>row.total));
 return <div className="home-request-chart">
  <p><b>{total}</b> {total===1?'solicitação':'solicitações'}</p>
  {total>0?<ul aria-label="Solicitações por situação">{rows.map(row=><li key={row.label}>
   <span>{row.label}</span><span className="home-chart-track" aria-hidden="true"><span style={{width:`${row.total/maximum*100}%`}}/></span>
   <b>{row.total}</b>
  </li>)}</ul>:<small>Nenhuma solicitação neste escritório.</small>}
 </div>;
}

function Card({path,office,title,description,icon,children,queue=false}:{
 path:string;office:string;title:string;description:string;icon:ReactNode;children?:ReactNode;queue?:boolean;
}){
 return <Link className="operation-card" to={path} state={{office_id:office,...(queue?{request_scope:'queue'}:{})}}>
  <div className="operation-card-head">
   <span className="operation-card-icon" aria-hidden="true">{icon}</span>
   <span className="operation-card-copy"><strong>{title}</strong><small>{description}</small></span>
   <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true"/>
  </div>
  {children}
 </Link>;
}

function HomeCards({context,client}:{context:AccessContext;client:boolean}){
 const office=context.office_id;
 const canRequests=client||context.permissions.includes('requests.read');
 const canCustomers=!client&&context.permissions.includes('customers.read');
 const canFiles=client||canRequests&&context.permissions.includes('files.read');
 const canTeam=!client&&context.permissions.includes('users.manage');
 const [counts,setCounts]=useState<RequestHomeCounts|null>(),[totalCustomers,setTotalCustomers]=useState<number|null>();
 useEffect(()=>{
  let running:AbortController|undefined;
  function refresh(){
   if(document.visibilityState!=='visible'||running)return;
   const controller=new AbortController();
   running=controller;
   const tasks:Promise<unknown>[]=[];
   if(canRequests)tasks.push(commercialRequest<RequestHomeCounts>('/home-counts',{office_id:office},controller.signal,'/api/requests')
    .then(data=>{if(!controller.signal.aborted)setCounts(data);})
    .catch(()=>{if(!controller.signal.aborted)setCounts(null);}));
   if(canCustomers)tasks.push(customersApi.search({office_id:office,query:'',page:1,size:3},controller.signal)
    .then(data=>{if(!controller.signal.aborted)setTotalCustomers(data.total);})
    .catch(()=>{if(!controller.signal.aborted)setTotalCustomers(null);}));
   void Promise.all(tasks).finally(()=>{if(running===controller)running=undefined;});
  }
  refresh();
  const timer=window.setInterval(refresh,60_000);
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{running?.abort();window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[office,canRequests,canCustomers]);

 return <section className="operation-shortcuts" aria-label="Acesso rápido">
  <div className="operation-shortcut-grid home-shortcut-grid">
   {canRequests&&<Card path={client?paths.clientRequests:paths.requests} office={office} queue={!client}
    title={client?'Minhas solicitações':'Solicitações'} description={client?'Enviar e acompanhar seu atendimento':'Acompanhar os atendimentos do escritório'} icon={<MessagesSquare size={22}/>}>
    {counts?<RequestsChart counts={counts} client={client}/>:counts===null?<small>Contagem indisponível no momento.</small>:null}
   </Card>}
   {canFiles&&<Card path={client?paths.clientAttachments:paths.attachments} office={office} title="Anexos privados"
     description="Arquivos dos seus atendimentos" icon={<Paperclip size={22}/>}/>}
   {canCustomers&&<Card path={paths.customers} office={office} title="Clientes" description="Cadastro e busca de fichas do escritório" icon={<UserRoundSearch size={22}/>}>
    {typeof totalCustomers==='number'&&<p className="home-customer-count">{totalCustomers===0?'Nenhum cliente disponível':`${totalCustomers} ${totalCustomers===1?'cliente disponível':'clientes disponíveis'}`}</p>}
    {totalCustomers===null&&<small>Contagem indisponível no momento.</small>}
   </Card>}
   {canTeam&&<Card path={paths.teamManagement} office={office} title="Gerenciar equipe e convites"
     description="Pessoas e permissões do escritório" icon={<UsersRound size={22}/>}/>}
   {(client||!canCustomers||!canTeam)&&<Card path={client?paths.clientAccount:paths.account} office={office} title="Ver minha conta"
     description="Dados de acesso e segurança" icon={<CircleUserRound size={22}/>}/>}
  </div>
 </section>;
}

function PanelContent({contexts,client}:{contexts:AccessContext[];client:boolean}){
 const [office,setOffice]=useState('');
 const context=contexts.find(item=>item.office_id===office)??contexts[0];
 return <>
  <OperationHeading context={context} title="Área de operação" description={client?'Seu atendimento em um só lugar.':'Acesse as funções disponíveis para o seu trabalho.'}
   action={contexts.length>1?<label className="team-field home-office">Escritório<select value={context.office_id} onChange={event=>setOffice(event.target.value)}>{contexts.map(item=><option key={item.office_id} value={item.office_id}>{item.office_name}</option>)}</select></label>:undefined}/>
  <HomeCards key={context.office_id} context={context} client={client}/>
 </>;
}

export default function PanelPage(){
 const auth=useAuth();
 const pathname=normalizePathname(useLocation().pathname);
 const client=pathname===paths.clientPanel||(pathname===paths.authenticated&&auth.portal==='client');
 if(pathname===paths.authenticated){
  if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
  if(auth.status==='authorized')return <Navigate replace to={auth.contexts.some(context=>context.role_code!=='client')?paths.panel:paths.clientPanel}/>;
 }
 return <OperationalAccess client={client}>{contexts=><PanelContent contexts={contexts} client={client}/>}</OperationalAccess>;
}
