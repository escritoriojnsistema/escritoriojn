import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, LogIn, Mail, Plus, RefreshCw, Search, Users } from 'lucide-react';
import type { TeamDashboard, TeamInvitation, TeamMember } from '../../../shared/team';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { deliveryMessage, teamApi, teamError, TeamError } from './api';
import { governanceApi, governanceError } from '../governance/api';
import { InviteForm } from './InviteForm';
import { MemberForm } from './MemberForm';
import { DelegationForm } from './DelegationForm';
import { TeamList } from './TeamList';
import { invitationLink } from './validation';
import './team.css';
type Editor = { kind: 'invite' } | { kind: 'member' | 'delegation'; member: TeamMember } | null;
export default function TeamPage() {
  const auth = useAuth();
  const contexts = auth.contexts.filter(context => context.role_code !== 'client' && context.permissions.includes('users.manage'));
  const [selectedOffice, setSelectedOffice] = useState('');
  const lastOffice = useRef('');
  const context = contexts.find(item => item.office_id === selectedOffice) ?? contexts[0];
  const office = context?.office_id ?? '';
  const archiveScope = `${auth.status}:${office}:${context?.user_id ?? ''}:${context?.permissions.includes('archives.manage') ?? false}`;
  const archiveScopeRef = useRef(archiveScope); archiveScopeRef.current = archiveScope;
  const archivePending = useRef<AbortController | null>(null);
  useEffect(() => { archiveScopeRef.current = archiveScope; return () => { archiveScopeRef.current = ''; archivePending.current?.abort(); }; }, [archiveScope]);
  const [kind, setKind] = useState<'members' | 'invitations'>('members');
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [revision, setRevision] = useState(0);
  const key = `${office}:${kind}:${page}:${query}:${status}:${revision}`;
  const [resource, setResource] = useState<{ key: string; dashboard?: TeamDashboard; error?: TeamError }>({ key: '' });
  const [editor, setEditor] = useState<Editor>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [mutationError, setMutationError] = useState<TeamError>();
  const [createdId, setCreatedId] = useState('');
  useEffect(() => {
    if (!office || auth.status !== 'authorized') return;
    const controller = new AbortController();
    void teamApi.dashboard(office, kind, page, query, status, controller.signal).then(dashboard => {
      if (!controller.signal.aborted) setResource({ key, dashboard });
    }).catch(cause => { if (!controller.signal.aborted) setResource({ key, error: teamError(cause) }); });
    return () => controller.abort();
  }, [office, kind, page, query, status, revision, auth.status, key]);
  useEffect(() => {
    if (!office) return;
    if (lastOffice.current && lastOffice.current !== office) { setEditor(null); setFeedback(''); setMutationError(undefined); setCreatedId(''); }
    lastOffice.current = office;
  }, [office]);
  const dashboard = resource.key === key ? resource.dashboard : undefined;
  const error = resource.key === key ? resource.error : undefined;
  function reload() { setRevision(value => value + 1); setMutationError(undefined); }
  function showError(cause: unknown) { setFeedback(''); setMutationError(teamError(cause)); }
  function saved() { setEditor(null); setFeedback('Acesso atualizado. As permissões serão verificadas novamente na próxima operação.'); reload(); auth.refresh(); }
  function changeTab(next: 'members' | 'invitations') { setKind(next); setPage(1); setQuery(''); setQueryInput(''); setStatus('all'); setEditor(null); setFeedback(''); setMutationError(undefined); setCreatedId(''); }
  async function copyLink(id: string) {
    try { await navigator.clipboard.writeText(invitationLink(window.location.origin, id)); setFeedback('Link copiado. Este endereço exige o acesso pelo e-mail de convite.'); }
    catch { setFeedback('Não foi possível copiar o link. Use o e-mail de convite ou tente novamente.'); }
  }
  async function send(invite: TeamInvitation) {
    if (busy) return; setBusy(true); setMutationError(undefined); setFeedback('');
    try { const result = await teamApi.send(invite.id, office); setFeedback(deliveryMessage(result.delivery)); reload(); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
  async function revoke(invite: TeamInvitation) {
    if (busy || !window.confirm('Revogar este convite? O link não poderá mais ser aceito.')) return;
    setBusy(true); setMutationError(undefined); setFeedback('');
    try { await teamApi.revokeInvitation(invite.id, office); setFeedback('Convite revogado.'); reload(); }
    catch (cause) { showError(cause); }
    finally { setBusy(false); }
  }
  async function archive(member: TeamMember) {
    if (busy || !window.confirm(`Arquivar o acesso de ${member.name || member.email}? O vínculo será desativado e o histórico será preservado.`)) return;
    setBusy(true); setMutationError(undefined); setFeedback('');
    const started = archiveScope; const controller = new AbortController(); archivePending.current = controller;
    try { await governanceApi.archive(office, member.id, controller.signal); if (controller.signal.aborted || archiveScopeRef.current !== started) return; setFeedback('Acesso arquivado. Consulte Arquivados para restaurar a referência, mantendo o acesso inativo.'); reload(); auth.refresh(); }
    catch (cause) { if (!controller.signal.aborted && archiveScopeRef.current === started) showError(new TeamError(governanceError(cause).status)); }
    finally { setBusy(false); }
  }
  function search(event: FormEvent) { event.preventDefault(); setQuery(queryInput.trim()); setPage(1); }
  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') return <Navigate replace to={paths.team} state={auth.status === 'expired' ? { sessionExpired: true } : null} />;
  if (!context || auth.status !== 'authorized') return <OperationalFeedback status={auth.status === 'unavailable' ? 'unavailable' : 'denied'} />;
  const fatal = [error, mutationError].find(item => item?.status === 401 || item?.status === 403);
  return <OperationLayout busy={busy}><div className={`team-main${editor ? ' team-editing' : ''}`}><header className="team-header"><div><p className="eyebrow">{context.office_name}</p><h1>Equipe e convites</h1><p>Gerencie pessoas, acessos e convites do escritório.</p></div></header>{contexts.length > 1 && <label className="team-field team-office" htmlFor="team-office">Escritório<select id="team-office" disabled={busy} value={office} onChange={event => { setSelectedOffice(event.target.value); setPage(1); }} >{contexts.map(item => <option key={item.office_id} value={item.office_id}>{item.office_name}</option>)}</select></label>}{fatal ? <div className="team-empty"><p role="alert" className="form-feedback error">{fatal.message}</p>{fatal.status === 401 ? <Link className="primary-button" to={paths.team}><LogIn size={18} aria-hidden="true" />Entrar novamente</Link> : <button className="primary-button" onClick={() => { reload(); auth.refresh(); }}><RefreshCw size={18} aria-hidden="true" />Verificar acesso novamente</button>}</div> : <><div className="team-toolbar"><div className="team-tabs" role="tablist" aria-label="Gestão da equipe"><button role="tab" aria-selected={kind === 'members'} aria-controls="team-results" id="tab-members" onClick={() => changeTab('members')}><Users size={18} aria-hidden="true" />Equipe{dashboard && ` (${dashboard.counts.members})`}</button><button role="tab" aria-selected={kind === 'invitations'} aria-controls="team-results" id="tab-invitations" onClick={() => changeTab('invitations')}><Mail size={18} aria-hidden="true" />Convites{dashboard && ` (${dashboard.counts.invitations})`}</button></div><button className="primary-button" aria-label="Novo convite" title="Novo convite" disabled={!dashboard || busy} onClick={() => { setEditor({ kind: 'invite' }); setFeedback(''); setMutationError(undefined); setCreatedId(''); }}><Plus size={18} aria-hidden="true" /><span className="team-button-label">Novo convite</span></button></div>{mutationError && <p className="form-feedback error" role="alert">{mutationError.message}</p>}<div className="team-workspace"><section className="team-roster" id="team-results" role="tabpanel" aria-labelledby={`tab-${kind}`}><form className="team-filters" onSubmit={search}><label className="team-field" htmlFor="team-search">Buscar por nome ou e-mail<input id="team-search" type="search" maxLength={120} autoComplete="off" value={queryInput} onChange={event => setQueryInput(event.target.value)} /></label><label className="team-field" htmlFor="team-status">Estado<select id="team-status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos</option>{kind === 'members' ? <><option value="active">Ativos</option><option value="inactive">Inativos</option></> : <><option value="pending">Pendentes</option><option value="accepted">Aceitos</option><option value="revoked">Revogados</option><option value="expired">Expirados</option><option value="blocked">Bloqueados</option></>}</select></label><button className="secondary-button" type="submit"><Search size={18} aria-hidden="true" />Buscar</button></form>{feedback && <div role="status" className="form-feedback">{feedback}{createdId && <button className="team-text-button" onClick={() => void copyLink(createdId)}><Copy size={16} aria-hidden="true" />Copiar link do convite</button>}</div>}{error ? <div className="team-empty"><p role="alert" className="form-feedback error">{error.message}</p><button className="primary-button" onClick={reload}><RefreshCw size={18} aria-hidden="true" />Tentar novamente</button></div> : !dashboard ? null : <><TeamList dashboard={dashboard} busy={busy} onArchive={context.permissions.includes('archives.manage') ? member => void archive(member) : undefined} onEdit={member => { setEditor({ kind: 'member', member }); setMutationError(undefined); }} onDelegate={member => { setEditor({ kind: 'delegation', member }); setMutationError(undefined); }} onSend={invite => void send(invite)} onRevoke={invite => void revoke(invite)} onCopy={id => void copyLink(id)} /><nav className="team-pagination" aria-label="Paginação da equipe"><button className="team-text-button" disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)}><ArrowLeft size={16} aria-hidden="true" />Anterior</button><span>Página {dashboard.page} de {Math.max(1, Math.ceil(dashboard.total / dashboard.page_size))} · {dashboard.total} {dashboard.total === 1 ? 'registro' : 'registros'}</span><button className="team-text-button" disabled={page * dashboard.page_size >= dashboard.total || busy} onClick={() => setPage(value => value + 1)}>Próxima<ArrowRight size={16} aria-hidden="true" /></button></nav></>}</section>{editor && dashboard && <div className="team-editor-slot">{editor.kind === 'invite' ? <InviteForm key={office} office={office} scope={dashboard.scope} onClose={() => setEditor(null)} onError={showError} onCreated={(id, delivery) => { setEditor(null); setKind('invitations'); setPage(1); setQuery(''); setQueryInput(''); setStatus('all'); setCreatedId(id); setFeedback(deliveryMessage(delivery)); reload(); }} /> : editor.kind === 'member' ? <MemberForm key={editor.member.id} member={editor.member} office={office} scope={dashboard.scope} onClose={() => setEditor(null)} onSaved={saved} onError={showError} /> : <DelegationForm key={editor.member.id} member={editor.member} office={office} scope={dashboard.scope} onClose={() => setEditor(null)} onSaved={saved} onError={showError} />}</div>}</div></>}</div></OperationLayout>;
}
