import { useLocation } from 'react-router-dom';
import { paths } from '../../app/routes';
import { useAuth } from './AuthProvider';

export function useAccountHome(): string | undefined {
  const auth = useAuth();
  const { pathname, search } = useLocation();
  if (auth.status !== 'authorized') return;
  const client = auth.contexts.some(c => c.role_code === 'client');
  const team = auth.contexts.some(c => c.role_code !== 'client');
  const clientArea = [paths.clientPanel, paths.clientAccount, paths.client, paths.signup].some(path => path === pathname)
    || new URLSearchParams(search).get('area') === 'client';
  return client && (clientArea || !team) ? paths.clientPanel : paths.panel;
}
