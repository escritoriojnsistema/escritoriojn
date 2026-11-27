import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import {
  ArrowLeft,
  Download,
  Eye,
  FileEdit,
  RefreshCw,
  Search,
} from 'lucide-react';
import { PdfReading } from '../documentReading/PdfReading';
import type { AccessContext } from '../../../shared/access';
import type {
  PortalDocuments32,
  PortalDocumentState32,
} from '../../../shared/portalDocuments';
import { workflowBlockers } from '../../../shared/documentWorkflow';
import {
  correctionStatusLabels,
  type CorrectionRequestRecord,
} from '../../../shared/smartDocument';
import { ClientCorrectionModal } from '../smartDocuments/CorrectionPanels';
import { smartDocumentsApi } from '../smartDocuments/api';
import { portalDocumentsApi } from './api';
import { workflowApi } from '../documentWorkflow/api';
import { CommercialError } from '../documentCommercial/api';
import { serviceMoney } from '../../../shared/services';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
  mergeByKey,
  shouldLoadMoreDocumentPages,
} from '../documents/documentsListModel';

type AccumulatedPortalDocuments = {
  items: PortalDocuments32['items'];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
};

const date = (v: string) =>
  new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function PortalLibrary({
  context,
  onPendingChange,
}: {
  context: AccessContext;
  onPendingChange?: (v: boolean) => void;
}) {
  const [list, setList] = useState<AccumulatedPortalDocuments>();
  const [detail, setDetail] = useState<PortalDocumentState32>();
  const [selected, setSelected] = useState('');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reading, setReading] = useState<{ bytes: Blob; key: string }>();
  const [corrections, setCorrections] = useState<CorrectionRequestRecord[]>([]);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionMsg, setCorrectionMsg] = useState('');

  const readingKey = detail ? JSON.stringify(detail.document) : '';
  useEffect(() => {
    if (reading && reading.key !== readingKey) setReading(undefined);
  }, [readingKey, reading]);

  const pending = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const listRequest = useRef(0);
  const flight = useRef(false);
  const alive = useRef(true);
  const blob = useRef<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      listController.current?.abort();
      if (blob.current) URL.revokeObjectURL(blob.current);
    };
  }, []);

  useEffect(() => {
    onPendingChange?.(busy);
    return () => onPendingChange?.(false);
  }, [busy, onPendingChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(input.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  const fail = useCallback((cause: unknown) => {
    const status = cause instanceof CommercialError ? cause.status : 503;
    setError(
      status === 404
        ? 'O documento não está mais disponível para seu acesso.'
        : cause instanceof Error
          ? cause.message
          : 'Não foi possível consultar o acervo.',
    );
    if ([401, 403].includes(status)) {
      setReading(undefined);
      setBlocked(true);
      setList(undefined);
      setDetail(undefined);
      setSelected('');
      listRequest.current++;
      if (blob.current) {
        URL.revokeObjectURL(blob.current);
        blob.current = null;
      }
    } else if (status === 404) {
      setReading(undefined);
      if (blob.current) {
        URL.revokeObjectURL(blob.current);
        blob.current = null;
      }
      setList(undefined);
      setDetail(undefined);
      setSelected('');
      setTick(n => n + 1);
    }
  }, []);

  const fetchFullDetail = useCallback(
    async (id: string, signal: AbortSignal): Promise<PortalDocumentState32> => {
      const collected = await collectAllDocumentPages({
        fetchPage: (page, s) =>
          portalDocumentsApi.state(
            context.office_id,
            id,
            page,
            DOCUMENTS_BATCH_SIZE,
            s,
          ),
        getItems: v => v.history,
        getTotal: v => v.history_total,
        getKey: h => h.at,
        pageSize: DOCUMENTS_BATCH_SIZE,
        maxItems: DOCUMENTS_AUTO_LOAD_CAP,
        signal,
      });
      return {
        ...collected.firstPage,
        history: collected.items,
        history_total: collected.total,
        page: 1,
      };
    },
    [context.office_id],
  );

  useEffect(() => {
    if (blocked || selected) return;
    const c = new AbortController();
    listController.current?.abort();
    listController.current = c;
    loadingMoreRef.current = false;
    const requestId = ++listRequest.current;

    void (async () => {
      try {
        const first = await portalDocumentsApi.page(
          context.office_id,
          query,
          1,
          DOCUMENTS_BATCH_SIZE,
          c.signal,
        );
        if (c.signal.aborted || !alive.current || requestId !== listRequest.current) {
          return;
        }
        let accumulated: AccumulatedPortalDocuments = {
          items: first.items,
          total: first.total,
          loadedPage: 1,
          lastBatchSize: first.items.length,
        };
        setList(accumulated);
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
            const next = await portalDocumentsApi.page(
              context.office_id,
              query,
              nextPage,
              DOCUMENTS_BATCH_SIZE,
              c.signal,
            );
            if (
              c.signal.aborted ||
              !alive.current ||
              requestId !== listRequest.current
            ) {
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
            if (
              c.signal.aborted ||
              !alive.current ||
              requestId !== listRequest.current
            ) {
              return;
            }
            const status = cause instanceof CommercialError ? cause.status : 503;
            if (status === 401 || status === 403) {
              fail(cause);
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
  }, [context.office_id, query, tick, blocked, selected, fail]);

  const loadMoreList = useCallback(async () => {
    if (!list || blocked || selected || loadingMoreRef.current) return;
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
      const next = await portalDocumentsApi.page(
        context.office_id,
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
        const status = cause instanceof CommercialError ? cause.status : 503;
        if (status === 401 || status === 403) fail(cause);
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [list, blocked, selected, context.office_id, query, fail]);

  const handleListScroll = useCallback(
    (event: UIEvent<HTMLUListElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreList();
      }
    },
    [loadMoreList],
  );

  useEffect(() => {
    if (blocked || !selected) return;
    const c = new AbortController();
    void fetchFullDetail(selected, c.signal)
      .then(v => {
        if (!c.signal.aborted && selectedRef.current === selected) {
          setDetail(v);
          setError('');
        }
      })
      .catch(e => {
        if (!c.signal.aborted) fail(e);
      });
    return () => c.abort();
  }, [context.office_id, selected, tick, blocked, fetchFullDetail, fail]);

  useEffect(() => {
    if (blocked || !detail?.document.id) return;
    const c = new AbortController();
    void smartDocumentsApi
      .listCorrections(context.office_id, detail.document.id, c.signal)
      .then(v => {
        if (!c.signal.aborted) setCorrections(v.items);
      })
      .catch(() => {
        /* optional correction history */
      });
    return () => c.abort();
  }, [context.office_id, detail?.document.id, tick, blocked]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && !flight.current) {
        setTick(n => n + 1);
      }
    };
    const t = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const guard = (e: MouseEvent) => {
      const a = (e.target as Element)?.closest('a');
      if (a && !a.href.startsWith('blob:')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener('click', guard, true);
    return () => document.removeEventListener('click', guard, true);
  }, [busy]);

  function open(id: string) {
    if (flight.current) return;
    setReading(undefined);
    setDetail(undefined);
    setCorrections([]);
    setCorrectionMsg('');
    setError('');
    setSelected(id);
  }

  function back() {
    if (flight.current) return;
    setReading(undefined);
    setDetail(undefined);
    setCorrections([]);
    setCorrectionMsg('');
    setSelected('');
    setError('');
    setTick(n => n + 1);
    if (blob.current) {
      URL.revokeObjectURL(blob.current);
      blob.current = null;
    }
  }

  async function download(forReading = false) {
    if (!detail?.document.ready || flight.current || blocked) return;
    const c = new AbortController();
    pending.current = c;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      const bytes = await workflowApi.download(
        context.office_id,
        detail.document.id,
        c.signal,
      );
      if (!alive.current || c.signal.aborted) return;
      if (forReading) {
        const verified = await fetchFullDetail(detail.document.id, c.signal);
        if (!alive.current || c.signal.aborted) return;
        setDetail(verified);
        if (
          !verified.document.ready ||
          JSON.stringify(verified.document) !== readingKey
        ) {
          setReading(undefined);
          setError('O documento mudou. Confira a versão atual antes de abrir a leitura.');
          return;
        }
        setReading({ bytes, key: readingKey });
      } else {
        if (blob.current) URL.revokeObjectURL(blob.current);
        blob.current = URL.createObjectURL(bytes);
        const a = document.createElement('a');
        a.href = blob.current;
        a.download = 'documento.pdf';
        a.click();
      }
      setTick(n => n + 1);
    } catch (e) {
      if (alive.current && !c.signal.aborted) fail(e);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section
      className="portal-library documents-portal-workspace"
      aria-label="Acervo autorizado"
    >
      {error && (
        <p role="alert" className="form-feedback error documents-inline-feedback">
          {error}
        </p>
      )}
      {blocked ? (
        <div className="documents-empty-card">
          <button
            type="button"
            className="documents-primary-btn"
            onClick={() => {
              setBlocked(false);
              setError('');
              setTick(n => n + 1);
            }}
          >
            Verificar acesso
          </button>
        </div>
      ) : selected ? (
        <>
          <div className="documents-subview-bar">
            <button
              type="button"
              data-operation-local-return
              className="documents-subview-back"
              disabled={busy}
              onClick={back}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Meus documentos
            </button>
            {detail && (
              <div className="documents-subview-actions">
                <button
                  type="button"
                  className="documents-subview-action is-primary"
                  disabled={busy || !detail.document.ready}
                  onClick={() => void download()}
                >
                  <Download size={15} aria-hidden="true" />
                  Baixar documento
                </button>
                {reading?.key !== readingKey && (
                  <button
                    type="button"
                    className="documents-subview-action"
                    disabled={busy || !detail.document.ready}
                    onClick={() => void download(true)}
                  >
                    Abrir leitura do PDF
                  </button>
                )}
                <button
                  type="button"
                  className="documents-subview-action"
                  disabled={busy}
                  onClick={() => setCorrectionOpen(true)}
                >
                  <FileEdit size={15} aria-hidden="true" />
                  Solicitar correção
                </button>
              </div>
            )}
          </div>
          {correctionMsg && (
            <p role="status" className="form-feedback documents-inline-feedback">
              {correctionMsg}
            </p>
          )}
          <div className="documents-subview-scroll">
            {detail && (
              <div className="portal-doc-card documents-detail-card">
                <h2>{detail.document.title}</h2>
                <p className="request-protocol">
                  {detail.document.protocol} · Revisão {detail.document.revision}
                </p>
                <p className="customer-note">
                  {detail.document.scope === 'participant'
                    ? 'Contrato compartilhado nesta versão. Este acesso não inclui fichas, anexos ou outros atendimentos.'
                    : 'Documento vinculado à sua identidade conferida.'}
                </p>
                <p className="customer-note">
                  {detail.document.ready
                    ? 'Disponível para baixar'
                    : detail.document.scope === 'participant'
                      ? 'Documento indisponível. Solicite a conferência ao escritório.'
                      : detail.document.blockers
                          .map(k => workflowBlockers[k])
                          .join(' · ')}
                </p>
                {reading &&
                  reading.key === readingKey &&
                  detail.document.ready && (
                    <PdfReading
                      key={reading.key}
                      bytes={reading.bytes}
                      scope={reading.key}
                    />
                  )}
                {detail.financial && (
                  <dl className="operation-details">
                    <div>
                      <dt>Valor do seu atendimento</dt>
                      <dd>{serviceMoney(detail.financial.due_cents)}</dd>
                    </div>
                    <div>
                      <dt>Confirmado</dt>
                      <dd>{serviceMoney(detail.financial.paid_cents)}</dd>
                    </div>
                    <div>
                      <dt>Saldo</dt>
                      <dd>{serviceMoney(detail.financial.balance_cents)}</dd>
                    </div>
                  </dl>
                )}
                <details
                  className="account-access-info"
                  open={corrections.length > 0}
                >
                  <summary>Solicitações de correção ({corrections.length})</summary>
                  {corrections.length > 0 ? (
                    <ul className="relation-list">
                      {corrections.map(c => (
                        <li key={c.id}>
                          <div>
                            <strong>
                              {c.section_key} · {correctionStatusLabels[c.status]}
                            </strong>
                            <small className="portal-correction-meta">
                              {c.zero_charge_label} · {date(c.created_at)}
                            </small>
                            <small className="portal-correction-meta">
                              Dado corrigido: {c.corrected_value}
                            </small>
                            {c.requires_resignature && (
                              <small className="portal-correction-meta">
                                Documento assinado anteriormente: exige retificação /
                                nova assinatura.
                              </small>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="customer-note">
                      Caso encontre qualquer erro de digitação, qualificação ou cláusula
                      — mesmo após a conclusão — solicite correção gratuita vinculada a
                      este atendimento.
                    </p>
                  )}
                </details>
                <details className="account-access-info">
                  <summary>Seus downloads autorizados ({detail.history_total})</summary>
                  {detail.history.length ? (
                    <>
                      <p className="document-hint documents-count-note">
                        {formatDocumentsCount(
                          detail.history_total,
                          'download registrado',
                          'downloads registrados',
                        )}
                      </p>
                      <ul className="relation-list">
                        {detail.history.map((h, i) => (
                          <li key={h.at + i}>
                            <span>Download autorizado · {date(h.at)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="customer-note">
                      Nenhum download autorizado registrado para esta conta e versão.
                    </p>
                  )}
                  <p className="customer-note">
                    O registro de acesso não comprova leitura ou recebimento.
                  </p>
                </details>
                <ClientCorrectionModal
                  office={context.office_id}
                  documentId={detail.document.id}
                  publicationId={detail.document.id}
                  documentTitle={detail.document.title}
                  open={correctionOpen}
                  onClose={() => setCorrectionOpen(false)}
                  onSubmitted={rec => {
                    setCorrections(prev => [rec, ...prev]);
                    setCorrectionOpen(false);
                    setCorrectionMsg(
                      'Solicitação de correção enviada. Vinculada ao mesmo atendimento sem cobrança duplicada.',
                    );
                  }}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <section
            className="documents-toolbar-section"
            aria-label="Busca no seu acervo"
          >
            <form
              className="documents-search-form"
              onSubmit={e => {
                e.preventDefault();
                setQuery(input.trim());
                setTick(n => n + 1);
              }}
            >
              <label
                className="documents-search-label"
                htmlFor="portal-documents-search-input"
              >
                Buscar no meu acervo
              </label>
              <div className="documents-toolbar-row">
                <div className="documents-search-input-group">
                  <input
                    id="portal-documents-search-input"
                    type="search"
                    value={input}
                    maxLength={120}
                    autoComplete="off"
                    onChange={e => setInput(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="documents-circle-btn"
                    aria-label="Buscar documentos"
                    title="Buscar documentos"
                  >
                    <Search size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className="documents-toolbar-actions">
                  <button
                    type="button"
                    className="documents-circle-btn"
                    aria-label="Atualizar"
                    title="Atualizar"
                    onClick={() => setTick(n => n + 1)}
                  >
                    <RefreshCw size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </form>
          </section>

          {list ? (
            list.items.length > 0 ? (
              <ul
                className="documents-scroll-list documents-card-list"
                aria-label="Seus documentos"
                onScroll={handleListScroll}
              >
                {list.items.map(d => (
                  <li key={d.id} className="documents-list-card-item">
                    <div className="documents-item-copy is-stacked">
                      <strong>{d.title}</strong>
                      <small>
                        {d.protocol} · Revisão {d.revision} ·{' '}
                        {d.scope === 'participant'
                          ? 'Compartilhado com você'
                          : 'Seu documento'}
                      </small>
                      <p>
                        {d.ready
                          ? 'Disponível para baixar'
                          : d.scope === 'participant'
                            ? 'Liberação pendente'
                            : d.blockers.map(k => workflowBlockers[k]).join(' · ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="documents-circle-btn"
                      aria-label={`Ver documento ${d.protocol}`}
                      title={`Ver documento ${d.protocol}`}
                      onClick={() => open(d.id)}
                    >
                      <Eye size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="documents-empty-card">
                <p className="team-empty">
                  Nenhum documento autorizado encontrado. Solicite a conferência do
                  vínculo ao escritório.
                </p>
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
