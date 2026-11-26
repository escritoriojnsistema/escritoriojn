import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { teamRoleNames } from '../../../shared/team';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import type {
  RequestOption,
  RequestOptionKind,
} from '../../../shared/requests';
import { requestsApi, requestsError, type RequestsError } from './api';
import {
  formatEntityTotal,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from './requestsListModel';

type AccumulatedOptions = {
  items: RequestOption[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export function RequestPicker({
  office,
  kind,
  label,
  value,
  busy = false,
  correction = false,
  defaultSelf = false,
  categoryId,
  onSelect,
  onFailure,
}: {
  office: string;
  kind: RequestOptionKind;
  label: string;
  value?: RequestOption;
  busy?: boolean;
  correction?: boolean;
  defaultSelf?: boolean;
  categoryId?: string;
  onSelect: (option: RequestOption) => void;
  onFailure: (failure: RequestsError) => void;
}) {
  const auth = useAuth();
  const canManage = auth.contexts.some(
    c => c.office_id === office && c.permissions.includes('users.manage'),
  );
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<AccumulatedOptions>();
  const [error, setError] = useState<RequestsError>();
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);

  const loadingMore = useRef(false);
  const filterKey = `${office}:${kind}:${categoryId ?? ''}:${query}:${revision}`;
  const activeKeyRef = useRef(filterKey);
  activeKeyRef.current = filterKey;

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [input]);

  const loadMore = useCallback(
    (nextPage: number, expectedKey: string) => {
      if (loadingMore.current || activeKeyRef.current !== expectedKey) return;
      loadingMore.current = true;
      void requestsApi
        .options(
          office,
          kind,
          query,
          nextPage,
          REQUESTS_BATCH_SIZE,
          undefined,
          categoryId,
        )
        .then(result => {
          if (activeKeyRef.current !== expectedKey) return;
          setData(prev => {
            if (!prev) return prev;
            return {
              items: mergeRequestPages(prev.items, result.items),
              total: result.total,
              loadedPage: nextPage,
              lastBatchSize: result.items.length,
            };
          });
        })
        .catch(() => {
          // Preserve currently loaded options.
        })
        .finally(() => {
          if (activeKeyRef.current === expectedKey) {
            loadingMore.current = false;
          }
        });
    },
    [office, kind, query, categoryId],
  );

  useEffect(() => {
    if (!open) return;
    loadingMore.current = false;
    const controller = new AbortController();
    const expectedKey = filterKey;
    setPending(true);
    setError(undefined);
    void requestsApi
      .options(
        office,
        kind,
        query,
        1,
        REQUESTS_BATCH_SIZE,
        controller.signal,
        categoryId,
      )
      .then(result => {
        if (!controller.signal.aborted) {
          setData({
            items: result.items,
            total: result.total,
            loadedPage: 1,
            lastBatchSize: result.items.length,
          });
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) {
          const failure = requestsError(cause);
          setError(failure);
          if (failure.status === 401 || failure.status === 403) {
            onFailure(failure);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => {
      controller.abort();
      if (activeKeyRef.current === expectedKey) {
        loadingMore.current = false;
      }
    };
  }, [open, office, kind, query, categoryId, filterKey, onFailure]);

  useEffect(() => {
    if (!open || !data || error) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: data.items.length,
        total: data.total,
        lastBatchSize: data.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
        maxItems: REQUESTS_AUTO_LOAD_CAP,
      })
    ) {
      loadMore(data.loadedPage + 1, filterKey);
    }
  }, [open, data, error, filterKey, loadMore]);

  function handleScroll(event: UIEvent<HTMLUListElement>) {
    if (!data) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 120) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: data.items.length,
        total: data.total,
        lastBatchSize: data.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
      })
    ) {
      loadMore(data.loadedPage + 1, filterKey);
    }
  }

  return (
    <div className="request-picker">
      <div className="request-picker-current">
        <span>
          {value?.is_self
            ? 'Atribuído a mim'
            : value?.label ??
              (defaultSelf ? 'Atribuído a mim' : 'Nenhum selecionado')}
          {value?.role_code &&
            !value.is_self &&
            ` · ${teamRoleNames[value.role_code]}`}
        </span>
        <button
          type="button"
          className="team-text-button"
          disabled={busy}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
        >
          Selecionar {label}
        </button>
      </div>
      {open && (
        <section className="request-options" aria-label={`Escolher ${label}`}>
          <div className="requests-picker-search">
            <label className="team-field">
              <span>Buscar {label}</span>
              <input
                type="search"
                maxLength={120}
                placeholder={`Digite para buscar ${label}...`}
                value={input}
                onChange={e => setInput(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="requests-circle-btn"
              aria-label={`Buscar ${label}`}
              onClick={() => {
                setQuery(input.trim());
                setRevision(n => n + 1);
              }}
            >
              <Search size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="requests-circle-btn"
              aria-label={`Fechar seleção de ${label}`}
              onClick={() => setOpen(false)}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
          {error ? (
            <div>
              <p role="alert" className="form-feedback error">
                {error.message}
              </p>
              <button
                type="button"
                className="team-text-button"
                onClick={() => setRevision(n => n + 1)}
              >
                Tentar seleção novamente
              </button>
            </div>
          ) : (
            data && (
              <>
                {data.items.length ? (
                  <ul
                    className="request-option-list requests-picker-scroll"
                    onScroll={handleScroll}
                  >
                    {data.items.map(option => {
                      const unavailable =
                        option.eligible === false ||
                        (correction && option.corrections_eligible !== true);
                      return (
                        <li key={option.id} className="requests-list-row">
                          <div className="requests-list-row-info">
                            <strong className="requests-list-row-title">
                              {option.is_self ? 'Minha conta' : option.label}
                            </strong>
                            {(option.role_code || unavailable) && (
                              <div className="requests-list-row-meta">
                                {option.role_code && (
                                  <span className="requests-protocol-code">
                                    {teamRoleNames[option.role_code]}
                                  </span>
                                )}
                                {unavailable && (
                                  <span className="request-status-pill is-danger">
                                    {correction
                                      ? 'Sem permissão de consultar correções cadastrais.'
                                      : 'Sem permissão de consultar solicitações.'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="request-option-access">
                            {unavailable && canManage && (
                              <Link
                                className="team-text-button"
                                to={paths.teamManagement}
                                state={{ office_id: office }}
                              >
                                Gerenciar acesso
                              </Link>
                            )}
                            <button
                              type="button"
                              className="team-text-button"
                              disabled={pending || busy || unavailable}
                              aria-label={
                                option.is_self
                                  ? 'Atribuir a mim'
                                  : `Escolher ${option.label}`
                              }
                              onClick={() => {
                                onSelect(option);
                                setOpen(false);
                              }}
                            >
                              {option.is_self ? 'Atribuir a mim' : 'Escolher'}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="customer-note">
                    Nenhum resultado. Ajuste a busca.
                  </p>
                )}
                <div className="requests-list-footer">
                  <span>{formatEntityTotal(data.total, 'opção', 'opções')}</span>
                </div>
              </>
            )
          )}
        </section>
      )}
    </div>
  );
}
