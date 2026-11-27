import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DocumentCashQueue as Queue } from '../../../shared/documentWorkflow';
import { workflowApi } from './api';
import { CommercialError } from '../documentCommercial/api';
import { paths } from '../../app/routes';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
  mergeByKey,
} from '../documents/documentsListModel';

export function DocumentCashQueue({
  office,
  disabled,
  onChanged,
  onDenied,
}: {
  office: string;
  disabled: boolean;
  onChanged: () => void;
  onDenied: (s: number) => void;
}) {
  const [data, setData] = useState<Queue>();
  const [tick, setTick] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pending = useRef<{ id: string; key: string } | null>(null);
  const flight = useRef(false);
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  function fail(e: unknown) {
    setError(
      e instanceof Error
        ? e.message
        : 'Não foi possível consultar os documentos no caixa.',
    );
    if (e instanceof CommercialError && e.status !== 503) pending.current = null;
    if (e instanceof CommercialError && [401, 403].includes(e.status)) {
      setData(undefined);
      onDenied(e.status);
    }
  }

  useEffect(() => {
    const c = new AbortController();
    void collectAllDocumentPages({
      fetchPage: (page, signal) => workflowApi.cashQueue(office, page, signal),
      getItems: v => v.items,
      getTotal: v => v.total,
      getKey: v => v.publication_id,
      pageSize: DOCUMENTS_BATCH_SIZE,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
      signal: c.signal,
    })
      .then(collected => {
        if (!c.signal.aborted) {
          setData({
            ...collected.firstPage,
            items: collected.items,
            total: collected.total,
            page: 1,
          });
          setError('');
        }
      })
      .catch(e => {
        if (!c.signal.aborted) fail(e);
      });
    return () => c.abort();
  }, [office, tick]);

  async function claim(id: string) {
    if (flight.current || disabled) return;
    const a = pending.current ?? { id, key: crypto.randomUUID() };
    pending.current = a;
    const c = new AbortController();
    controller.current = c;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      const v = await workflowApi.cashClaim(office, a.id, a.key, c.signal);
      if (alive.current && !c.signal.aborted) {
        pending.current = null;
        setData(prev =>
          prev
            ? {
                ...v,
                items: mergeByKey(v.items, prev.items, item => item.publication_id),
                page: 1,
              }
            : v,
        );
        onChanged();
      }
    } catch (e) {
      if (alive.current && !c.signal.aborted) fail(e);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <details className="service-section">
      <summary>Documentos enviados para pagamento</summary>
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      <button
        className="team-text-button"
        disabled={busy || disabled}
        onClick={() => setTick(x => x + 1)}
      >
        Atualizar fila do caixa
      </button>
      {data && (
        <>
          {data.items.length ? (
            <>
              <p className="document-hint documents-count-note">
                {formatDocumentsCount(data.total, 'documento no caixa', 'documentos no caixa')}
              </p>
              <ul className="customer-list documents-inline-list">
                {data.items.map(v => (
                  <li key={v.publication_id}>
                    <div>
                      <strong>{v.title}</strong>
                      <small>
                        {v.protocol} ·{' '}
                        {v.claimed
                          ? 'Sob sua responsabilidade financeira'
                          : 'Aguardando caixa'}
                      </small>
                    </div>
                    <div>
                      {v.claimed ? (
                        <Link
                          className="team-text-button"
                          to={paths.charges}
                          state={{ office_id: office, request_id: v.request_id }}
                        >
                          Consultar cobrança
                        </Link>
                      ) : (
                        <button
                          className="team-text-button"
                          disabled={
                            busy ||
                            disabled ||
                            (!!pending.current &&
                              pending.current.id !== v.publication_id)
                          }
                          onClick={() => void claim(v.publication_id)}
                        >
                          Assumir cobrança
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Nenhum documento aguardando neste caixa.</p>
          )}
          <p className="document-hint">
            Depois de assumir, receba a cobrança na sessão do seu caixa. Cortesias
            autorizadas e revisões de Correção de documento — sem nova cobrança são
            tratadas sem cobrança duplicada. O portal libera o arquivo após a quitação e
            as conferências documentais.
          </p>
        </>
      )}
    </details>
  );
}
