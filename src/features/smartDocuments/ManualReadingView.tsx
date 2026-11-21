import { useMemo, useState } from 'react';
import { BookOpenCheck } from 'lucide-react';
import type { SmartDocumentSection } from '../../../shared/smartDocumentRender';
import { smartDocumentsApi } from './api';
import './smartDocuments.css';

export function ManualReadingView({
  office,
  documentId,
  revision,
  sections,
  highlightedTokens = [],
  canLog = true,
}: {
  office: string;
  documentId: string;
  revision: number;
  sections: SmartDocumentSection[];
  highlightedTokens?: Array<{ label: string; value: string; pending: boolean }>;
  canLog?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const activeSection = useMemo(
    () => sections[activeIdx] ?? sections[0],
    [sections, activeIdx],
  );

  function selectSection(idx: number) {
    setActiveIdx(idx);
    const id = sections[idx]?.id;
    if (id && !reviewed.includes(id)) {
      setReviewed((prev) => [...prev, id]);
    }
  }

  async function recordReading() {
    if (busy || !canLog) return;
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await smartDocumentsApi.recordManualReading(office, {
        document_id: documentId,
        revision,
        clauses_reviewed: reviewed.length ? reviewed : activeSection ? [activeSection.id] : [],
        customer_confirmed: confirmed,
        notes: notes.trim(),
      });
      setStatusMsg(
        'Leitura presencial registrada no histórico operacional. Atenção: leitura não substitui assinatura legal nem quitação.',
      );
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Não foi possível registrar a leitura manual.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="smart-manual-reader" aria-label="Leitura manual presencial">
      <div className="reading-controls">
        <button
          type="button"
          className="team-text-button"
          onClick={() => {
            setOpen((v) => !v);
            if (!open && sections[0] && !reviewed.includes(sections[0].id)) {
              setReviewed([sections[0].id]);
            }
          }}
        >
          <BookOpenCheck size={16} aria-hidden="true" className="smart-inline-icon" />
          {open ? 'Ocultar leitura manual' : 'Ler manualmente'}
        </button>
      </div>

      {open && (
        <div className="smart-manual-body">
          <p className="document-hint">
            Modo silencioso para conferência presencial ou acompanhamento cláusula por cláusula. Nunca aciona síntese de voz automaticamente.
          </p>

          {highlightedTokens.length > 0 && (
            <details className="smart-manual-tokens">
              <summary>Dados principais destacados ({highlightedTokens.length})</summary>
              <dl className="operation-details">
                {highlightedTokens.map((t) => (
                  <div key={t.label}>
                    <dt>{t.label}</dt>
                    <dd className={t.pending ? 'smart-preview-pending' : ''}>{t.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          <div className="smart-manual-sections" role="tablist" aria-label="Seções do documento">
            {sections.map((sec, idx) => (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={activeIdx === idx}
                className={activeIdx === idx ? 'active' : ''}
                onClick={() => selectSection(idx)}
              >
                {sec.title}
                {sec.has_pendency ? ' (pendente)' : ''}
              </button>
            ))}
          </div>

          {activeSection && (
            <div className="smart-preview-doc" tabIndex={0}>
              {activeSection.body}
            </div>
          )}

          <div className="smart-wizard-nav">
            <button
              type="button"
              className="secondary-button"
              disabled={activeIdx <= 0}
              onClick={() => selectSection(activeIdx - 1)}
            >
              Cláusula anterior
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={activeIdx >= sections.length - 1}
              onClick={() => selectSection(activeIdx + 1)}
            >
              Próxima cláusula
            </button>
          </div>

          {canLog && (
            <div className="smart-manual-log">
              <label className="template-check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Cliente acompanhou a leitura manual presencial das cláusulas destacadas
              </label>
              <label className="team-field">
                Observação da leitura (opcional)
                <input
                  value={notes}
                  maxLength={500}
                  disabled={busy}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              {errorMsg && <p role="alert" className="form-feedback error">{errorMsg}</p>}
              {statusMsg && <p role="status" className="form-feedback">{statusMsg}</p>}
              <button
                type="button"
                className="team-text-button"
                disabled={busy}
                onClick={() => void recordReading()}
              >
                Registrar conclusão da leitura manual
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
