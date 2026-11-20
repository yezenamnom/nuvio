/* Nuvio — Service Worker: بيحفظ هيكل الموقع على الجهاز لحتى يفتح فوراً.
   - ملفات الموقع (الصفحة، التصميم، المشغّل…) من التخزين، ومنحدّثها بس لمّا تنزل نسخة جديدة (VERSION).
   - المكتبات الخارجية الثابتة (مشغّل Shaka والخط) بتنحفظ مرة وحدة.
   - الفيديوهات وبيانات السيرفرات ما بتنحفظ هون: بتنجاب وقتها. */
const VERSION = '20261120064843';
const CACHE = 'nuvio-' + VERSION;
const EXT = 'nuvio-ext-v1';
const SHELL = ['./', 'index.html', 'style.css', 'player.js', 'app.js', 'music.js', 'more.js', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

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
      .then(keys => Promise.all(keys.filter(k => k.startsWith('nuvio-') && k !== CACHE && k !== EXT && k !== API).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('version.txt') || url.pathname.endsWith('sw.js')) return; // دايماً من النت
    // طلب نسخة أحدث من اللي عندي (?v=…) بعد تحديث: منجيبها من النت، مش من التخزين القديم
    const want = url.searchParams.get('v');
    if (want && want !== VERSION) {
      e.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true })));
      return;
    }
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

  // بيانات السيرفرات (بحث، قنوات، معلومات فيديو، اقتراحات): تخزين ذكي
  const rule = req.cache !== 'no-store' && apiRule(url);
  if (rule) { e.respondWith(swr(req, rule)); return; }

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

/* ================= تخزين ذكي لبيانات السيرفرات =================
   «stale-while-revalidate»: إذا الجواب محفوظ منرجّعو فوراً (الصفحة بتفتح بلحظة)، ومنحدّثو بالخلفية إذا صار قديم.
   هيك ما منرجع نطلب نفس الشي من السيرفر كل مرة، وكمان بيشتغل لو السيرفر بطيء أو واقف.
   ما منحفظ الفيديو نفسو ولا ملفات DASH (روابطها بتنتهي). */
const API = 'nuvio-api-v1';
const MAX_API = 400;
function apiRule(url) {
  const p = url.pathname;
  if (/\/(manifest|videoplayback|latest_version|companion|captions)\b/.test(p)) return null;
  if (/\/api\/v1\/search\/suggestions|\/suggestions$/.test(p)) return { fresh: 24 * 3600e3, max: 7 * 86400e3 };
  if (/\/api\/v1\/videos\/|\/streams\//.test(p)) return { fresh: 30 * 60e3, max: 45 * 60e3 }; // فيه روابط بتنتهي
  if (/\/api\/v1\/(search|channels|popular|trending|playlists)|\/(search|channel|nextpage|trending|playlists)\b/.test(p)) return { fresh: 10 * 60e3, max: 2 * 86400e3 };
  return null;
}
async function swr(req, rule) {
  const cache = await caches.open(API);
  const hit = await cache.match(req);
  const age = hit ? Date.now() - Number(hit.headers.get('x-nuvio-at') || 0) : Infinity;
  const refresh = () => fetch(req).then(async res => {
    if (res.ok && /json/.test(res.headers.get('content-type') || '')) {
      const body = await res.clone().arrayBuffer();
      const h = new Headers(res.headers); h.set('x-nuvio-at', String(Date.now()));
      await cache.put(req, new Response(body, { status: 200, headers: h }));
      trim(cache);
    }
    return res;
  });
  if (hit && age < rule.max) {
    if (age > rule.fresh) refresh().catch(() => {}); // جواب قديم شوي: منرجّعو هلّق ومنحدّث بالخلفية
    return hit;
  }
  try { return await refresh(); }
  catch (err) { if (hit) return hit; throw err; } // بلا نت؟ منرجّع آخر شي محفوظ
}
let trimming = false;
async function trim(cache) {
  if (trimming) return; trimming = true;
  try { const keys = await cache.keys(); for (let i = 0; i < keys.length - MAX_API; i++) await cache.delete(keys[i]); }
  finally { trimming = false; }
}
