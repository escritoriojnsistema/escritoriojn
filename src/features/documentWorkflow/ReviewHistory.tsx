import { useEffect, useState } from 'react';
import {
  reviewEventLabels,
  type ReviewHistoryPage,
} from '../../../shared/editorialReview';
import { CommercialError } from '../documentCommercial/api';
import { workflowApi } from './api';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
} from '../documents/documentsListModel';

export function ReviewHistory({
  office,
  documentId,
  refresh,
  onDenied,
}: {
  office: string;
  documentId: string;
  refresh: number;
  disabled: boolean;
  onDenied: (status: number) => void;
}) {
  const [data, setData] = useState<ReviewHistoryPage>();
  const [error, setError] = useState('');

  useEffect(() => {
    const c = new AbortController();
    void collectAllDocumentPages({
      fetchPage: (page, signal) =>
        workflowApi.reviewHistory(office, documentId, page, signal),
      getItems: v => v.items,
      getTotal: v => v.total,
      getKey: item => item.id,
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
        if (c.signal.aborted) return;
        if (e instanceof CommercialError && [401, 403].includes(e.status)) {
          setData(undefined);
          onDenied(e.status);
        }
        setError(
          e instanceof Error ? e.message : 'Não foi possível consultar o histórico.',
        );
      });
    return () => c.abort();
  }, [office, documentId, refresh]);

  return (
    <details className="review-history">
      <summary>
        Histórico editorial{data ? ` (${data.total})` : ''}
      </summary>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          {data.items.length ? (
            <>
              <p className="document-hint documents-count-note">
                {formatDocumentsCount(data.total, 'evento editorial', 'eventos editoriais')}
              </p>
              <ol>
                {data.items.map(item => (
                  <li key={item.id}>
                    <strong>
                      {reviewEventLabels[item.kind]} · Revisão {item.revision}
                    </strong>
                    <p>
                      {item.actor_name} ·{' '}
                      {new Date(item.created_at).toLocaleString('pt-BR')}
                    </p>
                    <p>{item.reason}</p>
                    {item.kind === 'submit' && (
                      <p>
                        Responsável: {item.reviewer_name ?? 'Fila compartilhada'} · Prazo:{' '}
                        {item.due_at
                          ? new Date(item.due_at).toLocaleString('pt-BR')
                          : 'Sem prazo'}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="document-hint">Nenhum evento editorial registrado.</p>
          )}
        </>
      )}
    </details>
  );
}
