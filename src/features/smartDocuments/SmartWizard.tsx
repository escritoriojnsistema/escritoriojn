import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, FileText } from 'lucide-react';
import { digitsOnly, formatCnpj, formatCpf } from '../../../shared/identifiers';
import type { DocumentParticipant, DocumentSource } from '../../../shared/documents';
import type { TemplateInput } from '../../../shared/templates';
import {
  evaluateConditions,
  evaluateStepPendencies,
  normalizeSmartFieldValue,
  stepLabels,
  suggestSmartConfigFromTemplate,
  type PendingFieldRecord,
  type SmartPartyRecord,
  type SmartStepId,
  type SmartTemplateConfig,
} from '../../../shared/smartDocument';
import { resolveSmartDocument } from '../../../shared/smartDocumentRender';
import { PendingConfirmModal } from './PendingConfirmModal';
import { SmartPartyEditor } from './SmartPartyEditor';
import { smartDocumentsApi } from './api';
import './smartDocuments.css';

const STEPS: SmartStepId[] = ['contexto', 'partes', 'objeto', 'pagamento', 'documentos', 'revisao'];

function renderHighlightedDocument(text: string): ReactNode[] {
  const parts = text.split(/(\[Pendente:[^\]]+\])/g);
  return parts.map((chunk, idx) =>
    chunk.startsWith('[Pendente:') ? (
      <mark key={idx} className="smart-preview-pending">
        {chunk}
      </mark>
    ) : (
      <span key={idx}>{chunk}</span>
    ),
  );
}

