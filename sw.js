const CACHE_NAME = 'video-player-v2';
const STATIC_CACHE = 'static-v2';

// Static assets to cache immediately
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// External resources to cache
const EXTERNAL_ASSETS = [
  'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

// Install event - cache essential files immediately
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      caches.open(CACHE_NAME).then(cache => {
        console.log('Caching external assets');
        // Cache external assets but don't fail if they don't load
        return Promise.allSettled(
          EXTERNAL_ASSETS.map(url => 
            fetch(url, { mode: 'cors' })
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(() => console.log('Could not cache:', url))
          )
        );
      })
    ])
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch event - Cache First for static, Network First for API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip YouTube and Google API requests - always go to network
  if (url.hostname.includes('youtube.com') || 
      url.hostname.includes('ytimg.com') ||
      url.hostname.includes('googlevideo.com') ||
      url.hostname.includes('google.com') && url.pathname.includes('spreadsheets')) {
    return;
  }
  
  // For static assets (same origin) - Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Return cached but also update cache in background
          fetch(event.request).then(response => {
            if (response && response.status === 200) {
              caches.open(STATIC_CACHE).then(cache => {
                cache.put(event.request, response);
              });
            }
          }).catch(() => {});
          return cached;
        }
        // Not in cache, fetch from network
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(STATIC_CACHE).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // For external resources (CDNs, fonts) - Cache First with network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Return cached version if network fails
        return caches.match(event.request);
      });
    })
  );
});
