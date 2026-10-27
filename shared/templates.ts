export const templateKinds={contract:'Contrato',declaration:'Declaração',application:'Requerimento',official_letter:'Ofício'} as const;
export const signaturePolicies={none:'Não exigida',physical:'Física / cartório',external:'Eletrônica externa'} as const;
export type VariableType='text'|'date'|'money'|'number'|'cpf'|'cnpj'|'tax_id';
export const variableTypeLabels:Record<VariableType,string>={text:'Texto',date:'Data',money:'Valor em reais',number:'Número',cpf:'CPF',cnpj:'CNPJ',tax_id:'CPF ou CNPJ'};
export const templateVariables:Record<string,{label:string;type:VariableType;source:string}>={
 'cliente.nome':{label:'Nome da pessoa',type:'text',source:'Pessoa autorizada'},'cliente.cpf':{label:'CPF da pessoa',type:'text',source:'Pessoa autorizada'},'cliente.endereco':{label:'Endereço da pessoa',type:'text',source:'Pessoa autorizada'},
 'participante.vendedor.nome':{label:'Nome do vendedor',type:'text',source:'Participante vendedor'},'participante.vendedor.cpf':{label:'CPF do vendedor',type:'text',source:'Participante vendedor'},'participante.comprador.nome':{label:'Nome do comprador',type:'text',source:'Participante comprador'},'participante.comprador.cpf':{label:'CPF do comprador',type:'text',source:'Participante comprador'},
 'servico.descricao':{label:'Descrição do serviço',type:'text',source:'Snapshot do serviço'},'servico.quantidade':{label:'Quantidade do serviço',type:'number',source:'Snapshot do serviço'},
 'datas.emissao':{label:'Data de emissão',type:'date',source:'Data permitida'},'datas.inicio':{label:'Data de início',type:'date',source:'Data permitida'},'datas.fim':{label:'Data final',type:'date',source:'Data permitida'},
 'valores.total':{label:'Valor total',type:'money',source:'Valor permitido'},'valores.parcela':{label:'Valor da parcela',type:'money',source:'Valor permitido'},
};
export const isCustomTemplateKey=(key:string):boolean=>/^documento\.[a-z][a-z0-9_]{0,63}$/.test(key);
export const templateValueLimit=(key:string):number=>isCustomTemplateKey(key)?2000:key.endsWith('.nome')?120:500;
export type TemplateVariable={key:string;label:string;type:VariableType;required:boolean};
export type TemplateInput={code:string;name:string;kind:keyof typeof templateKinds;content:string;demonstration:boolean;effective_from:string|null;effective_until:string|null;variables:TemplateVariable[];signature_policy:keyof typeof signaturePolicies;review_required:boolean};
export const templateKeys=['code','name','kind','content','demonstration','effective_from','effective_until','variables','signature_policy','review_required'] as const;
export type TemplateVersion=TemplateInput & {id:string;number:number;created_by:string|null;source_import_id?:string|null;created_by_name:string;created_at:string;reason:string;approved_by:string|null;approved_by_name:string|null;approved_at:string|null;approval_reason:string|null};
export type TemplateSummary=Pick<TemplateInput,'code'|'name'|'kind'|'demonstration'> & {id:string;latest_version:number;current_version:number|null};
export type TemplatePage={items:TemplateSummary[];total:number;page:number;page_size:number};
export type TemplateDetail={id:string;code:string;latest_version:number;can_manage:boolean;can_approve:boolean;versions:TemplateVersion[];history_total:number;history_page:number};
export const emptyTemplate:TemplateInput={code:'',name:'',kind:'declaration',content:'',demonstration:true,effective_from:null,effective_until:null,variables:[],signature_policy:'none',review_required:true};
export const templateText=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export const templateTime=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function templateIssues(value:unknown):string[]{
 if(!exact(value,templateKeys))return ['Informe somente os campos do modelo.'];
 const issues:string[]=[];
 if(typeof value.code!=='string'||!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(value.code))issues.push('Código: use 2 a 32 letras maiúsculas, números, hífen ou sublinhado.');
 if(!templateText(value.name,120))issues.push('Nome: informe até 120 caracteres.');
 if(typeof value.kind!=='string'||!Object.hasOwn(templateKinds,value.kind))issues.push('Selecione o tipo documental.');
 if(typeof value.signature_policy!=='string'||!Object.hasOwn(signaturePolicies,value.signature_policy))issues.push('Selecione a política de assinatura.');
 if(typeof value.demonstration!=='boolean'||typeof value.review_required!=='boolean')issues.push('Confira demonstração e revisão obrigatória.');
 if(!(value.effective_from===null||templateTime(value.effective_from))||!(value.effective_until===null||templateTime(value.effective_until))||(typeof value.effective_from==='string'&&typeof value.effective_until==='string'&&value.effective_until<=value.effective_from))issues.push('Vigência: informe datas válidas; o fim deve ser posterior ao início.');
 const content=value.content;
 if(typeof content!=='string'||!content.trim()||Array.from(content).length>30000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content))issues.push('Texto: informe de 1 a 30.000 caracteres, sem controles inválidos.');
 if(!Array.isArray(value.variables)||value.variables.length>80)return [...issues,'Variáveis: informe até 80 campos tipados.'];
 const variables=value.variables;
 if(variables.some(v=>!exact(v,['key','label','type','required'])||typeof v.key!=='string'||!(Object.hasOwn(templateVariables,v.key)||isCustomTemplateKey(v.key))||!templateText(v.label,80)||typeof v.type!=='string'||!Object.hasOwn(variableTypeLabels,v.type)||Object.hasOwn(templateVariables,v.key)&&v.type!==templateVariables[v.key].type||typeof v.required!=='boolean')||new Set(variables.map(v=>object(v)?v.key:null)).size!==variables.length)issues.push('Variáveis: use campos reconhecidos, sem duplicatas e com o tipo indicado.');
 if(typeof content==='string'){
  const keys=[...content.matchAll(/{{([^{}]*)}}/g)].map(m=>m[1]);
  const remaining=content.replace(/{{([^{}]*)}}/g,'');
  if(remaining.includes('{{')||remaining.includes('}}')||keys.some(k=>!(Object.hasOwn(templateVariables,k)||isCustomTemplateKey(k)))||keys.some(k=>!variables.some(v=>object(v)&&v.key===k))||variables.some(v=>!object(v)||!keys.includes(String(v.key))))issues.push('Variáveis do texto devem corresponder aos campos definidos. Use {{cliente.nome}} e {{datas.emissao}}, por exemplo.');
 }
 return issues;
}
export const validTemplate=(v:unknown):v is TemplateInput=>templateIssues(v).length===0;
