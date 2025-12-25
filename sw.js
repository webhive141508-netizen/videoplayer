// Service Worker with Push Notifications for New Videos
const SHEET_ID = "18vr3vEXz378zaDwWZFcIDTZ1J5xzQ0vfZQ5KjjhhXVg";
const CHECK_INTERVAL = 10000; // Check every 60 seconds when active

// Store for tracking videos
let lastKnownVideos = [];

self.addEventListener('install', () => {
  console.log('[SW] Install - skip waiting');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activate - claim clients');
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))),
      self.clients.claim(),
      // Load last known videos from IndexedDB
      loadLastKnownVideos()
    ])
  );
});

// Network only - no caching for fetch
self.addEventListener('fetch', event => {
  return;
});

// Handle push notifications
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  
  let data = { title: 'New Video Added!', body: 'Check out the new video', icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      vibrate: [200, 100, 200],
      tag: 'new-video',
      renotify: true,
      data: data.url || './',
      actions: [
        { action: 'open', title: 'Watch Now' },
        { action: 'close', title: 'Dismiss' }
      ]
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked');
  event.notification.close();
  
  if (event.action === 'close') return;
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if (client.url.includes('videoplayer') && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data || './');
      }
    })
  );
});

// Periodic Background Sync (for checking new videos)
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync:', event.tag);
  
  if (event.tag === 'check-new-videos') {
    event.waitUntil(checkForNewVideos());
  }
});

// Regular sync (fallback)
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'check-videos') {
    event.waitUntil(checkForNewVideos());
  }
});

// Message handler for communication with main app
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'CHECK_VIDEOS') {
    checkForNewVideos();
  }
  
  if (event.data.type === 'UPDATE_VIDEOS') {
    lastKnownVideos = event.data.videos || [];
    saveLastKnownVideos(lastKnownVideos);
  }
  
  if (event.data.type === 'START_CHECKING') {
    startPeriodicCheck();
  }
});

// IndexedDB helpers for storing video state
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VideoPlayerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('videos')) {
        db.createObjectStore('videos', { keyPath: 'key' });
      }
    };
  });
}

async function saveLastKnownVideos(videos) {
  try {
    const db = await openDB();
    const tx = db.transaction('videos', 'readwrite');
    const store = tx.objectStore('videos');
    
    await new Promise((resolve, reject) => {
      const request = store.put({ key: 'lastVideos', videos: videos, timestamp: Date.now() });
      request.onsuccess = resolve;
      request.onerror = reject;
    });
    
    db.close();
    console.log('[SW] Saved', videos.length, 'videos to IndexedDB');
  } catch (e) {
    console.error('[SW] Failed to save videos:', e);
  }
}

async function loadLastKnownVideos() {
  try {
    const db = await openDB();
    const tx = db.transaction('videos', 'readonly');
    const store = tx.objectStore('videos');
    
    const result = await new Promise((resolve, reject) => {
      const request = store.get('lastVideos');
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });
    
    db.close();
    
    if (result && result.videos) {
      lastKnownVideos = result.videos;
      console.log('[SW] Loaded', lastKnownVideos.length, 'videos from IndexedDB');
    }
  } catch (e) {
    console.error('[SW] Failed to load videos:', e);
  }
}

// Fetch and parse sheet data
async function fetchSheetVideos() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=link&_=${Date.now()}`;
  
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Fetch failed');
    
    const text = await response.text();
    const jsonStart = text.indexOf('({');
    const jsonEnd = text.lastIndexOf('})');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('Invalid format');
    
    const data = JSON.parse(text.substring(jsonStart + 1, jsonEnd + 1));
    const videos = [];
    
    if (data.table && data.table.rows) {
      for (const row of data.table.rows) {
        if (row.c) {
          const titleCell = row.c[0];
          const urlCell = row.c[1];
          
          if (urlCell && urlCell.v) {
            const url = String(urlCell.v).trim();
            const videoId = extractVideoId(url);
            
            if (videoId) {
              let title = '';
              if (titleCell && titleCell.v) {
                title = String(titleCell.v).trim();
              }
              videos.push({ id: videoId, title: title || 'New Video' });
            }
          }
        }
      }
    }
    
    return videos;
  } catch (e) {
    console.error('[SW] Fetch error:', e);
    return null;
  }
}

function extractVideoId(url) {
  if (!url) return null;
  let match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  match = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  match = url.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (match) return match[1];
  match = url.match(/^([a-zA-Z0-9_-]{11})$/);
  if (match) return match[1];
  return null;
}

// Check for new videos and notify
async function checkForNewVideos() {
  console.log('[SW] Checking for new videos...');
  
  try {
    const currentVideos = await fetchSheetVideos();
    
    if (!currentVideos) {
      console.log('[SW] Could not fetch videos');
      return;
    }
    
    console.log('[SW] Current videos:', currentVideos.length, 'Last known:', lastKnownVideos.length);
    
    // Find new videos (IDs that weren't in the previous list)
    const lastIds = new Set(lastKnownVideos.map(v => v.id));
    const newVideos = currentVideos.filter(v => !lastIds.has(v.id));
    
    if (newVideos.length > 0 && lastKnownVideos.length > 0) {
      console.log('[SW] Found', newVideos.length, 'new videos!');
      
      // Show notification for each new video (max 3)
      const toNotify = newVideos.slice(0, 3);
      
      for (const video of toNotify) {
        await showNewVideoNotification(video);
      }
      
      if (newVideos.length > 3) {
        await self.registration.showNotification('Multiple New Videos!', {
          body: `${newVideos.length} new videos have been added`,
          icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
          badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
          vibrate: [200, 100, 200],
          tag: 'new-videos-multiple',
          data: './'
        });
      }
      
      // Notify the app
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({ type: 'NEW_VIDEOS', videos: newVideos });
      });
    }
    
    // Update stored videos
    lastKnownVideos = currentVideos;
    await saveLastKnownVideos(currentVideos);
    
  } catch (e) {
    console.error('[SW] Check error:', e);
  }
}

async function showNewVideoNotification(video) {
  const title = video.title || 'New Video Added!';
  
  // Try to get video thumbnail
  const thumbnail = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
  
  return self.registration.showNotification('🎬 New Video Added!', {
    body: title,
    icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
    badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
    image: thumbnail,
    vibrate: [200, 100, 200, 100, 200],
    tag: 'new-video-' + video.id,
    renotify: true,
    requireInteraction: true,
    data: { videoId: video.id, url: './' },
    actions: [
      { action: 'watch', title: '▶️ Watch Now' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  });
}

// Periodic checking when SW is active (fallback for browsers without periodic sync)
let checkInterval = null;

function startPeriodicCheck() {
  if (checkInterval) clearInterval(checkInterval);
  
  checkInterval = setInterval(() => {
    checkForNewVideos();
  }, CHECK_INTERVAL);
  
  // Initial check
  checkForNewVideos();
}

console.log('[SW] Service Worker loaded');
