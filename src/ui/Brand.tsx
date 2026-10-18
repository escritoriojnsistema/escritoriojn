import { Link } from 'react-router-dom';
import { paths } from '../app/routes';
export function Brand({ light = false, to = paths.home }: { light?: boolean; to?: string }) {
  return <Link to={to} className={`brand ${light ? 'brand-light' : ''}`} aria-label="Escritório JN — início">
    <span className="brand-monogram" aria-hidden="true">JN</span>
    <span className="brand-label"><strong>ESCRITÓRIO JN</strong><small>SOLUÇÕES EM GESTÃO E DOCUMENTAÇÃO</small></span>
  </Link>;
}
