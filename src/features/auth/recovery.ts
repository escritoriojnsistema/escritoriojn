import type { Session } from '@supabase/supabase-js';
const markerKey = 'jn-recovery-flow';
function sessionId(session: Session): string | undefined {
  try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id; } catch { return undefined; }
}
// This short-lived marker only restores the form after reload. Supabase still
// verifies the actual session for password changes; this grants no app access.
export function rememberRecovery(session: Session) {
  const id = sessionId(session);
  try { if (id) sessionStorage.setItem(markerKey, JSON.stringify({ id, until: Date.now() + 15 * 60_000 })); } catch { /* Form works in memory if storage is disabled. */ }
}
export function restoreRecovery(session: Session): boolean {
  try {
    const marker = JSON.parse(sessionStorage.getItem(markerKey) ?? 'null');
    return !!marker && marker.id === sessionId(session) && marker.until > Date.now();
  } catch { return false; }
}
export function clearRecovery() { try { sessionStorage.removeItem(markerKey); } catch { /* No persisted state to clear. */ } }
