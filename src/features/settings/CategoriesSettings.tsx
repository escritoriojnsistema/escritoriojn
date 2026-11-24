import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { validCategoryCommand, type CategoriesState, type CategoryCommand, type ServiceCategory } from '../../../shared/categories';
import { categoriesApi, categoriesError, CategoriesError } from './categoriesApi';
import '../team/team.css';
import '../customers/customers.css';
import './categories.css';
import { CategoryIntakeSettings } from '../categoryIntake/CategoryIntakeSettings';
import { CategorySelection } from './CategorySelection';

type Editor = { kind: 'create'; parentId?:string } | { kind: 'rename' | 'delete'; item: ServiceCategory };
type Intent = { command: CategoryCommand; key: string };
type CategoryGroup = { id: string; name: string; general?: ServiceCategory; folders: ServiceCategory[] };

const byName = (a: {name:string}, b: {name:string}) => a.name.localeCompare(b.name, 'pt-BR');
function groupCategories(entries: ServiceCategory[]): CategoryGroup[] {
  const groups = new Map<string,CategoryGroup>();
  for (const item of entries) {
    const id = item.parent_id ?? item.id;
    const group = groups.get(id) ?? { id, name: item.parent_name ?? item.name, folders: [] };
    if (item.parent_id) group.folders.push(item);
    else { group.general = item; group.name = item.name; }
    groups.set(id,group);
  }
  return [...groups.values()].sort(byName).map(group=>({ ...group, folders:group.folders.sort(byName) }));
}
const levelLabel = (item: ServiceCategory) => item.execution_level ? `Nível ${item.execution_level}` : 'Nível pendente — não distribuir';

