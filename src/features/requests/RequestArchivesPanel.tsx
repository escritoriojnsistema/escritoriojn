import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Archive, Download, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  requestArchiveDays,
  type RequestArchiveDays,
  type RequestArchiveFilters,
  type RequestArchiveItem,
  type RequestArchivePolicy,
} from '../../../shared/requestArchives';
import { useAuth } from '../auth/AuthProvider';
import { paths } from '../../app/routes';
import {
  requestArchivesApi,
  requestArchivesError,
  RequestArchivesError,
} from './requestArchivesApi';
import {
  formatRequestsResultCount,
  formatRequestsTotal,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from './requestsListModel';
import './requestArchives.css';

export type RequestArchivesPanelProps = {
  office: string;
  onDenied?: (failure: RequestArchivesError) => void;
  archiveOnly?: boolean;
  onPendingChange?: (pending: boolean) => void;
};

type AccumulatedArchives = {
  items: RequestArchiveItem[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

const when = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export function RequestArchivesPanel(props: RequestArchivesPanelProps) {
  const auth = useAuth();
  const context = auth.contexts.find(c => c.office_id === props.office);
  const allowed =
    auth.status === 'authorized' &&
    context &&
    ['owner', 'admin'].includes(context.role_code) &&
    ['requests.read', 'requests.archives.manage'].every(p =>
      context.permissions.includes(p),
    );
  if (!allowed) {
    return (
      <p role="alert" className="form-feedback error">
        Seu acesso não permite gerenciar os arquivos de solicitações.
      </p>
    );
  }
  const authority = `${auth.sessionKey}:${props.office}:${context.role_code}:${context.permissions
    .slice()
    .sort()
    .join(',')}`;
  return (
    <ArchiveWorkspace
      key={`${authority}:${!!props.archiveOnly}`}
      {...props}
      canReadAll={context.permissions.includes('requests.read_all')}
    />
  );
}

function ArchiveWorkspace({
  office,
  onDenied,
  archiveOnly = false,
  canReadAll,
  onPendingChange,
}: {
  office: string;
  onDenied?: RequestArchivesPanelProps['onDenied'];
  archiveOnly?: boolean;
  canReadAll: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [filters, setFilters] = useState<RequestArchiveFilters>({
    scope: 'mine',
    view: archiveOnly ? 'archived' : 'recent',
    status: '',
    from: '',
    until: '',
  });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ key: string; value: AccumulatedArchives }>();
  const [policy, setPolicy] = useState<RequestArchivePolicy>();
  const [days, setDays] = useState<RequestArchiveDays>(90);
  const [selected, setSelected] = useState<RequestArchiveItem>();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RequestArchivesError>();
  const [feedback, setFeedback] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState(false);

  const onPending = useRef(onPendingChange);
  onPending.current = onPendingChange;
  useEffect(() => {
    onPending.current?.(busy);
  }, [busy]);
  useEffect(() => () => onPending.current?.(false), []);

  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const loadingMore = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  const edited = useRef(false);
  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;

  const key = JSON.stringify({ filters, revision });
  const activeKeyRef = useRef(key);
  activeKeyRef.current = key;

  const fail = useCallback((cause: unknown) => {
    const failure = requestArchivesError(cause);
    setError(failure);
    if (failure.status === 409) setConflict(true);
    if (failure.status === 401 || failure.status === 403) {
      setBlocked(true);
      setData(undefined);
      setPolicy(undefined);
      setSelected(undefined);
      setReason('');
      attempt.current = undefined;
      pending.current?.abort();
      onDeniedRef.current?.(failure);
    }
    if (failure.status === 404) setSelected(undefined);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (blocked) return;
    const controller = new AbortController();
    void requestArchivesApi
      .policy(office, controller.signal)
      .then(v => {
        if (!controller.signal.aborted) {
          setPolicy(v);
          if (!edited.current) setDays(v.days);
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) fail(cause);
      });
    return () => controller.abort();
  }, [office, revision, blocked, fail]);

  const loadMore = useCallback(
    (nextPage: number, expectedKey: string) => {
      if (loadingMore.current || blocked || activeKeyRef.current !== expectedKey) {
        return;
      }
      loadingMore.current = true;
      void requestArchivesApi
        .search(office, filters, nextPage, REQUESTS_BATCH_SIZE)
        .then(v => {
          if (activeKeyRef.current !== expectedKey) return;
          setData(prev => {
            if (!prev || prev.key !== expectedKey) return prev;
            return {
              key: expectedKey,
              value: {
                items: mergeRequestPages(prev.value.items, v.items),
                total: v.total,
                loadedPage: nextPage,
                lastBatchSize: v.items.length,
              },
            };
          });
        })
        .catch(() => {
          // Preserve loaded rows if a background batch fails.
        })
        .finally(() => {
          if (activeKeyRef.current === expectedKey) {
            loadingMore.current = false;
          }
        });
    },
    [office, filters, blocked],
  );

  useEffect(() => {
    if (blocked) return;
    loadingMore.current = false;
    const controller = new AbortController();
    const expectedKey = key;
    void requestArchivesApi
      .search(office, filters, 1, REQUESTS_BATCH_SIZE, controller.signal)
      .then(v => {
        if (!controller.signal.aborted) {
          setData({
            key: expectedKey,
            value: {
              items: v.items,
              total: v.total,
              loadedPage: 1,
              lastBatchSize: v.items.length,
            },
          });
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) fail(cause);
      });
    return () => {
      controller.abort();
      if (activeKeyRef.current === expectedKey) {
        loadingMore.current = false;
      }
    };
  }, [office, key, filters, blocked, fail]);

  const current = data?.key === key ? data.value : undefined;

  useEffect(() => {
    if (blocked || !current) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: current.items.length,
        total: current.total,
        lastBatchSize: current.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
        maxItems: REQUESTS_AUTO_LOAD_CAP,
      })
    ) {
      loadMore(current.loadedPage + 1, key);
    }
  }, [blocked, current, key, loadMore]);

  function handleListScroll(event: UIEvent<HTMLUListElement>) {
    if (!current) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 140) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: current.items.length,
        total: current.total,
        lastBatchSize: current.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
      })
    ) {
      loadMore(current.loadedPage + 1, key);
    }
  }

  function update(next: Partial<RequestArchiveFilters>) {
    setFilters(old => ({ ...old, ...next }));
    setSelected(undefined);
    setFeedback('');
  }

  function refresh() {
    if (busyRef.current) return;
    setError(undefined);
    setConflict(false);
    setSelected(undefined);
    setReason('');
    edited.current = false;
    setRevision(n => n + 1);
  }

  async function run(
    fingerprint: string,
    work: (id: string, signal: AbortSignal) => Promise<unknown>,
    accept: (value: unknown) => void,
  ) {
    if (busyRef.current || blocked || conflict) return;
    const controller = new AbortController();
    pending.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setFeedback('');
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const value = await work(attempt.current.key, controller.signal);
      if (alive.current && !controller.signal.aborted) {
        attempt.current = undefined;
        accept(value);
      }
    } catch (cause) {
      if (alive.current && !controller.signal.aborted) fail(cause);
    } finally {
      if (alive.current && pending.current === controller) {
        pending.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function savePolicy() {
    if (!policy) return;
    const payload = { days, version: policy.version };
    void run(
      JSON.stringify({ kind: 'policy', ...payload }),
      (id, signal) =>
        requestArchivesApi.setPolicy(office, days, policy.version, id, signal),
      value => {
        const result = value as RequestArchivePolicy;
        setPolicy(result);
        setDays(result.days);
        edited.current = false;
        setRevision(n => n + 1);
        setFeedback('Prazo salvo. Os já arquivados permanecem guardados.');
      },
    );
  }

  function archive() {
    if (!selected) return;
    const item = selected;
    void run(
      JSON.stringify({
        kind: 'archive',
        id: item.id,
        version: item.version,
        reason: reason.trim(),
      }),
      (id, signal) =>
        requestArchivesApi.archive(
          office,
          item.id,
          item.version,
          reason.trim(),
          id,
          signal,
        ),
      () => {
        setSelected(undefined);
        setReason('');
        setRevision(n => n + 1);
        setFeedback(
          'Solicitação arquivada. O acompanhamento do cliente foi preservado.',
        );
        window.dispatchEvent(new Event('jn:request-archives-changed'));
      },
    );
  }

  function exportReport() {
    void run(
      JSON.stringify({ kind: 'report', ...filters }),
      (id, signal) => requestArchivesApi.report(office, filters, id, signal),
      value => {
        const url = URL.createObjectURL(value as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'relatorio-solicitacoes.pdf';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setFeedback('Relatório completo gerado e registrado no histórico.');
      },
    );
  }

  if (blocked) {
    return (
      <p role="alert" className="form-feedback error">
        {error?.message}
      </p>
    );
  }

  return (
    <section
      className="request-archives"
      aria-label={
        archiveOnly
          ? 'Solicitações arquivadas'
          : 'Relatórios e prazo de solicitações'
      }
    >
      {!archiveOnly && (
        <>
          <p className="team-hint">
            Concluídas e canceladas são arquivadas após {policy?.days ?? 90} dias
            do fechamento. Pedidos, cobranças, documentos e anexos permanecem
            guardados; o cliente conserva seu acompanhamento.
          </p>
          <form
            className="request-archive-policy"
            onSubmit={e => {
              e.preventDefault();
              savePolicy();
            }}
          >
            <label className="team-field">
              Arquivar após
              <select
                value={days}
                disabled={busy}
                onChange={e => {
                  edited.current = true;
                  setDays(Number(e.target.value) as RequestArchiveDays);
                }}
              >
                {requestArchiveDays.map(d => (
                  <option value={d} key={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </label>
            <button
              className="team-text-button"
              type="submit"
              disabled={busy || conflict || !policy || policy.days === days}
            >
              Salvar prazo
            </button>
          </form>
        </>
      )}

      <div className="request-archive-filters">
        {!archiveOnly && (
          <label className="team-field">
            Exibir
            <select
              value={filters.view}
              disabled={busy}
              onChange={e =>
                update({
                  view: e.target.value as RequestArchiveFilters['view'],
                })
              }
            >
              <option value="recent">Concluídos recentes</option>
              <option value="archived">Arquivados</option>
            </select>
          </label>
        )}
        <label className="team-field">
          Escopo
          <select
            value={filters.scope}
            disabled={busy}
            onChange={e =>
              update({
                scope: e.target.value as RequestArchiveFilters['scope'],
              })
            }
          >
            <option value="mine">Meu acompanhamento</option>
            {canReadAll && (
              <option value="all">Todos os autorizados no escritório</option>
            )}
          </select>
        </label>
        <label className="team-field">
          Status
          <select
            value={filters.status}
            disabled={busy}
            onChange={e =>
              update({
                status: e.target.value as RequestArchiveFilters['status'],
              })
            }
          >
            <option value="">Concluídos e cancelados</option>
            <option value="concluido">Concluídos</option>
            <option value="cancelado">Cancelados</option>
          </select>
        </label>
        <label className="team-field">
          Fechamento de (UTC)
          <input
            type="date"
            value={filters.from}
            disabled={busy}
            onChange={e => update({ from: e.target.value })}
          />
        </label>
        <label className="team-field">
          Até (UTC)
          <input
            type="date"
            value={filters.until}
            min={filters.from || undefined}
            disabled={busy}
            onChange={e => update({ until: e.target.value })}
          />
        </label>
      </div>

      <div className="team-actions">
        <button className="team-text-button" disabled={busy} onClick={refresh}>
          <RefreshCw size={16} aria-hidden="true" />
          {conflict ? 'Atualizar e conferir' : 'Atualizar'}
        </button>
        <button
          className="team-text-button"
          disabled={busy || conflict || !current}
          onClick={exportReport}
        >
          <Download size={16} aria-hidden="true" />
          Exportar PDF
        </button>
      </div>
      <p className="team-hint">
        PDF privado: até 1.000 solicitações e 3 MB, com protocolo, título, status
        e datas. Refine as datas para volumes maiores.
      </p>

      {feedback && (
        <p role="status" className="form-feedback">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="form-feedback error">
          {error.message}
        </p>
      )}

      {selected && (
        <form
          className="request-archive-confirm"
          onSubmit={e => {
            e.preventDefault();
            archive();
          }}
        >
          <p>
            Arquivar {selected.protocol} · {selected.title}?
          </p>
          <label className="team-field">
            Motivo
            <input
              minLength={3}
              maxLength={500}
              required
              value={reason}
              disabled={busy}
              onChange={e => setReason(e.target.value)}
            />
          </label>
          <div className="team-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={busy || conflict || reason.trim().length < 3}
            >
              Confirmar arquivo
            </button>
            <button
              data-operation-local-return
              type="button"
              className="team-text-button"
              disabled={busy}
              onClick={() => {
                setSelected(undefined);
                setReason('');
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {current && (
        <div className="requests-modal-card">
          <div className="requests-list-card-head">
            <h3>
              {archiveOnly
                ? 'SOLICITAÇÕES ARQUIVADAS'
                : 'REGISTROS DO RELATÓRIO'}
            </h3>
            <span>{formatRequestsResultCount(current.total)}</span>
          </div>
          {current.items.length ? (
            <ul
              className="requests-scroll-list requests-modal-list"
              onScroll={handleListScroll}
            >
              {current.items.map(item => (
                <li key={item.id} className="requests-list-row">
                  <div className="requests-list-row-info">
                    <strong className="requests-list-row-title">
                      {item.title}
                    </strong>
                    <div className="requests-list-row-meta">
                      <span className="requests-protocol-code">
                        {item.protocol}
                      </span>
                      <span className="requests-meta-sep" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`request-status-pill is-${
                          item.status === 'concluido' ? 'success' : 'danger'
                        }`}
                      >
                        {item.status === 'concluido'
                          ? 'Concluído'
                          : 'Cancelado'}
                      </span>
                      <span className="requests-meta-sep" aria-hidden="true">
                        ·
                      </span>
                      <span className="requests-protocol-code">
                        Fechamento: {when(item.closed_at)}
                        {item.archived
                          ? item.archived_at
                            ? ' · Arquivo manual'
                            : ' · Arquivo por prazo'
                          : ''}
                      </span>
                    </div>
                  </div>
                  <div className="team-actions">
                    <Link
                      className="team-text-button"
                      to={paths.requests}
                      state={{ office_id: office, request_id: item.id }}
                    >
                      Ver solicitação
                    </Link>
                    {!item.archived && (
                      <button
                        type="button"
                        className="team-text-button"
                        disabled={busy || conflict}
                        onClick={() => {
                          setSelected(item);
                          setReason('');
                          setFeedback('');
                        }}
                      >
                        <Archive size={16} aria-hidden="true" />
                        Arquivar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="team-empty">
              Nenhuma solicitação corresponde aos filtros.
            </p>
          )}
          <div className="requests-list-footer">
            <span>{formatRequestsTotal(current.total)}</span>
          </div>
        </div>
      )}
    </section>
  );
}
