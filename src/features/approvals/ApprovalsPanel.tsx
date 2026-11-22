import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import {
  financialApprovalStatusLabels,
  type FinancialApprovalItem,
  type FinancialApprovalKind,
} from '../../../shared/financialApprovals';
import { cashMoney } from '../cash/CashSessions';
import { financialApprovalsApi, FinancialApprovalsError } from './api';

type Props = {
  office: string;
  activeSessionId?: string | null;
  highlightApprovalId?: string;
  onChanged?: () => void;
};

export function ApprovalsPanel({
  office,
  activeSessionId,
  highlightApprovalId,
  onChanged,
}: Props) {
  const [scope, setScope] = useState<'all' | 'assigned_to_me' | 'requested_by_me'>('all');
  const [kind, setKind] = useState<FinancialApprovalKind | 'all'>('all');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [items, setItems] = useState<FinancialApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [backendReady, setBackendReady] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void financialApprovalsApi
      .list(office, scope, kind, page, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setItems(res.items);
        setTotal(res.total);
        setBackendReady(res.backend_ready);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const err = cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
        setError(err.message);
      });
    return () => controller.abort();
  }, [office, scope, kind, page, revision]);

  async function decide(item: FinancialApprovalItem, decision: 'approve' | 'reject') {
    if (busyId) return;
    setBusyId(item.id);
    setError('');
    setFeedback('');
    try {
      await financialApprovalsApi.decide(item.id, {
        office_id: office,
        decision,
        expected_charge_version: item.charge_version_snapshot,
        note: (notes[item.id] ?? '').trim() || null,
        idempotency_key: `dec-${crypto.randomUUID()}`,
      });
      setFeedback(
        decision === 'approve'
          ? item.kind === 'discount'
            ? `Desconto aprovado e aplicado na cobrança ${item.protocol}.`
            : `Autorização de pagamento manual aprovada para ${item.protocol}.`
          : `Solicitação de autorização rejeitada para ${item.protocol}.`,
      );
      window.dispatchEvent(new Event('jn:notices-changed'));
      setRevision((n) => n + 1);
      onChanged?.();
    } catch (cause) {
      const err = cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function executeApproved(item: FinancialApprovalItem) {
    if (busyId || !activeSessionId) return;
    setBusyId(item.id);
    setError('');
    setFeedback('');
    try {
      await financialApprovalsApi.executePayment(item.id, {
        office_id: office,
        session_id: activeSessionId,
        expected_charge_version: item.charge_version_snapshot,
        idempotency_key: `exec-${crypto.randomUUID()}`,
      });
      setFeedback(`Pagamento manual autorizado concluído para ${item.protocol}.`);
      window.dispatchEvent(new Event('jn:notices-changed'));
      setRevision((n) => n + 1);
      onChanged?.();
    } catch (cause) {
      const err = cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="jn-approvals-panel" aria-label="Autorizações financeiras">
      <div className="team-section-heading">
        <div>
          <h2>Autorizações financeiras</h2>
          <p className="customer-note">
            Aprove ou rejeite solicitações de pagamento manual e descontos dentro do seu escritório. Alterações na
            cobrança invalidam automaticamente pedidos pendentes.
          </p>
        </div>
        <button
          type="button"
          className="operation-icon-button"
          aria-label="Atualizar autorizações"
          onClick={() => setRevision((n) => n + 1)}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </div>

      {!backendReady && (
        <p role="note" className="customer-note">
          As filas persistidas de autorização financeira aguardam ativação das funções de banco de dados.
        </p>
      )}
      {feedback && (
        <p role="status" className="form-feedback">
          {feedback}
        </p>
      )}
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}

      <div className="request-grid request-filters">
        <label className="team-field">
          Visão
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as typeof scope);
              setPage(1);
            }}
          >
            <option value="all">Todas do meu escopo</option>
            <option value="assigned_to_me">Aguardando minha aprovação</option>
            <option value="requested_by_me">Solicitadas por mim</option>
          </select>
        </label>
        <label className="team-field">
          Tipo
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setPage(1);
            }}
          >
            <option value="all">Todos os tipos</option>
            <option value="manual_payment">Pagamento manual</option>
            <option value="discount">Desconto</option>
          </select>
        </label>
      </div>

      {!items.length ? (
        <p className="team-empty">Nenhuma solicitação de autorização financeira encontrada neste filtro.</p>
      ) : (
        <ul className="finance-ledger" aria-label="Lista de autorizações financeiras">
          {items.map((item) => {
            const highlighted = highlightApprovalId === item.id;
            const isBusy = busyId === item.id;
            return (
              <li
                key={item.id}
                className={highlighted ? 'jn-approval-highlighted' : undefined}
              >
                <div className="cash-session-heading">
                  <strong>
                    {item.kind === 'discount' ? 'Desconto' : 'Pagamento manual'} · {item.protocol}
                  </strong>
                  <span className={`jn-payment-state jn-approval-${item.status}`}>
                    {financialApprovalStatusLabels[item.status]}
                  </span>
                </div>
                <p className="customer-note">
                  Cliente: {item.customer_name} · {item.service_summary}
                </p>
                <p className="customer-note">
                  Solicitante: {item.requester_name} · Aprovador: {item.approver_name} · Criado em{' '}
                  {new Date(item.created_at).toLocaleString('pt-BR')} · Validade:{' '}
                  {new Date(item.expires_at).toLocaleString('pt-BR')}
                </p>

                <dl className="jn-breakdown-grid">
                  <div>
                    <dt>Valor original</dt>
                    <dd>{cashMoney(item.original_cents)}</dd>
                  </div>
                  {item.kind === 'discount' ? (
                    <>
                      <div>
                        <dt>Desconto solicitado</dt>
                        <dd>
                          {cashMoney(item.discount_cents ?? 0)}
                          {item.discount_percent !== null ? ` (${item.discount_percent}%)` : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>Valor final</dt>
                        <dd><strong>{cashMoney(item.final_cents)}</strong></dd>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <dt>Valor a registrar</dt>
                        <dd><strong>{cashMoney(item.requested_amount_cents)}</strong></dd>
                      </div>
                      <div>
                        <dt>Forma de pagamento</dt>
                        <dd>{item.payment_method_name ?? 'Não informada'}</dd>
                      </div>
                    </>
                  )}
                </dl>

                <p className="customer-note">
                  <strong>Justificativa:</strong> {item.justification}
                </p>
                {item.invalidation_reason && (
                  <p role="note" className="form-feedback error">
                    {item.invalidation_reason}
                  </p>
                )}
                {item.decision_note && (
                  <p className="customer-note">
                    <strong>Observação da decisão:</strong> {item.decision_note}
                  </p>
                )}

                {item.can_decide && item.status === 'pending' && (
                  <div className="jn-approval-decision">
                    <label className="team-field">
                      Observação do aprovador (opcional)
                      <input
                        maxLength={300}
                        value={notes[item.id] ?? ''}
                        disabled={isBusy}
                        onChange={(e) => setNotes((old) => ({ ...old, [item.id]: e.target.value }))}
                      />
                    </label>
                    <div className="account-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={isBusy}
                        onClick={() => void decide(item, 'approve')}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <span>Aprovar</span>
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isBusy}
                        onClick={() => void decide(item, 'reject')}
                      >
                        <XCircle size={16} aria-hidden="true" />
                        <span>Rejeitar</span>
                      </button>
                    </div>
                  </div>
                )}

                {item.can_execute && item.kind === 'manual_payment' && item.status === 'approved' && (
                  <div className="account-actions">
                    <button
                      type="button"
                      className="primary-button"
                      disabled={isBusy || !activeSessionId}
                      onClick={() => void executeApproved(item)}
                    >
                      Executar pagamento autorizado no caixa aberto
                    </button>
                    {!activeSessionId && (
                      <span className="customer-note">
                        Abra um caixa individual para concluir o lançamento autorizado.
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <nav className="team-pagination" aria-label="Paginação das autorizações">
        <button
          type="button"
          className="team-text-button"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Anterior
        </button>
        <span>
          {total} autorizações · {page}/{Math.max(1, Math.ceil(total / 5))}
        </span>
        <button
          type="button"
          className="team-text-button"
          disabled={page * 5 >= total}
          onClick={() => setPage((p) => p + 1)}
        >
          Próxima
        </button>
      </nav>
    </section>
  );
}
