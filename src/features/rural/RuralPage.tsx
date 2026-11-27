import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Eye, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { commercialRequest, CommercialError } from '../documentCommercial/api';
import { customersApi } from '../customers/api';
import { attachmentsApi } from '../attachments/api';
import { AttachmentRequestPicker } from '../attachments/AttachmentRequestPicker';
import type {
  AttachmentPage,
  AttachmentRequestOption,
} from '../../../shared/attachments';
import type { CustomerSummary } from '../../../shared/customers';
import {
  ruralRoles,
  type RuralDetail,
  type RuralPage as Page,
  type RuralProperty,
} from '../../../shared/rural';
import { DitrPanel } from './DitrPanel';
import {
  RURAL_AUTO_LOAD_CAP,
  RURAL_BATCH_SIZE,
  filterRuralProperties,
  formatCountLabel,
  formatRuralCount,
  formatRuralTotal,
  mergeById,
  shouldLoadMoreByCount,
  shouldLoadMoreWithoutTotal,
} from './ruralListModel';
import '../team/team.css';
import '../customers/customers.css';
import './rural.css';

type RuralListItem = Pick<
  RuralProperty,
  'id' | 'name' | 'municipality' | 'state' | 'version'
>;

type AccumulatedProperties = {
  items: RuralListItem[];
  loadedPage: number;
  lastBatchSize: number;
};

type AccumulatedDetail = RuralDetail & {
  loadedPage: number;
  lastPartiesBatch: number;
  lastRecordsBatch: number;
};

type AccumulatedCustomers = {
  items: CustomerSummary[];
  total: number;
};

type AccumulatedFiles = {
  items: AttachmentPage['items'];
  total: number;
};

const request = <T,>(path: string, body: unknown, signal?: AbortSignal) =>
  commercialRequest<T>(path, body, signal, '/api/rural');

export default function RuralPage() {
  const auth = useAuth();
  const location = useLocation();
  const [selectedOffice, setSelectedOffice] = useState(
    typeof location.state?.office_id === 'string'
      ? location.state.office_id
      : '',
  );
  const [workspaceBusy, setWorkspaceBusy] = useState(false);

  const contexts = auth.contexts.filter(
    c =>
      c.role_code !== 'client' &&
      c.permissions.includes('customers.read') &&
      c.permissions.includes('rural.read'),
  );
  const context =
    contexts.find(c => c.office_id === selectedOffice) ?? contexts[0];

  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status !== 'authorized' || !context) {
    return (
      <OperationalFeedback
        status={auth.status === 'unavailable' ? 'unavailable' : 'denied'}
      />
    );
  }

  const officeSelector =
    contexts.length > 1 ? (
      <label className="customers-office-select" htmlFor="rural-office">
        <span>Escritório</span>
        <select
          id="rural-office"
          disabled={workspaceBusy}
          value={context.office_id}
          onChange={e => setSelectedOffice(e.target.value)}
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
      office={context.office_id}
      busy={workspaceBusy}
      viewportLock
    >
      <div className="rural-main is-viewport-screen">
        <OperationHeading
          context={context}
          title="Imóveis rurais"
          description="Cadastro interno, pessoas e histórico por imóvel. Não comprova propriedade ou regularidade oficial."
          showRole={false}
          action={officeSelector}
        />
        <Workspace
          key={`${auth.sessionKey}:${context.office_id}:${context.permissions.join(',')}`}
          office={context.office_id}
          create={
            context.permissions.includes('customers.create') &&
            context.permissions.includes('rural.create')
          }
          update={
            context.permissions.includes('customers.update') &&
            context.permissions.includes('rural.parties.manage')
          }
          canLink={
            context.permissions.includes('rural.records.manage') &&
            context.permissions.includes('customers.update') &&
            context.permissions.includes('requests.read') &&
            context.permissions.includes('files.read')
          }
          canReadDitr={context.permissions.includes('requests.read')}
          canManageDitr={
            context.permissions.includes('rural.records.manage') &&
            context.permissions.includes('customers.update')
          }
          canReadFiles={context.permissions.includes('files.read')}
          onBusyChange={setWorkspaceBusy}
        />
      </div>
    </OperationLayout>
  );
}

