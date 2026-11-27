import { validChargeDate } from '../../../shared/charges';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Banknote, CheckCircle2, RefreshCw, Settings, DoorOpen, X } from 'lucide-react';
import type { CashConfiguration, CashDashboard } from '../../../shared/cash';
import { cashAmountToCents, cashInteger } from '../../../shared/cash';
import {
  evaluateCashSetupReadiness,
  evaluateManualPaymentAuthority,
  isChargeEligibleForManualPayment,
  MANUAL_METHOD_TYPE_GUIDANCE,
  MANUAL_PAYMENT_OPEN_CASH_GUIDANCE,
  MANUAL_PAYMENT_SETUP_GUIDANCE,
  type CashNavigationState,
  type ManualPaymentChargeContext,
  type ManualPaymentOrigin,
  type ManualPaymentReturnTarget,
} from '../../../shared/manualPaymentFlow';
import type { PaymentOperation } from '../../../shared/payments';
import { validPaymentOperation } from '../../../shared/payments';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { chargesApi, chargesError } from '../charges/api';
import { noticesChanged } from '../notifications/api';
import { ManualPaymentApprovalForm } from '../approvals/ManualPaymentApprovalForm';
import { cashApi, cashError, type CashError } from './api';
import { loadAllCashConfigurationPages } from './cashConfigLoader';
import { cashMoney } from './CashSessions';

const ORIGIN_LABELS: Record<ManualPaymentOrigin, string> = {
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
  portal: 'Portal do cliente',
  cobrancas: 'Cobranças',
  caixa: 'Caixa',
};

const moneyInput = (cents: number) =>
  `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`;

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

type Props = {
  office: string;
  requestId: string;
  protocol: string;
  origin?: ManualPaymentOrigin;
  customerName?: string | null;
  charge?: ManualPaymentChargeContext | null;
  disabled?: boolean;
  defaultOpen?: boolean;
  returnLabel?: string;
  onPaymentRecorded?: (message: string) => void;
};

