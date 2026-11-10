import {Children,Fragment,cloneElement,isValidElement,type ReactElement,type ReactNode,type MouseEventHandler} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Link} from 'react-router-dom';
import type {AccessContext} from '../../../shared/access';
import {normalizePathname,paths} from '../../app/routes';

/** Explicit internal parents also work after a direct URL or external entry. */
export function operationParent(pathname:string,contexts:AccessContext[],client:boolean){
 const path=normalizePathname(pathname),home=client?paths.clientPanel:paths.panel;
 if(path===home)return undefined;
 const staff=contexts.filter(c=>c.role_code!=='client');
 if(!client&&(path.startsWith(`${paths.settings}/`)||[paths.teamManagement,paths.audit,paths.archives].some(route=>route===path))&&staff.some(c=>c.permissions.includes('settings.access')))return {path:paths.settings,label:'Voltar às configurações'};
 if(!client&&[paths.charges,paths.expenses,paths.financialReports,paths.quick].some(route=>route===path)&&staff.some(c=>c.permissions.includes('cash.read')||['requests.read','charges.read'].every(p=>c.permissions.includes(p))))return {path:paths.cash,label:'Voltar ao caixa'};
 if(!client&&path===paths.templates&&staff.some(c=>c.permissions.includes('templates.read')))return {path:paths.documents,label:'Voltar aos documentos'};
 if(path===(client?paths.clientDocumentCatalog:paths.documentCatalog)&& (client||staff.some(c=>c.permissions.includes('requests.read'))))return {path:client?paths.clientRequests:paths.requests,label:'Voltar às solicitações'};
 return {path:home,label:'Voltar ao início'};
}
function label(node:ReactNode):string{return Children.toArray(node).map(child=>typeof child==='string'?child:isValidElement<{children?:ReactNode}>(child)?label(child.props.children):'').join('');}
type ReturnProps={children?:ReactNode;disabled?:boolean;className?:string;'aria-disabled'?:boolean|'true'|'false';onClick?:MouseEventHandler<HTMLElement>};
/** Move an existing guarded contextual return, keeping its handler and state. */
export function splitOperationReturn(actions:ReactNode):{back?:ReactElement<ReturnProps>;actions:ReactNode}{
 let back:ReactElement<ReturnProps>|undefined;
 function visit(nodes:ReactNode):ReactNode{return Children.map(nodes,node=>{
  if(!isValidElement<ReturnProps>(node))return node;
  if(node.type===Fragment)return <Fragment>{visit(node.props.children)}</Fragment>;
  if(!back&&/^Voltar\b/.test(label(node.props.children))){back=node;return null;}
  return node;
 });}
 const rest=visit(actions);return {back,actions:rest};
}
export function OperationBack({pathname,contexts,client,busy,contextual}:{pathname:string;contexts:AccessContext[];client:boolean;busy:boolean;contextual?:ReactElement<ReturnProps>}){
 const parent=operationParent(pathname,contexts,client);
 if(!parent&&!contextual)return null;
 return <div className="operation-back">{contextual?cloneElement(contextual,{className:`operation-back-control ${contextual.props.className??''}`,disabled:contextual.type===Link||contextual.type==='a'?undefined:busy||contextual.props.disabled,'aria-disabled':busy||contextual.props.disabled||undefined,onClick:event=>{if(busy||contextual.props.disabled){event.preventDefault();return;}contextual.props.onClick?.(event);}},<><ArrowLeft size={18} aria-hidden="true"/>{contextual.props.children}</>):parent&&<Link className="operation-back-control" to={parent.path} aria-disabled={busy||undefined} onClick={e=>{if(busy)e.preventDefault();}}><ArrowLeft size={18} aria-hidden="true"/><span>{parent.label}</span></Link>}</div>;
}
