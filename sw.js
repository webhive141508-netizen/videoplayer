// Service Worker - Network Only (No Caching)
// This ensures fresh content every time

self.addEventListener('install', () => {
  console.log('[SW] Install - skip waiting');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activate - clear caches and claim');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        console.log('[SW] Deleting cache:', key);
        return caches.delete(key);
      }));
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Network only - no caching
self.addEventListener('fetch', event => {
  // Let all requests go to network
  return;
});
