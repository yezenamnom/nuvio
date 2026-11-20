/* Nuvio — واجهة شخصية لمشاهدة الفيديو بلا إعلانات.
   بتحكي مع سيرفرات Invidious / Piped العامة، وبتشغّل البث بمشغّل Nuvio الخاص (Shaka للـ DASH/HLS).
   كل شي تلقائي: اكتشاف السيرفرات، فحصها بفيديو حقيقي، ترتيبها حسب السرعة، والتبديل إذا واحد وقع.
   الصفحات بتنفتح فوراً بتحميل تدريجي، والمعلومات بتنجاب مسبقاً لمّا تقرّب على فيديو. */
'use strict';

/* ================= السيرفرات ================= */
const SEED_INSTANCES = [
  { url: 'https://yt.chocolatemoo53.com', type: 'invidious' },
  { url: 'https://inv.nadeko.net', type: 'invidious' },
  { url: 'https://invidious.nerdvpn.de', type: 'invidious' },
  { url: 'https://yewtu.be', type: 'invidious' },
  { url: 'https://invidious.tiekoetter.com', type: 'invidious' },
  { url: 'https://iv.melmac.space', type: 'invidious' },
  { url: 'https://invidious.privacyredirect.com', type: 'invidious' },
  { url: 'https://invidious.protokolla.fi', type: 'invidious' },
  { url: 'https://invidious.materialio.us', type: 'invidious' },
  { url: 'https://invidious.reallyaweso.me', type: 'invidious' },
  { url: 'https://invidious.private.coffee', type: 'invidious' },
  { url: 'https://invidious.ducks.party', type: 'invidious' },
  { url: 'https://inv.zzls.xyz', type: 'invidious' },
  { url: 'https://invidious.perennialte.ch', type: 'invidious' },
  { url: 'https://yt.artemislena.eu', type: 'invidious' },
  { url: 'https://invidious.lunar.icu', type: 'invidious' },
  { url: 'https://api.piped.private.coffee', type: 'piped' },
  { url: 'https://pipedapi.kavin.rocks', type: 'piped' },
  { url: 'https://pipedapi.adminforge.de', type: 'piped' },
  { url: 'https://pipedapi.leptons.xyz', type: 'piped' },
  { url: 'https://pipedapi.reallyaweso.me', type: 'piped' },
  { url: 'https://pipedapi.ducks.party', type: 'piped' },
  { url: 'https://piped-api.lunar.icu', type: 'piped' },
];
const PROBE_VIDEO = 'jNQXAC9IVRw'; // فيديو قصير ثابت منفحص فيه إذا السيرفر فعلاً بيقدر يجيب فيديوهات

