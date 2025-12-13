// Network-Only Service Worker - No Caching
// Version: 2.0.0

// Install - take over immediately
self.addEventListener('install', () => {
  console.log('[SW] Installing - skipping wait');
  self.skipWaiting();
});

// Activate - claim all clients and clear ALL caches
self.addEventListener('activate', event => {
  console.log('[SW] Activating - clearing all caches');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        console.log('[SW] Deleting cache:', key);
        return caches.delete(key);
      }));
    }).then(() => {
      console.log('[SW] Claiming clients');
      return self.clients.claim();
    })
  );
});

// Fetch - ALWAYS go to network, never cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Always fetch from network with cache busting
  event.respondWith(
    fetch(event.request, { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }).catch(() => {
      // If offline, try to return something
      return new Response('Offline', { status: 503 });
    })
  );
});

console.log('[SW] Service Worker loaded - Network Only Mode');
