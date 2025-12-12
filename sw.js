// Minimal Service Worker - v6
const CACHE = 'vp-v6';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  // Only cache our own files, let everything else go to network
  if (e.request.method !== 'GET') return;
  
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
