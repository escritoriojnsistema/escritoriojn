import { usePendingNavigation33 } from '../portalIntake/usePendingNavigation33';
import {
  peekIntakeNonce33,
  keepIntakeNonce33,
  clearIntakeNonce33,
} from '../portalIntake/nonce';
import { DispatchOverview } from '../documentCommercial/DispatchOverview';
import DocumentCatalogPage from '../documentCommercial/DocumentCatalogPage';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Eye,
  FileText,
  LogIn,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import {
  publicRequestStatusLabels,
  requestStatuses,
  requestStatusLabels,
  type CreateRequestInput,
  type RequestDetail as Detail,
  type RequestFilterStatus,
  type RequestMutation,
} from '../../../shared/requests';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { AccountCorrectionForm } from './AccountCorrectionForm';
import { RequestForm } from './RequestForm';
import { RequestDetail } from './RequestDetail';
import { RequestArchivesPanel } from './RequestArchivesPanel';
import { RequestsPanelModal } from './RequestsPanelModal';
import { requestsApi, requestsError, RequestsError } from './api';
import {
  formatRequestsResultCount,
  formatRequestsTotal,
  getRequestStatusPresentation,
  HISTORY_AUTO_LOAD_CAP,
  mergeItemsByKey,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
  type RequestItemSummary,
} from './requestsListModel';
import '../team/team.css';
import '../customers/customers.css';
import '../services/services.css';
import '../payments/payments.css';
import './requests.css';

