// Minimal Service Worker for PWA Install capability
// Version 3 - Fast loading

const CACHE_NAME = 'vp-v3';

// Install - just activate immediately
self.addEventListener('install', event => {
  self.skipWaiting();
});

// Activate - take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - Network first, fast fallback
self.addEventListener('fetch', event => {
  // Skip non-GET and streaming requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Skip YouTube/Google API - always network
  if (url.hostname.includes('youtube.com') || 
      url.hostname.includes('ytimg.com') ||
      url.hostname.includes('googlevideo.com') ||
      url.hostname.includes('google.com')) {
    return;
  }
  
  // For same-origin requests - network first with cache fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
