import { usePendingNavigation33 } from '../portalIntake/usePendingNavigation33';
import { IntakeCompletion33 } from '../portalIntake/IntakeCompletion33';
import { intakeApi33 } from '../portalIntake/api';
import {
  peekIntakeNonce33,
  keepIntakeNonce33,
  clearIntakeNonce33,
} from '../portalIntake/nonce';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type UIEvent,
} from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import type {
  DocumentPublicOffer,
  DocumentBookingInput,
  DocumentBookingResult,
} from '../../../shared/modelCommercial';
import type { RequestOption } from '../../../shared/requests';
import type { TemplateInput } from '../../../shared/templates';
import type {
  PendingFieldRecord,
  SmartPartyRecord,
  SmartTemplateConfig,
} from '../../../shared/smartDocument';
import { SmartWizard } from '../smartDocuments/SmartWizard';
import { smartDocumentsApi } from '../smartDocuments/api';
import { serviceMoney } from '../../../shared/services';
import { digitsOnly, formatCpf, formatCnpj } from '../../../shared/identifiers';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { RequestPicker } from '../requests/RequestPicker';
import { paths } from '../../app/routes';
import { CommercialError } from './api';
import { modelApi } from './modelApi';
import { catalogApi } from './catalogApi';
import type { CategorizedDocumentOffers } from '../../../shared/publicCatalog';
import {
  formatEntityTotal,
  formatRequestsResultCount,
  mergeItemsByKey,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from '../requests/requestsListModel';
import '../team/team.css';
import '../customers/customers.css';
import '../requests/requests.css';
import '../templates/templates.css';
import '../documents/documents.css';

type AccumulatedCatalog = {
  categories: CategorizedDocumentOffers['categories'];
  folders: CategorizedDocumentOffers['folders'];
  items: CategorizedDocumentOffers['items'];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

export default function DocumentCatalogPage({
  client = false,
  embedded = false,
  fixedOffice,
  categoryId,
  onPendingChange,
}: {
  client?: boolean;
  embedded?: boolean;
  fixedOffice?: string;
  categoryId?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const auth = useAuth();
  const [selected, setSelected] = useState('');
  const contexts = auth.contexts.filter(c =>
    client
      ? c.role_code === 'client'
      : c.role_code !== 'client' &&
        ['requests.read', 'requests.create'].every(p =>
          c.permissions.includes(p),
        ),
  );
  const context =
    contexts.find(c => c.office_id === (fixedOffice ?? selected)) ??
    (fixedOffice ? undefined : contexts[0]);

  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') {
    return <Navigate replace to={client ? paths.client : paths.team} />;
  }
  if (auth.status !== 'authorized' || !context) {
    return (
      <OperationalFeedback
        status={auth.status === 'unavailable' ? 'unavailable' : 'denied'}
      />
    );
  }
  return (
    <Catalog
      key={`${auth.sessionKey}:${context.office_id}:${categoryId ?? ''}:${context.permissions.join(',')}`}
      context={context}
      contexts={contexts}
      onOffice={setSelected}
      client={client}
      embedded={embedded}
      fixedOffice={!!fixedOffice}
      categoryId={categoryId}
      onPendingChange={onPendingChange}
    />
  );
}

function Catalog({
  context,
  contexts,
  onOffice,
  client,
  embedded,
  fixedOffice,
  categoryId,
  onPendingChange,
}: {
  context: AccessContext;
  contexts: AccessContext[];
  onOffice: (id: string) => void;
  client: boolean;
  embedded: boolean;
  fixedOffice: boolean;
  categoryId?: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const sessionKey = useAuth().sessionKey;
  const office = context.office_id;
  const [serviceAnswers, setServiceAnswers] = useState<Record<string, string>>(
    {},
  );
  const [quantity, setQuantity] = useState('1');
  const [clientMessage, setClientMessage] = useState('');
  const [completionPending, setCompletionPending] = useState(false);
  const [resumeBlocked, setResumeBlocked] = useState(false);
  const [resumeTick, setResumeTick] = useState(0);
  const [list, setList] = useState<AccumulatedCatalog>();
  const [offer, setOffer] = useState<DocumentPublicOffer>();
  const [smartConfig, setSmartConfig] = useState<SmartTemplateConfig | null>(
    null,
  );
  const [smartMode, setSmartMode] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [category, setCategory] = useState(categoryId ?? '');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [result, setResult] = useState<DocumentBookingResult>();
  const [origin, setOrigin] = useState<'presencial' | 'whatsapp'>('presencial');
  const [customer, setCustomer] = useState<RequestOption>();
  const [assignee, setAssignee] = useState<RequestOption>();

  const onPending = useRef(onPendingChange);
  onPending.current = onPendingChange;
  const alive = useRef(true);
  const flight = useRef(false);
  const loadingMore = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const attempt = useRef<{ value: DocumentBookingInput; key: string } | null>(
    null,
  );
  const smartPayload = useRef<{
    initial_answers: Record<string, string>;
    answers: Record<string, string>;
    parties: SmartPartyRecord[];
    pending_fields: PendingFieldRecord[];
  }>({ initial_answers: {}, answers: {}, parties: [], pending_fields: [] });

  const filterKey = `${office}:${folder}:${category}:${query}:${tick}`;
  const activeKeyRef = useRef(filterKey);
  activeKeyRef.current = filterKey;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    onPending.current?.(
      busy || !!attempt.current || resumeBlocked || completionPending,
    );
  }, [busy, error, resumeBlocked, completionPending]);

  useEffect(() => () => onPending.current?.(false), []);

  const fail = useCallback(
    (e: unknown) => {
      const status =
        e instanceof CommercialError
          ? e.status
          : e && typeof e === 'object' && 'status' in e
            ? Number(e.status)
            : 503;
      setError(
        e instanceof Error
          ? e.message
          : 'Não foi possível consultar o catálogo.',
      );
      if ([401, 403].includes(status)) {
        clearIntakeNonce33(sessionKey, office);
        setBlocked(true);
        setList(undefined);
        setOffer(undefined);
        setResult(undefined);
        setAnswers({});
        setServiceAnswers({});
        setClientMessage('');
        attempt.current = null;
        setResumeBlocked(false);
      }
      if (status === 409) setConflict(true);
      if (status !== 503) attempt.current = null;
    },
    [office, sessionKey],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(input.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  const loadMore = useCallback(
    (nextPage: number, expectedKey: string) => {
      if (
        loadingMore.current ||
        offer ||
        blocked ||
        result ||
        activeKeyRef.current !== expectedKey
      ) {
        return;
      }
      loadingMore.current = true;
      void catalogApi
        .offers(
          office,
          ['', 'unfiled'].includes(folder) ? null : folder,
          folder === 'unfiled',
          query,
          nextPage,
          REQUESTS_BATCH_SIZE,
          category || null,
        )
        .then(v => {
          if (activeKeyRef.current !== expectedKey) return;
          setList(prev => {
            if (!prev) return prev;
            return {
              categories: v.categories,
              folders: v.folders,
              items: mergeItemsByKey(
                prev.items,
                v.items,
                item => item.template_id,
              ),
              total: v.total,
              loadedPage: nextPage,
              lastBatchSize: v.items.length,
            };
          });
        })
        .catch(() => {
          // Keep currently loaded catalog offers.
        })
        .finally(() => {
          if (activeKeyRef.current === expectedKey) {
            loadingMore.current = false;
          }
        });
    },
    [office, folder, query, category, offer, blocked, result],
  );

  useEffect(() => {
    if (offer || blocked || result) return;
    loadingMore.current = false;
    const c = new AbortController();
    const expectedKey = filterKey;
    void catalogApi
      .offers(
        office,
        ['', 'unfiled'].includes(folder) ? null : folder,
        folder === 'unfiled',
        query,
        1,
        REQUESTS_BATCH_SIZE,
        category || null,
        c.signal,
      )
      .then(v => {
        if (!c.signal.aborted) {
          setList({
            categories: v.categories,
            folders: v.folders,
            items: v.items,
            total: v.total,
            loadedPage: 1,
            lastBatchSize: v.items.length,
          });
        }
      })
      .catch(e => {
        if (!c.signal.aborted) fail(e);
      });
    return () => {
      c.abort();
      if (activeKeyRef.current === expectedKey) {
        loadingMore.current = false;
      }
    };
  }, [office, query, folder, category, filterKey, offer, blocked, result, fail]);

  useEffect(() => {
    if (offer || blocked || result || !list) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: list.items.length,
        total: list.total,
        lastBatchSize: list.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
        maxItems: REQUESTS_AUTO_LOAD_CAP,
      })
    ) {
      loadMore(list.loadedPage + 1, filterKey);
    }
  }, [offer, blocked, result, list, filterKey, loadMore]);

  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 500) {
        last = Date.now();
        setTick(n => n + 1);
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useEffect(() => {
    if (!client) return;
    const key = peekIntakeNonce33(sessionKey, office);
    if (!key) return;
    const c = new AbortController();
    setResumeBlocked(true);
    void intakeApi33
      .resume(office, key, c.signal)
      .then(v => {
        if (!c.signal.aborted) {
          if (v) setResult(v);
          else clearIntakeNonce33(sessionKey, office);
          setResumeBlocked(false);
          setError('');
        }
      })
      .catch(e => {
        if (!c.signal.aborted) fail(e);
      });
    return () => c.abort();
  }, [office, sessionKey, client, resumeTick, fail]);

  async function run(work: (s: AbortSignal) => Promise<void>) {
    if (flight.current || blocked) return;
    flight.current = true;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    try {
      await work(c.signal);
    } catch (e) {
      if (alive.current && !c.signal.aborted) fail(e);
    } finally {
      if (alive.current) {
        flight.current = false;
        setBusy(false);
      }
    }
  }

  function open(id: string, refresh = false) {
    void run(async s => {
      const [v, cfg] = await Promise.all([
        modelApi.form(office, id, s),
        smartDocumentsApi.configGet(office, id, s).catch(() => null),
      ]);
      if (!alive.current || s.aborted) return;
      setOffer(v);
      setSmartConfig(cfg?.config ?? null);
      setSmartMode(Boolean(cfg?.config));
      setConflict(false);
      attempt.current = null;
      setQuantity(q =>
        refresh &&
        Number(q) >= (v.quantity_min ?? 1) &&
        Number(q) <= (v.quantity_max ?? 1)
          ? q
          : String(v.quantity_min ?? 1),
      );
      setServiceAnswers(old =>
        refresh
          ? Object.fromEntries(
              (v.service_fields ?? [])
                .filter(f => Object.hasOwn(old, f.key))
                .map(f => [f.key, old[f.key]]),
            )
          : {},
      );
      setAnswers(old =>
        refresh
          ? Object.fromEntries(
              v.variables
                .filter(x => Object.hasOwn(old, x.key))
                .map(x => [x.key, old[x.key]]),
            )
          : {},
      );
    });
  }

  function book() {
    if (!offer || offer.can_book === false || conflict) return;
    void run(async s => {
      const mergedAnswers = { ...smartPayload.current.answers, ...answers };
      const allowedAnswers = Object.fromEntries(
        offer.variables
          .filter(v => Object.hasOwn(mergedAnswers, v.key))
          .map(v => [v.key, mergedAnswers[v.key]]),
      );
      const a = attempt.current ?? {
        key: client
          ? (peekIntakeNonce33(sessionKey, office) ?? crypto.randomUUID())
          : crypto.randomUUID(),
        value: {
          ...(client && offer.service_fields !== undefined
            ? {
                intake: {
                  answers: structuredClone(serviceAnswers),
                  quantity: Number(quantity),
                  message: clientMessage.trim(),
                  checklist_version: offer.checklist_version ?? 0,
                },
              }
            : {}),
          template_id: offer.template_id,
          template_version_id: offer.template_version_id,
          service_version_id: offer.service_version_id,
          offer_revision: offer.offer_revision,
          origin: client ? 'portal' : origin,
          answers: allowedAnswers,
          customer_id: client ? null : (customer?.id ?? null),
          assignee_id: client ? null : (assignee?.id ?? null),
        },
      };
      attempt.current = a;
      if (client) keepIntakeNonce33(sessionKey, office, a.key);
      const v = await modelApi.book(office, a.value, a.key, s);
      if (alive.current && !s.aborted) {
        void smartDocumentsApi
          .sessionSave(
            {
              office_id: office,
              request_id: v.request_id,
              template_id: offer.template_id,
              template_version_id: offer.template_version_id,
              origin: client ? 'portal' : origin,
              channel: 'web',
              current_step: 'revisao',
              initial_answers: smartPayload.current.initial_answers,
              answers: mergedAnswers,
              parties: smartPayload.current.parties,
              pending_fields: smartPayload.current.pending_fields,
              submit: !v.draft,
            },
            s,
          )
          .catch(() => {
            /* optional smart metadata sync */
          });
        attempt.current = null;
        if (client && !v.draft) clearIntakeNonce33(sessionKey, office);
        setResult(v);
        setAnswers({});
        setServiceAnswers({});
        setClientMessage('');
        smartPayload.current = {
          initial_answers: {},
          answers: {},
          parties: [],
          pending_fields: [],
        };
        setOffer(undefined);
      }
    });
  }

  function handleListScroll(event: UIEvent<HTMLUListElement>) {
    if (!list) return;
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 140) return;
    if (
      shouldLoadMoreRequestPages({
        loadedCount: list.items.length,
        total: list.total,
        lastBatchSize: list.lastBatchSize,
        pageSize: REQUESTS_BATCH_SIZE,
      })
    ) {
      loadMore(list.loadedPage + 1, filterKey);
    }
  }

  const syntheticDefinition = useMemo<TemplateInput | undefined>(
    () =>
      offer
        ? {
            code: offer.template_code,
            name: offer.name,
            kind: 'contract',
            content: [
              offer.name.toUpperCase(),
              offer.instructions ||
                'Preenchimento inteligente integrado ao Escritório JN.',
              ...offer.variables.map(v => `${v.label}: {{${v.key}}}`),
            ].join('\n\n'),
            variables: offer.variables.map(v => ({
              key: v.key,
              label: v.label,
              type: v.type,
              required: v.required,
            })),
            signature_policy: 'physical',
            review_required: true,
            demonstration: false,
            effective_from: null,
            effective_until: null,
          }
        : undefined,
    [offer],
  );

  const locked = busy || !!attempt.current || conflict;
  usePendingNavigation33(
    busy || !!attempt.current || resumeBlocked || completionPending,
  );

  const officeAction =
    !fixedOffice && contexts.length > 1 ? (
      <label className="team-field requests-office-select">
        Escritório
        <select
          value={office}
          disabled={
            busy || !!attempt.current || completionPending || resumeBlocked
          }
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
    <div className="requests-catalog-workspace">
      {!embedded && (
        <OperationHeading
          context={context}
          showRole
          action={officeAction}
          title={client ? 'Documentos' : 'Solicitar documento'}
          description="Escolha o modelo na pasta e confira as informações necessárias."
        />
      )}

      {error && (
        <p role="alert" className="form-feedback error requests-inline-feedback">
          {error}
        </p>
      )}

      {resumeBlocked && !blocked ? (
        <div className="requests-subview-card">
          <div className="requests-subview-scroll">
            <button
              className="team-text-button"
              onClick={() => setResumeTick(n => n + 1)}
            >
              Conferir tentativa anterior
            </button>
          </div>
        </div>
      ) : blocked ? (
        <div className="requests-subview-card">
          <div className="requests-subview-scroll">
            <Link className="primary-button" to={client ? paths.client : paths.team}>
              Verificar acesso
            </Link>
          </div>
        </div>
      ) : result && client && result.draft !== undefined ? (
        <div className="requests-subview-card">
          <div className="requests-subview-scroll">
            <IntakeCompletion33
              office={office}
              result={result}
              onFailure={fail}
              onPendingChange={setCompletionPending}
              onReset={() => {
                clearIntakeNonce33(sessionKey, office);
                setResult(undefined);
                setTick(n => n + 1);
              }}
            />
          </div>
        </div>
      ) : result ? (
        <section className="catalog-result requests-subview-card">
          <div className="requests-subview-scroll">
            <p role="status" className="form-feedback">
              Solicitação {result.protocol} registrada.
              {result.waiting
                ? ' Sua solicitação está na fila, aguardando uma pessoa disponível.'
                : ' Acompanhe as próximas etapas no atendimento.'}
            </p>
            <div className="catalog-result-actions">
              <Link
                className="primary-button"
                to={client ? paths.clientRequests : paths.requests}
                state={{ office_id: office, request_id: result.request_id }}
              >
                Acompanhar solicitação
              </Link>
              <button
                className="team-text-button"
                onClick={() => {
                  setResult(undefined);
                  setTick(x => x + 1);
                }}
              >
                Solicitar outro modelo
              </button>
            </div>
          </div>
        </section>
      ) : offer ? (
        <section className="catalog-offer requests-subview-card">
          <header className="requests-detail-head">
            <div className="requests-detail-meta">
              <button
                data-operation-local-return
                type="button"
                className="requests-subview-back"
                disabled={busy || !!attempt.current}
                onClick={() => {
                  setOffer(undefined);
                  setAnswers({});
                  setConflict(false);
                  setError('');
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" />
                <span>Voltar às pastas</span>
              </button>
              <strong className="requests-offer-title">{offer.name}</strong>
            </div>
            <span className="request-status-pill is-gold">
              {serviceMoney(offer.price_cents)}
            </span>
          </header>

          <form
            className="requests-offer-form"
            onSubmit={e => {
              e.preventDefault();
              book();
            }}
          >
            <div className="requests-subview-scroll">
              <p className="customer-note">
                Serviço {offer.service_name ?? offer.service_code} · Categoria{' '}
                {offer.service_category}
                {offer.folder_name
                  ? ` · Pasta ${offer.folder_name} (${offer.folder_category})`
                  : ''}
              </p>
              {offer.service_checklist.length > 0 && (
                <div className="document-hint catalog-checklist">
                  <strong>O que enviar</strong>
                  <ul>
                    {offer.service_checklist.map(item => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="document-hint">
                O documento ficará disponível após o término do atendimento, as
                conferências necessárias e o pagamento integral.
              </p>
              <p className="request-message-text">
                {offer.instructions ||
                  'Confira os campos abaixo. A equipe poderá solicitar informações adicionais para preparar o documento.'}
              </p>

              {conflict && client && (
                <button
                  type="button"
                  className="team-text-button"
                  disabled={busy}
                  onClick={() => setResumeTick(n => n + 1)}
                >
                  Retomar pedido desta tentativa
                </button>
              )}
              {conflict && (
                <button
                  type="button"
                  className="team-text-button"
                  disabled={busy}
                  onClick={() => open(offer.template_id, true)}
                >
                  Atualizar modelo e preço preservando os campos compatíveis
                </button>
              )}

              {offer.can_book === false ? (
                <p className="customer-note">
                  Este serviço precisa de informações ou participantes
                  adicionais.{' '}
                  <Link to={client ? paths.clientRequests : paths.requests}>
                    Abrir solicitação de atendimento
                  </Link>
                </p>
              ) : (
                <>
                  <div className="account-actions catalog-mode-bar">
                    <button
                      type="button"
                      className="team-text-button"
                      onClick={() => setSmartMode(m => !m)}
                    >
                      {smartMode
                        ? 'Usar formulário compacto clássico'
                        : 'Usar preenchimento inteligente guiado'}
                    </button>
                  </div>
                  {smartMode && syntheticDefinition && (
                    <div className="catalog-smart-wrap">
                      <SmartWizard
                        key={offer.template_id + ':' + offer.template_version_id}
                        office={office}
                        templateId={offer.template_id}
                        templateVersionId={offer.template_version_id}
                        definition={syntheticDefinition}
                        config={smartConfig}
                        origin={client ? 'portal' : origin}
                        channel="web"
                        autoSaveRemote={false}
                        disabled={locked}
                        onChange={payload => {
                          smartPayload.current = payload;
                          setAnswers(prev => ({
                            ...prev,
                            ...Object.fromEntries(
                              offer.variables
                                .filter(v => Object.hasOwn(payload.answers, v.key))
                                .map(v => [v.key, payload.answers[v.key]]),
                            ),
                          }));
                        }}
                      />
                    </div>
                  )}
                  {!smartMode && (
                    <fieldset className="catalog-fieldset" disabled={locked}>
                      <legend>Informações para preparar o documento</legend>
                      {offer.variables.map(v => {
                        const identifier = ['cpf', 'cnpj', 'tax_id'].includes(
                          v.type,
                        );
                        const raw = answers[v.key] ?? '';
                        const value =
                          v.type === 'cpf'
                            ? formatCpf(raw)
                            : v.type === 'cnpj'
                              ? formatCnpj(raw)
                              : v.type === 'tax_id'
                                ? raw.length <= 11
                                  ? formatCpf(raw)
                                  : formatCnpj(raw)
                                : raw;
                        return (
                          <label key={v.key} className="team-field">
                            {v.label}
                            {v.required ? ' *' : ''}
                            {v.type === 'text' ? (
                              <textarea
                                rows={3}
                                value={value}
                                maxLength={2000}
                                required={v.required}
                                onChange={e =>
                                  setAnswers({
                                    ...answers,
                                    [v.key]: e.target.value,
                                  })
                                }
                              />
                            ) : (
                              <input
                                type={v.type === 'date' ? 'date' : 'text'}
                                inputMode={
                                  identifier
                                    ? 'numeric'
                                    : ['money', 'number'].includes(v.type)
                                      ? 'decimal'
                                      : 'text'
                                }
                                value={value}
                                required={v.required}
                                maxLength={identifier ? 18 : 2000}
                                placeholder={
                                  v.type === 'money' ? '0.00' : undefined
                                }
                                onChange={e =>
                                  setAnswers({
                                    ...answers,
                                    [v.key]: identifier
                                      ? digitsOnly(e.target.value)
                                      : e.target.value,
                                  })
                                }
                              />
                            )}
                          </label>
                        );
                      })}
                      {!offer.variables.length && (
                        <p>
                          A equipe orientará sobre os dados necessários durante o
                          atendimento.
                        </p>
                      )}
                    </fieldset>
                  )}
                  <fieldset className="catalog-fieldset" disabled={locked}>
                    {client && offer.service_fields !== undefined && (
                      <>
                        <label className="team-field">
                          Quantidade
                          <input
                            type="number"
                            required
                            min={offer.quantity_min ?? 1}
                            max={offer.quantity_max ?? 1}
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                          />
                        </label>
                        {offer.service_fields.map(f => (
                          <label key={f.key} className="team-field">
                            {f.label}
                            {f.required ? ' *' : ''}
                            <input
                              type={f.type === 'date' ? 'date' : 'text'}
                              inputMode={
                                f.type === 'number' ? 'decimal' : 'text'
                              }
                              required={f.required}
                              maxLength={500}
                              value={serviceAnswers[f.key] ?? ''}
                              onChange={e =>
                                setServiceAnswers(old => ({
                                  ...old,
                                  [f.key]: e.target.value,
                                }))
                              }
                            />
                          </label>
                        ))}
                        <label className="team-field">
                          Mensagem para a equipe (opcional)
                          <textarea
                            rows={2}
                            maxLength={2000}
                            value={clientMessage}
                            onChange={e => setClientMessage(e.target.value)}
                          />
                        </label>
                      </>
                    )}
                    {!client && (
                      <>
                        <label className="team-field">
                          Origem
                          <select
                            value={origin}
                            onChange={e =>
                              setOrigin(
                                e.target.value as 'presencial' | 'whatsapp',
                              )
                            }
                          >
                            <option value="presencial">Presencial</option>
                            <option value="whatsapp">WhatsApp</option>
                          </select>
                        </label>
                        <RequestPicker
                          office={office}
                          kind="customers"
                          label="pessoa"
                          value={customer}
                          busy={locked}
                          onSelect={setCustomer}
                          onFailure={fail}
                        />
                        <RequestPicker
                          office={office}
                          kind="assignees"
                          label="responsável"
                          value={assignee}
                          busy={locked}
                          onSelect={setAssignee}
                          onFailure={fail}
                        />
                        {origin === 'presencial' && !assignee && (
                          <p className="customer-note">
                            Selecione o responsável pelo atendimento presencial.
                          </p>
                        )}
                      </>
                    )}
                  </fieldset>
                </>
              )}
            </div>
            {offer.can_book !== false && (
              <div className="requests-subview-footer">
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    conflict ||
                    (!client && origin === 'presencial' && !assignee)
                  }
                >
                  {client && offer.service_fields !== undefined
                    ? 'Conferir e anexar'
                    : 'Enviar solicitação'}
                </button>
              </div>
            )}
          </form>
        </section>
      ) : (
        <>
          <section
            className={`requests-toolbar-card requests-catalog-toolbar${categoryId ? ' is-client' : ''}`}
            aria-label="Filtros do catálogo de modelos"
          >
            <div className="requests-search-group">
              <label className="team-field requests-search-field">
                <span>Buscar modelo</span>
                <div className="requests-search-row">
                  <input
                    type="search"
                    maxLength={120}
                    placeholder="Nome do modelo ou serviço..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="requests-circle-btn"
                    aria-label="Buscar modelo"
                    onClick={() => {
                      setQuery(input.trim());
                      setTick(x => x + 1);
                    }}
                  >
                    <Search size={17} aria-hidden="true" />
                  </button>
                </div>
              </label>
            </div>

            <div className="requests-filter-selects">
              {!categoryId && (
                <label className="team-field requests-select-field">
                  <span>Categoria</span>
                  <select
                    value={category}
                    onChange={e => {
                      setCategory(e.target.value);
                      setFolder('');
                    }}
                  >
                    <option value="">Todas as categorias</option>
                    {list?.categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {[c.parent_name, c.name].filter(Boolean).join(' › ')}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="team-field requests-select-field">
                <span>Pasta</span>
                <select value={folder} onChange={e => setFolder(e.target.value)}>
                  <option value="">Todas as pastas</option>
                  <option value="unfiled">Sem pasta</option>
                  {list?.folders.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="requests-toolbar-actions">
              <button
                type="button"
                className="requests-circle-btn"
                aria-label="Atualizar catálogo"
                title="Atualizar catálogo"
                onClick={() => setTick(x => x + 1)}
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            </div>
          </section>

          <article className="requests-list-card">
            <div className="requests-list-card-head">
              <h2>MODELOS DISPONÍVEIS</h2>
              <span>{list ? formatRequestsResultCount(list.total) : ''}</span>
            </div>

            {list ? (
              list.items.length ? (
                <ul
                  className="requests-scroll-list"
                  aria-label="Modelos disponíveis"
                  onScroll={handleListScroll}
                >
                  {list.items.map(v => {
                    const folderItem = list.folders.find(
                      f => f.id === v.folder_id,
                    );
                    const metaSummary = [
                      v.service_name ?? v.service_code,
                      v.service_category,
                      folderItem ? `Pasta ${folderItem.name}` : 'Sem pasta',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <li key={v.template_id} className="requests-list-row">
                        <div className="requests-list-row-info">
                          <strong className="requests-list-row-title">
                            {v.name}
                          </strong>
                          <div className="requests-list-row-meta">
                            <span className="requests-protocol-code">
                              {metaSummary}
                            </span>
                            <span
                              className="requests-meta-sep"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            <span className="request-status-pill is-gold">
                              {serviceMoney(v.price_cents)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="requests-catalog-action-btn"
                          disabled={busy}
                          onClick={() => open(v.template_id)}
                        >
                          {v.can_book === false ? 'Consultar' : 'Solicitar'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="requests-list-empty">
                  <p className="team-empty">
                    Nenhum modelo publicado nesta pasta. A equipe pode configurar
                    modelos aprovados com serviço e preço.
                  </p>
                </div>
              )
            ) : (
              <div className="requests-list-empty" />
            )}

            <div className="requests-list-footer">
              <span>
                {list
                  ? formatEntityTotal(list.total, 'modelo', 'modelos')
                  : 'Total: —'}
              </span>
            </div>
          </article>
        </>
      )}
    </div>
  );

  return embedded ? (
    content
  ) : (
    <OperationLayout
      office={office}
      client={client}
      viewportLock
      busy={busy || !!attempt.current || completionPending || resumeBlocked}
    >
      {content}
    </OperationLayout>
  );
}
