import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import {
  reviewStatuses,
  type ReviewQueueItem,
  type ReviewStatus,
} from '../../../shared/editorialReview';
import { CommercialError } from '../documentCommercial/api';
import {
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  mergeByKey,
  shouldLoadMoreDocumentPages,
} from '../documents/documentsListModel';
import { workflowApi } from './api';

type AccumulatedReviews = {
  items: ReviewQueueItem[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export function ReviewQueue({ office }: { office: string }) {
  const [data, setData] = useState<AccumulatedReviews>();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ReviewStatus | ''>('in_review');
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);

  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const listRequest = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      listController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (blocked) return;
    const c = new AbortController();
    listController.current?.abort();
    listController.current = c;
    loadingMoreRef.current = false;
    const requestId = ++listRequest.current;

    void (async () => {
      try {
        const first = await workflowApi.reviewQueue(
          office,
          query,
          status,
          1,
          DOCUMENTS_BATCH_SIZE,
          c.signal,
        );
        if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
          return;
        }
        let accumulated: AccumulatedReviews = {
          items: first.items,
          total: first.total,
          loadedPage: 1,
          lastBatchSize: first.items.length,
        };
        setData(accumulated);
        setError('');

        while (
          !c.signal.aborted &&
          alive.current &&
          requestId === listRequest.current &&
          shouldLoadMoreDocumentPages({
            loadedCount: accumulated.items.length,
            total: accumulated.total,
            lastBatchSize: accumulated.lastBatchSize,
            pageSize: DOCUMENTS_BATCH_SIZE,
            maxItems: DOCUMENTS_AUTO_LOAD_CAP,
          })
        ) {
          const nextPage = accumulated.loadedPage + 1;
          try {
            const next = await workflowApi.reviewQueue(
              office,
              query,
              status,
              nextPage,
              DOCUMENTS_BATCH_SIZE,
              c.signal,
            );
            if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
              return;
            }
            accumulated = {
              items: mergeByKey(
                accumulated.items,
                next.items,
                item => item.publication_id,
              ),
              total: next.total,
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
            };
            setData(accumulated);
          } catch (cause) {
            if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
              return;
            }
            if (cause instanceof CommercialError && [401, 403].includes(cause.status)) {
              setData(undefined);
              setInput('');
              setQuery('');
              setBlocked(true);
              setError(cause.message);
            }
            break;
          }
        }
      } catch (e) {
        if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
          return;
        }
        if (e instanceof CommercialError && [401, 403].includes(e.status)) {
          setData(undefined);
          setInput('');
          setQuery('');
          setBlocked(true);
        }
        setError(
          e instanceof Error
            ? e.message
            : 'Não foi possível consultar as revisões.',
        );
      }
    })();

    return () => c.abort();
  }, [office, query, status, tick, blocked]);

  const loadMoreReviews = useCallback(async () => {
    if (!data || blocked || loadingMoreRef.current) return;
    if (
      !shouldLoadMoreDocumentPages({
        loadedCount: data.items.length,
        total: data.total,
        lastBatchSize: data.lastBatchSize,
        pageSize: DOCUMENTS_BATCH_SIZE,
      })
    ) {
      return;
    }
    loadingMoreRef.current = true;
    const requestId = listRequest.current;
    const nextPage = data.loadedPage + 1;
    const signal = listController.current?.signal;
    try {
      const next = await workflowApi.reviewQueue(
        office,
        query,
        status,
        nextPage,
        DOCUMENTS_BATCH_SIZE,
        signal,
      );
      if (signal?.aborted || !alive.current || requestId !== listRequest.current) {
        return;
      }
      setData(prev => {
        if (!prev) return prev;
        return {
          items: mergeByKey(prev.items, next.items, item => item.publication_id),
          total: next.total,
          loadedPage: nextPage,
          lastBatchSize: next.items.length,
        };
      });
    } catch (e) {
      if (!signal?.aborted && alive.current && requestId === listRequest.current) {
        if (e instanceof CommercialError && [401, 403].includes(e.status)) {
          setData(undefined);
          setBlocked(true);
          setError(e.message);
        }
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [data, blocked, office, query, status]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreReviews();
      }
    },
    [loadMoreReviews],
  );

  return (
    <section
      className="documents-review-workspace"
      aria-label="Fila de revisão editorial"
    >
      {error && (
        <p role="alert" className="form-feedback error documents-inline-feedback">
          {error}
        </p>
      )}
      {!blocked && (
        <>
          <div className="documents-filter-card">
            <form
              className="review-filters"
              onSubmit={e => {
                e.preventDefault();
                setQuery(input.trim());
                setTick(t => t + 1);
              }}
            >
              <label className="team-field">
                Buscar revisão
                <input
                  type="search"
                  value={input}
                  maxLength={120}
                  onChange={e => setInput(e.target.value)}
                />
              </label>
              <label className="team-field">
                Situação editorial
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as ReviewStatus | '')}
                >
                  <option value="">Todas as situações</option>
                  {Object.entries(reviewStatuses).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="documents-primary-btn">
                Consultar revisões
              </button>
            </form>
            <p className="document-hint documents-review-hint">
              Fila interna compartilhada. O prazo organiza a conferência e não decide o
              documento.
            </p>
          </div>

          {data ? (
            data.items.length > 0 ? (
              <ul
                className="documents-scroll-list documents-card-list review-queue"
                aria-label="Revisões editoriais"
                onScroll={handleListScroll}
              >
                {data.items.map(item => (
                  <li
                    key={item.publication_id}
                    className="documents-list-card-item is-review-row"
                  >
                    <div className="documents-item-copy is-stacked">
                      <strong>{item.title}</strong>
                      <small>
                        {item.protocol} · Revisão {item.revision} ·{' '}
                        {reviewStatuses[item.review.status]}
                      </small>
                      <p>
                        Responsável: {item.review.reviewer_name ?? 'Fila compartilhada'}{' '}
                        · Preparado por {item.review.prepared_by_name}
                      </p>
                      <p>
                        Prazo:{' '}
                        {item.review.due_at
                          ? new Date(item.review.due_at).toLocaleString('pt-BR')
                          : 'Sem prazo'}{' '}
                        · {item.pending_count} pendências
                      </p>
                      {item.review.last_reason && (
                        <p>Observação interna: {item.review.last_reason}</p>
                      )}
                    </div>
                    <Link
                      className="documents-circle-btn"
                      to="/documentos?aba=issued"
                      state={{ office_id: office, document_id: item.document_id }}
                      aria-label={`Abrir documento ${item.title}`}
                      title="Abrir documento"
                    >
                      <Eye size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="documents-empty-card">
                <p className="team-empty">Nenhuma revisão encontrada.</p>
              </div>
            )
          ) : (
            <div className="documents-empty-card is-blank" />
          )}
        </>
      )}
    </section>
  );
}

