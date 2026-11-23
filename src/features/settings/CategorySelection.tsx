import type {ServiceCategory} from '../../../shared/categories';

export function CategorySelection({categories,value,rootId,onChange,disabled,label,showLevel=false}:{
  categories:ServiceCategory[];value:string;rootId:string;onChange:(value:string,rootId:string)=>void;
  disabled?:boolean;label:string;showLevel?:boolean;
}){
  const roots=categories.filter(item=>!item.parent_id);
  const folders=categories.filter(item=>item.parent_id===rootId);
  return <>
    <label className="team-field">{label}
      <select aria-label={label} value={rootId} disabled={disabled} onChange={event=>{
        const id=event.target.value;
        onChange(categories.some(item=>item.parent_id===id)?'':id,id);
      }}>
        <option value="">Selecione a categoria</option>
        {roots.map(item=><option key={item.id} value={item.id}>{item.name}{showLevel&&` · ${item.execution_level?`Nível ${item.execution_level}`:'Nível pendente'}`}</option>)}
      </select>
    </label>
    {folders.length>0&&<label className="team-field">Subpasta
      <select aria-label="Subpasta" value={value} disabled={disabled} onChange={event=>onChange(event.target.value,rootId)}>
        <option value="">Selecione a subpasta</option>
        <option value={rootId}>Geral da categoria</option>
        {folders.map(item=><option key={item.id} value={item.id}>{item.name}{showLevel&&` · ${item.execution_level?`Nível ${item.execution_level}`:'Nível pendente'}`}</option>)}
      </select>
    </label>}
  </>;
}
