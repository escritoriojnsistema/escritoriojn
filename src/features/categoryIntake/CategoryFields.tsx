import {useId,useState} from 'react';
import {digitsOnly,formatCpf} from '../../../shared/identifiers';
import {formatCategoryCnpj,formatResponseModel,identifiesCredential,type CategoryField} from '../../../shared/categoryIntake';

const identityMasks={cpf:'000.000.000-00',cnpj:'00.000.000/0000-00'} as const;
type Identity=keyof typeof identityMasks;
function IdentityField({field,raw,disabled,onChange}:{field:CategoryField;raw:string;disabled?:boolean;onChange:(value:string)=>void}){
 const [chosen,setChosen]=useState<Identity>();
 const help=useId();
 const combined=field.type==='cpf_cnpj';
 const mode=combined?(chosen||(raw?(/[A-Za-z]/.test(raw)||digitsOnly(raw).length>11?'cnpj':'cpf'):'')):field.type as Identity;
 const label=field.label+(field.required?' *':'');
 return <div className="category-intake-grid">
  {combined&&<label className="team-field">Documento para {field.label}
   <select aria-label={`Documento para ${field.label}`} required={field.required} disabled={disabled} value={mode} onChange={event=>{
    setChosen((event.target.value||undefined) as Identity|undefined);onChange('');
   }}><option value="">Selecione CPF ou CNPJ</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option></select>
  </label>}
  <label className="team-field">{label}<input aria-label={label} aria-describedby={mode==='cnpj'?help:undefined} required={field.required} disabled={disabled||!mode}
   type="text" inputMode={mode==='cpf'?'numeric':'text'} autoComplete="off" placeholder={mode?identityMasks[mode]:undefined}
   value={mode==='cpf'?formatCpf(raw):mode==='cnpj'?formatCategoryCnpj(raw):''}
   onChange={event=>{
    const input=event.target.value;
    if(mode==='cpf'){
     const digits=digitsOnly(input);if(digits.length<=11&&!/[A-Za-z]/.test(input))onChange(digits);
    }else{
     const code=input.toUpperCase().replace(/[./-]/g,'');
     if(/^[A-Z0-9]{0,12}[0-9]{0,2}$/.test(code))onChange(code);
    }
   }}/>
   {mode==='cnpj'&&<small id={help}>Aceita CNPJ numérico ou alfanumérico.</small>}
  </label>
 </div>;
}
export function CategoryFields({fields,answers,onChange,disabled}:{fields:CategoryField[];answers:Record<string,string>;onChange:(answers:Record<string,string>)=>void;disabled?:boolean}){
 const prefix=useId();
 return <div className="request-grid">{fields.map(field=>{
  const raw=answers[field.key]??'',change=(value:string)=>onChange({...answers,[field.key]:value});
  if(identifiesCredential(field.label))return <p className="customer-note" key={field.key}>Este formulário não recebe senhas nem códigos de autenticação.</p>;
  if(field.type==='cpf'||field.type==='cnpj'||field.type==='cpf_cnpj')return <IdentityField key={field.key} field={field} raw={raw} onChange={change} disabled={disabled}/>;
  const label=field.label+(field.required?' *':'');
  return <label className={`team-field${field.type==='textarea'?' request-wide':''}`} key={field.key}>{label}
   {field.type==='select'?<select aria-label={label} required={field.required} disabled={disabled} value={raw} onChange={event=>change(event.target.value)}><option value="">Selecione</option>{field.options.map(option=><option key={option}>{option}</option>)}</select>
   :field.type==='textarea'?<textarea required={field.required} disabled={disabled} rows={2} maxLength={2000} value={raw} onChange={event=>change(event.target.value)}/>
   :<input aria-label={label} aria-describedby={field.model?prefix+field.key:undefined} required={field.required} disabled={disabled} type={field.type==='date'?'date':field.type==='email'?'email':field.type==='phone'?'tel':'text'}
     inputMode={field.type==='number'?'decimal':field.model&&!/[AH*]/.test(field.model.mask)?'numeric':undefined}
     placeholder={field.model?.mask} maxLength={500} value={raw}
     onChange={event=>change(field.model?formatResponseModel(field.model.mask,event.target.value):event.target.value)}/>}
   {field.model&&<small id={prefix+field.key}>{field.model.name} · {field.model.mask}</small>}
  </label>;
 })}</div>;
}
