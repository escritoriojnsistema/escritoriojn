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
import type {
  CustomerDetail,
  CustomerInput,
  CustomerSummary,
} from '../../../shared/customers';
import { formatCnpj, formatCpf } from '../../../shared/identifiers';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { CustomerForm } from './CustomerForm';
import { customersApi, customersError, CustomersError } from './api';
import {
  CUSTOMERS_AUTO_LOAD_CAP,
  CUSTOMERS_BATCH_SIZE,
  formatCustomersResultCount,
  formatCustomersTotal,
  getCustomerKindLabel,
  mergeCustomerPages,
  shouldLoadMoreCustomerPages,
} from './customersListModel';
import '../team/team.css';
import './customers.css';
import { RelationsPanel } from '../customer-relations/RelationsPanel';

type View =
  | { kind: 'relations'; id: string }
  | { kind: 'list' }
  | { kind: 'create' }
  | { kind: 'detail'; id: string; data?: CustomerDetail }
  | { kind: 'edit'; data: CustomerDetail };

type AccumulatedCustomers = {
  items: CustomerSummary[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export default function CustomersPage() {
  const auth = useAuth();
  const location = useLocation();
  const contexts = auth.contexts.filter(
    context =>
      context.role_code !== 'client' &&
      context.permissions.includes('customers.read'),
  );
  const [selectedOffice, setSelectedOffice] = useState(
    typeof location.state?.office_id === 'string' ? location.state.office_id : '',
  );
  const context =
    contexts.find(item => item.office_id === selectedOffice) ?? contexts[0];
  const office = context?.office_id ?? '';
  const canCreate = context?.permissions.includes('customers.create') ?? false;
  const canUpdate = context?.permissions.includes('customers.update') ?? false;
  const scope = `${auth.sessionKey}:${auth.status}:${office}:${
    context?.user_id ?? ''
  }:${context?.role_code ?? ''}:${
    context?.permissions.slice().sort().join(',') ?? ''
  }`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const [revision, setRevision] = useState(0);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [operationError, setOperationError] = useState<CustomersError>();

  const listKey = `${scope}:${query}:${revision}`;
  const [resource, setResource] = useState<{
    key: string;
    data?: AccumulatedCustomers;
    error?: CustomersError;
  }>({ key: '' });

  useEffect(
    () => () => {
      generation.current++;
      pending.current?.abort();
      listController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(queryInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    if (view.kind !== 'list' || auth.status !== 'authorized') return;
    function refresh() {
      if (document.visibilityState === 'visible') {
        setRevision(value => value + 1);
      }
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [view.kind, auth.status]);

  useEffect(() => {
    if (!office || auth.status !== 'authorized' || view.kind !== 'list') return;
    const controller = new AbortController();
    listController.current?.abort();
    listController.current = controller;
    loadingMoreRef.current = false;

    void (async () => {
      try {
        const first = await customersApi.search(
          { office_id: office, query, page: 1, size: CUSTOMERS_BATCH_SIZE },
          controller.signal,
        );
        if (controller.signal.aborted || scopeRef.current !== scope) return;

        let accumulated: AccumulatedCustomers = {
          items: first.items,
          total: first.total,
          loadedPage: 1,
          lastBatchSize: first.items.length,
        };
        setResource({ key: listKey, data: accumulated });

        while (
          !controller.signal.aborted &&
          scopeRef.current === scope &&
          shouldLoadMoreCustomerPages({
            loadedCount: accumulated.items.length,
            total: accumulated.total,
            lastBatchSize: accumulated.lastBatchSize,
            pageSize: CUSTOMERS_BATCH_SIZE,
            maxItems: CUSTOMERS_AUTO_LOAD_CAP,
          })
        ) {
          const nextPage = accumulated.loadedPage + 1;
          try {
            const next = await customersApi.search(
              {
                office_id: office,
                query,
                page: nextPage,
                size: CUSTOMERS_BATCH_SIZE,
              },
              controller.signal,
            );
            if (controller.signal.aborted || scopeRef.current !== scope) return;
            accumulated = {
              items: mergeCustomerPages(accumulated.items, next.items),
              total: next.total,
              loadedPage: nextPage,
              lastBatchSize: next.items.length,
            };
            setResource({ key: listKey, data: accumulated });
          } catch (cause) {
            if (controller.signal.aborted || scopeRef.current !== scope) return;
            const failure = customersError(cause);
            if (failure.status === 401 || failure.status === 403) {
              setResource({ key: listKey, error: failure });
            }
            break;
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted && scopeRef.current === scope) {
          setResource({ key: listKey, error: customersError(cause) });
        }
      }
    })();

    return () => controller.abort();
  }, [office, auth.status, scope, listKey, query, view.kind]);

  const loadMoreCustomers = useCallback(async () => {
    const current = resource.key === listKey ? resource.data : undefined;
    if (
      !current ||
      !office ||
      auth.status !== 'authorized' ||
      view.kind !== 'list' ||
      loadingMoreRef.current
    ) {
      return;
    }
    if (
      !shouldLoadMoreCustomerPages({
        loadedCount: current.items.length,
        total: current.total,
        lastBatchSize: current.lastBatchSize,
        pageSize: CUSTOMERS_BATCH_SIZE,
      })
    ) {
      return;
    }
    loadingMoreRef.current = true;
    const nextPage = current.loadedPage + 1;
    const signal = listController.current?.signal;
    try {
      const next = await customersApi.search(
        { office_id: office, query, page: nextPage, size: CUSTOMERS_BATCH_SIZE },
        signal,
      );
      if (signal?.aborted || scopeRef.current !== scope) return;
      setResource(prev => {
        if (prev.key !== listKey || !prev.data) return prev;
        return {
          key: listKey,
          data: {
            items: mergeCustomerPages(prev.data.items, next.items),
            total: next.total,
            loadedPage: nextPage,
            lastBatchSize: next.items.length,
          },
        };
      });
    } catch (cause) {
      if (!signal?.aborted && scopeRef.current === scope) {
        const failure = customersError(cause);
        if (failure.status === 401 || failure.status === 403) {
          setResource({ key: listKey, error: failure });
        }
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [resource, listKey, office, auth.status, view.kind, query, scope]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreCustomers();
      }
    },
    [loadMoreCustomers],
  );

  useEffect(() => {
    if (
      view.kind !== 'detail' ||
      view.data ||
      !office ||
      auth.status !== 'authorized'
    ) {
      return;
    }
    const id = view.id;
    const started = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    void customersApi
      .detail(office, id, controller.signal)
      .then(data => {
        if (
          !controller.signal.aborted &&
          scopeRef.current === scope &&
          generation.current === started
        ) {
          pending.current = null;
          setBusy(false);
          setView({ kind: 'detail', id, data });
        }
      })
      .catch(cause => {
        if (
          !controller.signal.aborted &&
          scopeRef.current === scope &&
          generation.current === started
        ) {
          setOperationError(customersError(cause));
        }
      })
      .finally(() => {
        if (pending.current === controller) {
          pending.current = null;
          setBusy(false);
        }
      });
    return () => {
      controller.abort();
      if (pending.current === controller) pending.current = null;
    };
  }, [view, office, auth.status, scope]);

  const data = resource.key === listKey ? resource.data : undefined;
  const error = resource.key === listKey ? resource.error : undefined;
  const fatal = [error, operationError].find(
    item => item?.status === 401 || item?.status === 403,
  );

  function transition(next: View) {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setOperationError(undefined);
    setFeedback('');
    setView(next);
  }

  function back() {
    transition({ kind: 'list' });
    setRevision(value => value + 1);
  }

  function reload() {
    transition({ kind: 'list' });
    setRevision(value => value + 1);
  }

  function changeOffice(next: string) {
    transition({ kind: 'list' });
    setSelectedOffice(next);
    setQuery('');
    setQueryInput('');
  }

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(queryInput.trim());
    setRevision(value => value + 1);
    setOperationError(undefined);
    setFeedback('');
  }

  async function save(input: CustomerInput) {
    if (
      busy ||
      !context ||
      (view.kind !== 'create' && view.kind !== 'edit') ||
      (view.kind === 'create'
        ? !canCreate
        : !canUpdate || !view.data.can_update)
    ) {
      return;
    }
    const editing = view.kind === 'edit' ? view.data : undefined;
    const started = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setOperationError(undefined);
    setFeedback('');
    try {
      const result = editing
        ? await customersApi.update(
            office,
            editing.id,
            input,
            editing.version,
            controller.signal,
          )
        : await customersApi.create(office, input, controller.signal);
      if (
        controller.signal.aborted ||
        scopeRef.current !== scope ||
        generation.current !== started
      ) {
        return;
      }
      setView({ kind: 'detail', id: result.id, data: result });
      setFeedback(editing ? 'Ficha atualizada.' : 'Cliente cadastrado.');
      setRevision(value => value + 1);
    } catch (cause) {
      if (
        !controller.signal.aborted &&
        scopeRef.current === scope &&
        generation.current === started
      ) {
        setOperationError(customersError(cause));
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

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

  const selected = view.kind === 'detail' ? view.data : undefined;
  const title =
    view.kind === 'relations'
      ? 'Vínculos do cliente'
      : view.kind === 'list'
        ? 'Clientes'
        : view.kind === 'create'
          ? 'Novo cliente'
          : view.kind === 'edit'
            ? 'Editar cliente'
            : 'Ficha do cliente';

  const officeSelector =
    contexts.length > 1 ? (
      <label className="customers-office-select" htmlFor="customers-office">
        <span>Escritório</span>
        <select
          id="customers-office"
          disabled={busy}
          value={office}
          onChange={event => changeOffice(event.target.value)}
        >
          {contexts.map(item => (
            <option key={item.office_id} value={item.office_id}>
              {item.office_name}
            </option>
          ))}
        </select>
      </label>
    ) : undefined;

  return (
    <OperationLayout office={office} busy={busy} viewportLock>
      <div className="customers-main is-viewport-screen">
        <OperationHeading
          context={context}
          title={title}
          description={
            view.kind === 'list'
              ? 'Cadastre e consulte as fichas do escritório.'
              : 'Ficha de atendimento, independente da conta de acesso.'
          }
          showRole={false}
          action={officeSelector}
        />

        {fatal ? (
          <div className="customers-list-card">
            <div className="customers-list-empty">
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
                    className="primary-button"
                    onClick={() => {
                      reload();
                      auth.refresh();
                    }}
                  >
                    <RefreshCw size={18} aria-hidden="true" />
                    Verificar acesso novamente
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {view.kind !== 'list' && (
              <div className="customers-subview-bar">
                <button
                  type="button"
                  data-operation-local-return
                  className="customers-subview-back"
                  disabled={busy}
                  onClick={back}
                >
                  <ArrowLeft size={16} aria-hidden="true" />
                  Voltar à lista
                </button>
                <div className="customers-subview-actions">
                  {selected &&
                    (selected.source !== 'client_registration' ||
                      selected.materialized) && (
                      <button
                        type="button"
                        className="customers-subview-action"
                        onClick={() =>
                          transition({ kind: 'relations', id: selected.id })
                        }
                      >
                        Vínculos
                      </button>
                    )}
                  {selected && canUpdate && selected.can_update && (
                    <button
                      type="button"
                      className="customers-subview-action is-primary"
                      onClick={() =>
                        transition({ kind: 'edit', data: selected })
                      }
                    >
                      <Pencil size={15} aria-hidden="true" />
                      Editar cliente
                    </button>
                  )}
                </div>
              </div>
            )}

            {feedback && (
              <p
                className="form-feedback customers-inline-feedback"
                role="status"
              >
                {feedback}
              </p>
            )}

            {operationError && (
              <div className="customer-error customers-inline-error">
                <p className="form-feedback error" role="alert">
                  {operationError.message}
                </p>
                {operationError.status === 409 &&
                  operationError.code !== 'CUSTOMER_DUPLICATE' &&
                  view.kind === 'edit' && (
                    <button
                      type="button"
                      className="team-text-button"
                      onClick={() =>
                        transition({ kind: 'detail', id: view.data.id })
                      }
                    >
                      Reabrir ficha
                    </button>
                  )}
                {view.kind === 'detail' && operationError.status !== 404 && (
                  <button
                    type="button"
                    className="team-text-button"
                    onClick={() => {
                      setOperationError(undefined);
                      setView({ kind: 'detail', id: view.id });
                    }}
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}

            {view.kind === 'relations' ? (
              <div className="customers-subview-card">
                <div className="customers-subview-scroll">
                  <RelationsPanel
                    key={`${scope}:${view.id}`}
                    office={office}
                    customerId={view.id}
                    onPendingChange={setBusy}
                    auditAllowed={context.permissions.includes('audit.read')}
                    onExit={back}
                    onFatal={err => {
                      setResource({ key: '' });
                      setOperationError(err);
                    }}
                  />
                </div>
              </div>
            ) : view.kind === 'create' || view.kind === 'edit' ? (
              <CustomerForm
                key={`${office}:${view.kind}:${
                  view.kind === 'edit' ? view.data.id : ''
                }`}
                customer={view.kind === 'edit' ? view.data : undefined}
                busy={busy}
                onSave={input => void save(input)}
              />
            ) : view.kind === 'detail' ? (
              selected ? (
                <section
                  className="customer-detail customers-subview-card"
                  aria-label="Dados da ficha"
                >
                  <div className="customers-subview-scroll">
                    {selected.source === 'client_registration' && (
                      <p className="customer-note" role="note">
                        {selected.materialized
                          ? 'Cadastro feito pelo cliente. O acesso a documentos internos dependerá de aprovação.'
                          : 'Cadastro feito pelo cliente. Há contato semelhante em ficha interna; a associação depende de conferência.'}
                      </p>
                    )}
                    <dl>
                      <div>
                        <dt>
                          {selected.kind === 'person'
                            ? 'Nome completo'
                            : 'Razão social'}
                        </dt>
                        <dd>{selected.name}</dd>
                      </div>
                      <div>
                        <dt>Tipo de pessoa</dt>
                        <dd>
                          {selected.kind === 'person'
                            ? 'Pessoa física'
                            : 'Pessoa jurídica'}
                        </dd>
                      </div>
                      <div>
                        <dt>{selected.kind === 'person' ? 'CPF' : 'CNPJ'}</dt>
                        <dd>
                          {selected.identifier
                            ? selected.kind === 'person'
                              ? formatCpf(selected.identifier)
                              : formatCnpj(selected.identifier)
                            : 'Não informado'}
                        </dd>
                      </div>
                      <div>
                        <dt>Contatos</dt>
                        <dd>
                          {selected.contacts.length
                            ? selected.contacts.map((contact, index) => (
                                <span
                                  className="customer-detail-contact"
                                  key={index}
                                >
                                  {contact.kind === 'email'
                                    ? 'E-mail'
                                    : 'Telefone'}
                                  : {contact.value}
                                </span>
                              ))
                            : 'Nenhum contato informado'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </section>
              ) : (
                <div className="customers-subview-card" />
              )
            ) : (
              <>
                <section
                  className="customers-toolbar-section"
                  aria-label="Busca e ações de clientes"
                >
                  <form className="customer-search-form" onSubmit={search}>
                    <label
                      className="customers-search-label"
                      htmlFor="customer-search"
                    >
                      Buscar por nome, CPF ou CNPJ
                    </label>
                    <div className="customers-toolbar-row">
                      <div className="customers-search-input-group">
                        <input
                          id="customer-search"
                          type="search"
                          autoComplete="off"
                          maxLength={120}
                          value={queryInput}
                          onChange={event => setQueryInput(event.target.value)}
                        />
                        <button
                          className="customers-circle-btn"
                          type="submit"
                          aria-label="Buscar"
                          title="Buscar"
                        >
                          <Search size={18} aria-hidden="true" />
                        </button>
                      </div>
                      <div className="customers-toolbar-actions">
                        <button
                          className="customers-circle-btn"
                          type="button"
                          aria-label="Atualizar lista"
                          title="Atualizar lista"
                          onClick={reload}
                        >
                          <RefreshCw size={18} aria-hidden="true" />
                        </button>
                        {canCreate && (
                          <button
                            className="customers-primary-btn customer-new"
                            type="button"
                            aria-label="Novo cliente"
                            title="Novo cliente"
                            onClick={() => transition({ kind: 'create' })}
                          >
                            <Plus size={18} aria-hidden="true" />
                            <span>Novo cliente</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </section>

                <article
                  className="customers-list-card"
                  aria-label="Quadro de clientes cadastrados"
                >
                  <div className="customers-list-head">
                    <span className="customers-list-kicker">
                      Clientes cadastrados
                    </span>
                    <span className="customers-list-count">
                      {data ? formatCustomersResultCount(data.total) : '—'}
                    </span>
                  </div>

                  {error ? (
                    <div className="customers-list-empty">
                      <div className="team-empty">
                        <p role="alert" className="form-feedback error">
                          {error.message}
                        </p>
                        <button
                          type="button"
                          className="team-text-button"
                          onClick={reload}
                        >
                          <RefreshCw size={17} aria-hidden="true" />
                          Tentar novamente
                        </button>
                      </div>
                    </div>
                  ) : data ? (
                    data.items.length > 0 ? (
                      <ul
                        className="customers-scroll-list customer-list"
                        aria-label="Clientes do escritório"
                        onScroll={handleListScroll}
                      >
                        {data.items.map(customer => (
                          <li key={customer.id} className="customers-list-row">
                            <div className="customers-row-copy">
                              <strong>{customer.name}</strong>
                              <small>
                                {getCustomerKindLabel(customer)} ·{' '}
                                {customer.identifier_masked ??
                                  'Sem identificador'}
                              </small>
                            </div>
                            <button
                              type="button"
                              className="customers-circle-btn"
                              aria-label={`Ver ficha de ${customer.name}`}
                              title="Ver ficha"
                              onClick={() =>
                                transition({ kind: 'detail', id: customer.id })
                              }
                            >
                              <Eye size={18} aria-hidden="true" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="customers-list-empty">
                        <p className="team-empty">
                          Nenhum cliente encontrado. Confira a busca.
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="customers-list-empty" />
                  )}

                  <div className="customers-list-footer">
                    <span>
                      {data ? formatCustomersTotal(data.total) : 'Total: —'}
                    </span>
                  </div>
                </article>
              </>
            )}
          </>
        )}
      </div>
    </OperationLayout>
  );
}
