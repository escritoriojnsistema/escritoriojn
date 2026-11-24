import { ArrowRight, CircleUserRound, Lock, MessagesSquare, Paperclip, ShieldCheck, UserRoundSearch, UsersRound } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { normalizePathname, paths } from '../../app/routes';
import { useAuth } from './AuthProvider';
import { OperationalAccess, OperationalFeedback } from '../operation/OperationalAccess';
import { OperationHeading } from '../operation/OperationLayout';

function RequestsMotif() {
  return (
    <div className="operation-card-visual operation-visual-requests" aria-hidden="true">
      <div className="operation-motif-chart">
        <div className="operation-motif-dots">
          <span className="dot-navy" />
          <span className="dot-navy-mid" />
          <span className="dot-brass" />
        </div>
        <svg viewBox="0 0 180 62" fill="none" className="operation-motif-svg">
          <path d="M4 52 C28 46, 38 22, 62 31 C86 40, 102 18, 128 24 C146 28, 160 15, 176 8" stroke="#103248" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M4 56 C30 50, 48 42, 74 34 C96 27, 114 38, 138 28 C154 21, 164 18, 176 14" stroke="#C59B56" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.88" />
          <path d="M4 52 C28 46, 38 22, 62 31 C86 40, 102 18, 128 24 C146 28, 160 15, 176 8 L176 60 L4 60 Z" fill="url(#jnWaveFill)" />
          <defs>
            <linearGradient id="jnWaveFill" x1="0" y1="8" x2="0" y2="60" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#103248" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#103248" stopOpacity="0.01" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="operation-motif-stack">
        <span className="operation-motif-tag-navy">Protocolos ativos</span>
        <span className="operation-motif-progress">
          <span className="operation-motif-progress-bar" />
        </span>
        <span className="operation-motif-tag-brass">Fluxo organizado</span>
      </div>
    </div>
  );
}

function AttachmentsMotif() {
  return (
    <div className="operation-card-visual operation-visual-attachments" aria-hidden="true">
      <div className="operation-motif-caption">
        <Lock size={14} />
        <span>Arquivos protegidos</span>
      </div>
      <div className="operation-motif-docs">
        <span className="operation-doc-sheet sheet-pdf">PDF</span>
        <span className="operation-doc-sheet sheet-doc">DOC</span>
        <span className="operation-doc-sheet sheet-img">IMG</span>
      </div>
    </div>
  );
}

function CustomersMotif() {
  return (
    <div className="operation-card-visual operation-visual-customers" aria-hidden="true">
      <div className="operation-motif-avatars">
        <span className="operation-avatar-chip tone-navy">PF</span>
        <span className="operation-avatar-chip tone-slate">PJ</span>
        <span className="operation-avatar-chip tone-brass">JN</span>
        <span className="operation-avatar-chip tone-soft">
          <UserRoundSearch size={14} />
        </span>
      </div>
      <span className="operation-motif-meta">Fichas e histórico</span>
    </div>
  );
}

function TeamMotif() {
  return (
    <div className="operation-card-visual operation-visual-team" aria-hidden="true">
      <div className="operation-motif-caption">
        <span className="operation-motif-dot" />
        <span>Perfis e acessos</span>
      </div>
      <div className="operation-motif-bars">
        <span style={{ height: '34%' }} className="bar-soft" />
        <span style={{ height: '58%' }} className="bar-soft" />
        <span style={{ height: '82%' }} className="bar-navy" />
        <span style={{ height: '96%' }} className="bar-brass" />
        <span style={{ height: '64%' }} className="bar-soft" />
        <span style={{ height: '42%' }} className="bar-soft" />
      </div>
    </div>
  );
}

function AccountMotif() {
  return (
    <div className="operation-card-visual operation-visual-account" aria-hidden="true">
      <div className="operation-motif-caption">
        <ShieldCheck size={15} />
        <span>Segurança e sessão individual</span>
      </div>
      <span className="operation-motif-tag-brass">Minha conta</span>
    </div>
  );
}

