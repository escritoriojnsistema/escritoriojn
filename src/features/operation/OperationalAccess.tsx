import { useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { LoaderCircle, LogOut, RefreshCw, ArrowLeft } from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationLayout } from './OperationLayout';
import './operation.css';

export function OperationalFeedback({ status, client = false }: { status: 'loading' | 'denied' | 'unavailable'; client?: boolean }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (status === 'loading') return <main id="conteudo" className="operation-feedback"><LoaderCircle size={28} aria-hidden="true" /><h1>Carregando seu ambiente</h1><p role="status">Verificando seu acesso…</p></main>;
  return <main id="conteudo" className="operation-feedback"><h1>{status === 'unavailable' ? 'Acesso indisponível' : 'Acesso não autorizado'}</h1><p role="alert" className="form-feedback error">{status === 'unavailable' ? 'Não conseguimos verificar sua sessão agora. Tente novamente.' : 'Sua conta não possui permissão ativa para esta área. Fale com o escritório.'}</p><button className="primary-button" onClick={auth.refresh}><RefreshCw size={18} aria-hidden="true" />Verificar novamente</button>{auth.contexts.length > 0 && <Link className="return-login" to={auth.contexts.some(c => c.role_code !== 'client') ? paths.panel : paths.clientPanel}><ArrowLeft size={18} aria-hidden="true" />Ir para minha área</Link>}{error && <p role="alert" className="form-feedback error">{error}</p>}<button className="secondary-button" disabled={busy} onClick={() => {
    setBusy(true); setError('');
    void auth.logout().then(ok => { if (!ok) setError('Não foi possível sair. Tente novamente.'); }).catch(() => setError('Não foi possível sair. Tente novamente.')).finally(() => setBusy(false));
  }}><LogOut size={18} aria-hidden="true" />{busy ? 'Saindo…' : 'Sair da conta'}</button><Link className="return-login" to={client ? paths.client : paths.team}><ArrowLeft size={18} aria-hidden="true" />Voltar para entrar</Link></main>;
}

export function OperationalAccess({ client = false, children }: { client?: boolean; children: (contexts: AccessContext[]) => ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') return <Navigate replace to={client ? paths.client : paths.team} state={auth.status === 'expired' ? { sessionExpired: true } : null} />;
  const contexts = auth.contexts.filter(context => client ? context.role_code === 'client' : context.role_code !== 'client');
  if (auth.status !== 'authorized' || !contexts.length) return <OperationalFeedback status={auth.status === 'unavailable' ? 'unavailable' : 'denied'} client={client} />;
  return <OperationLayout client={client}>{children(contexts)}</OperationLayout>;
}
