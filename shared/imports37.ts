/** Bounded legacy input. Row validation belongs to the canonical database helpers. */
export type ImportInput37={source:string;as_of:string;expected_debit_cents:number;expected_credit_cents:number;rows:unknown[]};
export type ImportRow37={row:number;source_id:string;name:string;outcome:'create'|'link'|'rejected'|'seen';reason:string;opening_cents:number;customer_id:string|null;file_id:string|null};
export type ImportReport37={batch_id:string|null;status:'preview'|'applied'|'reversed';fingerprint:string;source:string;as_of:string;rows:ImportRow37[];debit_cents:number;credit_cents:number;expected_debit_cents:number;expected_credit_cents:number;ready:boolean};
export type ImportHistory37={items:{id:string;source:string;as_of:string;status:'applied'|'reversed';created_at:string;debit_cents:number;credit_cents:number}[];total:number;page:number;page_size:number};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const keys=(v:Record<string,unknown>,ks:string[])=>Object.keys(v).length===ks.length&&ks.every(k=>Object.hasOwn(v,k));
const cents=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=100_000_000_000_000;
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='0001-01-01'&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function boundedDepth37(value:unknown){const stack:[unknown,number][]=[[value,0]];let visited=0;while(stack.length){const [v,depth]=stack.pop()!;if(depth>16||++visited>131072)return false;if(v&&typeof v==='object')for(const child of Object.values(v))stack.push([child,depth+1]);}return true;}
export function validImportInput37(v:unknown):v is ImportInput37{
 return object(v)&&keys(v,['source','as_of','expected_debit_cents','expected_credit_cents','rows'])&&typeof v.source==='string'&&v.source.trim().length>=3&&v.source.length<=120&&!/[\x00-\x1f\x7f]/.test(v.source)&&date(v.as_of)&&cents(v.expected_debit_cents)&&cents(v.expected_credit_cents)&&Array.isArray(v.rows)&&v.rows.length>=1&&v.rows.length<=100&&boundedDepth37(v)&&new TextEncoder().encode(JSON.stringify(v)).length<=262144;
}
export function parseImport37(text:string):ImportInput37{
 if(new TextEncoder().encode(text).length>262144)throw Error('Use um JSON de até256KiB e100linhas.');
 let input:unknown;try{input=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('O arquivo precisa ser JSON UTF-8 válido.');}
 if(!validImportInput37(input))throw Error('Confira origem, data de corte, totais em centavos e1a100linhas.');
 return {...input,source:input.source.trim()};
}
export function validImportReport37(v:unknown):v is ImportReport37{
 return object(v)&&(v.batch_id===null||typeof v.batch_id==='string'&&/^[a-f0-9-]{36}$/i.test(v.batch_id))&&['preview','applied','reversed'].includes(String(v.status))&&typeof v.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(v.fingerprint)&&typeof v.source==='string'&&v.source.length<=120&&date(v.as_of)&&typeof v.ready==='boolean'&&[v.debit_cents,v.credit_cents,v.expected_debit_cents,v.expected_credit_cents].every(cents)&&Array.isArray(v.rows)&&v.rows.length>=1&&v.rows.length<=100&&v.rows.every(r=>object(r)&&Number.isInteger(r.row)&&Number(r.row)>=1&&Number(r.row)<=100&&typeof r.source_id==='string'&&r.source_id.length<=80&&typeof r.name==='string'&&Array.from(r.name).length<=120&&['create','link','rejected','seen'].includes(String(r.outcome))&&typeof r.reason==='string'&&r.reason.length<=80&&Number.isSafeInteger(r.opening_cents)&&Math.abs(Number(r.opening_cents))<=1_000_000_000_000&&(r.customer_id===null||typeof r.customer_id==='string'&&/^[a-f0-9-]{36}$/i.test(r.customer_id))&&(r.file_id===null||typeof r.file_id==='string'&&/^[a-f0-9-]{36}$/i.test(r.file_id)));
}
const row=(source_id:string,name:string,identifier:string)=>({source_id,customer_id:null,customer_version:null,kind:'person',name,identifier,contacts:[],opening_cents:0,evidence:'Cadastro de demonstração, sem uso operacional.',file_id:null});
/** Fictitious and downloaded on demand; never seeded into production. */
export const importExample37:ImportInput37={source:'DEMONSTRAÇÃO — substituir pela fonte real',as_of:'2026-11-15',expected_debit_cents:0,expected_credit_cents:0,rows:[row('DEMO37-001','Cliente fictício A','52998224725'),row('DEMO37-002','Cliente fictício B','11144477735'),row('DEMO37-003','Cliente fictício C','12345678909'),row('DEMO37-004','Cliente fictício A duplicado','52998224725'),row('DEMO37-005','','00000000000')]};
export const importReason37:Record<string,string>={NEW:'Novo cadastro, ainda não verificado.',LINK:'Pessoa verificada vinculada explicitamente.',INVALID_ROW:'Confira formato, identificação, contatos, evidência e centavos desta linha.',DUPLICATE_LINE:'Identificação, contato, nome ou referência repetidos no lote.',DUPLICATE_CUSTOMER:'Possível cadastro existente. Confira em Clientes; não houve associação automática.',SOURCE_SEEN:'Referência de origem já importada. Nenhum novo efeito.',SOURCE_CHANGED:'Referência de origem já usada com conteúdo diferente.',LINK_UNAVAILABLE:'Pessoa não verificada, versão alterada ou vínculo indisponível.',FILE_UNAVAILABLE:'Arquivo indisponível ou fora do atendimento dessa pessoa.',FINANCE_DENIED:'Faltam permissões para registrar valores iniciais.',FILE_DENIED:'Faltam permissões para vincular o arquivo.'};

export const importPermissions37=['settings.access','customers.read','customers.read_all','customers.create','charges.read','charges.create','charges.adjust','requests.read','files.read'] as const;
