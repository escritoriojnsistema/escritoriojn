import { KeyRound, ArrowRight, CircleUserRound } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { paths, normalizePathname } from '../../app/routes';
import { OperationalAccess } from './OperationalAccess';
import { OperationHeading } from './OperationLayout';
import { operationRoleNames } from './navigation';

export default function AccountPage() {
  const client = normalizePathname(useLocation().pathname) === paths.clientAccount;
  return <OperationalAccess client={client}>{contexts => <>
    <OperationHeading context={contexts[0]} title="Conta" showRole={false} description="Consulte os dados do seu acesso ao escritório." />
    <section className="operation-account" aria-labelledby="account-title"><div className="operation-section-title"><CircleUserRound size={23} aria-hidden="true" /><h2 id="account-title">Dados de acesso</h2></div>
      <dl className="operation-details"><div><dt>Nome</dt><dd>{contexts[0].display_name || 'Não informado'}</dd></div><div><dt>Perfil de acesso</dt><dd>{operationRoleNames[contexts[0].role_code]}</dd></div><div><dt>Escritório</dt><dd>{contexts[0].office_name}</dd></div></dl><p className="operation-note">Para corrigir seus dados, fale com o escritório.</p>
    </section>
    <section className="operation-security" aria-labelledby="security-title"><div><h2 id="security-title"><KeyRound size={21} aria-hidden="true" />Segurança da conta</h2><p>Precisa de uma nova senha? Receba as instruções no seu e-mail.</p></div><Link className="secondary-button" to={`${paths.recovery}?area=${client ? 'client' : 'team'}`}>Recuperar senha<ArrowRight size={18} aria-hidden="true" /></Link></section>
  </>}</OperationalAccess>;
}
