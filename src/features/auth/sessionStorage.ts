import type { SupportedStorage } from '@supabase/supabase-js';

type Adoption = { signal: AbortSignal; previousToken: string | null };
const adoptions = new Map<string, Adoption>();
const memory = new Map<string, string>();
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
function commit(key: string, write: () => void): Promise<void> | void {
  // Lock only the storage commit, never network requests or Auth callbacks.
  // On browsers without Web Locks the synchronous guard still protects this tab.
  return persistent && navigator.locks ? navigator.locks.request(`jn-auth-storage:${key}`, write) : write();
}
export const sessionStorage: SupportedStorage = {
  getItem: read,
  setItem(key, value) {
    return commit(key, () => {
      const guard = adoptions.get(token(value) ?? '');
      if (guard) {
        guard.signal.throwIfAborted();
        if (token(read(key)) !== guard.previousToken) throw new DOMException('Session changed during login', 'AbortError');
      }
      if (persistent) persistent.setItem(key, value); else memory.set(key, value);
    });
  },
  removeItem(key) { return commit(key, () => { if (persistent) persistent.removeItem(key); else memory.delete(key); }); },
};

// Short-lived guards contain no role claims; all authorization stays on the API.
export async function guardAdoption<T>(accessToken: string, guard: Adoption, adopt: () => Promise<T>): Promise<T> {
  adoptions.set(accessToken, guard);
  try { return await adopt(); } finally { adoptions.delete(accessToken); }
}
