import { useCallback, useEffect, useRef, useState, type UIEvent } from 'react';
import {
  officialDitrSource,
  type DitrCalendar,
  type DitrCommand,
  type DitrEvidence,
  type DitrState,
} from '../../../shared/ditr';
import type { AttachmentPage } from '../../../shared/attachments';
import { commercialRequest } from '../documentCommercial/api';
import { attachmentsApi } from '../attachments/api';
import {
  RURAL_AUTO_LOAD_CAP,
  RURAL_BATCH_SIZE,
  formatCountLabel,
  mergeById,
  shouldLoadMoreByCount,
} from './ruralListModel';

type Props = {
  office: string;
  propertyId: string;
  canManage: boolean;
  canReadFiles: boolean;
  refreshVersion?: number;
  onPendingChange?: (pending: boolean) => void;
};

type Area = 'cases' | 'create' | 'evidence' | 'calendar';

type AccumulatedDitrState = DitrState & {
  loadedPage: number;
  lastItemsBatch: number;
  lastEvidenceBatch: number;
  lastRequestsBatch: number;
};

type AccumulatedFiles = {
  items: AttachmentPage['items'];
  total: number;
};

const evidenceLabels: Record<DitrEvidence['kind'], string> = {
  receipt: 'Recibo externo',
  tax_guide: 'Guia de tributo',
  tax_payment: 'Comprovante de tributo',
};

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );

const date = (value: string) => value.split('-').reverse().join('/');

function amount(value: string): number | null {
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(value)) return null;
  const [whole, part = ''] = value.replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 1000000000000 ? cents : null;
}

const request = <T,>(path: string, body: unknown, signal?: AbortSignal) =>
  commercialRequest<T>(path, body, signal, '/api/rural');

export function DitrPanel(props: Props) {
  const [exercise, setExercise] = useState(new Date().getUTCFullYear());
  const [yearText, setYearText] = useState(String(exercise));
  const [pending, setPending] = useState(false);

  const reportPending = useCallback(
    (value: boolean) => {
      setPending(value);
      props.onPendingChange?.(value);
    },
    [props.onPendingChange],
  );

  return (
    <section className="ditr-panel" aria-label="Controle ITR/DITR">
      <DitrWorkspace
        key={`${props.office}:${props.propertyId}:${exercise}`}
        {...props}
        exercise={exercise}
        yearText={yearText}
        yearDisabled={pending}
        onYearChange={raw => {
          setYearText(raw);
          const y = Number(raw);
          if (Number.isInteger(y) && y >= 1900 && y <= 2200) setExercise(y);
        }}
        onYearBlur={() => setYearText(String(exercise))}
        onPendingChange={reportPending}
      />
    </section>
  );
}

