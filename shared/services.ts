export const servicePermissions = ['services.read','services.manage','services.perform','services.approve','services.discount','services.surcharge','services.courtesy','services.price_override'] as const;
export const executionCapabilities = ['services.perform','services.approve'] as const;
export type ServiceField = { key: string; label: string; type: 'text' | 'number' | 'date'; required: boolean };
export type ServiceInput = {
  code: string; name: string; category: string; unit: string; price_cents: number; effective_from: string | null;
  person_required: boolean; participants_min: number; approval_required: boolean; signature_required: boolean; settlement_required: boolean;
  required_capabilities: string[]; fields: ServiceField[]; checklist: string[]; quantity_min: number; quantity_max: number;
  max_discount_bps: number; max_surcharge_bps: number; allow_courtesy: boolean; allow_price_override: boolean;
};
export const serviceKeys = ['code','name','category','unit','price_cents','effective_from','person_required','participants_min','approval_required','signature_required','settlement_required','required_capabilities','fields','checklist','quantity_min','quantity_max','max_discount_bps','max_surcharge_bps','allow_courtesy','allow_price_override'] as const;
export type ServiceVersion = ServiceInput & { id: string; number: number; created_at: string; created_by: string; reason: string };
export type ServiceSummary = { id: string; code: string; name: string; category: string; unit: string; price_cents: number; version: number; effective_from: string };
export type ServicePage = { items: ServiceSummary[]; total: number; page: number; page_size: number };
export type ServiceDetail = { id: string; code: string; latest_version: number; can_manage: boolean; current: ServiceVersion | null; versions: ServiceVersion[]; history_page: number; history_total: number };
// Percentage adjustments use basis points: 1000 = 10%. Override uses unit cents.
export type ServiceAdjustment = { kind: 'none' | 'discount' | 'surcharge' | 'courtesy' | 'override'; value: number; reason: string };
export type ServiceQuote = { service_id: string; version_id: string; version: number; effective_from: string; quoted_at: string; definition: ServiceInput; quantity: number; unit_price_cents: number; base_cents: number; total_cents: number; adjustment: ServiceAdjustment };
export const emptyService: ServiceInput = { code:'',name:'',category:'',unit:'unidade',price_cents:0,effective_from:null,person_required:false,participants_min:0,approval_required:false,signature_required:false,settlement_required:true,required_capabilities:['services.perform'],fields:[],checklist:[],quantity_min:1,quantity_max:1000,max_discount_bps:0,max_surcharge_bps:0,allow_courtesy:false,allow_price_override:false };

const object=(v:unknown):v is Record<string,unknown>=>!!v && typeof v==='object' && !Array.isArray(v);
const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>object(v) && Object.keys(v).length===keys.length && keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number)=>typeof v==='string' && v.trim().length>=1 && v.length<=max && !/[\u0000-\u001f\u007f]/.test(v);
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v) && Number(v)>=min && Number(v)<=max;
export function validService(value:unknown):value is ServiceInput {
  if(!exact(value,serviceKeys) || typeof value.code!=='string' || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(value.code)
    || !text(value.name,120) || !text(value.category,60) || !text(value.unit,30) || !integer(value.price_cents,0,100_000_000)
    || !(value.effective_from===null || (typeof value.effective_from==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.effective_from) && Number.isFinite(Date.parse(value.effective_from)) && new Date(value.effective_from).toISOString()===value.effective_from))
    || !['person_required','approval_required','signature_required','settlement_required','allow_courtesy','allow_price_override'].every(k=>typeof value[k]==='boolean')
    || !integer(value.participants_min,0,20) || ((!value.person_required) && (Number(value.participants_min)>0 || value.signature_required))
    || !integer(value.quantity_min,1,100000) || !integer(value.quantity_max,Number(value.quantity_min),100000)
    || !integer(value.max_discount_bps,0,10000) || !integer(value.max_surcharge_bps,0,10000)
    || !Array.isArray(value.required_capabilities) || value.required_capabilities.length>2 || new Set(value.required_capabilities).size!==value.required_capabilities.length
    || !value.required_capabilities.every(x=>typeof x==='string' && (executionCapabilities as readonly string[]).includes(x))
    || !Array.isArray(value.checklist) || value.checklist.length>12 || !value.checklist.every(x=>text(x,120)) || new Set(value.checklist).size!==value.checklist.length
    || !Array.isArray(value.fields) || value.fields.length>12) return false;
  return value.fields.every(f=>exact(f,['key','label','type','required']) && typeof f.key==='string' && /^[a-z][a-z0-9_]{0,31}$/.test(f.key)
    && text(f.label,80) && ['text','number','date'].includes(String(f.type)) && typeof f.type==='string' && typeof f.required==='boolean')
    && new Set(value.fields.map(f=>f.key)).size===value.fields.length;
}
export function validAdjustment(v:unknown):v is ServiceAdjustment {
  return exact(v,['kind','value','reason']) && typeof v.kind==='string' && ['none','discount','surcharge','courtesy','override'].includes(v.kind)
    && integer(v.value,0,v.kind==='override'?100_000_000:10000)
    && (v.kind==='none' ? v.value===0 && v.reason==='' : text(v.reason,500)) && (v.kind!=='courtesy' || v.value===0);
}
export const validServiceReason=(v:unknown):v is string=>text(v,500);
export const serviceMoney=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);

// Convert decimal reais/percent to cents/basis points without floating arithmetic.
export function serviceAmountToUnits(value:string):number|null {
  const text=value.trim();
  if(!/^\d{1,7}([,.]\d{1,2})?$/.test(text))return null;
  const [whole,fraction='']=text.replace(',','.').split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
