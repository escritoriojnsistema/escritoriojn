import { useEffect } from 'react';
import type { PendingFieldRecord } from '../../../shared/smartDocument';

export function PendingConfirmModal({
  open,
  pendencies,
  onBackToFill,
  onContinueWithPendencies,
}: {
  open: boolean;
  pendencies: PendingFieldRecord[];
  onBackToFill: () => void;
  onContinueWithPendencies: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBackToFill();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onBackToFill]);

  if (!open) return null;

  return (
    <div
      className="smart-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onBackToFill();
      }}
    >
      <div
        className="smart-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-pending-modal-title"
      >
        <h3 id="smart-pending-modal-title">Existem informações pendentes nesta etapa</h3>
        <p className="document-hint">
          Você pode voltar para preencher agora ou avançar deixando as pendências sinalizadas para completar antes da emissão final.
        </p>
        <ul aria-label="Campos pendentes nesta etapa">
          {pendencies.map((item) => (
            <li key={item.key}>
              <strong>{item.label}</strong>
              {item.criticality === 'legal_required' ? ' (obrigatório na emissão final)' : ''}
            </li>
          ))}
        </ul>
        <div className="smart-modal-actions">
          <button type="button" className="secondary-button" onClick={onBackToFill}>
            Voltar e preencher
          </button>
          <button type="button" className="primary-button" onClick={onContinueWithPendencies}>
            Continuar com pendências
          </button>
        </div>
      </div>
    </div>
  );
}
