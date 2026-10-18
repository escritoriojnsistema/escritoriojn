import { ArrowRight, CircleUserRound, UsersRound } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { paths, normalizePathname } from '../../app/routes';
import { useAuth } from './AuthProvider';
import { OperationalAccess, OperationalFeedback } from '../operation/OperationalAccess';
import { OperationHeading } from '../operation/OperationLayout';

export default function PanelPage() {
  const auth = useAuth();
  const pathname = normalizePathname(useLocation().pathname);
  const client = pathname === paths.clientPanel;
  if (pathname === paths.authenticated) {
    if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
    if (auth.status === 'authorized') return <Navigate replace to={auth.contexts.some(context => context.role_code !== 'client') ? paths.panel : paths.clientPanel} />;
  }
  return <OperationalAccess client={client}>{contexts => <>
    <OperationHeading context={contexts[0]} title="Área de operação" description={client ? 'Seu atendimento em um só lugar.' : 'Acesse as funções disponíveis para o seu trabalho.'} />
    <section className="operation-shortcuts" aria-labelledby="shortcuts-heading"><h2 id="shortcuts-heading">Acesso rápido</h2><div className="operation-shortcut-grid">
      {!client && contexts.some(context => context.permissions.includes('users.manage')) && <Link className="operation-card" to={paths.teamManagement}><UsersRound size={25} aria-hidden="true" /><span><strong>Gerenciar equipe e convites</strong><small>Pessoas e permissões do escritório</small></span><ArrowRight size={19} aria-hidden="true" /></Link>}
      <Link className="operation-card" to={client ? paths.clientAccount : paths.account}><CircleUserRound size={25} aria-hidden="true" /><span><strong>Ver minha conta</strong><small>Dados de acesso e segurança</small></span><ArrowRight size={19} aria-hidden="true" /></Link>
    </div></section>
  </>}</OperationalAccess>;
}
