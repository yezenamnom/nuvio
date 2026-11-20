/* Nuvio — Service Worker: بيحفظ هيكل الموقع على الجهاز لحتى يفتح فوراً.
   - ملفات الموقع (الصفحة، التصميم، المشغّل…) من التخزين، ومنحدّثها بس لمّا تنزل نسخة جديدة (VERSION).
   - المكتبات الخارجية الثابتة (مشغّل Shaka والخط) بتنحفظ مرة وحدة.
   - الفيديوهات وبيانات السيرفرات ما بتنحفظ هون: بتنجاب وقتها. */
const VERSION = '20261120052729';
const CACHE = 'nuvio-' + VERSION;
const EXT = 'nuvio-ext-v1';
const SHELL = ['./', 'index.html', 'style.css', 'player.js', 'app.js', 'music.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('nuvio-') && k !== CACHE && k !== EXT).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('version.txt') || url.pathname.endsWith('sw.js')) return; // دايماً من النت
    if (req.mode === 'navigate') {
      e.respondWith(caches.match('index.html', { ignoreSearch: true }).then(r => r || fetch(req)));
      return;
    }
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // مكتبات ثابتة: مشغّل Shaka (رقم نسخة بالرابط) والخط
  if (/(^|\.)cdnjs\.cloudflare\.com$|^fonts\.googleapis\.com$|^fonts\.gstatic\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(EXT).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
});
