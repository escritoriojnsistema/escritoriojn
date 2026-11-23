import {useRef, useState, type FormEvent} from 'react';
import {Save, X} from 'lucide-react';
import type {CategoryAccessEntry, CategoryAccessGrants, CategoryAccessMode, TeamMember, TeamPermission, TeamScope} from '../../../shared/team';
import {permissionSearch} from '../../../shared/permissionModules';
import {teamApi} from './api';
import {invitationRoles} from './validation';
import {PermissionFields, RoleField} from './TeamFields';
import {useUnsavedAccess} from './useUnsavedAccess';

const rank = {employee:0, admin:1, owner:2};

function CategoryAccessFields({categories, grants, owner, onChange}: {
  categories: CategoryAccessEntry[]; grants:CategoryAccessGrants; owner:boolean;
  onChange:(id:string, mode:CategoryAccessMode|'default')=>void;
}) {
  const [query,setQuery]=useState('');
  const needle=permissionSearch(query.trim());
  const options=categories.map(category=>({
    ...category,
    label:[category.parent_name,category.name].filter(Boolean).join(' › '),
  })).filter(category=>permissionSearch(category.label).includes(needle))
    .sort((a,b)=>a.label.localeCompare(b.label,'pt-BR'));
  return <fieldset className="team-permissions">
    <legend>Acesso por categoria</legend>
    {owner?<p className="team-hint">Todas as categorias estão habilitadas para edição pelo papel de superadministrador.</p>
      :<p className="team-hint">Leitura permite consultar os atendimentos da equipe e fazer o pré-atendimento. Edição permite executar atendimentos conforme a responsabilidade e as regras da categoria. Cada subpasta tem seu próprio acesso.</p>}
    <label className="team-field">Buscar categoria ou subpasta
      <input type="search" value={query} onChange={event=>setQuery(event.target.value)} autoComplete="off"/>
    </label>
    {options.map(category=><label className="team-field" key={category.id}>
      {category.label}{category.execution_level? ` · Nível ${category.execution_level}`:' · Nível pendente'}
      <select aria-label={`Acesso a ${category.label}`} disabled={owner}
        value={owner?'edit':grants[category.id]??'default'}
        onChange={event=>onChange(category.id,event.target.value as CategoryAccessMode|'default')}>
        <option value="default">Pelo nível de execução</option>
        <option value="denied">Sem acesso</option>
        <option value="read">Leitura e pré-atendimento</option>
        <option value="edit">Edição e atendimento</option>
      </select>
    </label>)}
    {!options.length&&<p className="team-hint">{needle?'Nenhuma categoria encontrada.':'Nenhuma categoria ativa cadastrada.'}</p>}
  </fieldset>;
}

export function MemberForm({ member, office, scope, categories, onClose, onSaved, onError }: {
  member:TeamMember; office:string; scope:TeamScope; categories?:CategoryAccessEntry[]|null;
  onClose:()=>void; onSaved:()=>void; onError:(cause:unknown)=>void;
}) {
  const [role,setRole]=useState(member.role_code);
  const [active,setActive]=useState(member.active);
  const [permissions,setPermissions]=useState<TeamPermission[]>(()=>[
    ...new Set<TeamPermission>(['foundation.access',...(member.direct_permissions??[])
      .filter((item):item is TeamPermission=>scope.allowed_permissions.includes(item as TeamPermission))]),
  ]);
  const [grants,setGrants]=useState<CategoryAccessGrants>(member.category_access??{});
  const [busy,setBusy]=useState(false);
  const inherited=(role===member.role_code&&active&&member.access_active
    ?member.permissions.filter(p=>!member.direct_permissions?.includes(p)&&scope.allowed_permissions.includes(p as TeamPermission)):[]) as TeamPermission[];
  const roles=[...new Set([member.role_code,...invitationRoles(scope)])].filter(role=>role!=='owner'||member.role_code==='owner');
  const current=JSON.stringify([role,active,[...permissions].sort(),Object.entries(grants).sort()]);
  const initial=useRef(current);
  const dirty=current!==initial.current;
  const close=useUnsavedAccess(dirty);
  const canSetCategories=scope.role_code==='owner'&&Array.isArray(categories)&&!!member.category_access;
  function setCategory(id:string, mode:CategoryAccessMode|'default'){
    setGrants(previous=>{
      const next={...previous};
      if(mode==='default')delete next[id];
      else next[id]=mode;
      return next;
    });
  }
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!Array.isArray(member.direct_permissions))return;
    if((!active||rank[role]<rank[member.role_code])&&!window.confirm('Confirmar a redução ou desativação deste acesso? O histórico será preservado e o acesso mudará na próxima operação.'))return;
    setBusy(true);
    try{
      await teamApi.member(member.id,{office_id:office,role_code:role,active,permissions,
        ...(canSetCategories&&member.category_access?{category_access:role==='owner'?{}:grants,
          expected_category_access:member.category_access}:{}),
      });
      onSaved();
    }catch(cause){onError(cause);}
    finally{setBusy(false);}
  }
  return <section className="team-editor" aria-labelledby="member-heading">
    <div className="team-section-heading"><h2 id="member-heading">Editar acesso</h2>
      <button data-operation-local-return type="button" className="team-text-button" disabled={busy} onClick={()=>close(onClose)}><X size={17} aria-hidden="true"/>Fechar</button>
    </div>
    <p className="team-hint">{member.name||member.email}</p>
    {dirty&&<p role="status" className="team-hint">Alterações não salvas</p>}
    <form onSubmit={submit}><fieldset disabled={busy}>
      <RoleField id="member-role" roles={roles} value={role} onChange={setRole} disabled={member.protected_owner}/>
      {canSetCategories&&categories&&<CategoryAccessFields categories={categories} grants={grants} owner={role==='owner'} onChange={setCategory}/>}
      <PermissionFields inherited={inherited} role={role} prefix="member" allowed={scope.allowed_permissions} value={permissions} onChange={setPermissions}/>
      <label className="team-check"><input type="checkbox" checked={active} disabled={member.protected_owner} onChange={event=>setActive(event.target.checked)}/>Conta ativa neste escritório</label>
      {member.protected_owner&&<p className="team-hint">Último proprietário ativo. Função e ativação protegidas.</p>}
      {!Array.isArray(member.direct_permissions)&&<p role="alert" className="team-hint">Atualize a equipe antes de salvar. A resposta ainda não distingue permissões permanentes e delegadas.</p>}
      <button className="primary-button" disabled={busy||!Array.isArray(member.direct_permissions)}><Save size={18} aria-hidden="true"/>Salvar acesso</button>
    </fieldset></form>
  </section>;
}
