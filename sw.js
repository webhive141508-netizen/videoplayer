// Service Worker v5 - Optimized & Lightweight
const CACHE_NAME = 'vp-v5';
const OFFLINE_PAGE = './index.html';

// Assets to cache on install
const PRECACHE = [OFFLINE_PAGE];

// Install - precache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch - stale-while-revalidate for same-origin, network-only for external
self.addEventListener('fetch', event => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  const url = new URL(request.url);
  
  // External resources - network only (YouTube, noembed, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Same-origin - stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(request).then(cached => {
        const fetchPromise = fetch(request).then(response => {
          if (response.ok) {
            cache.put(request, response.clone());
          }
          return response;
        }).catch(() => cached);
        
        return cached || fetchPromise;
      });
    })
  );
});
