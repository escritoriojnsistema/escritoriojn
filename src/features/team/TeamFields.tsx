import {useState,useRef,useEffect} from 'react';
import {Shield,ChevronDown} from 'lucide-react';
import {permissionModules,permissionAction,permissionSearch,permissionDependencies,administrativePermissions} from '../../../shared/permissionModules';
import type { TeamPermission, TeamRole } from '../../../shared/team';
import { permissionNames, teamRoleNames } from '../../../shared/team';
export function RoleField({ id, roles, value, onChange, disabled }: { id: string; roles: TeamRole[]; value: TeamRole; onChange: (role: TeamRole) => void; disabled?: boolean }) {
  return <label className="team-field" htmlFor={id}>Função<select id={id} value={value} onChange={event => onChange(event.target.value as TeamRole)} disabled={disabled} required>{roles.map(role => <option key={role} value={role}>{teamRoleNames[role]}</option>)}</select></label>;
}
function ModuleCheck({checked,partial,disabled,onChange,label}:{checked:boolean;partial:boolean;disabled:boolean;onChange:()=>void;label:string}){
 const ref=useRef<HTMLInputElement>(null);useEffect(()=>{if(ref.current)ref.current.indeterminate=partial;},[partial]);
 return <label className="team-check"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange}/>{label}</label>;
}
export function PermissionFields({ allowed, value, onChange, prefix, role }: { allowed: TeamPermission[]; value: TeamPermission[]; onChange: (value: TeamPermission[]) => void; prefix: string;role?:TeamRole }) {
 const [query,setQuery]=useState(''),[expanded,setExpanded]=useState<string[]>([]);
 const needle=permissionSearch(query.trim());const selected=new Set(value);
 const available=(p:TeamPermission)=>role!=='owner'&&allowed.includes(p)&&p!=='foundation.access'&&!(role==='employee'&&administrativePermissions.has(p));
 function toggle(codes:TeamPermission[],enable:boolean){const changed=new Set(value);for(const p of codes)if(available(p)){if(enable)changed.add(p);else changed.delete(p);}changed.add('foundation.access');onChange([...changed]);}
 return <fieldset className="team-permissions permission-modules"><legend>Permissões dos módulos existentes</legend>
 <label className="team-field" htmlFor={`${prefix}-permission-search`}>Pesquisar módulo ou permissão<input id={`${prefix}-permission-search`} type="search" value={query} onChange={e=>{const text=e.target.value;setQuery(text);const q=permissionSearch(text.trim());setExpanded(q?permissionModules.filter(m=>permissionSearch(m.label).includes(q)||m.permissions.some(p=>permissionSearch(permissionNames[p]).includes(q)||p.includes(q))).map(m=>m.id):[]);}} autoComplete="off"/></label>
 {role==='owner'&&<p className="team-hint">O superadministrador mantém acesso integral pelo papel. Esta lista não reduz esse acesso.</p>}
 <div className="team-actions"><button type="button" className="team-text-button" onClick={()=>setExpanded(permissionModules.map(m=>m.id))}>Expandir todos</button><button type="button" className="team-text-button" onClick={()=>setExpanded([])}>Recolher todos</button></div>
 {permissionModules.filter(m=>m.permissions.length&&(permissionSearch(m.label).includes(needle)||m.permissions.some(p=>permissionSearch(permissionNames[p]).includes(needle)||p.includes(needle)))).map(m=>{
 const codes=m.permissions.filter(p=>!needle||permissionSearch(m.label).includes(needle)||permissionSearch(permissionNames[p]).includes(needle)||p.includes(needle));
 const enabled=role==='owner'?m.permissions.length:m.permissions.filter(p=>p==='foundation.access'||selected.has(p)).length;const editable=m.permissions.filter(available);const checked=editable.length>0&&editable.every(p=>selected.has(p));const partial=editable.some(p=>selected.has(p))&&!checked;const open=expanded.includes(m.id);
 return <section className="permission-module" key={m.id}><button type="button" className="permission-module-heading" aria-expanded={open} aria-controls={`${prefix}-module-${m.id}`} onClick={()=>setExpanded(expanded.includes(m.id)?expanded.filter(x=>x!==m.id):[...expanded,m.id])}><Shield size={16} aria-hidden="true"/><span>{m.label}<small>{enabled} de {m.permissions.length} permissões habilitadas</small></span><ChevronDown size={16} aria-hidden="true"/></button>
 {open&&<div id={`${prefix}-module-${m.id}`} className="permission-module-content"><ModuleCheck checked={checked} partial={partial} disabled={!editable.length} onChange={()=>toggle(m.permissions,!checked)} label={`Selecionar todas de ${m.label}`}/>
 {codes.map((p,index)=>{const on=role==='owner'||p==='foundation.access'||selected.has(p);const unavailable=!available(p);const dependencies=permissionDependencies[p]??[];return <div key={p}>{(index===0||permissionAction(codes[index-1])!==permissionAction(p))&&<p className="team-hint"><strong>{permissionAction(p)}</strong></p>}<label className="team-check" htmlFor={`${prefix}-${p}`}><input id={`${prefix}-${p}`} type="checkbox" checked={on} disabled={unavailable} onChange={e=>toggle([p],e.target.checked)}/><span>{permissionNames[p]}<small>{p==='foundation.access'?'Obrigatório':unavailable?'Indisponível neste escopo ou função':on?'Ativada':'Desativada'}{dependencies.length>0&&` · Requer: ${dependencies.map(d=>permissionNames[d]).join(', ')}`}</small></span></label></div>;})}</div>}</section>;
 })}
 {!permissionModules.some(m=>m.permissions.length&&(permissionSearch(m.label).includes(needle)||m.permissions.some(p=>permissionSearch(permissionNames[p]).includes(needle)||p.includes(needle))))&&<p>Nenhuma permissão encontrada.</p>}
 <details className="permission-module"><summary>Equipe, privacidade e acessos pessoais</summary><p className="team-hint">Gestão de equipe exige delegação explícita e não é concedida pelo título de administrador. Criar superadministrador depende do escopo próprio da delegação. Privacidade e retenção continuam exclusivas do superadministrador. Conta, notificações e portal usam identidade e vínculo; estas opções não concedem acesso aos dados de outra pessoa.</p></details>
 </fieldset>;
}
export function dateLabel(value: string) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
