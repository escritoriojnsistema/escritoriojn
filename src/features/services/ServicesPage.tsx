import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type UIEvent,
} from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  LogIn,
  Pencil,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import type {
  ServiceDetail as Detail,
  ServiceInput,
  ServiceQuote,
  ServiceSummary,
} from '../../../shared/services';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { ServicePortalPanel33 } from '../portalIntake/ServicePortalPanel33';
import { ServiceForm } from './ServiceForm';
import { ServiceDetail } from './ServiceDetail';
import { ServiceDocumentLink } from './ServiceDocumentLink';
import { ServiceRemoval } from './ServiceRemoval';
import { ServiceChecklists } from './ServiceChecklists';
import { servicesApi, servicesError, ServicesError } from './api';
import {
  SERVICES_AUTO_LOAD_CAP,
  SERVICES_BATCH_SIZE,
  formatServiceMeta,
  formatServicesTotal,
  mergeServicePages,
  shouldLoadMoreServicePages,
} from './servicesListModel';
import '../team/team.css';
import './services.css';

type AccumulatedServices = {
  items: ServiceSummary[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export default function ServicesPage() {
  const auth = useAuth();
  const location = useLocation();
  const [selected, setSelected] = useState(
    typeof location.state?.office_id === 'string' ? location.state.office_id : '',
  );
  const contexts = auth.contexts.filter(
    c => c.role_code !== 'client' && c.permissions.includes('services.read'),
  );
  const context =
    contexts.find(c => c.office_id === selected) ?? contexts[0];

  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return (
      <Navigate
        replace
        to={paths.team}
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
    <ServicesWorkspace
      key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${context.permissions
        .slice()
        .sort()
        .join(',')}`}
      context={context}
      contexts={contexts}
      onOffice={setSelected}
    />
  );
}

function ServicesWorkspace({
  context,
  contexts,
  onOffice,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  onOffice: (office: string) => void;
}) {
  const auth = useAuth();
  const office = context.office_id;
  const canManage = context.permissions.includes('services.manage');

  const [view, setView] = useState<'list' | 'create' | 'detail' | 'edit'>('list');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{
    key: string;
    data?: AccumulatedServices;
    error?: ServicesError;
  }>({ key: '' });
  const [detail, setDetail] = useState<Detail>();
  const [name, setName] = useState('Serviço');
  const [quote, setQuote] = useState<ServiceQuote>();
  const [blocked, setBlocked] = useState(false);
  const [removalPending, setRemovalPending] = useState(false);
  const [portalPending, setPortalPending] = useState(false);
  const [portalExpanded, setPortalExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ServicesError>();
  const [feedback, setFeedback] = useState('');

  const pending = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const listRequestRef = useRef(0);
  const generation = useRef(0);
  const busyRef = useRef(false);
  const alive = useRef(true);

  const listKey = `${office}:${query}:${revision}`;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      pending.current?.abort();
      listController.current?.abort();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (view !== 'list' || blocked) return;
    const controller = new AbortController();
    listController.current?.abort();
    listController.current = controller;
    loadingMoreRef.current = false;
    const requestId = ++listRequestRef.current;

    void (async () => {
      try {
        const first = await servicesApi.search(
          office,
          query,
          1,
          SERVICES_BATCH_SIZE,
          controller.signal,
        );
        if (
          controller.signal.aborted ||
          !alive.current ||
          requestId !== listRequestRef.current
        ) {
          return;
        }

        let accumulated: AccumulatedServices = {
          items: first.items,
          total: first.total,
          loadedPage: 1,
          lastBatchSize: first.items.length,
        };
        setResource({ key: listKey, data: accumulated });

        while (
          !controller.signal.aborted &&
          alive.current &&
          requestId === listRequestRef.current &&
          shouldLoadMoreServicePages({
            loadedCount: accumulated.items.length,
            total: accumulated.total,
            lastBatchSize: accumulated.lastBatchSize,
            pageSize: SERVICES_BATCH_SIZE,
            maxItems: SERVICES_AUTO_LOAD_CAP,
          })
        ) {
          const nextPage = accumulated.loadedPage + 1;
          try {
            const next = await servicesApi.search(
              office,
              query,
              nextPage,
              SERVICES_BATCH_SIZE,
              controller.signal,
            );
            if (
              controller.signal.aborted ||
              !alive.current ||
              requestId !== listRequestRef.current
            ) {
              return;
            }
            accumulated = {
              items: mergeServicePages(accumulated.items, next.items),
              total: next.total,
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
            };
            setResource({ key: listKey, data: accumulated });
          } catch (cause) {
            if (
              controller.signal.aborted ||
              !alive.current ||
              requestId !== listRequestRef.current
            ) {
              return;
            }
            const failure = servicesError(cause);
            if (failure.status === 401 || failure.status === 403) {
              setResource({ key: listKey, error: failure });
              setBlocked(true);
            }
            break;
          }
        }
      } catch (cause) {
        if (
          !controller.signal.aborted &&
          alive.current &&
          requestId === listRequestRef.current
        ) {
          const failure = servicesError(cause);
          setResource({ key: listKey, error: failure });
          if (failure.status === 401 || failure.status === 403) {
            setBlocked(true);
          }
        }
      }
    })();

    return () => controller.abort();
  }, [office, listKey, query, view, blocked]);

  const loadMoreServices = useCallback(async () => {
    const current = resource.key === listKey ? resource.data : undefined;
    if (!current || blocked || view !== 'list' || loadingMoreRef.current) {
      return;
    }
    if (
      !shouldLoadMoreServicePages({
        loadedCount: current.items.length,
        total: current.total,
        lastBatchSize: current.lastBatchSize,
        pageSize: SERVICES_BATCH_SIZE,
      })
    ) {
      return;
    }
    loadingMoreRef.current = true;
    const requestId = listRequestRef.current;
    const nextPage = current.loadedPage + 1;
    const signal = listController.current?.signal;
    try {
      const next = await servicesApi.search(
        office,
        query,
        nextPage,
        SERVICES_BATCH_SIZE,
        signal,
      );
      if (
        signal?.aborted ||
        !alive.current ||
        requestId !== listRequestRef.current
      ) {
        return;
      }
      setResource(prev => {
        if (prev.key !== listKey || !prev.data) return prev;
        return {
          key: listKey,
          data: {
            items: mergeServicePages(prev.data.items, next.items),
            total: next.total,
            loadedPage: nextPage,
            lastBatchSize: next.items.length,
          },
        };
      });
    } catch (cause) {
      if (
        !signal?.aborted &&
        alive.current &&
        requestId === listRequestRef.current
      ) {
        const failure = servicesError(cause);
        if (failure.status === 401 || failure.status === 403) {
          setResource({ key: listKey, error: failure });
          setBlocked(true);
        }
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [resource, listKey, blocked, view, office, query]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreServices();
      }
    },
    [loadMoreServices],
  );

  function transition(next: typeof view) {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    busyRef.current = false;
    setBusy(false);
    setError(undefined);
    setFeedback('');
    setQuote(undefined);
    setView(next);
  }

  async function run<T>(
    work: (signal: AbortSignal) => Promise<T>,
    accept: (result: T) => void,
  ) {
    if (busyRef.current) return;
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
        const failure = servicesError(cause);
        setError(failure);
        if (failure.status === 401 || failure.status === 403) {
          setBlocked(true);
          setDetail(undefined);
          setResource({ key: '' });
          setQuote(undefined);
        }
      }
    } finally {
      if (alive.current && pending.current === controller) {
        pending.current = null;
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  function open(id: string, title: string) {
    setPortalExpanded(false);
    transition('detail');
    setDetail(undefined);
    setName(title);
    void run(signal => servicesApi.detail(office, id, 1, signal), setDetail);
  }

  function back() {
    if (portalPending || removalPending) return;
    setPortalExpanded(false);
    transition('list');
    setDetail(undefined);
    setRevision(n => n + 1);
  }

  function edit() {
    if (!detail || !canManage || !detail.can_manage) return;
    setQuote(undefined);
    setFeedback('');
    if (detail.versions.some(v => v.number === detail.latest_version)) {
      transition('edit');
      return;
    }
    void run(
      signal => servicesApi.detail(office, detail.id, 1, signal),
      result => {
        setDetail(result);
        setView('edit');
      },
    );
  }

  function save(service: ServiceInput, reason: string) {
    if (
      !canManage ||
      (view !== 'create' && view !== 'edit') ||
      (view === 'edit' && !detail?.can_manage)
    ) {
      return;
    }
    void run(
      signal =>
        view === 'edit' && detail
          ? servicesApi.publish(
              office,
              detail.id,
              service,
              detail.latest_version,
              reason,
              signal,
            )
          : servicesApi.create(office, service, reason, signal),
      result => {
        setDetail(result);
        setName(result.current?.name ?? result.versions[0].name);
        setView('detail');
        setQuote(undefined);
        setFeedback(
          view === 'edit'
            ? 'Versão publicada. Itens antigos preservados.'
            : 'Serviço cadastrado.',
        );
      },
    );
  }

  function handleSearchSubmit(event: FormEvent) {
    event.preventDefault();
    setQuery(input.trim());
    setRevision(n => n + 1);
  }

  const data = resource.data;
  const listError = resource.error;
  const fatal = [error, listError].find(
    e => e?.status === 401 || e?.status === 403,
  );
  const initial = detail?.versions.find(v => v.number === detail.latest_version);
  const locked = busy || removalPending || portalPending;

  const officeSelector =
    contexts.length > 1 ? (
      <label className="services-office-select" htmlFor="services-office">
        <span>Escritório</span>
        <select
          id="services-office"
          value={office}
          disabled={locked}
          onChange={e => onOffice(e.target.value)}
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
    <OperationLayout office={office} busy={locked} viewportLock>
      <div className="services-main is-viewport-screen">
        <OperationHeading
          context={context}
          showRole={false}
          title={
            view === 'list'
              ? 'Serviços'
              : view === 'create'
                ? 'Novo serviço'
                : view === 'edit'
                  ? 'Editar serviço'
                  : (detail?.current?.name ?? name)
          }
          description={
            view === 'list'
              ? 'Catálogo, preços e regras do escritório.'
              : 'Preços e políticas preservados por versão.'
          }
          action={officeSelector}
        />

        {fatal ? (
          <div className="services-empty-card">
            <div className="team-empty">
              <p role="alert" className="form-feedback error">
                {fatal.message}
              </p>
              {fatal.status === 401 ? (
                <Link className="primary-button" to={paths.team}>
                  <LogIn size={18} aria-hidden="true" />
                  Entrar novamente
                </Link>
              ) : (
                <button
                  type="button"
                  className="team-text-button"
                  onClick={() => {
                    auth.refresh();
                    setBlocked(false);
                    setResource({ key: '' });
                    back();
                  }}
                >
                  Verificar acesso novamente
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {view !== 'list' && (
              <div className="services-subview-bar">
                <button
                  type="button"
                  data-operation-local-return
                  className="services-subview-back"
                  disabled={locked}
                  onClick={back}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Voltar à lista
                </button>
                {view === 'detail' && detail?.can_manage && canManage && (
                  <button
                    type="button"
                    className="services-subview-action is-primary"
                    disabled={locked}
                    onClick={edit}
                  >
                    <Pencil size={15} aria-hidden="true" />
                    Editar serviço
                  </button>
                )}
              </div>
            )}

            {feedback && (
              <p
                role="status"
                className="form-feedback services-inline-feedback"
              >
                {feedback}
              </p>
            )}

            {error && (
              <div className="services-inline-error">
                <p role="alert" className="form-feedback error">
                  {error.message}
                </p>
                {error.status === 409 && detail && (
                  <button
                    type="button"
                    className="team-text-button"
                    disabled={busy}
                    onClick={() => open(detail.id, name)}
                  >
                    Reabrir serviço
                  </button>
                )}
                {view === 'detail' && !detail && (
                  <button
                    type="button"
                    className="team-text-button"
                    onClick={back}
                  >
                    Voltar ao catálogo
                  </button>
                )}
              </div>
            )}

            {view === 'create' || view === 'edit' ? (
              <div className="services-subview-scroll">
                <ServiceForm
                  key={`${view}:${detail?.latest_version ?? 0}`}
                  office={office}
                  initial={view === 'edit' ? initial : undefined}
                  initialCategoryId={
                    view === 'edit' ? initial?.category_id : undefined
                  }
                  busy={busy}
                  onDenied={() => {
                    setBlocked(true);
                    setError(new ServicesError(403));
                    setDetail(undefined);
                    setResource({ key: '' });
                    setQuote(undefined);
                  }}
                  onSave={save}
                />
              </div>
            ) : view === 'detail' ? (
              <div className="services-subview-scroll">
                {detail && (
                  <>
                    {canManage && (
                      <ServicePortalPanel33
                        office={office}
                        serviceId={detail.id}
                        version={detail.current}
                        onReopen={() => open(detail.id, name)}
                        onPendingChange={setPortalPending}
                        onExpandedChange={setPortalExpanded}
                        onDenied={status => {
                          setBlocked(true);
                          setError(new ServicesError(status));
                          setDetail(undefined);
                          setResource({ key: '' });
                        }}
                      />
                    )}
                    <div className="services-detail-stack" hidden={portalExpanded}>
                      {detail.can_manage && canManage && (
                        <ServiceRemoval
                          office={office}
                          id={detail.id}
                          version={detail.latest_version}
                          onPendingChange={setRemovalPending}
                          onRemoved={() => {
                            back();
                            setFeedback('Serviço excluído do catálogo.');
                          }}
                          onDenied={status => {
                            setBlocked(true);
                            setError(new ServicesError(status));
                            setDetail(undefined);
                            setResource({ key: '' });
                          }}
                        />
                      )}
                      <ServiceDetail
                        key={detail.id}
                        data={detail}
                        busy={busy || portalPending}
                        permissions={context.permissions}
                        quote={quote}
                        onClearQuote={() => setQuote(undefined)}
                        onHistory={p =>
                          void run(
                            signal =>
                              servicesApi.detail(office, detail.id, p, signal),
                            result => {
                              setDetail(result);
                              setQuote(undefined);
                            },
                          )
                        }
                        onQuote={(quantity, adjustment) =>
                          void run(
                            signal =>
                              servicesApi.quote(
                                office,
                                detail.id,
                                quantity,
                                adjustment,
                                signal,
                              ),
                            setQuote,
                          )
                        }
                      />
                      {context.permissions.includes('checklists.manage') && (
                        <ServiceChecklists office={office} serviceId={detail.id} />
                      )}
                      <ServiceDocumentLink
                        office={office}
                        serviceId={detail.id}
                        canLink={
                          canManage &&
                          context.permissions.includes('templates.manage')
                        }
                        enabled={context.permissions.includes('requests.read')}
                      />
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <section
                  className="services-toolbar-section"
                  aria-label="Busca e ações de serviços"
                >
                  <form
                    className="services-search-form"
                    onSubmit={handleSearchSubmit}
                  >
                    <label
                      className="services-search-label"
                      htmlFor="services-search-input"
                    >
                      Buscar serviço
                    </label>
                    <div className="services-toolbar-row">
                      <div className="services-search-input-group">
                        <input
                          id="services-search-input"
                          type="search"
                          autoComplete="off"
                          maxLength={120}
                          value={input}
                          onChange={e => setInput(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="services-circle-btn"
                          aria-label="Buscar"
                          title="Buscar"
                        >
                          <Search size={18} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="services-toolbar-actions">
                        <button
                          type="button"
                          className="services-circle-btn"
                          aria-label="Atualizar lista"
                          title="Atualizar lista"
                          onClick={() => setRevision(n => n + 1)}
                        >
                          <RefreshCw size={18} aria-hidden="true" />
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            className="services-primary-btn customer-new"
                            aria-label="Novo serviço"
                            title="Novo serviço"
                            onClick={() => {
                              setDetail(undefined);
                              transition('create');
                            }}
                          >
                            <Plus size={18} aria-hidden="true" />
                            <span>Novo serviço</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </section>

                <section
                  className="services-list-section"
                  aria-label="Catálogo de serviços"
                >
                  {listError ? (
                    <div className="services-empty-card">
                      <div className="team-empty">
                        <p role="alert" className="form-feedback error">
                          {listError.message}
                        </p>
                        <button
                          type="button"
                          className="team-text-button"
                          onClick={() => setRevision(n => n + 1)}
                        >
                          Tentar novamente
                        </button>
                      </div>
                    </div>
                  ) : data ? (
                    <>
                      {data.items.length > 0 ? (
                        <ul
                          className="services-scroll-list"
                          aria-label="Serviços do escritório"
                          onScroll={handleListScroll}
                        >
                          {data.items.map(s => (
                            <li key={s.id} className="services-list-card-item">
                              <div className="services-item-copy">
                                <strong>{s.name}</strong>
                                <small>{formatServiceMeta(s)}</small>
                              </div>
                              <button
                                type="button"
                                className="services-circle-btn"
                                aria-label={`Ver serviço ${s.name}`}
                                title="Ver serviço"
                                onClick={() => open(s.id, s.name)}
                              >
                                <Eye size={18} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="services-empty-card">
                          <p className="team-empty">
                            Nenhum serviço encontrado. Cadastre o primeiro serviço
                            ou ajuste a busca.
                          </p>
                        </div>
                      )}
                      <div className="services-list-footer">
                        <span>{formatServicesTotal(data.total)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="services-empty-card is-blank" />
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>
    </OperationLayout>
  );
}
