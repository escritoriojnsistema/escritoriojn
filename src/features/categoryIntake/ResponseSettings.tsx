import {useState} from 'react';
import {allowResponseModel,categoryFieldTypes,responseMaskFitsType,validResponseMask,validResponseName,type CategoryField,type CategoryResponseModel,type CategoryResponseOptionCommand,type CategoryResponseOptions,type CategoryResponseType} from '../../../shared/categoryIntake';

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

const modelKey=(option:CategoryResponseModel)=>JSON.stringify([option.name,option.mask]);
const typeKey=(option:CategoryResponseType)=>JSON.stringify([option.type,option.name]);

export function ResponseSettings({field,options,onChange,onSave}:{field:CategoryField;options?:CategoryResponseOptions;
 onChange:(field:CategoryField)=>void;onSave:(command:CategoryResponseOptionCommand,field:CategoryField)=>void;
}){
 const [editor,setEditor]=useState<'type'|'model'>();
 const [name,setName]=useState('');
 const [type,setType]=useState(field.type);
 const [mask,setMask]=useState('');
 const [error,setError]=useState('');
 const [previousModel,setPreviousModel]=useState<CategoryResponseModel|null>(null);
 const [previousType,setPreviousType]=useState<CategoryResponseType|null>(null);
 const standardModels=field.type==='phone'?presets.slice(0,2):presets;
 const currentType=field.response_name?{type:field.type,name:field.response_name}:undefined;
 const models=[...new Map([...standardModels,...(options?.models??[]),...(field.model?[field.model]:[])]
  .map(model=>[modelKey(model),model])).values()].filter(model=>responseMaskFitsType(field.type,model.mask));
 const customTypes=[...new Map([...(options?.types??[]),...(currentType?[currentType]:[])].map(item=>[typeKey(item),item])).values()];
 const typeValue=currentType?typeKey(currentType):field.type;

 function withType(type:CategoryField['type'],responseName?:string):CategoryField{
  const {response_name:_name,model,...base}=field;
  return {...base,type,options:type==='select'?field.options:[],
   ...(responseName?{response_name:responseName}:{}),...(model&&responseMaskFitsType(type,model.mask)?{model}:{})};
 }
 function withModel(model?:CategoryResponseModel):CategoryField{
  const {model:_model,...base}=field;return model?{...base,model}:base;
 }
 function open(kind:'type'|'model',edit:boolean){
  const ownType=edit?options?.types.find(item=>item.name===field.response_name):undefined;
  const ownModel=edit?options?.models.find(item=>item.name===field.model?.name):undefined;
  setPreviousType(ownType??null);setPreviousModel(ownModel??null);
  setError('');setEditor(kind);setType(ownType?.type??field.type);
  setName(edit?(kind==='type'?ownType?.name??field.response_name??responseTypeLabels[field.type]:ownModel?.name??field.model?.name??''):'');
  setMask(edit?(ownModel?.mask??field.model?.mask??''):'');
 }
 function confirm(){
  if(!validResponseName(name.trim())){
   setError('Informe um nome válido. Formulários de atendimento não recebem senhas, tokens nem códigos de autenticação.');return;
  }
  if(editor==='model'){
   if(!validResponseMask(mask.trim())){setError('Use 0 para dígitos, A para letras, * para ambos e apenas espaços, pontos, barras, parênteses ou hífens como separadores. Termine com 0, A ou *.');return;}
   if(!responseMaskFitsType(field.type,mask.trim())){setError('O modelo de telefone deve conter entre 10 e 15 dígitos previstos, usando apenas 0 e separadores.');return;}
   const option={name:name.trim(),mask:mask.trim()};
   onSave({kind:'model',option,previous:previousModel},withModel(option));
  }else{
   const option={name:name.trim(),type};
   onSave({kind:'type',option,previous:previousType},withType(type,option.name));
  }
  setEditor(undefined);setError('');
 }

 return <>
  <label className="team-field">Tipo de resposta<select aria-label="Tipo de resposta" value={typeValue} onChange={event=>{
   const selected=customTypes.find(item=>typeKey(item)===event.target.value);
   onChange(withType(selected?.type??event.target.value as CategoryField['type'],selected?.name));
   setEditor(undefined);
  }}>
   {categoryFieldTypes.map(type=><option key={type} value={type}>{responseTypeLabels[type]}</option>)}
   {customTypes.length>0&&<optgroup label="Tipos da categoria">
    {customTypes.map(item=><option key={typeKey(item)} value={typeKey(item)}>{item.name}</option>)}
   </optgroup>}
  </select></label>
  <div className="category-intake-toolbar">
   <button type="button" className="team-text-button" onClick={()=>open('type',false)}>Criar tipo de resposta</button>
   <button type="button" className="team-text-button" onClick={()=>open('type',true)}>Editar tipo de resposta</button>
  </div>
  {allowResponseModel(field.type)?<>
   <label className="team-field">Modelo de resposta<select aria-label="Modelo de resposta" value={field.model?modelKey(field.model):''} onChange={event=>{
    onChange(withModel(models.find(model=>modelKey(model)===event.target.value)));setEditor(undefined);
   }}>
    <option value="">Sem modelo</option>
    {models.map(model=><option key={modelKey(model)} value={modelKey(model)}>{model.name} · {model.mask}</option>)}
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
    <button type="button" className="team-text-button" onClick={confirm}>Salvar na categoria</button>
    <button type="button" className="team-text-button" onClick={()=>setEditor(undefined)}>Cancelar</button>
   </div>
  </fieldset>}
 </>;
}
