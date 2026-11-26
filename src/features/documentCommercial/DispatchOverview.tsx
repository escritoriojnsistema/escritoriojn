import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type { DocumentDispatchPage } from '../../../shared/modelCommercial';
import { modelApi } from './modelApi';
import { paths } from '../../app/routes';
import {
  formatEntityTotal,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from '../requests/requestsListModel';

const statusNames = {
  available: 'Disponível',
  busy: 'Em atendimento',
  away: 'Ausente',
  offline: 'Offline',
};

const statusTone = {
  available: 'success',
  busy: 'navy',
  away: 'gold',
  offline: 'neutral',
} as const;

type AccumulatedDispatch = {
  members: DocumentDispatchPage['members'];
  members_total: number;
  members_limit: number;
  items: DocumentDispatchPage['items'];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export function DispatchOverview({
  office,
  embedded = false,
  onSelectRequest,
}: {
  office: string;
  embedded?: boolean;
  onSelectRequest?: () => void;
}) {
  const [open, setOpen] = useState(embedded);
  const [data, setData] = useState<AccumulatedDispatch>();
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');

  const active = embedded || open;
  const loadingMore = useRef(false);
  const filterKey = `${office}:${tick}`;
  const activeKeyRef = useRef(filterKey);
  activeKeyRef.current = filterKey;

  const loadMore = useCallback(
    (nextPage: number, expectedKey: string) => {
      if (loadingMore.current || activeKeyRef.current !== expectedKey) return;
      loadingMore.current = true;
      void modelApi
        .dispatch(office, nextPage, REQUESTS_BATCH_SIZE)
        .then(result => {
          if (activeKeyRef.current !== expectedKey) return;
          setData(prev => {
            if (!prev) return prev;
            return {
              members: result.members,
              members_total: result.members_total,
              members_limit: result.members_limit,
              items: mergeRequestPages(prev.items, result.items),
              total: result.total,
              loadedPage: nextPage,
              lastBatchSize: result.items.length,
            };
          });
        })
        .catch(() => {
          // Keep currently loaded items intact if a background batch fails.
        })
        .finally(() => {
          if (activeKeyRef.current === expectedKey) {
            loadingMore.current = false;
          }
        });
    },
    [office],
  );

  useEffect(() => {
    if (!active) return;
    loadingMore.current = false;
    const c = new AbortController();
    const expectedKey = filterKey;
    void modelApi
      .dispatch(office, 1, REQUESTS_BATCH_SIZE, c.signal)
      .then(v => {
        if (!c.signal.aborted) {
          setData({
            members: v.members,
            members_total: v.members_total,
            members_limit: v.members_limit,
            items: v.items,
            total: v.total,
            loadedPage: 1,
            lastBatchSize: v.items.length,
          });
          setError('');
        }
      })
      .catch(e => {
        if (!c.signal.aborted) {
          setError(
            e instanceof Error ? e.message : 'Não foi possível consultar a fila.',
          );
          if (
            e &&
            typeof e === 'object' &&
            'status' in e &&
            [401, 403].includes(Number(e.status))
          ) {
            setData(undefined);
          }
        }
      });
    return () => {
      c.abort();
      if (activeKeyRef.current === expectedKey) {
        loadingMore.current = false;
      }
    };
  }, [active, office, filterKey]);

  useEffect(() => {
    if (!active || !data) return;
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
  }, [active, data, filterKey, loadMore]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setTick(x => x + 1);
    }, 30000);
    return () => clearInterval(t);
  }, [active]);

  function handleQueueScroll(event: UIEvent<HTMLUListElement>) {
    if (!data) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 140) return;
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

  const content = (
    <div className="dispatch-overview-body">
      <div className="dispatch-overview-actions">
        <button
          type="button"
          className="team-text-button"
          onClick={() => setTick(x => x + 1)}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Atualizar disponibilidade
        </button>
      </div>
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {data && (
        <>
          <section className="requests-modal-card" aria-label="Equipe disponível">
            <div className="requests-list-card-head">
              <h2>EQUIPE EM OPERAÇÃO</h2>
              <span>{data.members.length} integrantes</span>
            </div>
            <ul
              className="requests-scroll-list requests-modal-list"
              aria-label="Disponibilidade da equipe"
            >
              {data.members.map(m => (
                <li key={m.membership_id} className="requests-list-row">
                  <div className="requests-list-row-info">
                    <strong className="requests-list-row-title">{m.name}</strong>
                    <div className="requests-list-row-meta">
                      <span className="requests-protocol-code">
                        Nível {m.role === 'owner' ? 1 : m.role === 'admin' ? 2 : 3}
                      </span>
                      <span className="requests-meta-sep" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`request-status-pill is-${statusTone[m.status]}`}
                      >
                        {statusNames[m.status]}
                      </span>
                      <span className="requests-meta-sep" aria-hidden="true">
                        ·
                      </span>
                      <span className="requests-protocol-code">
                        {m.active_load}/{m.capacity} atendimentos
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {data.members_total > data.members_limit && (
              <p className="team-hint">
                Exibidos {data.members_limit} de {data.members_total} integrantes.
                Consulte a gestão de equipe para os demais.
              </p>
            )}
          </section>

          <section
            className="requests-modal-card"
            aria-label="Solicitações aguardando responsável"
          >
            <div className="requests-list-card-head">
              <h3>AGUARDANDO RESPONSÁVEL</h3>
              <span>{data.total} em espera</span>
            </div>
            {data.items.length ? (
              <ul
                className="requests-scroll-list requests-modal-list"
                onScroll={handleQueueScroll}
              >
                {data.items.map(r => (
                  <li key={r.id} className="requests-list-row">
                    <div className="requests-list-row-info">
                      <strong className="requests-list-row-title">{r.title}</strong>
                      <div className="requests-list-row-meta">
                        <span className="requests-protocol-code">{r.protocol}</span>
                      </div>
                    </div>
                    <Link
                      className="team-text-button"
                      to={paths.requests}
                      state={{ office_id: office, request_id: r.id }}
                      onClick={() => onSelectRequest?.()}
                    >
                      Abrir atendimento
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="team-empty">Nenhuma solicitação em espera.</p>
            )}
            <div className="requests-list-footer">
              <span>
                {formatEntityTotal(
                  data.total,
                  'solicitação em espera',
                  'solicitações em espera',
                )}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <details
      className="service-section"
      onToggle={e => setOpen(e.currentTarget.open)}
    >
      <summary>Disponibilidade da equipe e fila de espera</summary>
      {content}
    </details>
  );
}