export function CategoriesSettings({ office, onDenied, onPendingChange, onHeaderAction }: { office: string; onDenied?: () => void; onPendingChange?:(pending:boolean)=>void; onHeaderAction?: (action: ReactNode) => void }) {
  // The office key also makes the component safe when embedded without a keyed parent.
  return <CategoriesWorkspace key={office} office={office} onDenied={onDenied} onPendingChange={onPendingChange} onHeaderAction={onHeaderAction} />;
}
export default CategoriesSettings;
function CategoriesWorkspace({ office, onDenied, onPendingChange, onHeaderAction }: { office: string; onDenied?: () => void; onPendingChange?:(pending:boolean)=>void; onHeaderAction?: (action: ReactNode) => void }) {
  const [level,setLevel]=useState<''|'1'|'2'|'3'>('');
  const [archived,setArchived]=useState(false);
  const [data, setData] = useState<CategoriesState>();
  const [error, setError] = useState<CategoriesError>();
  const [editor, setEditor] = useState<Editor>();
  const [intakeRoot,setIntakeRoot]=useState('');
  const [intakeSelection,setIntakeSelection]=useState('');
  const [intakeLocked,setIntakeLocked]=useState(false);
  const [intakeDirty,setIntakeDirty]=useState(false);
  const [name, setName] = useState(''), [reason, setReason] = useState(''), [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0), [page, setPage] = useState(1);
  const [size, setSize] = useState(() => matchMedia('(max-width: 900px)').matches ? 3 : 5);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [blocked, setBlocked] = useState(false);
  const pending = useRef<AbortController | null>(null), intent = useRef<Intent | undefined>(undefined), busyRef = useRef(false);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editorMode = editor?.kind;
  useEffect(()=>{if (editorMode) editorHeading.current?.focus();},[editorMode]);
  const onPending=useRef(onPendingChange);onPending.current=onPendingChange;
  useEffect(()=>{onPending.current?.(busy||uncertain);},[busy,uncertain]);
  useEffect(()=>()=>onPending.current?.(false),[]);
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;
  const onHeaderActionRef = useRef(onHeaderAction);
  onHeaderActionRef.current = onHeaderAction;
  function deny(failure: CategoriesError) {
    setData(undefined); setEditor(undefined); setIntakeRoot(''); setIntakeSelection(''); setName(''); setReason(''); intent.current = undefined;
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
    const command: CategoryCommand = editor.kind === 'create' ? { kind: 'create', ...(editor.parentId?{parent_id:editor.parentId}:{}), name: name.trim(), execution_level:Number(level) as 1|2|3, reason: reason.trim() }
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
      setData(result); intent.current = undefined; setUncertain(false); setEditor(undefined); setName(''); setReason('');
      const folder = editor.kind==='create' ? !!editor.parentId : !!editor.item.parent_id;
      setMessage(saved.command.kind === 'create' ? (folder?'Subpasta criada.':'Categoria criada.')
        : saved.command.kind === 'rename' ? (folder?'Subpasta atualizada.':'Categoria atualizada.')
        : (folder?'Subpasta excluída.':'Categoria excluída.'));
    } catch (cause) {
      if (controller.signal.aborted) return;
      const failure = categoriesError(cause);
      if (failure.status === 401 || failure.status === 403) deny(failure);
      else { setError(failure); if (failure.status >= 500) setUncertain(true); else { intent.current = undefined; setUncertain(false); } }
    } finally { if (pending.current === controller) { pending.current = null; busyRef.current = false; setBusy(false); } }
  }
  const categories=data?.items??[];
  const groups=groupCategories(archived ? data?.archived_items??[] : categories);
  const maxPage = Math.max(1, Math.ceil(groups.length / size));
  const shownPage = Math.min(page, maxPage), items = groups.slice((shownPage - 1) * size, shownPage * size);
  const parentId=editor?.kind==='create'?editor.parentId:editor?.item.parent_id;
  const editorGroup=editor?.kind==='rename'?groups.find(group=>group.id===(editor.item.parent_id??editor.item.id)):undefined;
  const creationParent=editor?.kind==='create'&&parentId?categories.find(item=>item.id===parentId):undefined;
  const intakeCategory=categories.find(item=>item.id===intakeSelection);
  const inIntake=!!(intakeRoot&&data?.can_manage&&!blocked);
  function closeIntake(){setIntakeRoot('');setIntakeSelection('');setIntakeLocked(false);setIntakeDirty(false);}
  function openIntake(item:ServiceCategory){
    setMessage('');setError(undefined);
    setIntakeRoot(item.id);
    setIntakeSelection(categories.some(other=>other.parent_id===item.id)?'':item.id);
  }
  useEffect(()=>{
    if(!onHeaderActionRef.current)return;
    if(inIntake){
      onHeaderActionRef.current(
        <button type="button" data-operation-local-return className="primary-button categories-return-btn" disabled={intakeLocked} onClick={closeIntake}>
          <ArrowLeft size={17} aria-hidden="true"/>
          <span>Voltar às categorias</span>
        </button>
      );
    }else{
      onHeaderActionRef.current(undefined);
    }
  },[inIntake,intakeLocked]);
  useEffect(()=>()=>onHeaderActionRef.current?.(undefined),[]);
  if(inIntake)return <section className="categories-intake-shell" aria-label="Selecionar configuração de atendimento">
    <div className="categories-intake-selector-bar">
      <CategorySelection categories={categories} value={intakeSelection} rootId={intakeRoot}
        label="Categoria do formulário" disabled={intakeLocked||intakeDirty}
        onChange={(id,parent)=>{setIntakeRoot(parent);setIntakeSelection(id);}}/>
    </div>
    {intakeDirty&&<p className="customer-note categories-intake-lock-note">Salve ou descarte as alterações para trocar de categoria ou subpasta.</p>}
    {intakeCategory?<CategoryIntakeSettings office={office} categoryId={intakeCategory.id}
      categoryName={[intakeCategory.parent_name,intakeCategory.name].filter(Boolean).join(' › ')}
      hideBackButton={!!onHeaderAction}
      onBack={closeIntake} onDenied={()=>deny(new CategoriesError(403))}
      onDirtyChange={setIntakeDirty} onPendingChange={value=>{setIntakeLocked(value);onPendingChange?.(value);}}/>
      :!onHeaderAction?<button type="button" data-operation-local-return className="primary-button categories-return-btn" onClick={closeIntake}><ArrowLeft size={17} aria-hidden="true"/><span>Voltar às categorias</span></button>
      :<p className="team-empty categories-intake-empty">Selecione a subpasta acima para abrir o formulário e os anexos.</p>}
  </section>;
  return <section className="categories-settings" aria-label="Categorias de serviços">
    {error && <p role="alert" className="form-feedback error">{error.message}</p>}
    {message && <p role="status" className="form-feedback">{message}</p>}
    {!blocked && <>
      {!editor && <div className="categories-actions">
        {data?.can_manage && <button type="button" className="team-text-button" aria-pressed={archived} onClick={()=>{setArchived(v=>!v);setPage(1);}}>{archived?'Ver categorias ativas':'Ver categorias arquivadas'}</button>}
        {data?.can_manage && <button type="button" className="primary-button" onClick={() => choose({ kind: 'create' })}><Plus size={18} aria-hidden="true" />Nova categoria</button>}
        <button type="button" className="team-text-button" disabled={busy} onClick={() => setRevision(n => n + 1)}><RefreshCw size={18} aria-hidden="true" />Atualizar categorias</button>
      </div>}
      {editor && data?.can_manage ? <form onSubmit={submit} noValidate>
        <h2 ref={editorHeading} tabIndex={-1}>{editor.kind === 'create' ? (parentId?'Nova subpasta':'Nova categoria') : editor.kind === 'rename' ? (parentId?'Editar subpasta':'Editar categoria') : `Excluir ${editor.item.name}`}</h2>
        <fieldset disabled={busy || uncertain}>
          {creationParent&&<p className="customer-note">Categoria principal {creationParent.name}</p>}
          {editor.kind==='rename'&&editorGroup&&<label className="team-field">Subpasta
            <select aria-label="Subpasta" value={editor.item.id} onChange={event=>{
              const id = event.target.value;
              const item = editorGroup.general?.id===id?editorGroup.general:editorGroup.folders.find(folder=>folder.id===id);
              if (item) choose({kind:'rename',item});
            }}>
              {editorGroup.general&&<option value={editorGroup.general.id}>Categoria geral</option>}
              {editorGroup.folders.map(folder=><option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>}
          {editor.kind !== 'delete' && <label className="team-field">{parentId?'Nome da subpasta':'Nome da categoria'}<input value={name} maxLength={60} onChange={event => setName(event.target.value)} /></label>}
          {editor.kind !== 'delete' && <label className="team-field">Nível de execução<select value={level} onChange={event=>setLevel(event.target.value as typeof level)} required><option value="">Selecione o nível</option><option value="1">Nível 1 — restrito</option><option value="2">Nível 2 — habilitação independente</option><option value="3">Nível 3 — geral</option></select></label>}
          {editor.kind === 'delete' && <p className="customer-note">{parentId?'A subpasta':'A categoria'} será arquivada. Serviços e histórico permanecem conservados.</p>}
          <label className="team-field">Motivo<input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
        </fieldset>
        {uncertain && <p className="customer-note">Repita a operação para confirmar o resultado. Os dados e a chave desta tentativa foram preservados.</p>}
        <div className="categories-actions">
          <button className="primary-button" type="submit" disabled={busy}>{editor.kind === 'delete' ? (parentId?'Excluir subpasta':'Excluir categoria') : parentId?'Salvar subpasta':'Salvar categoria'}</button>
          {editor.kind==='rename'&&!editor.item.archived_at&&(parentId
            ? <button type="button" className="team-text-button" disabled={busy||uncertain} onClick={()=>choose({kind:'delete',item:editor.item})}>Excluir subpasta</button>
            : <button type="button" className="team-text-button" disabled={busy||uncertain} onClick={()=>choose({kind:'create',parentId:editor.item.id})}>Criar subpasta</button>)}
          <button data-operation-local-return className="team-text-button" type="button" disabled={busy || uncertain} onClick={() => choose(creationParent?{kind:'rename',item:creationParent}:undefined)}>Cancelar</button>
        </div>
      </form> : data && <>
        {items.length ? <ul className="customer-list" aria-label="Categorias configuradas">{items.map(group => {
          const general = group.general;
          const firstEditable = general ?? group.folders[0];
          const activeGeneral = general && !general.archived_at ? general : undefined;
          return <li key={group.id}>
            <div>
              <strong>{group.name}</strong>
              {general&&<>
                {general.archived_at&&<small>Arquivada — fora das novas solicitações</small>}
                <small>{levelLabel(general)}</small>
                {data.can_manage&&<small>{general.services ?? 0} serviços com histórico · revisão {general.revision}</small>}
              </>}
              {!!group.folders.length&&<details className="category-folder-disclosure">
                <summary aria-label={`Subpastas de ${group.name}`}>{group.folders.length} {group.folders.length===1?'subpasta':'subpastas'}</summary>
                <ul className="category-folders" aria-label={`Subpastas de ${group.name}`}>
                  {group.folders.map(folder=><li key={folder.id}><small>{folder.name} · {levelLabel(folder)}</small></li>)}
                </ul>
              </details>}
            </div>
            {data.can_manage&&<div className="categories-actions">
              {activeGeneral&&<button type="button" className="operation-icon-button" aria-label={`Formulário e anexos de ${group.name}`} title="Formulário e anexos" onClick={()=>openIntake(activeGeneral)}><ClipboardList size={18} aria-hidden="true" /></button>}
              <button type="button" className="operation-icon-button" aria-label={`Editar ${group.name}`} title="Editar categoria" onClick={()=>choose({kind:'rename',item:firstEditable})}><Pencil size={18} aria-hidden="true" /></button>
              {activeGeneral&&<button type="button" className="operation-icon-button" aria-label={`Excluir ${group.name}`} title="Excluir categoria" onClick={()=>choose({kind:'delete',item:activeGeneral})}><Trash2 size={18} aria-hidden="true" /></button>}
            </div>}
          </li>;
        })}</ul> : <p className="team-empty">Nenhuma categoria configurada.</p>}
        <nav className="team-pagination" aria-label="Paginação de categorias">
          <button type="button" className="team-text-button" disabled={shownPage <= 1} onClick={() => setPage(shownPage - 1)}><ArrowLeft size={17} aria-hidden="true" />Anterior</button>
          <span>{shownPage}/{maxPage} · {groups.length} {groups.length===1?'categoria':'categorias'}</span>
          <button type="button" className="team-text-button" disabled={shownPage >= maxPage} onClick={() => setPage(shownPage + 1)}>Próxima<ArrowRight size={17} aria-hidden="true" /></button>
        </nav>
      </>}
    </>}
  </section>;
}
