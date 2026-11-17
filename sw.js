// Hızlı açılış: önce ağ (2 sn), yavaşsa/çevrimdışıysa önbellek
const C = 'kasko-v1';
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then((c) => c.addAll(['./', './index.html', './icon-180.png', './logo.jpg'])).catch(() => {}));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== C).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    caches.open(C).then(async (c) => {
      const fresh = fetch(e.request).then((r) => { if (r && r.ok) c.put(e.request, r.clone()); return r; });
      const timeout = new Promise((res) => setTimeout(() => res(null), 2000));
      try {
        const r = await Promise.race([fresh, timeout]);
        if (r) return r;
      } catch (err) {}
      const hit = await c.match(e.request, { ignoreSearch: true });
      return hit || fresh;
    })
  );
});
