import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Users } from 'lucide-react';
import type { TeamDashboard, TeamInvitation, TeamMember } from '../../../shared/team';
import { paths } from '../../app/routes';
import { Brand } from '../../ui/Brand';
import { useAuth } from '../auth/AuthProvider';
import { AccessShell } from '../access/AccessShell';
import { deliveryMessage, teamApi, teamError, type TeamError } from './api';
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
  function search(event: FormEvent) { event.preventDefault(); setQuery(queryInput.trim()); setPage(1); }
  if (auth.status === 'loading') return <AccessShell title="Verificando acesso"><p role="status">Aguarde a verificação da sua sessão…</p></AccessShell>;
  if (auth.status === 'signedOut' || auth.status === 'expired') return <Navigate replace to={paths.team} state={auth.status === 'expired' ? { sessionExpired: true } : null} />;
  if (!context || auth.status !== 'authorized') return <AccessShell title={auth.status === 'unavailable' ? 'Acesso indisponível' : 'Acesso não autorizado'}><p role="alert" className="form-feedback error">{auth.status === 'unavailable' ? 'Não conseguimos verificar sua sessão agora.' : 'Sua conta não possui permissão para gerenciar a equipe neste escritório.'}</p><button className="primary-button" onClick={auth.refresh}>Verificar novamente</button><Link className="return-login" to={paths.panel}>Voltar ao painel</Link></AccessShell>;
  const fatal = [error, mutationError].find(item => item?.status === 401 || item?.status === 403);
  return <div className="team-layout"><aside className="team-sidebar"><Brand light /><p className="eyebrow">Área da equipe</p><nav aria-label="Equipe"><Link to={paths.panel}><ArrowLeft size={17} aria-hidden="true" />Painel</Link><Link to={paths.teamManagement} aria-current="page"><Users size={17} aria-hidden="true" />Equipe e convites</Link></nav><p className="team-sidebar-note">Acesso individual.<br />Permissões verificadas a cada operação.</p></aside><main id="conteudo" className={`team-main${editor ? ' team-editing' : ''}`}><header className="team-header"><div className="team-mobile-brand"><Brand /></div><div><p className="eyebrow">{context.office_name}</p><h1>Equipe e convites</h1><p>Gerencie pessoas, acessos e convites do escritório.</p></div><div className="team-header-actions"><Link className="team-text-button" to={paths.panel}>Voltar ao painel</Link><button className="team-text-button" disabled={busy} onClick={() => { setBusy(true); void auth.logout().then(ok => { if (!ok) showError(new Error()); }).finally(() => setBusy(false)); }}><LogOut size={16} aria-hidden="true" />Sair</button></div></header>{contexts.length > 1 && <label className="team-field team-office" htmlFor="team-office">Escritório<select id="team-office" value={office} onChange={event => { setSelectedOffice(event.target.value); setPage(1); }} >{contexts.map(item => <option key={item.office_id} value={item.office_id}>{item.office_name}</option>)}</select></label>}{fatal ? <div className="team-empty"><p role="alert" className="form-feedback error">{fatal.message}</p>{fatal.status === 401 ? <Link className="primary-button" to={paths.team}>Entrar novamente</Link> : <button className="primary-button" onClick={() => { reload(); auth.refresh(); }}>Verificar acesso novamente</button>}</div> : <><div className="team-toolbar"><div className="team-tabs" role="tablist" aria-label="Gestão da equipe"><button role="tab" aria-selected={kind === 'members'} aria-controls="team-results" id="tab-members" onClick={() => changeTab('members')}>Equipe{dashboard && ` (${dashboard.counts.members})`}</button><button role="tab" aria-selected={kind === 'invitations'} aria-controls="team-results" id="tab-invitations" onClick={() => changeTab('invitations')}>Convites{dashboard && ` (${dashboard.counts.invitations})`}</button></div><button className="primary-button" disabled={!dashboard || busy} onClick={() => { setEditor({ kind: 'invite' }); setFeedback(''); setMutationError(undefined); setCreatedId(''); }}>Novo convite</button></div>{mutationError && <p className="form-feedback error" role="alert">{mutationError.message}</p>}<div className="team-workspace"><section className="team-roster" id="team-results" role="tabpanel" aria-labelledby={`tab-${kind}`}><form className="team-filters" onSubmit={search}><label className="team-field" htmlFor="team-search">Buscar por nome ou e-mail<input id="team-search" type="search" maxLength={120} autoComplete="off" value={queryInput} onChange={event => setQueryInput(event.target.value)} /></label><label className="team-field" htmlFor="team-status">Estado<select id="team-status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">Todos</option>{kind === 'members' ? <><option value="active">Ativos</option><option value="inactive">Inativos</option></> : <><option value="pending">Pendentes</option><option value="accepted">Aceitos</option><option value="revoked">Revogados</option><option value="expired">Expirados</option><option value="blocked">Bloqueados</option></>}</select></label><button className="secondary-button" type="submit">Buscar</button></form>{feedback && <div role="status" className="form-feedback">{feedback}{createdId && <button className="team-text-button" onClick={() => void copyLink(createdId)}>Copiar link do convite</button>}</div>}{error ? <div className="team-empty"><p role="alert" className="form-feedback error">{error.message}</p><button className="primary-button" onClick={reload}>Tentar novamente</button></div> : !dashboard ? <p className="team-empty" role="status">Carregando {kind === 'members' ? 'equipe' : 'convites'}…</p> : <><TeamList dashboard={dashboard} busy={busy} onEdit={member => { setEditor({ kind: 'member', member }); setMutationError(undefined); }} onDelegate={member => { setEditor({ kind: 'delegation', member }); setMutationError(undefined); }} onSend={invite => void send(invite)} onRevoke={invite => void revoke(invite)} onCopy={id => void copyLink(id)} /><nav className="team-pagination" aria-label="Paginação da equipe"><button className="team-text-button" disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {dashboard.page} de {Math.max(1, Math.ceil(dashboard.total / dashboard.page_size))} · {dashboard.total} {dashboard.total === 1 ? 'registro' : 'registros'}</span><button className="team-text-button" disabled={page * dashboard.page_size >= dashboard.total || busy} onClick={() => setPage(value => value + 1)}>Próxima</button></nav></>}</section>{editor && dashboard && <div className="team-editor-slot">{editor.kind === 'invite' ? <InviteForm key={office} office={office} scope={dashboard.scope} onClose={() => setEditor(null)} onError={showError} onCreated={(id, delivery) => { setEditor(null); setKind('invitations'); setPage(1); setQuery(''); setQueryInput(''); setStatus('all'); setCreatedId(id); setFeedback(deliveryMessage(delivery)); reload(); }} /> : editor.kind === 'member' ? <MemberForm key={editor.member.id} member={editor.member} office={office} scope={dashboard.scope} onClose={() => setEditor(null)} onSaved={saved} onError={showError} /> : <DelegationForm key={editor.member.id} member={editor.member} office={office} scope={dashboard.scope} onClose={() => setEditor(null)} onSaved={saved} onError={showError} />}</div>}</div></>}</main></div>;
}
