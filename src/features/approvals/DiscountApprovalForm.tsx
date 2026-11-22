import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  calculateCommercialDiscount,
  type DiscountMode,
  type EligibleApprover,
} from '../../../shared/financialApprovals';
import { chargeAmountToCents } from '../../../shared/charges';
import { cashMoney } from '../cash/CashSessions';
import { financialApprovalsApi, FinancialApprovalsError } from './api';

type Props = {
  office: string;
  chargeId: string;
  chargeVersion: number;
  requestId: string;
  protocol: string;
  originalCents: number;
  balanceCents: number;
  disabled?: boolean;
  onSubmitted: (message: string) => void;
};

export function DiscountApprovalForm({
  office,
  chargeId,
  chargeVersion,
  requestId,
  protocol,
  originalCents,
  balanceCents,
  disabled = false,
  onSubmitted,
}: Props) {
  const [approvers, setApprovers] = useState<EligibleApprover[]>([]);
  const [backendReady, setBackendReady] = useState(true);
  const [approverId, setApproverId] = useState('');
  const [mode, setMode] = useState<DiscountMode>('amount_cents');
  const [amountInput, setAmountInput] = useState('');
  const [percentInput, setPercentInput] = useState('');
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void financialApprovalsApi
      .approvers(office, 'discount', controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setApprovers(res.items);
        setBackendReady(res.backend_ready);
        if (res.items.length === 1) setApproverId(res.items[0].user_id);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const err = cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
        setError(err.message);
      });
    return () => controller.abort();
  }, [office]);

  const parsedValueCents = chargeAmountToCents(amountInput) ?? 0;
  const parsedPercent = Number(percentInput.replace(',', '.'));
  const calc = calculateCommercialDiscount({
    originalCents,
    balanceCents,
    mode,
    valueCents: parsedValueCents,
    percent: parsedPercent,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    if (!calc.valid) {
      setError(calc.error ?? 'Informe um desconto válido.');
      return;
    }
    if (!approverId) {
      setError('Selecione um administrador ou super administrador autorizado deste escritório.');
      return;
    }
    if (justification.trim().length < 5) {
      setError('Informe a justificativa do desconto (mínimo 5 caracteres).');
      return;
    }
    keyRef.current ??= `disc-${crypto.randomUUID()}`;
    setBusy(true);
    setError('');
    try {
      await financialApprovalsApi.requestDiscount({
        office_id: office,
        charge_id: chargeId,
        charge_version: chargeVersion,
        request_id: requestId,
        approver_user_id: approverId,
        mode,
        discount_cents: calc.discount_cents,
        discount_percent: calc.discount_percent,
        justification: justification.trim(),
        idempotency_key: keyRef.current,
      });
      keyRef.current = null;
      setAmountInput('');
      setPercentInput('');
      setJustification('');
      window.dispatchEvent(new Event('jn:notices-changed'));
      onSubmitted(
        `Solicitação de autorização de desconto (${cashMoney(calc.discount_cents)}) enviada ao aprovador.`,
      );
    } catch (cause) {
      const err = cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="service-section">
      <summary>Solicitar autorização de desconto</summary>
      <form className="jn-approval-box" onSubmit={(e) => void handleSubmit(e)} noValidate>
        <p className="customer-note">
          Descontos comerciais são registrados separadamente de taxas de cartão/adquirente. O valor só será alterado
          após aprovação formal do responsável selecionado.
        </p>

        {!backendReady && (
          <p role="note" className="customer-note">
            O envio de solicitações de autorização de desconto aguarda ativação da persistência no servidor.
          </p>
        )}

        <fieldset disabled={busy || disabled || !backendReady}>
          <div className="request-grid">
            <label className="team-field">
              Tipo do desconto
              <select
                value={mode}
                onChange={(e) => {
                  keyRef.current = null;
                  setMode(e.target.value as DiscountMode);
                  setError('');
                }}
              >
                <option value="amount_cents">Valor em reais (R$)</option>
                <option value="percent">Percentual (%)</option>
              </select>
            </label>

            {mode === 'amount_cents' ? (
              <label className="team-field">
                Valor do desconto (R$)
                <input
                  inputMode="decimal"
                  maxLength={14}
                  placeholder="Ex.: 25,00"
                  value={amountInput}
                  onChange={(e) => {
                    keyRef.current = null;
                    setAmountInput(e.target.value);
                  }}
                />
              </label>
            ) : (
              <label className="team-field">
                Percentual de desconto (%)
                <input
                  inputMode="decimal"
                  maxLength={6}
                  placeholder="Ex.: 10"
                  value={percentInput}
                  onChange={(e) => {
                    keyRef.current = null;
                    setPercentInput(e.target.value);
                  }}
                />
              </label>
            )}
          </div>

          <dl className="jn-breakdown-grid" aria-label="Prévia do desconto solicitado">
            <div>
              <dt>Cobrança ({protocol})</dt>
              <dd>{cashMoney(originalCents)}</dd>
            </div>
            <div>
              <dt>Saldo atual</dt>
              <dd>{cashMoney(balanceCents)}</dd>
            </div>
            <div>
              <dt>Desconto solicitado</dt>
              <dd>
                {calc.valid ? `${cashMoney(calc.discount_cents)} (${calc.discount_percent}%)` : '—'}
              </dd>
            </div>
            <div>
              <dt>Saldo final após aprovação</dt>
              <dd><strong>{calc.valid ? cashMoney(calc.final_cents) : '—'}</strong></dd>
            </div>
          </dl>

          <label className="team-field">
            Aprovador autorizado do escritório
            <select value={approverId} onChange={(e) => setApproverId(e.target.value)}>
              <option value="">Selecione um aprovador elegível</option>
              {approvers.map((item) => (
                <option key={item.user_id} value={item.user_id}>
                  {item.name} · {item.role_label}
                </option>
              ))}
            </select>
          </label>

          <label className="team-field">
            Justificativa do desconto
            <textarea
              rows={2}
              maxLength={300}
              value={justification}
              placeholder="Descreva o motivo comercial para análise do aprovador"
              onChange={(e) => {
                keyRef.current = null;
                setJustification(e.target.value);
              }}
            />
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="form-feedback error">
            {error}
          </p>
        )}

        <button type="submit" className="secondary-button" disabled={busy || disabled || !backendReady}>
          Solicitar autorização de desconto
        </button>
      </form>
    </details>
  );
}
