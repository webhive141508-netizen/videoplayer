// Service Worker with Push Notifications Support
const SW_VERSION = '2.0.0';

self.addEventListener('install', () => {
  console.log('[SW] Install - version', SW_VERSION);
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activate - claiming clients');
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
  return;
});

// Handle push notifications
self.addEventListener('push', event => {
  console.log('[SW] Push received:', event);
  
  let data = {
    title: 'New Video Added!',
    body: 'A new video has been added to the playlist',
    icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
    badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
    tag: 'new-video',
    videoId: null,
    videoTitle: null
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    vibrate: [200, 100, 200],
    requireInteraction: true,
    actions: [
      { action: 'play', title: '▶ Play Now' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    data: {
      videoId: data.videoId,
      videoTitle: data.videoTitle,
      url: self.registration.scope
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const urlToOpen = event.notification.data?.url || self.registration.scope;
  const videoId = event.notification.data?.videoId;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes('videoplayer') && 'focus' in client) {
          // Send message to play the video
          if (videoId) {
            client.postMessage({
              type: 'PLAY_VIDEO',
              videoId: videoId,
              videoTitle: event.notification.data?.videoTitle
            });
          }
          return client.focus();
        }
      }
      // Open new window if not already open
      if (clients.openWindow) {
        let url = urlToOpen;
        if (videoId) {
          url += (url.includes('?') ? '&' : '?') + 'v=' + videoId;
        }
        return clients.openWindow(url);
      }
    })
  );
});

// Handle messages from main app
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, videoId, videoTitle } = event.data;
    
    self.registration.showNotification(title || 'New Video Added!', {
      body: body || 'Check out the new video',
      icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      tag: 'new-video-' + (videoId || Date.now()),
      vibrate: [200, 100, 200],
      requireInteraction: true,
      actions: [
        { action: 'play', title: '▶ Play Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: {
        videoId: videoId,
        videoTitle: videoTitle,
        url: self.registration.scope
      }
    });
  }
});
