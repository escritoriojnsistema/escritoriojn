import { useEffect, useState } from 'react';
import type {
  DocumentOptionKind,
  DocumentOptions,
  ParticipantInput,
} from '../../../shared/documents';
import { participantRoles, validParticipants } from '../../../shared/documents';
import { documentsApi } from './api';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
} from './documentsListModel';

export function OptionPicker({
  office,
  kind,
  requestId = null,
  label,
  value,
  onChange,
  disabled = false,
  onError,
}: {
  office: string;
  kind: DocumentOptionKind;
  requestId?: string | null;
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  onError: (e: unknown) => void;
}) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<DocumentOptions>();
  const [selected, setSelected] = useState('');
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    if (disabled) return;
    const t = setTimeout(() => {
      void collectAllDocumentPages({
        fetchPage: (page, signal) =>
          documentsApi.options(office, kind, requestId, query.trim(), page, signal),
        getItems: d => d.items,
        getTotal: d => d.total,
        getKey: x => x.id,
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
            });
            setFailed(false);
          }
        })
        .catch(e => {
          if (!c.signal.aborted) {
            setFailed(true);
            onError(e);
          }
        });
    }, 200);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [office, kind, requestId, query, disabled, retry]);

  const lowerLabel = label.toLocaleLowerCase('pt-BR');

  return (
    <div className="document-picker">
      <label className="team-field">
        {label}
        <select
          aria-label={label}
          value={value}
          disabled={disabled}
          onChange={e => {
            const id = e.target.value;
            setSelected(data?.items.find(x => x.id === id)?.label ?? '');
            onChange(id);
          }}
        >
          <option value="">Selecione</option>
          {value && !data?.items.some(x => x.id === value) && (
            <option value={value}>{selected || 'Seleção atual'}</option>
          )}
          {data?.items.map(x => (
            <option value={x.id} key={x.id}>
              {x.label}
              {x.demonstration ? ' · Homologação' : ''}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>Buscar ou ver mais opções de {lowerLabel}</summary>
        <label className="team-field">
          Filtrar {lowerLabel}
          <input
            type="search"
            maxLength={120}
            value={query}
            disabled={disabled}
            onChange={e => setQuery(e.target.value)}
          />
        </label>
        {data && (
          <p className="document-hint documents-count-note">
            {formatDocumentsCount(data.total, 'opção disponível', 'opções disponíveis')}
          </p>
        )}
      </details>
      {failed && (
        <button
          type="button"
          className="team-text-button"
          disabled={disabled}
          onClick={() => setRetry(n => n + 1)}
        >
          Repetir opções de {lowerLabel}
        </button>
      )}
    </div>
  );
}

export function ParticipantsForm({
  office,
  value,
  onChange,
  disabled,
  onError,
}: {
  office: string;
  value: ParticipantInput[];
  onChange: (v: ParticipantInput[]) => void;
  disabled: boolean;
  onError: (e: unknown) => void;
}) {
  function change(i: number, p: Partial<ParticipantInput>) {
    onChange(value.map((v, j) => (j === i ? { ...v, ...p } : v)));
  }

  return (
    <div className="document-participants">
      <p className="document-hint">
        Selecione as fichas e os papéis. Esta seleção não altera o cadastro nem concede acesso.
      </p>
      {value.map((p, i) => (
        <fieldset key={i} disabled={disabled}>
          <legend>Participante {i + 1}</legend>
          <div className="document-party-fields">
            <label className="team-field">
              Papel
              <select
                aria-label={`Papel ${i + 1}`}
                value={p.role}
                onChange={e =>
                  change(i, { role: e.target.value as ParticipantInput['role'] })
                }
              >
                {Object.entries(participantRoles).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="team-field">
              Identificação do papel
              <input
                value={p.label}
                maxLength={80}
                onChange={e => change(i, { label: e.target.value })}
              />
            </label>
            <OptionPicker
              office={office}
              kind="customers"
              label={`Pessoa ${i + 1}`}
              value={p.customer_id}
              onChange={customer_id => change(i, { customer_id })}
              disabled={disabled}
              onError={onError}
            />
            <button
              type="button"
              className="team-text-button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Remover participante {i + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="team-text-button"
        disabled={disabled || value.length >= 20}
        onClick={() =>
          onChange([...value, { role: 'other', customer_id: '', label: 'Outro' }])
        }
      >
        Adicionar participante
      </button>
      {!validParticipants(value) && (
        <p className="form-feedback error">
          Selecione as fichas, identifique os papéis e mantenha comprador e vendedor distintos.
        </p>
      )}
    </div>
  );
}
