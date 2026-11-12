import {PresenceControl} from '../documentCommercial/DocumentPresenceProvider';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FileText, House, UsersRound, CircleUserRound, History, Archive, LogOut, Menu, X, ClipboardList, Paperclip, ClipboardCheck, Bell, Wallet, Banknote, Zap, ChartColumn, Settings, BriefcaseBusiness, LandPlot } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { paths, normalizePathname } from '../../app/routes';
import type { AccessContext } from '../../../shared/access';
import {NotificationBell} from '../notifications/NotificationBell';
import { Brand } from '../../ui/Brand';
import { useAuth } from '../auth/AuthProvider';
import { operationNavigation, mobileOperationNavigation, operationRoleNames, operationSectionKey, operationSectionNavigation } from './navigation';
import {OperationBack,splitOperationReturn} from './OperationBack';
import './operation.css';
import {PrivacyFooter} from '../privacy/PrivacyLinks';

const icons = {categories:ClipboardList,access:Settings,privacy:CircleUserRound,rural:LandPlot,settings:Settings,catalog:FileText,portalDocuments:FileText, documents:FileText, templates:FileText, quick:Zap,reports:ChartColumn, expenses: Banknote, payments: Wallet, cash: Banknote, charges: Wallet, home: House, checklists: ClipboardCheck, notifications: Bell, requests: ClipboardList, attachments: Paperclip, customers: UsersRound, services: BriefcaseBusiness, team: UsersRound, audit: History, archives: Archive, account: CircleUserRound };
export function OperationLayout({ client = false, busy = false, contextActions, office, children }: { client?: boolean; busy?: boolean; contextActions?: ReactNode; office?: string; children: ReactNode }) {
  const auth = useAuth();
  const items = operationNavigation(auth.contexts, client);
  const contextual = splitOperationReturn(contextActions);
  const home = items[0].path;
  const account = client ? paths.clientAccount : paths.account;
  const { pathname } = useLocation();
  const sectionKey = operationSectionKey(pathname);
  const sectionItems = operationSectionNavigation(auth.contexts, client, pathname);
  const drawer = useRef<HTMLDialogElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  function closeMenu() { drawer.current?.close(); }
  useEffect(() => {
    const dialog = drawer.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [open]);
  useEffect(() => { drawer.current?.close(); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const resize = () => {
      const button = menuButton.current;
      if (button && getComputedStyle(button).display === 'none') drawer.current?.close();
      else if (button && !button.getClientRects().length) drawer.current?.close();
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [open]);
  async function logout() {
    if (leaving || busy) return;
    setLeaving(true); setError('');
    try { if (!await auth.logout()) setError('Não foi possível sair. Tente novamente.'); }
    catch { setError('Não foi possível sair. Tente novamente.'); }
    finally { setLeaving(false); }
  }
  function navigation(label: string, mobile = false) {
    return <nav aria-label={label} className={mobile ? 'operation-mobile-nav' : 'operation-navigation'}>{(mobile ? mobileOperationNavigation(items) : items).map(item => {
      const Icon = icons[item.key];
      return <Link key={item.key} to={item.path} aria-current={(sectionKey === item.key || normalizePathname(pathname) === item.path) ? 'page' : undefined} aria-disabled={busy||undefined} onClick={event=>{if(busy){event.preventDefault();return;}closeMenu();}}><Icon size={21} aria-hidden="true" /><span>{mobile && item.key === 'settings' ? 'Ajustes' : mobile && client && item.key === 'requests' ? 'Solicitações' : item.label}</span></Link>;
    })}</nav>;
  }
  function exit() {
    return <button className="operation-exit" disabled={leaving || busy} onClick={() => void logout()}><LogOut size={20} aria-hidden="true" /><span>Sair da conta</span></button>;
  }
  return <div className="operation-layout">
    <aside className="operation-sidebar" aria-label="Navegação principal"><Brand light to={home} /><p className="operation-area">{client ? 'Área do cliente' : 'Área da equipe'}</p>{navigation('Navegação da operação')}{contextActions&&<div className="operation-context-actions">{contextual.actions}</div>}{!client&&<PresenceControl/>}<div className="operation-sidebar-end">{exit()}<p>Acesso individual e protegido.</p></div></aside>
    <div className="operation-body">
      <header className="operation-mobile-bar" aria-label="Barra da conta"><button ref={menuButton} className="operation-icon-button" aria-label="Abrir menu" aria-expanded={open} aria-controls="operation-menu" onClick={() => setOpen(true)}><Menu size={24} aria-hidden="true" /></button><Brand to={home} /><div className="operation-header-actions"><NotificationBell client={client}/><Link to={account} className="operation-icon-button" aria-label="Abrir conta" title="Conta"><CircleUserRound size={25} aria-hidden="true" /></Link></div></header>
      <main id="conteudo" className="operation-main"><OperationBack pathname={pathname} contexts={auth.contexts} client={client} busy={busy} contextual={contextual.back}/>{error && !open && <p role="alert" className="form-feedback error">{error}</p>}{sectionItems.length>1&&<nav className="operation-section-navigation" aria-label={`Áreas de ${sectionKey==='requests'?'solicitações':sectionKey==='customers'?'clientes':'serviços'}`}>{sectionItems.map(item=>{const Icon=icons[item.key];return <Link key={item.key} to={item.path} state={office?{office_id:office}:undefined} aria-current={normalizePathname(pathname)===item.path?'page':undefined} aria-disabled={busy||undefined} onClick={event=>{if(busy)event.preventDefault();}}><Icon size={19} aria-hidden="true"/><span>{item.label}</span></Link>;})}</nav>}{children}</main>
      <PrivacyFooter className="operation-footer"/>
    </div>
    {navigation('Atalhos do aplicativo', true)}
    <dialog id="operation-menu" ref={drawer} className="operation-drawer" aria-label="Menu de navegação" onClose={() => { setOpen(false); menuButton.current?.focus(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeMenu();
    }}><div className="operation-drawer-header"><Brand light to={home} /><button className="operation-icon-button" aria-label="Fechar menu" onClick={closeMenu}><X size={23} aria-hidden="true" /></button></div><p className="operation-area">{client ? 'Área do cliente' : 'Área da equipe'}</p>{navigation('Menu da operação')}{contextActions&&<div className="operation-context-actions" onClick={closeMenu}>{contextual.actions}</div>}{error && open && <p role="alert" className="form-feedback error">{error}</p>}{!client&&<PresenceControl/>}<div className="operation-sidebar-end">{exit()}<p>Acesso individual e protegido.</p></div></dialog>
  </div>;
}

export function OperationHeading({ context, title, description, showRole = true }: { context: AccessContext; title: string; description: string; showRole?: boolean }) {
  return <header className="operation-heading"><div><p className="eyebrow">{context.office_name}</p><h1>{title}</h1><p>{description}</p></div>{showRole && <span className="operation-role">{operationRoleNames[context.role_code]}</span>}</header>;
}
