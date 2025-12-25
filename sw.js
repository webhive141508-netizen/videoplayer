// Service Worker with Background Notification Support
// Checks for new videos and sends notifications

const SW_VERSION = '2.0.0';
const SHEET_ID = "18vr3vEXz378zaDwWZFcIDTZ1J5xzQ0vfZQ5KjjhhXVg";
const CHECK_INTERVAL = 60000; // 1 minute

let knownVideoIds = new Set();
let config = { sheetId: SHEET_ID };

console.log('[SW] Service Worker v' + SW_VERSION + ' loading...');

// ===== INSTALL =====
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// ===== ACTIVATE =====
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    Promise.all([
      // Clear old caches
      caches.keys().then(keys => {
        return Promise.all(keys.map(key => {
          console.log('[SW] Deleting cache:', key);
          return caches.delete(key);
        }));
      }),
      // Take control of all clients
      self.clients.claim(),
      // Load known video IDs from IndexedDB
      loadKnownVideoIds()
    ])
  );
});

// ===== FETCH - Network Only =====
self.addEventListener('fetch', event => {
  // Let all requests go to network - no caching
  return;
});

// ===== MESSAGE FROM CLIENT =====
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'CONFIG') {
    config.sheetId = event.data.sheetId || SHEET_ID;
    console.log('[SW] Config updated, Sheet ID:', config.sheetId);
  }
  
  if (event.data.type === 'CHECK_NOW') {
    checkForNewVideos();
  }
  
  if (event.data.type === 'SYNC_KNOWN_IDS') {
    if (event.data.ids) {
      knownVideoIds = new Set(event.data.ids);
      saveKnownVideoIds();
    }
  }
});

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action, event.notification.tag);
  
  event.notification.close();
  
  const videoId = event.notification.data?.videoId;
  const targetUrl = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // If there's an existing window, focus it
        for (const client of clientList) {
          if (client.url.includes('videoplayer') && 'focus' in client) {
            // Send message to play the video
            if (videoId && event.action === 'play') {
              client.postMessage({
                type: 'PLAY_VIDEO',
                videoId: videoId
              });
            }
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) {
          let url = targetUrl;
          if (videoId && event.action === 'play') {
            url += '?play=' + videoId;
          }
          return clients.openWindow(url);
        }
      })
  );
});

// ===== PERIODIC BACKGROUND SYNC =====
self.addEventListener('periodicsync', event => {
  console.log('[SW] Periodic sync event:', event.tag);
  
  if (event.tag === 'check-new-videos') {
    event.waitUntil(checkForNewVideos());
  }
});

