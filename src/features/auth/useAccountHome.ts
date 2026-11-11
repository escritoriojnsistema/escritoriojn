import { paths } from '../../app/routes';
import { useAuth } from './AuthProvider';

export function useAccountHome(): string | undefined {
  const auth = useAuth();
  if (auth.status !== 'authorized') return;
  return auth.portal === 'client' ? paths.clientPanel : paths.panel;
}