export function SmartWizard({
  office,
  templateId,
  templateVersionId,
  definition,
  config: providedConfig,
  origin,
  channel = 'web',
  requestId,
  requestItemId,
  documentId,
  source,
  participants = [],
  initialState,
  disabled = false,
  submitLabel = 'Conferir e enviar',
  autoSaveRemote = true,
  extraFooter,
  onSubmit,
  onChange,
  onDenied,
}: {
  office: string;
  templateId: string;
  templateVersionId: string;
  definition: TemplateInput;
  config?: SmartTemplateConfig | null;
  origin: 'portal' | 'presencial' | 'whatsapp';
  channel?: string;
  requestId?: string | null;
  requestItemId?: string | null;
  documentId?: string | null;
  source?: DocumentSource;
  participants?: DocumentParticipant[];
  initialState?: {
    current_step?: SmartStepId;
    initial_answers?: Record<string, string>;
    answers?: Record<string, string>;
    parties?: SmartPartyRecord[];
    revision?: number;
  };
  disabled?: boolean;
  submitLabel?: string;
  autoSaveRemote?: boolean;
  extraFooter?: ReactNode;
  onSubmit?: (payload: {
    initial_answers: Record<string, string>;
    answers: Record<string, string>;
    parties: SmartPartyRecord[];
    pending_fields: PendingFieldRecord[];
    rendered_content: string;
  }) => void;
  onChange?: (payload: {
    initial_answers: Record<string, string>;
    answers: Record<string, string>;
    parties: SmartPartyRecord[];
    pending_fields: PendingFieldRecord[];
  }) => void;
  onDenied?: (status: number) => void;
}) {
  const config = useMemo(
    () => providedConfig ?? suggestSmartConfigFromTemplate(definition),
    [providedConfig, definition],
  );

  const [step, setStep] = useState<SmartStepId>(initialState?.current_step ?? 'contexto');
  const [mobilePane, setMobilePane] = useState<'form' | 'preview'>('form');
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const q of config.initial_questions) {
      if (q.default_value) defaults[q.key] = q.default_value;
    }
    return { ...defaults, ...(initialState?.initial_answers ?? {}) };
  });
  const [answers, setAnswers] = useState<Record<string, string>>(initialState?.answers ?? {});
  const [parties, setParties] = useState<SmartPartyRecord[]>(initialState?.parties ?? []);
  const [revision, setRevision] = useState<number>(initialState?.revision ?? 0);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [pendingModal, setPendingModal] = useState<{ open: boolean; targetStep: SmartStepId; items: PendingFieldRecord[] }>({
    open: false,
    targetStep: 'revisao',
    items: [],
  });
  const [formatErrorMsg, setFormatErrorMsg] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const allEval = useMemo(
    () => evaluateStepPendencies(config, { initial_answers: initialAnswers, answers, parties }),
    [config, initialAnswers, answers, parties],
  );

  const stepEval = useMemo(
    () => evaluateStepPendencies(config, { initial_answers: initialAnswers, answers, parties }, step),
    [config, initialAnswers, answers, parties, step],
  );

  const pendingKeySet = useMemo(
    () => new Set(allEval.emptyPendencies.map((p) => p.key)),
    [allEval.emptyPendencies],
  );

  const fallbackSource: DocumentSource = useMemo(
    () =>
      source ?? {
        customer: null,
        service: {
          id: '00000000-0000-4000-8000-000000000001',
          version_id: '00000000-0000-4000-8000-000000000002',
          description: definition.name,
          quantity: 1,
          total_cents: 0,
        },
        emitted_on: new Date().toISOString().slice(0, 10),
      },
    [source, definition.name],
  );

  const resolution = useMemo(
    () =>
      resolveSmartDocument(
        definition,
        config,
        { content: definition.content, overrides: {}, money_in_words: true },
        fallbackSource,
        participants,
        { initial_answers: initialAnswers, answers, parties },
      ),
    [definition, config, fallbackSource, participants, initialAnswers, answers, parties],
  );

  useEffect(() => {
    onChange?.({
      initial_answers: initialAnswers,
      answers,
      parties,
      pending_fields: allEval.emptyPendencies,
    });
  }, [initialAnswers, answers, parties, allEval.emptyPendencies]);

  useEffect(() => {
    if (!autoSaveRemote || disabled || !office || !templateId || !templateVersionId) return;
    if (!requestId && !documentId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const controller = new AbortController();
      setSaveStatus('saving');
      void smartDocumentsApi
        .sessionSave(
          {
            office_id: office,
            request_id: requestId ?? null,
            request_item_id: requestItemId ?? null,
            document_id: documentId ?? null,
            template_id: templateId,
            template_version_id: templateVersionId,
            origin,
            channel,
            current_step: step,
            initial_answers: initialAnswers,
            answers,
            parties,
            pending_fields: allEval.emptyPendencies,
            expected_revision: revision,
          },
          controller.signal,
        )
        .then((saved) => {
          if (!alive.current || controller.signal.aborted) return;
          setRevision(saved.revision);
          setSaveStatus('saved');
          setSaveError('');
        })
        .catch((err) => {
          if (!alive.current || controller.signal.aborted) return;
          const st = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 503;
          setSaveStatus('error');
          if (st === 409) {
            setSaveError('O documento foi atualizado em outra aba. Suas respostas locais foram preservadas; confira antes de salvar.');
          } else {
            setSaveError('Não foi possível salvar o rascunho automático agora. Suas alterações locais permanecem nesta tela.');
          }
          if (st === 401 || st === 403) onDenied?.(st);
        });
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    autoSaveRemote,
    disabled,
    office,
    requestId,
    requestItemId,
    documentId,
    templateId,
    templateVersionId,
    origin,
    channel,
    step,
    initialAnswers,
    answers,
    parties,
    allEval.emptyPendencies,
    revision,
    onDenied,
  ]);

  const combinedContext = useMemo(() => ({ ...initialAnswers, ...answers }), [initialAnswers, answers]);

  const visibleStepFields = useMemo(
    () =>
      config.fields.filter(
        (f) => f.step_id === step && evaluateConditions(f.conditions, combinedContext),
      ),
    [config.fields, step, combinedContext],
  );

  const visibleDocs = useMemo(
    () => config.supporting_docs.filter((d) => evaluateConditions(d.conditions, combinedContext)),
    [config.supporting_docs, combinedContext],
  );

  const stepIdx = STEPS.indexOf(step);

  function goToStep(target: SmartStepId) {
    setFormatErrorMsg('');
    if (STEPS.indexOf(target) <= stepIdx) {
      setStep(target);
      return;
    }
    if (stepEval.invalidFields.length > 0) {
      setFormatErrorMsg(stepEval.invalidFields.map((e) => e.message).join(' · '));
      return;
    }
    if (stepEval.emptyPendencies.length > 0) {
      setPendingModal({
        open: true,
        targetStep: target,
        items: stepEval.emptyPendencies,
      });
      return;
    }
    setStep(target);
  }

  function stepHasPendency(s: SmartStepId): boolean {
    return allEval.emptyPendencies.some((p) => p.step_id === s);
  }

  function handleFinalSubmit() {
    setFormatErrorMsg('');
    if (allEval.invalidFields.length > 0) {
      setFormatErrorMsg(allEval.invalidFields.map((e) => e.message).join(' · '));
      return;
    }
    onSubmit?.({
      initial_answers: initialAnswers,
      answers,
      parties,
      pending_fields: allEval.emptyPendencies,
      rendered_content: resolution.rendered_content,
    });
  }

  return (
    <div className="smart-wizard">
      <div className="smart-wizard-header">
        <div>
          <strong>Preenchimento inteligente</strong>
          <p className="document-hint">
            As perguntas adaptam o formulário e atualizam a prévia em tempo real.
          </p>
        </div>
        <div className="smart-wizard-status" role="status">
          {allEval.emptyPendencies.length > 0 ? (
            <span className="smart-pendency-count">
              <AlertCircle size={15} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
              {allEval.emptyPendencies.length}{' '}
              {allEval.emptyPendencies.length === 1 ? 'campo pendente' : 'campos pendentes'}
            </span>
          ) : (
            <span className="document-ready">
              <CheckCircle2 size={15} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
              Todos os campos visíveis preenchidos
            </span>
          )}
          {saveStatus === 'saving' && <span>Salvando rascunho...</span>}
          {saveStatus === 'saved' && <span>Rascunho salvo automaticamente</span>}
        </div>
      </div>

      {saveError && (
        <p role="alert" className="form-feedback error">
          {saveError}
        </p>
      )}
      {formatErrorMsg && (
        <p role="alert" className="form-feedback error">
          {formatErrorMsg}
        </p>
      )}

      <nav className="smart-steps-bar" aria-label="Etapas do preenchimento">
        {STEPS.map((id, i) => {
          const hasPend = stepHasPendency(id);
          return (
            <button
              key={id}
              type="button"
              className={`smart-step-btn${step === id ? ' active' : ''}${hasPend ? ' has-pendency' : ''}`}
              onClick={() => goToStep(id)}
            >
              <span>{i + 1}.</span>
              <span>{stepLabels[id]}</span>
            </button>
          );
        })}
      </nav>

      <div className="smart-mobile-switch" role="tablist" aria-label="Alternar formulário e prévia">
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'form'}
          className={mobilePane === 'form' ? 'active' : ''}
          onClick={() => setMobilePane('form')}
        >
          Formulário
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'preview'}
          className={mobilePane === 'preview' ? 'active' : ''}
          onClick={() => setMobilePane('preview')}
        >
          Prévia do documento
        </button>
      </div>

      <div className="smart-layout">
        <section
          className={`smart-form-pane${mobilePane === 'preview' ? ' smart-pane-hidden' : ''}`}
          aria-label={`Etapa ${stepLabels[step]}`}
        >
          {step === 'contexto' && (
            <div className="smart-question-list">
              <h2>1. Perguntas iniciais</h2>
              {config.initial_questions.length === 0 ? (
                <p className="document-hint">
                  Este modelo não requer configuração inicial adicional. Avance para qualificar as partes e preencher os dados.
                </p>
              ) : (
                config.initial_questions.map((q) => (
                  <fieldset key={q.key} className="smart-question-card" disabled={disabled}>
                    <legend>
                      {q.label}
                      {q.criticality === 'legal_required' ? ' *' : ''}
                    </legend>
                    {q.help_text && <p className="document-hint">{q.help_text}</p>}
                    <div className="smart-radio-grid">
                      {q.options.map((opt) => (
                        <label key={opt.value} className="smart-radio-option">
                          <input
                            type="radio"
                            name={`q-${q.key}`}
                            value={opt.value}
                            checked={(initialAnswers[q.key] ?? '') === opt.value}
                            onChange={() =>
                              setInitialAnswers((prev) => ({ ...prev, [q.key]: opt.value }))
                            }
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))
              )}
            </div>
          )}

          {step === 'partes' && (
            <div>
              <h2>2. Partes e qualificação automática</h2>
              <p className="document-hint">
                Selecione o papel e a concordância gramatical declarada (masculino, feminino, neutro ou pessoa jurídica). Casados ou em união estável liberam os campos de cônjuge e regime de bens automaticamente.
              </p>
              <SmartPartyEditor
                parties={parties}
                allowMultipleSellers={
                  config.allow_multiple_sellers || initialAnswers['smart.multiple_sellers'] === 'sim'
                }
                allowMultipleBuyers={
                  config.allow_multiple_buyers || initialAnswers['smart.multiple_buyers'] === 'sim'
                }
                enableMarital={config.enable_marital_agreement}
                disabled={disabled}
                pendingKeys={pendingKeySet}
                onChange={setParties}
              />
            </div>
          )}

          {(step === 'objeto' || step === 'pagamento') && (
            <div>
              <h2>{step === 'objeto' ? '3. Dados específicos do documento' : '4. Pagamento e condições'}</h2>
              {visibleStepFields.length === 0 ? (
                <p className="document-hint">
                  Nenhum campo adicional aplicável nesta etapa conforme suas escolhas iniciais.
                </p>
              ) : (
                <div className="smart-fields-grid">
                  {visibleStepFields.map((f) => {
                    const isWide = f.input_type === 'textarea';
                    const isPend = pendingKeySet.has(f.key);
                    const raw = answers[f.key] ?? '';
                    const displayVal =
                      f.input_type === 'cpf'
                        ? formatCpf(digitsOnly(raw))
                        : f.input_type === 'cnpj'
                          ? formatCnpj(digitsOnly(raw))
                          : f.input_type === 'tax_id'
                            ? digitsOnly(raw).length <= 11
                              ? formatCpf(digitsOnly(raw))
                              : formatCnpj(digitsOnly(raw))
                            : raw;
                    return (
                      <label
                        key={f.key}
                        className={`team-field${isWide ? ' smart-field-wide' : ''}${isPend ? ' smart-field-pending' : ''}`}
                      >
                        {f.label}
                        {f.criticality === 'legal_required' ? ' *' : ''}
                        {f.input_type === 'textarea' ? (
                          <textarea
                            rows={3}
                            disabled={disabled}
                            placeholder={f.placeholder}
                            value={displayVal}
                            maxLength={2000}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))
                            }
                          />
                        ) : f.input_type === 'select' && f.options ? (
                          <select
                            disabled={disabled}
                            value={displayVal}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [f.key]: e.target.value }))
                            }
                          >
                            <option value="">Selecione...</option>
                            {f.options.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.input_type === 'date' ? 'date' : 'text'}
                            inputMode={
                              ['cpf', 'cnpj', 'tax_id'].includes(f.input_type)
                                ? 'numeric'
                                : ['money', 'number'].includes(f.input_type)
                                  ? 'decimal'
                                  : 'text'
                            }
                            disabled={disabled}
                            placeholder={f.placeholder ?? (f.input_type === 'money' ? '0.00' : undefined)}
                            value={displayVal}
                            maxLength={500}
                            onChange={(e) => {
                              const next = ['cpf', 'cnpj', 'tax_id'].includes(f.input_type)
                                ? digitsOnly(e.target.value)
                                : normalizeSmartFieldValue(f.input_type, e.target.value);
                              setAnswers((prev) => ({ ...prev, [f.key]: next }));
                            }}
                          />
                        )}
                        {f.help_text && <small>{f.help_text}</small>}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'documentos' && (
            <div>
              <h2>5. Documentos comprobatórios recomendados</h2>
              <p className="document-hint">
                Confira os documentos necessários para esta modalidade. Na próxima tela (ou no atendimento presencial/WhatsApp), você poderá anexar os arquivos privados com segurança.
              </p>
              <ul className="request-checklist-read">
                {visibleDocs.map((doc) => (
                  <li key={doc.id}>
                    <strong>{doc.label}</strong>
                    {doc.required ? ' (necessário na conferência)' : ' (se aplicável)'}
                    {doc.description && <small style={{ display: 'block' }}>{doc.description}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 'revisao' && (
            <div>
              <h2>6. Revisão e pendências sinalizadas</h2>
              {allEval.emptyPendencies.length > 0 ? (
                <div className="document-issues">
                  <p>
                    Existem {allEval.emptyPendencies.length} pendências sinalizadas. Elas ficam destacadas na solicitação e poderão ser complementadas na conferência antes da emissão definitiva.
                  </p>
                  <ul>
                    {allEval.emptyPendencies.map((p) => (
                      <li key={p.key}>
                        <strong>{p.label}</strong> ({stepLabels[p.step_id]})
                        {p.criticality === 'legal_required' ? ' — obrigatório antes da emissão final' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="document-ready">
                  Nenhuma pendência detectada. Confira os dados na prévia do documento antes de concluir.
                </p>
              )}
              {extraFooter}
            </div>
          )}

          <div className="smart-wizard-nav">
            <button
              type="button"
              className="secondary-button"
              disabled={stepIdx === 0}
              onClick={() => setStep(STEPS[stepIdx - 1])}
            >
              Etapa anterior
            </button>

            {step !== 'revisao' ? (
              <button
                type="button"
                className="primary-button"
                onClick={() => goToStep(STEPS[stepIdx + 1])}
              >
                Avançar etapa
              </button>
            ) : (
              onSubmit && (
                <button
                  type="button"
                  className="primary-button"
                  disabled={disabled}
                  onClick={handleFinalSubmit}
                >
                  {submitLabel}
                </button>
              )
            )}
          </div>
        </section>

        <aside
          className={`smart-preview-pane${mobilePane === 'form' ? ' smart-pane-hidden' : ''}`}
          aria-label="Prévia ao vivo do documento"
        >
          <div className="smart-preview-header">
            <h3>
              <FileText size={16} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
              Prévia ao vivo
            </h3>
            <small>{definition.demonstration ? 'RASCUNHO INTERNO' : 'Documento dinâmico'}</small>
          </div>
          <div className="smart-preview-doc" tabIndex={0}>
            {renderHighlightedDocument(resolution.rendered_content)}
          </div>
        </aside>
      </div>

      <PendingConfirmModal
        open={pendingModal.open}
        pendencies={pendingModal.items}
        onBackToFill={() => setPendingModal((p) => ({ ...p, open: false }))}
        onContinueWithPendencies={() => {
          const next = pendingModal.targetStep;
          setPendingModal((p) => ({ ...p, open: false }));
          setStep(next);
        }}
      />
    </div>
  );
}