const store = {
  get(k, d) { try { const v = localStorage.getItem('nuvio:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nuvio:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};

function loadInstances() {
  const all = [...SEED_INSTANCES];
  for (const x of store.get('extra', [])) if (!all.some(i => i.url === x.url)) all.push(x);
  return all;
}
let instances = loadInstances();
const health = store.get('health2', {}); // url -> { ok, ms, at }

function mark(url, ok, ms) {
  const prev = health[url];
  // منعمل متوسط للسرعة لحتى الترتيب يكون ثابت ومش متأثر بطلب وحيد بطيء
  const avg = ok && prev && prev.ok ? prev.ms * 0.6 + ms * 0.4 : ms;
  health[url] = { ok, ms: ok ? Math.round(avg) : 99999, at: Date.now() };
  store.set('health2', health);
}
/* الأقوى (الأسرع الشغّال) أول، بعدين اللي ما انفحص، بعدين المعطوب (منرجع نجرّبو بعد 10 دقايق) */
function score(i) {
  const h = health[i.url];
  if (!h) return 50000;
  if (!h.ok) return Date.now() - h.at > 10 * 60e3 ? 60000 : 90000;
  return h.ms;
}
const orderedInstances = () => [...instances].sort((a, b) => score(a) - score(b));
const hasFreshOk = () => Object.values(health).some(h => h.ok && Date.now() - h.at < 30 * 60e3);

async function fetchJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, referrerPolicy: 'no-referrer' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('مش JSON');
    const j = await r.json();
    if (j && j.error) throw new Error(String(j.error).split('\n')[0].slice(0, 160));
    return j;
  } finally { clearTimeout(t); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- الفحص: كل سيرفر منجرّبو بفيديو حقيقي، مش بس إنو بيرد ---- */
let readyResolve;
const ready = new Promise(r => { readyResolve = r; });
async function probe(inst) {
  const t0 = performance.now();
  try {
    const d = inst.type === 'piped'
      ? await fetchJSON(`${inst.url}/streams/${PROBE_VIDEO}`, 8000)
      : await fetchJSON(`${inst.url}/api/v1/videos/${PROBE_VIDEO}`, 8000);
    const n = inst.type === 'piped' ? (d.videoStreams || []).length : (d.adaptiveFormats || []).length + (d.formatStreams || []).length;
    if (!n) throw new Error('ما في صيغ فيديو');
    mark(inst.url, true, performance.now() - t0);
    return true;
  } catch { mark(inst.url, false); return false; }
}
function probeAll(force) {
  const list = instances.filter(i => force || !health[i.url] || Date.now() - health[i.url].at > 15 * 60e3);
  if (!list.length) { readyResolve(); return; }
  let left = list.length;
  list.forEach(i => probe(i).then(ok => { left--; if (ok || left === 0) readyResolve(); }));
}
/* ---- اكتشاف سيرفرات جديدة من القائمة الرسمية (مرة باليوم) ---- */
async function discover() {
  if (Date.now() - store.get('discAt', 0) < 24 * 3600e3) return;
  try {
    const d = await fetchJSON('https://api.invidious.io/instances.json?sort_by=health', 8000);
    const extra = d.filter(([, i]) => i && i.type === 'https' && i.api !== false && i.uri)
      .map(([, i]) => ({ url: i.uri.replace(/\/+$/, ''), type: 'invidious' }));
    store.set('extra', extra); store.set('discAt', Date.now());
    instances = loadInstances();
    probeAll();
  } catch { /* مش مشكلة */ }
}

/* تبديل تلقائي سريع: منبلّش بالأقوى، إذا تأخّر منبلّش بالتاني بنفس الوقت، وإذا وقع منروح عالي بعدو فوراً */
async function withFallback(op, { skip = [], stagger = 2000 } = {}) {
  if (!hasFreshOk()) await Promise.race([ready, sleep(5000)]); // أول فتحة: منستنّى نتيجة الفحص لحتى ما نبلّش بسيرفر مضروب
  const list = orderedInstances().filter(i => !skip.includes(i.url));
  return new Promise((resolve, reject) => {
    if (!list.length) return reject(new Error('ما في سيرفرات'));
    let done = false, idx = 0, running = 0, timer;
    const errors = [];
    const launch = () => {
      clearTimeout(timer);
      if (done || idx >= list.length) return;
      const inst = list[idx++]; running++;
      const t0 = performance.now();
      op(inst).then(res => {
        running--;
        if (done) return;
        done = true; clearTimeout(timer);
        mark(inst.url, true, performance.now() - t0);
        resolve({ inst, res });
      }, e => {
        running--;
        mark(inst.url, false);
        errors.push(`${host(inst.url)}: ${e.message || e}`);
        if (done) return;
        if (idx < list.length) launch();
        else if (!running) { const err = new Error('ما في سيرفر عم يرد هلّق، جرّب بعد شوي'); err.details = errors; reject(err); }
      });
      if (idx < list.length) timer = setTimeout(launch, stagger);
    };
    launch();
  });
}

/* ذاكرة مؤقتة للطلبات: نفس الفيديو أو القناة ما منجيبهن مرتين */
const memo = new Map();
function cached(key, ttl, fn) {
  const e = memo.get(key);
  if (e && Date.now() - e.at < ttl) return e.p;
  const p = fn();
  memo.set(key, { at: Date.now(), p });
  p.catch(() => memo.delete(key));
  return p;
}
const getVideo = id => cached('v:' + id, 20 * 60e3, () => withFallback(i => apiFor(i).video(i.url, id)));
const getChannel = id => cached('c:' + id, 10 * 60e3, () => withFallback(i => apiFor(i).channel(i.url, id)));

/* ================= محوّلات الـ API ================= */
const abs = (base, u) => (!u ? '' : u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? base + u : u);
const ytThumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

const Invidious = {
  pickThumb(base, arr, id) {
    const t = (arr || []).find(x => x.quality === 'medium') || (arr || []).find(x => x.quality === 'high') || (arr || [])[0];
    return t ? abs(base, t.url) : ytThumb(id);
  },
  pickAvatar(base, arr) {
    const a = (arr || []).filter(x => x.width >= 88).sort((x, y) => x.width - y.width)[0] || (arr || []).slice(-1)[0];
    return a ? abs(base, a.url) : '';
  },
  item(base, v) {
    return {
      id: v.videoId, title: v.title, author: v.author, authorId: v.authorId,
      duration: v.lengthSeconds, views: v.viewCount ?? null, viewsText: v.viewCountText,
      published: v.publishedText || '', thumb: Invidious.pickThumb(base, v.videoThumbnails, v.videoId),
      live: !!v.liveNow,
    };
  },
  async search(base, q, page) {
    const d = await fetchJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=${page}`);
    if (!Array.isArray(d)) throw new Error('رد غريب');
    return { items: d.filter(v => v.type === 'video').map(v => Invidious.item(base, v)), next: d.length ? page + 1 : null };
  },
  async suggest(base, q) {
    const d = await fetchJSON(`${base}/api/v1/search/suggestions?q=${encodeURIComponent(q)}`, 4000);
    return d.suggestions || [];
  },
  async resolve(base, url) {
    return fetchJSON(`${base}/api/v1/resolveurl?url=${encodeURIComponent(url)}`, 8000);
  },
  async channels(base, q) {
    const d = await fetchJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=channel&page=1`);
    return (Array.isArray(d) ? d : []).filter(c => c.type === 'channel').slice(0, 3).map(c => ({
      id: c.authorId, name: c.author, avatar: Invidious.pickAvatar(base, c.authorThumbnails),
      subs: c.subCount, videos: c.videoCount,
    }));
  },
  async channel(base, id, cont) {
    const vidsP = fetchJSON(`${base}/api/v1/channels/${id}/videos${cont ? `?continuation=${encodeURIComponent(cont)}` : ''}`, 15000);
    if (cont) { const v = await vidsP; return { items: (v.videos || []).map(x => Invidious.item(base, x)), next: v.continuation || null }; }
    // معلومات القناة وفيديوهاتها بنفس الوقت (أسرع من وحدة ورا التانية)
    const [vids, d] = await Promise.all([vidsP, fetchJSON(`${base}/api/v1/channels/${id}`, 15000)]);
    if (!(vids.videos || []).length && !d.author) throw new Error('قناة فاضية');
    const banner = (d.authorBanners || [])[0];
    return {
      info: {
        id, name: d.author, avatar: Invidious.pickAvatar(base, d.authorThumbnails), banner: banner ? abs(base, banner.url) : '',
        subs: d.subCount, description: d.description || '',
      },
      items: (vids.videos || []).map(x => Invidious.item(base, x)), next: vids.continuation || null,
    };
  },
  async trending(base) {
    let d = [];
    try { d = await fetchJSON(`${base}/api/v1/popular`); } catch { /* جرّب trending */ }
    if (!Array.isArray(d) || !d.length) d = await fetchJSON(`${base}/api/v1/trending?region=DE`);
    if (!Array.isArray(d) || !d.length) throw new Error('ما في رائج');
    return d.filter(v => v.videoId).map(v => Invidious.item(base, v));
  },
  async video(base, id) {
    const d = await fetchJSON(`${base}/api/v1/videos/${id}`, 15000);
    const sources = [];
    // DASH عبر بروكسي السيرفر (local=true) — روابط googlevideo المباشرة مربوطة بـ IP السيرفر
    sources.push({ kind: 'dash', url: `${base}/api/manifest/dash/id/${id}?local=true` });
    for (const f of (d.formatStreams || []).slice().reverse()) {
      sources.push({ kind: 'mp4', url: `${base}/latest_version?id=${id}&itag=${f.itag}&local=true`, label: f.qualityLabel });
    }
    if (d.liveNow && d.hlsUrl) sources.unshift({ kind: 'hls', url: abs(base, d.hlsUrl) });
    // ملف صوت m4a للتشغيل بالخلفية (الآيفون بيقبلو أكتر من غيرو)
    const aud = (d.adaptiveFormats || []).filter(f => /^audio\/mp4/.test(f.type || '')).sort((a, b) => (b.itag === 140) - (a.itag === 140))[0];
    const audio = aud ? `${base}/latest_version?id=${id}&itag=${aud.itag}&local=true` : '';
    return {
      audio,
      id, title: d.title, author: d.author, authorId: d.authorId, subs: d.subCountText || '',
      avatar: Invidious.pickAvatar(base, d.authorThumbnails), views: d.viewCount, published: d.publishedText,
      likes: d.likeCount, description: d.description || '',
      related: (d.recommendedVideos || []).map(v => Invidious.item(base, v)),
      sources,
    };
  },
};

const Piped = {
  idOf: url => (url || '').split('v=')[1]?.split('&')[0] || '',
  item(v) {
    const id = Piped.idOf(v.url);
    return {
      id, title: v.title, author: v.uploaderName, authorId: (v.uploaderUrl || '').split('/channel/')[1] || '', duration: v.duration, views: v.views ?? null,
      published: v.uploadedDate || '', thumb: v.thumbnail || ytThumb(id), live: v.duration === -1,
    };
  },
  async search(base, q, page, nextToken) {
    const d = nextToken
      ? await fetchJSON(`${base}/nextpage/search?nextpage=${encodeURIComponent(nextToken)}&q=${encodeURIComponent(q)}&filter=videos`)
      : await fetchJSON(`${base}/search?q=${encodeURIComponent(q)}&filter=videos`);
    return { items: (d.items || []).filter(v => v.type === 'stream').map(Piped.item), next: d.nextpage || null };
  },
  async suggest(base, q) {
    const d = await fetchJSON(`${base}/suggestions?query=${encodeURIComponent(q)}`, 4000);
    return Array.isArray(d) ? d : [];
  },
  async resolve() { throw new Error('مش مدعوم'); },
  async channels() { return []; },
  async channel(base, id, cont) {
    const d = cont
      ? await fetchJSON(`${base}/nextpage/channel/${id}?nextpage=${encodeURIComponent(cont)}`)
      : await fetchJSON(`${base}/channel/${id}`, 15000);
    const items = (d.relatedStreams || []).filter(v => v.type === 'stream').map(Piped.item);
    if (!cont && !items.length) throw new Error('قناة فاضية'); // خلّي سيرفر تاني يربح
    if (cont) return { items, next: d.nextpage || null };
    return {
      info: { id, name: d.name, avatar: d.avatarUrl || '', banner: d.bannerUrl || '', subs: d.subscriberCount, description: d.description || '' },
      items, next: d.nextpage || null,
    };
  },
  async trending(base) {
    const d = await fetchJSON(`${base}/trending?region=DE`);
    if (!Array.isArray(d) || !d.length) throw new Error('ما في رائج');
    return d.map(Piped.item);
  },
  async video(base, id) {
    const d = await fetchJSON(`${base}/streams/${id}`, 15000);
    const sources = [];
    if (d.hls) sources.push({ kind: 'hls', url: d.hls });
    for (const s of (d.videoStreams || []).filter(s => !s.videoOnly)) sources.push({ kind: 'mp4', url: s.url, label: s.quality });
    if (!sources.length) throw new Error('ما في بث');
    const aud = (d.audioStreams || []).find(a => /mp4|m4a/.test(a.mimeType || a.format || ''));
    const txt = new DOMParser().parseFromString((d.description || '').replace(/<br\s*\/?>/gi, '\n'), 'text/html').body.textContent;
    return {
      id, title: d.title, author: d.uploader, authorId: (d.uploaderUrl || '').split('/channel/')[1] || '',
      avatar: d.uploaderAvatar || '', subs: d.uploaderSubscriberCount > 0 ? `${nf.format(d.uploaderSubscriberCount)} مشترك` : '', views: d.views, published: d.uploadDate?.slice(0, 10) || '',
      likes: d.likes, description: txt || '', audio: aud ? aud.url : '',
      related: (d.relatedStreams || []).filter(v => v.type === 'stream').map(Piped.item),
      sources,
    };
  },
};
const apiFor = inst => (inst.type === 'piped' ? Piped : Invidious);

/* ================= أدوات ================= */
const $ = s => document.querySelector(s);
const view = $('#view');
const host = u => { try { return new URL(u).host; } catch { return u; } };
const nf = new Intl.NumberFormat('ar', { notation: 'compact', maximumFractionDigits: 1 });
const fmtViews = (n, t) => (n != null && n > 0 ? `${nf.format(n)} مشاهدة` : t || '');
const fmtSubs = n => (n > 0 ? `${nf.format(n)} مشترك` : '');
const chHref = id => `#/channel?id=${encodeURIComponent(id)}`;
function fmtDur(s) {
  if (s == null || s <= 0) return s === -1 ? 'مباشر' : '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = String(Math.floor(s % 60)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`;
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

let toastTimer;
function note(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
function showError(err, retry) {
  view.replaceChildren();
  const d = el('div', 'empty');
  d.append(el('p', null, err.message || 'صار خطأ'));
  if (retry) { const b = el('button', 'btn primary', 'جرّب مرة تانية'); b.onclick = retry; d.append(b); }
  view.append(d);
}

/* ---- هياكل تحميل تدريجي (بدل كتابة «عم يحمّل») ---- */
function skCard(row) {
  const c = el('div', 'card sk-card' + (row ? ' row' : ''));
  const th = el('div', 'thumb sk');
  const meta = el('div', 'meta');
  meta.append(el('div', 'sk sk-line'), el('div', 'sk sk-line short'));
  c.append(th, meta);
  return c;
}
function skCards(n, row) { const f = document.createDocumentFragment(); for (let i = 0; i < n; i++) f.append(skCard(row)); return f; }

/* ---- تمرير لا نهائي: لمّا توصل لآخر القائمة بيحمّل لحالو ---- */
function infinite(list, loadMore, { row = false } = {}) {
  const sentinel = el('div', 'sentinel');
  list.after(sentinel);
  let busy = false, dead = false;
  const io = new IntersectionObserver(async entries => {
    if (dead || busy || !entries.some(e => e.isIntersecting)) return;
    busy = true;
    const sk = skCards(row ? 3 : 4, row); const skNodes = [...sk.childNodes];
    list.append(sk);
    let more = false;
    try { more = await loadMore(); } catch { more = true; await sleep(2000); }
    skNodes.forEach(n => n.remove());
    busy = false;
    if (!more || !list.isConnected) { dead = true; io.disconnect(); sentinel.remove(); return; }
    // إذا لسا الحارس ظاهر (الشاشة كبيرة) منكمّل تحميل
    const r = sentinel.getBoundingClientRect();
    if (r.top < innerHeight + 800) { io.unobserve(sentinel); io.observe(sentinel); }
  }, { rootMargin: '1000px 0px' });
  io.observe(sentinel);
}

/* فيديوهات مقترحة لا نهائية: منفتح مشابهات المشابهات، متل يوتيوب */
function relatedFeed(seedIds, seen) {
  const queue = [...seedIds];
  return async () => {
    while (queue.length) {
      const id = queue.shift();
      try {
        const { res } = await getVideo(id);
        const fresh = res.related.filter(v => v.id && !seen.has(v.id));
        fresh.forEach(v => { seen.add(v.id); queue.push(v.id); });
        if (fresh.length) return fresh;
      } catch { /* جرّب اللي بعدو */ }
    }
    return [];
  };
}

/* ---- معلومات مسبقة: لمّا تقرّب على فيديو منبلّش نجيب معلوماتو ---- */
const preview = new Map();
const chPreview = new Map();
function prefetchVideo(id) { getVideo(id).catch(() => {}); }

function card(v, { row = false, noAuthorLink = false } = {}) {
  preview.set(v.id, v);
  if (v.authorId && v.author) chPreview.set(v.authorId, { name: v.author });
  const c = $('#cardTpl').content.firstElementChild.cloneNode(true);
  if (row) c.classList.add('row');
  c.href = `#/watch?v=${encodeURIComponent(v.id)}`;
  const img = c.querySelector('img');
  img.src = v.thumb;
  img.onerror = () => { if (img.src !== ytThumb(v.id)) img.src = ytThumb(v.id); };
  c.querySelector('.dur').textContent = v.live ? 'مباشر' : fmtDur(v.duration);
  const t = c.querySelector('.title');
  t.textContent = v.title; t.title = v.title; t.dir = 'auto';
  const views = v.live && !v.views ? '' : fmtViews(v.views, v.viewsText);
  const sub = c.querySelector('.sub');
  if (v.author && v.authorId && !noAuthorLink) {
    const a = el('span', 'ch-link', v.author);
    a.onclick = e => { e.preventDefault(); e.stopPropagation(); location.hash = chHref(v.authorId); };
    a.onpointerenter = () => getChannel(v.authorId).catch(() => {});
    sub.append(a);
  } else if (v.author) sub.append(v.author);
  const rest = [views, v.published].filter(Boolean).join(' • ');
  if (rest) sub.append((v.author ? ' • ' : '') + rest);
  let pre;
  const warm = () => { clearTimeout(pre); pre = setTimeout(() => prefetchVideo(v.id), 120); };
  c.addEventListener('pointerenter', warm);
  c.addEventListener('touchstart', () => prefetchVideo(v.id), { passive: true });
  c.addEventListener('pointerleave', () => clearTimeout(pre));
  return c;
}

/* صور القنوات: منصلّح الاسم الفرعي المعطوب، وإذا فشلت منجيبها من ggpht مباشرة */
async function setImg(img, url) {
  if (!url) { img.remove(); return; }
  img.referrerPolicy = 'no-referrer';
  img.onerror = () => {
    const m = url.match(/\/ggpht\/(.+)$/);
    if (m && !img.dataset.direct) { img.dataset.direct = '1'; img.src = 'https://yt3.ggpht.com/' + m[1]; }
  };
  img.src = await fixUrl(url);
}

function channelCard(ch) {
  chPreview.set(ch.id, ch);
  const a = el('a', 'ch-card'); a.href = chHref(ch.id);
  a.onpointerenter = () => getChannel(ch.id).catch(() => {});
  const img = el('img'); img.alt = ''; setImg(img, ch.avatar);
  const meta = el('div');
  const n = el('div', 'ch-name', ch.name); n.dir = 'auto';
  meta.append(n, el('div', 'sub', [fmtSubs(ch.subs), ch.videos > 0 ? `${nf.format(ch.videos)} فيديو` : ''].filter(Boolean).join(' • ')));
  a.append(img, meta);
  return a;
}

/* ================= مكتبتك (محفوظة على جهازك بس) ================= */
const slim = v => ({ id: v.id, title: v.title, thumb: v.thumb || ytThumb(v.id), author: v.author, authorId: v.authorId, duration: v.duration, views: v.views, published: v.published });
const lib = {
  list: k => store.get(k, []),
  has: (k, id) => store.get(k, []).some(v => v.id === id),
  add(k, v, max = 500) {
    const arr = store.get(k, []).filter(x => x.id !== v.id);
    arr.unshift({ ...slim(v), at: Date.now() });
    store.set(k, arr.slice(0, max));
  },
  remove(k, id) { store.set(k, store.get(k, []).filter(x => x.id !== id)); },
  toggle(k, v) { if (lib.has(k, v.id)) { lib.remove(k, v.id); return false; } lib.add(k, v); return true; },
  clear: k => store.set(k, []),
};
function addSearch(q) {
  if (parseYT(q)) return;
  const arr = store.get('searches', []).filter(x => x.toLowerCase() !== q.toLowerCase());
  arr.unshift(q); store.set('searches', arr.slice(0, 40));
}

/* ---- خلاصة الرئيسية: أول شي حسب ذوقك (آخر تشغيلات، آخر بحوث، إعجابات، مفضلة)،
        وإذا خلصو منكمّل باقتراحات عامة ومشابهاتها — تقريباً بلا نهاية ---- */
function makeHomeFeed(seen) {
  const watched = new Set(lib.list('hist').map(v => v.id));
  const hist = lib.list('hist').slice(0, 12), likes = lib.list('likes').slice(0, 6), favs = lib.list('favs').slice(0, 6);
  const searches = store.get('searches', []).slice(0, 6);
  const seeds = [];
  const pushSeed = v => { if (v && !seeds.some(s => s.id === v.id)) seeds.push(v); };
  for (let i = 0; i < 12; i++) { pushSeed(hist[i]); pushSeed(likes[i]); pushSeed(favs[i]); }
  // مهام بالتناوب: مشابهات فيديو شفتو، بعدين نتائج بحث عملتو، وهيك
  const tasks = [];
  for (let i = 0; i < Math.max(seeds.length, searches.length); i++) {
    if (seeds[i]) tasks.push(() => getVideo(seeds[i].id).then(r => r.res.related));
    if (searches[i]) tasks.push(() => cached('s:' + searches[i], 10 * 60e3, () => withFallback(x => apiFor(x).search(x.url, searches[i], 1))).then(r => r.res.items));
  }
  tasks.push(() => withFallback(x => apiFor(x).trending(x.url)).then(r => r.res));
  const expand = []; // فيديوهات منفتح مشابهاتها لاحقاً (لا نهائي)
  const fresh = list => {
    const out = [];
    for (const v of list || []) {
      if (!v.id || seen.has(v.id)) continue;
      seen.add(v.id); expand.push(v.id);
      if (!watched.has(v.id)) out.push(v);
    }
    // خلط خفيف لحتى ما تطلع كلها من نفس المصدر ورا بعض
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };
  return async () => {
    while (tasks.length) {
      try { const got = fresh(await tasks.shift()()); if (got.length) return got; } catch { /* اللي بعدو */ }
    }
    while (expand.length) {
      const id = expand.splice(Math.floor(Math.random() * Math.min(expand.length, 30)), 1)[0];
      try { const { res } = await getVideo(id); const got = fresh(res.related); if (got.length) return got; } catch { /* اللي بعدو */ }
    }
    return [];
  };
}

/* ================= الصفحات ================= */
async function renderHome() {
  document.title = 'Nuvio — فيديو بلا إعلانات';
  view.replaceChildren();
  // آخر البحوث
  const searches = store.get('searches', []).slice(0, 12);
  if (searches.length) {
    const row = el('div', 'chips');
    searches.forEach(s => { const a = el('a', 'chip-q', s); a.href = `#/search?q=${encodeURIComponent(s)}`; a.dir = 'auto'; row.append(a); });
    view.append(row);
  }
  // آخر التشغيلات (كمّل المشاهدة)
  const hist = lib.list('hist').slice(0, 16);
  if (hist.length) {
    const head = el('div', 'sec-head');
    const more = el('a', 'sec-more', 'الكل'); more.href = '#/history';
    head.append(el('h2', 'section-title', 'آخر اللي شفتو'), more);
    const shelf = el('div', 'shelf');
    hist.forEach(v => shelf.append(card(v)));
    view.append(head, shelf);
  }
  view.append(el('h2', 'section-title', hist.length || searches.length ? 'مقترحات إلك' : 'مقترحات'));
  const g = el('div', 'grid'); g.append(skCards(12));
  view.append(g);
  const seen = new Set();
  const feed = makeHomeFeed(seen);
  try {
    // أول دفعة كبيرة لحتى تتعبّى الشاشة فوراً
    let first = [];
    for (let i = 0; i < 3 && first.length < 24; i++) first = first.concat(await feed());
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!first.length) throw new Error('فاضي');
    first.forEach(v => g.append(card(v)));
    infinite(g, async () => { const more = await feed(); more.forEach(v => g.append(card(v))); return more.length > 0; });
  } catch {
    if (!g.isConnected) return;
    const d = el('div', 'empty');
    d.append(el('p', null, 'ابحث عن شي بدّك ياه، أو الصق رابط يوتيوب فوق:'));
    const row = el('div', 'v-actions'); row.style.justifyContent = 'center';
    for (const s of ['أخبار', 'وثائقي', 'موسيقى عربية', 'طبخ', 'lofi', 'برمجة']) {
      const b = el('a', 'btn', s); b.href = `#/search?q=${encodeURIComponent(s)}`; row.append(b);
    }
    d.append(row); g.replaceWith(d);
  }
}

/* سجل المشاهدة / الإعجابات / المفضلة */
function renderLibrary(kind) {
  const titles = { hist: 'سجل المشاهدة', likes: 'الإعجابات', favs: 'القائمة المفضلة' };
  const empties = { hist: 'لسا ما شفت شي.', likes: 'لسا ما عملت إعجاب لأي فيديو. اكبس 👍 تحت أي فيديو.', favs: 'القائمة فاضية. اكبس «حفظ» تحت أي فيديو.' };
  document.title = `${titles[kind]} — Nuvio`;
  const items = lib.list(kind);
  const head = el('div', 'sec-head');
  head.append(el('h2', 'section-title', `${titles[kind]} (${items.length})`));
  if (items.length) {
    const clr = el('button', 'btn', kind === 'hist' ? 'امسح السجل' : 'امسح الكل');
    clr.onclick = () => { if (confirm('متأكد؟ ما في رجعة.')) { lib.clear(kind); if (kind === 'hist') store.set('searches', []); renderLibrary(kind); } };
    head.append(clr);
  }
  view.replaceChildren(head);
  if (!items.length) { view.append(el('div', 'empty', empties[kind])); return; }
  const g = el('div', 'grid');
  items.forEach(v => {
    const c = card(v);
    const x = el('button', 'card-x', '✕'); x.title = 'شيل';
    x.onclick = e => { e.preventDefault(); e.stopPropagation(); lib.remove(kind, v.id); c.remove(); };
    c.querySelector('.thumb').append(x);
    g.append(c);
  });
  view.append(g);
}

async function renderSearch(q) {
  document.title = `${q} — Nuvio`;
  addSearch(q);
  $('#q').value = q;
  const chWrap = el('div', 'ch-strip');
  const g = el('div', 'grid'); g.append(skCards(12));
  view.replaceChildren(el('h2', 'section-title', `نتائج: ${q}`), chWrap, g);
  try {
    const { inst, res } = await cached('s:' + q, 10 * 60e3, () => withFallback(i => apiFor(i).search(i.url, q, 1)));
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!res.items.length) { g.replaceWith(el('div', 'empty', 'ما في نتائج.')); return; }
    apiFor(inst).channels(inst.url, q).then(list => list.forEach(ch => chWrap.append(channelCard(ch)))).catch(() => {});
    const seen = new Set();
    res.items.forEach(v => { seen.add(v.id); g.append(card(v)); });
    let next = res.next;
    const feed = relatedFeed(res.items.slice(0, 5).map(v => v.id), seen);
    infinite(g, async () => {
      if (next != null) {
        const r = await apiFor(inst).search(inst.url, q, typeof next === 'number' ? next : 0, typeof next === 'string' ? next : null);
        const fresh = r.items.filter(v => !seen.has(v.id));
        fresh.forEach(v => { seen.add(v.id); g.append(card(v)); });
        next = r.items.length ? r.next : null;
        if (fresh.length) return true;
      }
      // خلصت نتائج البحث؟ منكمّل بفيديوهات مشابهة
      const more = await feed(); more.forEach(v => g.append(card(v))); return more.length > 0;
    });
  } catch (e) { showError(e, () => renderSearch(q)); }
}

async function renderChannel(id) {
  const pv = chPreview.get(id) || {};
  const head = el('div', 'ch-head');
  const bannerSlot = el('div', 'ch-banner sk');
  const row = el('div', 'ch-row');
  const av = el('div', 'ch-avatar sk');
  const txt = el('div');
  const h = el('h1', 'ch-title', pv.name || ''); h.dir = 'auto';
  if (!pv.name) h.append(el('span', 'sk sk-line'));
  const subs = el('div', 'sub', fmtSubs(pv.subs));
  txt.append(h, subs); row.append(av, txt); head.append(bannerSlot, row);
  const g = el('div', 'grid'); g.append(skCards(12));
  view.replaceChildren(head, el('h2', 'section-title', 'الفيديوهات'), g);
  if (pv.name) document.title = `${pv.name} — Nuvio`;
  try {
    const { inst, res } = await getChannel(id);
    if (!g.isConnected) return;
    const { info } = res;
    document.title = `${info.name} — Nuvio`;
    h.textContent = info.name; subs.textContent = fmtSubs(info.subs);
    if (info.banner) { const b = el('img', 'ch-banner'); b.alt = ''; setImg(b, info.banner); bannerSlot.replaceWith(b); } else bannerSlot.remove();
    const avImg = el('img', 'ch-avatar'); avImg.alt = ''; setImg(avImg, info.avatar); av.replaceWith(avImg);
    if (info.description) {
      const d = el('div', 'desc', info.description); d.dir = 'auto';
      d.onclick = () => d.classList.toggle('open');
      head.append(d);
    }
    g.replaceChildren();
    if (!res.items.length) { g.replaceWith(el('div', 'empty', 'ما في فيديوهات.')); return; }
    res.items.forEach(v => g.append(card(v, { noAuthorLink: true })));
    let next = res.next;
    if (next) infinite(g, async () => {
      const r = await apiFor(inst).channel(inst.url, id, next);
      r.items.forEach(v => g.append(card(v, { noAuthorLink: true })));
      next = r.next;
      return !!next && r.items.length > 0;
    });
  } catch (e) { showError(e, () => renderChannel(id)); }
}

/* ---- تصليح لسيرفرات البث الفرعية المعطوبة ----
   بعض السيرفرات بتوزّع البث على أسماء فرعية مرقّمة (yt-comp1, yt-comp2 …).
   بعضها عندو خلل بشهادة TLS/ECH بيرفضو Chrome، والتانيين سليمين وبيقبلو نفس الرابط.
   فمنفحص كل اسم مرة وحدة، وإذا معطوب منبدّلو بأخ إلو سليم. */
const hostCheck = new Map();
function hostWorks(h) {
  if (!hostCheck.has(h)) {
    hostCheck.set(h, (async () => {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3500);
      try { await fetch(`https://${h}/`, { mode: 'no-cors', signal: ctl.signal, cache: 'no-store' }); return true; }
      catch { return false; } finally { clearTimeout(t); }
    })());
  }
  return hostCheck.get(h);
}
const altCache = new Map();
function altHost(h) {
  if (!altCache.has(h)) {
    altCache.set(h, (async () => {
      const m = h.match(/^([a-z-]*?)(\d+)(\..+)$/i);
      if (!m) return null;
      const cands = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `${m[1]}${n}${m[3]}`).filter(c => c !== h);
      const ok = await Promise.all(cands.map(hostWorks)); // نفحصهن كلهن سوا
      return cands.find((c, i) => ok[i]) || null;
    })());
  }
  return altCache.get(h);
}
async function fixUrl(u) {
  let url; try { url = new URL(u); } catch { return u; }
  if (!/\d\./.test(url.host) || await hostWorks(url.host)) return u;
  const alt = await altHost(url.host);
  if (alt) { url.host = alt; return url.toString(); }
  return u;
}
/* السيرفر بيحوّل لاسم فرعي عشوائي — منعيد المحاولة لحتى نوصل لواحد سليم ومنرجّع الرابط النهائي */
async function resolveUrl(u, tries = 8) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(u, { signal: ctl.signal, cache: 'no-store' });
      if (r.ok) { r.body?.cancel?.(); return r.url || u; }
      last = new Error('HTTP ' + r.status);
      if (r.status >= 400 && r.status < 500) break;
    } catch (e) { last = e; } finally { clearTimeout(t); }
  }
  throw last || new Error('ما وصل');
}

