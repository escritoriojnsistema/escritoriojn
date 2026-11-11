import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { validCategoryCommand, type CategoriesState, type CategoryCommand, type ServiceCategory } from '../../../shared/categories';
import { categoriesApi, categoriesError, CategoriesError } from './categoriesApi';
import '../team/team.css';
import '../customers/customers.css';
import './categories.css';

type Editor = { kind: 'create' } | { kind: 'rename' | 'delete'; item: ServiceCategory };
type Intent = { command: CategoryCommand; key: string };
export function CategoriesSettings({ office, onDenied, onPendingChange }: { office: string; onDenied?: () => void; onPendingChange?:(pending:boolean)=>void }) {
  // The office key also makes the component safe when embedded without a keyed parent.
  return <CategoriesWorkspace key={office} office={office} onDenied={onDenied} onPendingChange={onPendingChange} />;
}
export default CategoriesSettings;
function CategoriesWorkspace({ office, onDenied, onPendingChange }: { office: string; onDenied?: () => void; onPendingChange?:(pending:boolean)=>void }) {
  const [level,setLevel]=useState<''|'1'|'2'|'3'>('');
  const [archived,setArchived]=useState(false);
  const [data, setData] = useState<CategoriesState>();
  const [error, setError] = useState<CategoriesError>();
  const [editor, setEditor] = useState<Editor>();
  const [name, setName] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0), [page, setPage] = useState(1);
  const [size, setSize] = useState(() => matchMedia('(max-width: 900px)').matches ? 3 : 5);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const pending = useRef<AbortController | null>(null), intent = useRef<Intent | undefined>(undefined), busyRef = useRef(false);
  const onPending=useRef(onPendingChange);onPending.current=onPendingChange;
  useEffect(()=>{onPending.current?.(busy||uncertain);},[busy,uncertain]);
  useEffect(()=>()=>onPending.current?.(false),[]);
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;
  function deny(failure: CategoriesError) {
    setData(undefined); setEditor(undefined); setName(''); setReason(''); intent.current = undefined;
    setUncertain(false); setBlocked(true); setError(failure); onDeniedRef.current?.();
  }
  useEffect(() => {
    const media = matchMedia('(max-width: 900px)');
    const change = () => { setSize(media.matches ? 3 : 5); setPage(1); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (blocked) return;
    const controller = new AbortController();
    void categoriesApi.state(office, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setError(undefined); }
    }).catch(cause => {
      if (controller.signal.aborted) return;
      const failure = categoriesError(cause);
      if (failure.status === 401 || failure.status === 403) deny(failure); else setError(failure);
    });
    return () => controller.abort();
  }, [office, revision, blocked]);
  useEffect(() => () => pending.current?.abort(), []);
  function choose(next?: Editor) {
    if (busyRef.current || intent.current) return;
    setEditor(next); setName(next && next.kind !== 'create' ? next.item.name : '');
    setLevel(next && next.kind !== 'create' && next.item.execution_level ? String(next.item.execution_level) as '1'|'2'|'3' : '');
    setReason(''); setError(undefined); setMessage('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || !editor || !data?.can_manage) return;
    const command: CategoryCommand = editor.kind === 'create' ? { kind: 'create', name: name.trim(), execution_level:Number(level) as 1|2|3, reason: reason.trim() }
      : editor.kind === 'rename' ? { kind: 'rename', category_id: editor.item.id, expected_revision: editor.item.revision, name: name.trim(), execution_level:Number(level) as 1|2|3, reason: reason.trim() }
      : { kind: 'delete', category_id: editor.item.id, expected_revision: editor.item.revision, reason: reason.trim() };
    if (!validCategoryCommand(command)) { setError(new CategoriesError(422)); setMessage(editor.kind==='delete'?'Informe um motivo válido de até 500 caracteres.':'Informe um nome de até 60 caracteres, selecione o nível de execução e informe um motivo de até 500 caracteres.'); return; }
    intent.current ??= { command, key: crypto.randomUUID() };
    const saved = intent.current;
    const controller = new AbortController(); pending.current = controller; busyRef.current = true;
    setBusy(true); setError(undefined); setMessage('');
    try {
      const result = await categoriesApi.command(office, saved.command, saved.key, controller.signal);
      if (controller.signal.aborted) return;
      setData(result); intent.current = undefined; setUncertain(false); setEditor(undefined); setName(''); setReason(''); setPage(1);
      setMessage(saved.command.kind === 'create' ? 'Categoria criada.' : saved.command.kind === 'rename' ? 'Categoria renomeada. O histórico dos serviços foi preservado.' : 'Categoria excluída.');
    } catch (cause) {
      if (controller.signal.aborted) return;
      const failure = categoriesError(cause);
      if (failure.status === 401 || failure.status === 403) deny(failure);
      else { setError(failure); if (failure.status >= 500) setUncertain(true); else { intent.current = undefined; setUncertain(false); } }
    } finally { if (pending.current === controller) { pending.current = null; busyRef.current = false; setBusy(false); } }
  }
  const entries=archived ? data?.archived_items??[] : data?.items??[];
  const maxPage = Math.max(1, Math.ceil(entries.length / size));
  const shownPage = Math.min(page, maxPage), items = entries.slice((shownPage - 1) * size, shownPage * size);
  return <section className="categories-settings" aria-label="Categorias de serviços">
    <p className="customer-note">Categorias compartilhadas por Serviços e Solicitações. Documentos reúne contratos, declarações, requerimentos e ofícios; Rural inclui imóveis, ITR, DITR, CCIR e CAR; Previdenciário inclui salário-maternidade e aposentadoria.</p>
    {error && <p role="alert" className="form-feedback error">{error.message}</p>}
    {message && <p role="status" className="form-feedback">{message}</p>}
    {!blocked && <>
      {!editor && <div className="categories-actions">
        {data?.can_manage && <button type="button" className="team-text-button" aria-pressed={archived} onClick={()=>{setArchived(v=>!v);setPage(1);}}>{archived?'Ver categorias ativas':'Ver categorias arquivadas'}</button>}
        {data?.can_manage && <button type="button" className="primary-button" onClick={() => choose({ kind: 'create' })}><Plus size={18} aria-hidden="true" />Nova categoria</button>}
        <button type="button" className="team-text-button" disabled={busy} onClick={() => setRevision(n => n + 1)}><RefreshCw size={18} aria-hidden="true" />Atualizar categorias</button>
      </div>}
      {editor && data?.can_manage ? <form onSubmit={submit} noValidate>
        <h2>{editor.kind === 'create' ? 'Nova categoria' : editor.kind === 'rename' ? 'Editar categoria' : `Excluir ${editor.item.name}`}</h2>
        <fieldset disabled={busy || uncertain}>
          {editor.kind !== 'delete' && <label className="team-field">Nome da categoria<input value={name} maxLength={60} onChange={event => setName(event.target.value)} /></label>}
          {editor.kind !== 'delete' && <label className="team-field">Nível de execução<select value={level} onChange={event=>setLevel(event.target.value as typeof level)} required><option value="">Selecione o nível</option><option value="1">Nível 1 — restrito</option><option value="2">Nível 2 — habilitação independente</option><option value="3">Nível 3 — geral</option></select></label>}
          {editor.kind === 'delete' && <p className="customer-note">A categoria será arquivada. Serviços e histórico permanecem conservados.</p>}
          <label className="team-field">Motivo<input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
        </fieldset>
        {uncertain && <p className="customer-note">Repita a operação para confirmar o resultado. Os dados e a chave desta tentativa foram preservados.</p>}
        <div className="categories-actions">
          <button className="primary-button" type="submit" disabled={busy}>{editor.kind === 'delete' ? 'Excluir categoria' : 'Salvar categoria'}</button>
          <button data-operation-local-return className="team-text-button" type="button" disabled={busy || uncertain} onClick={() => choose()}>Cancelar</button>
        </div>
      </form> : data && <>
        {items?.length ? <ul className="customer-list" aria-label="Categorias configuradas">{items.map(item => <li key={item.id}>
          <div><strong>{item.name}</strong>{item.archived_at&&<small>Arquivada — fora das novas solicitações</small>}<small>{item.execution_level ? `Nível ${item.execution_level}` : 'Nível pendente — não distribuir'}</small>{data.can_manage && <small>{item.services ?? 0} serviços com histórico · revisão {item.revision}</small>}</div>
          {data.can_manage && <div className="categories-actions">
            <button type="button" className="operation-icon-button" aria-label={`Editar ${item.name}`} title="Editar categoria" onClick={() => choose({ kind: 'rename', item })}><Pencil size={18} aria-hidden="true" /></button>
            {!item.archived_at&&<button type="button" className="operation-icon-button" aria-label={`Excluir ${item.name}`} title="Excluir categoria" onClick={() => choose({ kind: 'delete', item })}><Trash2 size={18} aria-hidden="true" /></button>}
          </div>}
        </li>)}</ul> : <p className="team-empty">Nenhuma categoria configurada.</p>}
        <nav className="team-pagination" aria-label="Paginação de categorias">
          <button type="button" className="team-text-button" disabled={shownPage <= 1} onClick={() => setPage(shownPage - 1)}><ArrowLeft size={17} aria-hidden="true" />Anterior</button>
          <span>{shownPage}/{maxPage} · {entries.length} categorias</span>
          <button type="button" className="team-text-button" disabled={shownPage >= maxPage} onClick={() => setPage(shownPage + 1)}>Próxima<ArrowRight size={17} aria-hidden="true" /></button>
        </nav>
      </>}
    </>}
  </section>;
}
