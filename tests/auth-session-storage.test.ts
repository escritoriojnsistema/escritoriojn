import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
after(() => { if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else Reflect.deleteProperty(globalThis, 'navigator'); });

function session(user = '22222222-2222-4222-8222-222222222222', sid = '33333333-3333-4333-8333-333333333333', suffix = 'a'): Session {
  return { access_token: `e30.${Buffer.from(JSON.stringify({ sub: user, session_id: sid })).toString('base64url')}.${suffix}`, refresh_token: 'local-refresh', user: { id: user } } as Session;
}
class LocalStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('encerramento é persistente por UID/session_id e recusa refresh, sem destruir nova sessão', async () => {
  const localStorage = new LocalStorage();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
  try {
    const storage = await import('../src/features/auth/sessionStorage.ts');
    assert.equal(typeof storage.endStoredSession, 'function', 'encerramento correlacionado ao escopo deve existir');
    const key = 'sb-local-auth-token';
    const old = session();
    await storage.sessionStorage.setItem(key, JSON.stringify(old));
    assert.equal(await storage.endStoredSession(key, old), true);
    assert.equal(await storage.sessionStorage.getItem(key), null);
    await assert.rejects(async () => storage.sessionStorage.setItem(key, JSON.stringify(session(undefined, undefined, 'rotated'))), { name: 'AbortError' });
    const reloadPath = '../src/features/auth/sessionStorage.ts?reload';
    const reloaded = await import(reloadPath);
    assert.equal(reloaded.isEndedSession(key, old), true);
    await assert.rejects(async () => reloaded.sessionStorage.setItem(key, JSON.stringify(old)), { name: 'AbortError' });
    // Persisted rejection is a deny marker, without tokens or permission claims.
    assert.equal([...localStorage.values.values()].some(value => value.includes('access_token') || value.includes('role_code')), false);
    const next = session(undefined, '44444444-4444-4444-8444-444444444444');
    await storage.sessionStorage.setItem(key, JSON.stringify(next));
    assert.equal(await storage.endStoredSession(key, old), false);
    assert.equal(JSON.parse(String(await storage.sessionStorage.getItem(key))).access_token, next.access_token);
    const otherUser = session('55555555-5555-4555-8555-555555555555');
    await storage.sessionStorage.setItem(key, JSON.stringify(otherUser));
    assert.equal(JSON.parse(String(await storage.sessionStorage.getItem(key))).user.id, otherUser.user.id);
    const forged = session(otherUser.user.id, '77777777-7777-4777-8777-777777777777', 'forged');
    assert.equal(await storage.endStoredSession(key, forged), false);
    assert.equal(JSON.parse(String(await storage.sessionStorage.getItem(key))).access_token, otherUser.access_token);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('adoção abandonada ou iniciada antes de outro login não sobrescreve armazenamento', async () => {
  const storage = await import('../src/features/auth/sessionStorage.ts');
  const key = 'sb-adoption-auth-token';
  const old = session();
  const next = session(undefined, '66666666-6666-4666-8666-666666666666');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(storage.guardAdoption(old.access_token, { signal: controller.signal, previousToken: null }, async () => storage.sessionStorage.setItem(key, JSON.stringify(old))), { name: 'AbortError' });
  await storage.sessionStorage.setItem(key, JSON.stringify(next));
  await assert.rejects(storage.guardAdoption(old.access_token, { signal: new AbortController().signal, previousToken: null }, async () => storage.sessionStorage.setItem(key, JSON.stringify(old))), { name: 'AbortError' });
  assert.equal(JSON.parse(String(await storage.sessionStorage.getItem(key))).access_token, next.access_token);
});

test('401 atrasado do token anterior não encerra token renovado; saída explícita encerra mesma sessão', async () => {
  const storage = await import('../src/features/auth/sessionStorage.ts');
  const key = 'sb-refresh-auth-token';
  const old = session();
  const rotated = session(undefined, undefined, 'new-token');
  await storage.sessionStorage.setItem(key, JSON.stringify(rotated));
  assert.equal(await storage.endStoredSession(key, old), false);
  assert.equal(JSON.parse(String(await storage.sessionStorage.getItem(key))).access_token, rotated.access_token);
  assert.equal(storage.isEndedSession(key, rotated), false);
  assert.equal(await storage.endStoredSession(key, old, 'signedOut'), true);
  assert.equal(await storage.sessionStorage.getItem(key), null);
});
