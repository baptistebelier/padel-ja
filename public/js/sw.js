/* /RAM JA — service worker : réseau d'abord, copie locale si le réseau coupe.
   En ligne, tout se comporte comme d'habitude (toujours la dernière version) ;
   hors ligne, les pages et fichiers déjà ouverts restent disponibles. */
const CACHE = 'padelja-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // flux temps réel et API : jamais en cache (sauf les images des tournois)
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/img/')) return;
  if (req.headers.get('accept') === 'text/event-stream') return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: url.pathname.startsWith('/t/') }).then(r => r || new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })))
  );
});
