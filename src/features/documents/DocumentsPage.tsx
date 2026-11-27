import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Eye, History, Plus, RefreshCw, RotateCcw, Search, Users } from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import {
  validParticipants,
  type DocumentDetail,
  type DocumentSummary,
  type ParticipantInput,
} from '../../../shared/documents';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { documentsApi, documentsError, DocumentsError } from './api';
import { DocumentEditor } from './DocumentEditor';
import { OptionPicker, ParticipantsForm } from './DocumentOptions';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatIssuedDocumentMeta,
  mergeByKey,
  shouldLoadMoreDocumentPages,
} from './documentsListModel';
import '../team/team.css';
import '../customers/customers.css';
import '../templates/templates.css';
import './documents.css';

export type DocumentsLayout = { actions: ReactNode; busy: boolean };

type AccumulatedDocuments = {
  items: DocumentSummary[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export default function DocumentsPage({
  embedded = false,
  onLayout,
  fixedOffice,
}: {
  embedded?: boolean;
  fixedOffice?: string;
  onLayout?: (v: DocumentsLayout) => void;
} = {}) {
  const auth = useAuth();
  const [selected, setSelected] = useState('');
  const contexts = auth.contexts.filter(
    c =>
      c.role_code !== 'client' &&
      ['documents.read', 'requests.read', 'customers.read'].every(p =>
        c.permissions.includes(p),
      ),
  );
  const context =
    contexts.find(c => c.office_id === (fixedOffice ?? selected)) ?? contexts[0];

  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return <Navigate replace to={paths.team} />;
  }
  if (auth.status !== 'authorized' || !context) {
    return (
      <OperationalFeedback
        status={auth.status === 'unavailable' ? 'unavailable' : 'denied'}
      />
    );
  }

  return (
    <Workspace
      key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${[...context.permissions].sort().join(',')}`}
      context={context}
      contexts={fixedOffice ? [context] : contexts}
      embedded={embedded}
      onLayout={onLayout}
      onOffice={setSelected}
    />
  );
}

function Workspace({
  context,
  contexts,
  embedded,
  onOffice,
  onLayout,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  embedded: boolean;
  onOffice: (id: string) => void;
  onLayout?: (v: DocumentsLayout) => void;
}) {
  const location = useLocation();
  const office = context.office_id;
  const [view, setView] = useState<'list' | 'create' | 'editor'>('list');
  const [list, setList] = useState<AccumulatedDocuments>();
  const [detail, setDetail] = useState<DocumentDetail>();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState<Error>();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [entry, setEntry] = useState<'text' | 'review'>('text');
  const [sideView, setSideView] = useState<'none' | 'history' | 'participants'>('none');
  const [queueState, setQueueState] = useState({
    dirty: false,
    busy: false,
    conflict: false,
    retryable: false,
    retry: () => {},
  });
  const [request, setRequest] = useState('');
  const [item, setItem] = useState('');
  const [template, setTemplate] = useState('');
  const [parts, setParts] = useState<ParticipantInput[]>([]);

  const pending = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const listRequest = useRef(0);
  const alive = useRef(true);
  const flight = useRef(false);
  const createAttempt = useRef<Parameters<typeof documentsApi.create>[0] | null>(null);
  const canCreate =
    context.permissions.includes('documents.create') &&
    context.permissions.includes('templates.read');

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      listController.current?.abort();
    };
  }, []);

  const denied = useCallback((status: number) => {
    pending.current?.abort();
    listController.current?.abort();
    createAttempt.current = null;
    setDetail(undefined);
    setList(undefined);
    setParts([]);
    setRequest('');
    setItem('');
    setTemplate('');
    setInput('');
    setQuery('');
    setBlocked(true);
    setError(new DocumentsError(status));
    listRequest.current++;
  }, []);

  const fail = useCallback(
    (cause: unknown) => {
      const e =
        cause instanceof DocumentsError
          ? cause
          : cause instanceof Error && !(cause instanceof TypeError)
            ? cause
            : documentsError(cause);
      if (e instanceof DocumentsError && [401, 403].includes(e.status)) {
        denied(e.status);
      } else {
        setError(e);
      }
    },
    [denied],
  );

  useEffect(() => {
    if (view !== 'list' || blocked) return;
    const c = new AbortController();
    listController.current?.abort();
    listController.current = c;
    loadingMoreRef.current = false;
    const requestId = ++listRequest.current;

    void (async () => {
      try {
        const first = await documentsApi.search(
          office,
          query,
          1,
          DOCUMENTS_BATCH_SIZE,
          c.signal,
        );
        if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
          return;
        }
        let accumulated: AccumulatedDocuments = {
          items: first.items,
          total: first.total,
          loadedPage: 1,
          lastBatchSize: first.items.length,
        };
        setList(accumulated);
        setError(undefined);

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
            const next = await documentsApi.search(
              office,
              query,
              nextPage,
              DOCUMENTS_BATCH_SIZE,
              c.signal,
            );
            if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
              return;
            }
            accumulated = {
              items: mergeByKey(accumulated.items, next.items, doc => doc.id),
              total: next.total,
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
            };
            setList(accumulated);
          } catch (cause) {
            if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
              return;
            }
            const failure = documentsError(cause);
            if (failure.status === 401 || failure.status === 403) {
              denied(failure.status);
            }
            break;
          }
        }
      } catch (e) {
        if (!c.signal.aborted && alive.current && requestId === listRequest.current) {
          fail(e);
        }
      }
    })();

    return () => c.abort();
  }, [view, office, query, refresh, blocked, denied, fail]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const loadMoreDocuments = useCallback(async () => {
    if (!list || blocked || view !== 'list' || loadingMoreRef.current) return;
    if (
      !shouldLoadMoreDocumentPages({
        loadedCount: list.items.length,
        total: list.total,
        lastBatchSize: list.lastBatchSize,
        pageSize: DOCUMENTS_BATCH_SIZE,
      })
    ) {
      return;
    }
    loadingMoreRef.current = true;
    const requestId = listRequest.current;
    const nextPage = list.loadedPage + 1;
    const signal = listController.current?.signal;
    try {
      const next = await documentsApi.search(
        office,
        query,
        nextPage,
        DOCUMENTS_BATCH_SIZE,
        signal,
      );
      if (signal?.aborted || !alive.current || requestId !== listRequest.current) {
        return;
      }
      setList(prev => {
        if (!prev) return prev;
        return {
          items: mergeByKey(prev.items, next.items, doc => doc.id),
          total: next.total,
          loadedPage: nextPage,
          lastBatchSize: next.items.length,
        };
      });
    } catch (cause) {
      if (!signal?.aborted && alive.current && requestId === listRequest.current) {
        const failure = documentsError(cause);
        if (failure.status === 401 || failure.status === 403) {
          denied(failure.status);
        }
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [list, blocked, view, office, query, denied]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreDocuments();
      }
    },
    [loadMoreDocuments],
  );

  async function run(work: (s: AbortSignal) => Promise<DocumentDetail>) {
    if (flight.current || blocked) return;
    const c = new AbortController();
    pending.current = c;
    flight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const d = await work(c.signal);
      if (alive.current && !c.signal.aborted) {
        setDetail(d);
        setView('editor');
        setEpoch(n => n + 1);
        setQueueState({
          dirty: false,
          busy: false,
          conflict: false,
          retryable: false,
          retry: () => {},
        });
        createAttempt.current = null;
      }
    } catch (e) {
      if (alive.current && !c.signal.aborted) {
        if (!(e instanceof DocumentsError) || e.status !== 503) {
          createAttempt.current = null;
        }
        fail(e);
      }
    } finally {
      if (pending.current === c) {
        flight.current = false;
        pending.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }

  async function fetchFullDocumentDetail(
    id: string,
    revision: number | null,
    signal: AbortSignal,
  ): Promise<DocumentDetail> {
    const collected = await collectAllDocumentPages({
      fetchPage: (page, s) => documentsApi.detail(office, id, revision, page, s),
      getItems: d => d.history,
      getTotal: d => d.history_total,
      getKey: h => String(h.revision),
      pageSize: DOCUMENTS_BATCH_SIZE,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
      signal,
    });
    return {
      ...collected.firstPage,
      history: collected.items,
      history_total: collected.total,
      history_page: 1,
    };
  }

  function open(
    id: string,
    revision: number | null = null,
    nextEntry: 'text' | 'review' = 'text',
  ) {
    setEntry(nextEntry);
    setDetail(undefined);
    setView('editor');
    void run(s => fetchFullDocumentDetail(id, revision, s));
  }

  useEffect(() => {
    const id = location.state?.document_id;
    if (
      location.state?.office_id === office &&
      typeof id === 'string' &&
      id.length === 36
    ) {
      open(
        id,
        null,
        location.state?.document_entry === 'review' ? 'review' : 'text',
      );
    }
  }, [location.key, office]);

  function back() {
    if (busy || queueState.busy || queueState.dirty || createAttempt.current) return;
    setDetail(undefined);
    setView('list');
    setSideView('none');
    setError(undefined);
    setRefresh(n => n + 1);
    createAttempt.current = null;
  }

  function create() {
    if (!canCreate || !request || !item || !template || !validParticipants(parts)) {
      return;
    }
    if (!createAttempt.current) {
      createAttempt.current = {
        office_id: office,
        request_id: request,
        request_item_id: item,
        template_version_id: template,
        participants: structuredClone(parts),
        idempotency_key: crypto.randomUUID(),
      };
    }
    const body = createAttempt.current;
    void run(s => documentsApi.create(body, s));
  }

  const uncertain = !!createAttempt.current;
  const locked = busy || uncertain;
  const editorBusy = busy || queueState.busy;
  const actions =
    view !== 'list' ? (
      <>
        <button
          disabled={editorBusy || queueState.dirty || uncertain}
          onClick={back}
        >
          Voltar à lista
        </button>
        {detail && (
          <>
            <button
              disabled={editorBusy || queueState.dirty || queueState.conflict}
              onClick={() => setSideView('history')}
            >
              Histórico de revisões
            </button>
            {detail.can_edit && (
              <button
                disabled={editorBusy || queueState.dirty || queueState.conflict}
                onClick={() => setSideView('participants')}
              >
                Trocar participantes
              </button>
            )}
            <button
              disabled={editorBusy}
              onClick={() => {
                setSideView('none');
                open(detail.id);
              }}
            >
              Descartar edição local e reabrir
            </button>
            {queueState.retryable && (
              <button disabled={editorBusy} onClick={queueState.retry}>
                Repetir gravação
              </button>
            )}
          </>
        )}
      </>
    ) : undefined;

  useLayoutEffect(() => {
    if (embedded) {
      onLayout?.({
        actions,
        busy: editorBusy || queueState.dirty || uncertain,
      });
    }
  }, [
    embedded,
    onLayout,
    view,
    detail,
    editorBusy,
    queueState.dirty,
    queueState.conflict,
    queueState.retryable,
    blocked,
    uncertain,
  ]);

  useLayoutEffect(
    () => () => {
      if (embedded) onLayout?.({ actions: undefined, busy: false });
    },
    [embedded, onLayout],
  );

  const officeSelector =
    contexts.length > 1 ? (
      <label className="documents-office-select" htmlFor="documents-office">
        <span>Escritório</span>
        <select
          id="documents-office"
          value={office}
          disabled={editorBusy || queueState.dirty || uncertain}
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

  const content = (
    <div className={`documents-main${embedded ? ' is-embedded' : ' is-viewport-screen'}`}>
      {!embedded && (
        <OperationHeading
          context={context}
          showRole={false}
          title={
            view === 'list'
              ? 'Documentos'
              : view === 'create'
                ? 'Novo documento'
                : (detail?.title ?? 'Documento')
          }
          description="Preenchimento, participantes e revisão dos documentos do atendimento."
          action={officeSelector}
        />
      )}

      {error && (
        <p role="alert" className="form-feedback error documents-inline-feedback">
          {error.message}
        </p>
      )}

      {blocked ? (
        <div className="documents-empty-card">
          <Link className="primary-button" to={paths.team}>
            Verificar acesso novamente
          </Link>
        </div>
      ) : view === 'editor' ? (
        <>
          <div className="documents-subview-bar">
            <button
              type="button"
              data-operation-local-return
              className="documents-subview-back"
              disabled={editorBusy || queueState.dirty || uncertain}
              onClick={back}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Voltar à lista
            </button>
            {detail && (
              <div className="documents-subview-actions">
                <button
                  type="button"
                  className={`documents-subview-action${sideView === 'history' ? ' is-active' : ''}`}
                  disabled={editorBusy || queueState.dirty || queueState.conflict}
                  onClick={() =>
                    setSideView(current => (current === 'history' ? 'none' : 'history'))
                  }
                >
                  <History size={15} aria-hidden="true" />
                  Histórico
                </button>
                {detail.can_edit && (
                  <button
                    type="button"
                    className={`documents-subview-action${sideView === 'participants' ? ' is-active' : ''}`}
                    disabled={editorBusy || queueState.dirty || queueState.conflict}
                    onClick={() =>
                      setSideView(current =>
                        current === 'participants' ? 'none' : 'participants',
                      )
                    }
                  >
                    <Users size={15} aria-hidden="true" />
                    Participantes
                  </button>
                )}
                <button
                  type="button"
                  className="documents-subview-action"
                  disabled={editorBusy}
                  onClick={() => {
                    setSideView('none');
                    open(detail.id);
                  }}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  Reabrir
                </button>
                {queueState.retryable && (
                  <button
                    type="button"
                    className="documents-subview-action is-primary"
                    disabled={editorBusy}
                    onClick={queueState.retry}
                  >
                    Repetir
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="documents-subview-scroll">
            {detail && (
              <DocumentEditor
                key={`${detail.id}:${epoch}`}
                initial={detail}
                entry={entry}
                office={office}
                onState={setQueueState}
                onDenied={denied}
                onError={fail}
                sideView={sideView}
                onSideView={setSideView}
                onHistory={r => open(detail.id, r)}
              />
            )}
          </div>
        </>
      ) : view === 'create' ? (
        <>
          <div className="documents-subview-bar">
            <button
              type="button"
              data-operation-local-return
              className="documents-subview-back"
              disabled={editorBusy || queueState.dirty || uncertain}
              onClick={back}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Voltar à lista
            </button>
          </div>
          <div className="documents-subview-scroll">
            <form
              className="documents-create-card"
              onSubmit={e => {
                e.preventDefault();
                create();
              }}
            >
              <div className="document-create-grid">
                <OptionPicker
                  office={office}
                  kind="requests"
                  label="Atendimento"
                  value={request}
                  disabled={locked}
                  onChange={id => {
                    setRequest(id);
                    setItem('');
                  }}
                  onError={fail}
                />
                {request && (
                  <OptionPicker
                    key={request}
                    office={office}
                    kind="items"
                    requestId={request}
                    label="Item do atendimento"
                    value={item}
                    disabled={locked}
                    onChange={setItem}
                    onError={fail}
                  />
                )}
                <OptionPicker
                  office={office}
                  kind="templates"
                  label="Modelo aprovado"
                  value={template}
                  disabled={locked}
                  onChange={setTemplate}
                  onError={fail}
                />
              </div>
              <details className="document-create-parties" open>
                <summary>Participantes e papéis</summary>
                <ParticipantsForm
                  office={office}
                  value={parts}
                  onChange={setParts}
                  disabled={locked}
                  onError={fail}
                />
              </details>
              <button
                className="documents-primary-btn"
                type="submit"
                disabled={
                  busy || !request || !item || !template || !validParticipants(parts)
                }
              >
                Criar rascunho
              </button>
              <p className="document-hint">
                O atendimento, o modelo vigente e as fontes serão conferidos no servidor.
              </p>
            </form>
          </div>
        </>
      ) : (
        <>
          <section
            className="documents-toolbar-section"
            aria-label="Busca e ações de documentos"
          >
            <form
              className="documents-search-form"
              onSubmit={e => {
                e.preventDefault();
                setQuery(input.trim());
                setRefresh(n => n + 1);
              }}
            >
              <label className="documents-search-label" htmlFor="documents-search-input">
                Buscar documento
              </label>
              <div className="documents-toolbar-row">
                <div className="documents-search-input-group">
                  <input
                    id="documents-search-input"
                    type="search"
                    maxLength={120}
                    autoComplete="off"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="documents-circle-btn"
                    aria-label="Buscar"
                    title="Buscar"
                  >
                    <Search size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="documents-toolbar-actions">
                  <button
                    type="button"
                    className="documents-circle-btn"
                    aria-label="Atualizar documentos"
                    title="Atualizar documentos"
                    onClick={() => setRefresh(n => n + 1)}
                  >
                    <RefreshCw size={18} aria-hidden="true" />
                  </button>
                  {canCreate && (
                    <button
                      type="button"
                      className="documents-primary-btn customer-new"
                      aria-label="Novo documento"
                      title="Novo documento"
                      onClick={() => {
                        setView('create');
                        setError(undefined);
                        setQueueState({
                          dirty: false,
                          busy: false,
                          conflict: false,
                          retryable: false,
                          retry: () => {},
                        });
                      }}
                    >
                      <Plus size={18} aria-hidden="true" />
                      <span>Novo documento</span>
                    </button>
                  )}
                </div>
              </div>
            </form>
          </section>

          {list ? (
            list.items.length > 0 ? (
              <ul
                className="documents-scroll-list documents-card-list"
                aria-label="Documentos do escritório"
                onScroll={handleListScroll}
              >
                {list.items.map(d => (
                  <li key={d.id} className="documents-list-card-item">
                    <div className="documents-item-copy">
                      <strong>{d.title}</strong>
                      <small>{formatIssuedDocumentMeta(d)}</small>
                    </div>
                    <button
                      type="button"
                      className="documents-circle-btn"
                      aria-label={`Abrir documento ${d.title}`}
                      title="Abrir documento"
                      onClick={() => {
                        setSideView('none');
                        open(d.id);
                      }}
                    >
                      <Eye size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="documents-empty-card">
                <p className="team-empty">
                  Nenhum documento encontrado. Crie um rascunho a partir de um
                  atendimento e um modelo aprovado.
                </p>
              </div>
            )
          ) : (
            <div className="documents-empty-card is-blank" />
          )}
        </>
      )}
    </div>
  );

  return embedded ? (
    content
  ) : (
    <OperationLayout
      office={office}
      busy={editorBusy || uncertain}
      contextActions={actions}
      viewportLock
    >
      {content}
    </OperationLayout>
  );
}

