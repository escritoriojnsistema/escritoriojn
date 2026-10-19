import type { Session, SupportedStorage } from '@supabase/supabase-js';
import { sessionScope } from './sessionScope';

type Adoption = { signal: AbortSignal; previousToken: string | null };
const adoptions = new Map<string, Adoption>();
const memory = new Map<string, string>();
const ended = new Set<string>();
export type SessionEndReason = 'expired' | 'signedOut';
let persistent: Storage | undefined;
try {
  const probe = `jn-storage-${crypto.randomUUID()}`;
  window.localStorage.setItem(probe, probe);
  window.localStorage.removeItem(probe);
  persistent = window.localStorage;
} catch { /* Same in-memory fallback as the SDK when storage is unavailable. */ }
const read = (key: string) => persistent ? persistent.getItem(key) : memory.get(key) ?? null;
function token(value: string | null): string | null {
  try { const parsed: unknown = JSON.parse(value ?? 'null'); return parsed && typeof parsed === 'object' && 'access_token' in parsed && typeof parsed.access_token === 'string' ? parsed.access_token : null; }
  catch { return null; }
}
function storedSession(value: string | null): Session | null {
  try {
    const parsed: unknown = JSON.parse(value ?? 'null');
    if (parsed && typeof parsed === 'object' && 'access_token' in parsed && typeof parsed.access_token === 'string'
      && 'user' in parsed && parsed.user && typeof parsed.user === 'object' && 'id' in parsed.user && typeof parsed.user.id === 'string') return parsed as Session;
  } catch { /* Non-session SDK entries, such as PKCE verifiers, are untouched. */ }
  return null;
}
export function sessionEndMarker(key: string, scope: string) { return `${key}:ended:${scope}`; }
export function isEndedSession(key: string, session: Session): boolean {
  const scope = sessionScope(session);
  return ended.has(sessionEndMarker(key, scope)) || (scope !== session.access_token && read(sessionEndMarker(key, scope)) !== null);
}
function write(key: string, value: string) { if (persistent) persistent.setItem(key, value); else memory.set(key, value); }
function remove(key: string) { if (persistent) persistent.removeItem(key); else memory.delete(key); }
function commit<T>(key: string, mutation: () => T): Promise<T> | T {
  // Lock only the storage commit, never network requests or Auth callbacks.
  // On browsers without Web Locks the synchronous guard still protects this tab.
  return persistent && navigator.locks ? navigator.locks.request(`jn-auth-storage:${key}`, mutation) : mutation();
}
export const sessionStorage: SupportedStorage = {
  getItem(key) {
    const value = read(key);
    const session = storedSession(value);
    return session && isEndedSession(key, session) ? null : value;
  },
  setItem(key, value) {
    return commit(key, () => {
      const session = storedSession(value);
      if (session && isEndedSession(key, session)) throw new DOMException('Session already ended', 'AbortError');
      const guard = adoptions.get(token(value) ?? '');
      if (guard) {
        guard.signal.throwIfAborted();
        if (token(read(key)) !== guard.previousToken) throw new DOMException('Session changed during login', 'AbortError');
      }
      write(key, value);
    });
  },
  removeItem(key) { return commit(key, () => remove(key)); },
};

// A denial marker contains only UID/session_id and a reason, never tokens or
// permissions. It survives reload and prevents an outstanding refresh from
// saving the ended provider session. New sessions for the same UID still work.
export async function endStoredSession(key: string, expected: Session, reason: SessionEndReason = 'expired'): Promise<boolean> {
  return commit(key, () => {
    const current = storedSession(read(key));
    // A 401 belongs to the token sent by that request. A newer token for the
    // same provider session must be checked/retried before it can be expired.
    if (reason === 'expired' && current && current.access_token !== expected.access_token) return false;
    const scope = sessionScope(expected);
    const marker = sessionEndMarker(key, scope);
    ended.add(marker);
    if (scope !== expected.access_token) write(marker, reason);
    if (current && sessionScope(current) !== scope) return false;
    remove(key);
    return true;
  });
}

// Short-lived guards contain no role claims; all authorization stays on the API.
export async function guardAdoption<T>(accessToken: string, guard: Adoption, adopt: () => Promise<T>): Promise<T> {
  adoptions.set(accessToken, guard);
  try { return await adopt(); } finally { adoptions.delete(accessToken); }
}