function DitrWorkspace({
  office,
  propertyId,
  exercise,
  yearText,
  yearDisabled,
  onYearChange,
  onYearBlur,
  canManage,
  canReadFiles,
  refreshVersion,
  onPendingChange,
}: Props & {
  exercise: number;
  yearText: string;
  yearDisabled: boolean;
  onYearChange: (value: string) => void;
  onYearBlur: () => void;
}) {
  const [data, setData] = useState<AccumulatedDitrState>();
  const [area, setArea] = useState<Area>('cases');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);

  const [requestId, setRequestId] = useState('');
  const [modality, setModality] = useState<'original' | 'rectifying'>(
    'original',
  );
  const [previousId, setPreviousId] = useState('');
  const [evidenceKind, setEvidenceKind] =
    useState<DitrEvidence['kind']>('receipt');
  const [fileId, setFileId] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [externalDate, setExternalDate] = useState('');
  const [amountText, setAmountText] = useState('');
  const [files, setFiles] = useState<AccumulatedFiles>();
  const [calendarDraft, setCalendarDraft] = useState({
    starts_on: '',
    due_on: '',
    source_url: '',
    checked_on: '',
    expected_calendar_id: null as string | null,
  });

  const pending = useRef<{ command: DitrCommand; key: string } | null>(null);
  const flight = useRef(false);
  const alive = useRef(true);
  const mutation = useRef<AbortController | null>(null);
  const readController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  const [uncertain, setUncertain] = useState(false);
  const locked = busy || uncertain;
  const selected = data?.selected?.id === caseId ? data.selected : null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      mutation.current?.abort();
      readController.current?.abort();
      onPendingChange?.(false);
    };
  }, [onPendingChange]);

  useEffect(() => {
    onPendingChange?.(locked);
  }, [locked, onPendingChange]);

  const fail = useCallback((cause: unknown) => {
    const status =
      cause && typeof cause === 'object' && 'status' in cause
        ? Number(cause.status)
        : 503;
    setNotice('');
    setError(
      cause instanceof Error
        ? cause.message
        : 'Serviço indisponível. Repita a mesma tentativa.',
    );
    if (status === 401 || status === 403) {
      setData(undefined);
      setFiles(undefined);
      pending.current = null;
      setUncertain(false);
      setDenied(true);
    }
    if (status === 404) {
      setData(undefined);
      setFiles(undefined);
      setCaseId(null);
      setArea('cases');
      pending.current = null;
      setUncertain(false);
    }
    return status;
  }, []);

  // Load DITR state with automatic batch accumulation (no pagination bar)
  useEffect(() => {
    if (denied) return;
    const controller = new AbortController();
    readController.current?.abort();
    readController.current = controller;
    loadingMoreRef.current = false;

    void (async () => {
      try {
        const first = await request<DitrState>(
          '/ditr-state',
          {
            office_id: office,
            property_id: propertyId,
            exercise,
            case_id: caseId,
            page: 1,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        let acc: AccumulatedDitrState = {
          ...first,
          loadedPage: 1,
          lastItemsBatch: first.items.length,
          lastEvidenceBatch: first.evidence.length,
          lastRequestsBatch: first.requests.length,
        };
        setData(acc);

        while (
          !controller.signal.aborted &&
          (shouldLoadMoreByCount({
            loadedCount: acc.items.length,
            total: acc.total,
            lastBatchSize: acc.lastItemsBatch,
            pageSize: RURAL_BATCH_SIZE,
            maxItems: RURAL_AUTO_LOAD_CAP,
          }) ||
            (caseId !== null &&
              shouldLoadMoreByCount({
                loadedCount: acc.evidence.length,
                total: acc.evidence_total,
                lastBatchSize: acc.lastEvidenceBatch,
                pageSize: RURAL_BATCH_SIZE,
                maxItems: RURAL_AUTO_LOAD_CAP,
              })) ||
            shouldLoadMoreByCount({
              loadedCount: acc.requests.length,
              total: acc.requests_total,
              lastBatchSize: acc.lastRequestsBatch,
              pageSize: RURAL_BATCH_SIZE,
              maxItems: RURAL_AUTO_LOAD_CAP,
            }))
        ) {
          const nextPage = acc.loadedPage + 1;
          try {
            const next = await request<DitrState>(
              '/ditr-state',
              {
                office_id: office,
                property_id: propertyId,
                exercise,
                case_id: caseId,
                page: nextPage,
              },
              controller.signal,
            );
            if (controller.signal.aborted) return;
            acc = {
              ...next,
              items: mergeById(acc.items, next.items),
              evidence: mergeById(acc.evidence, next.evidence),
              requests: mergeById(acc.requests, next.requests),
              loadedPage: nextPage,
              lastItemsBatch: next.items.length,
              lastEvidenceBatch: next.evidence.length,
              lastRequestsBatch: next.requests.length,
            };
            setData(acc);
          } catch (cause) {
            if (!controller.signal.aborted) {
              const status =
                cause && typeof cause === 'object' && 'status' in cause
                  ? Number(cause.status)
                  : 503;
              if (status === 401 || status === 403 || status === 404) {
                fail(cause);
              }
            }
            break;
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) fail(cause);
      }
    })();

    return () => controller.abort();
  }, [office, propertyId, exercise, caseId, tick, refreshVersion, denied, fail]);

  const loadMoreDitr = useCallback(async () => {
    if (!data || denied || loadingMoreRef.current) return;
    const moreCases =
      !caseId &&
      shouldLoadMoreByCount({
        loadedCount: data.items.length,
        total: data.total,
        lastBatchSize: data.lastItemsBatch,
        pageSize: RURAL_BATCH_SIZE,
      });
    const moreEvidence =
      !!caseId &&
      shouldLoadMoreByCount({
        loadedCount: data.evidence.length,
        total: data.evidence_total,
        lastBatchSize: data.lastEvidenceBatch,
        pageSize: RURAL_BATCH_SIZE,
      });
    if (!moreCases && !moreEvidence) return;

    loadingMoreRef.current = true;
    const nextPage = data.loadedPage + 1;
    const signal = readController.current?.signal;
    try {
      const next = await request<DitrState>(
        '/ditr-state',
        {
          office_id: office,
          property_id: propertyId,
          exercise,
          case_id: caseId,
          page: nextPage,
        },
        signal,
      );
      if (signal?.aborted) return;
      setData(prev =>
        prev
          ? {
              ...next,
              items: mergeById(prev.items, next.items),
              evidence: mergeById(prev.evidence, next.evidence),
              requests: mergeById(prev.requests, next.requests),
              loadedPage: nextPage,
              lastItemsBatch: next.items.length,
              lastEvidenceBatch: next.evidence.length,
              lastRequestsBatch: next.requests.length,
            }
          : prev,
      );
    } catch (cause) {
      if (!signal?.aborted) {
        const status =
          cause && typeof cause === 'object' && 'status' in cause
            ? Number(cause.status)
            : 503;
        if (status === 401 || status === 403 || status === 404) fail(cause);
      }
    } finally {
      loadingMoreRef.current = false;
    }
  }, [data, denied, caseId, office, propertyId, exercise, fail]);

  const handleDitrScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      const el = event.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        void loadMoreDitr();
      }
    },
    [loadMoreDitr],
  );

  // Auto-load all files for evidence form without pagination buttons
  const evidenceRequest =
    area === 'evidence' && selected && canReadFiles
      ? selected.request_id
      : null;

  useEffect(() => {
    if (!evidenceRequest || denied) return;
    const controller = new AbortController();

    void (async () => {
      try {
        const first = await attachmentsApi.search(
          office,
          evidenceRequest,
          1,
          RURAL_BATCH_SIZE,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        let items = first.items;
        let total = first.total;
        let currentPage = 1;
        let lastBatch = first.items.length;
        setFiles({ items, total });

        while (
          !controller.signal.aborted &&
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
              evidenceRequest,
              currentPage,
              RURAL_BATCH_SIZE,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            items = mergeById(items, next.items);
            total = next.total;
            lastBatch = next.items.length;
            setFiles({ items, total });
          } catch (cause) {
            if (!controller.signal.aborted) {
              const status =
                cause && typeof cause === 'object' && 'status' in cause
                  ? Number(cause.status)
                  : 503;
              if (status === 401 || status === 403) fail(cause);
            }
            break;
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) fail(cause);
      }
    })();

    return () => controller.abort();
  }, [office, evidenceRequest, denied, fail]);

  function navigate(next: Area) {
    if (locked) return;
    setError('');
    setNotice('');
    setArea(next);
    setFiles(undefined);
    setFileId('');
    if (next === 'calendar') {
      const c = data?.calendar;
      setCalendarDraft({
        starts_on: c?.starts_on ?? '',
        due_on: c?.due_on ?? '',
        source_url: c?.source_url ?? '',
        checked_on: '',
        expected_calendar_id: c?.id ?? null,
      });
    }
    if (next === 'create') {
      setRequestId('');
      setModality('original');
      setPreviousId(selected?.id ?? '');
    }
  }

  function openCase(id: string) {
    if (locked) return;
    setCaseId(id);
    setArea('cases');
    setError('');
    setNotice('');
    setFiles(undefined);
  }

  const chosenRequest = data?.requests.find(r => r.id === requestId);
  const previous =
    data?.items.find(c => c.id === previousId) ??
    (selected?.id === previousId ? selected : undefined);
  const calendarValid =
    !!calendarDraft.starts_on &&
    !!calendarDraft.due_on &&
    calendarDraft.starts_on <= calendarDraft.due_on &&
    !!calendarDraft.checked_on &&
    calendarDraft.checked_on <= new Date().toISOString().slice(0, 10) &&
    officialDitrSource(calendarDraft.source_url);
  const evidenceAmount = amount(amountText);
  const valid =
    area === 'create'
      ? !!chosenRequest &&
        (modality === 'original' ||
          (!!previous && previous.taxpayer_id === chosenRequest.taxpayer_id))
      : area === 'evidence'
        ? !!selected?.can_work &&
          !!fileId &&
          !!externalDate &&
          (evidenceKind !== 'receipt' || !!externalReference.trim()) &&
          (evidenceKind === 'receipt' || evidenceAmount !== null)
        : area === 'calendar'
          ? calendarValid
          : false;

  async function save() {
    if (flight.current || denied || (!pending.current && !valid)) return;
    let command: DitrCommand;
    if (pending.current) command = pending.current.command;
    else if (area === 'create') {
      command = {
        kind: 'create',
        exercise,
        request_id: requestId,
        modality,
        previous_case_id: modality === 'rectifying' ? previousId : null,
      };
    } else if (area === 'calendar') {
      command = { kind: 'calendar', exercise, ...calendarDraft };
    } else if (selected) {
      command = {
        kind: 'evidence',
        case_id: selected.id,
        expected_version: selected.version,
        evidence_kind: evidenceKind,
        file_id: fileId,
        external_reference: externalReference.trim(),
        amount_cents: evidenceKind === 'receipt' ? null : evidenceAmount,
        external_date: externalDate,
      };
    } else {
      return;
    }

    const attempt = pending.current ?? { command, key: crypto.randomUUID() };
    pending.current = attempt;
    flight.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    mutation.current = controller;
    try {
      const result = await request<{ id: string | null }>(
        '/ditr-command',
        { office_id: office, property_id: propertyId, ...attempt },
        controller.signal,
      );
      if (!alive.current || controller.signal.aborted) return;
      pending.current = null;
      setUncertain(false);
      setNotice('Registro ITR/DITR salvo.');
      setTick(t => t + 1);
      if (attempt.command.kind === 'calendar') {
        setArea('cases');
        setCaseId(null);
      } else {
        setCaseId(result.id);
        setArea('cases');
        setFiles(undefined);
        setFileId('');
        setExternalReference('');
        setExternalDate('');
        setAmountText('');
      }
    } catch (cause) {
      if (!alive.current || controller.signal.aborted) return;
      const status = fail(cause);
      if (status === 503) setUncertain(true);
      else {
        pending.current = null;
        setUncertain(false);
        if (status === 409) {
          setArea('cases');
          setTick(t => t + 1);
        }
      }
    } finally {
      if (alive.current && !controller.signal.aborted) {
        flight.current = false;
        setBusy(false);
      }
    }
  }

  if (denied) {
    return (
      <>
        <div className="ditr-topbar">
          <h3>ITR/DITR por exercício</h3>
        </div>
        <p role="alert" className="form-feedback error">
          Acesso ITR/DITR indisponível. Confira sua sessão e permissões.
        </p>
      </>
    );
  }

  const calendar = data?.calendar;

  return (
    <>
      <div className="ditr-topbar">
        <h3>ITR/DITR por exercício</h3>
        <div className="ditr-topbar-controls">
          <label className="team-field">
            Área ITR/DITR
            <select
              value={area}
              disabled={locked}
              onChange={e => navigate(e.target.value as Area)}
            >
              <option value="cases">Declarações e evidências</option>
              {canManage && <option value="create">Abrir declaração</option>}
              {canManage && canReadFiles && selected?.can_work && (
                <option value="evidence">Registrar evidência externa</option>
              )}
              <option value="calendar">Calendário anual</option>
            </select>
          </label>
          <label className="team-field">
            Exercício ITR/DITR
            <input
              type="number"
              min={1900}
              max={2200}
              value={yearText}
              disabled={yearDisabled || locked}
              onChange={e => onYearChange(e.target.value)}
              onBlur={onYearBlur}
            />
          </label>
        </div>
      </div>

      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="form-feedback success">
          {notice}
        </p>
      )}
      {uncertain && (
        <p className="team-hint" role="status">
          Resultado ainda não confirmado. Salvar ITR/DITR repete a mesma
          tentativa.
        </p>
      )}

      {area === 'cases' && (
        <>
          {selected ? (
            <div className="ditr-case-detail">
              <div className="ditr-case-heading">
                <div>
                  <h4>{selected.taxpayer_name}</h4>
                  <p>
                    {selected.modality === 'original'
                      ? 'Original'
                      : 'Retificadora'}{' '}
                    · revisão {selected.revision}
                  </p>
                </div>
                <button
                  type="button"
                  className="customers-subview-back"
                  disabled={locked}
                  onClick={() => setCaseId(null)}
                >
                  Ver declarações do exercício
                </button>
              </div>
              <p>Protocolo interno: {selected.internal_protocol}</p>
              <p className="team-hint">
                Responsável: {selected.responsible_name}. O protocolo interno
                não confirma aceitação pelo órgão.
              </p>
              {selected.previous_case_id && (
                <p className="ditr-chain">
                  Declaração anterior preservada.{' '}
                  <button
                    type="button"
                    className="team-text-button"
                    disabled={locked}
                    onClick={() => openCase(selected.previous_case_id!)}
                  >
                    Consultar anterior
                  </button>
                </p>
              )}
              <div className="ditr-detail-sections">
                <section
                  className="ditr-summary"
                  aria-label="Honorários do atendimento"
                >
                  <h4>Honorários do escritório</h4>
                  {selected.service ? (
                    <p>
                      Honorários {money(selected.service.total_cents)} · pagos{' '}
                      {money(selected.service.paid_cents)} · saldo{' '}
                      {money(selected.service.balance_cents)}
                    </p>
                  ) : (
                    <p>
                      Consulte a cobrança do atendimento com o acesso financeiro
                      autorizado.
                    </p>
                  )}
                  <p className="team-hint">
                    Pagamento do serviço não significa ITR pago. Tributos e
                    guias são registrados separadamente ao lado.
                  </p>
                </section>
                <section
                  className="ditr-evidence-box"
                  aria-label="Evidências externas"
                  onScroll={handleDitrScroll}
                >
                  <div className="rural-panel-head">
                    <h4>Evidências externas</h4>
                    <span className="rural-panel-count">
                      {formatCountLabel(
                        data?.evidence_total ?? 0,
                        'evidência',
                        'evidências',
                      )}
                    </span>
                  </div>
                  {data?.evidence.length ? (
                    <div className="ditr-evidence-list">
                      {data.evidence.map(e => (
                        <article key={e.id} className="ditr-evidence">
                          <p>
                            <strong>{evidenceLabels[e.kind]}</strong>
                            {e.amount_cents !== null
                              ? ` · ${money(e.amount_cents)}`
                              : ''}{' '}
                            · {date(e.external_date)}
                          </p>
                          {e.external_reference && (
                            <p>Referência informada: {e.external_reference}</p>
                          )}
                          <p className="team-hint">
                            Arquivo vinculado · registrado por {e.actor_name}.
                            Informação externa registrada; não é validação do
                            órgão.
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="customer-note">
                      Nenhuma evidência externa registrada.
                    </p>
                  )}
                </section>
              </div>
            </div>
          ) : (
            <div className="ditr-cases-overview">
              <div className="rural-panel-head">
                <h4>Declarações do exercício {exercise}</h4>
                <span className="rural-panel-count">
                  {formatCountLabel(
                    data?.total ?? 0,
                    'declaração',
                    'declarações',
                  )}
                </span>
              </div>
              {data?.items.length ? (
                <ul
                  className="rural-item-list ditr-cases-list"
                  onScroll={handleDitrScroll}
                >
                  {data.items.map(item => (
                    <li
                      key={item.id}
                      className="customers-list-row ditr-case-row"
                    >
                      <div className="customers-row-copy">
                        <strong>{item.taxpayer_name}</strong>
                        <small>
                          {item.modality === 'original'
                            ? 'Original'
                            : 'Retificadora'}{' '}
                          · revisão {item.revision} · {item.internal_protocol}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="rural-row-open-btn"
                        disabled={locked}
                        onClick={() => openCase(item.id)}
                      >
                        Abrir declaração
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                data && (
                  <p className="customer-note">
                    Nenhuma declaração neste imóvel e exercício.
                  </p>
                )
              )}
              <CalendarSummary calendar={calendar ?? null} />
            </div>
          )}
        </>
      )}

      {area === 'create' && (
        <>
          <fieldset disabled={locked} className="ditr-fields">
            <legend>Nova declaração do exercício {exercise}</legend>
            <label className="team-field">
              Modalidade da declaração
              <select
                value={modality}
                onChange={e => setModality(e.target.value as typeof modality)}
              >
                <option value="original">Original</option>
                <option value="rectifying">Retificadora</option>
              </select>
            </label>
            <label className="team-field">
              Atendimento do contribuinte
              <select
                value={requestId}
                onChange={e => setRequestId(e.target.value)}
              >
                <option value="">Selecione</option>
                {data?.requests.map(r => (
                  <option value={r.id} key={r.id}>
                    {r.protocol} · {r.taxpayer_name}
                  </option>
                ))}
              </select>
            </label>
            {chosenRequest && (
              <p className="team-hint ditr-wide">
                Contribuinte: {chosenRequest.taxpayer_name}. Honorários seguem a
                cobrança deste atendimento.
              </p>
            )}
            {modality === 'rectifying' && (
              <label className="team-field ditr-wide">
                Declaração anterior
                <select
                  value={previousId}
                  onChange={e => setPreviousId(e.target.value)}
                >
                  <option value="">Selecione na cadeia preservada</option>
                  {(selected && !data?.items.some(c => c.id === selected.id)
                    ? [...(data?.items ?? []), selected]
                    : (data?.items ?? [])
                  ).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.taxpayer_name} · revisão {c.revision} ·{' '}
                      {c.internal_protocol}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
          <p className="team-hint">
            Use um atendimento próprio, já vinculado a este imóvel, e cliente
            com papel Contribuinte no período do exercício. Se a lista estiver
            vazia, confira Pessoas e histórico e Vincular atendimento ou
            arquivo.
          </p>
        </>
      )}

      {area === 'evidence' && selected && (
        <>
          <fieldset disabled={locked} className="ditr-fields">
            <legend>Evidência externa · {selected.internal_protocol}</legend>
            <label className="team-field">
              Tipo de evidência
              <select
                value={evidenceKind}
                onChange={e =>
                  setEvidenceKind(e.target.value as DitrEvidence['kind'])
                }
              >
                {Object.entries(evidenceLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="team-field">
              Arquivo do atendimento
              <select value={fileId} onChange={e => setFileId(e.target.value)}>
                <option value="">Selecione</option>
                {files?.items
                  .filter(
                    f => f.status === 'quarentena' || f.status === 'disponivel',
                  )
                  .map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} ·{' '}
                      {f.status === 'quarentena'
                        ? 'em quarentena'
                        : 'disponível'}
                    </option>
                  ))}
              </select>
            </label>
            <label className="team-field">
              Referência externa informada
              <input
                value={externalReference}
                onChange={e => setExternalReference(e.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            </label>
            <label className="team-field">
              Data externa informada
              <input
                type="date"
                value={externalDate}
                onChange={e => setExternalDate(e.target.value)}
              />
            </label>
            {evidenceKind !== 'receipt' && (
              <label className="team-field">
                Valor externo (R$)
                <input
                  inputMode="decimal"
                  value={amountText}
                  onChange={e => setAmountText(e.target.value)}
                  maxLength={16}
                  placeholder="0,00"
                />
              </label>
            )}
          </fieldset>
          <p className="team-hint">
            A data corresponde ao recibo, ao vencimento da guia ou ao
            comprovante selecionado. O registro preserva o arquivo; não libera
            quarentena nem confirma quitação ou aceitação oficial.
          </p>
        </>
      )}

      {area === 'calendar' && (
        <>
          <CalendarSummary calendar={calendar ?? null} />
          {canManage && (
            <fieldset disabled={locked} className="ditr-fields">
              <legend>Registrar conferência anual</legend>
              <label className="team-field">
                Início do prazo conferido
                <input
                  type="date"
                  value={calendarDraft.starts_on}
                  onChange={e =>
                    setCalendarDraft(v => ({ ...v, starts_on: e.target.value }))
                  }
                />
              </label>
              <label className="team-field">
                Fim do prazo conferido
                <input
                  type="date"
                  value={calendarDraft.due_on}
                  onChange={e =>
                    setCalendarDraft(v => ({ ...v, due_on: e.target.value }))
                  }
                />
              </label>
              <label className="team-field ditr-wide">
                Fonte oficial (URL HTTPS)
                <input
                  type="url"
                  value={calendarDraft.source_url}
                  onChange={e =>
                    setCalendarDraft(v => ({
                      ...v,
                      source_url: e.target.value,
                    }))
                  }
                  maxLength={1000}
                  placeholder="https://www.gov.br/..."
                />
              </label>
              <label className="team-field">
                Data da conferência
                <input
                  type="date"
                  value={calendarDraft.checked_on}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={e =>
                    setCalendarDraft(v => ({
                      ...v,
                      checked_on: e.target.value,
                    }))
                  }
                />
              </label>
              <p className="team-hint ditr-wide">
                A pessoa autenticada fica registrada como responsável pela
                conferência. Confirme a norma deste exercício; o sistema não
                presume o prazo.
              </p>
            </fieldset>
          )}
        </>
      )}

      {canManage && area !== 'cases' && (
        <div className="ditr-save">
          <button
            type="button"
            className="customers-primary-btn"
            disabled={busy || (!uncertain && !valid)}
            onClick={() => void save()}
          >
            Salvar ITR/DITR
          </button>
          {!locked && (
            <button
              type="button"
              className="customers-subview-back"
              onClick={() => navigate('cases')}
            >
              Cancelar edição
            </button>
          )}
        </div>
      )}
    </>
  );
}

function CalendarSummary({ calendar }: { calendar: DitrCalendar | null }) {
  return (
    <section className="ditr-calendar" aria-label="Calendário conferido">
      <h4>Calendário anual</h4>
      {calendar ? (
        <>
          <p>
            Período informado: {date(calendar.starts_on)} a{' '}
            {date(calendar.due_on)}.
          </p>
          <p className="team-hint">
            Conferido em {date(calendar.checked_on)} por{' '}
            {calendar.responsible_name}.
          </p>
          <a
            href={calendar.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Consultar fonte oficial
          </a>
        </>
      ) : (
        <p className="customer-note">
          Nenhum prazo conferido para este exercício. Consulte a norma oficial
          antes de registrar o calendário.
        </p>
      )}
    </section>
  );
}
