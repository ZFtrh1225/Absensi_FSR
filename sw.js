/* Absensi FSR — PWA shell and background Web Push */
const CACHE_NAME = 'absensi-fsr-v3';
const SHELL = ['./index.html', './manifest.json', './push-config.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key.startsWith('absensi-fsr-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache Google Apps Script responses or third-party libraries.
  if (url.origin !== self.location.origin) return;
  const shell = request.mode === 'navigate' ||
    ['index.html', 'push-config.js', 'manifest.json'].includes(url.pathname.split('/').pop());
  if (!shell) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(request)) ||
      (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* empty payload */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'Absensi FSR', {
    body: payload.body || 'Jangan lupa melakukan absensi.',
    tag: payload.tag || 'absensi-reminder',
    data: { url: './index.html' },
    vibrate: [200, 100, 200]
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    for (const window of windows) {
      if (window.url.startsWith(self.registration.scope)) return window.focus();
    }
    return self.clients.openWindow('./index.html');
  }));
});
