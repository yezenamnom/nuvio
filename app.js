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
      published: v.publishedText || '', ts: v.published || 0, thumb: Invidious.pickThumb(base, v.videoThumbnails, v.videoId),
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
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const GENERAL_TOPICS = ['وثائقي', 'أغاني عربية', 'كوميديا', 'طبخ', 'رياضة', 'تقنية', 'ألعاب فيديو', 'سفر', 'مسلسلات', 'علوم', 'music', 'nature 4k', 'funny', 'cars'];

/* خلاصة منوّعة: كل مصدر (فيديو شفتو، بحث عملتو، إعجاب، مواضيع عامة عشوائية) بياخد دور صغير بكل دفعة،
   وما في قناة وحدة بتاخد أكتر من فيديوين بالدفعة. لهيك ما بيغلب «مستر بيست» أو غيرو. */
function makeHomeFeed(seen) {
  const watched = new Set(lib.list('hist').map(v => v.id));
  const hist = lib.list('hist').slice(0, 10), likes = lib.list('likes').slice(0, 5), favs = lib.list('favs').slice(0, 5);
  const searches = store.get('searches', []).slice(0, 6);
  const seeds = [];
  for (let i = 0; i < 10; i++) for (const v of [hist[i], likes[i], favs[i]]) if (v && !seeds.some(s => s.id === v.id)) seeds.push(v);
  const searchSrc = q => () => cached('s:' + q, 10 * 60e3, () => withFallback(x => apiFor(x).search(x.url, q, 1))).then(r => r.res.items);
  const relSrc = id => () => getVideo(id).then(r => r.res.related);
  const sources = [
    ...seeds.map(v => relSrc(v.id)),
    ...searches.map(searchSrc),
    ...shuffle(store.get('subs', [])).slice(0, 6).map(c => () => getChannel(c.id).then(r => r.res.items.slice(0, 8))),
    () => withFallback(x => apiFor(x).trending(x.url)).then(r => r.res),
    ...shuffle(GENERAL_TOPICS).slice(0, 4).map(searchSrc),
  ].map(load => ({ load, pool: null, dead: false }));
  const expandIds = [];
  const ensure = async s => {
    if (s.pool || s.dead) return;
    try { s.pool = shuffle((await s.load()).filter(v => v && v.id)); } catch { s.dead = true; }
  };
  return async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      // منحمّل لحد 5 مصادر جديدة سوا بكل دفعة
      await Promise.all(sources.filter(s => !s.pool && !s.dead).slice(0, 5).map(ensure));
      const live = shuffle(sources.filter(s => s.pool && s.pool.length));
      const out = [], perAuthor = {};
      for (let round = 0; round < 3 && out.length < 18; round++) {
        for (const s of live) {
          let tries = 0;
          while (s.pool.length && tries++ < 6) {
            const v = s.pool.shift();
            if (seen.has(v.id)) continue;
            if (watched.has(v.id)) { seen.add(v.id); continue; }
            const a = v.authorId || v.author || '';
            if ((perAuthor[a] || 0) >= 2) { s.pool.push(v); continue; }
            perAuthor[a] = (perAuthor[a] || 0) + 1;
            seen.add(v.id); expandIds.push(v.id); out.push(v);
            break;
          }
        }
      }
      // لحتى يضل لا نهائي: كل ما قلّت المصادر منضيف مشابهات فيديوهات عشوائية من اللي طلعو
      if (sources.filter(s => !s.dead && (!s.pool || s.pool.length)).length < 6) {
        for (let k = 0; k < 3 && expandIds.length; k++) {
          const id = expandIds.splice(Math.floor(Math.random() * expandIds.length), 1)[0];
          sources.push({ load: relSrc(id), pool: null, dead: false });
        }
        if (Math.random() < 0.5) sources.push({ load: searchSrc(GENERAL_TOPICS[Math.floor(Math.random() * GENERAL_TOPICS.length)]), pool: null, dead: false });
      }
      if (out.length) return out;
      if (!sources.some(s => !s.dead && (!s.pool || s.pool.length))) return [];
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
  const hasSubs = store.get('subs', []).length, hasLists = store.get('ytlists', []).length;
  if (searches.length || hasSubs || hasLists) {
    const row = el('div', 'chips');
    if (hasSubs) { const a = el('a', 'chip-q strong', '📺 اشتراكاتي'); a.href = '#/subs'; row.append(a); }
    if (hasLists) { const a = el('a', 'chip-q strong', '📂 قوائمي'); a.href = '#/lists'; row.append(a); }
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
  // أول مرة، أو صار يوم من آخر مزامنة: منذكّرك بكبسة وحدة
  const lastSync = store.get('lastSync', 0);
  if (!lastSync || (Date.now() - lastSync > 24 * 3600e3 && scriptInstalled())) view.append(syncBox(true));
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

/* ================= استيراد سجل يوتيوب (Google Takeout) ================= */
function applyImport(res) {
  // المشاهدات: منخلطها مع سجلّك ومنرتّبها من الأحدث
  const map = new Map();
  for (const v of lib.list('hist')) map.set(v.id, v);
  let added = 0;
  for (const v of res.watch) {
    const old = map.get(v.id);
    if (!old) added++;
    if (!old || (v.at || 0) > (old.at || 0)) map.set(v.id, { ...(old || {}), id: v.id, title: v.title, thumb: ytThumb(v.id), author: v.author, authorId: v.authorId, at: v.at || (old && old.at) || 0 });
  }
  store.set('hist', [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 500));
  // البحوث
  const cur = store.get('searches', []);
  const seenQ = new Set(cur.map(s => s.toLowerCase()));
  const newQ = res.search.sort((a, b) => b.at - a.at).map(s => s.q).filter(q => { const k = q.toLowerCase(); if (seenQ.has(k)) return false; seenQ.add(k); return true; });
  store.set('searches', cur.concat(newQ).slice(0, 40));
  return { videos: added, searches: Math.min(newQ.length, Math.max(0, 40 - cur.length)) };
}

function importPanel(onDone) {
  const box = el('div', 'import-box');
  box.append(el('h3', 'import-title', 'جيب سجلّك من يوتيوب'));
  box.append(el('p', 'muted', 'لحتى تبلّش المقترحات على ذوقك من أول يوم. الملف بينقرا جوّا جهازك بس وما بيطلع لأي مكان.'));
  const ol = el('ol', 'import-steps');
  const li1 = el('li');
  li1.append('افتح ');
  const a = el('a', 'lnk', 'takeout.google.com'); a.href = 'https://takeout.google.com/settings/takeout/custom/youtube'; a.target = '_blank'; a.rel = 'noopener noreferrer';
  li1.append(a, ' وسجّل دخول بحساب يوتيوب تبعك.');
  ol.append(li1);
  ol.append(el('li', null, 'اختار بس «YouTube and YouTube Music»، وبـ «All YouTube data included» خلّي بس «history» (السجل).'));
  ol.append(el('li', null, 'اختياري: من «Multiple formats» غيّر History لـ JSON (أدق). وإذا تركتها HTML كمان بتزبط.'));
  ol.append(el('li', null, 'اكبس «Next step» ← «Create export». غوغل بتبعتلك إيميل فيه الرابط (عادةً خلال دقايق).'));
  ol.append(el('li', null, 'نزّل الملف (zip) واختارو هون — ما في داعي تفكّو.'));
  box.append(ol);
  const input = el('input'); input.type = 'file'; input.accept = '.zip,.json,.html,application/zip,application/json,text/html'; input.multiple = true; input.hidden = true;
  const pick = el('button', 'btn primary', '📂 اختار ملف Takeout');
  const status = el('div', 'import-status');
  pick.onclick = () => input.click();
  input.onchange = async () => {
    if (!input.files.length) return;
    pick.disabled = true; status.textContent = 'عم اقرأ الملف…';
    try {
      const res = await NuvioImport.readFiles([...input.files]);
      if (!res.watch.length && !res.search.length) { status.textContent = 'ما لقيت سجل بهالملف. تأكد إنك اخترت ملف Takeout تبع يوتيوب (فيه history).'; return; }
      const r = applyImport(res);
      status.textContent = `✓ انضاف ${nf.format(r.videos)} فيديو و ${nf.format(r.searches)} بحث لسجلّك.`;
      note('انستورد السجل ✓');
      if (onDone) setTimeout(onDone, 1200);
    } catch (e) { status.textContent = 'ما زبط: ' + (e.message || e); }
    finally { pick.disabled = false; input.value = ''; }
  };
  box.append(pick, input, status);
  return box;
}

/* ================= مزامنة مع يوتيوب (عن طريق سكربت «صافي») =================
   Nuvio بيفتح يوتيوب ومعو ?nuvio_sync=1. السكربت (جوّا يوتيوب) بيسحب البيانات وبيرجّعها هون بالرابط (#/sync=…).
   الرابط بعد # ما بيروح لأي سيرفر، فالبيانات بتضل على الجهاز. */
const scriptInstalled = () => document.documentElement.hasAttribute('data-safi');
const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `قبل ${m} دقيقة` : m < 1440 ? `قبل ${Math.round(m / 60)} ساعة` : `قبل ${Math.round(m / 1440)} يوم`; };
function startSync() {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  location.href = `https://${mobile ? 'm' : 'www'}.youtube.com/feed/history?nuvio_sync=1&nuvio_back=${encodeURIComponent(location.origin)}`;
}
function syncBox(compact) {
  const box = el('div', 'sync-box' + (compact ? ' compact' : ''));
  const b = el('button', 'btn primary', '🔄 مزامنة مع يوتيوب');
  b.onclick = startSync;
  const txt = el('div', 'sync-txt');
  const last = store.get('lastSync', 0);
  txt.append(el('b', null, last ? `آخر مزامنة: ${ago(last)}` : 'جيب سجلّك من يوتيوب'));
  txt.append(el('div', 'muted', 'سجل المشاهدة، الاشتراكات، الإعجابات، وقوائم التشغيل — بيضلّو على جهازك.'));
  if (!scriptInstalled()) {
    const n = el('div', 'muted');
    n.append('بدّها سكربت «صافي» متركّب — ');
    const a = el('a', 'lnk', 'ركّبو من هون'); a.href = 'https://tube.glanzstar.de/'; a.target = '_blank'; a.rel = 'noopener';
    n.append(a); txt.append(n);
  }
  box.append(txt, b);
  return box;
}
function applySync(d) {
  const at = d.at || Date.now();
  const toItem = (x, when) => ({ id: x.i, title: x.t || x.i, thumb: ytThumb(x.i), author: x.a || '', authorId: x.c || '', at: when });
  const r = applyImport({ watch: (d.hist || []).map((x, k) => ({ id: x.i, title: x.t, author: x.a, authorId: x.c, at: at - k * 60000 })), search: [] });
  const likes = new Map(lib.list('likes').map(v => [v.id, v]));
  (d.likes || []).forEach((x, k) => { if (!likes.has(x.i)) likes.set(x.i, toItem(x, at - k * 60000)); });
  store.set('likes', [...likes.values()].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 500));
  if ((d.subs || []).length) store.set('subs', d.subs.map(c => ({ id: c.i, name: c.n, avatar: c.p })));
  const lists = (d.lists || []).filter(l => (l.v || []).length);
  if (lists.length) store.set('ytlists', lists.map(l => ({ id: l.i, title: l.t, videos: l.v.map(x => toItem(x, 0)) })));
  store.set('lastSync', at);
  return { hist: (d.hist || []).length, newHist: r.videos, subs: (d.subs || []).length, likes: (d.likes || []).length, lists: lists.length };
}
async function handleSync(b64) {
  history.replaceState(null, '', location.pathname + '#/'); // منشيل البيانات من الرابط فوراً
  lastPage = '#/';
  const box = el('div', 'sync-done');
  box.append(el('div', 'spinner'));
  view.replaceChildren(box);
  try {
    const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    const r = applySync(JSON.parse(json));
    box.replaceChildren(el('h2', null, '✓ خلصت المزامنة'));
    const ul = el('ul', 'sync-list');
    [['سجل المشاهدة', r.hist], ['الاشتراكات', r.subs], ['الإعجابات', r.likes], ['قوائم التشغيل', r.lists]].forEach(([k, n]) => {
      const li = el('li'); li.append(el('span', null, k), el('b', null, nf.format(n))); ul.append(li);
    });
    const go = el('a', 'btn primary', 'يلا عالرئيسية'); go.href = '#/';
    const subs = el('a', 'btn', '📺 اشتراكاتي'); subs.href = '#/subs';
    const row = el('div', 'v-actions'); row.style.justifyContent = 'center'; row.append(go, subs);
    box.append(ul, row);
  } catch (e) {
    box.replaceChildren(el('p', null, 'ما قدرت اقرا بيانات المزامنة. جرّب مرة تانية.'), syncBox());
  }
}

