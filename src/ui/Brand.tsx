import { Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import { paths } from '../app/routes';
import { useAccountHome } from '../features/auth/useAccountHome';

export function Brand({
  light = false,
  emblem = 'monogram',
  to,
}: {
  light?: boolean;
  emblem?: 'monogram' | 'scale';
  to?: string;
}) {
  const accountHome = useAccountHome();
  return (
    <Link
      to={to ?? accountHome ?? paths.home}
      className={`brand ${light ? 'brand-light' : ''} ${emblem === 'scale' ? 'brand-emblem-scale' : ''}`.trim()}
      aria-label="Escritório JN — início"
    >
      {emblem === 'scale' ? (
        <span className="brand-scale-icon" aria-hidden="true">
          <Scale size={24} strokeWidth={1.9} />
        </span>
      ) : (
        <span className="brand-monogram" aria-hidden="true">
          JN
        </span>
      )}
      <span className="brand-label">
        <strong>ESCRITÓRIO JN</strong>
        <small>SOLUÇÕES EM GESTÃO E DOCUMENTAÇÃO</small>
      </span>
    </Link>
  );
}
