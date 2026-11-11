import type {ReactNode} from 'react';
import {Navigate} from 'react-router-dom';
import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationLayout } from './OperationLayout';
import {OperationalFeedback} from './OperationalFeedback';

export {OperationalFeedback} from './OperationalFeedback';

export function OperationalAccess({ client = false, busy = false, children }: { client?: boolean; busy?: boolean; children: (contexts: AccessContext[]) => ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <OperationalFeedback status="loading" />;
  if (auth.status === 'signedOut' || auth.status === 'expired') return <Navigate replace to={client ? paths.client : paths.team} state={auth.status === 'expired' ? { sessionExpired: true } : null} />;
  const contexts = auth.contexts.filter(context => client ? context.role_code === 'client' : context.role_code !== 'client');
  if (auth.status !== 'authorized' || !contexts.length) return <OperationalFeedback status={auth.status === 'unavailable' ? 'unavailable' : 'denied'} client={client} />;
  return <OperationLayout client={client} busy={busy}>{children(contexts)}</OperationLayout>;
}
