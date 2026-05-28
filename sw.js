/* Absensi FSR — Service Worker
 * Mendukung "Add to Home Screen" + offline cache shell sederhana
 * + showNotification untuk reminder absen.
 */

const CACHE_NAME = 'absensi-fsr-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

// INSTALL — pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {/* tolerate failures */}))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE — bersihkan cache lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// FETCH — Network first untuk panggilan GAS, Cache first untuk app shell
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Jangan intercept request ke Google Apps Script atau API eksternal
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return; // biarkan default network behaviour
  }

  // Untuk asset same-origin: cache-first dengan fallback ke network
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // Cache resource yang berhasil
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Untuk CDN (tailwind, chartjs, fonts): stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networked = fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || networked;
    })
  );
});

// NOTIFICATION CLICK — fokuskan window app saat notif ditap
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) {
        if ('focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// Optional: dukungan push event untuk masa depan (membutuhkan VAPID + backend)
self.addEventListener('push', (event) => {
  let data = { title: 'Absensi FSR', body: 'Pengingat absen.' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Absensi FSR', {
      body: data.body || '',
      icon: 'https://api.iconify.design/material-symbols:fingerprint.svg?color=%236366f1',
      tag: data.tag || 'absensi-push'
    })
  );
});
