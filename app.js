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
async function withFallback(op, { skip = [], stagger = 2000, prefer = null } = {}) {
  if (!hasFreshOk()) await Promise.race([ready, sleep(5000)]); // أول فتحة: منستنّى نتيجة الفحص لحتى ما نبلّش بسيرفر مضروب
  const list = orderedInstances().filter(i => !skip.includes(i.url));
  if (prefer) list.sort((a, b) => (b.type === prefer) - (a.type === prefer)); // للفيديو: Invidious أول (جودة أعلى بـ DASH)
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
const getVideo = id => cached('v:' + id, 20 * 60e3, () => withFallback(i => apiFor(i).video(i.url, id), { prefer: 'invidious' }));
const getChannel = id => cached('c:' + id, 10 * 60e3, () => withFallback(i => apiFor(i).channel(i.url, id)));

/* ================= محوّلات الـ API ================= */
const abs = (base, u) => (!u ? '' : u.startsWith('//') ? 'https:' + u : u.startsWith('/') ? base + u : u);
const ytThumb = (id, q = 'mqdefault') => `https://i.ytimg.com/vi/${id}/${q}.jpg`;

/* بعض السيرفرات بتبعت الوصف كـ HTML بس: منحوّلو لنص، والروابط بتضل روابط كاملة */
function htmlText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  doc.querySelectorAll('a').forEach(a => {
    const href = a.getAttribute('href') || '', txt = a.textContent || '';
    let full = /^https?:/i.test(txt) ? txt : href;
    if (full.startsWith('/watch')) full = 'https://www.youtube.com' + full;
    if (/^https?:/i.test(full) && !/^(#|\d{1,2}:\d{2})/.test(txt)) a.replaceWith(full); // الأوقات (1:23) منخلّيها نص
  });
  return doc.body.textContent.trim();
}

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
  async search(base, q, page, _tok, f = {}) {
    const ex = (f.sort ? `&sort_by=${f.sort}` : '') + (f.date ? `&date=${f.date}` : '') + (f.dur ? `&duration=${f.dur}` : '') + (f.feat ? `&features=${f.feat}` : '');
    const d = await fetchJSON(`${base}/api/v1/search?q=${encodeURIComponent(q)}&type=video&page=${page}${ex}`);
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
      likes: d.likeCount, description: d.description || htmlText(d.descriptionHtml),
      captions: (d.captions || []).map(c => ({ label: c.label, lang: c.language_code || c.languageCode, url: abs(base, c.url) })),
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
    if (d.hls && !/odycdn|odysee|lbry/i.test(d.hls)) sources.push({ kind: 'hls', url: d.hls });
    for (const s of (d.videoStreams || []).filter(s => !s.videoOnly && /\/videoplayback/.test(s.url || ''))) sources.push({ kind: 'mp4', url: s.url, label: s.quality });
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
    if (!more) { dead = true; io.disconnect(); sentinel.remove(); return; }
    if (!list.isConnected) return;
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
  const ensure = s => {
    if (s.pool || s.dead) return Promise.resolve();
    if (!s.loading) s.loading = s.load().then(list => { s.pool = shuffle((list || []).filter(v => v && v.id)); }, () => { s.dead = true; });
    return s.loading;
  };
  return async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      // منبلّش بلحد 5 مصادر سوا، بس منكمّل أول ما يجهز واحد منهن (ما منستنّى الأبطأ)
      const pending = sources.filter(s => !s.pool && !s.dead).slice(0, 5).map(ensure);
      if (pending.length && !sources.some(s => s.pool && s.pool.length)) {
        await Promise.race([
          Promise.any(pending.map(p => p.then(() => { if (!sources.some(s => s.pool && s.pool.length)) throw 0; }))).catch(() => {}),
          Promise.allSettled(pending),
          sleep(6000),
        ]);
      }
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

/* ================= الاشتراكات (محفوظة على جهازك) ================= */
const subs = {
  list: () => store.get('subs', []),
  has: id => store.get('subs', []).some(c => c.id === id),
  toggle(ch) {
    const arr = store.get('subs', []);
    const i = arr.findIndex(c => c.id === ch.id);
    if (i >= 0) { arr.splice(i, 1); store.set('subs', arr); return false; }
    arr.unshift({ id: ch.id, name: ch.name || '', avatar: ch.avatar || '' });
    store.set('subs', arr);
    return true;
  },
};
/* زر اشتراك: بيضيف القناة لاشتراكاتك، وبتصير فيديوهاتها تطلع بالمقترحات */
function subButton(ch) {
  const b = el('button', 'sub-btn');
  const draw = () => { const on = subs.has(ch.id); b.classList.toggle('on', on); b.textContent = on ? '✓ مشترك' : 'اشتراك'; };
  draw();
  b.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const on = subs.toggle(ch);
    draw();
    note(on ? `اشتركت بـ ${ch.name} 🔔` : `لغيت الاشتراك بـ ${ch.name}`);
  };
  return b;
}
/* صورة قناة مدوّرة + اسم (للصفوف) */
function channelBubble(c) {
  const a = el('a', 'sub-chip'); a.href = chHref(c.id); a.dir = 'auto';
  chPreview.set(c.id, { name: c.name });
  a.onpointerenter = () => getChannel(c.id).catch(() => {});
  const img = el('img'); img.alt = ''; img.loading = 'lazy';
  if (c.avatar) setImg(img, c.avatar); else img.remove();
  const ph = el('span', 'sub-ph', (c.name || '?').trim().charAt(0));
  a.append(c.avatar ? img : ph, el('span', null, c.name));
  return a;
}
/* عنوان قسم + «الكل» */
function sectionHead(title, href) {
  const head = el('div', 'sec-head');
  head.append(el('h2', 'section-title', title));
  if (href) { const a = el('a', 'sec-more', 'الكل'); a.href = href; head.append(a); }
  return head;
}

/* ================= الصفحات ================= */
async function renderHome(force) {
  document.title = 'Nuvio — فيديو بلا إعلانات';
  view.replaceChildren();
  // ١) سجل البحث
  const searches = store.get('searches', []).slice(0, 14);
  if (searches.length) {
    const row = el('div', 'chips');
    searches.forEach(s => { const a = el('a', 'chip-q', s); a.href = `#/search?q=${encodeURIComponent(s)}`; a.dir = 'auto'; row.append(a); });
    view.append(sectionHead('سجل البحث', '#/searches'), row);
  }
  // ٢) القنوات المشترك فيها
  const mySubs = subs.list().slice(0, 20);
  if (mySubs.length) {
    const row = el('div', 'sub-strip');
    mySubs.forEach(c => row.append(channelBubble(c)));
    view.append(sectionHead('القنوات', '#/subs'), row);
  }
  // ٣) آخر اللي شفتو
  const hist = lib.list('hist').slice(0, 16);
  if (hist.length) {
    const shelf = el('div', 'shelf');
    hist.forEach(v => shelf.append(card(v)));
    view.append(sectionHead('آخر اللي شفتو', '#/history'), shelf);
  }
  // ٤) مقترح لك (بيتحمّل شوي شوي مع التمرير)
  view.append(sectionHead(hist.length || searches.length || mySubs.length ? 'مقترح لك' : 'مقترحات'));
  const g = el('div', 'grid'); g.append(skCards(8));
  view.append(g);
  const seen = new Set();
  const feed = makeHomeFeed(seen);
  // القائمة بتنحفظ على الجهاز: لمّا تفتح الموقع بتلاقي آخر قائمة فوراً، وبتتجدّد بس بالسحب للتحديث
  const kept = [];
  const keep = items => { kept.push(...items.map(slim)); if (kept.length <= 120) store.set('homeFeed', { at: Date.now(), items: kept }); };
  const saved = !force && store.get('homeFeed', null);
  try {
    let first = [];
    if (saved && saved.items && saved.items.length && Date.now() - saved.at < 12 * 3600e3) {
      first = saved.items.filter(v => v && v.id);
      first.forEach(v => seen.add(v.id));
      kept.push(...first);
    } else {
      first = await feed();
      keep(first);
    }
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!first.length) throw new Error('فاضي');
    first.forEach(v => g.append(card(v)));
    infinite(g, async () => { const more = await feed(); more.forEach(v => g.append(card(v))); keep(more); return more.length > 0; });
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

/* ---- كل سجل البحث ---- */
function renderSearches() {
  document.title = 'سجل البحث — Nuvio';
  const list = store.get('searches', []);
  const head = sectionHead(`سجل البحث (${list.length})`);
  if (list.length) {
    const clr = el('button', 'btn', 'امسح الكل');
    clr.onclick = () => { if (confirm('تمسح كل سجل البحث؟')) { store.set('searches', []); renderSearches(); } };
    head.append(clr);
  }
  view.replaceChildren(head);
  if (!list.length) { view.append(el('div', 'empty', 'ما في بحوث لسّا.')); return; }
  const box = el('div', 'search-list');
  list.forEach(q => {
    const row = el('div', 'search-row');
    const a = el('a', null, q); a.href = `#/search?q=${encodeURIComponent(q)}`; a.dir = 'auto';
    const x = el('button', 'card-x static', '✕'); x.title = 'شيل';
    x.onclick = () => { store.set('searches', store.get('searches', []).filter(s => s !== q)); row.remove(); };
    row.append(el('span', 'search-ico', '🕘'), a, x);
    box.append(row);
  });
  view.append(box);
}

/* ---- القنوات المشترك فيها + آخر فيديوهاتها ---- */
async function renderSubs(mode = 'new') {
  document.title = 'القنوات — Nuvio';
  const list = subs.list();
  view.replaceChildren(sectionHead(`القنوات المشترك فيها (${list.length})`));
  if (!list.length) { view.append(el('div', 'empty', 'ما في اشتراكات لسّا. اكبس «اشتراك» بصفحة أي قناة أو تحت أي فيديو.')); return; }
  const strip = el('div', 'sub-strip');
  list.forEach(c => strip.append(channelBubble(c)));
  // فلترة بخط واحد (على الفيديوهات اللي إجت)
  const MODES = [['new', 'الأحدث'], ['views', 'الأكثر مشاهدة'], ['old', 'الأقدم'], ['today', 'اليوم'], ['week', 'هالأسبوع'], ['month', 'هالشهر'], ['short', 'قصير'], ['long', 'طويل']];
  const bar = chipBar(MODES, mode, m => { location.hash = m === 'new' ? '#/subs' : `#/subs?f=${m}`; });
  const g = el('div', 'grid'); g.append(skCards(8));
  view.append(strip, bar, g);
  const all = [];
  const now = Date.now() / 1000;
  const keepIt = v => {
    const age = v.ts ? now - v.ts : Infinity;
    if (mode === 'today') return age < 86400;
    if (mode === 'week') return age < 7 * 86400;
    if (mode === 'month') return age < 31 * 86400;
    if (mode === 'short') return v.duration > 0 && v.duration < 240;
    if (mode === 'long') return v.duration >= 1200;
    return true;
  };
  const order = (a, b) => mode === 'views' ? (b.views || 0) - (a.views || 0) : mode === 'old' ? (a.ts || 0) - (b.ts || 0) : (b.ts || 0) - (a.ts || 0);
  const draw = () => {
    g.replaceChildren();
    const shown = all.filter(keepIt).sort(order);
    if (!shown.length) g.append(el('div', 'empty', 'ما في فيديوهات بهالفلتر لهلّق.'));
    shown.forEach(v => g.append(card(v)));
  };
  const queue = shuffle(list);
  let i = 0;
  const load = async () => {
    const batch = queue.slice(i, i + 8); i += 8;
    if (!batch.length) return false;
    const res = await Promise.all(batch.map(c => getChannel(c.id).then(r => r.res.items.slice(0, 6)).catch(() => [])));
    const ids = new Set(all.map(v => v.id));
    res.flat().forEach(v => { if (!ids.has(v.id)) { ids.add(v.id); all.push(v); } });
    draw();
    return i < queue.length;
  };
  try { await load(); if (g.isConnected) infinite(g, load); } catch { /* */ }
}

/* ---- قوائم التشغيل (من نسخ قديمة) ---- */
function renderLists() {
  document.title = 'قوائمي — Nuvio';
  const lists = store.get('ytlists', []);
  view.replaceChildren(sectionHead(`قوائم التشغيل (${lists.length})`));
  if (!lists.length) { view.append(el('div', 'empty', 'ما في قوائم.')); return; }
  const g = el('div', 'grid');
  lists.forEach(l => {
    const a = el('a', 'card list-card'); a.href = `#/list?id=${encodeURIComponent(l.id)}`;
    const th = el('div', 'thumb');
    const img = el('img'); img.alt = ''; img.loading = 'lazy';
    img.src = l.videos[0] ? ytThumb(l.videos[0].id) : 'icon-192.png';
    th.append(img, el('span', 'list-count', `${nf.format(l.videos.length)} ▶`));
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

/* سجل المشاهدة / الإعجابات / المفضلة / السجل السماعي */
function renderLibrary(kind) {
  const titles = { hist: 'سجل المشاهدة', likes: 'الإعجابات', favs: 'المحفوظة', mhist: 'السجل السماعي' };
  const empties = { hist: 'لسا ما شفت شي.', likes: 'لسا ما عملت إعجاب لأي فيديو. اكبس 👍 تحت أي فيديو.', favs: 'ما في شي محفوظ. اكبس «حفظ» تحت أي فيديو.', mhist: 'لسا ما سمعت شي بـ Nuvio Music.' };
  document.title = `${titles[kind]} — Nuvio`;
  const items = lib.list(kind);
  const head = sectionHead(`${titles[kind]} (${items.length})`);
  if (items.length) {
    const clr = el('button', 'btn', kind === 'hist' || kind === 'mhist' ? 'امسح السجل' : 'امسح الكل');
    clr.onclick = () => { if (confirm('متأكد؟ ما في رجعة.')) { lib.clear(kind); renderLibrary(kind); } };
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

/* فلاتر البحث (بخط واحد): ترتيب، تاريخ، مدة، ميزات */
const SEARCH_SORT = [['', 'الأنسب'], ['upload_date', 'الأحدث'], ['view_count', 'الأكثر مشاهدة'], ['rating', 'الأكثر إعجاباً']];
const SEARCH_DATE = [['today', 'اليوم'], ['week', 'هالأسبوع'], ['month', 'هالشهر'], ['year', 'هالسنة']];
const SEARCH_DUR = [['short', 'قصير'], ['long', 'طويل']];
const SEARCH_FEAT = [['hd', 'HD'], ['subtitles', 'مترجم'], ['live', 'مباشر']];
function searchFilterBar(q, f) {
  const bar = el('div', 'filter-bar');
  const go = nf2 => {
    const ps = new URLSearchParams({ q });
    for (const [k, v] of Object.entries(nf2)) if (v) ps.set(k, v);
    location.hash = '#/search?' + ps.toString();
  };
  const group = (list, key, exclusive) => {
    list.forEach(([val, label]) => {
      const on = (f[key] || '') === val;
      const b = el('button', 'f-chip' + (on ? ' on' : ''), label);
      b.onclick = () => go({ ...f, [key]: on && !exclusive ? '' : val });
      bar.append(b);
    });
    bar.append(el('span', 'f-sep'));
  };
  group(SEARCH_SORT, 'sort', true);
  group(SEARCH_DATE, 'date');
  group(SEARCH_DUR, 'dur');
  group(SEARCH_FEAT, 'feat');
  bar.lastChild.remove();
  return bar;
}

async function renderSearch(q, f = {}) {
  document.title = `${q} — Nuvio`;
  addSearch(q);
  $('#q').value = q;
  const filtered = !!(f.sort || f.date || f.dur || f.feat);
  const chWrap = el('div', 'ch-strip');
  const g = el('div', 'grid'); g.append(skCards(8));
  view.replaceChildren(searchFilterBar(q, f), chWrap, g);
  try {
    const { inst, res } = await cached('s:' + q + JSON.stringify(f), 10 * 60e3, () => withFallback(i => apiFor(i).search(i.url, q, 1, null, f), filtered ? { prefer: 'invidious' } : {}));
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!res.items.length) { g.replaceWith(el('div', 'empty', 'ما في نتائج.')); return; }
    if (!filtered) apiFor(inst).channels(inst.url, q).then(list => list.forEach(ch => chWrap.append(channelCard(ch)))).catch(() => {});
    const seen = new Set();
    res.items.forEach(v => { seen.add(v.id); g.append(card(v)); });
    let next = res.next;
    const feed = relatedFeed(res.items.slice(0, 5).map(v => v.id), seen);
    infinite(g, async () => {
      if (next != null) {
        const r = await apiFor(inst).search(inst.url, q, typeof next === 'number' ? next : 0, typeof next === 'string' ? next : null, f);
        const fresh = r.items.filter(v => !seen.has(v.id));
        fresh.forEach(v => { seen.add(v.id); g.append(card(v)); });
        next = r.items.length ? r.next : null;
        if (fresh.length) return true;
      }
      if (filtered) return false;
      // خلصت نتائج البحث؟ منكمّل بفيديوهات مشابهة
      const more = await feed(); more.forEach(v => g.append(card(v))); return more.length > 0;
    });
  } catch (e) { showError(e, () => renderSearch(q, f)); }
}

/* ---- القناة: تبويبات (الرئيسية، الفيديوهات، الشورتس، المباشر، قوائم التشغيل) + ترتيب ---- */
function channelTab(id, tab, sort, cont) {
  const run = () => withFallback(i => {
    if (i.type !== 'invidious') {
      if (tab !== 'videos' || cont) return Promise.reject(new Error('مش مدعوم'));
      return apiFor(i).channel(i.url, id).then(r => ({ items: r.items, next: null }));
    }
    const ep = { shorts: 'shorts', live: 'streams', playlists: 'playlists' }[tab] || 'videos';
    const q = new URLSearchParams();
    if (ep === 'videos' && sort) q.set('sort_by', sort);
    if (cont) q.set('continuation', cont);
    return fetchJSON(`${i.url}/api/v1/channels/${id}/${ep}${q.toString() ? '?' + q : ''}`, 15000).then(d => ep === 'playlists'
      ? { lists: (d.playlists || []).map(p => ({ id: p.playlistId, title: p.title, count: p.videoCount, thumb: abs(i.url, p.playlistThumbnail || '') })), next: d.continuation || null }
      : { items: (d.videos || []).map(v => Invidious.item(i.url, v)), next: d.continuation || null });
  }, { prefer: 'invidious' }).then(r => r.res);
  return cont ? run() : cached(`ct:${id}:${tab}:${sort || ''}`, 10 * 60e3, run);
}
function plCard(l) {
  const a = el('a', 'card list-card'); a.href = `#/pl?id=${encodeURIComponent(l.id)}`;
  const th = el('div', 'thumb');
  const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  img.src = l.thumb || 'icon-192.png';
  img.onerror = () => { img.src = 'icon-192.png'; };
  th.append(img, el('span', 'list-count', `${l.count ? nf.format(l.count) : ''} ▶`));
  const meta = el('div', 'meta'); const tt = el('h3', 'title', l.title); tt.dir = 'auto'; meta.append(tt);
  a.append(th, meta);
  return a;
}
/* صف تبويبات/فلاتر بخط واحد (بيتحرّك يمين ويسار إذا ما وسع) */
function chipBar(items, active, onPick, cls = '') {
  const bar = el('div', 'filter-bar ' + cls);
  items.forEach(([key, label]) => {
    const b = el('button', 'f-chip' + (key === active ? ' on' : ''), label);
    b.onclick = () => onPick(key);
    bar.append(b);
  });
  return bar;
}

async function renderChannel(id, tab = 'home', sort = '') {
  const pv = chPreview.get(id) || {};
  const head = el('div', 'ch-head');
  const bannerSlot = el('div', 'ch-banner sk');
  const row = el('div', 'ch-row');
  const av = el('div', 'ch-avatar sk');
  const txt = el('div', 'ch-txt');
  const h = el('h1', 'ch-title', pv.name || ''); h.dir = 'auto';
  if (!pv.name) h.append(el('span', 'sk sk-line'));
  const subsEl = el('div', 'sub', fmtSubs(pv.subs));
  txt.append(h, subsEl); row.append(av, txt); head.append(bannerSlot, row);
  const go = (t, s) => { location.hash = `#/channel?id=${encodeURIComponent(id)}${t && t !== 'home' ? `&tab=${t}` : ''}${s ? `&sort=${s}` : ''}`; };
  const tabs = chipBar([['home', 'الرئيسية'], ['videos', 'الفيديوهات'], ['shorts', 'الشورتس'], ['live', 'المباشر'], ['playlists', 'قوائم التشغيل']], tab, t => go(t), 'tabs');
  const body = el('div', 'ch-body');
  view.replaceChildren(head, tabs, body);
  if (pv.name) document.title = `${pv.name} — Nuvio`;

  // معلومات القناة (الراس) — بنفس الوقت مع المحتوى
  getChannel(id).then(({ res }) => {
    if (!head.isConnected) return;
    const { info } = res;
    document.title = `${info.name} — Nuvio`;
    h.textContent = info.name; subsEl.textContent = fmtSubs(info.subs);
    chPreview.set(id, { name: info.name, subs: info.subs });
    if (info.banner) { const b = el('img', 'ch-banner'); b.alt = ''; setImg(b, info.banner); bannerSlot.replaceWith(b); } else bannerSlot.remove();
    const avImg = el('img', 'ch-avatar'); avImg.alt = ''; setImg(avImg, info.avatar); av.replaceWith(avImg);
    row.append(subButton({ id, name: info.name, avatar: info.avatar }));
    if (info.description) {
      const d = el('div', 'desc', info.description); d.dir = 'auto';
      d.onclick = () => d.classList.toggle('open');
      head.append(d);
    }
  }).catch(() => { bannerSlot.remove(); });

  const grid = (items) => { const g = el('div', 'grid'); items.forEach(v => g.append(card(v, { noAuthorLink: true }))); return g; };

  if (tab === 'home') {
    body.append(
      lazyShelf('🆕 الأحدث', () => channelTab(id, 'videos', 'newest').then(r => r.items), `#/channel?id=${encodeURIComponent(id)}&tab=videos`),
      lazyShelf('🔥 الأكثر مشاهدة', () => channelTab(id, 'videos', 'popular').then(r => r.items), `#/channel?id=${encodeURIComponent(id)}&tab=videos&sort=popular`),
      lazyShelf('⚡ الشورتس', () => channelTab(id, 'shorts').then(r => r.items), `#/channel?id=${encodeURIComponent(id)}&tab=shorts`),
    );
    return;
  }
  if (tab === 'playlists') {
    const g = el('div', 'grid'); g.append(skCards(6)); body.append(g);
    try {
      const r = await channelTab(id, 'playlists');
      g.replaceChildren();
      if (!r.lists.length) { g.replaceWith(el('div', 'empty', 'ما في قوائم تشغيل.')); return; }
      r.lists.forEach(l => g.append(plCard(l)));
    } catch (e) { g.replaceWith(el('div', 'empty', 'ما قدرت جيب القوائم هلّق.')); }
    return;
  }
  // الفيديوهات / الشورتس / المباشر
  if (tab === 'videos') body.append(chipBar([['newest', 'الأحدث'], ['popular', 'الرائج'], ['oldest', 'الأقدم']], sort || 'newest', s => go('videos', s === 'newest' ? '' : s)));
  const g = el('div', 'grid'); g.append(skCards(8)); body.append(g);
  try {
    const r = await channelTab(id, tab, tab === 'videos' ? (sort || 'newest') : '');
    if (!g.isConnected) return;
    g.replaceChildren();
    if (!r.items.length) { g.replaceWith(el('div', 'empty', 'ما في شي هون.')); return; }
    r.items.forEach(v => g.append(card(v, { noAuthorLink: true })));
    let next = r.next;
    if (next) infinite(g, async () => {
      const n = await channelTab(id, tab, tab === 'videos' ? (sort || 'newest') : '', next);
      n.items.forEach(v => g.append(card(v, { noAuthorLink: true })));
      next = n.next;
      return !!next && n.items.length > 0;
    });
  } catch (e) { g.replaceWith(el('div', 'empty', 'ما قدرت جيب الفيديوهات هلّق. جرّب بعد شوي.')); }
}

/* ---- قائمة تشغيل عامة (من صفحة قناة) ---- */
async function renderPlaylist(plid) {
  const head = sectionHead('…');
  const g = el('div', 'grid'); g.append(skCards(8));
  view.replaceChildren(head, g);
  try {
    let page = 1;
    const load = p => withFallback(i => i.type === 'invidious'
      ? fetchJSON(`${i.url}/api/v1/playlists/${plid}?page=${p}`, 15000).then(d => ({ title: d.title, author: d.author, count: d.videoCount, items: (d.videos || []).map(v => Invidious.item(i.url, v)) }))
      : Promise.reject(new Error('x')), { prefer: 'invidious' }).then(r => r.res);
    const r = await load(1);
    document.title = `${r.title} — Nuvio`;
    const t = head.querySelector('.section-title'); t.textContent = `${r.title} (${nf.format(r.count || r.items.length)})`; t.dir = 'auto';
    g.replaceChildren();
    r.items.forEach(v => g.append(card(v)));
    infinite(g, async () => { page++; const n = await load(page); n.items.forEach(v => g.append(card(v))); return n.items.length > 0; });
  } catch (e) { g.replaceWith(el('div', 'empty', 'ما قدرت جيب القائمة.')); }
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

  const music = isMusic();
  const artistOf = () => ({ id: (current && current.data.authorId) || (pv && pv.authorId), name: (current && current.data.author) || (pv && pv.author), avatar: current && current.data.avatar });
  let np = new NuvioPlayer(box, {
    onStall: t => recover(t), onError: t => recover(t),
    copyIcon: music ? 'plus' : 'copy',
    onCopy: music ? () => toggleArtist(artistOf()) : () => {
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
  // العنوان + سهم بيفتح الوصف (بيبيّن بس إذا في وصف)
  const titleRow = el('div', 'title-row');
  const chev = el('button', 'desc-chev'); chev.hidden = true; chev.setAttribute('aria-label', 'الوصف');
  chev.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>';
  titleRow.append(h1, chev);
  info.append(titleRow, metaRow, descSk);
  const sideList = el('div', 'related-list'); sideList.append(skCards(8, true));
  side.append(el('h2', 'section-title', 'فيديوهات مشابهة'), sideList);
  view.replaceChildren(layout);
  layout.append(buildFab(() => np, id, () => (current && current.data.title) || (pv && pv.title) || '', async () => {
    if (!np) return;
    const t = np.video.currentTime;
    note('عم جهّز الفيديو للشاشة…');
    const url = await castSource(id);
    if (!url || !np) { note('ما لقيت نسخة بتطلع عالشاشة لهالفيديو هلّق'); return; }
    await destroyPlayer();
    np.setShaka(null);
    np.video.src = url;
    np.video.addEventListener('loadedmetadata', () => { try { np.video.currentTime = t; } catch { /* */ } np.video.play().catch(() => {}); }, { once: true });
    np.enableCast(true);
    const opened = await np.cast().catch(() => false);
    note(opened ? 'اختار الشاشة 📺' : 'جاهز — اكبس زر 📺 بالمشغّل لتختار الشاشة');
  }, music ? [{ ico: 'star', label: 'ضيف المطرب للمفضّلين', fn: () => toggleArtist(artistOf()) }] : []));
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
        if (np) np.setCaptions(res.captions || []);
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
    lib.add(music ? 'mhist' : 'hist', item);
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
    const auWrap = el('div', 'au-wrap');
    auWrap.append(au);
    if (d.authorId) auWrap.append(subButton({ id: d.authorId, name: d.author, avatar: d.avatar }));
    metaRow.append(auWrap, actions);

    // الوصف تحت الفيديو متل يوتيوب: مشاهدات وتاريخ، نص مختصر، «المزيد»
    const desc = el('div', 'desc yt');
    desc.append(el('div', 'desc-meta', [fmtViews(d.views), d.published].filter(Boolean).join('  •  ')));
    const body = el('div', 'desc-body'); body.dir = 'auto';
    renderRich(body, d.description || '', s => { if (np) { np.video.currentTime = s; np.video.play().catch(() => {}); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    desc.append(body);
    // الروابط اللي بالوصف، مجمّعة تحت لمّا يفتح
    const urls = [...new Set((d.description || '').match(/https?:\/\/[^\s]+/g) || [])].slice(0, 12);
    if (urls.length) {
      const lk = el('div', 'desc-links');
      lk.append(el('div', 'desc-links-t', `🔗 الروابط (${urls.length})`));
      urls.forEach(u => {
        const yt = parseYT(u);
        const a = el('a', 'desc-link');
        a.textContent = u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60);
        if (yt && yt.type === 'video') a.href = `#/watch?v=${yt.id}${yt.t ? `&t=${yt.t}` : ''}`;
        else if (yt && yt.type === 'channel') a.href = chHref(yt.id);
        else { a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        lk.append(a);
      });
      desc.append(lk);
    }
    const moreBtn = el('button', 'desc-more', 'المزيد');
    const setOpen = open => {
      desc.classList.toggle('open', open);
      chev.classList.toggle('open', open);
      moreBtn.textContent = open ? 'عرض أقل' : 'المزيد';
    };
    moreBtn.onclick = e => { e.stopPropagation(); setOpen(!desc.classList.contains('open')); };
    desc.onclick = e => { if (!desc.classList.contains('open') && !e.target.closest('a')) setOpen(true); };
    chev.onclick = () => {
      const open = !desc.classList.contains('open');
      setOpen(open);
      if (open) desc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    if (d.description) { desc.append(moreBtn); chev.hidden = false; }
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

/* نسخة mp4 (صوت وصورة بملف واحد) للبث عالشاشة — من سيرفرات Piped أو Invidious إذا عندها */
function castSource(id) {
  return cached('cast:' + id, 20 * 60e3, async () => {
    for (const inst of orderedInstances()) {
      try {
        const d = await apiFor(inst).video(inst.url, id);
        const mp4 = d.sources.filter(s => s.kind === 'mp4');
        if (mp4.length) {
          const best = mp4.sort((a, b) => (parseInt(b.label) || 0) - (parseInt(a.label) || 0))[0];
          return inst.type === 'invidious' ? best.url : best.url;
        }
      } catch { /* اللي بعدو */ }
    }
    return '';
  }).catch(() => '');
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
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>',
  pip: '<svg viewBox="0 0 24 24"><rect x="2.5" y="4.5" width="19" height="15" rx="2"/><rect x="12" y="11.5" width="7" height="5.5" rx="1"/></svg>',
};
const SLEEP_OPTS = [[0, 'إيقاف'], [15, '15 د'], [30, '30 د'], [45, '45 د'], [60, 'ساعة'], [90, 'ساعة ونص'], [-1, 'آخر الفيديو']];
const sleepState = { at: 0, endOfVideo: false, timer: null };

function buildFab(getNp, id, getTitle, toCastMode, extra = []) {
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
      menu.append(row('cast', 'AirPlay / عرض على شاشة', () => {
        // مشغّلنا (بث مقسوم صوت/صورة) بيطلع عالتلفزيون صوت بس، فمنحوّل لمشغّل بيطلع الصورة كمان
        close();
        if (toCastMode) toCastMode();
      }));
      extra.forEach(x => menu.append(row(x.ico, x.label, () => { x.fn(); close(); })));
      if (np.canPip()) menu.append(row('pip', 'صورة داخل صورة', async () => {
        try { await np.pip(); } catch { note('ما زبطت صورة داخل صورة'); }
        close();
      }));
    }
  }
  const X_ICO = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>';
  function open() { draw(); menu.hidden = false; btn.classList.add('on'); btn.innerHTML = X_ICO; btn.setAttribute('aria-label', 'سكّر'); }
  function close() { menu.hidden = true; btn.classList.remove('on'); btn.innerHTML = FAB_ICO.more; btn.setAttribute('aria-label', 'أدوات'); }
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
  sug.hidden = !sugItems.length || document.activeElement !== $('#q');
}
const sugPool = []; // كل اقتراح شفناه، لحتى نصفّي فوراً وإنت عم تكتب بلا ما نستنّى السيرفر
function poolAdd(list) { for (const s of list) if (!sugPool.some(x => x.toLowerCase() === s.toLowerCase())) sugPool.push(s); if (sugPool.length > 400) sugPool.splice(0, sugPool.length - 400); }
function localMatches(q, exclude) {
  const s = q.toLowerCase();
  const starts = [], has = [];
  for (const x of sugPool) {
    const l = x.toLowerCase();
    if (exclude.has(l) || l === s) continue;
    if (l.startsWith(s)) starts.push(x); else if (l.includes(' ' + s)) has.push(x);
  }
  return starts.concat(has);
}
function updateSug() {
  clearTimeout(sugTimer);
  const q = $('#q').value.trim();
  sugQ = q;
  if (parseYT(q)) { sugItems = []; hideSug(); return; }
  const hist = histMatches(q).map(text => ({ text, hist: true }));
  const seen = new Set(hist.map(h => h.text.toLowerCase()));
  // فوراً: من الاقتراحات اللي عندنا (مثلاً «أم الطنافس ال» بيصفّي «…الجزء الثاني»، «…الفوقا»)
  const local = q ? localMatches(q, seen).slice(0, 10 - hist.length).map(text => ({ text, hist: false })) : [];
  sugItems = hist.concat(local); sugIdx = -1; drawSug();
  if (!q) return;
  const seq = ++sugSeq;
  sugTimer = setTimeout(async () => {
    try {
      const { res } = await cached('sg:' + q.toLowerCase(), 30 * 60e3, () => withFallback(i => apiFor(i).suggest(i.url, q), { stagger: 900 }));
      poolAdd(res);
      if (seq !== sugSeq) return;
      // منحافظ على ترتيب اللي عم يبيّن، ومنزيد الجديد تحت (بلا قفزات)
      const shown = new Set(sugItems.map(s => s.text.toLowerCase()));
      const fresh = res.filter(s => !shown.has(s.toLowerCase())).map(text => ({ text, hist: false }));
      sugItems = sugItems.concat(fresh).slice(0, 10);
      drawSug();
    } catch { /* بلا اقتراحات */ }
  }, 70);
}
$('#q').addEventListener('input', updateSug);
// لمّا تبلّش تتحكم بالصفحة (تمرير أو لمس برّا البحث) الاقتراحات بتختفي والكيبورد بيتسكّر
document.addEventListener('touchstart', e => {
  if (sug.hidden || e.target.closest('.search')) return;
  hideSug(); $('#q').blur();
}, { passive: true });
window.addEventListener('scroll', () => { if (!sug.hidden && !('ontouchstart' in window)) hideSug(); }, { passive: true });
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
  sugSeq++; clearTimeout(sugTimer); sugItems = [];
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
  box.style.transition = 'none'; box.style.transform = ''; box.style.opacity = '';
  const from = box.getBoundingClientRect();
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
  enableSwipeUp();
  // حركة ناعمة: الفيديو بيصغر من مكانو لحد ما يوصل للشريط تحت
  const to = vid.getBoundingClientRect();
  if (from.width && to.width && vid.animate) {
    mini.classList.add('anim');
    const a = vid.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transform: 'none' },
    ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    [info, pp, x].forEach((n, k) => n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: 220 + k * 40, easing: 'ease-out', fill: 'backwards' }));
    mini.animate([{ backgroundColor: 'rgba(19,24,42,0)', borderColor: 'transparent' }, { backgroundColor: 'rgba(19,24,42,.97)' }], { duration: 300, delay: 160, fill: 'backwards' });
    a.onfinish = () => mini.classList.remove('anim');
  }
  // ارجع لآخر صفحة كنت فيها غير الفيديو (مثلاً البحث)
  location.hash = lastPage || '#/';
}
function restoreMini() {
  if (!miniOn || !active) return false;
  const mv = mini.querySelector('.mini-vid');
  const from = mv ? mv.getBoundingClientRect() : null;
  miniOn = false;
  mini.hidden = true; document.body.classList.remove('has-mini');
  const { box, layout } = active;
  box.classList.remove('in-mini');
  view.replaceChildren(layout);
  const ph = layout.querySelector('#player-ph');
  if (ph) ph.replaceWith(box); else active.main.prepend(box);
  mini.replaceChildren();
  window.scrollTo(0, 0);
  const to = box.getBoundingClientRect();
  if (from && from.width && to.width && box.animate) {
    box.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, transformOrigin: 'top left', borderRadius: '10px' },
      { transform: 'none', transformOrigin: 'top left' },
    ], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
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

/* اسحب الشريط الصغير لفوق لترجّع الفيديو كبير */
let swipeUpBound = false;
function enableSwipeUp() {
  if (swipeUpBound) return;
  swipeUpBound = true;
  let y0 = null, dy = 0;
  mini.addEventListener('touchstart', e => { if (e.touches.length === 1) { y0 = e.touches[0].clientY; dy = 0; } }, { passive: true });
  mini.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy < 0) { mini.style.transition = 'none'; mini.style.transform = `translateY(${Math.max(dy, -160) * 0.6}px)`; }
  }, { passive: true });
  mini.addEventListener('touchend', () => {
    if (y0 == null) return;
    mini.style.transition = 'transform .25s ease-out'; mini.style.transform = '';
    if (dy < -50 && active) location.hash = `#/watch?v=${encodeURIComponent(active.id)}`;
    else if (dy > 60) closeMini(); // سحبة لتحت بتسكّرو
    y0 = null;
  });
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
      const d = Math.min(dy, 320);
      box.style.transition = 'none';
      box.style.transformOrigin = 'bottom center';
      box.style.transform = `translateY(${d * 0.85}px) scale(${1 - d / 900})`;
      box.style.opacity = String(1 - d / 900);
    }
  }, { passive: true });
  box.addEventListener('touchend', () => {
    if (y0 == null) return;
    if (dy > 80) { y0 = null; minimize(); return; }
    box.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s';
    box.style.transform = ''; box.style.opacity = '';
    y0 = null;
  });
}

/* ================= تحديث تلقائي للنسخة =================
   التلفون بيحفظ النسخة القديمة؛ فمنفحص ملف صغير، وإذا في نسخة أجدد منحمّلها. */
const APP_VERSION = '20261120054013';
async function checkUpdate() {
  try {
    const r = await fetch(`version.txt?x=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (!v || v === APP_VERSION || store.get('reloadedFor', '') === v) return;
    if (active && active.np() && !active.np().video.paused) return; // ما منقطع فيديو شغّال
    store.set('reloadedFor', v);
    const reload = () => location.replace(`${location.pathname}?v=${encodeURIComponent(v)}${location.hash}`);
    // مع التخزين المؤقت: منطلب النسخة الجديدة، ومنستنّاها تتركّب، وبعدين منعيد التحميل
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (!reg) { reload(); return; }
    let done = false;
    const go = () => { if (!done) { done = true; reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', go, { once: true });
    await reg.update().catch(() => {});
    setTimeout(go, 8000); // احتياط إذا ما تغيّر شي
  } catch { /* بلا نت */ }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

/* ================= ذاكرة الصفحات =================
   لمّا ترجع لصفحة (الرئيسية، البحث، القناة…) بتلاقيها متل ما تركتها: نفس القائمة ونفس مكان التمرير.
   الرئيسية ما بتتحدّث إلا إذا سحبت سحبة طويلة من فوق لتحت. */
const pageCache = new Map();
let shownKey = null;
const CACHEABLE = k => /^\/($|search\?|subs$|subs\?|channel\?|lists$|music$|music\/podcast$|music\/fav$)/.test(k);
function savePage() {
  if (!shownKey || !CACHEABLE(shownKey) || !view.childNodes.length) return;
  if (view.querySelector('.grid > .sk-card:first-child')) return; // لسا عم تحمّل أول مرة
  pageCache.set(shownKey, { nodes: [...view.childNodes], y: window.scrollY, title: document.title, at: Date.now() });
  if (pageCache.size > 10) pageCache.delete(pageCache.keys().next().value);
}
function restorePage(key) {
  const c = pageCache.get(key);
  if (!c || Date.now() - c.at > 60 * 60e3) return false;
  view.replaceChildren(...c.nodes);
  document.title = c.title;
  window.scrollTo(0, c.y);
  requestAnimationFrame(() => window.scrollTo(0, c.y));
  return true;
}

/* سحب للتحديث بالرئيسية (سحبة طويلة من فوق لتحت) */
(function pullToRefresh() {
  const ind = el('div', 'ptr');
  ind.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  document.body.append(ind);
  let y0 = null, d = 0;
  const reset = () => { ind.style.opacity = '0'; ind.style.transform = ''; ind.classList.remove('ready'); };
  addEventListener('touchstart', e => {
    if (shownKey !== '/' || window.scrollY > 2 || e.touches.length !== 1 || e.target.closest('.mini, .fab-wrap, .search, .shelf, .chips')) { y0 = null; return; }
    y0 = e.touches[0].clientY; d = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 == null) return;
    d = e.touches[0].clientY - y0;
    if (d <= 0 || window.scrollY > 2) { reset(); return; }
    const k = Math.min(d, 170);
    ind.style.opacity = String(Math.min(1, k / 120));
    ind.style.transform = `translate(-50%, ${k * 0.55}px) rotate(${k * 2.1}deg)`;
    ind.classList.toggle('ready', d > 130);
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 == null) return;
    const go = d > 130; y0 = null;
    if (!go) { reset(); return; }
    ind.classList.remove('ready'); ind.classList.add('spin');
    pageCache.delete('/');
    renderHome(true).finally(() => { ind.classList.remove('spin'); reset(); });
  });
})();

/* ================= التنقّل ================= */
async function route() {
  const hash = location.hash.slice(1) || '/';
  savePage();
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
  shownKey = hash;
  if (path === '/') setMode('video'); else if (path.startsWith('/music')) setMode('music');
  if (path !== '/watch' && restorePage(hash)) {
    $('#q').value = path === '/search' ? (p.get('q') || '') : '';
    return;
  }
  window.scrollTo(0, 0);
  if (path === '/search' && p.get('q')) return renderSearch(p.get('q'), { sort: p.get('sort') || '', date: p.get('date') || '', dur: p.get('dur') || '', feat: p.get('feat') || '' });
  if (path === '/watch' && p.get('v')) return renderWatch(p.get('v'), +p.get('t') || 0);
  if (path === '/channel' && p.get('id')) return renderChannel(p.get('id'), p.get('tab') || 'home', p.get('sort') || '');
  if (path === '/pl' && p.get('id')) return renderPlaylist(p.get('id'));
  if (path === '/history') return renderLibrary('hist');
  if (path === '/likes') return renderLibrary('likes');
  if (path === '/favs') return renderLibrary('favs');
  if (path === '/searches') return renderSearches();
  if (path.startsWith('/music')) return renderMusic(path);
  if (path === '/subs') return renderSubs(p.get('f') || 'new');
  if (path === '/lists') return renderLists();
  if (path === '/list' && p.get('id')) return renderList(p.get('id'));
  $('#q').value = '';
  setMode('video');
  return renderHome();
}
window.addEventListener('hashchange', route);

/* ================= البداية ================= */
if (window.shaka) shaka.polyfill.installAll();
/* تخزين هيكل الموقع على الجهاز (بيفتح فوراً حتى بلا ما ينزّل شي) */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
probeAll();
discover();
checkUpdate();
setInterval(() => probeAll(), 10 * 60e3);
route();