export function ManualPaymentAction({
  office,
  requestId,
  protocol,
  origin,
  customerName = null,
  charge: providedCharge = null,
  disabled = false,
  defaultOpen = false,
  returnLabel = 'Voltar para o atendimento',
  onPaymentRecorded,
}: Props) {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const context = auth.contexts.find(
    (c) => c.office_id === office && c.role_code !== 'client',
  );
  const authority = evaluateManualPaymentAuthority(context, office);

  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string>('');
  const [submitError, setSubmitError] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [validation, setValidation] = useState<string>('');

  const [resolvedCharge, setResolvedCharge] = useState<ManualPaymentChargeContext | null>(
    providedCharge,
  );
  const [chargeMissing, setChargeMissing] = useState(false);
  const [configuration, setConfiguration] = useState<CashConfiguration | null>(null);
  const [dashboard, setDashboard] = useState<CashDashboard | null>(null);
  const [sessionVersion, setSessionVersion] = useState<number | null>(null);
  const [sessionCanOperate, setSessionCanOperate] = useState<boolean>(false);

  // Manual payment form fields
  const [methodId, setMethodId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [presentedInput, setPresentedInput] = useState('');
  const [feeInput, setFeeInput] = useState('0,00');
  const [settlement, setSettlement] = useState<'pending' | 'settled'>('pending');
  const [settledOn, setSettledOn] = useState('');
  const [operationDate, setOperationDate] = useState(todayIsoDate);
  const [externalReference, setExternalReference] = useState('');
  const [evidence, setEvidence] = useState('');
  const [showApprovalForm, setShowApprovalForm] = useState(false);

  const attemptRef = useRef<{ signature: string; operation: PaymentOperation } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (providedCharge) {
      setResolvedCharge(providedCharge);
      setChargeMissing(false);
    }
  }, [providedCharge]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const loadContext = useCallback(async () => {
    if (!authority.can_access) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setLoadError('');
    setSubmitError('');
    setValidation('');

    try {
      let activeCharge = providedCharge;
      if (!activeCharge) {
        const view = await chargesApi.view(office, requestId, 1, controller.signal);
        if (controller.signal.aborted) return;
        if (!view.charge) {
          setResolvedCharge(null);
          setChargeMissing(true);
        } else {
          activeCharge = {
            charge_id: view.charge.id,
            charge_version: view.charge.version,
            request_id: view.request_id,
            protocol: view.protocol,
            origin,
            customer_name: customerName,
            service_summary: view.items.map((i) => i.name).join(' · ') || 'Serviços do atendimento',
            due_cents: view.charge.due_cents,
            paid_cents: view.charge.allocated_cents,
            balance_cents: view.charge.balance_cents,
            status: view.charge.status,
            installments: view.charge.installments,
          };
          setResolvedCharge(activeCharge);
          setChargeMissing(false);
        }
      }

      const [cfg, dash] = await Promise.all([
        loadAllCashConfigurationPages(office, null, controller.signal),
        cashApi.dashboard(office, 'own', 1, 5, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setConfiguration(cfg);
      setDashboard(dash);

      const openSession = dash.sessions.find((s) => s.is_self && s.status === 'open');
      if (openSession) {
        const stmt = await cashApi.statement(office, openSession.id, 1, controller.signal);
        if (controller.signal.aborted) return;
        setSessionVersion(stmt.session.version);
        setSessionCanOperate(Boolean(stmt.session.can_operate && stmt.can_receive));
      } else {
        setSessionVersion(null);
        setSessionCanOperate(false);
      }

      if (activeCharge && activeCharge.balance_cents > 0) {
        setAmountInput((prev) => prev || moneyInput(activeCharge.balance_cents));
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      const err: CashError | { message: string } =
        cause && typeof cause === 'object' && 'status' in cause
          ? (cause as CashError)
          : chargesError(cause);
      setLoadError(err.message || 'Não foi possível carregar os dados financeiros.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [authority.can_access, customerName, office, origin, providedCharge, requestId]);

  useEffect(() => {
    if (open) {
      void loadContext();
    }
  }, [open, loadContext]);

  if (!authority.can_access) {
    return null;
  }

  const readiness = evaluateCashSetupReadiness(configuration, dashboard?.sessions ?? []);
  const compatibleMethods = readiness.compatible_methods_for_open_session;
  const selectedMethod =
    compatibleMethods.find((m) => m.id === methodId) ??
    (methodId === '' ? compatibleMethods[0] : undefined);
  const destinationAccount = selectedMethod
    ? configuration?.accounts.find((a) => a.id === selectedMethod.destination_account_id)
    : undefined;

  const amountCents = cashAmountToCents(amountInput);
  const presentedCents = cashAmountToCents(presentedInput);
  const feeCents = cashAmountToCents(feeInput);
  const chargeEligible = isChargeEligibleForManualPayment(resolvedCharge);
  const amountValid =
    resolvedCharge !== null &&
    amountCents !== null &&
    cashInteger(amountCents, 1) &&
    amountCents <= resolvedCharge.balance_cents;

  const returnTarget: ManualPaymentReturnTarget = {
    pathname: location.pathname,
    label: returnLabel,
    office_id: office,
    request_id: requestId,
    charge: resolvedCharge ?? undefined,
  };

  function goToCashSetup(targetTab: 'configuration' | 'own') {
    const navState: CashNavigationState = {
      office_id: office,
      tab: targetTab,
      open_manual_payment: true,
      preselected_charge: resolvedCharge ?? undefined,
      return_to: returnTarget,
    };
    navigate(paths.cash, { state: navState });
  }

  async function handleDirectSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled || !authority.can_confirm_directly) return;
    if (!resolvedCharge || !readiness.open_own_session || !sessionVersion || !selectedMethod) {
      setValidation('Confira o caixa aberto, a cobrança e a forma de pagamento.');
      return;
    }
    if (!amountValid || amountCents === null) {
      setValidation('Informe um valor positivo até o saldo em aberto da cobrança.');
      return;
    }
    if (
      selectedMethod.type === 'cash' &&
      (presentedCents === null || !cashInteger(presentedCents, 1) || presentedCents < amountCents)
    ) {
      setValidation('Informe o valor apresentado em dinheiro, igual ou maior que o valor recebido.');
      return;
    }
    if (
      selectedMethod.type === 'card' &&
      (feeCents === null || !cashInteger(feeCents) || feeCents > amountCents)
    ) {
      setValidation('Informe a taxa do cartão (entre zero e o valor bruto).');
      return;
    }

    const baseEvidence = evidence.trim();
    if (baseEvidence.length < 5) {
      setValidation('Informe a observação ou evidência da conferência manual (mínimo 5 caracteres).');
      return;
    }
    const dateSuffix = operationDate ? ` (Data da operação: ${operationDate.split('-').reverse().join('/')})` : '';
    const finalEvidence =
      baseEvidence.length + dateSuffix.length <= 500 && !baseEvidence.includes('Data da operação:')
        ? `${baseEvidence}${dateSuffix}`
        : baseEvidence;

    const payload = {
      kind: 'record' as const,
      session_id: readiness.open_own_session.id,
      payment_method_id: selectedMethod.id,
      status: 'confirmed' as const,
      allocations: [
        {
          charge_id: resolvedCharge.charge_id,
          expected_charge_version: resolvedCharge.charge_version,
          amount_cents: amountCents,
        },
      ],
      presented_cents: selectedMethod.type === 'cash' ? presentedCents : null,
      fee_cents: selectedMethod.type === 'card' ? feeCents! : 0,
      settlement: selectedMethod.type === 'card' ? settlement : ('not_applicable' as const),
      settled_on: selectedMethod.type === 'card' && settlement === 'settled' ? settledOn : null,
      external_reference: externalReference.trim() || null,
      evidence: finalEvidence,
    };

    const signature = JSON.stringify(payload);
    const operation: PaymentOperation =
      attemptRef.current?.signature === signature
        ? attemptRef.current.operation
        : {
            ...payload,
            expected_version: sessionVersion,
            idempotency_key: crypto.randomUUID(),
          };

    if (!validPaymentOperation(operation)) {
      setValidation(
        'Confira os valores, a referência externa, a data de liquidação e a evidência (5 a 500 caracteres).',
      );
      return;
    }

    attemptRef.current = { signature, operation };
    setBusy(true);
    setValidation('');
    setSubmitError('');
    setFeedback('');

    try {
      await cashApi.payment(office, operation);
      attemptRef.current = null;
      noticesChanged();
      const msg = `Pagamento manual de ${cashMoney(amountCents)} confirmado para ${resolvedCharge.protocol}.`;
      setFeedback(msg);
      setEvidence('');
      setExternalReference('');
      setPresentedInput('');
      setOpen(false);
      onPaymentRecorded?.(msg);
    } catch (cause) {
      const err = cashError(cause);
      if (err.status === 409) {
        attemptRef.current = null;
        setSubmitError(
          'A cobrança ou o caixa foi alterado em outra operação. Atualize os dados antes de confirmar novamente.',
        );
        void loadContext();
      } else {
        setSubmitError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="jn-manual-payment-entry"
      aria-label={`Pagamento manual da solicitação ${protocol}`}
    >
      <div className="account-actions">
        <button
          type="button"
          className={open ? 'secondary-button' : 'primary-button'}
          disabled={disabled || busy}
          aria-expanded={open}
          onClick={() => {
            setFeedback('');
            setSubmitError('');
            setValidation('');
            setShowApprovalForm(false);
            setOpen((v) => !v);
          }}
        >
          <Banknote size={18} aria-hidden="true" />
          <span>{open ? 'Ocultar pagamento manual' : 'Informar pagamento manualmente'}</span>
        </button>
      </div>

      {feedback && (
        <p role="status" className="form-feedback">
          {feedback}
        </p>
      )}

      {open && (
        <div className="jn-manual-payment-card">
          <div className="team-section-heading">
            <h3>Informar pagamento manualmente · {protocol}</h3>
            <div className="account-actions">
              <button
                type="button"
                className="operation-icon-button"
                aria-label="Atualizar dados de pagamento manual"
                disabled={loading || busy}
                onClick={() => void loadContext()}
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="operation-icon-button"
                aria-label="Fechar pagamento manual"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
          </div>

          {authority.denial_reason && (
            <p role="alert" className="form-feedback error">
              {authority.denial_reason}
            </p>
          )}

          {loadError && (
            <div className="jn-inline-alert">
              <p role="alert" className="form-feedback error">
                {loadError}
              </p>
              <button
                type="button"
                className="secondary-button"
                disabled={loading}
                onClick={() => void loadContext()}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {!loadError && !authority.denial_reason && loading && !configuration && (
            <p className="customer-note">Consultando cobrança e situação do caixa...</p>
          )}

          {!loadError && !authority.denial_reason && chargeMissing && (
            <div className="cash-setup-notice">
              <p className="customer-note">
                Esta solicitação ainda não possui cobrança cadastrada. Registre a cobrança primeiro
                para informar o recebimento manual sem duplicar obrigações.
              </p>
              <div className="account-actions">
                <Link
                  className="primary-button"
                  to={paths.charges}
                  state={{ office_id: office, request_id: requestId }}
                >
                  Ir para Cobranças
                </Link>
              </div>
            </div>
          )}

          {!loadError && !authority.denial_reason && resolvedCharge && !chargeEligible && (
            <p className="customer-note">
              {resolvedCharge.status === 'cancelled' || resolvedCharge.status === 'cancelada'
                ? 'Esta cobrança está cancelada e não aceita novos recebimentos.'
                : resolvedCharge.balance_cents <= 0
                  ? 'Esta cobrança já está quitada (saldo em aberto zerado).'
                  : 'Cobrança sem saldo disponível para recebimento manual.'}
            </p>
          )}

          {!loadError &&
            !authority.denial_reason &&
            resolvedCharge &&
            chargeEligible &&
            configuration && (
              <>
                <dl className="jn-breakdown-grid" aria-label="Resumo oficial da cobrança">
                  <div>
                    <dt>Protocolo</dt>
                    <dd>
                      <strong>{resolvedCharge.protocol}</strong>
                      {resolvedCharge.origin ? ` · ${ORIGIN_LABELS[resolvedCharge.origin]}` : ''}
                    </dd>
                  </div>
                  {resolvedCharge.customer_name && (
                    <div>
                      <dt>Cliente</dt>
                      <dd>{resolvedCharge.customer_name}</dd>
                    </div>
                  )}
                  <div>
                    <dt>Serviço</dt>
                    <dd>{resolvedCharge.service_summary}</dd>
                  </div>
                  <div>
                    <dt>Valor original</dt>
                    <dd>{cashMoney(resolvedCharge.due_cents)}</dd>
                  </div>
                  <div>
                    <dt>Já recebido</dt>
                    <dd>{cashMoney(resolvedCharge.paid_cents)}</dd>
                  </div>
                  <div>
                    <dt>Saldo restante</dt>
                    <dd>
                      <strong>{cashMoney(resolvedCharge.balance_cents)}</strong>
                    </dd>
                  </div>
                </dl>

                {!readiness.setup_complete ||
                (readiness.has_open_own_session && compatibleMethods.length === 0) ? (
                  <div className="cash-setup-notice" role="status">
                    <p>
                      <strong>{MANUAL_PAYMENT_SETUP_GUIDANCE}</strong>
                    </p>
                    <ul className="jn-setup-checklist" aria-label="Requisitos financeiros pendentes">
                      {readiness.missing_requirements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="account-actions">
                      {authority.can_configure_finance ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={() => goToCashSetup('configuration')}
                        >
                          <Settings size={17} aria-hidden="true" />
                          <span>Configurar financeiro</span>
                        </button>
                      ) : (
                        <p className="customer-note">
                          Solicite ao super administrador ou gestor autorizado do escritório a
                          configuração de unidade, contas e formas de pagamento no Caixa.
                        </p>
                      )}
                    </div>
                  </div>
                ) : !readiness.has_open_own_session ? (
                  <div className="cash-setup-notice" role="status">
                    <p>
                      <strong>{MANUAL_PAYMENT_OPEN_CASH_GUIDANCE}</strong>
                    </p>
                    <div className="account-actions">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => goToCashSetup('own')}
                      >
                        <DoorOpen size={17} aria-hidden="true" />
                        <span>Abrir meu caixa</span>
                      </button>
                    </div>
                  </div>
                ) : !sessionCanOperate ? (
                  <div className="cash-setup-notice" role="alert">
                    <p className="customer-note">
                      Sua sessão de caixa aberta não está habilitada para operar novos recebimentos
                      no momento. Atualize ou confira o Caixa.
                    </p>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => goToCashSetup('own')}
                    >
                      Abrir área do Caixa
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="customer-note">
                      Operador responsável: <strong>{context?.display_name ?? 'Integrante autenticado'}</strong> ·
                      Caixa aberto em <strong>{readiness.open_own_session!.unit_name}</strong> ·{' '}
                      {authority.can_confirm_directly
                        ? 'Seu perfil pode confirmar este pagamento manual diretamente.'
                        : 'Seu perfil exige envio para aprovação de um administrador ou super administrador autorizado.'}
                    </p>

                    {!showApprovalForm ? (
                      <form onSubmit={(e) => void handleDirectSubmit(e)} noValidate>
                        <fieldset disabled={busy || disabled}>
                          <div className="cash-config-grid">
                            <label className="team-field">
                              Forma de pagamento
                              <select
                                value={selectedMethod?.id ?? ''}
                                onChange={(e) => {
                                  attemptRef.current = null;
                                  setMethodId(e.target.value);
                                  setPresentedInput('');
                                  setFeeInput('0,00');
                                  setSettlement('pending');
                                  setSettledOn('');
                                }}
                              >
                                {compatibleMethods.map((m) => {
                                  const acc = configuration.accounts.find(
                                    (a) => a.id === m.destination_account_id,
                                  );
                                  return (
                                    <option key={m.id} value={m.id}>
                                      {m.name} · {acc?.name ?? 'Conta vinculada'}
                                    </option>
                                  );
                                })}
                              </select>
                            </label>

                            <label className="team-field">
                              Valor recebido (R$)
                              <input
                                inputMode="decimal"
                                maxLength={14}
                                value={amountInput}
                                onChange={(e) => {
                                  attemptRef.current = null;
                                  setAmountInput(e.target.value);
                                }}
                              />
                            </label>

                            <label className="team-field">
                              Data da operação
                              <input
                                type="date"
                                value={operationDate}
                                onChange={(e) => {
                                  attemptRef.current = null;
                                  setOperationDate(e.target.value);
                                }}
                              />
                            </label>

                            <label className="team-field">
                              Conta de destino
                              <input
                                readOnly
                                value={
                                  destinationAccount
                                    ? `${destinationAccount.name} (${readiness.open_own_session!.unit_name})`
                                    : 'Definida pela forma de pagamento'
                                }
                              />
                            </label>

                            {selectedMethod?.type === 'cash' && (
                              <label className="team-field">
                                Valor apresentado em dinheiro (R$)
                                <input
                                  inputMode="decimal"
                                  maxLength={14}
                                  placeholder={amountInput}
                                  value={presentedInput}
                                  onChange={(e) => {
                                    attemptRef.current = null;
                                    setPresentedInput(e.target.value);
                                  }}
                                />
                              </label>
                            )}

                            {selectedMethod?.type === 'card' && (
                              <>
                                <label className="team-field">
                                  Taxa do cartão (R$)
                                  <input
                                    inputMode="decimal"
                                    maxLength={14}
                                    value={feeInput}
                                    onChange={(e) => {
                                      attemptRef.current = null;
                                      setFeeInput(e.target.value);
                                    }}
                                  />
                                </label>
                                <label className="team-field">
                                  Liquidação do cartão
                                  <select
                                    value={settlement}
                                    onChange={(e) =>
                                      setSettlement(e.target.value as 'pending' | 'settled')
                                    }
                                  >
                                    <option value="pending">Pendente de liquidação</option>
                                    <option value="settled">Liquidado manualmente</option>
                                  </select>
                                </label>
                                {settlement === 'settled' && (
                                  <label className="team-field">
                                    Data da liquidação
                                    <input
                                      type="date"
                                      value={settledOn}
                                      onChange={(e) => setSettledOn(e.target.value)}
                                    />
                                  </label>
                                )}
                              </>
                            )}

                            <label className="team-field cash-wide">
                              Referência externa / comprovante (opcional)
                              <input
                                maxLength={120}
                                placeholder="Ex.: E2E Pix, NSU da maquininha ou comprovante de transferência"
                                value={externalReference}
                                onChange={(e) => {
                                  attemptRef.current = null;
                                  setExternalReference(e.target.value);
                                }}
                              />
                            </label>

                            <label className="team-field cash-wide">
                              Observação / evidência da conferência manual
                              <textarea
                                rows={2}
                                maxLength={500}
                                placeholder="Descreva como o pagamento foi conferido"
                                value={evidence}
                                onChange={(e) => {
                                  attemptRef.current = null;
                                  setEvidence(e.target.value);
                                }}
                              />
                            </label>
                          </div>
                        </fieldset>

                        {selectedMethod && (
                          <p className="customer-note">
                            <strong>{MANUAL_METHOD_TYPE_GUIDANCE[selectedMethod.type].label}:</strong>{' '}
                            {MANUAL_METHOD_TYPE_GUIDANCE[selectedMethod.type].description}
                          </p>
                        )}

                        {selectedMethod?.type === 'cash' &&
                          amountValid &&
                          presentedCents !== null &&
                          presentedCents >= (amountCents ?? 0) && (
                            <p className="customer-note">
                              Troco calculado:{' '}
                              <strong>{cashMoney(presentedCents - (amountCents ?? 0))}</strong>
                            </p>
                          )}

                        {validation && (
                          <p role="alert" className="form-feedback error">
                            {validation}
                          </p>
                        )}
                        {submitError && (
                          <p role="alert" className="form-feedback error">
                            {submitError}
                          </p>
                        )}

                        <div className="account-actions">
                          {authority.can_confirm_directly ? (
                            <button
                              type="submit"
                              className="primary-button"
                              disabled={busy || disabled || !selectedMethod}
                            >
                              <CheckCircle2 size={18} aria-hidden="true" />
                              <span>Confirmar pagamento manual</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="primary-button"
                              disabled={busy || disabled || !selectedMethod || !amountValid}
                              onClick={() => {
                                if (selectedMethod?.type === 'card' && (
                                  feeCents === null || amountCents === null || feeCents < 0 || feeCents > amountCents ||
                                  (settlement === 'settled' && !validChargeDate(settledOn))
                                )) {
                                  setValidation('Informe a taxa e confira a data de liquidação do cartão.');
                                  return;
                                }
                                setValidation('');
                                setShowApprovalForm(true);
                              }}
                            >
                              Solicitar autorização
                            </button>
                          )}
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={busy}
                            onClick={() => setOpen(false)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      selectedMethod &&
                      amountCents !== null && (
                        <ManualPaymentApprovalForm
                          office={office}
                          chargeId={resolvedCharge.charge_id}
                          chargeVersion={resolvedCharge.charge_version}
                          requestId={resolvedCharge.request_id}
                          protocol={resolvedCharge.protocol}
                          sessionId={readiness.open_own_session!.id}
                          unitId={readiness.open_own_session!.unit_id}
                          unitName={readiness.open_own_session!.unit_name}
                          destinationAccountId={selectedMethod.destination_account_id}
                          destinationAccountName={destinationAccount?.name}
                          paymentMethodId={selectedMethod.id}
                          paymentMethodName={selectedMethod.name}
                          amountCents={amountCents}
                          cardDetails={selectedMethod.type === 'card' && feeCents !== null ? {
                            fee_cents: feeCents,
                            settled_on: settlement === 'settled' ? settledOn : null,
                          } : undefined}
                          initialExternalReference={externalReference}
                          initialJustification={evidence}
                          disabled={busy || disabled}
                          onSubmitted={() => {
                            const msg = `Solicitação de autorização de pagamento manual enviada para ${resolvedCharge.protocol}.`;
                            setShowApprovalForm(false);
                            setOpen(false);
                            setFeedback(msg);
                            onPaymentRecorded?.(msg);
                          }}
                          onCancel={() => setShowApprovalForm(false)}
                        />
                      )
                    )}
                  </>
                )}
              </>
            )}
        </div>
      )}
    </section>
  );
}
