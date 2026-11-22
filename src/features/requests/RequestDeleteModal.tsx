import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type {
  RequestDeletionEligibility,
  RequestDeletionResult,
} from '../../../shared/requestDeletion';
import { requestDeletionApi, RequestDeletionError } from './deletionApi';

type Props = {
  office: string;
  requestId: string;
  protocol: string;
  title: string;
  portal: boolean;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onDeleted: (result: RequestDeletionResult) => void;
};

export function RequestDeleteSection({
  office,
  requestId,
  protocol,
  title,
  portal,
  disabled = false,
  onPendingChange,
  onDeleted,
}: Props) {
  const [eligibility, setEligibility] = useState<RequestDeletionEligibility | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'processing' | 'storage_cleanup_failed' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState<RequestDeletionResult | null>(null);
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setEligibility(null);
    setModalOpen(false);
    setPhase('idle');
    setErrorMessage('');
    setResult(null);
    setRetryKey(null);
    void requestDeletionApi
      .eligibility(office, requestId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setEligibility(data);
      })
      .catch(() => {
        // Keep action hidden when eligibility cannot be verified authoritatively
        if (!controller.signal.aborted) setEligibility(null);
      });
    return () => controller.abort();
  }, [office, requestId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modalOpen && !dialog.open) {
      dialog.showModal();
    } else if (!modalOpen && dialog.open) {
      dialog.close();
      triggerRef.current?.focus();
    }
  }, [modalOpen]);

  function closeModal() {
    if (phase === 'processing') return;
    setModalOpen(false);
    setErrorMessage('');
  }

  async function confirmDelete() {
    if (!eligibility?.eligible || phase === 'processing') return;
    const key = retryKey ?? `del-${crypto.randomUUID()}`;
    setRetryKey(key);
    setPhase('processing');
    setErrorMessage('');
    onPendingChange?.(true);

    try {
      const response = await requestDeletionApi.execute(requestId, {
        office_id: office,
        expected_version: eligibility.version,
        expected_status: eligibility.status,
        idempotency_key: key,
        confirmation_ack: true,
      });
      setResult(response);
      if (response.status === 'completed' && response.db_deleted && response.storage_cleanup_completed) {
        setModalOpen(false);
        setPhase('idle');
        onPendingChange?.(false);
        onDeleted(response);
      } else if (response.status === 'storage_cleanup_failed') {
        setPhase('storage_cleanup_failed');
        setErrorMessage(response.message);
        onPendingChange?.(false);
      } else {
        setPhase('processing');
        onPendingChange?.(true);
      }
    } catch (cause) {
      const err = cause instanceof RequestDeletionError ? cause : new RequestDeletionError(503);
      setPhase('error');
      setErrorMessage(err.message);
      onPendingChange?.(false);
    }
  }

  async function checkStatus() {
    if (!retryKey) return;
    setPhase('processing');
    setErrorMessage('');
    onPendingChange?.(true);
    try {
      const response = await requestDeletionApi.status(office, requestId, retryKey);
      setResult(response);
      if (response.status === 'completed' && response.db_deleted && response.storage_cleanup_completed) {
        setModalOpen(false);
        setPhase('idle');
        onPendingChange?.(false);
        onDeleted(response);
      } else if (response.status === 'storage_cleanup_failed') {
        setPhase('storage_cleanup_failed');
        setErrorMessage(response.message);
        onPendingChange?.(false);
      } else {
        setPhase('processing');
      }
    } catch (cause) {
      const err = cause instanceof RequestDeletionError ? cause : new RequestDeletionError(503);
      setPhase('error');
      setErrorMessage(err.message);
      onPendingChange?.(false);
    }
  }

  if (!eligibility || !eligibility.can_show_action || (!eligibility.backend_ready && eligibility.eligible)) {
    return null;
  }

  const isTeam = eligibility.actor_kind === 'team' && !portal;

  return (
    <section className="request-delete-zone" aria-label="Exclusão definitiva da solicitação">
      {eligibility.eligible ? (
        <div className="request-delete-row">
          <div>
            <h3>Excluir solicitação</h3>
            <p className="customer-note">
              Ação definitiva e irreversível. Diferente do cancelamento, a solicitação será removida permanentemente.
            </p>
          </div>
          <button
            ref={triggerRef}
            type="button"
            className="danger-button"
            disabled={disabled || !eligibility.backend_ready}
            onClick={() => {
              setErrorMessage('');
              setPhase('idle');
              setModalOpen(true);
            }}
          >
            <Trash2 size={17} aria-hidden="true" />
            <span>Excluir solicitação</span>
          </button>
        </div>
      ) : (
        <div className="request-delete-blocked" role="note">
          <div className="request-delete-blocked-head">
            <AlertTriangle size={18} aria-hidden="true" />
            <strong>Exclusão definitiva bloqueada</strong>
          </div>
          <p>{eligibility.block_message}</p>
          {eligibility.recommended_alternatives.length > 0 && (
            <p className="customer-note">
              Alternativas disponíveis: {eligibility.recommended_alternatives.join(' · ')}.
            </p>
          )}
        </div>
      )}

      <dialog
        ref={dialogRef}
        className="jn-confirm-dialog"
        aria-labelledby="delete-request-modal-title"
        aria-describedby="delete-request-modal-desc"
        onCancel={(event) => {
          event.preventDefault();
          closeModal();
        }}
      >
        <div className="jn-dialog-head">
          <h2 id="delete-request-modal-title">Excluir solicitação permanentemente?</h2>
          <button
            type="button"
            className="operation-icon-button"
            aria-label="Fechar janela de confirmação"
            disabled={phase === 'processing'}
            onClick={closeModal}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div id="delete-request-modal-desc" className="jn-dialog-body">
          <p>
            Você está prestes a excluir esta solicitação. Os dados da solicitação e todos os anexos exclusivos
            vinculados a ela também serão excluídos permanentemente. Esta ação não poderá ser desfeita. Deseja
            realmente continuar?
          </p>
          {isTeam && eligibility.notify_client_on_delete && (
            <p className="jn-dialog-emphasis">
              O cliente será notificado sobre a exclusão da solicitação.
            </p>
          )}

          <dl className="service-facts">
            <div>
              <dt>Protocolo</dt>
              <dd>{eligibility.protocol || protocol}</dd>
            </div>
            <div>
              <dt>Resumo</dt>
              <dd>{eligibility.title || title}</dd>
            </div>
            <div>
              <dt>Anexos exclusivos a excluir</dt>
              <dd>{eligibility.attachments.exclusive_count}</dd>
            </div>
            {(eligibility.attachments.shared_preserved_count > 0 ||
              eligibility.attachments.retained_preserved_count > 0) && (
              <div>
                <dt>Anexos preservados</dt>
                <dd>
                  {[
                    eligibility.attachments.shared_preserved_count > 0
                      ? `${eligibility.attachments.shared_preserved_count} compartilhados com outros atendimentos`
                      : null,
                    eligibility.attachments.retained_preserved_count > 0
                      ? `${eligibility.attachments.retained_preserved_count} sob retenção obrigatória`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </dd>
              </div>
            )}
          </dl>

          {(eligibility.attachments.shared_preserved_count > 0 ||
            eligibility.attachments.retained_preserved_count > 0) && (
            <p className="customer-note">
              Arquivos compartilhados com outros registros ou sob retenção obrigatória terão apenas o vínculo com esta
              solicitação removido, sem exclusão física do arquivo.
            </p>
          )}

          {phase === 'processing' && (
            <p role="status" className="form-feedback">
              Processando exclusão definitiva e limpeza coordenada de anexos. Não feche esta janela até a confirmação.
            </p>
          )}

          {phase === 'storage_cleanup_failed' && (
            <div role="alert" className="form-feedback error">
              <p>{errorMessage || result?.message}</p>
              <p>A operação não foi marcada como concluída porque ainda há limpeza de arquivos pendente.</p>
            </div>
          )}

          {phase === 'error' && errorMessage && (
            <p role="alert" className="form-feedback error">
              {errorMessage}
            </p>
          )}
        </div>

        <div className="jn-dialog-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={phase === 'processing'}
            onClick={closeModal}
          >
            Cancelar
          </button>
          {retryKey && (phase === 'error' || phase === 'storage_cleanup_failed') && (
            <button
              type="button"
              className="team-text-button"
              onClick={() => void checkStatus()}
            >
              Verificar situação da exclusão
            </button>
          )}
          <button
            type="button"
            className="danger-button"
            disabled={phase === 'processing'}
            onClick={() => void confirmDelete()}
          >
            {phase === 'processing' ? 'Excluindo...' : 'Excluir permanentemente'}
          </button>
        </div>
      </dialog>
    </section>
  );
}