/* ---- اشتراكاتي: آخر فيديوهات القنوات اللي مشترك فيها ---- */
async function renderSubs() {
  document.title = 'اشتراكاتي — Nuvio';
  const subs = store.get('subs', []);
  const head = el('div', 'sec-head');
  head.append(el('h2', 'section-title', `اشتراكاتي (${subs.length})`));
  view.replaceChildren(head);
  if (!subs.length) { view.append(syncBox()); return; }
  const strip = el('div', 'sub-strip');
  subs.forEach(c => {
    const a = el('a', 'sub-chip'); a.href = chHref(c.id);
    chPreview.set(c.id, { name: c.name });
    const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = c.avatar || '';
    if (!c.avatar) img.remove();
    a.append(img, el('span', null, c.name)); a.dir = 'auto';
    strip.append(a);
  });
  view.append(strip, el('h2', 'section-title', 'آخر الفيديوهات'));
  const g = el('div', 'grid'); g.append(skCards(12)); view.append(g);
  const order = shuffle(subs);
  let i = 0, first = true;
  const load = async () => {
    const batch = order.slice(i, i + 6); i += 6;
    if (!batch.length) return false;
    const res = await Promise.all(batch.map(c => getChannel(c.id).then(r => r.res.items.slice(0, 4)).catch(() => [])));
    const items = res.flat().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (first) { g.replaceChildren(); first = false; }
    items.forEach(v => g.append(card(v)));
    return i < order.length;
  };
  try { await load(); await load(); if (g.isConnected) infinite(g, load); } catch { /* */ }
}

