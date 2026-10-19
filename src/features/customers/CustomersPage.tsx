import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, LogIn, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import type { CustomerDetail, CustomerInput, CustomerPage } from '../../../shared/customers';
import { formatCnpj, formatCpf } from '../../../shared/identifiers';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { CustomerForm } from './CustomerForm';
import { customersApi, customersError, CustomersError } from './api';
import '../team/team.css';
import './customers.css';

const compactMedia = '(max-width: 900px), (hover: none) and (pointer: coarse) and (max-width: 1200px)';
type View = { kind: 'list' } | { kind: 'create' } | { kind: 'detail'; id: string; data?: CustomerDetail } | { kind: 'edit'; data: CustomerDetail };
export default function CustomersPage() {
  const auth = useAuth();
  const contexts = auth.contexts.filter(context => context.role_code !== 'client' && context.permissions.includes('customers.read'));
  const [selectedOffice, setSelectedOffice] = useState('');
  const context = contexts.find(item => item.office_id === selectedOffice) ?? contexts[0];
  const office = context?.office_id ?? '';
  const canCreate = context?.permissions.includes('customers.create') ?? false;
  const canUpdate = context?.permissions.includes('customers.update') ?? false;
  const scope = `${auth.sessionKey}:${auth.status}:${office}:${context?.user_id ?? ''}:${context?.role_code ?? ''}:${context?.permissions.slice().sort().join(',') ?? ''}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const [size, setSize] = useState(() => matchMedia(compactMedia).matches ? 3 : 5);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [operationError, setOperationError] = useState<CustomersError>();
  const key = `${scope}:${page}:${size}:${query}:${revision}`;
  const [resource, setResource] = useState<{ key: string; data?: CustomerPage; error?: CustomersError }>({ key: '' });
  useEffect(() => () => { generation.current++; pending.current?.abort(); }, []);
  useEffect(() => {
    const media = matchMedia(compactMedia);
    const changed = () => { setSize(media.matches ? 3 : 5); setPage(1); };
    media.addEventListener('change', changed); return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (!office || auth.status !== 'authorized' || view.kind !== 'list') return;
    const controller = new AbortController();
    void customersApi.search({ office_id: office, query, page, size }, controller.signal).then(data => {
      if (!controller.signal.aborted && scopeRef.current === scope) setResource({ key, data });
    }).catch(cause => { if (!controller.signal.aborted && scopeRef.current === scope) setResource({ key, error: customersError(cause) }); });
    return () => controller.abort();
  }, [office, auth.status, scope, key, query, page, size, view.kind]);
  useEffect(() => {
    if (view.kind !== 'detail' || view.data || !office || auth.status !== 'authorized') return;
    const id = view.id; const started = generation.current; const controller = new AbortController(); pending.current = controller; setBusy(true);
    void customersApi.detail(office, id, controller.signal).then(data => {
      if (!controller.signal.aborted && scopeRef.current === scope && generation.current === started) { pending.current = null; setBusy(false); setView({ kind: 'detail', id, data }); }
    }).catch(cause => { if (!controller.signal.aborted && scopeRef.current === scope && generation.current === started) setOperationError(customersError(cause)); }).finally(() => { if (pending.current === controller) { pending.current = null; setBusy(false); } });
    return () => { controller.abort(); if (pending.current === controller) pending.current = null; };
  }, [view, office, auth.status, scope]);
  const data = resource.key === key ? resource.data : undefined;
  const error = resource.key === key ? resource.error : undefined;
  const fatal = [error, operationError].find(item => item?.status === 401 || item?.status === 403);
  function transition(next: View) { generation.current++; pending.current?.abort(); pending.current = null; setBusy(false); setOperationError(undefined); setFeedback(''); setView(next); window.scrollTo(0, 0); }
  function back() { transition({ kind: 'list' }); setRevision(value => value + 1); }
  function reload() { transition({ kind: 'list' }); setRevision(value => value + 1); }
  function changeOffice(next: string) { transition({ kind: 'list' }); setSelectedOffice(next); setPage(1); setQuery(''); setQueryInput(''); }
  function search(event: FormEvent) { event.preventDefault(); setQuery(queryInput.trim()); setPage(1); setRevision(value => value + 1); setOperationError(undefined); setFeedback(''); }
  async function save(input: CustomerInput) {
    if (busy || !context || (view.kind !== 'create' && view.kind !== 'edit') || (view.kind === 'create' ? !canCreate : !canUpdate || !view.data.can_update)) return;
    const editing = view.kind === 'edit' ? view.data : undefined;
    const started = generation.current; const controller = new AbortController(); pending.current = controller; setBusy(true); setOperationError(undefined); setFeedback('');
    try {
      const result = editing ? await customersApi.update(office, editing.id, input, editing.version, controller.signal) : await customersApi.create(office, input, controller.signal);
      if (controller.signal.aborted || scopeRef.current !== scope || generation.current !== started) return;
      setView({ kind: 'detail', id: result.id, data: result }); setFeedback(editing ? 'Ficha atualizada.' : 'Cliente cadastrado.'); setRevision(value => value + 1);
    } catch (cause) { if (!controller.signal.aborted && scopeRef.current === scope && generation.current === started) setOperationError(customersError(cause)); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') return <Navigate replace to={paths.team} state={auth.status === 'expired' ? { sessionExpired: true } : null} />;
  if (auth.status !== 'authorized' || !context) return <OperationalFeedback status={auth.status === 'unavailable' ? 'unavailable' : 'denied'} />;
  const selected = view.kind === 'detail' ? view.data : undefined;
  const title = view.kind === 'list' ? 'Clientes' : view.kind === 'create' ? 'Novo cliente' : view.kind === 'edit' ? 'Editar cliente' : 'Ficha do cliente';
  return <OperationLayout busy={busy}><div className="customers-main">
    <OperationHeading context={context} title={title} description={view.kind === 'list' ? 'Cadastre e consulte as fichas do escritório.' : 'Ficha de atendimento, independente da conta de acesso.'} showRole={false} />
    {contexts.length > 1 && <label className="team-field team-office customer-office" htmlFor="customers-office">Escritório<select id="customers-office" value={office} onChange={event => changeOffice(event.target.value)}>{contexts.map(item => <option key={item.office_id} value={item.office_id}>{item.office_name}</option>)}</select></label>}
    {fatal ? <div className="team-empty"><p role="alert" className="form-feedback error">{fatal.message}</p>{fatal.status === 401 ? <Link className="primary-button" to={paths.team}><LogIn size={18} aria-hidden="true" />Entrar novamente</Link> : <button className="primary-button" onClick={() => { reload(); auth.refresh(); }}><RefreshCw size={18} aria-hidden="true" />Verificar acesso novamente</button>}</div> : <>
      {view.kind !== 'list' && <div className="customer-view-toolbar"><button className="team-text-button" onClick={back}><ArrowLeft size={18} aria-hidden="true" />Voltar à lista</button>{selected && canUpdate && selected.can_update && <button className="team-text-button" onClick={() => transition({ kind: 'edit', data: selected })}><Pencil size={18} aria-hidden="true" />Editar cliente</button>}</div>}
      {feedback && <p className="form-feedback" role="status">{feedback}</p>}
      {operationError && <div className="customer-error"><p className="form-feedback error" role="alert">{operationError.message}</p>{operationError.status === 409 && operationError.code !== 'CUSTOMER_DUPLICATE' && view.kind === 'edit' && <button className="team-text-button" onClick={() => transition({ kind: 'detail', id: view.data.id })}>Reabrir ficha</button>}{view.kind === 'detail' && operationError.status !== 404 && <button className="team-text-button" onClick={() => { setOperationError(undefined); setView({ kind: 'detail', id: view.id }); }}>Tentar novamente</button>}</div>}
      {view.kind === 'create' || view.kind === 'edit' ? <CustomerForm key={`${office}:${view.kind}:${view.kind === 'edit' ? view.data.id : ''}`} customer={view.kind === 'edit' ? view.data : undefined} busy={busy} onSave={input => void save(input)} /> : view.kind === 'detail' ? selected && <section className="customer-detail" aria-label="Dados da ficha">{selected.source === 'client_registration' && <p className="customer-note" role="note">{selected.materialized ? 'Cadastro feito pelo cliente. O acesso a documentos internos dependerá de aprovação.' : 'Cadastro feito pelo cliente. Há contato semelhante em ficha interna; a associação depende de conferência.'}</p>}<dl><div><dt>{selected.kind === 'person' ? 'Nome completo' : 'Razão social'}</dt><dd>{selected.name}</dd></div><div><dt>Tipo de pessoa</dt><dd>{selected.kind === 'person' ? 'Pessoa física' : 'Pessoa jurídica'}</dd></div><div><dt>{selected.kind === 'person' ? 'CPF' : 'CNPJ'}</dt><dd>{selected.identifier ? (selected.kind === 'person' ? formatCpf(selected.identifier) : formatCnpj(selected.identifier)) : 'Não informado'}</dd></div><div><dt>Contatos</dt><dd>{selected.contacts.length ? selected.contacts.map((contact, index) => <span className="customer-detail-contact" key={index}>{contact.kind === 'email' ? 'E-mail' : 'Telefone'}: {contact.value}</span>) : 'Nenhum contato informado'}</dd></div></dl></section> : <>
        <div className="customer-toolbar"><form className="customer-search" onSubmit={search}><label className="team-field" htmlFor="customer-search">Buscar por nome, CPF ou CNPJ<input id="customer-search" type="search" autoComplete="off" maxLength={120} value={queryInput} onChange={event => setQueryInput(event.target.value)} /></label><button className="operation-icon-button" type="submit" aria-label="Buscar" title="Buscar"><Search size={21} aria-hidden="true" /></button></form><button className="operation-icon-button" aria-label="Atualizar lista" title="Atualizar lista" onClick={reload}><RefreshCw size={20} aria-hidden="true" /></button>{canCreate && <button className="primary-button customer-new" aria-label="Novo cliente" title="Novo cliente" onClick={() => transition({ kind: 'create' })}><Plus size={18} aria-hidden="true" /><span>Novo cliente</span></button>}</div>
        {error ? <div className="team-empty"><p role="alert" className="form-feedback error">{error.message}</p><button className="team-text-button" onClick={reload}><RefreshCw size={18} aria-hidden="true" />Tentar novamente</button></div> : !data ? null : <>{data.items.length === 0 ? <p className="team-empty">Nenhum cliente encontrado. Confira a busca.</p> : <ul className="customer-list" aria-label="Clientes do escritório">{data.items.map(customer => <li key={customer.id}><div><strong>{customer.name}</strong><small>{customer.source === 'client_registration' ? 'Cadastro pelo cliente' : customer.kind === 'person' ? 'Pessoa física' : 'Pessoa jurídica'} · {customer.identifier_masked ?? 'Sem identificador'}</small></div><button className="operation-icon-button" aria-label={`Ver ficha de ${customer.name}`} title="Ver ficha" onClick={() => transition({ kind: 'detail', id: customer.id })}><Eye size={20} aria-hidden="true" /></button></li>)}</ul>}<nav className="team-pagination" aria-label="Paginação dos clientes"><button className="team-text-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ArrowLeft size={17} aria-hidden="true" />Anterior</button><span>Página {data.page} de {Math.max(1, Math.ceil(data.total / data.page_size))} · {data.total} clientes</span><button className="team-text-button" disabled={page * data.page_size >= data.total} onClick={() => setPage(value => value + 1)}>Próxima<ArrowRight size={17} aria-hidden="true" /></button></nav></>}
      </>}
    </>}
  </div></OperationLayout>;
}
