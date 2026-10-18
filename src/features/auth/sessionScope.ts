import type { Session } from '@supabase/supabase-js';
import { uuidPattern } from '../../../shared/access';

// Correlation only: these unverified claims never grant access. The context API
// verifies identity/permissions. A new user or provider session cannot reuse UI
// from the previous session; refreshing the same provider session can keep it.
export function sessionScope(session: Session): string {
  try {
    const claims = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof claims.session_id === 'string' && uuidPattern.test(claims.session_id) && claims.sub === session.user.id)
      return `${session.user.id}:${claims.session_id}`;
  } catch { /* Malformed/legacy tokens must be reverified before reuse. */ }
  return session.access_token;
}