type AccumulatedRequests = {
  items: RequestItemSummary[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
  portal: boolean;
};

export default function RequestsPage({ client = false }: { client?: boolean }) {
  const auth = useAuth();
  const location = useLocation();
  const [selected, setSelected] = useState<string>(
    typeof location.state?.office_id === 'string' ? location.state.office_id : '',
  );
  const contexts = auth.contexts.filter(c =>
    client
      ? c.role_code === 'client'
      : c.role_code !== 'client' && c.permissions.includes('requests.read'),
  );
  useEffect(() => {
    const target = location.state?.office_id;
    if (typeof target === 'string' && contexts.some(c => c.office_id === target)) {
      setSelected(target);
    }
  }, [location.key]);
  const context = contexts.find(c => c.office_id === selected) ?? contexts[0];
  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return (
      <Navigate
        replace
        to={client ? paths.client : paths.team}
        state={auth.status === 'expired' ? { sessionExpired: true } : null}
      />
    );
  }
  if (auth.status !== 'authorized' || !context) {
    return (
      <OperationalFeedback
        status={auth.status === 'unavailable' ? 'unavailable' : 'denied'}
      />
    );
  }
  return (
    <RequestsWorkspace
      key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${context.permissions
        .slice()
        .sort()
        .join(',')}`}
      context={context}
      contexts={contexts}
      client={client}
      onOffice={setSelected}
    />
  );
}

function RequestsWorkspace({
  context,
  contexts,
  client,
  onOffice,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  client: boolean;
  onOffice: (id: string) => void;
}) {
  const location = useLocation();
  const sessionKey = useAuth().sessionKey;
  const office = context.office_id;
  const canCreate =
    client ||
    context.permissions.some(
      p => p === 'requests.create' || p === 'requests.category_intake',
    );
  const canDocument = !client && context.permissions.includes('requests.create');
  const canDispatch =
    !client &&
    ['owner', 'admin'].includes(context.role_code) &&
    context.permissions.includes('requests.read_all');
  const canArchives =
    !client &&
    ['owner', 'admin'].includes(context.role_code) &&
    context.permissions.includes('requests.archives.manage');

  const [view, setView] = useState<
    'list' | 'create' | 'correction' | 'detail' | 'document'
  >('list');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'mine' | 'queue'>(() =>
    !client && location.state?.request_scope === 'queue' ? 'queue' : 'mine',
  );
  const [status, setStatus] = useState<RequestFilterStatus>('');
  const [revision, setRevision] = useState(0);
  const [sideActions, setSideActions] = useState<ReactNode>();
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [archiveTools, setArchiveTools] = useState(false);
  const [nestedPending, setNestedPending] = useState(false);
  const [openingUncertain, setOpeningUncertain] = useState(false);

  useEffect(() => {
    const changed = () => setRevision(n => n + 1);
    window.addEventListener('jn:request-archives-changed', changed);
    return () =>
      window.removeEventListener('jn:request-archives-changed', changed);
  }, []);

  const [resource, setResource] = useState<{
    data?: AccumulatedRequests;
    error?: RequestsError;
  }>({});
  const [detail, setDetail] = useState<Detail>();
  const [name, setName] = useState('Solicitação');
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<RequestsError>();
  const [feedback, setFeedback] = useState('');

  const openingAttempt = useRef<{
    input: CreateRequestInput;
    key: string;
  } | null>(null);
  usePendingNavigation33(
    openingUncertain || nestedPending || (busy && view === 'create'),
  );

  const pending = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const idempotency = useRef(
    client
      ? (peekIntakeNonce33(sessionKey, office) ?? crypto.randomUUID())
      : crypto.randomUUID(),
  );

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      pending.current?.abort();
      listController.current?.abort();
    };
  }, []);

  const fail = useCallback((failure: RequestsError) => {
    setError(failure);
    if (failure.status === 401 || failure.status === 403) {
      setBlocked(true);
      setDispatchOpen(false);
      setArchiveTools(false);
      setDetail(undefined);
      setResource({});
      generation.current++;
      pending.current?.abort();
      listController.current?.abort();
    }
  }, []);

  const unavailableDetail = useCallback(() => {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    busyRef.current = false;
    setBusy(false);
    setNestedPending(false);
    setDetail(undefined);
    setResource({});
    setError(undefined);
    setView('list');
    setRevision(n => n + 1);
    setFeedback('Esta solicitação não está mais disponível.');
  }, []);

  useEffect(() => {
    if (view !== 'list' || blocked) return;
    const controller = new AbortController();
    listController.current?.abort();
    listController.current = controller;
    loadingMoreRef.current = false;

    void (async () => {
      try {
        const first = await requestsApi.search(
          office,
          query,
          scope,
          status,
          1,
          REQUESTS_BATCH_SIZE,
          controller.signal,
        );
        if (controller.signal.aborted) return;

        let accumulated: AccumulatedRequests = {
          items: first.items,
          total: first.total,
          loadedPage: 1,
          lastBatchSize: first.items.length,
          portal: first.portal,
        };
        setResource({ data: accumulated });

        while (
          !controller.signal.aborted &&
          shouldLoadMoreRequestPages({
            loadedCount: accumulated.items.length,
            total: accumulated.total,
            lastBatchSize: accumulated.lastBatchSize,
            pageSize: REQUESTS_BATCH_SIZE,
            maxItems: REQUESTS_AUTO_LOAD_CAP,
          })
        ) {
          const nextPage = accumulated.loadedPage + 1;
          try {
            const next = await requestsApi.search(
              office,
              query,
              scope,
              status,
              nextPage,
              REQUESTS_BATCH_SIZE,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            accumulated = {
              items: mergeRequestPages(accumulated.items, next.items),
              total: next.total,
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
              portal: next.portal,
            };
            setResource({ data: accumulated });
          } catch (cause) {
            if (controller.signal.aborted) return;
            const failure = requestsError(cause);
            if (failure.status === 401 || failure.status === 403) fail(failure);
            break;
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          const failure = requestsError(cause);
          if (failure.status === 401 || failure.status === 403) fail(failure);
          else setResource(old => ({ ...old, error: failure }));
        }
      }
    })();

    return () => controller.abort();
  }, [office, query, scope, status, revision, view, blocked, fail]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!client || view !== 'detail' || !detail || blocked) return;
    const controller = new AbortController();
    const id = detail.id;
    let refreshGeneration = 0;
    const refresh = () => {
      if (busyRef.current || document.visibilityState !== 'visible') return;
      const started = generation.current;
      const refreshStarted = ++refreshGeneration;
      void requestsApi
        .detail(office, id, 1, controller.signal)
        .then(v => {
          if (
            !controller.signal.aborted &&
            generation.current === started &&
            refreshStarted === refreshGeneration
          ) {
            setDetail(v);
          }
        })
        .catch(cause => {
          if (
            !controller.signal.aborted &&
            generation.current === started &&
            refreshStarted === refreshGeneration
          ) {
            const failure = requestsError(cause);
            if (failure.status === 404) unavailableDetail();
            else fail(failure);
          }
        });
    };
    window.addEventListener('jn:inbox-update', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('jn:inbox-update', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [client, view, detail?.id, office, blocked, fail, unavailableDetail]);

  useEffect(() => {
    if (view !== 'detail' || !detail || blocked) return;
    if (detail.portal) {
      const ph = detail.portal_history;
      if (!ph || ph.items.length >= ph.total || ph.items.length >= HISTORY_AUTO_LOAD_CAP) {
        return;
      }
      const nextPage = ph.page + 1;
      const controller = new AbortController();
      const targetId = detail.id;
      void requestsApi
        .detail(office, targetId, nextPage, controller.signal)
        .then(next => {
          if (controller.signal.aborted || !next.portal || !next.portal_history) return;
          setDetail(prev => {
            if (!prev || !prev.portal || prev.id !== targetId || !prev.portal_history) {
              return prev;
            }
            const merged = mergeItemsByKey(
              prev.portal_history.items,
              next.portal_history!.items,
              h => `${h.at}:${h.status}`,
            );
            if (merged.length <= prev.portal_history.items.length) return prev;
            return {
              ...next,
              portal_history: {
                ...next.portal_history!,
                items: merged,
                page: nextPage,
              },
            };
          });
        })
        .catch(() => {
          // Keep currently loaded history entries.
        });
      return () => controller.abort();
    }
    if (
      detail.history.length >= detail.history_total ||
      detail.history.length >= HISTORY_AUTO_LOAD_CAP
    ) {
      return;
    }
    const nextPage = detail.history_page + 1;
    const controller = new AbortController();
    const targetId = detail.id;
    void requestsApi
      .detail(office, targetId, nextPage, controller.signal)
      .then(next => {
        if (controller.signal.aborted || next.portal) return;
        setDetail(prev => {
          if (!prev || prev.portal || prev.id !== targetId) return prev;
          const merged = mergeItemsByKey(
            prev.history,
            next.history,
            h => h.id,
          );
          if (merged.length <= prev.history.length) return prev;
          return {
            ...next,
            history: merged,
            history_page: nextPage,
          };
        });
      })
      .catch(() => {
        // Keep currently loaded history entries.
      });
    return () => controller.abort();
  }, [
    view,
    office,
    blocked,
    detail?.id,
    detail && detail.portal ? detail.portal_history?.page : detail?.history_page,
    detail && detail.portal ? detail.portal_history?.items.length : detail?.history.length,
    detail && detail.portal ? detail.portal_history?.total : detail?.history_total,
  ]);

  function transition(next: typeof view, allowBusy = false) {
    if (!allowBusy && (busyRef.current || nestedPending)) return false;
    if (allowBusy) setNestedPending(false);
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    busyRef.current = false;
    setBusy(false);
    setError(undefined);
    setFeedback('');
    setDispatchOpen(false);
    setArchiveTools(false);
    setView(next);
    window.scrollTo(0, 0);
    return true;
  }

  async function run<T>(
    work: (signal: AbortSignal) => Promise<T>,
    accept: (result: T) => void,
    reject = fail,
  ) {
    if (busyRef.current || blocked) return;
    const started = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    setFeedback('');
    try {
      const result = await work(controller.signal);
      if (
        alive.current &&
        !controller.signal.aborted &&
        generation.current === started
      ) {
        accept(result);
      }
    } catch (cause) {
      if (
        alive.current &&
        !controller.signal.aborted &&
        generation.current === started
      ) {
        reject(requestsError(cause));
      }
    } finally {
      if (alive.current && pending.current === controller) {
        pending.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function back(allowBusy = false) {
    if (!transition('list', allowBusy)) return;
    setDetail(undefined);
    setRevision(n => n + 1);
  }

  function open(id: string, title: string) {
    if (!transition('detail')) return;
    setDetail(undefined);
    setName(title);
    void run(
      signal => requestsApi.detail(office, id, 1, signal),
      setDetail,
      failure => {
        if (failure.status === 404) unavailableDetail();
        else fail(failure);
      },
    );
  }

  useEffect(() => {
    if (
      client &&
      location.state?.office_id === office &&
      location.state?.account_correction === true
    ) {
      transition('correction');
      setDetail(undefined);
      return;
    }
    if (
      client &&
      location.state?.start_new === true &&
      (!location.state?.office_id || location.state?.office_id === office)
    ) {
      setDetail(undefined);
      idempotency.current = crypto.randomUUID();
      transition('create');
      return;
    }
    const id = location.state?.request_id;
    if (
      location.state?.office_id === office &&
      typeof id === 'string' &&
      id.length === 36
    ) {
      open(id, 'Solicitação');
    }
  }, [location.key, office]);

  function save(request: CreateRequestInput) {
    if (!canCreate || view !== 'create' || busyRef.current) return;
    const a = openingAttempt.current ?? {
      input: structuredClone(request),
      key: idempotency.current,
    };
    openingAttempt.current = a;
    if (client) keepIntakeNonce33(sessionKey, office, a.key);
    void run(
      async signal => {
        try {
          return await requestsApi.create(office, a.input, a.key, signal);
        } catch (e) {
          const f = requestsError(e);
          if (f.status === 503) setOpeningUncertain(true);
          else {
            openingAttempt.current = null;
            setOpeningUncertain(false);
            if (client && f.status !== 409) {
              clearIntakeNonce33(sessionKey, office);
            }
          }
          throw e;
        }
      },
      result => {
        openingAttempt.current = null;
        setOpeningUncertain(false);
        if (client) clearIntakeNonce33(sessionKey, office);
        setDetail(result);
        setName(result.title);
        setView('detail');
        setFeedback(
          client
            ? 'Solicitação enviada para triagem.'
            : !result.portal && result.preintake
              ? 'Pré-atendimento aberto. Colete os dados e encaminhe à equipe habilitada.'
              : 'Atendimento aberto.',
        );
        idempotency.current = crypto.randomUUID();
      },
    );
  }

  function mutate(mutation: RequestMutation) {
    if (!detail || detail.portal) return;
    void run(
      signal =>
        requestsApi.mutate(office, detail.id, detail.version, mutation, signal),
      result => {
        if ('access_lost' in result) {
          setResource({});
          back(true);
          setFeedback('Atendimento transferido e fora do seu escopo.');
          return;
        }
        setDetail(result);
        window.dispatchEvent(new Event('jn:notices-changed'));
        setFeedback('Alteração registrada.');
      },
    );
  }

  function handleListScroll(event: UIEvent<HTMLUListElement>) {
    const current = resource.data;
    if (!current || loadingMoreRef.current || blocked || view !== 'list') return;
    if (
      !shouldLoadMoreRequestPages({
        loadedCount: current.items.length,
        total: current.total,
        lastBatchSize: current.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
      })
    ) {
      return;
    }
    const target = event.currentTarget;
    if (target.scrollTop + target.clientHeight < target.scrollHeight - 100) {
      return;
    }
    const controller = listController.current;
    if (!controller || controller.signal.aborted) return;
    loadingMoreRef.current = true;
    const nextPage = current.loadedPage + 1;
    void requestsApi
      .search(
        office,
        query,
        scope,
        status,
        nextPage,
        REQUESTS_BATCH_SIZE,
        controller.signal,
      )
      .then(next => {
        if (controller.signal.aborted) return;
        setResource(old => {
          if (!old.data || old.data.loadedPage >= nextPage) return old;
          return {
            data: {
              items: mergeRequestPages(old.data.items, next.items),
              total: next.total,
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
              portal: next.portal,
            },
          };
        });
      })
      .catch(cause => {
        if (controller.signal.aborted) return;
        const failure = requestsError(cause);
        if (failure.status === 401 || failure.status === 403) fail(failure);
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  }

  const data = resource.data;
  const isListView = view === 'list' && !blocked;
  const officeAction =
    contexts.length > 1 ? (
      <label className="team-field customer-office requests-office-select">
        <span>Escritório</span>
        <select
          value={office}
          disabled={busy || nestedPending || openingUncertain}
          onChange={e => {
            if (!busyRef.current && !nestedPending) onOffice(e.target.value);
          }}
        >
          {contexts.map(c => (
            <option key={c.office_id} value={c.office_id}>
              {c.office_name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  return (
    <OperationLayout
      office={office}
      client={client}
      viewportLock
      busy={busy || nestedPending || openingUncertain}
      contextActions={view === 'detail' ? sideActions : undefined}
    >
      <div
        className={`requests-main is-viewport-screen${
          isListView ? ' is-list-view' : ' is-sub-view'
        }`}
      >
        <OperationHeading
          context={context}
          showRole
          action={officeAction}
          title={
            view === 'list'
              ? client
                ? 'Minhas solicitações'
                : 'Solicitações'
              : view === 'correction'
                ? 'Corrigir dados da conta'
                : view === 'document'
                  ? 'Solicitar documento'
                  : view === 'create'
                    ? 'Nova solicitação'
                    : (detail?.title ?? name)
          }
          description={
            client
              ? 'Envie uma mensagem e acompanhe seu atendimento.'
              : 'Abertura, fila e histórico dos atendimentos.'
          }
        />

        {blocked ? (
          <div className="team-empty">
            <p role="alert" className="form-feedback error">
              {error?.message}
            </p>
            <Link
              className="primary-button"
              to={client ? paths.client : paths.team}
            >
              <LogIn size={18} aria-hidden="true" />
              Verificar acesso
            </Link>
          </div>
        ) : (
          <>
            {view !== 'list' && (
              <div className="requests-subview-bar">
                <button
                  data-operation-local-return
                  className="requests-subview-back"
                  disabled={busy || nestedPending || openingUncertain}
                  onClick={() => back()}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  <span>Voltar à lista</span>
                </button>
              </div>
            )}

            {feedback && (
              <p role="status" className="form-feedback requests-inline-feedback">
                {feedback}
              </p>
            )}

            {error && (
              <div className="requests-inline-error">
                <p role="alert" className="form-feedback error">
                  {error.message}
                </p>
                {error.status === 409 && detail && (
                  <button
                    className="team-text-button"
                    disabled={busy}
                    onClick={() => open(detail.id, detail.title)}
                  >
                    Reabrir atendimento
                  </button>
                )}
                {view === 'detail' && !detail && (
                  <button className="team-text-button" onClick={() => back()}>
                    Voltar às solicitações
                  </button>
                )}
              </div>
            )}

            {openingUncertain && view === 'create' && (
              <button
                className="team-text-button"
                disabled={busy}
                onClick={() =>
                  openingAttempt.current && save(openingAttempt.current.input)
                }
              >
                Repetir a abertura registrada
              </button>
            )}

            {view === 'document' ? (
              <DocumentCatalogPage
                embedded
                fixedOffice={office}
                onPendingChange={setNestedPending}
              />
            ) : view === 'correction' ? (
              <AccountCorrectionForm
                office={office}
                onFailure={fail}
                onCreated={result => {
                  setDetail(result);
                  setName(result.title);
                  setView('detail');
                  setFeedback(
                    'Solicitação de correção enviada. Acompanhe pelo protocolo.',
                  );
                }}
              />
            ) : view === 'create' ? (
              <RequestForm
                office={office}
                client={client}
                permissions={context.permissions}
                roleCode={context.role_code}
                busy={busy || openingUncertain}
                onSave={save}
                onFailure={fail}
                onPendingChange={setNestedPending}
              />
            ) : view === 'detail' ? (
              detail && (
                <RequestDetail
                  onActionsChange={setSideActions}
                  onPendingChange={setNestedPending}
                  office={office}
                  data={detail}
                  permissions={context.permissions}
                  busy={busy || nestedPending || openingUncertain}
                  onHistory={p =>
                    void run(
                      signal => requestsApi.detail(office, detail.id, p, signal),
                      setDetail,
                    )
                  }
                  onMutate={mutate}
                  onFailure={fail}
                  onUpdated={setDetail}
                  onAccessLost={() => {
                    setResource({});
                    back(true);
                    setFeedback('Atendimento fora do seu escopo atual.');
                  }}
                  onArchived={() => {
                    setResource({});
                    back(true);
                    window.dispatchEvent(new Event('jn:request-archives-changed'));
                    setFeedback(
                      'Solicitação arquivada. O histórico financeiro foi preservado.',
                    );
                  }}
                  onDeleted={res => {
                    setResource({});
                    back(true);
                    window.dispatchEvent(new Event('jn:notices-changed'));
                    setFeedback(
                      res.message ||
                        `Solicitação ${res.protocol} excluída definitivamente.`,
                    );
                  }}
                />
              )
            ) : (
              <>
                {(canDispatch || canArchives || client) && (
                  <section
                    className={`requests-quick-panels${
                      canDispatch && canArchives ? ' is-two-col' : ' is-single'
                    }`}
                    aria-label="Atalhos operacionais"
                  >
                    {canDispatch && (
                      <button
                        type="button"
                        className="requests-quick-card"
                        aria-expanded={dispatchOpen}
                        onClick={() => setDispatchOpen(true)}
                      >
                        <span className="requests-quick-lead">
                          <ChevronRight size={17} aria-hidden="true" />
                          <span>Disponibilidade da equipe e fila de espera</span>
                        </span>
                        <span className="requests-quick-meta">Ver fila</span>
                      </button>
                    )}

                    {canArchives && (
                      <button
                        type="button"
                        className="requests-quick-card is-arrow"
                        aria-expanded={archiveTools}
                        onClick={() => setArchiveTools(true)}
                      >
                        <span className="requests-quick-lead">
                          <span>Relatórios e prazo</span>
                        </span>
                        <ArrowRight size={17} aria-hidden="true" />
                      </button>
                    )}

                    {client && (
                      <Link
                        className="requests-quick-card is-arrow"
                        to={paths.clientDocuments}
                      >
                        <span className="requests-quick-lead">
                          <span>Consultar pastas, modelos e preços</span>
                        </span>
                        <ArrowRight size={17} aria-hidden="true" />
                      </Link>
                    )}
                  </section>
                )}

                <section
                  className={`requests-toolbar-card${
                    client ? ' is-client' : ''
                  }`}
                  aria-label="Busca e filtros de solicitações"
                >
                  <form
                    className="requests-search-group"
                    onSubmit={e => {
                      e.preventDefault();
                      setQuery(input.trim());
                      setRevision(n => n + 1);
                    }}
                  >
                    <label className="team-field requests-search-field">
                      <span>Buscar solicitação</span>
                      <div className="requests-search-row">
                        <input
                          type="search"
                          maxLength={120}
                          placeholder={
                            client
                              ? 'Código ou título...'
                              : 'Código, título ou cliente...'
                          }
                          value={input}
                          onChange={e => setInput(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="requests-circle-btn"
                          aria-label="Buscar"
                          title="Buscar"
                        >
                          <Search size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </label>
                  </form>

                  <div className="requests-filter-selects">
                    {!client && (
                      <label className="team-field requests-select-field">
                        <span>Escopo</span>
                        <select
                          value={scope}
                          onChange={e =>
                            setScope(e.target.value as typeof scope)
                          }
                        >
                          <option value="mine">Meus</option>
                          <option value="queue">Fila autorizada</option>
                        </select>
                      </label>
                    )}

                    <label className="team-field requests-select-field">
                      <span>Status</span>
                      <select
                        value={status}
                        onChange={e =>
                          setStatus(e.target.value as RequestFilterStatus)
                        }
                      >
                        <option value="">Todos os status</option>
                        {client
                          ? Object.entries(publicRequestStatusLabels).map(
                              ([value, label]) => (
                                <option value={value} key={value}>
                                  {label}
                                </option>
                              ),
                            )
                          : requestStatuses.map(s => (
                              <option value={s} key={s}>
                                {requestStatusLabels[s]}
                              </option>
                            ))}
                      </select>
                    </label>
                  </div>

                  <div className="requests-toolbar-actions">
                    <button
                      type="button"
                      className="requests-circle-btn"
                      aria-label="Atualizar lista"
                      title="Atualizar lista"
                      onClick={() => setRevision(n => n + 1)}
                    >
                      <RefreshCw size={18} aria-hidden="true" />
                    </button>
                    {canCreate && (
                      <button
                        type="button"
                        className="requests-square-btn is-primary"
                        aria-label="Nova solicitação"
                        title="Nova solicitação"
                        disabled={nestedPending}
                        onClick={() => {
                          setDetail(undefined);
                          idempotency.current = crypto.randomUUID();
                          transition('create');
                        }}
                      >
                        <Plus size={18} aria-hidden="true" />
                      </button>
                    )}
                    {canDocument && (
                      <button
                        type="button"
                        className="requests-square-btn"
                        aria-label="Solicitar documento"
                        title="Solicitar documento"
                        disabled={nestedPending}
                        onClick={() => {
                          setDetail(undefined);
                          transition('document');
                        }}
                      >
                        <FileText size={18} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </section>

                {resource.error && (
                  <div className="requests-inline-error">
                    <p role="alert" className="form-feedback error">
                      {resource.error.message}
                    </p>
                    <button
                      type="button"
                      className="team-text-button"
                      onClick={() => setRevision(n => n + 1)}
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}

                <article
                  className="requests-list-card"
                  aria-label={
                    client
                      ? 'Quadro de minhas solicitações'
                      : 'Quadro de solicitações registradas'
                  }
                >
                  <div className="requests-list-head">
                    <span className="requests-list-kicker">
                      Solicitações registradas
                    </span>
                    <span className="requests-list-count">
                      {data ? formatRequestsResultCount(data.total) : '—'}
                    </span>
                  </div>

                  {data ? (
                    data.items.length > 0 ? (
                      <ul
                        className="requests-scroll-list"
                        aria-label={
                          client
                            ? 'Minhas solicitações'
                            : 'Solicitações do escritório'
                        }
                        onScroll={handleListScroll}
                      >
                        {data.items.map(item => {
                          const presentation =
                            getRequestStatusPresentation(item);
                          return (
                            <li key={item.id} className="requests-list-row">
                              <div className="requests-row-copy">
                                <strong>{item.title}</strong>
                                <div className="requests-row-meta">
                                  <span className="requests-row-protocol">
                                    {item.protocol}
                                  </span>
                                  <span
                                    className="requests-row-sep"
                                    aria-hidden="true"
                                  >
                                    ·
                                  </span>
                                  <span
                                    className={`request-status-pill tone-${presentation.tone}`}
                                  >
                                    {presentation.progressLabel ??
                                      presentation.label}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="requests-circle-btn requests-view-btn"
                                aria-label={`Ver solicitação ${item.protocol}`}
                                title="Ver solicitação"
                                onClick={() => open(item.id, item.title)}
                              >
                                <Eye size={18} aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="requests-list-empty">
                        <p className="team-empty">
                          Nenhuma solicitação encontrada.{' '}
                          {canCreate
                            ? 'Abra a primeira solicitação ou ajuste a busca.'
                            : 'Ajuste a busca ou confira a fila autorizada.'}
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="requests-list-empty" />
                  )}

                  <div className="requests-list-footer">
                    <span>
                      {data ? formatRequestsTotal(data.total) : 'Total: —'}
                    </span>
                  </div>
                </article>
              </>
            )}
          </>
        )}
      </div>

      {canDispatch && (
        <RequestsPanelModal
          open={dispatchOpen}
          title="Disponibilidade da equipe e fila de espera"
          onClose={() => setDispatchOpen(false)}
        >
          <DispatchOverview
            office={office}
            embedded
            onSelectRequest={() => setDispatchOpen(false)}
          />
        </RequestsPanelModal>
      )}

      {canArchives && (
        <RequestsPanelModal
          open={archiveTools}
          title="Relatórios e prazo"
          locked={nestedPending}
          onClose={() => setArchiveTools(false)}
        >
          <RequestArchivesPanel
            office={office}
            onDenied={fail}
            onPendingChange={setNestedPending}
          />
        </RequestsPanelModal>
      )}
    </OperationLayout>
  );
}
