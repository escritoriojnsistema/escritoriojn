import { useEffect, useState, type FormEvent } from 'react';
import {
  correctionStatusLabels,
  type CorrectionRequestRecord,
  type CorrectionStatus,
} from '../../../shared/smartDocument';
import { smartDocumentsApi } from './api';

export function ClientCorrectionModal({
  office,
  documentId,
  publicationId,
  documentTitle,
  open,
  onClose,
  onSubmitted,
}: {
  office: string;
  documentId: string;
  publicationId?: string | null;
  documentTitle: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: (record: CorrectionRequestRecord) => void;
}) {
  const [sectionKey, setSectionKey] = useState('Qualificação das partes');
  const [incorrectValue, setIncorrectValue] = useState('');
  const [correctedValue, setCorrectedValue] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!correctedValue.trim() || description.trim().length < 5) {
      setError('Informe o dado corrigido e descreva o motivo da correção (mínimo 5 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const rec = await smartDocumentsApi.requestCorrection(office, {
        document_id: documentId,
        publication_id: publicationId ?? null,
        section_key: sectionKey,
        incorrect_value: incorrectValue.trim(),
        corrected_value: correctedValue.trim(),
        description: description.trim(),
        attachment_ids: [],
      });
      setIncorrectValue('');
      setCorrectedValue('');
      setDescription('');
      onSubmitted(rec);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação de correção.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="smart-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="smart-modal" role="dialog" aria-modal="true" aria-labelledby="correction-dialog-title">
        <h3 id="correction-dialog-title">Solicitar correção no documento</h3>
        <p className="document-hint">
          {documentTitle} · O pagamento já confirmado permanece válido. Correções de dados ou digitação não geram cobrança duplicada.
        </p>

        <form onSubmit={(e) => void submit(e)}>
          <fieldset disabled={busy}>
            <label className="team-field">
              Campo ou cláusula a corrigir
              <select value={sectionKey} onChange={(e) => setSectionKey(e.target.value)}>
                <option value="Qualificação das partes">Qualificação das partes (nome, CPF, endereço)</option>
                <option value="Estado civil e cônjuge">Estado civil, regime de bens ou cônjuge</option>
                <option value="Dados do imóvel / objeto">Dados do imóvel, matrícula, CCIR ou CAR</option>
                <option value="Valores e condições de pagamento">Valores e condições de pagamento</option>
                <option value="Cláusula específica">Outra cláusula específica</option>
              </select>
            </label>

            <label className="team-field">
              Como consta atualmente (opcional)
              <input
                value={incorrectValue}
                maxLength={1000}
                onChange={(e) => setIncorrectValue(e.target.value)}
                placeholder="Ex.: CPF 111.111.111-11 ou número errado"
              />
            </label>

            <label className="team-field">
              Dado correto para constar no documento *
              <input
                required
                value={correctedValue}
                maxLength={1000}
                onChange={(e) => setCorrectedValue(e.target.value)}
                placeholder="Informe o dado completo exato"
              />
            </label>

            <label className="team-field">
              Explicação para a equipe *
              <textarea
                required
                rows={3}
                minLength={5}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o ajuste necessário para conferência da equipe"
              />
            </label>
          </fieldset>

          {error && <p role="alert" className="form-feedback error">{error}</p>}

          <div className="smart-modal-actions" style={{ marginTop: 12 }}>
            <button type="button" className="secondary-button" disabled={busy} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={busy}>
              Enviar solicitação de correção
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function StaffCorrectionsPanel({
  office,
  documentId,
  currentRevision,
  canEdit,
  onDenied,
}: {
  office: string;
  documentId: string;
  currentRevision: number;
  canEdit: boolean;
  onDenied?: (status: number) => void;
}) {
  const [items, setItems] = useState<CorrectionRequestRecord[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void smartDocumentsApi
      .listCorrections(office, documentId, controller.signal)
      .then((res) => {
        if (!controller.signal.aborted) setItems(res.items);
      })
      .catch((err) => {
        const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 503;
        if (status === 401 || status === 403) onDenied?.(status);
      });
    return () => controller.abort();
  }, [office, documentId, currentRevision]);

  async function decide(id: string, status: Exclude<CorrectionStatus, 'aguardando_conferencia'>) {
    if (busy || !canEdit) return;
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const updated = await smartDocumentsApi.decideCorrection({
        office_id: office,
        correction_id: id,
        status,
        reason: reason.trim(),
        new_revision: status === 'nova_versao_liberada' ? currentRevision : null,
      });
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      setReason('');
      setFeedback('Decisão registrada com vínculo preservado ao pagamento original.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a análise da correção.');
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <details className="service-section" open>
      <summary>Solicitações de correção pós-conclusão ({items.length})</summary>
      {error && <p role="alert" className="form-feedback error">{error}</p>}
      {feedback && <p role="status" className="form-feedback">{feedback}</p>}
      <ul className="customer-list">
        {items.map((item) => (
          <li key={item.id} style={{ display: 'block' }}>
            <div className="cash-session-heading">
              <strong>{item.section_key}</strong>
              <span>{correctionStatusLabels[item.status]}</span>
            </div>
            <p className="customer-note">
              Solicitado por {item.requested_by_name} em {new Date(item.created_at).toLocaleString('pt-BR')} ·{' '}
              <strong>{item.zero_charge_label}</strong>
            </p>
            {item.incorrect_value && <p className="document-hint">Antes: {item.incorrect_value}</p>}
            <p className="document-hint">Dado corrigido informado: {item.corrected_value}</p>
            <p className="document-hint">Motivo: {item.description}</p>
            {item.was_signed_before && (
              <p className="customer-note">
                Documento já possuía assinatura anterior: correção exige emissão de retificação / nova assinatura.
              </p>
            )}
            {canEdit && ['aguardando_conferencia', 'em_conferencia', 'aguardando_complementacao', 'aprovada'].includes(item.status) && (
              <div style={{ marginTop: 8 }}>
                <label className="team-field">
                  Parecer da conferência
                  <input
                    value={reason}
                    maxLength={500}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Motivo / orientação ao cliente"
                  />
                </label>
                <div className="account-actions">
                  <button
                    type="button"
                    className="team-text-button"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'aprovada')}
                  >
                    Aprovar correção
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'nova_versao_liberada')}
                  >
                    Liberar nova versão sem nova cobrança
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void decide(item.id, 'aguardando_complementacao')}
                  >
                    Devolver p/ complementação
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
