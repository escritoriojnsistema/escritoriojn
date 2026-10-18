import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, RefreshCw } from 'lucide-react';
import { readHealth } from './api';

type Status = 'loading' | 'success' | 'error';

export function ApiStatus() {
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readHealth(controller.signal).then(
      () => { if (!controller.signal.aborted) setStatus('success'); },
      () => { if (!controller.signal.aborted) setStatus('error'); },
    );
    return () => controller.abort();
  }, [attempt]);
  function retry() { setStatus('loading'); setAttempt(value => value + 1); }
  return (
    <section className="health-panel" aria-labelledby="health-title">
      <div className="health-heading"><span className="eyebrow">Conexão do sistema</span><span className="live-indicator" aria-hidden="true" /></div>
      <div className="health-result" role={status === 'error' ? 'alert' : 'status'} aria-live="polite">
        {status !== 'loading' && <span className={`health-icon ${status}`} aria-hidden="true">{status === 'success' ? <Check size={25} /> : <RefreshCw size={23} />}</span>}
        <h2 id="health-title">{status === 'loading' ? 'API do sistema' : status === 'success' ? 'API disponível' : 'Não foi possível verificar a API'}</h2>
        <p>{status === 'error' ? 'Confira sua conexão e tente novamente.' : 'A verificação consulta o backend em tempo real.'}</p>
      </div>
      <div className="health-actions">
        <button type="button" onClick={retry} disabled={status === 'loading'}><RefreshCw size={16} aria-hidden="true" />{status === 'error' ? 'Tentar novamente' : 'Verificar novamente'}</button>
        <a href="/api/health" target="_blank" rel="noreferrer">Abrir health <ArrowUpRight size={16} aria-hidden="true" /></a>
      </div>
    </section>
  );
}
