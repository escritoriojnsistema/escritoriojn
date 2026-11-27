import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PdfReading } from '../documentReading/PdfReading';
import { reviewEventLabels } from '../../../shared/editorialReview';
import {
  editorialLabels,
  type DocumentVersionsPage,
} from '../../../shared/documentVersions';
import { workflowApi } from './api';
import { CommercialError } from '../documentCommercial/api';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
} from '../documents/documentsListModel';

export function VersionsPanel({
  office,
  documentId,
  revision,
  disabled,
  onDenied,
  refresh = 0,
  visible = true,
}: {
  office: string;
  documentId: string;
  revision: number;
  disabled: boolean;
  onDenied: (s: number) => void;
  refresh?: number;
  visible?: boolean;
}) {
  const [data, setData] = useState<DocumentVersionsPage>();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pdf, setPdf] = useState<{
    url: string;
    sha: string;
    id: string;
    bytes: Blob;
  }>();
  const [tick, setTick] = useState(0);
  const alive = useRef(false);
  const request = useRef<AbortController | null>(null);
  const flight = useRef(false);
  const url = useRef<string | null>(null);

  const clear = () => {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPdf(undefined);
  };

  useLayoutEffect(() => {
    request.current?.abort();
    clear();
  }, [office, documentId, revision, refresh]);

  function fail(e: unknown) {
    const status = e instanceof CommercialError ? e.status : 503;
    setError(e instanceof Error ? e.message : 'Não foi possível conferir a versão.');
    if (status === 401 || status === 403) {
      clear();
      setData(undefined);
      onDenied(status);
    }
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  async function fetchAllVersions(signal: AbortSignal): Promise<DocumentVersionsPage> {
    const collected = await collectAllDocumentPages({
      fetchPage: (page, s) => workflowApi.versions(office, documentId, page, s),
      getItems: v => v.items,
      getTotal: v => v.total,
      getKey: v => v.id,
      pageSize: DOCUMENTS_BATCH_SIZE,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
      signal,
    });
    return {
      ...collected.firstPage,
      items: collected.items,
      total: collected.total,
      page: 1,
    };
  }

  useEffect(() => {
    const c = new AbortController();
    void fetchAllVersions(c.signal)
      .then(v => {
        if (!c.signal.aborted) {
          setData(v);
          setSelected(s => (v.items.some(i => i.id === s) ? s : (v.items[0]?.id ?? '')));
          setError('');
        }
      })
      .catch(e => {
        if (!c.signal.aborted) fail(e);
      });
    return () => c.abort();
  }, [office, documentId, revision, tick, refresh]);

  const version = data?.items.find(v => v.id === selected);

  async function preview() {
    if (flight.current || disabled || !version) return;
    flight.current = true;
    setBusy(true);
    setError('');
    const c = new AbortController();
    request.current = c;
    try {
      const bytes = await workflowApi.preview(office, version.id, c.signal);
      const sha = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', await bytes.arrayBuffer())),
      )
        .map(x => x.toString(16).padStart(2, '0'))
        .join('');
      const next = await fetchAllVersions(c.signal);
      const official = next.items.find(v => v.id === version.id);
      if (official?.pdf_sha256 !== sha || official.size_bytes !== bytes.size) {
        throw new CommercialError(503);
      }
      if (alive.current && !c.signal.aborted) {
        clear();
        url.current = URL.createObjectURL(bytes);
        setPdf({ url: url.current, sha, id: version.id, bytes });
        setData(next);
      }
    } catch (e) {
      if (alive.current && !c.signal.aborted) fail(e);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section className="document-versions documents-detail-card" aria-label="Versões e PDF">
      <h2>Versões e PDF</h2>
      <p className="document-hint">
        Prévia interna em PDF · RASCUNHO. A aprovação desta versão não se aplica às próximas.
      </p>
      {error && (
        <p role="alert" className="form-feedback error">
          {error}{' '}
          <button
            className="team-text-button"
            disabled={busy}
            onClick={() => setTick(t => t + 1)}
          >
            Conferir novamente
          </button>
        </p>
      )}
      <div className="document-version-controls">
        <label className="team-field">
          Versão preservada
          <select
            aria-label="Versão preservada"
            value={selected}
            disabled={busy || disabled || !data?.items.length}
            onChange={e => {
              clear();
              setSelected(e.target.value);
            }}
          >
            {data?.items.map(v => (
              <option key={v.id} value={v.id}>
                Revisão {v.revision}
                {v.current ? ' · Atual' : ''} · {editorialLabels[v.status]}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button"
          disabled={busy || disabled || !version}
          onClick={() => void preview()}
        >
          Pré-visualizar PDF
        </button>
      </div>
      {data && (
        <p className="document-hint documents-count-note">
          {formatDocumentsCount(data.total, 'versão preservada', 'versões preservadas')}
        </p>
      )}
      {version && (
        <>
          <dl className="document-version-meta">
            <div>
              <dt>Estado</dt>
              <dd>
                {editorialLabels[version.status]}
                {version.current ? ' · Versão atual' : ''}
              </dd>
            </div>
            <div>
              <dt>Autor e data</dt>
              <dd>
                {version.author_name} ·{' '}
                {new Date(version.created_at).toLocaleString('pt-BR')}
              </dd>
            </div>
            <div>
              <dt>Modelo</dt>
              <dd>Versão {version.template_number}</dd>
            </div>
          </dl>
          <details className="document-version-identification">
            <summary>Identificação e decisão da versão</summary>
            <dl>
              <dt>Versão</dt>
              <dd>{version.id}</dd>
              <dt>Modelo preservado</dt>
              <dd>{version.template_version_id}</dd>
              <dt>SHA-256 do conteúdo</dt>
              <dd>{version.content_sha256}</dd>
              <dt>SHA-256 do snapshot</dt>
              <dd>{version.snapshot_sha256}</dd>
              <dt>SHA-256 do PDF</dt>
              <dd>
                {pdf?.id === version.id
                  ? pdf.sha
                  : (version.pdf_sha256 ?? 'PDF ainda não gerado')}
              </dd>
              {version.last_decision && (
                <>
                  <dt>Última decisão preservada</dt>
                  <dd>
                    {reviewEventLabels[version.last_decision]} ·{' '}
                    {version.decision_at &&
                      new Date(version.decision_at).toLocaleString('pt-BR')}{' '}
                    · {version.decision_reason}
                  </dd>
                </>
              )}
            </dl>
          </details>
          {pdf?.id === version.id && version.pdf_sha256 === pdf.sha && (
            <div className="document-pdf-preview">
              <p className="document-hint" role="status">
                RASCUNHO · Revisão {version.revision} · SHA-256 {pdf.sha}
              </p>
              {visible && !disabled && (
                <PdfReading
                  key={pdf.sha}
                  bytes={pdf.bytes}
                  scope={office + documentId + version.id + pdf.sha}
                  pdfUrl={pdf.url}
                  title={`Prévia PDF da revisão ${version.revision}`}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
