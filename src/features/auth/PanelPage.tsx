import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { paths } from '../../app/routes';
import { useAuth } from './AuthProvider';
import { AccessShell } from '../access/AccessShell';
const roleNames = { owner: 'Proprietário', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente' };
export default function PanelPage() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const client = pathname === paths.clientPanel;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (auth.status === 'loading') return <AccessShell title="Verificando acesso"><p role="status">Aguarde a verificação da sua sessão…</p></AccessShell>;
  if (auth.status === 'signedOut' || auth.status === 'expired') return <Navigate replace to={client ? paths.client : paths.team} state={auth.status === 'expired' ? { sessionExpired: true } : null} />;
  if (pathname === paths.authenticated && auth.status === 'authorized') return <Navigate replace to={auth.contexts.some(c => c.role_code !== 'client') ? paths.panel : paths.clientPanel} />;
  const contexts = auth.contexts.filter(c => client ? c.role_code === 'client' : c.role_code !== 'client');
  const unavailable = auth.status === 'unavailable';
  const denied = auth.status === 'denied' || (auth.status === 'authorized' && !contexts.length);
  async function logout() { setBusy(true); setError(''); if (!await auth.logout()) setError('Não foi possível encerrar a sessão. Tente novamente.'); setBusy(false); }
  return <AccessShell title={unavailable ? 'Acesso indisponível' : denied ? 'Acesso não autorizado' : client ? 'Meu espaço' : 'Painel da equipe'} description={unavailable ? 'Não conseguimos verificar sua sessão agora.' : denied ? 'Sua conta não possui acesso ativo a esta área. Fale com o escritório.' : 'Seu acesso foi verificado.'}>
    {!unavailable && !denied && <><dl className="account-details"><dt>Nome</dt><dd>{contexts[0].display_name || 'Não informado'}</dd><dt>Escritório</dt><dd>{contexts[0].office_name}</dd><dt>Perfil de acesso</dt><dd>{roleNames[contexts[0].role_code]}</dd></dl><p className="access-description">Este espaço receberá as funcionalidades nas próximas etapas.</p></>}
    {(unavailable || denied) && <><p role="alert" className="form-feedback error">{unavailable ? 'Tente novamente em instantes.' : 'A autenticação não concede permissões adicionais.'}</p><button className="primary-button" onClick={auth.refresh}>Verificar novamente</button>{auth.contexts.length > 0 && <Link className="return-login" to={client ? paths.panel : paths.clientPanel}>Ir para minha área</Link>}</>}
    {error && <p role="alert" className="form-feedback error">{error}</p>}<button className="secondary-button" disabled={busy} onClick={() => void logout()}>{busy ? 'Encerrando…' : 'Sair da conta'}</button>
  </AccessShell>;
}