/* ---- قوائم التشغيل من يوتيوب ---- */
function renderLists() {
  document.title = 'قوائمي — Nuvio';
  const lists = store.get('ytlists', []);
  const head = el('div', 'sec-head');
  head.append(el('h2', 'section-title', `قوائم التشغيل (${lists.length})`));
  view.replaceChildren(head);
  if (!lists.length) { view.append(syncBox()); return; }
  const g = el('div', 'grid');
  lists.forEach(l => {
    const a = el('a', 'card list-card'); a.href = `#/list?id=${encodeURIComponent(l.id)}`;
    const th = el('div', 'thumb');
    const img = el('img'); img.alt = ''; img.loading = 'lazy';
    img.src = l.videos[0] ? ytThumb(l.videos[0].id) : 'icon-192.png';
    const badge = el('span', 'list-count', `${nf.format(l.videos.length)} ▶`);
    th.append(img, badge);
    const meta = el('div', 'meta'); const tt = el('h3', 'title', l.title); tt.dir = 'auto'; meta.append(tt);
    a.append(th, meta); g.append(a);
  });
  view.append(g);
}
function renderList(id) {
  const l = store.get('ytlists', []).find(x => x.id === id);
  if (!l) { location.hash = '#/lists'; return; }
  document.title = `${l.title} — Nuvio`;
  const head = el('div', 'sec-head');
  const back = el('a', 'sec-more', '← كل القوائم'); back.href = '#/lists';
  const h = el('h2', 'section-title', `${l.title} (${l.videos.length})`); h.dir = 'auto';
  head.append(h, back);
  const g = el('div', 'grid');
  l.videos.forEach(v => g.append(card(v)));
  view.replaceChildren(head, g);
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
  if (kind !== 'favs') {
    const sb = el('button', 'btn primary', '🔄 مزامنة');
    sb.onclick = startSync;
    head.append(sb);
  }
  if (kind === 'hist') {
    const imp = el('button', 'btn', '⬇️ ملف');
    const wantPanel = !items.length || /import/.test(location.hash);
    imp.onclick = () => { const ex = view.querySelector('.import-box'); if (ex) ex.remove(); else head.after(importPanel(() => renderLibrary('hist'))); };
    head.append(imp);
    view.replaceChildren(head);
    if (wantPanel) head.after(importPanel(() => renderLibrary('hist')));
  } else view.replaceChildren(head);
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
  active = { id, box, layout, main, title: () => (current && current.data.title) || (pv && pv.title) || '', author: () => (current && current.data.author) || (pv && pv.author) || '', np: () => np };
  enableSwipeDown(box);

  const setChip = () => {};

  let np = new NuvioPlayer(box, {
    onStall: t => recover(t), onError: t => recover(t),
    onCopy: () => {
      const u = `https://youtu.be/${id}`;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => note('انسخ الرابط ✓'), () => note(u));
    },
  });
  np.video.poster = ytThumb(id, 'hqdefault');
  window.__nuvioNp = np;
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
  layout.append(buildFab(() => np, id, () => (current && current.data.title) || (pv && pv.title) || ''));
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
    if (recovering || !box.isConnected || !np) return;
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
      if (!box.isConnected) return;
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
      if (!box.isConnected) return;
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

