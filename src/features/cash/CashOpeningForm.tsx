import {useRef,useState,type FormEvent} from 'react';
import {DoorOpen,X} from 'lucide-react';
import {cashAmountToCents,type CashConfiguration,type CashOpen,type CashSession} from '../../../shared/cash';
import {filterCompatibleUnitMethods} from '../../../shared/manualPaymentFlow';
export function CashOpeningForm({configuration,sessions,busy,onOpen,onClear,canManage=false,onConfigure}:{configuration:CashConfiguration;sessions:CashSession[];busy:boolean;onOpen:(input:CashOpen)=>Promise<boolean>;onClear:()=>void;canManage?:boolean;onConfigure?:(unitId?:string)=>void}){
 const units=configuration.units.filter(u=>u.active&&!sessions.some(s=>s.is_self&&s.status==='open'&&s.unit_id===u.id));
 const cashAccounts=configuration.accounts.filter(a=>a.active&&a.type==='cash');
 const digitalUnits=new Set(units.filter(u=>filterCompatibleUnitMethods(configuration,u.id,null).length>0).map(u=>u.id));
 const readyUnitIds=new Set([...cashAccounts.map(a=>a.unit_id),...digitalUnits]);
 const [unit,setUnit]=useState(''),[account,setAccount]=useState(''),[amount,setAmount]=useState('0,00'),[error,setError]=useState('');
 const attempt=useRef<{payload:string;key:string}|undefined>(undefined);
 const selected=unit?units.find(u=>u.id===unit):units.find(u=>readyUnitIds.has(u.id))??units[0];
 const accounts=cashAccounts.filter(a=>a.unit_id===selected?.id);
 const canOpenWithoutCash=!!selected&&digitalUnits.has(selected.id);
 const withoutCash=canOpenWithoutCash&&(account==='digital'||accounts.length===0);
 const selectedAccount=withoutCash?undefined:account?accounts.find(a=>a.id===account):accounts[0];
 const canSubmit=!!selected&&(withoutCash||!!selectedAccount);
 async function submit(e:FormEvent){e.preventDefault();if(busy||!selected||!canSubmit)return;const cents=withoutCash?0:cashAmountToCents(amount);if(cents===null){setError('Informe o fundo em reais, com no máximo duas casas decimais.');return;}
  const input={unit_id:selected.id,cash_account_id:selectedAccount?.id??null,opening_cents:cents},payload=JSON.stringify(input);if(attempt.current?.payload!==payload)attempt.current={payload,key:crypto.randomUUID()};setError('');
  if(await onOpen({...input,idempotency_key:attempt.current.key})){setAmount('0,00');setAccount('');setUnit('');attempt.current=undefined;}
 }
 if(!units.length)return <div className="cash-setup-notice"><p className="customer-note">{configuration.units.some(u=>u.active)?'Seu caixa nesta unidade já está aberto.':canManage?'O caixa ainda precisa de uma unidade ativa. Cadastre sua unidade e as contas de recebimento em Configuração.':'Nenhuma unidade ativa disponível. Solicite a configuração ao gestor autorizado.'}</p>{canManage&&!configuration.units.some(u=>u.active)&&<button type="button" className="secondary-button" onClick={()=>onConfigure?.(selected?.id)} disabled={busy}>Configurar caixa</button>}</div>;
 return <form className="cash-opening" onSubmit={submit} noValidate aria-label="Abrir caixa individual">
  <fieldset disabled={busy}><div className="cash-opening-grid">
   <label className="team-field">Unidade<select value={selected?.id??''} onChange={e=>{setUnit(e.target.value);setAccount('');}}>{!selected&&<option value="">Selecione a unidade</option>}{units.map(u=><option value={u.id} key={u.id}>{u.name}{readyUnitIds.has(u.id)?'':' (sem meios para abertura)'}</option>)}</select></label>
   <label className="team-field">Conta em espécie<select value={withoutCash?'digital':selectedAccount?.id??''} onChange={e=>setAccount(e.target.value)}>{!selectedAccount&&!withoutCash&&<option value="">{accounts.length?'Selecione a conta em espécie':'Nenhuma conta em espécie disponível'}</option>}{accounts.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}{canOpenWithoutCash&&<option value="digital">Sem espécie · Pix, cartão, boleto ou transferência</option>}</select></label>
   {!withoutCash&&<label className="team-field">Fundo inicial (R$)<input autoComplete="off" inputMode="decimal" maxLength={14} value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
  </div></fieldset>
  <p className="customer-note">{withoutCash?'O caixa abre com fundo inicial de R$ 0,00. Você pode lançar recebimentos pelas formas cadastradas nesta unidade.':'O fundo é dinheiro físico para iniciar seu caixa. Não é receita nem recebimento de serviços.'}</p>
  {selected&&!accounts.length&&!canOpenWithoutCash&&<div className="jn-inline-alert"><p className="customer-note">{canManage?'Cadastre uma conta em espécie ou vincule uma forma de pagamento a uma conta de destino desta unidade.':'O gestor autorizado deve configurar uma conta em espécie ou uma forma de pagamento para esta unidade.'}</p>{canManage&&onConfigure&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>onConfigure?.(selected?.id)}>Configurar financeiro</button>}</div>}
  {error&&<p role="alert" className="form-feedback error">{error}</p>}
  <div className="account-actions"><button className="primary-button" disabled={busy||!canSubmit}><DoorOpen size={18} aria-hidden="true"/>Abrir meu caixa</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setAmount('0,00');setUnit('');setAccount('');setError('');attempt.current=undefined;onClear();}}><X size={18} aria-hidden="true"/>Cancelar</button></div>
 </form>;
}
