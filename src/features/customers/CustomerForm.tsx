import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CustomerContact, CustomerDetail, CustomerInput, CustomerKind } from '../../../shared/customers';
import { digitsOnly, formatCnpj, formatCpf, validCnpj, validCpf } from '../../../shared/identifiers';

function normalizePhone(value: string) { return digitsOnly(value); }
function validPhone(value: string) { return /^(?:\d{10,11}|55\d{10,11})$/.test(value); }
export function CustomerForm({ customer, busy, onSave }: { customer?: CustomerDetail; busy: boolean; onSave: (input: CustomerInput) => void }) {
  const [kind, setKind] = useState<CustomerKind>(customer?.kind ?? 'person');
  const [name, setName] = useState(customer?.name ?? '');
  const [identifier, setIdentifier] = useState(customer?.identifier ? (customer.kind === 'person' ? formatCpf(customer.identifier) : formatCnpj(customer.identifier)) : '');
  const [contacts, setContacts] = useState<CustomerContact[]>(customer?.contacts.map(contact => ({ ...contact })) ?? []);
  const [validation, setValidation] = useState('');
  function changeKind(next: CustomerKind) { setKind(next); setIdentifier(''); setValidation(''); }
  function changeContact(index: number, patch: Partial<CustomerContact>) { setContacts(items => items.map((contact, i) => i === index ? { ...contact, ...patch } : contact)); }
  function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const normalizedName = name.trim().replace(/\s+/g, ' ');
    const normalizedIdentifier = digitsOnly(identifier);
    if (!normalizedName || normalizedName.length > 120) { setValidation('Informe o nome do cliente, com até 120 caracteres.'); return; }
    if (normalizedIdentifier && !(kind === 'person' ? validCpf(normalizedIdentifier) : validCnpj(normalizedIdentifier))) { setValidation(kind === 'person' ? 'CPF inválido. Confira os dígitos ou deixe o campo vazio.' : 'CNPJ inválido. Confira os dígitos ou deixe o campo vazio.'); return; }
    const normalizedContacts = contacts.map(contact => ({ kind: contact.kind, value: contact.kind === 'email' ? contact.value.trim().toLowerCase() : normalizePhone(contact.value) }));
    for (const contact of normalizedContacts) {
      if (contact.kind === 'email' && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.value) || contact.value.length > 254)) { setValidation('Informe um e-mail válido ou remova o contato vazio.'); return; }
      if (contact.kind === 'phone' && !validPhone(contact.value)) { setValidation('Informe um telefone válido com DDD (10 ou 11 dígitos), com código 55 opcional.'); return; }
    }
    if (new Set(normalizedContacts.map(contact => `${contact.kind}:${contact.value}`)).size !== normalizedContacts.length) { setValidation('Remova os contatos repetidos antes de continuar.'); return; }
    setValidation(''); onSave({ kind, name: normalizedName, identifier: normalizedIdentifier, contacts: normalizedContacts });
  }
  return <form className="customer-form" onSubmit={submit} noValidate>
    {validation && <p className="form-feedback error" role="alert">{validation}</p>}
    <fieldset disabled={busy}>
      <div className="customer-form-grid">
        <label className="team-field" htmlFor="customer-kind">Tipo de pessoa<select id="customer-kind" value={kind} onChange={event => changeKind(event.target.value as CustomerKind)}><option value="person">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label>
        <label className="team-field customer-name" htmlFor="customer-name">{kind === 'person' ? 'Nome completo' : 'Razão social'}<input id="customer-name" autoComplete="off" maxLength={120} required value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="team-field" htmlFor="customer-identifier">{kind === 'person' ? 'CPF (opcional)' : 'CNPJ (opcional)'}<input id="customer-identifier" autoComplete="off" inputMode="numeric" maxLength={kind === 'person' ? 14 : 18} value={identifier} onChange={event => setIdentifier(kind === 'person' ? formatCpf(event.target.value) : formatCnpj(event.target.value))} /></label>
      </div>
      <p className="customer-note">Use apenas os dados informados pelo cliente. Pessoa jurídica só quando o serviço exigir. Atendimentos anônimos não exigem ficha.</p>
      <div className="customer-contact-heading"><h2>Contatos <small>({contacts.length}/4)</small></h2><button className="team-text-button" type="button" disabled={contacts.length >= 4} onClick={() => setContacts(items => [...items, { kind: 'email', value: '' }])}><Plus size={17} aria-hidden="true" />Adicionar contato</button></div>
      {contacts.length > 0 && <div className="customer-contacts">{contacts.map((contact, index) => <div className="customer-contact" key={index}>
        <label className="team-field" htmlFor={`customer-contact-kind-${index}`}>Tipo do contato {index + 1}<select id={`customer-contact-kind-${index}`} value={contact.kind} onChange={event => changeContact(index, { kind: event.target.value as CustomerContact['kind'], value: '' })}><option value="email">E-mail</option><option value="phone">Telefone</option></select></label>
        <label className="team-field" htmlFor={`customer-contact-${index}`}>Contato {index + 1}<input id={`customer-contact-${index}`} type={contact.kind === 'email' ? 'email' : 'tel'} autoComplete="off" maxLength={contact.kind === 'email' ? 254 : 20} value={contact.value} onChange={event => changeContact(index, { value: contact.kind === 'phone' ? digitsOnly(event.target.value).slice(0, 13) : event.target.value })} /></label>
        <button className="operation-icon-button" type="button" title={`Remover contato ${index + 1}`} aria-label={`Remover contato ${index + 1}`} onClick={() => setContacts(items => items.filter((_, i) => i !== index))}><Trash2 size={18} aria-hidden="true" /></button>
      </div>)}</div>}
      <button className="primary-button customer-submit" type="submit">{customer ? 'Salvar alterações' : 'Criar cliente'}</button>
    </fieldset>
  </form>;
}
