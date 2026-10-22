import {useRef,useState,type FormEvent} from 'react';
import {DoorOpen,X} from 'lucide-react';
import {cashAmountToCents,type CashConfiguration,type CashOpen,type CashSession} from '../../../shared/cash';
export function CashOpeningForm({configuration,sessions,busy,onOpen,onClear}:{configuration:CashConfiguration;sessions:CashSession[];busy:boolean;onOpen:(input:CashOpen)=>Promise<boolean>;onClear:()=>void}){
 const units=configuration.units.filter(u=>u.active&&!sessions.some(s=>s.is_self&&s.status==='open'&&s.unit_id===u.id));
 const [unit,setUnit]=useState(()=>units[0]?.id??''),[account,setAccount]=useState(''),[amount,setAmount]=useState('0,00'),[error,setError]=useState('');
 const attempt=useRef<{payload:string;key:string}|undefined>(undefined);
 const selected=units.find(u=>u.id===unit)??(unit===''?units[0]:undefined);
 const accounts=configuration.accounts.filter(a=>a.active&&a.type==='cash'&&a.unit_id===selected?.id);
 const selectedAccount=accounts.find(a=>a.id===account)??(account===''?accounts[0]:undefined);
 async function submit(e:FormEvent){e.preventDefault();if(busy||!selected||!selectedAccount)return;const cents=cashAmountToCents(amount);if(cents===null){setError('Informe o fundo em reais, com no máximo duas casas decimais.');return;}
  const input={unit_id:selected.id,cash_account_id:selectedAccount.id,opening_cents:cents},payload=JSON.stringify(input);if(attempt.current?.payload!==payload)attempt.current={payload,key:crypto.randomUUID()};setError('');
  if(await onOpen({...input,idempotency_key:attempt.current.key})){setAmount('0,00');setAccount('');setUnit('');attempt.current=undefined;}
 }
 if(!units.length)return <p className="customer-note">{configuration.units.some(u=>u.active)?'Seu caixa nesta unidade já está aberto.':'Nenhuma unidade ativa disponível. Solicite a configuração ao gestor autorizado.'}</p>;
 return <form className="cash-opening" onSubmit={submit} noValidate aria-label="Abrir caixa individual">
  <fieldset disabled={busy}><div className="cash-opening-grid">
   <label className="team-field">Unidade<select value={selected?.id??''} onChange={e=>{setUnit(e.target.value);setAccount('');}}>{!selected&&<option value="">Selecione a unidade</option>}{units.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</select></label>
   <label className="team-field">Conta em espécie<select value={selectedAccount?.id??''} onChange={e=>setAccount(e.target.value)}>{!selectedAccount&&<option value="">Nenhuma conta em espécie disponível</option>}{accounts.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
   <label className="team-field">Fundo inicial (R$)<input autoComplete="off" inputMode="decimal" maxLength={14} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
  </div></fieldset>
  <p className="customer-note">O fundo é dinheiro físico para iniciar seu caixa. Não é receita nem recebimento de serviços.</p>
  {!accounts.length&&<p className="customer-note">O gestor autorizado deve cadastrar uma conta em espécie para esta unidade.</p>}
  {error&&<p role="alert" className="form-feedback error">{error}</p>}
  <div className="account-actions"><button className="primary-button" disabled={busy||!selected||!selectedAccount}><DoorOpen size={18} aria-hidden="true"/>Abrir meu caixa</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setAmount('0,00');setUnit('');setAccount('');setError('');attempt.current=undefined;onClear();}}><X size={18} aria-hidden="true"/>Cancelar</button></div>
 </form>;
}