/* رابط صوت مباشر للتشغيل بالخلفية: منطلّعو من ملف DASH (مسموح CORS وبيوصل لسيرفر سليم) */
async function bgAudioUrl(res) {
  const dash = res.sources.find(s => s.kind === 'dash');
  if (!dash) return res.audio || '';
  const final = await resolveUrl(dash.url);
  const xml = await (await fetch(final, { cache: 'force-cache' })).text();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  let best = null;
  for (const set of doc.querySelectorAll('AdaptationSet')) {
    if (!/audio\/mp4/.test(set.getAttribute('mimeType') || '')) continue;
    for (const rep of set.querySelectorAll('Representation')) {
      const bw = +rep.getAttribute('bandwidth') || 0;
      const base = rep.querySelector('BaseURL');
      if (base && (!best || bw > best.bw)) best = { bw, url: base.textContent.trim() };
    }
  }
  return best ? fixUrl(new URL(best.url, final).href) : '';
}

let player = null;     // Shaka player
async function destroyPlayer() {
  if (player) { try { await player.destroy(); } catch { /* ignore */ } player = null; }
}

async function renderWatch(id, startTime) {
  await destroyPlayer();
  const pv = preview.get(id);
  const tried = [];
  let current = null; // { inst, data }

  /* ---- الصفحة بتنبني فوراً: صورة الفيديو بمحل المشغّل + العنوان والقناة إذا منعرفهن ---- */
  const layout = el('div', 'watch');
  const main = el('div', 'watch-main');
  const box = el('div', 'player-box');
  const info = el('div', 'info');
  const side = el('aside', 'related');
  main.append(box, info); layout.append(main, side);

  const setChip = () => {};

  let np = new NuvioPlayer(box, {
    onStall: t => recover(t), onError: t => recover(t),
    onCopy: () => {
      const u = `https://youtu.be/${id}`;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => note('انسخ الرابط ✓'), () => note(u));
    },
  });
  np.video.poster = ytThumb(id, 'hqdefault');
  box.classList.add('loading');

  const h1 = el('h1', 'v-title'); h1.dir = 'auto';
  if (pv) h1.textContent = pv.title; else h1.append(el('span', 'sk sk-line'));
  const metaRow = el('div', 'v-row');
  if (pv && pv.author) {
    const au = el(pv.authorId ? 'a' : 'span', 'author'); if (pv.authorId) au.href = chHref(pv.authorId);
    au.append(el('span', 'author-avatar sk'), el('span', null, pv.author));
    metaRow.append(au, el('span', null, fmtViews(pv.views, pv.viewsText)), el('span', null, pv.published || ''));
  } else metaRow.append(el('span', 'sk sk-line short'));
  const descSk = el('div', 'desc sk-desc'); descSk.append(el('div', 'sk sk-line'), el('div', 'sk sk-line'), el('div', 'sk sk-line short'));
  info.append(h1, metaRow, descSk);
  const sideList = el('div', 'related-list'); sideList.append(skCards(8, true));
  side.append(el('h2', 'section-title', 'فيديوهات مشابهة'), sideList);
  view.replaceChildren(layout);
  if (pv) document.title = `${pv.title} — Nuvio`;

  function embed() {
    destroyPlayer();
    if (np) { np.destroy(); np = null; }
    box.classList.remove('np', 'ui', 'paused', 'loading');
    box.replaceChildren();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1${startTime ? `&start=${Math.floor(startTime)}` : ''}`;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.append(f);
    setChip('مشغّل احتياطي', 'warn');
  }

  let srcList = [], srcIdx = 0, curInst = null, reloads = 0, secondRound = false;

  async function loadSource(s, startAt) {
    if (s.kind === 'mp4') {
      await destroyPlayer();
      np.setShaka(null);
      np.video.src = s.url;
      await new Promise((ok, bad) => {
        np.video.addEventListener('loadedmetadata', ok, { once: true });
        np.video.addEventListener('error', () => bad(new Error('mp4 فشل')), { once: true });
        setTimeout(() => bad(new Error('مهلة')), 15000);
      });
      if (startAt) np.video.currentTime = startAt;
    } else {
      if (!window.shaka || !shaka.Player.isBrowserSupported()) throw new Error('Shaka مش متوفر');
      await destroyPlayer();
      player = new shaka.Player();
      await player.attach(np.video);
      player.getNetworkingEngine().registerRequestFilter(async (type, req) => {
        req.uris = await Promise.all(req.uris.map(fixUrl));
      });
      player.configure({
        preferredVideoCodecs: ['avc1', 'vp9'],
        streaming: {
          bufferingGoal: 40, rebufferingGoal: 1,
          retryParameters: { maxAttempts: 4, baseDelay: 400, backoffFactor: 1.6, timeout: 12000 },
          stallEnabled: true, stallThreshold: 1, stallSkip: 0.1,
        },
        manifest: { retryParameters: { maxAttempts: 3, baseDelay: 400, timeout: 12000 } },
        abr: { enabled: true, defaultBandwidthEstimate: 5e6 }, // منبلّش بجودة منيحة بدل ما نبلّش بالأوطى
      });
      const me = player;
      player.addEventListener('error', ev => {
        console.warn('[nuvio] shaka', ev.detail);
        if (player === me && ev.detail && ev.detail.severity === 2) recover(np.video.currentTime);
      });
      const url = await resolveUrl(s.url);
      await player.load(url, startAt || null);
      np.setShaka(player);
      np.applySavedQuality();
    }
  }

  async function playSources(inst, sources, startAt) {
    curInst = inst; srcList = sources;
    if (!np) return false;
    for (srcIdx = 0; srcIdx < srcList.length; srcIdx++) {
      try {
        await loadSource(srcList[srcIdx], startAt);
        setChip('بلا إعلانات ✓', 'ok');
        np.video.play().catch(() => { /* المتصفح ممكن يمنع التشغيل التلقائي */ });
        return true;
      } catch (e) { console.warn('[nuvio] source failed', srcList[srcIdx], e); }
    }
    return false;
  }

  /* إذا علّق أو صار خطأ: أول شي منعيد تحميل نفس المصدر من نفس الثانية، بعدين منبدّل سيرفر لحالنا */
  let recovering = false;
  async function recover(t) {
    if (recovering || !layout.isConnected || !np) return;
    recovering = true;
    try {
      reloads++;
      if (reloads <= 2 && srcList[srcIdx]) {
        try { await loadSource(srcList[srcIdx], t); np.video.play().catch(() => {}); return; } catch { /* كمّل للسيرفر التاني */ }
      }
      reloads = 0;
      if (curInst) mark(curInst.url, false);
      await tryNext(t);
    } finally { recovering = false; }
  }

  async function tryNext(startAt) {
    try {
      const { inst, res } = tried.length
        ? await withFallback(i => apiFor(i).video(i.url, id), { skip: tried })
        : await getVideo(id);
      if (!layout.isConnected) return;
      tried.push(inst.url);
      if (!current) fillInfo(res);
      current = { inst, data: res };
      if (await playSources(inst, res.sources, startAt)) {
        bgAudioUrl(res).then(u => { if (u && np) np.setBgAudio(u); }).catch(() => {});
        return;
      }
      mark(inst.url, false);
      return tryNext(startAt);
    } catch (e) {
      if (!layout.isConnected) return;
      // دورة تانية على كل السيرفرات قبل المشغّل الاحتياطي (الخلل عندهن غالباً مؤقت)
      if (!secondRound && tried.length) { secondRound = true; tried.length = 0; memo.delete('v:' + id); return tryNext(startAt); }
      if (!current) { h1.textContent = 'ما قدرت جيب معلومات الفيديو'; metaRow.replaceChildren(); descSk.remove(); }
      embed();
    }
  }

  function fillInfo(d) {
    document.title = `${d.title} — Nuvio`;
    if (np) {
      np.opts.onNext = d.related[0] ? () => { location.hash = `#/watch?v=${encodeURIComponent(d.related[0].id)}`; } : null;
      np.setMeta({ title: d.title, artist: d.author, art: ytThumb(id, 'hqdefault') });
    }
    h1.textContent = d.title;
    metaRow.replaceChildren();
    const au = el(d.authorId ? 'a' : 'span', 'author');
    if (d.authorId) { au.href = chHref(d.authorId); chPreview.set(d.authorId, { name: d.author }); }
    if (d.avatar) { const im = el('img', 'author-avatar'); im.alt = ''; setImg(im, d.avatar); au.append(im); }
    const nameBox = el('span', 'author-name');
    const an = el('span', null, d.author || ''); an.dir = 'auto'; nameBox.append(an);
    if (d.subs) nameBox.append(el('span', 'author-subs', d.subs));
    au.append(nameBox);

    // إعجاب + حفظ بالمفضلة (محفوظين على جهازك)
    const item = { id, title: d.title, thumb: ytThumb(id), author: d.author, authorId: d.authorId, views: d.views, published: d.published, duration: pv && pv.duration };
    lib.add('hist', item);
    const actions = el('div', 'v-actions');
    const likeBtn = el('button', 'pill');
    const favBtn = el('button', 'pill');
    const drawBtns = () => {
      const liked = lib.has('likes', id), faved = lib.has('favs', id);
      likeBtn.classList.toggle('on', liked);
      likeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M7 10v11H3V10h4zm2 11h8.3a2 2 0 0 0 2-1.6l1.6-7.4A2 2 0 0 0 19 9.5h-5.3l.8-3.9a1.6 1.6 0 0 0-2.7-1.4L9 8v13z"/></svg><span>${d.likes > 0 ? nf.format(d.likes + (liked ? 1 : 0)) : 'إعجاب'}</span>`;
      favBtn.classList.toggle('on', faved);
      favBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg><span>${faved ? 'محفوظ' : 'حفظ'}</span>`;
    };
    likeBtn.onclick = () => { note(lib.toggle('likes', item) ? 'انضاف للإعجابات 👍' : 'انشال من الإعجابات'); drawBtns(); };
    favBtn.onclick = () => { note(lib.toggle('favs', item) ? 'انحفظ بالقائمة المفضلة' : 'انشال من القائمة المفضلة'); drawBtns(); };
    drawBtns();
    actions.append(likeBtn, favBtn);
    metaRow.append(au, actions);

    // الوصف تحت الفيديو متل يوتيوب: مشاهدات وتاريخ، نص مختصر، «المزيد»
    const desc = el('div', 'desc yt');
    desc.append(el('div', 'desc-meta', [fmtViews(d.views), d.published].filter(Boolean).join('  •  ')));
    const body = el('div', 'desc-body'); body.dir = 'auto';
    renderRich(body, d.description || '', s => { if (np) { np.video.currentTime = s; np.video.play().catch(() => {}); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    desc.append(body);
    const moreBtn = el('button', 'desc-more', 'المزيد');
    moreBtn.onclick = e => { e.stopPropagation(); desc.classList.toggle('open'); moreBtn.textContent = desc.classList.contains('open') ? 'عرض أقل' : 'المزيد'; };
    desc.onclick = e => { if (!desc.classList.contains('open') && !e.target.closest('a')) moreBtn.click(); };
    if (d.description) desc.append(moreBtn);
    descSk.replaceWith(desc);

    // المشابهة + تحميل لا نهائي
    sideList.replaceChildren();
    const seen = new Set([id]);
    d.related.forEach(v => { if (!seen.has(v.id)) { seen.add(v.id); sideList.append(card(v, { row: true })); } });
    const feed = relatedFeed(d.related.map(v => v.id), seen);
    infinite(sideList, async () => { const more = await feed(); more.forEach(v => sideList.append(card(v, { row: true }))); return more.length > 0; }, { row: true });
    // أول فيديو مشابه منجيب معلوماتو مسبقاً (غالباً رح تكبس عليه)
    if (d.related[0]) setTimeout(() => prefetchVideo(d.related[0].id), 4000);
  }

  setChip('…');
  await tryNext(startTime);
}

/* نص الوصف: الروابط بتصير قابلة للكبس، والأوقات (1:23) بتنقلك لهديك الثانية */
function renderRich(node, text, onTime) {
  const re = /(https?:\/\/[^\s]+)|(\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) node.append(text.slice(last, m.index));
    if (m[1]) {
      const yt = parseYT(m[1]);
      const a = el('a', 'lnk', m[1].length > 60 ? m[1].slice(0, 57) + '…' : m[1]);
      if (yt && yt.type === 'video') a.href = `#/watch?v=${yt.id}${yt.t ? `&t=${yt.t}` : ''}`;
      else if (yt && yt.type === 'channel') a.href = chHref(yt.id);
      else { a.href = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      node.append(a);
    } else {
      const parts = m[2].split(':').map(Number);
      const s = parts.reduce((acc, x) => acc * 60 + x, 0);
      const a = el('a', 'lnk', m[2]); a.href = '#';
      a.onclick = e => { e.preventDefault(); e.stopPropagation(); onTime(s); };
      node.append(a);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) node.append(text.slice(last));
}

