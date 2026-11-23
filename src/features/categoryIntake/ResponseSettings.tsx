import {useState} from 'react';
import {allowResponseModel,categoryFieldTypes,responseMaskFitsType,validResponseMask,validResponseName,type CategoryField,type CategoryResponseModel} from '../../../shared/categoryIntake';

export const responseTypeLabels:Record<CategoryField['type'],string>={
 text:'Texto curto',textarea:'Texto longo',number:'Número',date:'Data',email:'E-mail',phone:'Telefone',
 cpf:'CPF',cnpj:'CNPJ',cpf_cnpj:'CPF ou CNPJ',select:'Lista de opções',
};
const presets:CategoryResponseModel[]=[
 {name:'Celular brasileiro',mask:'(00) 0 0000-0000'},
 {name:'Telefone fixo brasileiro',mask:'(00) 0000-0000'},
 {name:'NIRF',mask:'0.000.000-0'},
 {name:'CIB',mask:'*******-0'},
];

export function ResponseSettings({field,fields,onChange}:{field:CategoryField;fields:CategoryField[];onChange:(field:CategoryField)=>void}){
 const [editor,setEditor]=useState<'type'|'model'>();
 const [name,setName]=useState('');
 const [type,setType]=useState(field.type);
 const [mask,setMask]=useState('');
 const [error,setError]=useState('');
 const standardModels=field.type==='phone'?presets.slice(0,2):presets;
 const models=[...new Map([...standardModels,...fields.flatMap(item=>item.model?[item.model]:[])]
  .map(model=>[JSON.stringify(model),model])).values()].filter(model=>responseMaskFitsType(field.type,model.mask));
 const customTypes=[...new Map(fields.flatMap(item=>item.response_name?[[JSON.stringify([item.type,item.response_name]),item] as const]:[])).values()];
 const typeValue=field.response_name?JSON.stringify([field.type,field.response_name]):field.type;

 function changeType(type:CategoryField['type'],responseName?:string){
  const {response_name:_name,model,...base}=field;
  onChange({...base,type,options:type==='select'?field.options:[],
   ...(responseName?{response_name:responseName}:{}),...(model&&responseMaskFitsType(type,model.mask)?{model}:{})});
 }
 function changeModel(model?:CategoryResponseModel){
  const {model:_model,...base}=field;onChange(model?{...base,model}:base);
 }
 function open(kind:'type'|'model',edit:boolean){
  setError('');setEditor(kind);setType(field.type);
  setName(edit?(kind==='type'?field.response_name??responseTypeLabels[field.type]:field.model?.name??''):'');
  setMask(edit?(field.model?.mask??''):'');
 }
 function confirm(){
  if(!validResponseName(name.trim())){
   setError('Informe um nome válido. Formulários de atendimento não recebem senhas, tokens nem códigos de autenticação.');return;
  }
  if(editor==='model'){
   if(!validResponseMask(mask.trim())){setError('Use 0 para dígitos, A para letras, * para ambos e apenas espaços, pontos, barras, parênteses ou hífens como separadores. Termine com 0, A ou *.');return;}
   if(!responseMaskFitsType(field.type,mask.trim())){setError('O modelo de telefone deve conter entre 10 e 15 dígitos previstos, usando apenas 0 e separadores.');return;}
   changeModel({name:name.trim(),mask:mask.trim()});
  }else changeType(type,name.trim());
  setEditor(undefined);setError('');
 }

 return <>
  <label className="team-field">Tipo de resposta<select aria-label="Tipo de resposta" value={typeValue} onChange={event=>{
   const selected=customTypes.find(item=>JSON.stringify([item.type,item.response_name])===event.target.value);
   changeType(selected?.type??event.target.value as CategoryField['type'],selected?.response_name);
   setEditor(undefined);
  }}>
   {categoryFieldTypes.map(type=><option key={type} value={type}>{responseTypeLabels[type]}</option>)}
   {customTypes.length>0&&<optgroup label="Tipos deste formulário">
    {customTypes.map(item=><option key={JSON.stringify([item.type,item.response_name])} value={JSON.stringify([item.type,item.response_name])}>{item.response_name}</option>)}
   </optgroup>}
  </select></label>
  <div className="category-intake-toolbar">
   <button type="button" className="team-text-button" onClick={()=>open('type',false)}>Criar tipo de resposta</button>
   <button type="button" className="team-text-button" onClick={()=>open('type',true)}>Editar tipo de resposta</button>
  </div>
  {allowResponseModel(field.type)?<>
   <label className="team-field">Modelo de resposta<select aria-label="Modelo de resposta" value={field.model?JSON.stringify(field.model):''} onChange={event=>{
    changeModel(models.find(model=>JSON.stringify(model)===event.target.value));setEditor(undefined);
   }}>
    <option value="">Sem modelo</option>
    {models.map(model=><option key={JSON.stringify(model)} value={JSON.stringify(model)}>{model.name} · {model.mask}</option>)}
   </select></label>
   <div className="category-intake-toolbar">
    <button type="button" className="team-text-button" onClick={()=>open('model',false)}>Criar modelo</button>
    <button type="button" className="team-text-button" disabled={!field.model} onClick={()=>open('model',true)}>Editar modelo</button>
   </div>
  </>:['cpf','cnpj','cpf_cnpj'].includes(field.type)&&
   <p className="customer-note">Modelo automático {field.type==='cpf'?'000.000.000-00':field.type==='cnpj'?'00.000.000/0000-00':'CPF 000.000.000-00 ou CNPJ 00.000.000/0000-00'}</p>}
  {editor&&<fieldset className="category-intake-response-editor" onKeyDown={event=>{
   if(event.key==='Enter'&&event.target instanceof HTMLInputElement){event.preventDefault();confirm();}
  }}>
   <legend>{editor==='type'?'Configurar tipo de resposta':'Configurar modelo'}</legend>
   <label className="team-field">{editor==='type'?'Nome do tipo':'Nome do modelo'}
    <input maxLength={80} value={name} onChange={event=>setName(event.target.value)}/>
   </label>
   {editor==='type'?<label className="team-field">Formato de base
    <select aria-label="Formato de base" value={type} onChange={event=>setType(event.target.value as CategoryField['type'])}>
     {categoryFieldTypes.map(type=><option key={type} value={type}>{responseTypeLabels[type]}</option>)}
    </select>
   </label>:<><label className="team-field">Máscara<input maxLength={48} placeholder="00000/AAAA" value={mask} onChange={event=>setMask(event.target.value)}/></label>
    <p className="customer-note">Use 0 para dígitos, A para letras e * para ambos. Exemplo de número de escritura: 00000/AAAA.</p></>}
   {error&&<p role="alert" className="form-feedback error">{error}</p>}
   <div className="category-intake-toolbar">
    <button type="button" className="team-text-button" onClick={confirm}>Aplicar ao campo</button>
    <button type="button" className="team-text-button" onClick={()=>setEditor(undefined)}>Cancelar</button>
   </div>
  </fieldset>}
 </>;
}
