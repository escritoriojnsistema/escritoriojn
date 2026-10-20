import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { emptyService, serviceKeys, serviceAmountToUnits, validService, validServiceReason, type ServiceInput, type ServiceField } from '../../../shared/services';

export function ServiceForm({initial,busy,onSave}:{initial?:ServiceInput;busy:boolean;onSave:(input:ServiceInput,reason:string)=>void}){
 const [input,setInput]=useState<ServiceInput>(()=>({...Object.fromEntries(serviceKeys.map(key=>[key,(initial??emptyService)[key]])) as ServiceInput,effective_from:null}));
 const [price,setPrice]=useState(((initial?.price_cents??0)/100).toFixed(2).replace('.',','));
 const [reason,setReason]=useState(initial?'':'Cadastro inicial');
 const [schedule,setSchedule]=useState('');
 const [checklist,setChecklist]=useState((initial?.checklist??[]).join('\n'));
 const [error,setError]=useState('');
 const set=<K extends keyof ServiceInput>(key:K,value:ServiceInput[K])=>setInput(old=>({...old,[key]:value}));
 function field(index:number,patch:Partial<ServiceField>){set('fields',input.fields.map((f,i)=>i===index?{...f,...patch}:f));}
 function addField(){setInput(old=>{let n=1;while(old.fields.some(f=>f.key===`campo_${n}`))n++;return {...old,fields:[...old.fields,{key:`campo_${n}`,label:'',type:'text',required:true}]};});}
 function submit(event:FormEvent){
  event.preventDefault();if(busy)return;
  const priceCents=serviceAmountToUnits(price);
  if(priceCents===null){setError('Informe o preço em reais, com até duas casas decimais.');return;}
  const date=schedule?new Date(schedule):null;
  if(date&&!Number.isFinite(date.getTime())){setError('Confira a data de início da vigência.');return;}
  const normalized:ServiceInput={...input,name:input.name.trim(),category:input.category.trim(),unit:input.unit.trim(),price_cents:priceCents,effective_from:date?.toISOString()??null,checklist:checklist.split('\n').map(x=>x.trim()).filter(Boolean)};
  if(!validService(normalized)||!validServiceReason(reason)){setError('Confira os campos, limites e motivo. Pessoa é obrigatória quando há participantes ou assinatura.');return;}
  setError('');onSave(normalized,reason.trim());
 }
 const number=(key:'quantity_min'|'quantity_max'|'participants_min',label:string,max:number)=><label className="team-field">{label}<input type="number" min={key==='participants_min'?0:1} max={max} step="1" value={Number.isFinite(input[key])?input[key]:''} onChange={e=>set(key,e.target.value===''?NaN:Number(e.target.value))}/></label>;
 const check=(key:'person_required'|'approval_required'|'signature_required'|'settlement_required'|'allow_courtesy'|'allow_price_override',label:string)=><label className="service-check"><input type="checkbox" checked={input[key]} onChange={e=>set(key,e.target.checked)}/><span>{label}</span></label>;
 return <form className="service-form" onSubmit={submit} noValidate>
  {error&&<p role="alert" className="form-feedback error">{error}</p>}
  <fieldset disabled={busy}>
   <div className="service-form-grid">
    <label className="team-field service-name">Nome do serviço<input autoComplete="off" maxLength={120} value={input.name} onChange={e=>set('name',e.target.value)}/></label>
    <label className="team-field">Código<input autoComplete="off" maxLength={32} readOnly={!!initial} value={input.code} onChange={e=>set('code',e.target.value.toUpperCase())}/></label>
    <label className="team-field">Preço (R$)<input inputMode="decimal" autoComplete="off" maxLength={12} value={price} onChange={e=>setPrice(e.target.value)}/></label>
    <label className="team-field">Categoria<input autoComplete="off" maxLength={60} value={input.category} onChange={e=>set('category',e.target.value)}/></label>
    <label className="team-field">Unidade<input autoComplete="off" maxLength={30} value={input.unit} onChange={e=>set('unit',e.target.value)}/></label>
    {initial&&<label className="team-field service-name">Motivo da versão<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
   </div>
   <details className="service-section"><summary>Políticas de atendimento e cobrança</summary>
    <div className="service-policy-grid">{check('person_required','Exigir pessoa')}{check('approval_required','Exigir aprovação')}{check('signature_required','Exigir assinatura')}{check('settlement_required','Exigir quitação para entrega')}</div>
    <div className="service-form-grid">{number('participants_min','Participantes mínimos',20)}{number('quantity_min','Quantidade mínima',100000)}{number('quantity_max','Quantidade máxima',100000)}
     <label className="team-field">Desconto máximo (%)<input type="number" min="0" max="100" step="0.01" value={input.max_discount_bps/100} onChange={e=>set('max_discount_bps',Math.round(Number(e.target.value)*100))}/></label>
     <label className="team-field">Acréscimo máximo (%)<input type="number" min="0" max="100" step="0.01" value={input.max_surcharge_bps/100} onChange={e=>set('max_surcharge_bps',Math.round(Number(e.target.value)*100))}/></label>
     <label className="team-field">Início da vigência (opcional)<input type="datetime-local" value={schedule} onChange={e=>setSchedule(e.target.value)}/></label>
    </div>
    <p className="customer-note">Sem data: vigência imediata. Agendamento deve ser posterior à última versão. Ajustes exigem capacidade e motivo.</p>
    <div className="service-policy-grid">{check('allow_courtesy','Permitir cortesia')}{check('allow_price_override','Permitir preço manual')}
     {(['services.perform','services.approve'] as const).map((cap,i)=><label className="service-check" key={cap}><input type="checkbox" checked={input.required_capabilities.includes(cap)} onChange={e=>set('required_capabilities',e.target.checked?[...input.required_capabilities,cap]:input.required_capabilities.filter(x=>x!==cap))}/><span>{i?'Exigir capacidade de aprovação na execução':'Exigir capacidade de executar serviços'}</span></label>)}
    </div>
    {!initial&&<label className="team-field">Motivo do cadastro<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
   </details>
   <details className="service-section"><summary>Campos e checklist ({input.fields.length}/{checklist.split('\n').filter(x=>x.trim()).length})</summary>
    <p className="customer-note">Defina até 12 campos e 12 itens para os próximos atendimentos.</p>
    {input.fields.map((f,index)=><div className="service-field-row" key={index}>
     <label className="team-field">Chave {index+1}<input value={f.key} maxLength={32} onChange={e=>field(index,{key:e.target.value})}/></label>
     <label className="team-field">Rótulo {index+1}<input value={f.label} maxLength={80} onChange={e=>field(index,{label:e.target.value})}/></label>
     <label className="team-field">Tipo {index+1}<select value={f.type} onChange={e=>field(index,{type:e.target.value as ServiceField['type']})}><option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option></select></label>
     <label className="service-check"><input type="checkbox" checked={f.required} onChange={e=>field(index,{required:e.target.checked})}/><span>Obrigatório {index+1}</span></label>
     <button type="button" className="operation-icon-button" aria-label={`Remover campo ${index+1}`} onClick={()=>set('fields',input.fields.filter((_,i)=>i!==index))}><Trash2 size={18} aria-hidden="true"/></button>
    </div>)}
    <button type="button" className="team-text-button" disabled={input.fields.length>=12} onClick={addField}><Plus size={18} aria-hidden="true"/>Adicionar campo</button>
    <label className="team-field">Checklist (um item por linha)<textarea rows={3} maxLength={1451} value={checklist} onChange={e=>setChecklist(e.target.value)}/></label>
   </details>
   <button className="primary-button service-submit" type="submit">{initial?'Publicar versão':'Cadastrar serviço'}</button>
  </fieldset>
 </form>;
}
