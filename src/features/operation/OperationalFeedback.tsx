import {useState} from 'react';
import {Link} from 'react-router-dom';
import {LogOut,RefreshCw,ArrowLeft} from 'lucide-react';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import './operation.css';
import {PrivacyFooter} from '../privacy/PrivacyLinks';

export function OperationalFeedback({ status, client = false }: { status: 'loading' | 'denied' | 'unavailable'; client?: boolean }) {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (status === 'loading') return null;
  return <div className="privacy-screen"><main id="conteudo" className="operation-feedback"><h1>{status === 'unavailable' ? 'Acesso indisponível' : 'Acesso não autorizado'}</h1><p role="alert" className="form-feedback error">{status === 'unavailable' ? 'Não conseguimos verificar sua sessão agora. Tente novamente.' : 'Sua conta não possui permissão ativa para esta área. Fale com o escritório.'}</p><button className="primary-button" onClick={auth.refresh}><RefreshCw size={18} aria-hidden="true" />Verificar novamente</button>{auth.contexts.length > 0 && <Link className="return-login" to={auth.contexts.some(c => c.role_code !== 'client') ? paths.panel : paths.clientPanel}><ArrowLeft size={18} aria-hidden="true" />Ir para minha área</Link>}{error && <p role="alert" className="form-feedback error">{error}</p>}<button className="secondary-button" disabled={busy} onClick={() => {
    setBusy(true); setError('');
    void auth.logout().then(ok => { if (!ok) setError('Não foi possível sair. Tente novamente.'); }).catch(() => setError('Não foi possível sair. Tente novamente.')).finally(() => setBusy(false));
  }}><LogOut size={18} aria-hidden="true" />Sair da conta</button><Link className="return-login" to={client ? paths.client : paths.team}><ArrowLeft size={18} aria-hidden="true" />Voltar para entrar</Link></main><PrivacyFooter/></div>;
}

