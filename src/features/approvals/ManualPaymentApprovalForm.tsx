import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isValidIsoDate, type EligibleApprover } from '../../../shared/financialApprovals';
import { cashMoney } from '../cash/CashSessions';
import { financialApprovalsApi, FinancialApprovalsError } from './api';
import '../settings/paymentProviders.css';

type Props = {
  office: string;
  chargeId: string;
  chargeVersion: number;
  requestId: string;
  protocol: string;
  sessionId: string;
  unitId: string;
  unitName?: string;
  destinationAccountId?: string | null;
  destinationAccountName?: string;
  paymentMethodId: string;
  paymentMethodName: string;
  amountCents: number;
  initialExternalReference?: string;
  initialJustification?: string;
  disabled?: boolean;
  onSubmitted: () => void;
  onCancel: () => void;
};

function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ManualPaymentApprovalForm({
  office,
  chargeId,
  chargeVersion,
  requestId,
  protocol,
  sessionId,
  unitId,
  unitName,
  destinationAccountId = null,
  destinationAccountName,
  paymentMethodId,
  paymentMethodName,
  amountCents,
  initialExternalReference = '',
  initialJustification = '',
  disabled = false,
  onSubmitted,
  onCancel,
}: Props) {
  const [approvers, setApprovers] = useState<EligibleApprover[]>([]);
  const [backendReady, setBackendReady] = useState(true);
  const [approverId, setApproverId] = useState('');
  const [operationDate, setOperationDate] = useState(todayIsoDate);
  const [externalReference, setExternalReference] = useState(initialExternalReference);
  const [justification, setJustification] = useState(initialJustification);
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
    if (!isValidIsoDate(operationDate)) {
      setError('Informe uma data da operação válida.');
      return;
    }
    if (justification.trim().length < 5) {
      setError('Informe a justificativa e a evidência da conferência manual (mínimo 5 caracteres).');
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
        destination_account_id: destinationAccountId,
        payment_method_id: paymentMethodId,
        approver_user_id: approverId,
        amount_cents: amountCents,
        operation_date: operationDate,
        external_reference: externalReference.trim() || null,
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
      <h4>Informar pagamento manualmente — Solicitar autorização</h4>
      <p className="customer-note">
        Seu perfil não possui permissão direta para confirmar pagamentos manuais. Envie os dados conferidos para um
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
          <dt>Valor recebido</dt>
          <dd><strong>{cashMoney(amountCents)}</strong></dd>
        </div>
        {(destinationAccountName || unitName) && (
          <div>
            <dt>Conta / unidade de destino</dt>
            <dd>{[destinationAccountName, unitName].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
      </dl>

      {!backendReady && (
        <p role="note" className="customer-note">
          O fluxo de autorizações financeiras está aguardando ativação da persistência no servidor.
        </p>
      )}

      <fieldset disabled={busy || disabled || !backendReady}>
        <div className="request-grid">
          <label className="team-field">
            Data da operação
            <input
              type="date"
              value={operationDate}
              onChange={(e) => {
                keyRef.current = null;
                setOperationDate(e.target.value);
              }}
            />
          </label>
          <label className="team-field">
            Referência externa verdadeira (quando houver)
            <input
              maxLength={120}
              placeholder="Ex.: E2E Pix, NSU ou comprovante bancário"
              value={externalReference}
              onChange={(e) => {
                keyRef.current = null;
                setExternalReference(e.target.value);
              }}
            />
          </label>
        </div>

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
          Observação / evidência da conferência realizada
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