/* ================= الزر العايم (صفحة الفيديو) =================
   مشاركة، إعادة تحميل، مؤقت النوم، تكرار، AirPlay، صورة داخل صورة */
const FAB_ICO = {
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>',
  sleep: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M17 2.5l3 3-3 3"/><path d="M4 11V9.5a4 4 0 0 1 4-4h12"/><path d="M7 21.5l-3-3 3-3"/><path d="M20 13v1.5a4 4 0 0 1-4 4H4"/></svg>',
  cast: '<svg viewBox="0 0 24 24"><path d="M5 17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-1"/><path d="M12 15l5 6H7z"/></svg>',
  pip: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="11.5" width="7" height="5.5" rx="1"/></svg>',
};
const SLEEP_OPTS = [[0, 'إيقاف'], [15, '15 د'], [30, '30 د'], [45, '45 د'], [60, 'ساعة'], [90, 'ساعة ونص'], [-1, 'آخر الفيديو']];
const sleepState = { at: 0, endOfVideo: false, timer: null };

function buildFab(getNp, id, getTitle) {
  const wrap = el('div', 'fab-wrap');
  const btn = el('button', 'fab'); btn.innerHTML = FAB_ICO.more; btn.setAttribute('aria-label', 'أدوات');
  const menu = el('div', 'fab-menu'); menu.hidden = true;
  wrap.append(menu, btn);

  const row = (ico, label, onClick, extra) => {
    const r = el('button', 'fab-row');
    const i = el('span', 'fab-ico'); i.innerHTML = FAB_ICO[ico];
    r.append(i, el('span', 'fab-label', label));
    if (extra) r.append(extra);
    r.onclick = e => { e.stopPropagation(); onClick(r); };
    return r;
  };
  const sw = on => { const s = el('span', 'fab-switch' + (on ? ' on' : '')); s.append(el('span')); return s; };
  const fmtLeft = () => {
    if (sleepState.endOfVideo) return 'آخر الفيديو';
    if (!sleepState.at) return 'إيقاف';
    const m = Math.max(0, Math.ceil((sleepState.at - Date.now()) / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} س` : `${m} د`;
  };

  function draw() {
    menu.replaceChildren();
    const np = getNp();
    const url = `https://youtu.be/${id}`;
    menu.append(row('share', 'مشاركة', async () => {
      const title = getTitle();
      if (navigator.share) { try { await navigator.share({ title, url }); } catch { /* سكّرها */ } }
      else { try { await navigator.clipboard.writeText(url); note('انسخ الرابط ✓'); } catch { note(url); } }
      close();
    }));
    menu.append(row('reload', 'إعادة تحميل', () => { location.reload(); }));

    const sleepVal = el('span', 'fab-val', fmtLeft());
    const sleepRow = row('sleep', 'مؤقت النوم', () => { chips.hidden = !chips.hidden; }, sleepVal);
    const chips = el('div', 'fab-chips'); chips.hidden = true;
    SLEEP_OPTS.forEach(([m, label]) => {
      const on = m === 0 ? !sleepState.at && !sleepState.endOfVideo : m === -1 ? sleepState.endOfVideo : false;
      const c = el('button', 'fab-chip' + (on ? ' on' : ''), label);
      c.onclick = e => { e.stopPropagation(); setSleep(m, getNp); draw(); };
      chips.append(c);
    });
    menu.append(sleepRow, chips);

    if (np) {
      menu.append(row('loop', 'تكرار الفيديو', r => {
        np.setLoop(!np.loop);
        r.querySelector('.fab-switch').classList.toggle('on', np.loop);
        note(np.loop ? 'التكرار شغّال 🔁' : 'التكرار طافي');
      }, sw(np.loop)));
      menu.append(row('cast', 'AirPlay / عرض على شاشة', async () => {
        try { if (!(await np.cast())) note('العرض على شاشة مش مدعوم بهالمتصفح'); } catch { note('ما لقيت شاشة'); }
        close();
      }));
      if (np.canPip()) menu.append(row('pip', 'صورة داخل صورة', async () => {
        try { await np.pip(); } catch { note('ما زبطت صورة داخل صورة'); }
        close();
      }));
    }
  }
  function open() { draw(); menu.hidden = false; btn.classList.add('on'); }
  function close() { menu.hidden = true; btn.classList.remove('on'); }
  btn.onclick = e => { e.stopPropagation(); menu.hidden ? open() : close(); };
  const outside = e => { if (!wrap.isConnected) return document.removeEventListener('pointerdown', outside); if (!wrap.contains(e.target)) close(); };
  document.addEventListener('pointerdown', outside);
  // تحديث العدّاد وهي مفتوحة
  const tick = setInterval(() => {
    if (!wrap.isConnected) return clearInterval(tick);
    const v = menu.querySelector('.fab-val'); if (v && !menu.hidden) v.textContent = fmtLeft();
  }, 15000);
  return wrap;
}

/* مؤقت النوم: بيوقّف الفيديو (أو الصوت بالخلفية) بعد المدة اللي بتختارها، حتى لو نقلت لفيديو تاني */
function setSleep(min, getNp) {
  clearInterval(sleepState.timer);
  sleepState.at = 0; sleepState.endOfVideo = false;
  if (min === 0) { note('مؤقت النوم طافي'); return; }
  if (min === -1) {
    sleepState.endOfVideo = true;
    note('رح يوقف بآخر هالفيديو 🌙');
    const np = getNp();
    if (np) {
      np.setLoop(false);
      const stop = () => { if (sleepState.endOfVideo) { sleepState.endOfVideo = false; np.pauseAll(); } };
      np.video.addEventListener('ended', stop, { once: true });
      if (np.bg) np.bg.addEventListener('ended', stop, { once: true });
    }
    return;
  }
  sleepState.at = Date.now() + min * 60000;
  note(`رح يوقف بعد ${min >= 60 ? (min === 60 ? 'ساعة' : 'ساعة ونص') : min + ' دقيقة'} 🌙`);
  sleepState.timer = setInterval(() => {
    if (!sleepState.at || Date.now() < sleepState.at) return;
    sleepState.at = 0; clearInterval(sleepState.timer);
    document.querySelectorAll('video, audio').forEach(m => m.pause());
    if (window.__nuvioNp) window.__nuvioNp.pauseAll();
  }, 5000);
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
$('#q').addEventListener('focus', () => document.body.classList.add('search-focus'));
$('#q').addEventListener('blur', () => setTimeout(() => document.body.classList.remove('search-focus'), 160));
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

/* ================= المشغّل الصغير (اسحب الفيديو لتحت) ================= */
let active = null;          // الفيديو اللي عم يشتغل هلّق
let miniOn = false;
let lastPage = '#/';
const mini = el('div', 'mini'); mini.hidden = true;
document.body.append(mini);

function minimize() {
  if (!active || miniOn) return;
  const { box, id } = active;
  miniOn = true;
  const ph = el('div', 'player-ph'); ph.id = 'player-ph';
  box.replaceWith(ph);                 // منحط مكانو علامة لحتى نرجّعو
  box.classList.add('in-mini');
  mini.replaceChildren();
  const info = el('button', 'mini-info');
  const tt = el('span', 'mini-title', active.title()); tt.dir = 'auto';
  info.append(tt, el('span', 'mini-author', active.author()));
  info.onclick = () => { location.hash = `#/watch?v=${encodeURIComponent(id)}`; };
  const pp = el('button', 'mini-btn'); pp.setAttribute('aria-label', 'تشغيل/إيقاف');
  const v = active.np() && active.np().video;
  const drawPP = () => { pp.innerHTML = v && !v.paused ? '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'; };
  drawPP();
  if (v) { v.addEventListener('play', drawPP); v.addEventListener('pause', drawPP); }
  pp.onclick = e => { e.stopPropagation(); const n = active && active.np(); if (n) n.toggle(); };
  const x = el('button', 'mini-btn'); x.setAttribute('aria-label', 'سكّر');
  x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  x.onclick = e => { e.stopPropagation(); closeMini(); };
  const vid = el('div', 'mini-vid'); vid.append(box);
  vid.onclick = () => info.click();
  mini.append(vid, info, pp, x);
  mini.hidden = false;
  document.body.classList.add('has-mini');
  // ارجع لآخر صفحة كنت فيها غير الفيديو (مثلاً البحث)
  location.hash = lastPage || '#/';
}
function restoreMini() {
  if (!miniOn || !active) return false;
  miniOn = false;
  mini.hidden = true; document.body.classList.remove('has-mini');
  const { box, layout } = active;
  box.classList.remove('in-mini');
  view.replaceChildren(layout);
  const ph = layout.querySelector('#player-ph');
  if (ph) ph.replaceWith(box); else active.main.prepend(box);
  mini.replaceChildren();
  return true;
}
async function closeMini() {
  if (!active) return;
  const n = active.np();
  if (n) { n.pauseAll(); n.destroy(); }
  await destroyPlayer();
  active.box.remove();
  active = null; miniOn = false;
  mini.hidden = true; mini.replaceChildren(); document.body.classList.remove('has-mini');
}

/* سحب الفيديو لتحت بالإصبع (تلفون) */
function enableSwipeDown(box) {
  let y0 = null, x0 = 0, dy = 0;
  box.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || e.target.closest('.np-bottom, .np-menu') || document.fullscreenElement) { y0 = null; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0;
  }, { passive: true });
  box.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    const dx = Math.abs(e.touches[0].clientX - x0);
    if (dy > 10 && dy > dx) {
      box.style.transition = 'none';
      box.style.transform = `translateY(${Math.min(dy, 260) * 0.6}px) scale(${1 - Math.min(dy, 260) / 1200})`;
      box.style.opacity = String(1 - Math.min(dy, 260) / 700);
    }
  }, { passive: true });
  box.addEventListener('touchend', () => {
    if (y0 == null) return;
    box.style.transition = 'transform .2s, opacity .2s';
    box.style.transform = ''; box.style.opacity = '';
    if (dy > 90) minimize();
    y0 = null;
  });
}

