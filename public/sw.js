/* Only this public allowlist may enter Cache Storage. No app/API runtime cache. */
const CACHE_NAME = 'jn-public-35-__BUILD_VERSION__';
const PUBLIC_FILES = ['/offline.html', '/icons/app-192.png', '/icons/app-512.png', '/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Validate the entire public response set before committing this version.
    const responses = await Promise.all(PUBLIC_FILES.map(async path => {
      const response = await fetch(path, {cache: 'no-store', credentials: 'omit', redirect: 'error'});
      if (!response.ok || response.redirected) throw new Error('Public shell unavailable');
      return response;
    }));
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PUBLIC_FILES.map((path, index) => cache.put(path, responses[index])));
  })());
  // Deliberately no skipWaiting: open operations keep their current build.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('jn-public-35-') && key !== CACHE_NAME).map(key => caches.delete(key)));
  })());
  // Deliberately no clients.claim and no message-triggered activation/reload.
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.search && PUBLIC_FILES.includes(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(CACHE_NAME)).match(url.pathname)) || fetch(request))());
    return;
  }
  // API/Auth/Storage and document URLs must keep their own errors and privacy.
  if (request.mode !== 'navigate' || /^\/(api|auth|storage)(\/|$)/i.test(url.pathname) || /\.[^/]+$/.test(url.pathname)) return;
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      const shell = await (await caches.open(CACHE_NAME)).match('/offline.html');
      return shell || new Response('Sem conexão. Reconecte para acessar o Escritório JN.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
    }
  })());
});
