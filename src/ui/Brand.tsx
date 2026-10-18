import { Link } from 'react-router-dom';
import { paths } from '../app/routes';
import { useAccountHome } from '../features/auth/useAccountHome';
export function Brand({ light = false, to }: { light?: boolean; to?: string }) {
  const accountHome = useAccountHome();
  return <Link to={to ?? accountHome ?? paths.home} className={`brand ${light ? 'brand-light' : ''}`} aria-label="Escritório JN — início">
    <span className="brand-monogram" aria-hidden="true">JN</span>
    <span className="brand-label"><strong>ESCRITÓRIO JN</strong><small>SOLUÇÕES EM GESTÃO E DOCUMENTAÇÃO</small></span>
  </Link>;
}
