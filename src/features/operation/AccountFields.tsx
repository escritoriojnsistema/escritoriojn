import type {AccountInput} from '../../../shared/account';
import {digitsOnly,formatCpf} from '../../../shared/identifiers';
export function AccountFields({value,onChange,masked=null,disabled=false}:{value:AccountInput;onChange:(value:AccountInput)=>void;masked?:string|null;disabled?:boolean}){
 return <div className="request-grid account-fields">
  <label className="team-field">Nome completo<input autoComplete="name" maxLength={120} disabled={disabled} value={value.name} onChange={e=>onChange({...value,name:e.target.value})}/></label>
  <label className="team-field">CPF<input autoComplete="off" inputMode="numeric" maxLength={14} disabled={disabled} value={formatCpf(value.cpf??'')} placeholder={masked??'000.000.000-00'} onChange={e=>onChange({...value,cpf:digitsOnly(e.target.value)||null})}/></label>
  <label className="team-field request-wide">E-mail de acesso<input autoComplete="email" type="email" maxLength={254} disabled={disabled} value={value.email} onChange={e=>onChange({...value,email:e.target.value})}/></label>
  {!value.cpf&&masked&&<p className="customer-note request-wide">CPF cadastrado: {masked}. Informe o número completo somente para alterá-lo.</p>}
 </div>;
}
export const normalizeAccountInput=(value:AccountInput):AccountInput=>({name:value.name.trim(),cpf:value.cpf,email:value.email.trim().toLowerCase()});
