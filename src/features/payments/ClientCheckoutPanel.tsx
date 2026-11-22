import { useEffect, useRef, useState } from 'react';
import { Check, Copy, CreditCard, QrCode, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  checkoutMethodLabels,
  clientPaymentStateLabels,
  computeInstallmentOptions,
  settlementStageLabels,
  UNSUPPORTED_CAPABILITY_LABEL,
  type CheckoutIntent,
  type CheckoutMethod,
  type ClientCheckoutSummary,
} from '../../../shared/paymentCheckout';
import { cashMoney } from '../cash/CashSessions';
import { paymentCheckoutApi, PaymentCheckoutError } from './checkoutApi';

type Props = {
  office: string;
  chargeId: string;
  protocol: string;
  dueCents: number;
  paidCents: number;
  balanceCents: number;
  chargeStatus: string;
  services: string[];
  onRefreshFinance: () => void;
};

const ALL_CLIENT_METHODS: CheckoutMethod[] = [
  'pix_qr',
  'pix_copy_paste',
  'credit_card',
  'installments',
  'debit_card',
];

export function ClientCheckoutPanel({
  office,
  chargeId,
  protocol,
  dueCents,
  paidCents,
  balanceCents,
  chargeStatus,
  services,
  onRefreshFinance,
}: Props) {
  const [summary, setSummary] = useState<ClientCheckoutSummary | null>(null);
  const [activeIntent, setActiveIntent] = useState<CheckoutIntent | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<CheckoutMethod>('pix_qr');
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [statusFeedback, setStatusFeedback] = useState('');
  const attemptRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setStatusFeedback('');
    void paymentCheckoutApi
      .clientSummary(office, chargeId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setSummary(data);
        setActiveIntent(data.active_intent);
        if (data.available_methods.length > 0 && !data.available_methods.includes(selectedMethod)) {
          setSelectedMethod(data.available_methods[0]);
        }
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const err = cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
        setError(err.message);
      });
    return () => controller.abort();
  }, [office, chargeId]);

  const effectiveBalance = summary?.charge.balance_cents || balanceCents;
  const effectiveOriginal = summary?.charge.original_cents || dueCents;
  const approvedDiscount = summary?.charge.approved_discount_cents ?? 0;
  const authorizedSurcharge = summary?.charge.authorized_surcharge_cents ?? 0;
  const effectiveFinal = summary?.charge.final_cents || dueCents;
  const effectiveState = activeIntent?.state ?? summary?.payment_state ?? (balanceCents === 0 ? 'confirmed' : 'provider_unconfigured');
  const providerConfigured = Boolean(summary?.provider_configured);
  const availableMethods = summary?.available_methods ?? [];
  const installmentOptions = computeInstallmentOptions(
    effectiveBalance,
    summary?.max_installments ?? 1,
    summary?.min_installment_cents ?? 2000,
  );

  async function initiatePayment() {
    if (busy || !summary || !providerConfigured || !availableMethods.includes(selectedMethod) || effectiveBalance <= 0) {
      return;
    }
    const count = selectedMethod === 'installments' ? installmentsCount : 1;
    const signature = `${chargeId}:${summary.charge.charge_version}:${selectedMethod}:${count}`;
    if (attemptRef.current?.signature !== signature) {
      attemptRef.current = { signature, key: `pay-${crypto.randomUUID()}` };
    }
    setBusy(true);
    setError('');
    setStatusFeedback('');
    try {
      const intent = await paymentCheckoutApi.createClientIntent({
        office_id: office,
        charge_id: chargeId,
        expected_charge_version: summary.charge.charge_version,
        method: selectedMethod,
        installments_count: count,
        idempotency_key: attemptRef.current.key,
      });
      setActiveIntent(intent);
      setStatusFeedback('Cobrança eletrônica gerada. A confirmação será atualizada automaticamente após retorno oficial do provedor.');
    } catch (cause) {
      const err = cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
      setError(err.message);
      if (err.status === 409) {
        attemptRef.current = null;
        onRefreshFinance();
      }
    } finally {
      setBusy(false);
    }
  }

  async function refreshIntentStatus() {
    if (busy || !activeIntent?.id) return;
    setBusy(true);
    setError('');
    try {
      const updated = await paymentCheckoutApi.intentStatus(office, activeIntent.id);
      setActiveIntent(updated);
      setStatusFeedback(`Situação atualizada: ${clientPaymentStateLabels[updated.state]}.`);
      if (updated.state === 'confirmed' || updated.state === 'partially_received') {
        onRefreshFinance();
      }
    } catch (cause) {
      const err = cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function copyPixCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setStatusFeedback('Selecione e copie o código Pix manualmente.');
    }
  }

  return (
    <section className="jn-checkout-card" aria-label={`Pagamento da cobrança ${protocol}`}>
      <div className="jn-checkout-header">
        <div>
          <h3>Resumo e pagamento · {protocol}</h3>
          <p className="customer-note">{summary?.charge.service_summary || services.join(' · ')}</p>
        </div>
        <span className={`jn-payment-state jn-state-${effectiveState}`}>
          {clientPaymentStateLabels[effectiveState]}
        </span>
      </div>

      <dl className="jn-breakdown-grid" aria-label="Detalhamento financeiro">
        <div>
          <dt>Valor original</dt>
          <dd>{cashMoney(effectiveOriginal)}</dd>
        </div>
        <div>
          <dt>Desconto aprovado</dt>
          <dd>{approvedDiscount > 0 ? `- ${cashMoney(approvedDiscount)}` : cashMoney(0)}</dd>
        </div>
        <div>
          <dt>Acréscimos autorizados</dt>
          <dd>{cashMoney(authorizedSurcharge)}</dd>
        </div>
        <div>
          <dt>Valor final</dt>
          <dd><strong>{cashMoney(effectiveFinal)}</strong></dd>
        </div>
        <div>
          <dt>Já aplicado</dt>
          <dd>{cashMoney(summary?.charge.paid_cents ?? paidCents)}</dd>
        </div>
        <div>
          <dt>Saldo restante</dt>
          <dd><strong>{cashMoney(effectiveBalance)}</strong></dd>
        </div>
      </dl>

      {summary?.charge.receipt && (
        <div className="jn-receipt-banner" role="status">
          <strong>Comprovante / Recibo #{summary.charge.receipt.number}</strong>
          <span>
            Emitido em {new Date(summary.charge.receipt.issued_at).toLocaleString('pt-BR')} ·{' '}
            {cashMoney(summary.charge.receipt.amount_cents)}
          </span>
        </div>
      )}

      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {statusFeedback && (
        <p role="status" className="form-feedback">
          {statusFeedback}
        </p>
      )}

      {chargeStatus === 'open' && effectiveBalance > 0 && (
        <>
          {!providerConfigured ? (
            <div className="jn-provider-unconfigured" role="note">
              <ShieldAlert size={18} aria-hidden="true" />
              <div>
                <strong>Provedor não configurado</strong>
                <p>
                  {summary?.provider_message ||
                    'O pagamento online ainda não está habilitado para este escritório. A cobrança oficial já está vinculada à sua solicitação; fale com a equipe para receber orientações de pagamento.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="jn-method-selector">
              <fieldset disabled={busy}>
                <legend>Escolha o meio de pagamento</legend>
                <div className="jn-method-grid">
                  {ALL_CLIENT_METHODS.map((method) => {
                    const supported = availableMethods.includes(method);
                    return (
                      <label
                        key={method}
                        className={`jn-method-option${selectedMethod === method ? ' is-selected' : ''}${
                          !supported ? ' is-disabled' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name={`checkout-method-${chargeId}`}
                          value={method}
                          disabled={!supported || busy}
                          checked={selectedMethod === method}
                          onChange={() => {
                            setSelectedMethod(method);
                            setInstallmentsCount(1);
                          }}
                        />
                        <span>
                          <strong>{checkoutMethodLabels[method]}</strong>
                          {!supported && <small>{UNSUPPORTED_CAPABILITY_LABEL}</small>}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {selectedMethod === 'installments' && installmentOptions.length > 0 && (
                  <label className="team-field jn-installments-field">
                    Parcelamento no cartão
                    <select
                      value={installmentsCount}
                      onChange={(e) => setInstallmentsCount(Number(e.target.value))}
                    >
                      {installmentOptions.map((opt) => (
                        <option key={opt.count} value={opt.count}>
                          {opt.count}x de {cashMoney(opt.per_installment_cents)} (Total {cashMoney(opt.total_cents)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="account-actions">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy || !availableMethods.includes(selectedMethod)}
                    onClick={() => void initiatePayment()}
                  >
                    {selectedMethod.startsWith('pix') ? (
                      <QrCode size={18} aria-hidden="true" />
                    ) : (
                      <CreditCard size={18} aria-hidden="true" />
                    )}
                    <span>
                      {selectedMethod.startsWith('pix') ? 'Gerar cobrança Pix' : 'Prosseguir para pagamento'}
                    </span>
                  </button>
                </div>
              </fieldset>
            </div>
          )}
        </>
      )}

      {activeIntent && (
        <div className="jn-active-intent" aria-live="polite">
          <div className="jn-intent-head">
            <strong>
              {checkoutMethodLabels[activeIntent.method]} · {cashMoney(activeIntent.amount_cents)}
            </strong>
            <span>{settlementStageLabels[activeIntent.settlement_stage]}</span>
          </div>
          {activeIntent.provider_label && (
            <p className="customer-note">
              Provedor: {activeIntent.provider_label}
              {activeIntent.expires_at
                ? ` · Validade até ${new Date(activeIntent.expires_at).toLocaleString('pt-BR')}`
                : ''}
            </p>
          )}
          {activeIntent.pix_copy_paste && (
            <div className="jn-pix-box">
              <label className="team-field">
                Pix Copia e Cola
                <textarea readOnly rows={2} value={activeIntent.pix_copy_paste} />
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void copyPixCode(activeIntent.pix_copy_paste!)}
              >
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                <span>{copied ? 'Código copiado' : 'Copiar código Pix'}</span>
              </button>
            </div>
          )}
          {activeIntent.safe_message && <p className="customer-note">{activeIntent.safe_message}</p>}
          <div className="account-actions">
            <button
              type="button"
              className="team-text-button"
              disabled={busy}
              onClick={() => void refreshIntentStatus()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              <span>Conferir confirmação oficial</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
