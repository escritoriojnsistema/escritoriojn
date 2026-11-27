import { useEffect, useState } from 'react';
import type { ReviewMember, ReviewMembersPage } from '../../../shared/editorialReview';
import { workflowApi } from './api';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
} from '../documents/documentsListModel';

export function ReviewMemberPicker({
  office,
  documentId,
  value,
  onChange,
  disabled,
  onError,
}: {
  office: string;
  documentId: string;
  value: ReviewMember | null;
  onChange: (member: ReviewMember | null) => void;
  disabled: boolean;
  onError: (e: unknown) => void;
}) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ReviewMembersPage>();

  useEffect(() => {
    const c = new AbortController();
    void collectAllDocumentPages({
      fetchPage: (page, signal) =>
        workflowApi.reviewers(
          office,
          documentId,
          search,
          page,
          DOCUMENTS_BATCH_SIZE,
          signal,
        ),
      getItems: v => v.items,
      getTotal: v => v.total,
      getKey: m => m.id,
      pageSize: DOCUMENTS_BATCH_SIZE,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
      signal: c.signal,
    })
      .then(collected => {
        if (!c.signal.aborted) {
          setData({
            ...collected.firstPage,
            items: collected.items,
            total: collected.total,
            page: 1,
            page_size: DOCUMENTS_BATCH_SIZE,
          });
        }
      })
      .catch(e => {
        if (!c.signal.aborted) onError(e);
      });
    return () => c.abort();
  }, [office, documentId, search]);

  const options = data?.items ?? [];

  return (
    <fieldset className="review-member-picker" disabled={disabled}>
      <legend>Responsável pela revisão (opcional)</legend>
      <p className="document-hint">
        Sem designação, a análise fica na fila compartilhada de revisores autorizados.
      </p>
      <div className="review-filters">
        <label className="team-field">
          Buscar revisor
          <input
            value={query}
            maxLength={120}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="documents-subview-action"
          onClick={() => setSearch(query.trim())}
        >
          Buscar revisor
        </button>
      </div>
      <label className="team-field">
        Revisor elegível
        <select
          value={value?.id ?? ''}
          onChange={e => onChange(options.find(m => m.id === e.target.value) ?? null)}
        >
          <option value="">Fila compartilhada</option>
          {value && !options.some(m => m.id === value.id) && (
            <option value={value.id}>{value.label}</option>
          )}
          {options.map(m => (
            <option key={m.id} value={m.id}>
              {m.label} ·{' '}
              {m.role_code === 'owner'
                ? 'Proprietário'
                : m.role_code === 'admin'
                  ? 'Administrador'
                  : 'Equipe'}
            </option>
          ))}
        </select>
      </label>
      {data && (
        <p className="document-hint documents-count-note">
          {formatDocumentsCount(data.total, 'revisor elegível', 'revisores elegíveis')}
        </p>
      )}
    </fieldset>
  );
}