// ===== PUSH NOTIFICATIONS (for future server-based push) =====
self.addEventListener('push', event => {
  console.log('[SW] Push received:', event.data?.text());
  
  let data = { title: 'New Video!', body: 'A new video has been added.' };
  
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      vibrate: [200, 100, 200],
      data: data,
      actions: [
        { action: 'play', title: '▶ Play Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// ===== HELPER FUNCTIONS =====

// Extract video ID from YouTube URL
function getVideoId(url) {
  if (!url) return null;
  url = String(url).trim();
  
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

// Fetch sheet data
async function fetchSheetData() {
  const sheetId = config.sheetId || SHEET_ID;
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=link&_=${Date.now()}`;
  
  console.log('[SW] Fetching sheet data...');
  
  try {
    const response = await fetch(url, { 
      method: 'GET', 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch: ' + response.status);
    }
    
    const text = await response.text();
    const jsonStart = text.indexOf('({');
    const jsonEnd = text.lastIndexOf('})');
    
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('Invalid response format');
    }
    
    const jsonStr = text.substring(jsonStart + 1, jsonEnd + 1);
    const data = JSON.parse(jsonStr);
    
    const videos = [];
    
    if (data.table && data.table.rows) {
      for (const row of data.table.rows) {
        if (row.c) {
          const titleCell = row.c[0];
          const urlCell = row.c[1];
          
          let url = '';
          if (urlCell && urlCell.v) {
            url = String(urlCell.v).trim();
          }
          
          const videoId = getVideoId(url);
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
    
    console.log('[SW] Found', videos.length, 'videos');
    return videos;
  } catch (e) {
    console.error('[SW] Error fetching sheet:', e);
    return [];
  }
}

// Fetch YouTube video title
async function fetchVideoTitle(videoId) {
  try {
    const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await response.json();
    if (data.title) {
      return data.title;
    }
  } catch (e) {
    console.log('[SW] Failed to fetch title for', videoId);
  }
  return null;
}

// Check for new videos and notify
async function checkForNewVideos() {
  console.log('[SW] Checking for new videos...');
  
  try {
    const videos = await fetchSheetData();
    
    if (videos.length === 0) {
      console.log('[SW] No videos found');
      return;
    }
    
    // Load known IDs if not loaded
    if (knownVideoIds.size === 0) {
      await loadKnownVideoIds();
    }
    
    // Check for new videos
    const newVideos = [];
    for (const video of videos) {
      if (!knownVideoIds.has(video.id)) {
        newVideos.push(video);
        knownVideoIds.add(video.id);
      }
    }
    
    console.log('[SW] New videos found:', newVideos.length);
    
    // Send notifications for new videos
    for (const video of newVideos) {
      let title = video.title;
      
      // Fetch title if not available
      if (!title || title === 'New Video' || title === 'Loading...') {
        const fetchedTitle = await fetchVideoTitle(video.id);
        if (fetchedTitle) {
          title = fetchedTitle;
        }
      }
      
      // Show notification
      await showNewVideoNotification(video.id, title);
      
      // Notify all clients
      await notifyClients(video.id, title);
    }
    
    // Save known IDs
    if (newVideos.length > 0) {
      await saveKnownVideoIds();
    }
    
  } catch (e) {
    console.error('[SW] Error checking for new videos:', e);
  }
}

// Show notification for new video
async function showNewVideoNotification(videoId, title) {
  console.log('[SW] Showing notification for:', title);
  
  try {
    await self.registration.showNotification('🎬 New Video Added!', {
      body: title,
      icon: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      badge: 'https://raw.githubusercontent.com/webhive141508-netizen/videoplayer/main/icon.png',
      vibrate: [200, 100, 200],
      tag: videoId,
      renotify: true,
      requireInteraction: false,
      data: {
        videoId: videoId,
        title: title,
        url: self.registration.scope
      },
      actions: [
        { action: 'play', title: '▶ Play Now' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    });
    
    console.log('[SW] Notification shown successfully');
  } catch (e) {
    console.error('[SW] Error showing notification:', e);
  }
}

// Notify all connected clients
async function notifyClients(videoId, title) {
  const allClients = await clients.matchAll({ 
    type: 'window', 
    includeUncontrolled: true 
  });
  
  console.log('[SW] Notifying', allClients.length, 'clients');
  
  for (const client of allClients) {
    client.postMessage({
      type: 'NEW_VIDEO',
      videoId: videoId,
      title: title
    });
  }
}

// IndexedDB helpers for persisting known video IDs
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VideoPlayerSW', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config');
      }
    };
  });
}

async function loadKnownVideoIds() {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['config'], 'readonly');
      const store = transaction.objectStore('config');
      const request = store.get('knownVideoIds');
      
      request.onerror = () => {
        console.error('[SW] Error loading known IDs');
        resolve();
      };
      
      request.onsuccess = () => {
        if (request.result) {
          knownVideoIds = new Set(request.result);
          console.log('[SW] Loaded', knownVideoIds.size, 'known video IDs');
        }
        resolve();
      };
    });
  } catch (e) {
    console.error('[SW] IndexedDB error:', e);
    // Fallback: try localStorage via clients
    try {
      const allClients = await clients.matchAll({ type: 'window' });
      if (allClients.length > 0) {
        // Request known IDs from client
        allClients[0].postMessage({ type: 'REQUEST_KNOWN_IDS' });
      }
    } catch (e2) {
      console.error('[SW] Fallback also failed:', e2);
    }
  }
}

async function saveKnownVideoIds() {
  try {
    const db = await openDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['config'], 'readwrite');
      const store = transaction.objectStore('config');
      const request = store.put([...knownVideoIds], 'knownVideoIds');
      
      request.onerror = () => {
        console.error('[SW] Error saving known IDs');
        resolve();
      };
      
      request.onsuccess = () => {
        console.log('[SW] Saved', knownVideoIds.size, 'known video IDs');
        resolve();
      };
    });
  } catch (e) {
    console.error('[SW] Error saving to IndexedDB:', e);
  }
}

// ===== BACKGROUND INTERVAL CHECK =====
// Note: This only runs while the service worker is active
// For true background notifications, you'd need a server with Web Push

let checkInterval = null;

function startBackgroundCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  // Check every minute while SW is active
  checkInterval = setInterval(() => {
    checkForNewVideos();
  }, CHECK_INTERVAL);
  
  console.log('[SW] Background check started, interval:', CHECK_INTERVAL, 'ms');
}

// Start checking when SW activates
self.addEventListener('activate', () => {
  startBackgroundCheck();
});

// Initial check when SW starts
setTimeout(() => {
  checkForNewVideos();
}, 5000);

console.log('[SW] Service Worker v' + SW_VERSION + ' loaded!');
