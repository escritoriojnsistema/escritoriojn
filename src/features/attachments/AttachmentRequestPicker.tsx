import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { AttachmentRequestOption } from '../../../shared/attachments';
import { paths } from '../../app/routes';
import { attachmentsApi, attachmentsError, type AttachmentsError } from './api';
import { RequestsPanelModal } from '../requests/RequestsPanelModal';
import {
  formatEntityTotal,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from '../requests/requestsListModel';

type AccumulatedAttachmentRequests = {
  items: AttachmentRequestOption[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export function AttachmentRequestPicker({
  office,
  value,
  client,
  busy,
  onSelect,
  onFailure,
  label = 'solicitação',
  inline = false,
}: {
  office: string;
  size?: number;
  value?: AttachmentRequestOption;
  client: boolean;
  busy: boolean;
  onSelect: (value: AttachmentRequestOption) => void;
  onFailure: (error: AttachmentsError) => void;
  label?: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<AccumulatedAttachmentRequests>();
  const [error, setError] = useState<AttachmentsError>();
  const [pending, setPending] = useState(false);

  const loadingMore = useRef(false);
  const filterKey = `${office}:${query}:${revision}`;
  const activeKeyRef = useRef(filterKey);
  activeKeyRef.current = filterKey;

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  const loadMore = useCallback(
    (nextPage: number, expectedKey: string) => {
      if (loadingMore.current || activeKeyRef.current !== expectedKey) return;
      loadingMore.current = true;
      void attachmentsApi
        .requests(office, query, nextPage, REQUESTS_BATCH_SIZE)
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
          // Keep loaded items intact.
        })
        .finally(() => {
          if (activeKeyRef.current === expectedKey) {
            loadingMore.current = false;
          }
        });
    },
    [office, query],
  );

  useEffect(() => {
    loadingMore.current = false;
    const controller = new AbortController();
    const expectedKey = filterKey;
    setPending(true);
    setError(undefined);
    void attachmentsApi
      .requests(office, query, 1, REQUESTS_BATCH_SIZE, controller.signal)
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
          const failure = attachmentsError(cause);
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
  }, [office, query, filterKey, onFailure]);

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

  const pickerBody = (
    <section className="request-options is-modal-picker" aria-label={`Escolher ${label}`}>
      <div className="requests-picker-search">
        <label className="team-field">
          <span>Buscar {label}</span>
          <input
            type="search"
            maxLength={100}
            placeholder="Código ou título do atendimento..."
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
      </div>
      {error && (
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
      )}
      {data && !data.total && !query && (
        <p className="customer-note">
          Nenhuma solicitação disponível para anexar. Abra um atendimento no fluxo
          de solicitações.{' '}
          <Link to={client ? paths.clientRequests : paths.requests}>
            {client ? 'Ir para minhas solicitações' : 'Ir para solicitações'}
          </Link>
        </p>
      )}
      {data && (
        <>
          {data.items.length ? (
            <ul
              className="request-option-list requests-picker-scroll"
              onScroll={handleScroll}
            >
              {data.items.map(option => (
                <li key={option.id} className="requests-list-row">
                  <div className="requests-list-row-info">
                    <strong className="requests-list-row-title">
                      {option.label}
                    </strong>
                    {option.closed && (
                      <div className="requests-list-row-meta">
                        <span className="request-status-pill is-neutral">
                          Encerrado
                        </span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="team-text-button"
                    disabled={pending || busy}
                    aria-label={`Escolher ${option.label}`}
                    onClick={() => {
                      onSelect(option);
                      setOpen(false);
                    }}
                  >
                    Escolher
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            query && (
              <p className="customer-note">Nenhum resultado. Ajuste a busca.</p>
            )
          )}
          <div className="requests-list-footer">
            <span>{formatEntityTotal(data.total, 'opção', 'opções')}</span>
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="attachment-request-picker">
      <div className="request-picker-current">
        <span className="attachment-picker-selected">
          {value?.label ?? 'Todos os atendimentos'}
        </span>
        <button
          type="button"
          className="team-text-button"
          disabled={busy}
          aria-expanded={open}
          onClick={() => setOpen(v => !v)}
        >
          Selecionar {label}
        </button>
      </div>
      {error && !open && (
        <p role="alert" className="form-feedback error">
          {error.message}
        </p>
      )}
      {inline ? (
        open && pickerBody
      ) : (
        <RequestsPanelModal
          open={open}
          title={`Selecionar ${label}`}
          onClose={() => setOpen(false)}
        >
          {pickerBody}
        </RequestsPanelModal>
      )}
    </div>
  );
}