export default function PanelPage() {
  const auth = useAuth();
  const pathname = normalizePathname(useLocation().pathname);
  const client = pathname === paths.clientPanel || (pathname === paths.authenticated && auth.portal === 'client');
  if (pathname === paths.authenticated) {
    if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
    if (auth.status === 'authorized') return <Navigate replace to={auth.contexts.some(context => context.role_code !== 'client') ? paths.panel : paths.clientPanel} />;
  }
  return <OperationalAccess client={client}>{contexts => <>
    <OperationHeading
      context={contexts[0]}
      title="Área de operação"
      description={client ? 'Seu atendimento em um só lugar.' : 'Acesse as funções disponíveis para o seu trabalho.'}
    />
    <section className="operation-shortcuts" aria-labelledby="shortcuts-heading">
      <h2 id="shortcuts-heading" className="operation-shortcuts-title">Acesso rápido</h2>
      <div className="operation-shortcut-grid">
        {(client || contexts.some(context => context.permissions.includes('requests.read'))) && (
          <Link className="operation-card" to={client ? paths.clientRequests : paths.requests}>
            <div className="operation-card-head">
              <span className="operation-card-icon" aria-hidden="true"><MessagesSquare size={22} /></span>
              <span className="operation-card-copy">
                <strong>{client ? 'Minhas solicitações' : 'Solicitações'}</strong>
                <small>{client ? 'Enviar e acompanhar seu atendimento' : 'Abrir e acompanhar atendimentos'}</small>
              </span>
              <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true" />
            </div>
            <RequestsMotif />
          </Link>
        )}
        {(client || contexts.some(context => context.permissions.includes('files.read') && context.permissions.includes('requests.read'))) && (
          <Link className="operation-card" to={client ? paths.clientAttachments : paths.attachments}>
            <div className="operation-card-head">
              <span className="operation-card-icon" aria-hidden="true"><Paperclip size={22} /></span>
              <span className="operation-card-copy">
                <strong>Anexos privados</strong>
                <small>Arquivos dos seus atendimentos</small>
              </span>
              <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true" />
            </div>
            <AttachmentsMotif />
          </Link>
        )}
        {!client && contexts.some(context => context.permissions.includes('customers.read')) && (
          <Link className="operation-card" to={paths.customers}>
            <div className="operation-card-head">
              <span className="operation-card-icon" aria-hidden="true"><UserRoundSearch size={22} /></span>
              <span className="operation-card-copy">
                <strong>Clientes</strong>
                <small>Cadastro e busca de fichas do escritório</small>
              </span>
              <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true" />
            </div>
            <CustomersMotif />
          </Link>
        )}
        {!client && contexts.some(context => context.permissions.includes('users.manage')) && (
          <Link className="operation-card" to={paths.teamManagement}>
            <div className="operation-card-head">
              <span className="operation-card-icon" aria-hidden="true"><UsersRound size={22} /></span>
              <span className="operation-card-copy">
                <strong>Gerenciar equipe e convites</strong>
                <small>Pessoas e permissões do escritório</small>
              </span>
              <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true" />
            </div>
            <TeamMotif />
          </Link>
        )}
        {(client || !contexts.some(context => context.permissions.includes('customers.read')) || !contexts.some(context => context.permissions.includes('users.manage'))) && (
          <Link className="operation-card" to={client ? paths.clientAccount : paths.account}>
            <div className="operation-card-head">
              <span className="operation-card-icon" aria-hidden="true"><CircleUserRound size={22} /></span>
              <span className="operation-card-copy">
                <strong>Ver minha conta</strong>
                <small>Dados de acesso e segurança</small>
              </span>
              <ArrowRight className="operation-card-arrow" size={18} aria-hidden="true" />
            </div>
            <AccountMotif />
          </Link>
        )}
      </div>
    </section>
  </>}</OperationalAccess>;
}