function Workspace({
  office,
  create,
  update,
  canLink,
  canReadDitr,
  canManageDitr,
  canReadFiles,
  onBusyChange,
}: {
  office: string;
  create: boolean;
  update: boolean;
  canLink: boolean;
  canReadDitr: boolean;
  canManageDitr: boolean;
  canReadFiles: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const [ditrLocked, setDitrLocked] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [view, setView] = useState('list');
  const [tick, setTick] = useState(0);
  const [filterInput, setFilterInput] = useState('');
  const [data, setData] = useState<AccumulatedProperties>();
  const [detail, setDetail] = useState<AccumulatedDetail>();
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customer, setCustomer] = useState<CustomerSummary>();
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<AccumulatedCustomers>();

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [location, setLocation] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierKind, setIdentifierKind] = useState('cafir');
  const [role, setRole] = useState('holder');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [party, setParty] = useState('');
  const [exercise, setExercise] = useState('');

  const [selectedRequest, setRequest] = useState<AttachmentRequestOption>();
  const [files, setFiles] = useState<AccumulatedFiles>();
  const [file, setFile] = useState('');

  const pending = useRef<{ body: unknown; key: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const loadingMoreListRef = useRef(false);
  const loadingMoreDetailRef = useRef(false);
  const alive = useRef(true);
  const flight = useRef(false);

  const locked = busy || !!pending.current || ditrLocked;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
      listController.current?.abort();
      detailController.current?.abort();
      onBusyChange(false);
    };
  }, [onBusyChange]);

  useEffect(() => {
    onBusyChange(locked);
  }, [locked, onBusyChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const failure = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : 'Serviço indisponível.');
    if (
      e instanceof Error &&
      'status' in e &&
      (e.status === 401 || e.status === 403)
    ) {
      setDetail(undefined);
      setData(undefined);
      setCustomer(undefined);
      setChoices(undefined);
      setFiles(undefined);
      pending.current = null;
      setDenied(true);
    }
  }, []);

  // Load property list or property detail with automatic batch accumulation (no pagination UI)
  useEffect(() => {
    if (denied) return;
    const c = new AbortController();
    if (id) {
      detailController.current?.abort();
      detailController.current = c;
      loadingMoreDetailRef.current = false;
    } else {
      listController.current?.abort();
      listController.current = c;
      loadingMoreListRef.current = false;
    }

    void (async () => {
      try {
        const first = await request<Page | RuralDetail>(
          '/state',
          { office_id: office, property_id: id, page: 1 },
          c.signal,
        );
        if (c.signal.aborted) return;

        if ('property' in first) {
          let acc: AccumulatedDetail = {
            ...first,
            loadedPage: 1,
            lastPartiesBatch: first.parties.length,
            lastRecordsBatch: first.records.length,
          };
          setDetail(acc);

          while (
            !c.signal.aborted &&
            (shouldLoadMoreByCount({
              loadedCount: acc.parties.length,
              total: acc.parties_total,
              lastBatchSize: acc.lastPartiesBatch,
              pageSize: RURAL_BATCH_SIZE,
              maxItems: RURAL_AUTO_LOAD_CAP,
            }) ||
              shouldLoadMoreByCount({
                loadedCount: acc.records.length,
                total: acc.records_total,
                lastBatchSize: acc.lastRecordsBatch,
                pageSize: RURAL_BATCH_SIZE,
                maxItems: RURAL_AUTO_LOAD_CAP,
              }))
          ) {
            const nextPage = acc.loadedPage + 1;
            try {
              const next = await request<Page | RuralDetail>(
                '/state',
                { office_id: office, property_id: id, page: nextPage },
                c.signal,
              );
              if (c.signal.aborted || !('property' in next)) break;
              acc = {
                ...next,
                parties: mergeById(acc.parties, next.parties),
                records: mergeById(acc.records, next.records),
                loadedPage: nextPage,
                lastPartiesBatch: next.parties.length,
                lastRecordsBatch: next.records.length,
              };
              setDetail(acc);
            } catch (err) {
              if (!c.signal.aborted && err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
                failure(err);
              }
              break;
            }
          }
        } else {
          let acc: AccumulatedProperties = {
            items: first.items,
            loadedPage: 1,
            lastBatchSize: first.items.length,
          };
          setData(acc);

          while (
            !c.signal.aborted &&
            shouldLoadMoreWithoutTotal({
              loadedCount: acc.items.length,
              lastBatchSize: acc.lastBatchSize,
              pageSize: RURAL_BATCH_SIZE,
              maxItems: RURAL_AUTO_LOAD_CAP,
            })
          ) {
            const nextPage = acc.loadedPage + 1;
            try {
              const next = await request<Page | RuralDetail>(
                '/state',
                { office_id: office, property_id: null, page: nextPage },
                c.signal,
              );
              if (c.signal.aborted || 'property' in next) break;
              acc = {
                items: mergeById(acc.items, next.items),
                loadedPage: nextPage,
                lastBatchSize: next.items.length,
              };
              setData(acc);
            } catch (err) {
              if (!c.signal.aborted && err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
                failure(err);
              }
              break;
            }
          }
        }
      } catch (e) {
        if (!c.signal.aborted) failure(e);
      }
    })();

    return () => c.abort();
  }, [office, id, tick, denied, failure]);

  // Load customer options for create / party forms (auto-accumulated batches, no pagination UI)
  useEffect(() => {
    if (!['create', 'party'].includes(view) || denied) return;
    const c = new AbortController();

    void (async () => {
      try {
        const first = await customersApi.search(
          { office_id: office, query, page: 1, size: RURAL_BATCH_SIZE },
          c.signal,
        );
        if (c.signal.aborted) return;
        let items = first.items;
        let total = first.total;
        let currentPage = 1;
        let lastBatch = first.items.length;
        setChoices({ items, total });

        while (
          !c.signal.aborted &&
          shouldLoadMoreByCount({
            loadedCount: items.length,
            total,
            lastBatchSize: lastBatch,
            pageSize: RURAL_BATCH_SIZE,
            maxItems: RURAL_AUTO_LOAD_CAP,
          })
        ) {
          currentPage += 1;
          try {
            const next = await customersApi.search(
              {
                office_id: office,
                query,
                page: currentPage,
                size: RURAL_BATCH_SIZE,
              },
              c.signal,
            );
            if (c.signal.aborted) return;
            items = mergeById(items, next.items);
            total = next.total;
            lastBatch = next.items.length;
            setChoices({ items, total });
          } catch (err) {
            if (!c.signal.aborted && err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
              failure(err);
            }
            break;
          }
        }
      } catch (e) {
        if (!c.signal.aborted) failure(e);
      }
    })();

    return () => c.abort();
  }, [office, view, query, denied, failure]);

  // Load files for selected request in link view (auto-accumulated batches, no pagination UI)
  useEffect(() => {
    if (!selectedRequest || view !== 'link' || denied) return;
    const c = new AbortController();

    void (async () => {
      try {
        const first = await attachmentsApi.search(
          office,
          selectedRequest.id,
          1,
          RURAL_BATCH_SIZE,
          c.signal,
        );
        if (c.signal.aborted) return;
        let items = first.items;
        let total = first.total;
        let currentPage = 1;
        let lastBatch = first.items.length;
        setFiles({ items, total });

        while (
          !c.signal.aborted &&
          shouldLoadMoreByCount({
            loadedCount: items.length,
            total,
            lastBatchSize: lastBatch,
            pageSize: RURAL_BATCH_SIZE,
            maxItems: RURAL_AUTO_LOAD_CAP,
          })
        ) {
          currentPage += 1;
          try {
            const next = await attachmentsApi.search(
              office,
              selectedRequest.id,
              currentPage,
              RURAL_BATCH_SIZE,
              c.signal,
            );
            if (c.signal.aborted) return;
            items = mergeById(items, next.items);
            total = next.total;
            lastBatch = next.items.length;
            setFiles({ items, total });
          } catch (err) {
            if (!c.signal.aborted && err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
              failure(err);
            }
            break;
          }
        }
      } catch (e) {
        if (!c.signal.aborted) failure(e);
      }
    })();

    return () => c.abort();
  }, [office, view, selectedRequest, denied, failure]);

  const loadMoreProperties = useCallback(async () => {
    if (
      !data ||
      id !== null ||
      denied ||
      loadingMoreListRef.current ||
      !shouldLoadMoreWithoutTotal({
        loadedCount: data.items.length,
        lastBatchSize: data.lastBatchSize,
        pageSize: RURAL_BATCH_SIZE,
      })
    ) {
      return;
    }
    loadingMoreListRef.current = true;
    const nextPage = data.loadedPage + 1;
    const signal = listController.current?.signal;
    try {
      const next = await request<Page | RuralDetail>(
        '/state',
        { office_id: office, property_id: null, page: nextPage },
        signal,
      );
      if (signal?.aborted || 'property' in next) return;
      setData(prev =>
        prev
          ? {
              items: mergeById(prev.items, next.items),
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
            }
          : prev,
      );
    } catch (err) {
      if (!signal?.aborted && err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
        failure(err);
      }
    } finally {
      loadingMoreListRef.current = false;
    }
  }, [data, id, denied, office, failure]);

  const loadMoreDetail = useCallback(async () => {
    if (
      !detail ||
      !id ||
      denied ||
      loadingMoreDetailRef.current ||
      (!shouldLoadMoreByCount({
        loadedCount: detail.parties.length,
        total: detail.parties_total,
        lastBatchSize: detail.lastPartiesBatch,
        pageSize: RURAL_BATCH_SIZE,
      }) &&
        !shouldLoadMoreByCount({
          loadedCount: detail.records.length,
          total: detail.records_total,
          lastBatchSize: detail.lastRecordsBatch,
          pageSize: RURAL_BATCH_SIZE,
        }))
    ) {
      return;
    }
    loadingMoreDetailRef.current = true;
    const nextPage = detail.loadedPage + 1;
    const signal = detailController.current?.signal;
    try {
      const next = await request<Page | RuralDetail>(
        '/state',
        { office_id: office, property_id: id, page: nextPage },
        signal,
      );
      if (signal?.aborted || !('property' in next)) return;
      setDetail(prev =>
        prev
          ? {
              ...next,
              parties: mergeById(prev.parties, next.parties),
              records: mergeById(prev.records, next.records),
              loadedPage: nextPage,
              lastPartiesBatch: next.parties.length,
              lastRecordsBatch: next.records.length,
            }
          : prev,
      );
    } catch (err) {
      if (!signal?.aborted && err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
        failure(err);
      }
    } finally {
      loadingMoreDetailRef.current = false;
    }
  }, [detail, id, denied, office, failure]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreProperties();
      }
    },
    [loadMoreProperties],
  );

  const handleDetailScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreDetail();
      }
    },
    [loadMoreDetail],
  );

  const failPicker = useCallback(
    (e: Error) => {
      if ('status' in e && (e.status === 401 || e.status === 403)) {
        failure(new CommercialError(Number(e.status)));
      } else {
        setError(e.message);
      }
    },
    [failure],
  );

  async function save() {
    if (flight.current || denied) return;
    let command: unknown;
    if (view === 'create') {
      command = {
        kind: 'create',
        customer_id: customer?.id,
        name,
        municipality: city,
        state,
        location,
        identifiers: identifier ? { [identifierKind]: identifier } : {},
      };
    } else if (view === 'party') {
      command = {
        kind: 'party',
        expected_version: detail?.property.version,
        customer_id: customer?.id,
        role,
        valid_from: from,
        valid_until: until || null,
      };
    } else if (view === 'end_party') {
      command = {
        kind: 'end_party',
        expected_version: detail?.property.version,
        party_id: party,
        valid_until: until,
      };
    } else {
      command = {
        kind: 'link',
        expected_version: detail?.property.version,
        request_id: selectedRequest?.id,
        file_id: file || null,
        exercise: exercise ? Number(exercise) : null,
      };
    }

    const attempt = pending.current ?? {
      body: { office_id: office, property_id: id, command },
      key: crypto.randomUUID(),
    };
    pending.current = attempt;
    flight.current = true;
    setBusy(true);
    setError('');
    const c = new AbortController();
    controller.current = c;
    try {
      const result = await request<{ id: string }>(
        '/command',
        { ...(attempt.body as object), key: attempt.key },
        c.signal,
      );
      if (!alive.current) return;
      pending.current = null;
      setId(result.id);
      setView('detail');
      setCustomer(undefined);
      setTick(t => t + 1);
    } catch (e) {
      if (alive.current) {
        failure(e);
        if (e instanceof CommercialError && e.status !== 503) {
          pending.current = null;
          if (e.status === 409) {
            setView('detail');
            setTick(t => t + 1);
          }
        }
      }
    } finally {
      if (alive.current) {
        flight.current = false;
        setBusy(false);
      }
    }
  }

  const roles = ruralRoles as Record<string, string>;
  const filteredItems = useMemo(
    () => (data ? filterRuralProperties(data.items, filterInput) : []),
    [data, filterInput],
  );
  const hasMoreProperties =
    !!data &&
    !filterInput.trim() &&
    data.lastBatchSize >= RURAL_BATCH_SIZE;

  const canSubmit =
    !busy &&
    (!!pending.current ||
      (view === 'create'
        ? !!customer && !!name.trim() && !!city.trim() && state.length === 2
        : view === 'party'
          ? !!customer && !!from
          : view === 'end_party'
            ? !!party && !!until
            : !!selectedRequest));

  if (denied) {
    return (
      <div className="rural-list-card">
        <div className="rural-list-empty">
          <p role="alert" className="form-feedback error">
            Acesso indisponível. Entre novamente ou confira suas permissões.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="rural-workspace">
      {error && (
        <p className="form-feedback error rural-inline-feedback" role="alert">
          {error}
        </p>
      )}

      {view === 'list' ? (
        <>
          <section
            className="customers-toolbar-section rural-toolbar-section"
            aria-label="Filtro e ações de imóveis rurais"
          >
            <div className="customer-search-form">
              <label className="customers-search-label" htmlFor="rural-search">
                Filtrar por nome, município ou UF
              </label>
              <div className="customers-toolbar-row">
                <div className="customers-search-input-group">
                  <input
                    id="rural-search"
                    type="search"
                    autoComplete="off"
                    maxLength={120}
                    placeholder="Buscar imóvel cadastrado..."
                    value={filterInput}
                    disabled={locked}
                    onChange={e => setFilterInput(e.target.value)}
                  />
                </div>
                <div className="customers-toolbar-actions">
                  <button
                    type="button"
                    className="customers-circle-btn"
                    aria-label="Atualizar"
                    title="Atualizar"
                    disabled={locked}
                    onClick={() => {
                      setError('');
                      setTick(t => t + 1);
                    }}
                  >
                    <RefreshCw size={18} aria-hidden="true" />
                  </button>
                  {create && (
                    <button
                      type="button"
                      className="customers-primary-btn"
                      disabled={locked}
                      onClick={() => {
                        setCustomer(undefined);
                        setQueryInput('');
                        setQuery('');
                        setError('');
                        setView('create');
                      }}
                    >
                      <Plus size={18} aria-hidden="true" />
                      <span>Cadastrar imóvel</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <article
            className="rural-list-card"
            aria-label="Quadro de imóveis rurais cadastrados"
          >
            <div className="customers-list-head">
              <span className="customers-list-kicker">Imóveis cadastrados</span>
              <span className="customers-list-count">
                {data
                  ? formatRuralCount(filteredItems.length, hasMoreProperties)
                  : '—'}
              </span>
            </div>

            {data ? (
              filteredItems.length > 0 ? (
                <ul
                  className="customers-scroll-list rural-scroll-list"
                  aria-label="Lista de imóveis rurais"
                  onScroll={handleListScroll}
                >
                  {filteredItems.map(p => (
                    <li className="customers-list-row rural-list-row" key={p.id}>
                      <div className="customers-row-copy">
                        <strong>{p.name}</strong>
                        <small>
                          {p.municipality}/{p.state}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="rural-row-open-btn"
                        disabled={locked}
                        onClick={() => {
                          setId(p.id);
                          setDetail(undefined);
                          setError('');
                          setView('detail');
                        }}
                      >
                        <Eye size={16} aria-hidden="true" />
                        <span>Abrir imóvel</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="customers-list-empty rural-list-empty">
                  <p className="team-empty">
                    {data.items.length === 0
                      ? 'Nenhum imóvel cadastrado neste acesso.'
                      : 'Nenhum imóvel encontrado. Ajuste o filtro.'}
                  </p>
                </div>
              )
            ) : (
              <div className="customers-list-empty rural-list-empty" />
            )}

            <div className="customers-list-footer">
              <span>
                {data
                  ? formatRuralTotal(filteredItems.length, hasMoreProperties)
                  : 'Total: —'}
              </span>
            </div>
          </article>
        </>
      ) : (
        <>
          <div className="customers-subview-bar rural-subview-bar">
            <button
              type="button"
              data-operation-local-return
              className="customers-subview-back"
              disabled={locked}
              onClick={() => {
                setId(null);
                setDetail(undefined);
                setError('');
                setView('list');
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Voltar à lista
            </button>
            <div className="customers-subview-actions">
              <button
                type="button"
                className="customers-circle-btn"
                aria-label="Atualizar"
                title="Atualizar"
                disabled={locked}
                onClick={() => {
                  setError('');
                  setTick(t => t + 1);
                }}
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="customers-subview-card rural-subview-card">
            {id && detail && (
              <div className="rural-property-header">
                <div className="rural-property-meta">
                  <h2>{detail.property.name}</h2>
                  <p>
                    {detail.property.municipality}/{detail.property.state}
                    {detail.property.location
                      ? ` · ${detail.property.location}`
                      : ''}
                  </p>
                  {Object.keys(detail.property.identifiers).length > 0 && (
                    <p className="rural-property-ids">
                      {Object.entries(detail.property.identifiers)
                        .map(([k, v]) => `${k.toUpperCase()}: ${v}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <label className="team-field rural-area-select">
                  <span>Área do imóvel</span>
                  <select
                    value={view}
                    disabled={locked}
                    onChange={e => {
                      setView(e.target.value);
                      setCustomer(undefined);
                      setQueryInput('');
                      setQuery('');
                      setError('');
                    }}
                  >
                    <option value="detail">Pessoas e histórico</option>
                    {update && (
                      <>
                        <option value="party">
                          Adicionar pessoa e período
                        </option>
                        <option value="end_party">
                          Encerrar período de pessoa
                        </option>
                      </>
                    )}
                    {canLink && (
                      <option value="link">
                        Vincular atendimento ou arquivo
                      </option>
                    )}
                    {canReadDitr && (
                      <option value="ditr">ITR/DITR por exercício</option>
                    )}
                  </select>
                </label>
              </div>
            )}

            <div
              className="customers-subview-scroll rural-subview-scroll"
              onScroll={view === 'detail' ? handleDetailScroll : undefined}
            >
              {view === 'ditr' && id && (
                <DitrPanel
                  office={office}
                  propertyId={id}
                  canManage={canManageDitr}
                  canReadFiles={canReadFiles}
                  refreshVersion={tick}
                  onPendingChange={setDitrLocked}
                />
              )}

              {view === 'detail' && detail && (
                <div className="rural-detail-grid">
                  <section
                    className="rural-detail-panel"
                    aria-label="Pessoas vinculadas"
                  >
                    <div className="rural-panel-head">
                      <h3>Pessoas vinculadas</h3>
                      <span className="rural-panel-count">
                        {formatCountLabel(
                          detail.parties_total,
                          'pessoa',
                          'pessoas',
                        )}
                      </span>
                    </div>
                    {detail.parties.length > 0 ? (
                      <ul className="rural-item-list">
                        {detail.parties.map(p => (
                          <li key={p.id} className="rural-item-row">
                            <strong>{p.name}</strong>
                            <small>
                              {roles[p.role]} · {p.valid_from} até{' '}
                              {p.valid_until ?? 'sem término registrado'}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="customer-note">
                        Nenhuma pessoa vinculada neste imóvel.
                      </p>
                    )}
                  </section>

                  <section
                    className="rural-detail-panel"
                    aria-label="Histórico por exercício"
                  >
                    <div className="rural-panel-head">
                      <h3>Histórico por exercício</h3>
                      <span className="rural-panel-count">
                        {formatCountLabel(
                          detail.records_total,
                          'registro',
                          'registros',
                        )}
                      </span>
                    </div>
                    {detail.records.length > 0 ? (
                      <ul className="rural-item-list">
                        {detail.records.map(r => (
                          <li key={r.id} className="rural-item-row">
                            <strong>
                              Exercício {r.exercise ?? 'não informado'}
                            </strong>
                            <small>
                              Atendimento vinculado ·{' '}
                              {r.file_id
                                ? 'Arquivo vinculado'
                                : 'Sem arquivo adicional'}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="customer-note">
                        Nenhum atendimento vinculado registrado.
                      </p>
                    )}
                  </section>
                </div>
              )}

              {['create', 'party'].includes(view) && (
                <fieldset disabled={locked} className="rural-form-fieldset">
                  <legend>
                    {view === 'create'
                      ? 'Cadastro do imóvel'
                      : 'Pessoa e vínculo'}
                  </legend>
                  <label className="team-field">
                    Buscar cliente
                    <input
                      disabled={locked}
                      value={queryInput}
                      onChange={e => setQueryInput(e.target.value)}
                      maxLength={120}
                      placeholder="Digite nome, CPF ou CNPJ..."
                    />
                  </label>
                  <label className="team-field">
                    Cliente selecionado
                    <select
                      value={customer?.id ?? ''}
                      onChange={e =>
                        setCustomer(
                          choices?.items.find(c => c.id === e.target.value),
                        )
                      }
                    >
                      <option value="">
                        {choices && choices.items.length === 0
                          ? 'Nenhum cliente encontrado'
                          : 'Selecione'}
                      </option>
                      {choices?.items.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.identifier_masked ?? 'Sem identificador'}
                        </option>
                      ))}
                    </select>
                  </label>
                  {choices && choices.total > RURAL_AUTO_LOAD_CAP && (
                    <p className="customer-note rural-form-wide">
                      Exibindo {choices.items.length} de {choices.total}{' '}
                      clientes. Digite na busca acima para filtrar.
                    </p>
                  )}

                  {view === 'create' ? (
                    <>
                      <label className="team-field">
                        Nome do imóvel
                        <input
                          disabled={locked}
                          maxLength={120}
                          value={name}
                          onChange={e => setName(e.target.value)}
                        />
                      </label>
                      <label className="team-field">
                        Município
                        <input
                          disabled={locked}
                          maxLength={120}
                          value={city}
                          onChange={e => setCity(e.target.value)}
                        />
                      </label>
                      <label className="team-field">
                        UF
                        <input
                          disabled={locked}
                          maxLength={2}
                          value={state}
                          onChange={e => setState(e.target.value.toUpperCase())}
                        />
                      </label>
                      <label className="team-field">
                        Localização ou referência
                        <input
                          disabled={locked}
                          maxLength={500}
                          value={location}
                          onChange={e => setLocation(e.target.value)}
                        />
                      </label>
                      <label className="team-field rural-form-wide">
                        Identificador (opcional)
                        <div className="rural-identifier-pair">
                          <select
                            value={identifierKind}
                            onChange={e => setIdentifierKind(e.target.value)}
                          >
                            {['cafir', 'sncr', 'car', 'registry'].map(k => (
                              <option key={k} value={k}>
                                {k.toUpperCase()}
                              </option>
                            ))}
                          </select>
                          <input
                            disabled={locked}
                            maxLength={120}
                            value={identifier}
                            onChange={e => setIdentifier(e.target.value)}
                            placeholder="Número do identificador"
                          />
                        </div>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="team-field">
                        Papel
                        <select
                          value={role}
                          onChange={e => setRole(e.target.value)}
                        >
                          {Object.entries(roles).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="team-field">
                        Início
                        <input
                          disabled={locked}
                          type="date"
                          value={from}
                          onChange={e => setFrom(e.target.value)}
                        />
                      </label>
                      <label className="team-field">
                        Término (opcional)
                        <input
                          disabled={locked}
                          type="date"
                          value={until}
                          onChange={e => setUntil(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </fieldset>
              )}

              {view === 'end_party' && (
                <fieldset disabled={locked} className="rural-form-fieldset">
                  <legend>Encerrar período de pessoa</legend>
                  <label className="team-field">
                    Período a encerrar
                    <select
                      disabled={locked}
                      value={party}
                      onChange={e => setParty(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      {detail?.parties
                        .filter(p => !p.valid_until)
                        .map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} · {roles[p.role]} · {p.valid_from}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="team-field">
                    Término
                    <input
                      disabled={locked}
                      type="date"
                      value={until}
                      onChange={e => setUntil(e.target.value)}
                    />
                  </label>
                </fieldset>
              )}

              {view === 'link' && (
                <fieldset disabled={locked} className="rural-form-fieldset">
                  <legend>Vincular atendimento ou arquivo</legend>
                  <div className="rural-form-wide">
                    <AttachmentRequestPicker
                      office={office}
                      size={5}
                      value={selectedRequest}
                      client={false}
                      busy={locked}
                      onSelect={v => {
                        setRequest(v);
                        setFiles(undefined);
                        setFile('');
                      }}
                      onFailure={failPicker}
                    />
                  </div>
                  <label className="team-field">
                    Arquivo do atendimento (opcional)
                    <select
                      disabled={locked}
                      value={file}
                      onChange={e => setFile(e.target.value)}
                    >
                      <option value="">Somente atendimento</option>
                      {files?.items.map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="team-field">
                    Exercício (opcional)
                    <input
                      disabled={locked}
                      type="number"
                      min={1900}
                      max={2200}
                      value={exercise}
                      onChange={e => setExercise(e.target.value)}
                    />
                  </label>
                </fieldset>
              )}
            </div>

            {!['list', 'detail', 'ditr'].includes(view) && (
              <div className="customers-subview-footer rural-subview-footer">
                {pending.current && (
                  <p className="customer-note" role="status">
                    Resultado ainda não confirmado. Salvar registro repete a
                    mesma tentativa.
                  </p>
                )}
                <button
                  type="button"
                  className="customers-primary-btn customer-submit"
                  disabled={!canSubmit}
                  onClick={() => void save()}
                >
                  Salvar registro
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
