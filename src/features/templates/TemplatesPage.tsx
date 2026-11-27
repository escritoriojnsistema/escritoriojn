import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Eye, Plus, RefreshCw, Search } from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import type {
  TemplateDetail as Detail,
  TemplateInput,
  TemplateSummary,
} from '../../../shared/templates';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { templatesApi, templatesError, TemplatesError } from './api';
import { ModelManagement } from '../documentCommercial/ModelManagement';
import { commercialApi } from '../documentCommercial/api';
import {
  TemplateFolders,
  allFolders,
  type FolderFilter,
} from '../documentCommercial/TemplateFolders';
import { TemplateForm } from './TemplateForm';
import { TemplateDetail } from './TemplateDetail';
import {
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatTemplateMeta,
  mergeByKey,
  shouldLoadMoreDocumentPages,
} from '../documents/documentsListModel';
import '../team/team.css';
import '../customers/customers.css';
import '../documents/documents.css';
import './templates.css';

type AccumulatedTemplates = {
  items: TemplateSummary[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export default function TemplatesPage({
  embedded = false,
  fixedOffice,
  onPendingChange,
}: {
  embedded?: boolean;
  fixedOffice?: string;
  onPendingChange?: (pending: boolean) => void;
} = {}) {
  const auth = useAuth();
  const [selected, setSelected] = useState('');
  const contexts = auth.contexts.filter(
    c => c.role_code !== 'client' && c.permissions.includes('templates.read'),
  );
  const context =
    contexts.find(c => c.office_id === (fixedOffice ?? selected)) ??
    (fixedOffice ? undefined : contexts[0]);

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
      contexts={contexts}
      embedded={embedded}
      onOffice={setSelected}
      fixedOffice={!!fixedOffice}
      onPendingChange={onPendingChange}
    />
  );
}

function Workspace({
  context,
  contexts,
  embedded,
  onOffice,
  fixedOffice,
  onPendingChange,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  embedded: boolean;
  onOffice: (id: string) => void;
  fixedOffice: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const auth = useAuth();
  const office = context.office_id;
  const canManage = context.permissions.includes('templates.manage');
  const canReview =
    canManage ||
    (['owner', 'admin'].includes(context.role_code) &&
      context.permissions.includes('templates.approve'));

  const [folder, setFolder] = useState<FolderFilter>(allFolders);
  const [state, setState] = useState<'draft' | 'approved'>(
    canReview ? 'draft' : 'approved',
  );
  const [displayName, setDisplayName] = useState('');
  const [consultedVersion, setConsultedVersion] = useState<number>();
  const [view, setView] = useState<'list' | 'detail' | 'create' | 'edit'>('list');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [revision, setRevision] = useState(0);

  const [list, setList] = useState<AccumulatedTemplates>();
  const [detail, setDetail] = useState<Detail>();
  const [error, setError] = useState<TemplatesError>();
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [modelPending, setModelPending] = useState(false);
  const [foldersPending, setFoldersPending] = useState(false);
  const nestedBusy = modelPending || foldersPending;

  const onPending = useRef(onPendingChange);
  onPending.current = onPendingChange;
  useEffect(() => {
    onPending.current?.(busy || uncertain || nestedBusy);
  }, [busy, uncertain, nestedBusy]);
  useEffect(() => () => onPending.current?.(false), []);

  const pending = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const generation = useRef(0);
  const listRequest = useRef(0);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const attempt = useRef<
    | { kind: 'save'; body: Parameters<typeof templatesApi.save>[0] }
    | { kind: 'approve'; body: Parameters<typeof templatesApi.approve>[0] }
    | null
  >(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      listController.current?.abort();
      generation.current++;
    };
  }, []);

  const fail = useCallback((cause: unknown) => {
    const e = templatesError(cause);
    setError(e);
    if (e.status === 401 || e.status === 403) {
      pending.current?.abort();
      listController.current?.abort();
      attempt.current = null;
      setBlocked(true);
      setDetail(undefined);
      setList(undefined);
      setDisplayName('');
      setConsultedVersion(undefined);
      setUncertain(false);
      listRequest.current++;
    }
  }, []);

  const loadAccumulatedTemplates = useCallback(
    async (signal: AbortSignal, requestId: number) => {
      const first = await commercialApi.templates(
        office,
        folder.folder_id,
        folder.unfiled,
        state,
        query,
        1,
        DOCUMENTS_BATCH_SIZE,
        signal,
      );
      if (signal.aborted || !alive.current || requestId !== listRequest.current) {
        return;
      }

      let accumulated: AccumulatedTemplates = {
        items: first.items,
        total: first.total,
        loadedPage: 1,
        lastBatchSize: first.items.length,
      };
      setList(accumulated);

      while (
        !signal.aborted &&
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
          const next = await commercialApi.templates(
            office,
            folder.folder_id,
            folder.unfiled,
            state,
            query,
            nextPage,
            DOCUMENTS_BATCH_SIZE,
            signal,
          );
          if (signal.aborted || !alive.current || requestId !== listRequest.current) {
            return;
          }
          accumulated = {
            items: mergeByKey(accumulated.items, next.items, item => item.id),
            total: next.total,
            loadedPage: nextPage,
            lastBatchSize: next.items.length,
          };
          setList(accumulated);
        } catch (cause) {
          if (signal.aborted || !alive.current || requestId !== listRequest.current) {
            return;
          }
          const failure = templatesError(cause);
          if (failure.status === 401 || failure.status === 403) {
            fail(failure);
          }
          break;
        }
      }
    },
    [office, folder.folder_id, folder.unfiled, state, query, fail],
  );

  useEffect(() => {
    if (view !== 'list' || blocked) return;
    const c = new AbortController();
    listController.current?.abort();
    listController.current = c;
    loadingMoreRef.current = false;
    const requestId = ++listRequest.current;
    setError(undefined);

    void loadAccumulatedTemplates(c.signal, requestId).catch(e => {
      if (!c.signal.aborted && alive.current && requestId === listRequest.current) {
        fail(e);
      }
    });

    return () => c.abort();
  }, [view, blocked, revision, loadAccumulatedTemplates, fail]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const loadMoreTemplates = useCallback(async () => {
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
      const next = await commercialApi.templates(
        office,
        folder.folder_id,
        folder.unfiled,
        state,
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
          items: mergeByKey(prev.items, next.items, item => item.id),
          total: next.total,
          loadedPage: nextPage,
          lastBatchSize: next.items.length,
        };
      });
    } catch (cause) {
      if (!signal?.aborted && alive.current && requestId === listRequest.current) {
        const failure = templatesError(cause);
        if (failure.status === 401 || failure.status === 403) {
          fail(failure);
        }
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [list, blocked, view, office, folder.folder_id, folder.unfiled, state, query, fail]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreTemplates();
      }
    },
    [loadMoreTemplates],
  );

  function transition(next: typeof view) {
    pending.current?.abort();
    generation.current++;
    inFlight.current = false;
    setBusy(false);
    setError(undefined);
    setFeedback('');
    setUncertain(false);
    attempt.current = null;
    setView(next);
  }

  async function run(
    work: (signal: AbortSignal) => Promise<Detail>,
    accept: (result: Detail) => void,
    mutation = false,
  ) {
    if (inFlight.current || blocked) return;
    const c = new AbortController();
    const started = generation.current;
    pending.current = c;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await work(c.signal);
      if (alive.current && !c.signal.aborted && started === generation.current) {
        attempt.current = null;
        setUncertain(false);
        accept(result);
      }
    } catch (e) {
      if (alive.current && !c.signal.aborted && started === generation.current) {
        const failure = templatesError(e);
        if (mutation && failure.status === 503) setUncertain(true);
        else if (mutation) {
          setUncertain(false);
          attempt.current = null;
        }
        fail(failure);
      }
    } finally {
      if (alive.current && pending.current === c) {
        pending.current = null;
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  function open(id: string, number?: number, name?: string) {
    transition('detail');
    setDetail(undefined);
    setDisplayName(name ?? '');
    setConsultedVersion(number);
    void run(s => templatesApi.detail(office, id, 1, s, number), setDetail);
  }

  function back() {
    transition('list');
    setDetail(undefined);
    setRevision(x => x + 1);
  }

  function edit() {
    if (!detail?.can_manage || !canManage) return;
    if (detail.versions.some(v => v.number === (consultedVersion ?? detail.latest_version))) {
      transition('edit');
    } else {
      void run(
        s => templatesApi.detail(office, detail.id, 1, s),
        d => {
          setDetail(d);
          setConsultedVersion(d.versions[0]?.number);
          transition('edit');
        },
      );
    }
  }

  function save(definition: TemplateInput, reason: string) {
    if ((error?.status === 409 && error.code !== 'TEMPLATE_DUPLICATE') || !canManage) {
      return;
    }
    if (!attempt.current) {
      attempt.current = {
        kind: 'save',
        body: {
          office_id: office,
          template_id: view === 'edit' ? detail!.id : null,
          definition,
          reason,
          expected_version: view === 'edit' ? detail!.latest_version : 0,
          idempotency_key: crypto.randomUUID(),
        },
      };
    }
    const a = attempt.current;
    if (a.kind !== 'save') return;
    void run(
      s => templatesApi.save(a.body, s),
      d => {
        setDetail(d);
        setConsultedVersion(d.latest_version);
        setView('detail');
        setFeedback('Versão salva. A aprovação é uma decisão separada.');
      },
      true,
    );
  }

  function approve(version_id: string, reason: string) {
    if (!detail || error?.status === 409) return;
    if (!attempt.current) {
      attempt.current = {
        kind: 'approve',
        body: {
          office_id: office,
          template_id: detail.id,
          version_id,
          expected_version: detail.latest_version,
          reason,
          idempotency_key: crypto.randomUUID(),
        },
      };
    }
    const a = attempt.current;
    if (a.kind !== 'approve') return;
    void run(
      s => templatesApi.approve(a.body, s),
      d => {
        setDetail(d);
        setFeedback('Versão aprovada. Edições futuras exigem aprovação própria.');
      },
      true,
    );
  }

  const conflict = error?.status === 409 && error.code !== 'TEMPLATE_DUPLICATE';
  const locked = uncertain || conflict;
  const source = detail?.versions.find(
    v => v.number === (consultedVersion ?? detail.latest_version),
  );
  const initial = source ? { ...source, name: displayName || source.name } : undefined;

  async function refreshModels(signal: AbortSignal) {
    const requestId = ++listRequest.current;
    await loadAccumulatedTemplates(signal, requestId);
  }

  const officeSelector =
    !fixedOffice && contexts.length > 1 ? (
      <label className="documents-office-select" htmlFor="templates-office">
        <span>Escritório</span>
        <select
          id="templates-office"
          value={office}
          disabled={busy || nestedBusy}
          onChange={e => onOffice(e.target.value)}
        >
          {contexts.map(c => (
            <option value={c.office_id} key={c.office_id}>
              {c.office_name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  const content = (
    <div className={`templates-main${embedded ? ' is-embedded' : ' is-viewport-screen'}`}>
      {!embedded && (
        <OperationHeading
          context={context}
          showRole={false}
          title={
            view === 'list'
              ? 'Modelos'
              : view === 'create'
                ? 'Novo modelo'
                : view === 'edit'
                  ? 'Nova versão'
                  : displayName || detail?.versions[0]?.name || 'Modelo'
          }
          description="Biblioteca, versões e aprovação dos modelos do escritório."
          action={officeSelector}
        />
      )}

      {blocked ? (
        <div className="documents-empty-card">
          <div className="team-empty">
            <p role="alert" className="form-feedback error">
              {error?.message}
            </p>
            {error?.status === 401 ? (
              <Link className="primary-button" to={paths.team}>
                Entrar novamente
              </Link>
            ) : (
              <button
                type="button"
                className="team-text-button"
                onClick={() => {
                  auth.refresh();
                  back();
                  setBlocked(false);
                }}
              >
                Verificar acesso novamente
              </button>
            )}
          </div>
        </div>
      ) : view !== 'list' ? (
        <>
          <div className="documents-subview-bar">
            <button
              type="button"
              data-operation-local-return
              className="documents-subview-back"
              disabled={busy || nestedBusy}
              onClick={back}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Voltar à lista
            </button>
            {view === 'detail' && detail?.can_manage && canManage && (
              <button
                type="button"
                className="documents-subview-action is-primary"
                disabled={busy || nestedBusy || !!locked}
                onClick={edit}
              >
                <Plus size={15} aria-hidden="true" />
                Nova versão
              </button>
            )}
          </div>

          {feedback && (
            <p role="status" className="form-feedback documents-inline-feedback">
              {feedback}
            </p>
          )}
          {error && (
            <div className="documents-inline-error">
              <p role="alert" className="form-feedback error">
                {error.message}
              </p>
              {error.status === 409 && detail && (
                <button
                  type="button"
                  className="team-text-button"
                  disabled={busy || nestedBusy}
                  onClick={() => open(detail.id)}
                >
                  Reabrir modelo
                </button>
              )}
              {error.status === 503 && view === 'detail' && !detail && (
                <button
                  type="button"
                  data-operation-local-return
                  className="team-text-button"
                  onClick={back}
                >
                  Voltar à lista
                </button>
              )}
            </div>
          )}

          <div className="documents-subview-scroll">
            {view === 'detail' && detail && (
              <ModelManagement
                key={detail.id + ':' + detail.latest_version}
                office={office}
                detail={detail}
                selectedNumber={consultedVersion}
                onSelected={setConsultedVersion}
                onPendingChange={setModelPending}
                onDuplicate={d => {
                  setDetail(d);
                  setDisplayName('');
                  setConsultedVersion(d.latest_version);
                  setRevision(x => x + 1);
                }}
                onUpdated={d => {
                  setDetail(d);
                  setConsultedVersion(current =>
                    d.versions.some(v => v.number === current)
                      ? current
                      : d.versions[0]?.number,
                  );
                  setRevision(x => x + 1);
                }}
                onChanged={() => setRevision(x => x + 1)}
                onName={setDisplayName}
                onArchived={() => {
                  back();
                  setFeedback('Modelo excluído da biblioteca ativa.');
                }}
                onDenied={status => fail(new TemplatesError(status))}
              />
            )}

            {view === 'detail' && (
              <TemplateFolders
                office={office}
                onPendingChange={setFoldersPending}
                filter={folder}
                onFilter={f => setFolder(f)}
                templateId={detail?.id}
                onRefresh={refreshModels}
                onChanged={() => setRevision(x => x + 1)}
                onDenied={status => fail(new TemplatesError(status))}
              />
            )}

            {view === 'create' || view === 'edit' ? (
              <TemplateForm
                key={`${view}:${detail?.latest_version ?? 0}`}
                initial={view === 'edit' ? initial : undefined}
                busy={busy || nestedBusy}
                locked={!!locked}
                conflict={!!conflict}
                onSave={save}
              />
            ) : (
              detail && (
                <TemplateDetail
                  key={`${detail.id}:${detail.history_page}:${detail.latest_version}`}
                  data={detail}
                  selectedNumber={consultedVersion}
                  onSelected={setConsultedVersion}
                  busy={busy || nestedBusy}
                  locked={!!locked}
                  conflict={!!conflict}
                  canApprove={
                    detail.can_approve &&
                    context.permissions.includes('templates.approve') &&
                    ['owner', 'admin'].includes(context.role_code)
                  }
                  onApprove={approve}
                  onHistory={p =>
                    void run(
                      s => templatesApi.detail(office, detail.id, p, s),
                      d => {
                        setDetail(d);
                        setConsultedVersion(d.versions[0]?.number);
                      },
                    )
                  }
                />
              )
            )}
          </div>
        </>
      ) : (
        <>
          <TemplateFolders
            office={office}
            onPendingChange={setFoldersPending}
            filter={folder}
            onFilter={f => setFolder(f)}
            onRefresh={refreshModels}
            onChanged={() => setRevision(x => x + 1)}
            onDenied={status => fail(new TemplatesError(status))}
          />

          {feedback && (
            <p role="status" className="form-feedback documents-inline-feedback">
              {feedback}
            </p>
          )}
          {error && (
            <p role="alert" className="form-feedback error documents-inline-feedback">
              {error.message}
            </p>
          )}

          <div
            className="documents-subtabs"
            role="tablist"
            aria-label="Estado dos modelos"
          >
            {canReview && (
              <button
                type="button"
                role="tab"
                aria-selected={state === 'draft'}
                onClick={() => setState('draft')}
              >
                Rascunhos
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={state === 'approved'}
              onClick={() => setState('approved')}
            >
              Aprovados
            </button>
          </div>

          <section
            className="documents-toolbar-section"
            aria-label="Busca e ações de modelos"
          >
            <form
              className="documents-search-form"
              onSubmit={e => {
                e.preventDefault();
                setQuery(input.trim());
                setRevision(x => x + 1);
              }}
            >
              <label className="documents-search-label" htmlFor="templates-search-input">
                Buscar modelo
              </label>
              <div className="documents-toolbar-row">
                <div className="documents-search-input-group">
                  <input
                    id="templates-search-input"
                    type="search"
                    value={input}
                    maxLength={120}
                    autoComplete="off"
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
                    aria-label="Atualizar modelos"
                    title="Atualizar modelos"
                    onClick={() => setRevision(x => x + 1)}
                  >
                    <RefreshCw size={18} aria-hidden="true" />
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="documents-primary-btn customer-new"
                      aria-label="Novo modelo"
                      title="Novo modelo"
                      onClick={() => {
                        setDetail(undefined);
                        transition('create');
                      }}
                    >
                      <Plus size={18} aria-hidden="true" />
                      <span>Novo modelo</span>
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
                aria-label="Modelos do escritório"
                onScroll={handleListScroll}
              >
                {list.items.map(v => (
                  <li key={v.id} className="documents-list-card-item">
                    <div className="documents-item-copy">
                      <strong>{v.name}</strong>
                      <small>{formatTemplateMeta(v)}</small>
                    </div>
                    <button
                      type="button"
                      className="documents-circle-btn"
                      aria-label={`Ver modelo ${v.name}`}
                      title="Ver modelo"
                      onClick={() =>
                        open(
                          v.id,
                          state === 'approved'
                            ? (v.current_version ?? undefined)
                            : v.latest_version,
                          v.name,
                        )
                      }
                    >
                      <Eye size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="documents-empty-card">
                <p className="team-empty">
                  Nenhum modelo encontrado. Cadastre um modelo ou ajuste a busca.
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
    <OperationLayout office={office} busy={busy || nestedBusy} viewportLock>
      {content}
    </OperationLayout>
  );
}

