// Minimal Service Worker v7
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Just pass through all requests - no caching interference
self.addEventListener('fetch', () => {});
