import {validCpf,digitsOnly,formatCpf} from './identifiers.js';
import type {TemplateInput} from './templates.js';
import type {DraftInput,DocumentSource,DocumentParticipant,DocumentResolution} from './documents.js';
const units=['','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','catorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const tens=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const hundreds=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function small(n:number):string{if(n<20)return units[n];if(n<100)return tens[Math.floor(n/10)]+(n%10?' e '+units[n%10]:'');if(n===100)return 'cem';return hundreds[Math.floor(n/100)]+(n%100?' e '+small(n%100):'');}
function integerWords(n:number):string{
 if(!n)return 'zero';const groups=[Math.floor(n/1000000),Math.floor(n/1000)%1000,n%1000];let result='';
 groups.forEach((g,i)=>{if(!g)return;const part=i===0?small(g)+(g===1?' milhão':' milhões'):i===1?(g===1?'mil':small(g)+' mil'):small(g);result+=(result?(g<100||g%100===0?' e ':' '):'')+part;});return result;
}
export function documentMoneyWords(cents:number):string{
 if(!Number.isSafeInteger(cents)||cents<0||cents>99999999999)throw new RangeError('Valor fora do limite documental.');
 const whole=Math.floor(cents/100),fraction=cents%100;let result=whole?integerWords(whole)+(whole%1000000===0?' de reais':whole===1?' real':' reais'):'';
 if(fraction)result+=(result?' e ':'')+small(fraction)+(fraction===1?' centavo':' centavos');return result||'zero reais';
}
export function documentDate(v:string):boolean{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const [y,m,d]=v.split('-').map(Number);if(y<1||m<1||m>12)return false;const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];return d>=1&&d<=days[m-1];
}
function money(v:string):number|null{if(!/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(v))return null;const [a,b='']=v.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
function brMoney(c:number):string{return 'R$ '+String(Math.floor(c/100)).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+String(c%100).padStart(2,'0');}
export function resolveDocument(definition:TemplateInput,input:DraftInput,source:DocumentSource,participants:DocumentParticipant[]):DocumentResolution{
 const result:DocumentResolution={values:{},formatted:{},words:{},issues:[],rendered_content:''};
 const issueKeys=new Set<string>(),variables=new Map(definition.variables.map(v=>[v.key,v]));
 const add=(key:string,code:DocumentResolution['issues'][number]['code'],message:string)=>{const id=key+'\u0000'+code;if(!issueKeys.has(id)){issueKeys.add(id);result.issues.push({key,code,message});}};
 const automatic:Record<string,string|null>={'cliente.nome':source.customer?.name??null,'cliente.cpf':source.customer?.kind==='person'?source.customer.identifier:null,'servico.descricao':source.service.description,'servico.quantidade':String(source.service.quantity),'datas.emissao':source.emitted_on,'valores.total':(Math.floor(source.service.total_cents/100)+'.'+String(source.service.total_cents%100).padStart(2,'0'))};
 for(const [role,key] of [['buyer','comprador'],['seller','vendedor']] as const){const p=participants.find(p=>p.role===role);automatic[`participante.${key}.nome`]=p?.name??null;automatic[`participante.${key}.cpf`]=p?.kind==='person'?p.identifier:null;}
 for(const variable of definition.variables){
  const {key,label,type,required}=variable;const raw=Object.hasOwn(input.overrides,key)?input.overrides[key]:automatic[key];let v=raw?.trim()||null;
  if(required&&key.startsWith('participante.')){const role=key.includes('.comprador.')?'buyer':'seller';if(!participants.some(p=>p.role===role))add(key,'participant_required',`${label}: selecione o participante correspondente.`);}
  if(!v){if(required)add(key,'required',`${label}: informe o campo obrigatório.`);result.values[key]=null;continue;}
  let formatted=v,valid=true;
  if(type==='date'){valid=documentDate(v);if(valid)formatted=v.slice(8,10)+'/'+v.slice(5,7)+'/'+v.slice(0,4);}
  else if(type==='money'){const cents=money(v);valid=cents!==null;if(cents!==null){v=Math.floor(cents/100)+'.'+String(cents%100).padStart(2,'0');formatted=brMoney(cents);result.words[key]=documentMoneyWords(cents);}}
  else if(type==='number'){valid=/^(0|[1-9]\d{0,5})(\.\d{1,3})?$/.test(v)&&Number(v)<=100000;if(valid){v=v.includes('.')?v.replace(/0+$/,'').replace(/\.$/,''):v;formatted=v.replace('.',',');}}
  else if(key.endsWith('.cpf')){valid=validCpf(v);if(valid){v=digitsOnly(v);formatted=formatCpf(v);}}
  else valid=Array.from(v).length<=(key.endsWith('.nome')?120:500);
  if(!valid){add(key,'invalid_value',`${label}: confira o ${type==='date'?'dia, mês e ano':type==='money'?'valor em reais (ex.: 10.50)':key.endsWith('.cpf')?'CPF':'valor informado'}.`);result.values[key]=null;continue;}
  result.values[key]=v;result.formatted[key]=formatted;
 }
 if(result.values['datas.inicio']&&result.values['datas.fim']&&result.values['datas.inicio']>result.values['datas.fim'])add('datas.fim','date_order','A data final deve ser igual ou posterior à data de início.');
 const seen=new Set<string>();result.rendered_content=input.content.replace(/{{([^{}]*)}}/g,(literal,key:string)=>{const variable=variables.get(key);if(!variable){add(key,'unknown_variable',`Variável não declarada: ${key}.`);return literal;}seen.add(key);const value=result.formatted[key];return value?value+(input.money_in_words&&result.words[key]?' ('+result.words[key]+')':''):`[Pendente: ${variable.label}]`;});
 for(const v of definition.variables)if(v.required&&!seen.has(v.key))add(v.key,'missing_placeholder',`${v.label}: restaure {{${v.key}}} no texto.`);
 if(input.content.replace(/{{([^{}]*)}}/g,'').includes('{{')||input.content.replace(/{{([^{}]*)}}/g,'').includes('}}'))add('content','invalid_placeholder','Há um campo automático incompleto. Use {{chave.do.campo}}.');
 if(!input.content.trim())add('content','content_empty','Informe o texto do documento.');
 if(Array.from(result.rendered_content).length>50000){add('content','invalid_value','A prévia excede 50.000 caracteres. Reduza repetições de campos automáticos.');result.rendered_content=input.content;}return result;
}