/* ================= البحث: روابط + اقتراحات ================= */
function parseT(s) {
  if (!s) return 0;
  if (/^\d+$/.test(s)) return +s;
  const m = s.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}
/* بيفهم روابط يوتيوب: فيديو، شورتس، youtu.be، قناة، @اسم */
function parseYT(q) {
  if (!/youtu/i.test(q)) return null;
  let u; try { u = new URL(/^https?:\/\//i.test(q) ? q : 'https://' + q); } catch { return null; }
  if (!/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(u.hostname)) return null;
  const t = parseT(u.searchParams.get('t') || u.searchParams.get('start'));
  if (/youtu\.be$/i.test(u.hostname)) { const id = u.pathname.slice(1, 12); return id ? { type: 'video', id, t } : null; }
  if (u.searchParams.get('v')) return { type: 'video', id: u.searchParams.get('v').slice(0, 11), t };
  let m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
  if (m) return { type: 'video', id: m[2], t };
  m = u.pathname.match(/^\/channel\/(UC[\w-]{22})/);
  if (m) return { type: 'channel', id: m[1] };
  if (/^\/(@|c\/|user\/)/.test(u.pathname)) return { type: 'resolve', url: `https://www.youtube.com${u.pathname}` };
  return null;
}
async function openQuery(q) {
  const yt = parseYT(q);
  if (!yt) { location.hash = `#/search?q=${encodeURIComponent(q)}`; return; }
  if (yt.type === 'video') { location.hash = `#/watch?v=${encodeURIComponent(yt.id)}${yt.t ? `&t=${yt.t}` : ''}`; return; }
  if (yt.type === 'channel') { location.hash = chHref(yt.id); return; }
  note('عم افتح القناة…');
  try {
    const { res } = await withFallback(i => apiFor(i).resolve(i.url, yt.url));
    if (res.ucid) location.hash = chHref(res.ucid);
    else if (res.videoId) location.hash = `#/watch?v=${res.videoId}`;
    else throw new Error();
  } catch { location.hash = `#/search?q=${encodeURIComponent(yt.url.split('/').pop())}`; }
}

const sug = $('#suggest');
const ICO_HIST = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
const ICO_FIND = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>';
let sugItems = [], sugIdx = -1, sugTimer, sugSeq = 0, sugQ = '';
function hideSug() { sug.hidden = true; sugIdx = -1; }
/* بحوثك القديمة اللي بتبلّش متل اللي عم تكتبو (أو كلها إذا الخانة فاضية) */
function histMatches(q) {
  const all = store.get('searches', []);
  const s = q.toLowerCase();
  return (s ? all.filter(x => x.toLowerCase().startsWith(s) || x.toLowerCase().includes(' ' + s)) : all).slice(0, s ? 4 : 10);
}
function drawSug() {
  sug.replaceChildren();
  sugItems.forEach((it, i) => {
    const row = el('div', 'sug-row' + (i === sugIdx ? ' on' : '') + (it.hist ? ' hist' : ''));
    row.setAttribute('role', 'option');
    const ico = el('span', 'sug-ico'); ico.innerHTML = it.hist ? ICO_HIST : ICO_FIND;
    const txt = el('span', 'sug-txt'); txt.dir = 'auto';
    // متل يوتيوب: اللي كتبتو عادي، والتكملة بالعريض
    const q = sugQ.toLowerCase();
    if (q && it.text.toLowerCase().startsWith(q)) {
      txt.append(it.text.slice(0, q.length));
      txt.append(el('b', null, it.text.slice(q.length)));
    } else txt.append(el('b', null, it.text));
    row.append(ico, txt);
    if (it.hist) {
      const x = el('button', 'sug-x'); x.type = 'button'; x.title = 'شيل من السجل'; x.textContent = '✕';
      x.onmousedown = e => {
        e.preventDefault(); e.stopPropagation();
        store.set('searches', store.get('searches', []).filter(s => s !== it.text));
        sugItems = sugItems.filter(s => s !== it); drawSug();
      };
      row.append(x);
    } else {
      // سهم: بيحط الاقتراح بالخانة لتكمّل عليه بلا ما يبحث
      const f = el('button', 'sug-fill'); f.type = 'button'; f.title = 'حطّو بالخانة';
      f.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17 17L7 7M7 15V7h8"/></svg>';
      f.onmousedown = e => { e.preventDefault(); e.stopPropagation(); $('#q').value = it.text + ' '; $('#q').dispatchEvent(new Event('input')); };
      row.append(f);
    }
    row.onmousedown = e => { e.preventDefault(); $('#q').value = it.text; hideSug(); $('#q').blur(); openQuery(it.text); };
    sug.append(row);
  });
  sug.hidden = !sugItems.length;
}
function updateSug() {
  clearTimeout(sugTimer);
  const q = $('#q').value.trim();
  sugQ = q;
  if (parseYT(q)) { sugItems = []; hideSug(); return; }
  const hist = histMatches(q).map(text => ({ text, hist: true }));
  sugItems = hist; sugIdx = -1; drawSug();
  if (!q) return;
  const seq = ++sugSeq;
  sugTimer = setTimeout(async () => {
    try {
      const { res } = await cached('sg:' + q.toLowerCase(), 30 * 60e3, () => withFallback(i => apiFor(i).suggest(i.url, q), { stagger: 1200 }));
      if (seq !== sugSeq) return;
      const seen = new Set(hist.map(h => h.text.toLowerCase()));
      sugItems = hist.concat(res.filter(s => !seen.has(s.toLowerCase())).slice(0, 10 - hist.length).map(text => ({ text, hist: false })));
      sugIdx = -1; drawSug();
    } catch { /* بلا اقتراحات */ }
  }, 120);
}
$('#q').addEventListener('input', updateSug);
$('#q').addEventListener('focus', updateSug);
$('#q').addEventListener('keydown', e => {
  if (sug.hidden || !sugItems.length) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = sugItems.length;
    if (e.key === 'ArrowDown') sugIdx = sugIdx + 1 >= n ? -1 : sugIdx + 1;
    else sugIdx = sugIdx - 1 < -1 ? n - 1 : sugIdx - 1;
    drawSug();
    $('#q').value = sugIdx >= 0 ? sugItems[sugIdx].text : sugQ;
  } else if (e.key === 'Escape') hideSug();
});
$('#q').addEventListener('blur', () => setTimeout(hideSug, 150));

$('#searchForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#q').value.trim();
  hideSug();
  if (q) { $('#q').blur(); openQuery(q); }
});

/* ================= التنقّل ================= */
async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const p = new URLSearchParams(qs || '');
  hideSug();
  document.querySelectorAll('.top-nav a').forEach(x => x.classList.toggle('on', x.getAttribute('href') === '#' + path));
  if (path !== '/watch') await destroyPlayer();
  window.scrollTo(0, 0);
  if (path === '/search' && p.get('q')) return renderSearch(p.get('q'));
  if (path === '/watch' && p.get('v')) return renderWatch(p.get('v'), +p.get('t') || 0);
  if (path === '/channel' && p.get('id')) return renderChannel(p.get('id'));
  if (path === '/history') return renderLibrary('hist');
  if (path === '/likes') return renderLibrary('likes');
  if (path === '/favs') return renderLibrary('favs');
  $('#q').value = '';
  return renderHome();
}
window.addEventListener('hashchange', route);

/* ================= البداية ================= */
if (window.shaka) shaka.polyfill.installAll();
probeAll();
discover();
setInterval(() => probeAll(), 10 * 60e3);
route();