/* ================= تحديث تلقائي للنسخة =================
   التلفون بيحفظ النسخة القديمة؛ فمنفحص ملف صغير، وإذا في نسخة أجدد منحمّلها. */
const APP_VERSION = '20261120045849';
async function checkUpdate() {
  try {
    const r = await fetch(`version.txt?x=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (v && v !== APP_VERSION && store.get('reloadedFor', '') !== v) {
      store.set('reloadedFor', v);
      if (active && active.np() && !active.np().video.paused) return; // ما منقطع فيديو شغّال
      location.replace(`${location.pathname}?v=${encodeURIComponent(v)}${location.hash}`);
    }
  } catch { /* بلا نت */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

/* ================= التنقّل ================= */
async function route() {
  const hash = location.hash.slice(1) || '/';
  if (hash.startsWith('/sync=')) return handleSync(hash.slice(6));
  const [path, qs] = hash.split('?');
  const p = new URLSearchParams(qs || '');
  hideSug();
  document.querySelectorAll('.top-nav a').forEach(x => x.classList.toggle('on', x.getAttribute('href') === '#' + path));
  document.body.classList.toggle('watching', path === '/watch');
  if (path !== '/watch') lastPage = '#' + hash;
  if (path === '/watch' && active && miniOn && p.get('v') === active.id) { restoreMini(); window.scrollTo(0, 0); return; }
  if (path === '/watch' && miniOn) await closeMini();
  if (path === '/watch' && active && !miniOn && active.id !== p.get('v')) { const n = active.np(); if (n) n.destroy(); active = null; }
  // إذا طلعت من الفيديو وهو مش مصغّر، منوقّفو
  if (path !== '/watch' && !miniOn) { await destroyPlayer(); if (active) { const n = active.np(); if (n) { n.pauseAll(); n.destroy(); } active = null; } }
  window.scrollTo(0, 0);
  if (path === '/search' && p.get('q')) return renderSearch(p.get('q'));
  if (path === '/watch' && p.get('v')) return renderWatch(p.get('v'), +p.get('t') || 0);
  if (path === '/channel' && p.get('id')) return renderChannel(p.get('id'));
  if (path === '/history') return renderLibrary('hist');
  if (path === '/likes') return renderLibrary('likes');
  if (path === '/favs') return renderLibrary('favs');
  if (path === '/subs') return renderSubs();
  if (path === '/lists') return renderLists();
  if (path === '/list' && p.get('id')) return renderList(p.get('id'));
  $('#q').value = '';
  return renderHome();
}
window.addEventListener('hashchange', route);

/* ================= البداية ================= */
if (window.shaka) shaka.polyfill.installAll();
probeAll();
discover();
checkUpdate();
setInterval(() => probeAll(), 10 * 60e3);
route();
