import { useEffect, useState, type FormEvent } from 'react';
import { Scale } from 'lucide-react';
import {
  copyrightNotice,
  defaultCopyright,
  validCopyright,
  type CopyrightNotice,
} from '../../../shared/privacySettings';
import { commercialRequest } from '../documentCommercial/api';

export function CopyrightPage({
  office,
  editable = false,
  onPendingChange,
}: {
  office?: string;
  editable?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [state, setState] = useState<CopyrightNotice>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    setError('');
    setMessage('');
    const request = office
      ? commercialRequest<CopyrightNotice>(
          '/copyright-state',
          { office_id: office },
          controller.signal,
          '/api/privacy',
        )
      : fetch('/api/privacy/copyright-public', {
          cache: 'no-store',
          signal: controller.signal,
        }).then(async response => {
          if (!response.ok) throw Error('UNAVAILABLE');
          return copyrightNotice((await response.json()).data);
        });
    void request
      .then(value => {
        if (controller.signal.aborted) return;
        setState(value);
        setDraft(value.notice);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Não foi possível consultar os direitos autorais.');
        }
      });
    return () => controller.abort();
  }, [office, revision]);

  useEffect(() => {
    onPendingChange?.(busy);
    return () => onPendingChange?.(false);
  }, [busy, onPendingChange]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editable || !office || !state || busy) return;
    const notice = draft.trim();
    setError('');
    setMessage('');
    if (!validCopyright(notice)) {
      setError('Informe um texto de 3 a 400 caracteres, em uma linha.');
      return;
    }
    setBusy(true);
    try {
      const saved = await commercialRequest<CopyrightNotice>(
        '/copyright-save',
        { office_id: office, expected_revision: state.revision, notice },
        undefined,
        '/api/privacy',
      );
      setState(saved);
      setDraft(saved.notice);
      setMessage('Direitos autorais atualizados.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="privacy-page copyright-page">
      <header className="privacy-doc-header">
        <div className="privacy-doc-title-row">
          <span className="privacy-doc-icon" aria-hidden="true">
            <Scale size={20} strokeWidth={1.9} />
          </span>
          <div>
            <p className="eyebrow">Identificação institucional</p>
            <h2>Escritório JN</h2>
          </div>
        </div>
      </header>

      <div className="privacy-section copyright-card">
        {error && (
          <p role="alert" className="form-feedback error">
            {error}
          </p>
        )}
        {error && !busy && (
          <button
            type="button"
            className="team-text-button"
            onClick={() => setRevision(n => n + 1)}
          >
            Atualizar
          </button>
        )}
        {message && <p role="status">{message}</p>}
        {editable ? (
          <form onSubmit={save} className="request-form">
            <label className="team-field">
              Direitos autorais do sistema
              <input
                maxLength={400}
                value={draft}
                onChange={event => setDraft(event.target.value)}
                disabled={busy || !state}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || !state || draft.trim() === state.notice}
            >
              Salvar direitos autorais
            </button>
          </form>
        ) : (
          <p className="copyright-notice-text">
            {state?.notice ?? (office ? null : defaultCopyright)}
          </p>
        )}
      </div>
    </section>
  );
}
