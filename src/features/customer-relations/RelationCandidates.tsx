import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Search } from 'lucide-react';
import type { RelationCandidate, RelationCandidateKind } from '../../../shared/customerRelations';
import { customersError, type CustomersError } from '../customers/api';
import { relationsApi } from './api';

export function RelationCandidates({ office, kind, exclude, disabled, onSelect, onError }: { office: string; kind: RelationCandidateKind; exclude: string; disabled: boolean; onSelect: (candidate: RelationCandidate | undefined) => void; onError: (error: CustomersError) => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<RelationCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  function changeQuery(value: string) {
    pending.current?.abort(); pending.current = null; setBusy(false); setItems([]); setSearched(false); onSelect(undefined); setQuery(value);
  }
  async function search(event: FormEvent) {
    event.preventDefault(); if (disabled || busy) return;
    const controller = new AbortController(); pending.current?.abort(); pending.current = controller; setBusy(true); setItems([]); setSearched(false); onSelect(undefined);
    try {
      const result = await relationsApi.candidates({ office_id: office, kind, query: query.trim() }, controller.signal);
      if (!controller.signal.aborted) { setItems(result.items.filter(item => item.id !== exclude)); setSearched(true); }
    } catch (cause) { if (!controller.signal.aborted) onError(customersError(cause)); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }
  return <div className="relation-candidates"><form className="customer-search" onSubmit={search}><label className="team-field">Buscar pessoa<input type="search" autoComplete="off" maxLength={120} value={query} disabled={disabled} onChange={event => changeQuery(event.target.value)} /></label><button className="operation-icon-button" title="Buscar candidatos" aria-label="Buscar candidatos" disabled={disabled || busy}><Search size={20} aria-hidden="true" /></button></form>{searched && <label className="team-field">Selecionar pessoa<select defaultValue="" disabled={disabled} onChange={event => onSelect(items.find(item => item.id === event.target.value))}><option value="">{items.length ? 'Selecione para conferir' : 'Nenhuma pessoa encontrada'}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.identifier_masked ?? item.contact_masked ?? 'Sem identificador'}</option>)}</select></label>}{items.length === 20 && <p className="customer-note">Até 20 resultados. Refine a busca.</p>}</div>;
}
