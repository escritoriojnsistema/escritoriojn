import { useEffect, useRef, useState } from 'react';
import type {
  ReleaseCommand25,
  ReleaseState25,
} from '../../../shared/documentRelease';
import { validReleaseCommand25 } from '../../../shared/documentRelease';
import { workflowBlockers } from '../../../shared/documentWorkflow';
import { workflowApi } from './api';
import { CommercialError } from '../documentCommercial/api';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  mergeByKey,
} from '../documents/documentsListModel';

const labels = {
  requested: 'Solicitada',
  authorized: 'Autorizada',
  rejected: 'Recusada',
  revoked: 'Revogada',
  expired: 'Expirada',
  invalidated: 'Reavaliar: dados ou autoridade alterados',
};

const eventLabels = {
  request: 'Solicitação',
  authorize: 'Autorização',
  reject: 'Recusa',
  revoke: 'Revogação',
};

const money = (n: number) =>
  (n / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ReleasePanel({
  office,
  publicationId,
  active,
  disabled,
  onDenied,
  onChanged,
  onPendingChange,
}: {
  office: string;
  publicationId: string;
  active: boolean;
  disabled: boolean;
  onDenied: (s: number) => void;
  onChanged: () => void;
  onPendingChange: (b: boolean) => void;
}) {
  const [state, setState] = useState<ReleaseState25>();
  const [action, setAction] = useState<'refresh' | ReleaseCommand25['kind']>('refresh');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);

  const alive = useRef(true);
  const flight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const attempt = useRef<{ command: ReleaseCommand25; key: string } | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  function fail(e: unknown) {
    const status = e instanceof CommercialError ? e.status : 503;
    setError(e instanceof Error ? e.message : 'Operação indisponível.');
    if (status !== 503) attempt.current = null;
    if (status === 409) {
      setConflict(true);
      setAction('refresh');
    }
    if (status === 401 || status === 403) {
      attempt.current = null;
      setState(undefined);
      setReason('');
      setExpires('');
      onDenied(status);
    }
  }

  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    void collectAllDocumentPages({
      fetchPage: (page, signal) =>
        workflowApi.releaseState(office, publicationId, page, signal),
      getItems: v => v.history,
      getTotal: v => v.history_total,
      getKey: e => e.id,
      pageSize: DOCUMENTS_BATCH_SIZE,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
      signal: c.signal,
    })
      .then(collected => {
        if (!c.signal.aborted) {
          setState({
            ...collected.firstPage,
            history: collected.items,
            history_total: collected.total,
            page: 1,
          });
          setConflict(false);
          setError('');
        }
      })
      .catch(e => {
        if (!c.signal.aborted) fail(e);
      });
    return () => c.abort();
  }, [office, publicationId, active, tick]);

  const allowed =
    action === 'refresh' ||
    (!conflict &&
      !!state &&
      (action === 'request' ? state.can_request : state.can_decide) &&
      (action === 'request' ||
        (action === 'revoke'
          ? state.exception?.status === 'authorized'
          : state.exception?.status === 'requested')));
  const command: ReleaseCommand25 | undefined =
    state && action !== 'refresh'
      ? {
          kind: action,
          expected_revision: state.revision,
          expected_event_id: state.last_event_id,
          reason: reason.trim(),
          ...(action === 'request' &&
          expires &&
          Number.isFinite(new Date(expires).getTime())
            ? { expires_at: new Date(expires).toISOString() }
            : {}),
        }
      : undefined;
  const locked = disabled || busy || !!attempt.current;

  async function execute() {
    if (flight.current || disabled) return;
    if (!attempt.current && (action === 'refresh' || !state)) {
      setTick(t => t + 1);
      return;
    }
    if (!attempt.current && (!allowed || !command || !validReleaseCommand25(command))) {
      return;
    }
    const c = new AbortController();
    controller.current = c;
    flight.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    onPendingChange(true);
    try {
      const a = attempt.current ?? { command: command!, key: crypto.randomUUID() };
      attempt.current = a;
      const v = await workflowApi.releaseCommand(
        office,
        publicationId,
        a.command,
        a.key,
        c.signal,
      );
      if (alive.current && !c.signal.aborted) {
        attempt.current = null;
        setState(prev =>
          prev
            ? { ...v, history: mergeByKey(v.history, prev.history, e => e.id), page: 1 }
            : v,
        );
        setMessage(
          'Decisão financeira registrada. As demais condições de entrega continuam obrigatórias.',
        );
        setReason('');
        setAction('refresh');
        onChanged();
      }
    } catch (e) {
      if (alive.current && !c.signal.aborted) fail(e);
    } finally {
      if (alive.current) {
        flight.current = false;
        setBusy(false);
        onPendingChange(!!attempt.current);
      }
    }
  }

  return (
    <section aria-label="Liberação e exceção financeira" className="document-workflow">
      <h2>Liberação e exceção financeira</h2>
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-feedback">
          {message}
        </p>
      )}
      {state && (
        <>
          <div className="review-summary">
            <p>Editorial: {state.approved ? 'Aprovado' : 'Aguardando aprovação'}</p>
            <p>Assinatura: {state.signed ? 'Satisfeita' : 'Pendente'}</p>
            <p>Saldo: {money(state.financial.balance_cents)}</p>
            <p>
              Cobrança: {money(state.financial.due_cents)} · Pago:{' '}
              {money(state.financial.allocated_cents)}
            </p>
          </div>
          <p className="document-hint">
            Entrega:{' '}
            {state.ready
              ? 'Elegível para o cliente vinculado'
              : state.blockers.map(b => workflowBlockers[b]).join(' · ')}
            . A exceção dispensa somente a quitação.
          </p>
          {state.exception && (
            <p className="document-hint">
              Exceção: {labels[state.exception.status]} · Validade:{' '}
              {new Date(state.exception.expires_at).toLocaleString('pt-BR')} ·{' '}
              {state.exception.reason}
            </p>
          )}
          <details>
            <summary>Escopo da exceção financeira</summary>
            <p className="document-hint">
              Publicação selecionada e cliente vinculado. Alterações de versão, arquivo,
              saldo ou autoridade exigem reavaliação. Download autorizado não comprova
              recebimento.
            </p>
            {state.exception && (
              <p className="document-hint document-hash">
                Revisão {state.exception.revision} · Saldo avaliado{' '}
                {money(state.exception.balance_cents)} · Cobrança{' '}
                {state.exception.charge_id} · SHA-256 {state.exception.sha256}
              </p>
            )}
          </details>
          <label className="team-field">
            Operação de liberação
            <select
              value={action}
              disabled={locked}
              onChange={e => setAction(e.target.value as typeof action)}
            >
              <option value="refresh">Atualizar avaliação</option>
              <option value="request" disabled={!state.can_request}>
                Solicitar exceção financeira
              </option>
              <option
                value="authorize"
                disabled={!state.can_decide || state.exception?.status !== 'requested'}
              >
                Autorizar exceção financeira
              </option>
              <option
                value="reject"
                disabled={!state.can_decide || state.exception?.status !== 'requested'}
              >
                Recusar exceção financeira
              </option>
              <option
                value="revoke"
                disabled={!state.can_decide || state.exception?.status !== 'authorized'}
              >
                Revogar exceção financeira
              </option>
            </select>
          </label>
          {action !== 'refresh' && (
            <div className="signature-grid">
              <label className="team-field">
                Motivo da exceção financeira
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  maxLength={500}
                  disabled={locked}
                />
              </label>
              {action === 'request' && (
                <>
                  <label className="team-field">
                    Validade da exceção
                    <input
                      type="datetime-local"
                      value={expires}
                      onChange={e => setExpires(e.target.value)}
                      disabled={locked}
                    />
                  </label>
                  <small>Até 30 dias; horário local convertido para o servidor.</small>
                </>
              )}
            </div>
          )}
        </>
      )}
      <button
        className="primary-button"
        onClick={execute}
        disabled={
          disabled ||
          busy ||
          (!attempt.current &&
            !!state &&
            (!allowed ||
              (action !== 'refresh' && (!command || !validReleaseCommand25(command)))))
        }
      >
        Registrar liberação
      </button>
      {attempt.current && (
        <p className="document-hint">
          Resultado ainda não confirmado. Registrar liberação repete a mesma tentativa.
        </p>
      )}
      {conflict && (
        <p className="document-hint">
          Dados alterados. Atualize a avaliação antes de nova decisão; seu motivo foi
          preservado.
        </p>
      )}
      {state && state.history_total > 0 && (
        <details>
          <summary>Histórico de exceções ({state.history_total})</summary>
          {state.history.map(e => (
            <p className="document-hint" key={e.id}>
              {eventLabels[e.kind]} · {e.actor_name} ·{' '}
              {new Date(e.created_at).toLocaleString('pt-BR')} · {e.reason} · Validade{' '}
              {new Date(e.expires_at).toLocaleString('pt-BR')}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
