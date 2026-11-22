import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { EligibleApprover } from '../../../shared/financialApprovals';
import { cashMoney } from '../cash/CashSessions';
import { financialApprovalsApi, FinancialApprovalsError } from './api';

type Props = {
  office: string;
  chargeId: string;
  chargeVersion: number;
  requestId: string;
  protocol: string;
  sessionId: string;
  unitId: string;
  paymentMethodId: string;
  paymentMethodName: string;
  amountCents: number;
  disabled?: boolean;
  onSubmitted: () => void;
  onCancel: () => void;
};

export function ManualPaymentApprovalForm({
  office,
  chargeId,
  chargeVersion,
  requestId,
  protocol,
  sessionId,
  unitId,
  paymentMethodId,
  paymentMethodName,
  amountCents,
  disabled = false,
  onSubmitted,
  onCancel,
}: Props) {
  const [approvers, setApprovers] = useState<EligibleApprover[]>([]);
  const [backendReady, setBackendReady] = useState(true);
  const [approverId, setApproverId] = useState('');
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const keyRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void financialApprovalsApi
      .approvers(office, 'manual_payment', controller.signal)
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || disabled) return;
    if (!approverId) {
      setError('Selecione um administrador ou super administrador autorizado deste escritório.');
      return;
    }
    if (justification.trim().length < 5) {
      setError('Informe a justificativa da conferência manual (mínimo 5 caracteres).');
      return;
    }
    keyRef.current ??= `mpa-${crypto.randomUUID()}`;
    setBusy(true);
    setError('');
    try {
      await financialApprovalsApi.requestManualPayment({
        office_id: office,
        charge_id: chargeId,
        charge_version: chargeVersion,
        request_id: requestId,
        session_id: sessionId,
        unit_id: unitId,
        payment_method_id: paymentMethodId,
        approver_user_id: approverId,
        amount_cents: amountCents,
        justification: justification.trim(),
        idempotency_key: keyRef.current,
      });
      keyRef.current = null;
      window.dispatchEvent(new Event('jn:notices-changed'));
      onSubmitted();
    } catch (cause) {
      const err = cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="jn-approval-box" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <h4>Solicitar autorização de pagamento manual</h4>
      <p className="customer-note">
        Seu perfil não possui permissão direta para confirmar pagamentos manuais. Envie esta solicitação para um
        aprovador autorizado do mesmo escritório.
      </p>

      <dl className="jn-breakdown-grid">
        <div>
          <dt>Protocolo</dt>
          <dd>{protocol}</dd>
        </div>
        <div>
          <dt>Forma de pagamento</dt>
          <dd>{paymentMethodName}</dd>
        </div>
        <div>
          <dt>Valor a registrar</dt>
          <dd><strong>{cashMoney(amountCents)}</strong></dd>
        </div>
      </dl>

      {!backendReady && (
        <p role="note" className="customer-note">
          O fluxo de autorizações financeiras está aguardando ativação da persistência no servidor.
        </p>
      )}

      <fieldset disabled={busy || disabled || !backendReady}>
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
          Justificativa e conferência realizada
          <textarea
            rows={2}
            maxLength={300}
            value={justification}
            placeholder="Informe como o recebimento foi conferido e o motivo do registro manual"
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

      <div className="account-actions">
        <button type="submit" className="primary-button" disabled={busy || disabled || !backendReady}>
          Solicitar autorização
        </button>
        <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
